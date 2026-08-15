import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select, and_, not_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fine import Fine
from app.models.meal import MealSelection
from app.models.attendance import Attendance
from app.repositories.fine_repo import FineRepository
from app.repositories.settings_repo import SystemSettingRepository
from app.repositories.audit_repo import AuditRepository
from app.utils.enums import FineStatus, MealStatus
from app.utils.exceptions import (
    NotFoundException,
    FineAlreadyExistsException,
    FineNotWaivableException,
    ValidationException,
)
from app.utils.timezone import now_ist


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
        fine_amount = await self.get_fine_amount()

        # Find confirmed selections that don't have attendance or existing fine
        sub_att = select(Attendance.student_id).where(
            and_(Attendance.meal_date == target_date, Attendance.meal_type == meal_type)
        )
        sub_fine = select(Fine.student_id).where(
            and_(Fine.meal_date == target_date, Fine.meal_type == meal_type)
        )

        stmt = select(MealSelection).where(
            and_(
                MealSelection.meal_date == target_date,
                MealSelection.meal_type == meal_type,
                MealSelection.status == MealStatus.CONFIRMED.value,
                not_(MealSelection.student_id.in_(sub_att)),
                not_(MealSelection.student_id.in_(sub_fine)),
            )
        )

        result = await self.session.execute(stmt)
        unattended_selections = result.scalars().all()

        fines_created = 0
        for sel in unattended_selections:
            fine = Fine(
                id=uuid.uuid4(),
                student_id=sel.student_id,
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
