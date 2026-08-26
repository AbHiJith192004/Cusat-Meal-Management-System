import logging
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.security.jwt_handler import decode_access_token
from app.utils.enums import Role, AccountStatus
from app.utils.exceptions import (
    UnauthorizedException,
    ForbiddenException,
    AccountSuspendedException,
)

logger = logging.getLogger(__name__)

# HTTPBearer extracts the token from Authorization: Bearer <token>
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the JWT access token.

    Raises:
        UnauthorizedException: If no token, invalid token, or user not found.
        AccountSuspendedException: If the user's account is suspended.
    """
    # Bearer header only. A ?token= fallback used to exist for file downloads;
    # tokens in URLs end up in browser history and proxy access logs, and the
    # download path now sends a real Authorization header instead.
    token = credentials.credentials if credentials else None

    if not token:
        raise UnauthorizedException(message="Authentication required")

    payload = decode_access_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise UnauthorizedException(message="Invalid token payload")

    stmt = select(User).where(User.id == UUID(user_id))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedException(message="User not found")

    if user.account_status == AccountStatus.SUSPENDED.value:
        raise AccountSuspendedException()

    return user


def require_role(*roles: Role):
    """Create a dependency that requires the current user to have one of the specified roles.

    Usage:
        @router.get("/admin/dashboard", dependencies=[Depends(require_role(Role.ADMIN, Role.SUPER_ADMIN))])
    Or:
        async def endpoint(user: User = Depends(require_role(Role.ADMIN))):
    """
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        user_role = current_user.role
        allowed_roles = [r.value for r in roles]

        if user_role not in allowed_roles:
            logger.warning(
                "RBAC denied: user %s (role=%s) attempted access requiring %s",
                current_user.id,
                user_role,
                allowed_roles,
            )
            raise ForbiddenException(
                message=f"This action requires one of these roles: {', '.join(allowed_roles)}"
            )
        return current_user

    return role_checker


# Convenience type aliases for common patterns
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_role(Role.ADMIN, Role.SUPER_ADMIN))]
SuperAdminUser = Annotated[User, Depends(require_role(Role.SUPER_ADMIN))]
