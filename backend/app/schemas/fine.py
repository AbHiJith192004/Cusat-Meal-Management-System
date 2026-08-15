from decimal import Decimal
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import FineStatus


class FineResponse(BaseModel):
    id: UUID
    student_id: UUID
    meal_date: date
    meal_type: str
    amount: Decimal
    status: str
    created_at: datetime
    waived_at: datetime | None = None
    waived_by: UUID | None = None
    waiver_reason: str | None = None

    model_config = ConfigDict(from_attributes=True)


class WaiveFineRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500, description="Mandatory waiver reason")


class ReconcileFinesRequest(BaseModel):
    target_date: date
    meal_type: str | None = Field(None, description="Specific meal or null for all completed meals")
