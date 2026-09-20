from typing import Literal
from datetime import date
from pydantic import BaseModel, Field


class UpdateMealSelectionRequest(BaseModel):
    status: Literal["CONFIRMED", "SKIPPED"]


class HolidayCreateRequest(BaseModel):
    date: date
    meal_type: Literal["BREAKFAST", "LUNCH", "DINNER"] | None = Field(None, description="Null for full-day holiday, or BREAKFAST/LUNCH/DINNER")
    reason: str = Field(..., min_length=3, max_length=500)


