import uuid
import jwt
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.attendance import Attendance
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.meal_repo import MealRepository
from app.repositories.user_repo import UserRepository
from app.repositories.audit_repo import AuditRepository
from app.services.meal_timing_service import MealTimingService
from app.utils.enums import MealStatus, AttendanceType
from app.utils.exceptions import (
    QRExpiredException,
    QRInvalidException,
    QRReplayDetectedException,
    AttendanceAlreadyRecordedException,
    AttendanceUnavailableException,
    MealSkippedException,
    NotFoundException,
)
from app.utils.timezone import now_ist

settings = get_settings()

# In-memory verification cache mapping verification_id -> payload
# Cleaned up on confirmation or expiry
_pending_verifications: dict[str, dict[str, Any]] = {}


class QRService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.attendance_repo = AttendanceRepository(session)
        self.meal_repo = MealRepository(session)
        self.user_repo = UserRepository(session)
        self.timing_service = MealTimingService(session)
        self.audit_repo = AuditRepository(session)

    async def generate_qr_token(
        self, student_id: uuid.UUID, meal_type: str
    ) -> tuple[str, datetime, int]:
        """Generate a signed, short-lived QR token for the student."""
        now = now_ist()
        today = now.date()

        # Check window
        if not await self.timing_service.is_within_meal_window(meal_type, today, now):
            raise AttendanceUnavailableException(
                message=f"Current time is outside the {meal_type} service window."
            )

        # Check selection status
        selection = await self.meal_repo.get_student_meal(student_id, today, meal_type)
        status = selection.status if selection else MealStatus.CONFIRMED.value

        if status == MealStatus.SKIPPED.value:
            raise MealSkippedException(message="You have skipped this meal.")
        if status == MealStatus.NO_SERVICE.value:
            raise AttendanceUnavailableException(message="No service scheduled for this meal.")

        # Check existing attendance
        existing = await self.attendance_repo.get_student_attendance(student_id, today, meal_type)
        if existing:
            raise AttendanceAlreadyRecordedException()

        # Generate JWT token
        validity = settings.QR_VALIDITY_SECONDS
        expires_at = now + timedelta(seconds=validity)
        jti = str(uuid.uuid4())

        payload = {
            "sub": str(student_id),
            "meal": meal_type,
            "date": today.isoformat(),
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "jti": jti,
            "type": "qr",
        }

        token = jwt.encode(payload, settings.QR_SECRET_KEY, algorithm="HS256")
        return token, expires_at, validity

    async def verify_qr_token(self, qr_token: str, admin_id: uuid.UUID) -> dict[str, Any]:
        """Admin scans QR: verify token claims, signature, window, and return student details."""
        try:
            payload = jwt.decode(
                qr_token,
                settings.QR_SECRET_KEY,
                algorithms=["HS256"],
                options={"require": ["sub", "meal", "date", "exp", "jti", "type"]},
            )
        except jwt.ExpiredSignatureError:
            raise QRExpiredException()
        except jwt.InvalidTokenError:
            raise QRInvalidException()

        if payload.get("type") != "qr":
            raise QRInvalidException(message="Invalid token payload type")

        student_id = uuid.UUID(payload["sub"])
        meal_type = payload["meal"]
        meal_date = datetime.strptime(payload["date"], "%Y-%m-%d").date()

        # Re-check user & attendance
        user = await self.user_repo.get_user_with_profile(student_id)
        if not user:
            raise NotFoundException(message="Student not found")

        existing = await self.attendance_repo.get_student_attendance(student_id, meal_date, meal_type)
        if existing:
            raise AttendanceAlreadyRecordedException()

        # Create verification ticket
        verification_id = str(uuid.uuid4())
        exp_dt = datetime.fromtimestamp(payload["exp"], tz=now_ist().tzinfo)

        verification_payload = {
            "verification_id": verification_id,
            "student_id": str(student_id),
            "student_name": user.name,
            "registration_number": user.registration_number,
            "meal_date": meal_date.isoformat(),
            "meal_type": meal_type,
            "photo_url": user.profile.photo_url if user.profile else None,
            "expires_at": exp_dt.isoformat(),
            "jti": payload["jti"],
        }

        _pending_verifications[verification_id] = verification_payload

        return verification_payload

    async def confirm_attendance(
        self, verification_id: str, admin_id: uuid.UUID
    ) -> Attendance:
        """Admin confirms attendance: lock row, insert record, write audit log."""
        ticket = _pending_verifications.pop(verification_id, None)
        if not ticket:
            raise QRInvalidException(message="Verification ticket expired or invalid.")

        student_id = uuid.UUID(ticket["student_id"])
        meal_date = datetime.strptime(ticket["meal_date"], "%Y-%m-%d").date()
        meal_type = ticket["meal_type"]

        # Transactional lock to prevent concurrency duplicate
        existing = await self.attendance_repo.get_for_update(student_id, meal_date, meal_type)
        if existing:
            raise AttendanceAlreadyRecordedException()

        attendance = Attendance(
            id=uuid.uuid4(),
            student_id=student_id,
            meal_date=meal_date,
            meal_type=meal_type,
            attendance_type=AttendanceType.QR.value,
            recorded_at=now_ist(),
            recorded_by=admin_id,
        )
        self.session.add(attendance)
        await self.session.flush()

        await self.audit_repo.log(
            actor_id=admin_id,
            action="ATTENDANCE_RECORDED_QR",
            target_type="attendance",
            target_id=attendance.id,
            metadata={
                "student_id": str(student_id),
                "meal_date": ticket["meal_date"],
                "meal_type": meal_type,
                "jti": ticket["jti"],
            },
        )
        return attendance
