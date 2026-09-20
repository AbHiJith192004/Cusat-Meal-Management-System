from datetime import date
from pydantic import BaseModel, Field


class WaiveFineRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500, description="Mandatory waiver reason")


class ReconcileFinesRequest(BaseModel):
    target_date: date
    meal_type: str | None = Field(None, description="Specific meal or null for all completed meals")
