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
    """Publish a month and freeze its figures.

    month/year were previously free-form strings used as dictionary keys
    ("August-2026"), which made them unvalidatable and locale-dependent.
    """
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2024, le=2100)

    opening_stock_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    purchases_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    closing_stock_value: Decimal = Field(default=Decimal("0.00"), ge=0)
    operational_expenses: Decimal = Field(default=Decimal("0.00"), ge=0)
    administrative_expenses: Decimal = Field(default=Decimal("0.00"), ge=0)
    # Divisor for the daily rate, so it must be positive.
    chargeable_days: int = Field(..., gt=0)


class UnpublishBillRequest(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2024, le=2100)
    reason: str = Field(..., min_length=3, max_length=500)


class UpdateStockRequest(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2024, le=2100)
    item_id: str = Field(..., min_length=1, max_length=100)
    item_name: Optional[str] = Field(default=None, max_length=255)
    unit: Optional[str] = Field(default=None, max_length=32)
    physical_closing_qty: Decimal = Field(..., ge=0)
    unit_cost: Decimal = Field(default=Decimal("0.00"), ge=0)

