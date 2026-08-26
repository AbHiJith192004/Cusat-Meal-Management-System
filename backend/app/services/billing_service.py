import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingPeriod, StockCount
from app.repositories.audit_repo import AuditRepository
from app.utils.exceptions import (
    ConflictException,
    NotFoundException,
    ValidationException,
)
from app.utils.timezone import now_ist


class BillingService:
    """Billing period and physical stock persistence.

    Replaces the previous in-memory `PUBLISHED_BILL_MONTHS` set and the
    echo-only stock endpoint. Every mutation here commits to the database and
    writes an audit entry, because these figures decide what students are
    charged.
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.audit_repo = AuditRepository(session)

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _validate_period(month: int, year: int) -> None:
        if not 1 <= month <= 12:
            raise ValidationException(message="Month must be between 1 and 12.")
        if not 2000 <= year <= 2100:
            raise ValidationException(message="Year is out of range.")

    @staticmethod
    def _to_decimal(value, field: str) -> Decimal:
        try:
            d = Decimal(str(value))
        except (InvalidOperation, TypeError):
            raise ValidationException(message=f"{field} must be a number.")
        if d < 0:
            raise ValidationException(message=f"{field} cannot be negative.")
        return d

    async def get_period(self, month: int, year: int) -> BillingPeriod | None:
        self._validate_period(month, year)
        stmt = select(BillingPeriod).where(
            BillingPeriod.month == month, BillingPeriod.year == year
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def is_published(self, month: int, year: int) -> bool:
        period = await self.get_period(month, year)
        return bool(period and period.is_published)

    # -- status -------------------------------------------------------------

    async def get_status(self, month: int, year: int) -> dict:
        period = await self.get_period(month, year)
        published = bool(period and period.is_published)
        return {
            "month": month,
            "year": year,
            "is_published": published,
            # Stock is editable exactly while the month is open. This is
            # enforced server-side in record_stock_count, not just hidden in
            # the UI.
            "is_stocks_read_only": published,
            "published_at": period.published_at.isoformat() if period and period.published_at else None,
            "mess_daily_rate": str(period.mess_daily_rate) if period else None,
            "grand_total_expense": str(period.grand_total_expense) if period else None,
        }

    # -- publish ------------------------------------------------------------

    async def publish(
        self,
        month: int,
        year: int,
        figures: dict,
        actor_id: uuid.UUID,
    ) -> dict:
        """Freeze a month and snapshot its computed figures.

        All-or-nothing: the period row, the derived totals, and the audit entry
        commit together, so a half-published month cannot exist.
        """
        self._validate_period(month, year)

        period = await self.get_period(month, year)
        if period and period.is_published:
            raise ConflictException(
                message=f"Billing for {month:02d}/{year} is already published.",
                code="BILL_ALREADY_PUBLISHED",
            )

        opening = self._to_decimal(figures.get("opening_stock_value", 0), "Opening stock")
        purchases = self._to_decimal(figures.get("purchases_value", 0), "Purchases")
        closing = self._to_decimal(figures.get("closing_stock_value", 0), "Closing stock")
        operational = self._to_decimal(figures.get("operational_expenses", 0), "Operational expenses")
        administrative = self._to_decimal(figures.get("administrative_expenses", 0), "Administrative expenses")

        chargeable_days = figures.get("chargeable_days", 0)
        if not isinstance(chargeable_days, int) or chargeable_days <= 0:
            # Guarding the divisor explicitly: the rate formula divides by this,
            # and a zero here would either crash the publish or silently write a
            # nonsense rate that students get charged against.
            raise ValidationException(
                message="Chargeable days must be a positive whole number to compute a daily rate."
            )

        actual_food_cost = opening + purchases - closing
        if actual_food_cost < 0:
            raise ValidationException(
                message=(
                    "Closing stock exceeds opening stock plus purchases, which "
                    "would make food cost negative. Re-check the closing count."
                )
            )

        grand_total = actual_food_cost + operational + administrative
        daily_rate = (actual_food_cost / Decimal(chargeable_days)).quantize(Decimal("0.01"))

        now = now_ist()

        if period is None:
            period = BillingPeriod(id=uuid.uuid4(), month=month, year=year)
            self.session.add(period)

        period.is_published = True
        period.published_at = now
        period.published_by = actor_id
        period.opening_stock_value = opening
        period.purchases_value = purchases
        period.closing_stock_value = closing
        period.operational_expenses = operational
        period.administrative_expenses = administrative
        period.chargeable_days = chargeable_days
        period.actual_food_cost = actual_food_cost
        period.grand_total_expense = grand_total
        period.mess_daily_rate = daily_rate
        period.unpublish_reason = None

        await self.session.flush()

        await self.audit_repo.log(
            actor_id=actor_id,
            action="BILL_PUBLISHED",
            target_type="billing_period",
            target_id=period.id,
            metadata={
                "month": month,
                "year": year,
                "opening_stock_value": str(opening),
                "purchases_value": str(purchases),
                "closing_stock_value": str(closing),
                "operational_expenses": str(operational),
                "administrative_expenses": str(administrative),
                "chargeable_days": chargeable_days,
                "actual_food_cost": str(actual_food_cost),
                "grand_total_expense": str(grand_total),
                "mess_daily_rate": str(daily_rate),
            },
        )

        await self.session.commit()

        return {
            "month": month,
            "year": year,
            "is_published": True,
            "is_stocks_read_only": True,
            "actual_food_cost": str(actual_food_cost),
            "grand_total_expense": str(grand_total),
            "mess_daily_rate": str(daily_rate),
            "published_at": now.isoformat(),
        }

    # -- unpublish ----------------------------------------------------------

    async def unpublish(self, month: int, year: int, reason: str, actor_id: uuid.UUID) -> dict:
        """Reopen a published month.

        The old route raised 400 for every input, published or not, so a
        genuine correction to a mistakenly-published month was impossible.
        Reopening is allowed but always audited with a reason: reversing a
        published bill is a financial event, not a UI toggle.
        """
        self._validate_period(month, year)

        if not reason or len(reason.strip()) < 3:
            raise ValidationException(
                message="A reason of at least 3 characters is required to unpublish a bill."
            )

        period = await self.get_period(month, year)
        if period is None or not period.is_published:
            raise ConflictException(
                message=f"Billing for {month:02d}/{year} is not published.",
                code="BILL_NOT_PUBLISHED",
            )

        period.is_published = False
        period.unpublish_reason = reason.strip()

        await self.session.flush()

        await self.audit_repo.log(
            actor_id=actor_id,
            action="BILL_UNPUBLISHED",
            target_type="billing_period",
            target_id=period.id,
            metadata={
                "month": month,
                "year": year,
                "reason": reason.strip(),
                # Keep the figures that were in force, so the reversal is
                # reconstructable from the log alone.
                "mess_daily_rate_at_unpublish": str(period.mess_daily_rate),
                "grand_total_expense_at_unpublish": str(period.grand_total_expense),
            },
        )

        await self.session.commit()

        return {
            "month": month,
            "year": year,
            "is_published": False,
            "is_stocks_read_only": False,
            "message": f"Billing for {month:02d}/{year} reopened for editing.",
        }

    # -- stock --------------------------------------------------------------

    async def record_stock_count(
        self,
        month: int,
        year: int,
        item_id: str,
        physical_closing_qty,
        actor_id: uuid.UUID,
        item_name: str | None = None,
        unit: str | None = None,
        unit_cost=0,
    ) -> dict:
        """Persist a physical closing-stock count, unless the month is frozen."""
        self._validate_period(month, year)

        if not item_id or not item_id.strip():
            raise ValidationException(message="An item is required.")

        if await self.is_published(month, year):
            raise ConflictException(
                message=(
                    f"Billing for {month:02d}/{year} is published. Stock quantities "
                    "are frozen. Unpublish the month first if a correction is needed."
                ),
                code="BILL_PUBLISHED_STOCK_FROZEN",
            )

        qty = self._to_decimal(physical_closing_qty, "Physical closing quantity")
        cost = self._to_decimal(unit_cost, "Unit cost")

        stmt = select(StockCount).where(
            StockCount.month == month,
            StockCount.year == year,
            StockCount.item_id == item_id.strip(),
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()

        previous_qty = str(existing.physical_closing_qty) if existing else None

        if existing is None:
            existing = StockCount(
                id=uuid.uuid4(),
                month=month,
                year=year,
                item_id=item_id.strip(),
            )
            self.session.add(existing)

        existing.item_name = item_name
        existing.unit = unit
        existing.physical_closing_qty = qty
        existing.unit_cost = cost
        existing.counted_by = actor_id
        existing.counted_at = now_ist()

        await self.session.flush()

        await self.audit_repo.log(
            actor_id=actor_id,
            action="STOCK_COUNT_RECORDED",
            target_type="stock_count",
            target_id=existing.id,
            metadata={
                "month": month,
                "year": year,
                "item_id": existing.item_id,
                "item_name": item_name,
                "previous_qty": previous_qty,
                "physical_closing_qty": str(qty),
                "unit_cost": str(cost),
            },
        )

        await self.session.commit()

        return {
            "month": month,
            "year": year,
            "item_id": existing.item_id,
            "item_name": existing.item_name,
            "physical_closing_qty": str(qty),
            "unit": existing.unit,
            "unit_cost": str(cost),
            "closing_value": str((qty * cost).quantize(Decimal("0.01"))),
            "counted_at": existing.counted_at.isoformat(),
        }

    async def list_stock_counts(self, month: int, year: int) -> list[dict]:
        self._validate_period(month, year)
        stmt = (
            select(StockCount)
            .where(StockCount.month == month, StockCount.year == year)
            .order_by(StockCount.item_name.asc())
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            {
                "item_id": r.item_id,
                "item_name": r.item_name,
                "physical_closing_qty": str(r.physical_closing_qty),
                "unit": r.unit,
                "unit_cost": str(r.unit_cost),
                "closing_value": str((r.physical_closing_qty * r.unit_cost).quantize(Decimal("0.01"))),
                "counted_at": r.counted_at.isoformat() if r.counted_at else None,
            }
            for r in rows
        ]
