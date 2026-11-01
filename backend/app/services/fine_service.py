import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fine import Fine
from app.models.user import User
from app.repositories.holiday_repo import HolidayRepository
from app.services.meal_timing_service import MealTimingService
from app.services.billing_lock import lock_open_period
from app.services.mess_membership import excluded_from_the_mess
from app.models.meal import MealSelection
from app.models.attendance import Attendance
from app.repositories.fine_repo import FineRepository
from app.repositories.settings_repo import SystemSettingRepository
from app.repositories.audit_repo import AuditRepository
from app.utils.enums import FineStatus
from app.utils.exceptions import (
    NotFoundException,
    FineNotWaivableException,
    ValidationException,
)
from app.utils.timezone import now_ist, IST


class FineService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.fine_repo = FineRepository(session)
        self.settings_repo = SystemSettingRepository(session)
        self.audit_repo = AuditRepository(session)

    async def get_fine_amount(self) -> Decimal:
        setting = await self.settings_repo.get_by_key("fine_amount")
        amount_str = setting.value if setting else "30.00"
        return Decimal(amount_str)

    async def reconcile_missed_meals(
        self, target_date: date, meal_type: str, actor_id: uuid.UUID | None = None
    ) -> int:
        """Find CONFIRMED selections for target_date & meal_type without attendance, generate PENDING fines."""
        if meal_type not in {"BREAKFAST", "LUNCH", "DINNER"}:
            raise ValidationException(message="Invalid meal type.")
        _, end_time = await MealTimingService(self.session).get_meal_window(meal_type, target_date)
        if now_ist() <= datetime.combine(target_date, end_time, tzinfo=IST):
            raise ValidationException(message="Fines can only be reconciled after the meal service window closes.")
        await lock_open_period(self.session, target_date, exclusive=True)
        if await HolidayRepository(self.session).get_for_date(target_date, meal_type):
            return 0

        # NOBODY SCANNED, SO NOBODY IS A NO-SHOW.
        #
        # This job infers "did not eat" from "has no attendance row". That
        # inference only holds while the scanner is actually being used. It
        # was not: measured on 2026-11-01, production had attendance on a
        # handful of days and fines on EVERY day, 330-400 a night, because a
        # meal nobody scanned looks identical to a meal nobody attended. The
        # result was 2,566 chargeable fines worth 76,980 rupees against all
        # 142 students, none of them evidence of anything.
        #
        # Zero is the only honest threshold here. One scan proves the scanner
        # ran, so everyone else without a row really did miss the meal and
        # the old behaviour is correct. Zero scans across an entire hostel
        # proves only that nobody was scanning -- in a mess of 142 students a
        # genuinely empty sitting does not happen, and if it ever did, not
        # fining is the cheaper mistake. Anything in between would be a tuned
        # guess dressed up as a rule.
        scans = await self.session.scalar(
            select(func.count()).select_from(Attendance).where(
                and_(Attendance.meal_date == target_date, Attendance.meal_type == meal_type)))
        if not scans:
            # Logged, not silent. docs/monitoring.md exists because a night
            # the job did nothing and a night it never ran used to look the
            # same, and this adds a third case that must stay distinguishable
            # from both.
            await self.audit_repo.log(
                actor_id=actor_id,
                action="FINES_SKIPPED_NO_ATTENDANCE",
                target_type="fine",
                metadata={
                    "meal_date": target_date.isoformat(),
                    "meal_type": meal_type,
                    "reason": "no attendance recorded for this meal; the scanner was not used",
                },
            )
            return 0

        fine_amount = await self.get_fine_amount()
        if not fine_amount.is_finite() or fine_amount < 0:
            raise ValidationException(message="Configured fine amount is invalid.")

        # Find confirmed selections that don't have attendance or existing fine
        sub_att = select(Attendance.student_id).where(
            and_(Attendance.meal_date == target_date, Attendance.meal_type == meal_type)
        )
        sub_fine = select(Fine.student_id).where(
            and_(Fine.meal_date == target_date, Fine.meal_type == meal_type)
        )

        # Missing selection rows mean CONFIRMED. Calendar reads must not be
        # required to create a student's eligibility for reconciliation.
        excluded = select(MealSelection.student_id).where(
            MealSelection.meal_date == target_date, MealSelection.meal_type == meal_type,
            MealSelection.status != "CONFIRMED")
        stmt = select(User.id).where(
            User.role == "STUDENT", User.account_status != "PENDING",
            func.coalesce(User.activated_at, User.created_at) <= datetime.combine(target_date, end_time, tzinfo=IST),
            User.id.not_in(sub_att), User.id.not_in(sub_fine), User.id.not_in(excluded),
            # An outmess student never booked the meal, so missing it is not
            # a no-show. Same reason they are absent from the bill.
            User.id.not_in(excluded_from_the_mess()))
        student_ids = (await self.session.execute(stmt)).scalars().all()

        fines_created = 0
        for student_id in student_ids:
            fine = Fine(
                id=uuid.uuid4(),
                student_id=student_id,
                meal_date=target_date,
                meal_type=meal_type,
                amount=fine_amount,
                status=FineStatus.PENDING.value,
                created_at=now_ist(),
            )
            self.session.add(fine)
            fines_created += 1

        if fines_created > 0:
            await self.session.flush()
            await self.audit_repo.log(
                actor_id=actor_id,
                action="FINES_RECONCILED",
                target_type="fine",
                metadata={
                    "meal_date": target_date.isoformat(),
                    "meal_type": meal_type,
                    "fines_created": fines_created,
                    "amount_per_fine": str(fine_amount),
                },
            )

        return fines_created

    async def waive_fine(
        self, fine_id: uuid.UUID, reason: str, admin_id: uuid.UUID
    ) -> Fine:
        """Waive a PENDING fine with mandatory reason."""
        if not reason or len(reason.strip()) < 3:
            raise ValidationException(message="Mandatory waiver reason required.")

        fine = await self.fine_repo.get_by_id(fine_id)
        if not fine:
            raise NotFoundException(message="Fine record not found.")

        await lock_open_period(self.session, fine.meal_date)
        await self.session.refresh(fine, with_for_update=True)
        if fine.status != FineStatus.PENDING.value:
            raise FineNotWaivableException(message=f"Only PENDING fines can be waived (current: {fine.status}).")

        fine.status = FineStatus.WAIVED.value
        fine.waived_at = now_ist()
        fine.waived_by = admin_id
        fine.waiver_reason = reason.strip()

        await self.audit_repo.log(
            actor_id=admin_id,
            action="FINE_WAIVED",
            target_type="fine",
            target_id=fine.id,
            metadata={
                "student_id": str(fine.student_id),
                "meal_date": fine.meal_date.isoformat(),
                "meal_type": fine.meal_type,
                "amount": str(fine.amount),
                "reason": reason,
            },
        )
        return fine
