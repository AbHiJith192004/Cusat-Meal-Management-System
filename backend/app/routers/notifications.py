from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.notification import Notification
from app.schemas.common import success_response
from app.security.dependencies import CurrentUser
from app.utils.exceptions import NotFoundException

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@router.get("")
async def get_my_notifications(
    current_user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    """Get student's notifications (unread first)."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    res = await db.execute(stmt)
    notifications = res.scalars().all()

    data = [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "type": n.notification_type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]
    return success_response(data=data)


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: Annotated[UUID, Path(description="Notification UUID")],
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    notif = res.scalar_one_or_none()
    if not notif:
        raise NotFoundException(message="Notification not found.")

    notif.is_read = True
    return success_response(data={"message": "Notification marked as read."})
