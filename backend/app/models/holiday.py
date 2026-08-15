import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    holiday_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    meal_type: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    reason: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now())

    __table_args__ = (
        sa.Index("uq_holiday_whole_day", "holiday_date", unique=True, postgresql_where=sa.text("meal_type IS NULL")),
        sa.UniqueConstraint("holiday_date", "meal_type", name="uq_holiday_per_meal"),
    )

    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
