import uuid
from datetime import date

from sqlalchemy import select
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.audit_repo import AuditRepository
from app.services.billing_lock import lock_open_period
from app.utils.enums import AttendanceType
from app.utils.exceptions import AttendanceAlreadyRecordedException, ValidationException
from app.utils.timezone import now_ist


class AttendanceService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.attendance_repo = AttendanceRepository(session)
        self.audit_repo = AuditRepository(session)

    async def record_manual_attendance(
        self,
        student_id: uuid.UUID,
        meal_date: date,
        meal_type: str,
        attendance_type: str,
        reason: str,
        admin_id: uuid.UUID,
    ) -> Attendance:
        """Admin records manual attendance or admin override with required reason."""
        if not reason or len(reason.strip()) < 3:
            raise ValidationException(message="Mandatory reason required for manual attendance.")

        att_type = attendance_type.upper()
        if att_type not in [AttendanceType.MANUAL.value, AttendanceType.ADMIN_OVERRIDE.value]:
            raise ValidationException(message="Attendance type must be MANUAL or ADMIN_OVERRIDE.")

        if meal_type not in {"BREAKFAST", "LUNCH", "DINNER"}:
            raise ValidationException(message="Invalid meal type.")
        await lock_open_period(self.session, meal_date)
        student = (await self.session.execute(select(User).where(User.id == student_id).with_for_update())).scalar_one_or_none()
        if not student or student.role != "STUDENT" or student.account_status != "ACTIVE":
            raise ValidationException(message="An active student account is required.")
        existing = await self.attendance_repo.get_for_update(student_id, meal_date, meal_type)
        if existing:
            raise AttendanceAlreadyRecordedException()

        attendance = Attendance(
            id=uuid.uuid4(),
            student_id=student_id,
            meal_date=meal_date,
            meal_type=meal_type,
            attendance_type=att_type,
            recorded_at=now_ist(),
            recorded_by=admin_id,
            reason=reason.strip(),
        )
        self.session.add(attendance)
        await self.session.flush()

        await self.audit_repo.log(
            actor_id=admin_id,
            action=f"ATTENDANCE_RECORDED_{att_type}",
            target_type="attendance",
            target_id=attendance.id,
            metadata={
                "student_id": str(student_id),
                "meal_date": meal_date.isoformat(),
                "meal_type": meal_type,
                "reason": reason,
            },
        )
        return attendance
