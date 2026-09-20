import io
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.student import StudentProfile
from app.models.settings import SystemSetting
from app.repositories.user_repo import UserRepository
from app.repositories.settings_repo import SystemSettingRepository
from app.repositories.audit_repo import AuditRepository
from app.security.jwt_handler import hash_refresh_token
from app.services.settings_validation import validate_settings
from app.utils.enums import Role, AccountStatus
from app.utils.exceptions import ConflictException, ValidationException
from app.utils.timezone import now_ist

# Matches the window auth_service.issue_setup_code uses for students, so a
# code handed to an administrator does not outlive one handed to a student.
SETUP_CODE_TTL_MINUTES = 30


class SuperAdminService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.settings_repo = SystemSettingRepository(session)
        self.audit_repo = AuditRepository(session)

    async def import_students_from_excel(
        self, file_contents: bytes, actor_id: uuid.UUID
    ) -> dict[str, Any]:
        """Import students from the intake workbook.

        The whole sheet is parsed and validated before a single row is
        written, so the caller gets one complete verdict - every rejection
        with its spreadsheet row number and a reason - rather than discovering
        problems halfway through a partial import.

        Students arrive PENDING with no password; they set one through the
        activation flow. An existing account is never touched: a re-import of
        the same sheet must not reset a password or revive a suspended
        account. Role is fixed to STUDENT in code, so no column in any
        workbook can create an administrator.
        """
        import zipfile
        from itertools import islice

        from app.services.student_import import missing_required_columns, build_column_map, review_rows

        try:
            with zipfile.ZipFile(io.BytesIO(file_contents)) as archive:
                if sum(item.file_size for item in archive.infolist()) > 25 * 1024 * 1024:
                    raise ValidationException(message="Excel workbook expands beyond the 25 MB limit.")
            wb = openpyxl.load_workbook(filename=io.BytesIO(file_contents), data_only=True, read_only=True)
        except ValidationException:
            raise
        except Exception as e:
            raise ValidationException(message=f"Invalid Excel file format: {e!s}")

        ws = wb.active
        rows = list(islice(ws.iter_rows(values_only=True), 5002))
        wb.close()
        if len(rows) > 5001:
            raise ValidationException(message="Import at most 5,000 students per workbook.")
        if not rows or len(rows) < 2:
            raise ValidationException(message="Excel file is empty or missing data rows.")

        header, data_rows = rows[0], rows[1:]
        missing = missing_required_columns(build_column_map(header))
        if missing:
            raise ValidationException(
                message="The sheet is missing required columns: " + ", ".join(missing)
                        + ". Column headings are matched by name, so check the first row."
            )

        review = review_rows(header, data_rows)

        # Existing accounts and addresses are settled against the database in
        # one pass each, rather than a query per row.
        candidates = review.importable
        numbers = [s.registration_number for s in candidates]
        emails = [s.email for s in candidates if s.email]
        taken_numbers = set((await self.session.execute(
            select(User.registration_number).where(User.registration_number.in_(numbers))
        )).scalars().all()) if numbers else set()
        taken_emails = set((await self.session.execute(
            select(User.email).where(User.email.in_(emails))
        )).scalars().all()) if emails else set()

        imported_count = 0
        for student in candidates:
            if student.registration_number in taken_numbers:
                review.skip(student.row, student.registration_number,
                            "An account already exists with this student id; it was left unchanged.",
                            kind="already_exists")
                continue
            if student.email and student.email in taken_emails:
                review.skip(student.row, student.registration_number,
                            f"Email {student.email} already belongs to another account.",
                            kind="already_exists")
                continue

            user = User(
                id=uuid.uuid4(),
                registration_number=student.registration_number,
                name=student.name,
                email=student.email,
                phone=student.phone,
                role=Role.STUDENT.value,
                account_status=AccountStatus.PENDING.value,
            )
            profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=user.id,
                date_of_birth=student.date_of_birth,
                department=student.department,
                course=student.course,
                student_type=student.student_type,
                hostel_name=student.hostel_name,
                room_number=student.room_number,
                photo_url=student.photo_url,
                consent_at=student.consent_at,
            )
            self.session.add(user)
            self.session.add(profile)
            imported_count += 1

        if imported_count:
            await self.session.flush()

        await self.audit_repo.log(
            actor_id=actor_id,
            action="STUDENTS_IMPORTED_EXCEL",
            target_type="user",
            metadata={
                "total_rows": review.total_rows,
                "imported_count": imported_count,
                "skipped_count": len(review.skipped),
                "flagged_count": len(review.needs_attention),
            },
        )

        return {
            "total_rows": review.total_rows,
            "imported_count": imported_count,
            "skipped_count": len(review.skipped),
            "errors": sorted(review.skipped, key=lambda e: e["row"]),
            "needs_attention": review.needs_attention,
        }

    async def create_admin(
        self, reg_no: str, name: str, role: str, actor_id: uuid.UUID
    ) -> tuple[User, str, datetime]:
        """Create an administrator who then sets their own password.

        The creator no longer supplies a password. The account starts PENDING
        with no password_hash and a single-use setup code, which the creator
        hands to the new administrator after checking their identity; they
        redeem it at /api/v1/auth/activate to choose their own password. Only
        the code's digest is stored, so the plaintext exists in the response
        once and nowhere else.

        Returns the user, the plaintext setup code, and its expiry.
        """
        reg_no = reg_no.strip().upper()
        if role not in {"ADMIN", "SUPER_ADMIN"}:
            raise ValidationException(message="Invalid administrator role.")
        existing = await self.user_repo.get_by_registration_number(reg_no)
        if existing:
            raise ConflictException(message="User with this registration number already exists.")

        setup_code = secrets.token_urlsafe(32)
        expires_at = now_ist() + timedelta(minutes=SETUP_CODE_TTL_MINUTES)
        user = User(
            id=uuid.uuid4(),
            registration_number=reg_no,
            name=name,
            password_hash=None,
            role=role,
            account_status=AccountStatus.PENDING.value,
            setup_code_hash=hash_refresh_token(setup_code),
            setup_code_expires_at=expires_at,
        )
        self.session.add(user)
        await self.session.flush()

        await self.audit_repo.log(
            actor_id=actor_id,
            action="ADMIN_CREATED",
            target_type="user",
            target_id=user.id,
            metadata={"registration_number": reg_no, "role": role},
        )
        return user, setup_code, expires_at

    async def update_settings(
        self, settings_list: list[dict[str, str]], actor_id: uuid.UUID
    ) -> list[SystemSetting]:
        """Batch update system settings.

        Validated first, and as a whole: a batch that would leave any known
        setting unparseable is rejected entirely rather than applied halfway,
        so a bad lunch end time cannot land while its start time is refused.
        """
        incoming = {item["key"]: item["value"] for item in settings_list}
        stored = {s.key: s.value for s in await self.settings_repo.get_all_settings()}
        validate_settings(incoming, stored)

        updated = []
        for item in settings_list:
            key, val = item["key"], item["value"]
            setting = await self.settings_repo.get_by_key(key)
            if setting:
                setting.value = val
                setting.updated_at = now_ist()
                setting.updated_by = actor_id
            else:
                setting = SystemSetting(
                    id=uuid.uuid4(),
                    key=key,
                    value=val,
                    updated_at=now_ist(),
                    updated_by=actor_id,
                )
                self.session.add(setting)
            updated.append(setting)

        await self.session.flush()
        await self.audit_repo.log(
            actor_id=actor_id,
            action="SYSTEM_SETTINGS_UPDATED",
            target_type="system_setting",
            metadata={"updated_keys": [item["key"] for item in settings_list]},
        )
        return updated
