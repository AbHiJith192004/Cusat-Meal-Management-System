from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DailyMealRateResponse(BaseModel):
    id: Optional[UUID] = None
    rate_date: date
    breakfast_rate: Decimal = Field(default=Decimal("30.00"))
    lunch_rate: Decimal = Field(default=Decimal("50.00"))
    dinner_rate: Decimal = Field(default=Decimal("40.00"))
    daily_total: Decimal = Field(default=Decimal("120.00"))
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SetMealRateRequest(BaseModel):
    rate_date: date
    breakfast_rate: Decimal = Field(default=Decimal("30.00"), ge=0)
    lunch_rate: Decimal = Field(default=Decimal("50.00"), ge=0)
    dinner_rate: Decimal = Field(default=Decimal("40.00"), ge=0)
    notes: Optional[str] = None


class BulkSetMealRateRequest(BaseModel):
    year: int = Field(..., ge=2024, le=2100)
    month: int = Field(..., ge=1, le=12)
    breakfast_rate: Decimal = Field(default=Decimal("30.00"), ge=0)
    lunch_rate: Decimal = Field(default=Decimal("50.00"), ge=0)
    dinner_rate: Decimal = Field(default=Decimal("40.00"), ge=0)
    notes: Optional[str] = Field(default="Regular Day")


class PublishBillRequest(BaseModel):
    month: str
    year: str


class UpdateStockRequest(BaseModel):
    month: str
    year: str
    item_id: str
    physical_closing_qty: float = Field(ge=0)

