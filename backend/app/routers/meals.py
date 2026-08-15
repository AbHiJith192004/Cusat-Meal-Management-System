import uuid
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
    db: AsyncSession = Depends(get_db),
):
    """Get student's meal selections for a date range (defaults to next 7 days)."""
    start = start_date or today_ist()
    end = end_date or (start + timedelta(days=7))

    meal_service = MealService(db)
    
    # Return selections for all days in range
    result_days = []
    curr = start
    while curr <= end:
        b = await meal_service.get_or_create_selection(current_user.id, curr, MealType.BREAKFAST.value)
        l = await meal_service.get_or_create_selection(current_user.id, curr, MealType.LUNCH.value)
        d = await meal_service.get_or_create_selection(current_user.id, curr, MealType.DINNER.value)
        
        result_days.append({
            "meal_date": curr.isoformat(),
            "breakfast": {"id": str(b.id), "status": b.status},
            "lunch": {"id": str(l.id), "status": l.status},
            "dinner": {"id": str(d.id), "status": d.status},
        })
        curr += timedelta(days=1)

    return success_response(data=result_days)


@router.put("/{meal_date}/{meal_type}")
async def update_meal_selection(
    meal_date: Annotated[date, Path(description="Meal date (YYYY-MM-DD)")],
    meal_type: Annotated[str, Path(description="BREAKFAST, LUNCH, or DINNER")],
    body: UpdateMealSelectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
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
