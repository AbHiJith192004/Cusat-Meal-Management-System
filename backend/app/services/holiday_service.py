import uuid
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.holiday import Holiday
from app.models.meal import MealSelection
from app.repositories.holiday_repo import HolidayRepository
from app.repositories.audit_repo import AuditRepository
from app.utils.enums import MealStatus
from app.utils.exceptions import HolidayConflictException, NotFoundException
from app.utils.timezone import now_ist


class HolidayService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.holiday_repo = HolidayRepository(session)
        self.audit_repo = AuditRepository(session)

    async def declare_holiday(
        self, holiday_date: date, meal_type: str | None, reason: str, admin_id: uuid.UUID
    ) -> Holiday:
        """Declare a holiday and cascade NO_SERVICE to meal selections."""
        existing = await self.holiday_repo.get_for_date(holiday_date, meal_type)
        if existing:
            raise HolidayConflictException(message=f"A holiday is already declared for {holiday_date.isoformat()}.")

        holiday = Holiday(
            id=uuid.uuid4(),
            holiday_date=holiday_date,
            meal_type=meal_type,
            reason=reason.strip(),
            created_by=admin_id,
            created_at=now_ist(),
        )
        self.session.add(holiday)

        # Cascade: set selections to NO_SERVICE
        stmt = update(MealSelection).where(MealSelection.meal_date == holiday_date)
        if meal_type:
            stmt = stmt.where(MealSelection.meal_type == meal_type)
        stmt = stmt.values(status=MealStatus.NO_SERVICE.value, updated_at=now_ist(), updated_by=admin_id)

        await self.session.execute(stmt)
        await self.session.flush()

        await self.audit_repo.log(
            actor_id=admin_id,
            action="HOLIDAY_DECLARED",
            target_type="holiday",
            target_id=holiday.id,
            metadata={
                "holiday_date": holiday_date.isoformat(),
                "meal_type": meal_type,
                "reason": reason,
            },
        )
        return holiday

    async def delete_holiday(self, holiday_id: uuid.UUID, admin_id: uuid.UUID) -> None:
        """Remove a holiday and revert affected NO_SERVICE selections back to CONFIRMED."""
        holiday = await self.holiday_repo.get_by_id(holiday_id)
        if not holiday:
            raise NotFoundException(message="Holiday not found.")

        h_date = holiday.holiday_date
        m_type = holiday.meal_type

        await self.session.delete(holiday)

        # Cascade: revert NO_SERVICE selections back to CONFIRMED
        stmt = (
            update(MealSelection)
            .where(
                MealSelection.meal_date == h_date,
                MealSelection.status == MealStatus.NO_SERVICE.value,
            )
        )
        if m_type:
            stmt = stmt.where(MealSelection.meal_type == m_type)
        stmt = stmt.values(status=MealStatus.CONFIRMED.value, updated_at=now_ist(), updated_by=admin_id)

        await self.session.execute(stmt)
        await self.session.flush()

        await self.audit_repo.log(
            actor_id=admin_id,
            action="HOLIDAY_DELETED",
            target_type="holiday",
            target_id=holiday_id,
            metadata={"holiday_date": h_date.isoformat(), "meal_type": m_type},
        )
