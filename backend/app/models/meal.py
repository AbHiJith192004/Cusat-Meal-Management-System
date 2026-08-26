import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.utils.enums import MealStatus


class MealSelection(Base):
    __tablename__ = "meal_selections"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default=MealStatus.CONFIRMED.value)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        sa.UniqueConstraint("student_id", "meal_date", "meal_type", name="uq_meal_selection"),
        sa.Index("ix_meal_date", "meal_date"),
        # Every hot-path lookup filters on all three together
        # (meal_service, qr_service, fine_service), not on meal_date alone.
        sa.Index("ix_meal_student_date_type", "student_id", "meal_date", "meal_type"),
    )

    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
