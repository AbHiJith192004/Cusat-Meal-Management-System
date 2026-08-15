from typing import Annotated

from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.attendance import QRVerifyRequest, QRConfirmRequest
from app.schemas.common import success_response
from app.security.dependencies import CurrentUser, AdminUser
from app.services.qr_service import QRService
from app.services.attendance_service import AttendanceService
from app.utils.enums import MealType
from app.utils.exceptions import ValidationException

router = APIRouter(prefix="/api/v1/attendance", tags=["Attendance"])


@router.get("/qr")
async def generate_qr_code(
    current_user: CurrentUser,
    meal_type: Annotated[str, Query(description="BREAKFAST, LUNCH, or DINNER")],
    db: AsyncSession = Depends(get_db),
):
    """Generate a signed, short-lived QR token for student attendance (60s TTL)."""
    mt = meal_type.upper()
    if mt not in [MealType.BREAKFAST.value, MealType.LUNCH.value, MealType.DINNER.value]:
        raise ValidationException(message="Invalid meal_type")

    qr_service = QRService(db)
    token, expires_at, validity = await qr_service.generate_qr_token(current_user.id, mt)

    return success_response(
        data={
            "qr_token": token,
            "expires_at": expires_at.isoformat(),
            "validity_seconds": validity,
        }
    )


@router.post("/verify")
async def verify_qr_code(
    body: QRVerifyRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Admin scans QR: verify token validity, return student details."""
    qr_service = QRService(db)
    result = await qr_service.verify_qr_token(body.qr_token, admin_user.id)
    return success_response(data=result)


@router.post("/confirm")
async def confirm_qr_attendance(
    body: QRConfirmRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Admin confirms scanned QR: record attendance atomically."""
    qr_service = QRService(db)
    attendance = await qr_service.confirm_attendance(body.verification_id, admin_user.id)

    return success_response(
        data={
            "id": str(attendance.id),
            "student_id": str(attendance.student_id),
            "meal_date": attendance.meal_date.isoformat(),
            "meal_type": attendance.meal_type,
            "attendance_type": attendance.attendance_type,
            "recorded_at": attendance.recorded_at.isoformat(),
        }
    )
