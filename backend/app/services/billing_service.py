import uuid
import calendar
import hashlib
import json
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingPeriod, StockCount, StudentBillSnapshot
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
        if not d.is_finite():
            raise ValidationException(message=f"{field} must be finite.")
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

    async def _lock_period(self, month: int, year: int):
        self._validate_period(month, year)
        # Transaction-level lock covers first publication, when no period row exists.
        await self.session.execute(text("SELECT pg_advisory_xact_lock(734201, :period)"),
                                   {"period": year * 12 + month})

    # -- status -------------------------------------------------------------

    async def get_status(self, month: int, year: int) -> dict:
        period = await self.get_period(month, year)
        published = bool(period and period.is_published)
        return {
            "month": month,
            "year": year,
            "revision": period.revision if period else 0,
            "calculation": period.calculation if period else None,
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

    async def preview(self, month: int, year: int, figures: dict) -> dict:
        from app.services.billing_calculator import calculate_bills
        await self._lock_period(month, year)
        amounts = {key: self._to_decimal(figures.get(key, 0), key) for key in (
            "opening_stock_value", "purchases_value", "closing_stock_value",
            "operational_expenses", "administrative_expenses")}
        if any(v != v.quantize(Decimal("0.01")) or v > Decimal("9999999999.99") for v in amounts.values()):
            raise ValidationException(message="Amounts must have at most two decimal places and fit the billing limit.")
        food = amounts["opening_stock_value"] + amounts["purchases_value"] - amounts["closing_stock_value"]
        if food < 0:
            raise ValidationException(message="Closing stock exceeds opening stock plus purchases.")
        total = food + amounts["operational_expenses"] + amounts["administrative_expenses"]
        if total > Decimal("9999999999.99"):
            raise ValidationException(message="Total expense exceeds the billing limit.")
        calculation = await calculate_bills(self.session, year, month, total)
        period = await self.get_period(month, year)
        result = {**calculation, "month": month, "year": year,
                  "figures": {k: str(v.quantize(Decimal("0.01"))) for k, v in amounts.items()},
                  "actual_food_cost": str(food.quantize(Decimal("0.01"))),
                  "grand_total_expense": str(total.quantize(Decimal("0.01"))),
                  "revision": (period.revision if period else 0) + 1}
        result["preview_token"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
        return result

    async def publish(self, month: int, year: int, figures: dict, actor_id: uuid.UUID) -> dict:
        """Publish a reviewed, completed month's invoices in one atomic revision."""
        self._validate_period(month, year)
        if date(year, month, calendar.monthrange(year, month)[1]) >= now_ist().date():
            raise ValidationException(message="Publish only after the billing month has ended in IST.")
        await self._lock_period(month, year)
        period = await self.get_period(month, year)
        if period and period.is_published:
            raise ConflictException(message="This month is already published.", code="BILL_ALREADY_PUBLISHED")
        preview = await self.preview(month, year, figures)
        if not preview['chargeable_days']:
            raise ValidationException(message="No opted-in student-days exist for this month.")
        if figures.get('preview_token') != preview['preview_token']:
            raise ConflictException(message="Billing inputs changed or have not been reviewed. Preview again before publishing.", code="BILL_PREVIEW_CHANGED")
        if period is None:
            period = BillingPeriod(id=uuid.uuid4(), month=month, year=year)
            self.session.add(period)
        now = now_ist()
        period.revision = preview['revision']
        period.is_published = True
        period.published_at = now
        period.published_by = actor_id
        period.unpublish_reason = None
        for key, value in preview['figures'].items():
            setattr(period, key, Decimal(value))
        period.chargeable_days = preview['chargeable_days']
        period.actual_food_cost = Decimal(preview['actual_food_cost'])
        period.grand_total_expense = Decimal(preview['grand_total_expense'])
        period.mess_daily_rate = Decimal(preview['mess_daily_rate'])
        period.calculation = {k: v for k, v in preview.items() if k != 'students'}
        await self.session.flush()
        for student in preview['students']:
            payload = {**student, 'revision': period.revision, 'published_at': now.isoformat()}
            self.session.add(StudentBillSnapshot(period_id=period.id,
                student_id=uuid.UUID(student['student_id']), revision=period.revision, payload=payload))
        await self.audit_repo.log(actor_id=actor_id, action="BILL_PUBLISHED",
            target_type="billing_period", target_id=period.id,
            metadata={**period.calculation, 'students_billed': len(preview['students'])})
        await self.session.commit()
        return {**period.calculation, 'is_published': True, 'is_stocks_read_only': True,
                'published_at': now.isoformat()}

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

        await self._lock_period(month, year)
        period = await self.get_period(month, year)
        if period is None or not period.is_published:
            raise ConflictException(
                message=f"Billing for {month:02d}/{year} is not published.",
                code="BILL_NOT_PUBLISHED",
            )

        from app.models.operations import PaymentSubmission
        payment_statuses = (await self.session.execute(select(PaymentSubmission.status).where(
            PaymentSubmission.period_id == period.id,
            PaymentSubmission.bill_revision == period.revision,
            PaymentSubmission.status.in_(["PENDING", "VERIFIED"]),
        ).limit(1))).scalar_one_or_none()
        if payment_statuses:
            raise ConflictException(
                message="Resolve pending payments before reopening. A verified payment requires a separate refund/correction process.",
                code="BILL_HAS_ACTIVE_PAYMENTS",
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
        await self._lock_period(month, year)

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
