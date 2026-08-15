import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any

import jwt

from app.config import get_settings
from app.utils.timezone import now_ist, IST
from app.utils.exceptions import UnauthorizedException, QRExpiredException, QRInvalidException

settings = get_settings()


def create_access_token(user_id: str, role: str, extra_claims: dict | None = None) -> str:
    """Create a short-lived JWT access token.
    
    Contains: sub (user_id), role, iat, exp, jti
    """
    now = now_ist()
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token.
    
    Raises UnauthorizedException if the token is invalid or expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "role", "exp", "iat", "jti", "type"]},
        )
        if payload.get("type") != "access":
            raise UnauthorizedException(message="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise UnauthorizedException(message="Token has expired", code="TOKEN_EXPIRED")
    except jwt.InvalidTokenError as e:
        raise UnauthorizedException(message=f"Invalid token: {str(e)}")


def generate_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for database storage using SHA-256."""
    return hashlib.sha256(token.encode()).hexdigest()


def get_refresh_token_expiry() -> datetime:
    """Get the expiry datetime for a new refresh token."""
    return now_ist() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
