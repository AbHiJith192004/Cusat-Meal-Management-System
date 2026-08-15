from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import success_response
from app.schemas.super_admin import CreateAdminRequest, BatchUpdateSettingsRequest
from app.security.dependencies import SuperAdminUser
from app.services.super_admin_service import SuperAdminService

router = APIRouter(prefix="/api/v1/super-admin", tags=["Super Admin Operations"])


@router.post("/students/import")
async def import_students(
    super_admin: SuperAdminUser,
    file: UploadFile = File(..., description="Excel file (.xlsx) containing student records"),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: Bulk import pre-registered students from Excel file."""
    if not file.filename.endswith((".xlsx", ".xls")):
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Only Excel files (.xlsx) are accepted.")

    contents = await file.read()
    service = SuperAdminService(db)
    summary = await service.import_students_from_excel(contents, super_admin.id)
    return success_response(data=summary)


@router.post("/admins")
async def create_admin_user(
    body: CreateAdminRequest,
    super_admin: SuperAdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: Create a new ADMIN or SUPER_ADMIN user account."""
    service = SuperAdminService(db)
    user = await service.create_admin(
        reg_no=body.registration_number,
        name=body.name,
        password=body.password,
        role=body.role,
        actor_id=super_admin.id,
    )
    return success_response(
        data={
            "id": str(user.id),
            "registration_number": user.registration_number,
            "name": user.name,
            "role": user.role,
            "account_status": user.account_status,
        }
    )


@router.get("/settings")
async def get_system_settings(
    super_admin: SuperAdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: Get all system settings."""
    service = SuperAdminService(db)
    settings = await service.settings_repo.get_all_settings()
    data = [
        {
            "id": str(s.id),
            "key": s.key,
            "value": s.value,
            "description": s.description,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in settings
    ]
    return success_response(data=data)


@router.put("/settings")
async def update_system_settings(
    body: BatchUpdateSettingsRequest,
    super_admin: SuperAdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Super Admin: Batch update system settings."""
    service = SuperAdminService(db)
    items = [{"key": s.key, "value": s.value} for s in body.settings]
    updated = await service.update_settings(items, super_admin.id)
    return success_response(data={"message": f"Updated {len(updated)} setting(s)."})
