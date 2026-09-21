from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import success_response
from app.schemas.meal import UpdateMealSelectionRequest
from app.security.dependencies import CurrentUser
from app.services.meal_service import MealService
from app.utils.enums import MealType, MealStatus
from app.utils.timezone import today_ist

router = APIRouter(prefix="/api/v1/meals", tags=["Meals"])


@router.get("")
async def get_my_meals(
    current_user: CurrentUser,
    start_date: Annotated[date | None, Query(description="Start date (YYYY-MM-DD)")] = None,
    end_date: Annotated[date | None, Query(description="End date (YYYY-MM-DD)")] = None,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Get student's meal selections for a date range (defaults to next 7 days)."""
    start = start_date or today_ist()
    end = end_date or (start + timedelta(days=6))

    from app.utils.exceptions import ValidationException
    if end < start or (end - start).days > 30:
        raise ValidationException(message="Select a date range of 1 to 31 days.")
    service = MealService(db)
    selections = {(m.meal_date, m.meal_type): m for m in
                  await service.meal_repo.get_student_meals_range(current_user.id, start, end)}
    # Keyed by (date, meal_type) with meal_type None for a whole-day closure,
    # carrying the reason so the student is told why rather than just finding
    # the day greyed out.
    holidays = {(h.holiday_date, h.meal_type): h.reason for h in
                await service.holiday_repo.get_in_range(start, end)}
    from app.models.operations import MenuPublication
    from sqlalchemy import select
    menus = {(m.menu_date, m.meal_type): m for m in (await db.execute(
        select(MenuPublication).where(MenuPublication.menu_date.between(start, end))
    )).scalars().all()}
    from app.services.meal_timing_service import DEFAULT_SETTINGS
    stored_settings = {
        setting.key: setting.value
        for setting in await service.timing_service.settings_repo.get_all_settings()
    }
    setting_value = lambda key: stored_settings.get(key, DEFAULT_SETTINGS[key])
    cutoff_time = setting_value("selection_cutoff_time")
    advance_days = int(setting_value("selection_cutoff_advance_days"))
    # Weekends have their own windows, so this cannot be computed once for the
    # whole range any more -- a week spans both. window_keys() decides which
    # pair applies to a given day, and is the same function the validator and
    # the fine reconciliation use.
    from app.services.meal_timing_service import window_keys

    def window_for(meal_type: str, day: date) -> str:
        start_key, end_key = window_keys(meal_type, day)
        return f"{setting_value(start_key)}–{setting_value(end_key)} IST"
    from datetime import datetime
    from app.utils.timezone import IST, now_ist
    result_days = []
    curr = start
    while curr <= end:
        # strptime's naive result never escapes: .time() keeps the clock time
        # only, and datetime.combine attaches IST.
        cutoff = datetime.combine(curr - timedelta(days=advance_days), datetime.strptime(cutoff_time, "%H:%M").time(), tzinfo=IST)  # noqa: DTZ007
        day = {"meal_date": curr.isoformat(), "locked": now_ist() >= cutoff, "cutoff_at": cutoff.isoformat(),
               # Global, but carried per day alongside the cutoff so the meal
               # planner can state the real limit instead of a hardcoded 10.
               "max_monthly_mess_cuts": setting_value("max_monthly_mess_cuts")}
        for mt in ("BREAKFAST", "LUNCH", "DINNER"):
            selection = selections.get((curr, mt))
            # A whole-day closure wins: if the kitchen is shut, that is the
            # reason to show even when this meal also has a row of its own.
            closed_reason = holidays.get((curr, None), holidays.get((curr, mt)))
            holiday = (curr, None) in holidays or (curr, mt) in holidays
            day[mt.lower()] = {
                "id": str(selection.id) if selection else None,
                "status": "NO_SERVICE" if holiday else (selection.status if selection else "CONFIRMED"),
                "no_service_reason": closed_reason if holiday else None,
                "time_window": window_for(mt, curr),
                "items": menus[(curr, mt)].items if (curr, mt) in menus else [],
                "menu_notes": menus[(curr, mt)].notes if (curr, mt) in menus else None,
            }
        result_days.append(day)
        curr += timedelta(days=1)

    return success_response(data=result_days)


@router.put("/{meal_date}/{meal_type}")
async def update_meal_selection(
    meal_date: Annotated[date, Path(description="Meal date (YYYY-MM-DD)")],
    meal_type: Annotated[str, Path(description="BREAKFAST, LUNCH, or DINNER")],
    body: UpdateMealSelectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Update student's meal selection (CONFIRMED or SKIPPED). Subject to 9:00 PM cutoff."""
    mt = meal_type.upper()
    if mt not in [MealType.BREAKFAST.value, MealType.LUNCH.value, MealType.DINNER.value]:
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Invalid meal_type")

    if body.status not in [MealStatus.CONFIRMED.value, MealStatus.SKIPPED.value]:
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Status must be CONFIRMED or SKIPPED")

    meal_service = MealService(db)
    selection = await meal_service.update_meal_selection(
        student_id=current_user.id,
        meal_date=meal_date,
        meal_type=mt,
        target_status=body.status,
        actor_id=current_user.id,
    )

    return success_response(
        data={
            "id": str(selection.id),
            "meal_date": selection.meal_date.isoformat(),
            "meal_type": selection.meal_type,
            "status": selection.status,
            "updated_at": selection.updated_at.isoformat() if selection.updated_at else None,
        }
    )


@router.put("/{meal_date}")
async def update_full_day(
    meal_date: date, body: UpdateMealSelectionRequest, current_user: CurrentUser,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Atomically opt in or out of all three meals without invalid intermediate states."""
    await MealService(db).update_meal_selection(
        current_user.id, meal_date, "BREAKFAST", body.status, current_user.id, whole_day=True,
    )
    return success_response(data={"meal_date": meal_date.isoformat(), "status": body.status})
