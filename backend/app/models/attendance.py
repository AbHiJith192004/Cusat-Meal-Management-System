import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Attendance(Base):
    __tablename__ = "attendance"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    meal_date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    attendance_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now())
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)

    __table_args__ = (
        sa.UniqueConstraint("student_id", "meal_date", "meal_type", name="uq_attendance"),
        sa.Index("ix_attendance_date", "meal_date"),
        # Matches the (student, date, meal) lookup used by QR verification
        # and fine reconciliation.
        sa.Index("ix_attendance_student_date_type", "student_id", "meal_date", "meal_type"),
    )

    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    recorder: Mapped["User"] = relationship("User", foreign_keys=[recorded_by])
