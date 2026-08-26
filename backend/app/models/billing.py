import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BillingPeriod(Base, TimestampMixin):
    """One month's billing state.

    Replaces a module-level `PUBLISHED_BILL_MONTHS: set[str]` that lived in
    admin.py. That set was hardcoded to two months, reset on every restart, and
    could not agree with itself across worker processes - so whether a month
    was "published" (and therefore whether stock was frozen) depended on which
    worker answered the request.

    Publishing snapshots the computed figures. The whole point of freezing a
    month is that the numbers stop moving, so they are stored rather than
    recomputed on read.
    """

    __tablename__ = "billing_periods"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Numeric month/year, not the display strings the old set used as keys.
    month: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    year: Mapped[int] = mapped_column(sa.Integer, nullable=False)

    is_published: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
    )

    # Figures frozen at publish time.
    opening_stock_value: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    purchases_value: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    closing_stock_value: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    operational_expenses: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    administrative_expenses: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    chargeable_days: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)

    actual_food_cost: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    grand_total_expense: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    mess_daily_rate: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), nullable=False, default=Decimal("0.00"))

    unpublish_reason: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)

    __table_args__ = (
        sa.UniqueConstraint("month", "year", name="uq_billing_period_month_year"),
        sa.Index("ix_billing_period_year_month", "year", "month"),
        sa.CheckConstraint("month >= 1 AND month <= 12", name="ck_billing_period_month"),
    )


class StockCount(Base, TimestampMixin):
    """A physical closing-stock count for one item in one month.

    /admin/stocks/update-physical previously echoed the request body back as a
    success without writing anywhere - the single manually-entered number the
    whole daily-rate formula depends on was discarded the moment the request
    finished.
    """

    __tablename__ = "stock_counts"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    month: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    year: Mapped[int] = mapped_column(sa.Integer, nullable=False)

    item_id: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    item_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)

    physical_closing_qty: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False, default=Decimal("0"))
    unit: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)
    unit_cost: Mapped[Decimal] = mapped_column(sa.Numeric(12, 2), nullable=False, default=Decimal("0.00"))

    counted_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
    )
    counted_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    __table_args__ = (
        # One authoritative count per item per month; a re-count updates it.
        sa.UniqueConstraint("month", "year", "item_id", name="uq_stock_count_period_item"),
        sa.Index("ix_stock_count_year_month", "year", "month"),
        sa.CheckConstraint("physical_closing_qty >= 0", name="ck_stock_count_qty_non_negative"),
    )
