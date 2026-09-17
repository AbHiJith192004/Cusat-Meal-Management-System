from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.user import User

import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.utils.enums import StudentType


class StudentProfile(Base, TimestampMixin):
    __tablename__ = "student_profiles"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    mess_id: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(sa.Date, nullable=False)
    department: Mapped[str | None] = mapped_column(sa.String(100), nullable=True, default="Computer Science")
    student_type: Mapped[str] = mapped_column(sa.String(20), nullable=False, default=StudentType.HOSTELLER.value)
    campus_location: Mapped[str] = mapped_column(sa.String(50), nullable=False, default="MAIN_CAMPUS")
    photo_url: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)
    course: Mapped[str | None] = mapped_column(sa.String(150), nullable=True)
    hostel_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    # Text, not an integer: real room numbers include a block letter, e.g.
    # 29B or 58 A. Nullable because a student who does not live in a hostel
    # has none.
    room_number: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    # When the student agreed to their details being used. Null means no
    # consent has been recorded, which is not the same as refusing.
    consent_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="profile")
