from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class MenuUpsert(BaseModel):
    items: list[str] = Field(min_length=1, max_length=20)
    notes: str | None = Field(None, max_length=500)
    @field_validator("items")
    @classmethod
    def clean_items(cls, value):
        cleaned = [x.strip() for x in value if x.strip()]
        if not cleaned or any(len(x) > 100 for x in cleaned):
            raise ValueError("Provide 1-20 menu items, each up to 100 characters.")
        return cleaned


class LedgerCreate(BaseModel):
    entry_date: date
    kind: Literal["PURCHASE", "OPERATIONAL", "ADMINISTRATIVE"]
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=3, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    vendor: str | None = Field(None, max_length=160)
    reference: str | None = Field(None, max_length=120)


class VoidRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class InventoryCreate(BaseModel):
    sku: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=2, max_length=160)
    unit: str = Field(min_length=1, max_length=32)
    opening_quantity: Decimal = Field(ge=0, max_digits=12, decimal_places=3)
    reorder_level: Decimal = Field(ge=0, max_digits=12, decimal_places=3)
    unit_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class InventoryAdjust(BaseModel):
    quantity_delta: Decimal = Field(max_digits=12, decimal_places=3)
    reason: str = Field(min_length=3, max_length=500)
    reference: str | None = Field(None, max_length=120)


class CommitteeCreate(BaseModel):
    student_id: UUID
    starts_at: datetime
    ends_at: datetime
    scope: Literal["ATTENDANCE_SCANNER"] = "ATTENDANCE_SCANNER"


class BulkAttendanceCreate(BaseModel):
    student_ids: list[UUID] = Field(min_length=1, max_length=300)
    meal_date: date
    meal_type: Literal["BREAKFAST", "LUNCH", "DINNER"]
    reason: str = Field(min_length=5, max_length=500)
    @field_validator("student_ids")
    @classmethod
    def no_duplicates(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("student_ids contains duplicates")
        return value


class PaymentCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2024, le=2100)
    utr: str = Field(min_length=6, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class PaymentReview(BaseModel):
    decision: Literal["VERIFIED", "REJECTED"]
    note: str = Field(min_length=3, max_length=500)
