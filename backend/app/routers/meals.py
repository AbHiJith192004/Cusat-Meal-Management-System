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
    from sqlalchemy import func, select
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

    # Mess cuts already taken, per calendar month the range touches. ONE
    # query however many months that is: /api/v1/meals has a statement budget
    # guarding against per-day work, and a loop of per-month counts would
    # scale with the range. Same semantic as
    # MealRepository.count_student_monthly_mess_cuts -- dates where all three
    # sittings are skipped -- in its set-based form.
    import calendar as _calendar
    from sqlalchemy import extract as _extract
    span_start = start.replace(day=1)
    span_end = end.replace(day=_calendar.monthrange(end.year, end.month)[1])
    from app.models.meal import MealSelection as _MS
    full_days = (
        select(_MS.meal_date)
        .where(_MS.student_id == current_user.id, _MS.status == "SKIPPED",
               _MS.meal_date.between(span_start, span_end))
        .group_by(_MS.meal_date)
        .having(func.count(func.distinct(_MS.meal_type)) == 3)
        .subquery()
    )
    cuts_by_month = {
        (int(y), int(m)): int(n) for y, m, n in (await db.execute(
            select(_extract('year', full_days.c.meal_date),
                   _extract('month', full_days.c.meal_date), func.count())
            .group_by(_extract('year', full_days.c.meal_date),
                      _extract('month', full_days.c.meal_date))
        )).all()
    }

    result_days = []
    curr = start
    while curr <= end:
        # strptime's naive result never escapes: .time() keeps the clock time
        # only, and datetime.combine attaches IST.
        cutoff = datetime.combine(curr - timedelta(days=advance_days), datetime.strptime(cutoff_time, "%H:%M").time(), tzinfo=IST)  # noqa: DTZ007
        day = {"meal_date": curr.isoformat(), "locked": now_ist() >= cutoff, "cutoff_at": cutoff.isoformat(),
               # Global, but carried per day alongside the cutoff so the meal
               # planner can state the real limit instead of a hardcoded 10.
               "max_monthly_mess_cuts": setting_value("max_monthly_mess_cuts"),
               # How many whole days this student has already cut in the month
               # THIS DAY falls in -- the limit is monthly, so a week spanning
               # a month boundary needs the count for each side, not one.
               "mess_cuts_taken": cuts_by_month.get((curr.year, curr.month), 0)}
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


@router.get("/mess-cuts")
async def get_my_mess_cut_history(
    current_user: CurrentUser,
    months: Annotated[int, Query(ge=1, le=24, description="How many months back to include")] = 6,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """A student's own mess-cut history, month by month, with the dates.

    THE GAP THIS FILLS: GET /api/v1/meals defaults to today..today+6 and is
    capped at 31 days, so the planner can only ever show the week ahead. A
    student could see the running total for the current month but not which
    days it came from, and nothing at all about a month that had ended. The
    first question anyone asks a bill is "which days were these", and until
    now the app could not answer it.

    Whole days only, the same definition the limit is enforced with, so this
    page and the number that blocks a fourth cut cannot disagree.

    ONE QUERY for the whole span. The obvious shape -- loop the months and
    call count_student_monthly_mess_cuts for each -- is N queries for N
    months and would have put a per-month cost on a screen that exists to
    show several at once.
    """
    import calendar as _calendar
    from sqlalchemy import func, select
    from app.models.meal import MealSelection
    from app.services.meal_timing_service import MealTimingService

    today = today_ist()
    # First day of the earliest month in range. months=1 means this month only.
    span_months = (today.year * 12 + today.month - 1) - (months - 1)
    span_start = date(span_months // 12, span_months % 12 + 1, 1)
    span_end = date(today.year, today.month,
                    _calendar.monthrange(today.year, today.month)[1])

    full_days = (
        select(MealSelection.meal_date)
        .where(MealSelection.student_id == current_user.id,
               MealSelection.status == "SKIPPED",
               MealSelection.meal_date.between(span_start, span_end))
        .group_by(MealSelection.meal_date)
        .having(func.count(func.distinct(MealSelection.meal_type)) == 3)
        .subquery()
    )
    cut_dates = sorted((await db.execute(select(full_days.c.meal_date))).scalars().all())

    limit = await MealTimingService(db).get_max_monthly_mess_cuts()

    by_month: dict[tuple[int, int], list] = {}
    for d in cut_dates:
        by_month.setdefault((d.year, d.month), []).append(d)

    # Every month in the span is returned, including empty ones. A month that
    # is simply missing from the list reads as "no data recorded", which is a
    # different claim from "you took no cuts", and only one of them is true.
    out = []
    for i in range(months):
        idx = (today.year * 12 + today.month - 1) - i
        y, m = idx // 12, idx % 12 + 1
        days = by_month.get((y, m), [])
        out.append({
            "year": y,
            "month": m,
            "label": f"{_calendar.month_name[m]} {y}",
            "mess_cuts": len(days),
            "dates": [d.isoformat() for d in days],
            "is_current_month": (y == today.year and m == today.month),
        })

    return success_response(data={"mess_cut_limit": limit, "months": out})


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
