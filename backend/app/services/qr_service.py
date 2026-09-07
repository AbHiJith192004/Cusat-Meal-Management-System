import uuid
import jwt
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from app.models.user import User
from app.repositories.holiday_repo import HolidayRepository
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.attendance import Attendance
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.meal_repo import MealRepository
from app.repositories.user_repo import UserRepository
from app.repositories.audit_repo import AuditRepository
from app.services.meal_timing_service import MealTimingService
from app.services.billing_lock import lock_open_period
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

        await self._check_eligibility(student_id, today, meal_type)

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

        try:
            student_id = uuid.UUID(payload["sub"])
            meal_type = payload["meal"]
            meal_date = datetime.strptime(payload["date"], "%Y-%m-%d").date()
        except (ValueError, TypeError, KeyError):
            raise QRInvalidException()
        await self._check_eligibility(student_id, meal_date, meal_type)

        # Re-check user & attendance
        user = await self.user_repo.get_user_with_profile(student_id)
        if not user:
            raise NotFoundException(message="Student not found")

        existing = await self.attendance_repo.get_student_attendance(student_id, meal_date, meal_type)
        if existing:
            raise AttendanceAlreadyRecordedException()

        # Create verification ticket
        verification_id = jwt.encode({
            **payload, "type": "qr_confirmation", "admin_id": str(admin_id),
        }, settings.QR_SECRET_KEY, algorithm="HS256")
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

        return verification_payload

    async def confirm_attendance(
        self, verification_id: str, admin_id: uuid.UUID
    ) -> Attendance:
        """Admin confirms attendance: lock row, insert record, write audit log."""
        try:
            claims = jwt.decode(verification_id, settings.QR_SECRET_KEY, algorithms=["HS256"],
                                options={"require": ["sub", "date", "meal", "exp", "jti", "type", "admin_id"]})
            if claims["type"] != "qr_confirmation" or claims["admin_id"] != str(admin_id):
                raise QRInvalidException()
            student_id = uuid.UUID(claims["sub"])
            meal_date = datetime.strptime(claims["date"], "%Y-%m-%d").date()
            meal_type = claims["meal"]
        except jwt.ExpiredSignatureError:
            raise QRExpiredException()
        except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
            raise QRInvalidException()
        await lock_open_period(self.session, meal_date)
        # The existing parent row serializes concurrent scans, including absent attendance rows.
        await self.session.execute(select(User.id).where(User.id == student_id).with_for_update())
        await self._check_eligibility(student_id, meal_date, meal_type)
        ticket = {"meal_date": meal_date.isoformat(), "jti": claims["jti"]}

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

    async def _check_eligibility(self, student_id, meal_date, meal_type):
        if meal_type not in {"BREAKFAST", "LUNCH", "DINNER"}:
            raise QRInvalidException()
        user = await self.user_repo.get_by_id(student_id)
        if not user or user.account_status != "ACTIVE" or user.role != "STUDENT":
            raise QRInvalidException(message="Student account is not active.")
        if not await self.timing_service.is_within_meal_window(meal_type, meal_date, now_ist()):
            raise AttendanceUnavailableException()
        if await HolidayRepository(self.session).get_for_date(meal_date, meal_type):
            raise AttendanceUnavailableException()
        selection = await self.meal_repo.get_student_meal(student_id, meal_date, meal_type)
        if selection and selection.status == "SKIPPED":
            raise MealSkippedException()
        if selection and selection.status == "NO_SERVICE":
            raise AttendanceUnavailableException()
