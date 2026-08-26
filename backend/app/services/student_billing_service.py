import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.billing import BillingPeriod
from app.models.fine import Fine
from app.models.user import User
from app.utils.exceptions import NotFoundException, ValidationException


class StudentBillingService:
    """Builds one student's own bill for a month.

    Only reads from a month's BillingPeriod once it is published - the same
    figures the admin froze, not a live recomputation that could drift out
    from under what was actually charged. A student never sees a bill for a
    month nobody has finalized yet.

    Food charge is `mess_daily_rate x days actually eaten`, where a day counts
    if the student has at least one real Attendance row on it that month -
    this is the same flat per-day rate BillingService already computes and
    freezes, applied to real scan records rather than a simulated count.
    Fines are the student's own real Fine rows for that month, excluding any
    that were waived.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _validate_period(month: int, year: int) -> None:
        if not 1 <= month <= 12:
            raise ValidationException(message="Month must be between 1 and 12.")
        if not 2000 <= year <= 2100:
            raise ValidationException(message="Year is out of range.")

    async def get_bill(self, student_id: uuid.UUID, month: int, year: int) -> dict:
        self._validate_period(month, year)

        period_stmt = select(BillingPeriod).where(
            BillingPeriod.month == month, BillingPeriod.year == year
        )
        period = (await self.session.execute(period_stmt)).scalar_one_or_none()

        if period is None or not period.is_published:
            raise NotFoundException(
                message=f"The bill for {month:02d}/{year} has not been published yet.",
                code="BILL_NOT_PUBLISHED",
            )

        user_stmt = select(User).where(User.id == student_id)
        user = (await self.session.execute(user_stmt)).scalar_one_or_none()
        if user is None:
            raise NotFoundException(message="Student not found.")

        start = date(year, month, 1)
        end = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)

        att_stmt = select(Attendance.meal_date, Attendance.meal_type, Attendance.recorded_at).where(
            and_(
                Attendance.student_id == student_id,
                Attendance.meal_date >= start,
                Attendance.meal_date < end,
            )
        ).order_by(Attendance.meal_date.asc())
        attendance_rows = (await self.session.execute(att_stmt)).all()

        days_attended = sorted({row.meal_date for row in attendance_rows})
        effective_days = len(days_attended)

        food_charge = (period.mess_daily_rate * Decimal(effective_days)).quantize(Decimal("0.01"))

        fine_stmt = select(Fine).where(
            and_(
                Fine.student_id == student_id,
                Fine.meal_date >= start,
                Fine.meal_date < end,
                Fine.status != "WAIVED",
            )
        ).order_by(Fine.meal_date.asc())
        fines = (await self.session.execute(fine_stmt)).scalars().all()

        fine_lines = [
            {
                "meal_date": f.meal_date.isoformat(),
                "meal_type": f.meal_type,
                "amount": str(f.amount),
                "status": f.status,
            }
            for f in fines
        ]
        total_fines = sum((f.amount for f in fines), Decimal("0.00"))

        grand_total = food_charge + total_fines

        return {
            "month": month,
            "year": year,
            "student": {
                "name": user.name,
                "registration_number": user.registration_number,
            },
            "mess_daily_rate": str(period.mess_daily_rate),
            "effective_days": effective_days,
            "days_attended": [d.isoformat() for d in days_attended],
            "food_charge": str(food_charge),
            "fines": fine_lines,
            "total_fines": str(total_fines),
            "grand_total": str(grand_total),
            "published_at": period.published_at.isoformat() if period.published_at else None,
        }
