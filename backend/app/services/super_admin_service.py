import io
import uuid
from datetime import date, datetime
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
from app.security.password import hash_password
from app.utils.enums import Role, AccountStatus, StudentType
from app.utils.exceptions import ConflictException, ValidationException, NotFoundException
from app.utils.timezone import now_ist


class SuperAdminService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.settings_repo = SystemSettingRepository(session)
        self.audit_repo = AuditRepository(session)

    async def import_students_from_excel(
        self, file_contents: bytes, actor_id: uuid.UUID
    ) -> dict[str, Any]:
        """Parse Excel file and bulk import student records (PENDING activation)."""
        try:
            wb = openpyxl.load_workbook(filename=io.BytesIO(file_contents), data_only=True)
        except Exception as e:
            raise ValidationException(message=f"Invalid Excel file format: {str(e)}")

        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows or len(rows) < 2:
            raise ValidationException(message="Excel file is empty or missing data rows.")

        # Header validation (Row 1)
        # Expected: registration_number, name, date_of_birth, student_type, mess_id
        imported_count = 0
        skipped_count = 0
        errors = []

        total_rows = len(rows) - 1

        for idx, row in enumerate(rows[1:], start=2):
            if not row or not any(row):
                continue

            reg_no = str(row[0]).strip() if row[0] is not None else ""
            name = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
            dob_val = row[2] if len(row) > 2 else None
            student_type = str(row[3]).strip().upper() if len(row) > 3 and row[3] is not None else "HOSTELLER"
            mess_id = str(row[4]).strip() if len(row) > 4 and row[4] is not None else None

            if not reg_no or not name or not dob_val:
                errors.append({"row": idx, "registration_number": reg_no, "error": "Missing required fields (registration_number, name, date_of_birth)."})
                skipped_count += 1
                continue

            # Parse DOB
            dob = None
            if isinstance(dob_val, (datetime, date)):
                dob = dob_val if isinstance(dob_val, date) else dob_val.date()
            elif isinstance(dob_val, str):
                try:
                    dob = date.fromisoformat(dob_val.strip())
                except ValueError:
                    pass

            if not dob:
                errors.append({"row": idx, "registration_number": reg_no, "error": "Invalid date_of_birth format (expected YYYY-MM-DD)."})
                skipped_count += 1
                continue

            # Check duplicate
            existing = await self.user_repo.get_by_registration_number(reg_no)
            if existing:
                errors.append({"row": idx, "registration_number": reg_no, "error": "Registration number already exists."})
                skipped_count += 1
                continue

            # Create User + Profile
            st_type = student_type if student_type in [StudentType.HOSTELLER.value, StudentType.DAY_SCHOLAR.value] else StudentType.HOSTELLER.value

            user = User(
                id=uuid.uuid4(),
                registration_number=reg_no,
                name=name,
                role=Role.STUDENT.value,
                account_status=AccountStatus.PENDING.value,
            )
            profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=user.id,
                mess_id=mess_id,
                date_of_birth=dob,
                student_type=st_type,
            )
            self.session.add(user)
            self.session.add(profile)
            imported_count += 1

        if imported_count > 0:
            await self.session.flush()
            await self.audit_repo.log(
                actor_id=actor_id,
                action="STUDENTS_IMPORTED_EXCEL",
                target_type="user",
                metadata={
                    "total_rows": total_rows,
                    "imported_count": imported_count,
                    "skipped_count": skipped_count,
                },
            )

        return {
            "total_rows": total_rows,
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "errors": errors,
        }

    async def create_admin(
        self, reg_no: str, name: str, password: str, role: str, actor_id: uuid.UUID
    ) -> User:
        """Create a new admin or super-admin account."""
        existing = await self.user_repo.get_by_registration_number(reg_no)
        if existing:
            raise ConflictException(message="User with this registration number already exists.")

        user = User(
            id=uuid.uuid4(),
            registration_number=reg_no,
            name=name,
            password_hash=hash_password(password),
            role=role,
            account_status=AccountStatus.ACTIVE.value,
            activated_at=now_ist(),
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
        return user

    async def update_settings(
        self, settings_list: list[dict[str, str]], actor_id: uuid.UUID
    ) -> list[SystemSetting]:
        """Batch update system settings."""
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
