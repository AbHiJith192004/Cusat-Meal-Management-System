import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.utils.enums import FineStatus


class Fine(Base):
    __tablename__ = "fines"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), nullable=False, default=Decimal('30.00'))
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, default=FineStatus.PENDING.value)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now())
    waived_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    waived_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    waiver_reason: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)

    __table_args__ = (
        sa.UniqueConstraint("student_id", "meal_date", "meal_type", name="uq_fine"),
        sa.Index("ix_fine_status", "status", "student_id"),
        sa.CheckConstraint(
            "(status != 'WAIVED') OR (waived_at IS NOT NULL AND waived_by IS NOT NULL AND waiver_reason IS NOT NULL)",
            name="chk_fine_waiver"
        ),
    )

    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    waiver_admin: Mapped["User"] = relationship("User", foreign_keys=[waived_by])
