import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MenuPublication(Base, TimestampMixin):
    __tablename__ = "menu_publications"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_date: Mapped[date] = mapped_column(sa.Date, nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    items: Mapped[list[str]] = mapped_column(sa.JSON().with_variant(JSONB, "postgresql"), nullable=False)
    notes: Mapped[str | None] = mapped_column(sa.String(500))
    published_by: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    __table_args__ = (sa.UniqueConstraint("menu_date", "meal_type", name="uq_menu_date_meal"),)


class LedgerEntry(Base, TimestampMixin):
    __tablename__ = "ledger_entries"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_date: Mapped[date] = mapped_column(sa.Date, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(sa.String(24), nullable=False)
    category: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    description: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    amount: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False)
    vendor: Mapped[str | None] = mapped_column(sa.String(160))
    reference: Mapped[str | None] = mapped_column(sa.String(120))
    created_by: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    voided_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    void_reason: Mapped[str | None] = mapped_column(sa.String(500))
    __table_args__ = (
        sa.CheckConstraint("amount > 0", name="ck_ledger_amount_positive"),
        sa.Index("ix_ledger_kind_date", "kind", "entry_date"),
    )


class InventoryItem(Base, TimestampMixin):
    __tablename__ = "inventory_items"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(sa.String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    unit: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False, default=Decimal("0"))
    reorder_level: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False, default=Decimal("0"))
    unit_cost: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0"))
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    __table_args__ = (
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_quantity_nonnegative"),
        sa.CheckConstraint("reorder_level >= 0", name="ck_inventory_reorder_nonnegative"),
        sa.CheckConstraint("unit_cost >= 0", name="ck_inventory_cost_nonnegative"),
    )


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("inventory_items.id"), nullable=False, index=True)
    quantity_delta: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False)
    reason: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    reference: Mapped[str | None] = mapped_column(sa.String(120))
    recorded_by: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


class CommitteeAssignment(Base):
    __tablename__ = "committee_assignments"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(sa.String(32), nullable=False, default="ATTENDANCE_SCANNER")
    assigned_by: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    revoke_reason: Mapped[str | None] = mapped_column(sa.String(500))
    __table_args__ = (sa.CheckConstraint("ends_at > starts_at", name="ck_committee_time_range"),)


class PaymentSubmission(Base, TimestampMixin):
    __tablename__ = "payment_submissions"
    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("billing_periods.id"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True)
    bill_revision: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    utr: Mapped[str] = mapped_column(sa.String(64), unique=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default="PENDING")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(sa.String(500))
    __table_args__ = (
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        sa.UniqueConstraint("period_id", "student_id", "bill_revision", name="uq_payment_bill_revision"),
    )
