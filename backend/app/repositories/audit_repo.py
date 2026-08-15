import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


class AuditRepository:
    """Repository for audit log operations. APPEND-ONLY — no update or delete."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def log(
        self,
        actor_id: uuid.UUID | None,
        action: str,
        target_type: str | None = None,
        target_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        entry = AuditLog(
            id=uuid.uuid4(),
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata_=metadata,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry
