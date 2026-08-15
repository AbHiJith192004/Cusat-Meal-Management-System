import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal import MealSelection
from app.repositories.meal_repo import MealRepository
from app.repositories.holiday_repo import HolidayRepository
from app.repositories.audit_repo import AuditRepository
from app.services.meal_timing_service import MealTimingService
from app.utils.enums import MealStatus, MealType
from app.utils.exceptions import MealSelectionLockedException, HolidayConflictException
from app.utils.timezone import now_ist


class MealService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.meal_repo = MealRepository(session)
        self.holiday_repo = HolidayRepository(session)
        self.timing_service = MealTimingService(session)
        self.audit_repo = AuditRepository(session)

    async def get_or_create_selection(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str
    ) -> MealSelection:
        """Get existing selection or return a transient default CONFIRMED / NO_SERVICE (if holiday)."""
        selection = await self.meal_repo.get_student_meal(student_id, meal_date, meal_type)
        if selection:
            return selection

        # Check if holiday exists
        holidays = await self.holiday_repo.get_for_date(meal_date, meal_type)
        status = MealStatus.NO_SERVICE.value if holidays else MealStatus.CONFIRMED.value

        selection = MealSelection(
            id=uuid.uuid4(),
            student_id=student_id,
            meal_date=meal_date,
            meal_type=meal_type,
            status=status,
        )
        self.session.add(selection)
        await self.session.flush()
        return selection

    async def update_meal_selection(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str, target_status: str, actor_id: uuid.UUID
    ) -> MealSelection:
        """Update meal selection status enforcing 9:00 PM cutoff, holiday checks, valid daily opt-out combinations (0, 1, or 3 meals), and max 10 mess cuts/month."""
        # Check cutoff
        if await self.timing_service.is_selection_locked(meal_date):
            raise MealSelectionLockedException(
                message=f"Meal selection for {meal_date.isoformat()} is locked after 9:00 PM the previous day."
            )

        # Check holiday
        holidays = await self.holiday_repo.get_for_date(meal_date, meal_type)
        if holidays:
            raise HolidayConflictException(message=f"Cannot change selection: {meal_date.isoformat()} is a scheduled holiday.")

        # Get current state of all 3 meals for this date
        all_meals = ["BREAKFAST", "LUNCH", "DINNER"]
        current_map = {}
        for mt in all_meals:
            sel = await self.get_or_create_selection(student_id, meal_date, mt)
            current_map[mt] = sel.status

        # Build projected state
        projected_map = dict(current_map)
        projected_map[meal_type.upper()] = target_status

        skipped_meals = [mt for mt, st in projected_map.items() if st == MealStatus.SKIPPED.value]
        was_full_day_mess_cut = all(st == MealStatus.SKIPPED.value for st in current_map.values())
        is_now_full_day_mess_cut = (len(skipped_meals) == 3)

        # Validation Rule A: 2 meals skipped is NOT allowed! (Must be 0, 1, or 3 meals)
        if len(skipped_meals) == 2:
            from app.utils.exceptions import ValidationException
            raise ValidationException(
                message="Invalid selection. You can either opt out of 1 meal per day or opt out of the entire day for a mess cut."
            )

        # Validation Rule B: If opting for a Full Day Mess Cut (3 meals skipped), check monthly limit of 10
        if is_now_full_day_mess_cut and not was_full_day_mess_cut:
            current_monthly_mess_cuts = await self.meal_repo.count_student_monthly_mess_cuts(
                student_id, meal_date.year, meal_date.month
            )
            if current_monthly_mess_cuts + 1 > 10:
                from app.utils.exceptions import ValidationException
                raise ValidationException(
                    message="Maximum number of mess cuts allowed is 10 per month."
                )

        selection = await self.get_or_create_selection(student_id, meal_date, meal_type)
        old_status = selection.status
        selection.status = target_status
        selection.updated_at = now_ist()
        selection.updated_by = actor_id

        await self.audit_repo.log(
            actor_id=actor_id,
            action="MEAL_SELECTION_UPDATED",
            target_type="meal_selection",
            target_id=selection.id,
            metadata={
                "student_id": str(student_id),
                "meal_date": meal_date.isoformat(),
                "meal_type": meal_type,
                "old_status": old_status,
                "new_status": target_status,
            },
        )
        return selection

