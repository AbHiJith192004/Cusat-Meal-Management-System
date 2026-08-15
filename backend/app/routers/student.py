import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.schemas.common import success_response
from app.security.dependencies import CurrentUser
from app.utils.timezone import today_ist

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Student"])


@router.get("/me")
async def get_current_user_profile(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's profile information."""
    user_repo = UserRepository(db)
    user = await user_repo.get_user_with_profile(current_user.id)
    
    profile_data = None
    if user and user.profile:
        profile_data = {
            "id": str(user.profile.id),
            "mess_id": user.profile.mess_id,
            "date_of_birth": user.profile.date_of_birth.isoformat(),
            "student_type": user.profile.student_type,
            "campus_location": getattr(user.profile, "campus_location", "MAIN_CAMPUS"),
            "photo_url": user.profile.photo_url,
        }
    
    return success_response(
        data={
            "id": str(current_user.id),
            "registration_number": current_user.registration_number,
            "name": current_user.name,
            "role": current_user.role,
            "account_status": current_user.account_status,
            "activated_at": current_user.activated_at.isoformat() if current_user.activated_at else None,
            "profile": profile_data,
        }
    )


@router.get("/me/dashboard")
async def get_student_dashboard(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get the student dashboard summary for today."""
    from app.services.meal_service import MealService
    from app.utils.enums import MealType

    today = today_ist()
    meal_service = MealService(db)

    b = await meal_service.get_or_create_selection(current_user.id, today, MealType.BREAKFAST.value)
    l = await meal_service.get_or_create_selection(current_user.id, today, MealType.LUNCH.value)
    d = await meal_service.get_or_create_selection(current_user.id, today, MealType.DINNER.value)

    from sqlalchemy import select, func
    from app.models.meal import MealSelection

    done_cnt = (await db.execute(
        select(func.count()).where(MealSelection.student_id == current_user.id, MealSelection.status == "ATTENDED")
    )).scalar_one() or 0

    skipped_cnt = (await db.execute(
        select(func.count()).where(MealSelection.student_id == current_user.id, MealSelection.status == "SKIPPED")
    )).scalar_one() or 0

    booked_cnt = (await db.execute(
        select(func.count()).where(MealSelection.student_id == current_user.id, MealSelection.status == "CONFIRMED")
    )).scalar_one() or 0

    return success_response(
        data={
            "date": today.isoformat(),
            "student_name": current_user.name,
            "meals": {
                "breakfast": {"id": str(b.id), "status": b.status, "attendance": None},
                "lunch": {"id": str(l.id), "status": l.status, "attendance": None},
                "dinner": {"id": str(d.id), "status": d.status, "attendance": None},
            },
            "overall_stats": {
                "meals_done": done_cnt,
                "meals_skipped": skipped_cnt,
                "meals_booked": booked_cnt,
            },
            "pending_fines_count": 0,
            "unread_notifications_count": 0,
        }
    )
