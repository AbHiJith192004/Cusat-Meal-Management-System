from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import MealType, MealStatus


class MealSelectionItem(BaseModel):
    id: UUID | None = None
    meal_date: date
    meal_type: str
    status: str
    updated_at: datetime | None = None
    updated_by: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class UpdateMealSelectionRequest(BaseModel):
    status: str = Field(..., description="Target status: CONFIRMED or SKIPPED")


class DailyMealOverview(BaseModel):
    meal_date: date
    is_holiday: bool = False
    holiday_reason: str | None = None
    breakfast: MealSelectionItem
    lunch: MealSelectionItem
    dinner: MealSelectionItem


class HolidayCreateRequest(BaseModel):
    date: date
    meal_type: str | None = Field(None, description="Null for full-day holiday, or BREAKFAST/LUNCH/DINNER")
    reason: str = Field(..., min_length=3, max_length=500)


class HolidayResponse(BaseModel):
    id: UUID
    date: date
    meal_type: str | None = None
    reason: str
    created_by: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
