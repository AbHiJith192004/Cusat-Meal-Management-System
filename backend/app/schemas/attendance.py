from datetime import date
from uuid import UUID
from pydantic import BaseModel, Field


class QRVerifyRequest(BaseModel):
    qr_token: str


class QRConfirmRequest(BaseModel):
    verification_id: str


class ManualAttendanceRequest(BaseModel):
    student_id: UUID
    meal_date: date
    meal_type: str = Field(..., description="BREAKFAST, LUNCH, or DINNER")
    attendance_type: str = Field(default="MANUAL", description="MANUAL or ADMIN_OVERRIDE")
    reason: str = Field(..., min_length=3, max_length=500, description="Mandatory reason for manual entry")
