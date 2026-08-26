import uuid
from datetime import datetime

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User, RefreshToken
from app.models.student import StudentProfile
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User model operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_registration_number(self, reg_no: str) -> User | None:
        """Find a user by registration number."""
        stmt = (
            select(User)
            .where(User.registration_number == reg_no)
            .options(selectinload(User.profile))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_with_profile(self, user_id: uuid.UUID) -> User | None:
        """Get user with their student profile loaded."""
        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.profile))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    """Repository for RefreshToken operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(RefreshToken, session)

    async def get_by_token_hash(self, token_hash: str) -> RefreshToken | None:
        """Find a refresh token by its hash."""
        stmt = select(RefreshToken).where(
            and_(
                RefreshToken.token_hash == token_hash,
                RefreshToken.is_revoked == False,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def purge_expired(self, keep_revoked_for_days: int = 7) -> int:
        """Delete refresh tokens that can no longer be used.

        The table grows by one row per login and per refresh and nothing ever
        removed them. Revoked rows are kept briefly so a token-reuse
        investigation still has a trail, then dropped.
        """
        from datetime import timedelta
        from sqlalchemy import delete, or_

        from app.utils.timezone import now_ist

        now = now_ist()
        cutoff = now - timedelta(days=keep_revoked_for_days)

        stmt = delete(RefreshToken).where(
            or_(
                RefreshToken.expires_at < now,
                and_(RefreshToken.is_revoked == True, RefreshToken.created_at < cutoff),
            )
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount or 0

    async def revoke_all_user_tokens(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for a user (used on password change, suspicious activity)."""
        stmt = (
            select(RefreshToken)
            .where(
                and_(
                    RefreshToken.user_id == user_id,
                    RefreshToken.is_revoked == False,
                )
            )
        )
        result = await self.session.execute(stmt)
        tokens = result.scalars().all()
        for token in tokens:
            token.is_revoked = True
        await self.session.flush()
