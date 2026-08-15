import uuid
from datetime import datetime
from typing import Any, Dict

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    """APPEND-ONLY table for system audit logs."""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(sa.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    target_type: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(sa.UUID(as_uuid=True), nullable=True)
    metadata_: Mapped[Dict[str, Any] | None] = mapped_column("metadata", sa.JSON().with_variant(JSONB, "postgresql"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), server_default=sa.func.now())

    __table_args__ = (
        sa.Index("ix_audit_actor", "actor_id", "created_at"),
        sa.Index("ix_audit_target", "target_type", "target_id"),
    )
