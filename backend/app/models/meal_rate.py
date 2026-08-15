import uuid
from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DailyMealRate(Base, TimestampMixin):
    __tablename__ = "daily_meal_rates"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rate_date: Mapped[date] = mapped_column(sa.Date, unique=True, nullable=False, index=True)
    breakfast_rate: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), default=Decimal("30.00"), nullable=False)
    lunch_rate: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), default=Decimal("50.00"), nullable=False)
    dinner_rate: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), default=Decimal("40.00"), nullable=False)
    notes: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)

    @property
    def daily_total(self) -> Decimal:
        return self.breakfast_rate + self.lunch_rate + self.dinner_rate
