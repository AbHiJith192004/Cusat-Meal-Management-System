from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import AttendanceType, MealType


class QRTokenResponse(BaseModel):
    qr_token: str
    expires_at: datetime
    validity_seconds: int


class QRVerifyRequest(BaseModel):
    qr_token: str


class QRVerifyResponse(BaseModel):
    verification_id: str
    student_id: UUID
    student_name: str
    registration_number: str
    meal_date: date
    meal_type: str
    photo_url: str | None = None
    expires_at: datetime


class QRConfirmRequest(BaseModel):
    verification_id: str


class AttendanceResponse(BaseModel):
    id: UUID
    student_id: UUID
    meal_date: date
    meal_type: str
    attendance_type: str
    recorded_at: datetime
    recorded_by: UUID | None = None
    reason: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ManualAttendanceRequest(BaseModel):
    student_id: UUID
    meal_date: date
    meal_type: str = Field(..., description="BREAKFAST, LUNCH, or DINNER")
    attendance_type: str = Field(default="MANUAL", description="MANUAL or ADMIN_OVERRIDE")
    reason: str = Field(..., min_length=3, max_length=500, description="Mandatory reason for manual entry")
