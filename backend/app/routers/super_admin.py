
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import success_response
from app.schemas.super_admin import CreateAdminRequest
from app.security.dependencies import SuperAdminUser
from app.services.super_admin_service import SuperAdminService

router = APIRouter(prefix="/api/v1/super-admin", tags=["Super Admin Operations"])


@router.post("/students/import")
async def import_students(
    super_admin: SuperAdminUser,
    file: UploadFile = File(..., description="Excel file (.xlsx) containing student records"),
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Super Admin: Bulk import pre-registered students from Excel file."""
    if not (file.filename or "").lower().endswith(".xlsx"):
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Only Excel files (.xlsx) are accepted.")

    contents = await file.read(5 * 1024 * 1024 + 1)
    if len(contents) > 5 * 1024 * 1024:
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Excel uploads must be at most 5 MB.")
    service = SuperAdminService(db)
    summary = await service.import_students_from_excel(contents, super_admin.id)
    return success_response(data=summary)


@router.post("/admins")
async def create_admin_user(
    body: CreateAdminRequest,
    super_admin: SuperAdminUser,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Super Admin: Create a PENDING ADMIN or SUPER_ADMIN who sets their own password.

    The setup code comes back once, in this response, and is never retrievable
    again - only its digest is stored. Hand it to the new administrator after
    verifying their identity; they redeem it at /api/v1/auth/activate.
    """
    service = SuperAdminService(db)
    user, setup_code, expires_at = await service.create_admin(
        reg_no=body.registration_number,
        name=body.name,
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
            "setup_code": setup_code,
            "setup_code_expires_at": expires_at.isoformat(),
        }
    )


# The settings endpoints used to live here. They are the mess office's own
# operating hours, fine amount and cut limit -- the work of running the mess,
# not of administering the system -- so they now sit on the admin router where
# every administrator can reach them. Creating admins and importing students
# stay here, because those change who holds power rather than how the mess runs.
