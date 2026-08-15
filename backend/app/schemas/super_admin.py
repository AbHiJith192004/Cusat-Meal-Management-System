from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import Role, AccountStatus, StudentType


class ImportRowError(BaseModel):
    row: int
    registration_number: str | None = None
    error: str


class ImportSummaryResponse(BaseModel):
    total_rows: int
    imported_count: int
    skipped_count: int
    errors: list[ImportRowError]


class CreateAdminRequest(BaseModel):
    registration_number: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(default=Role.ADMIN.value, description="ADMIN or SUPER_ADMIN")


class UpdateSettingItem(BaseModel):
    key: str
    value: str


class BatchUpdateSettingsRequest(BaseModel):
    settings: list[UpdateSettingItem]
