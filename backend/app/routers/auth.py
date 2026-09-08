import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    ActivateRequest,
    LoginRequest,
    TokenResponse,
    MessageResponse,
)
from app.schemas.common import success_response
from app.config import get_settings
from app.services.auth_service import AuthService
from app.security.rate_limiter import (
    check_shared_rate_limit,
    RateLimitConfig,
    get_client_ip,
    LOGIN_RATE_LIMIT,
    ACTIVATION_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Write the refresh cookie with flags derived from the environment.

    `secure` was previously hardcoded False with a "set True in production"
    comment, which meant it shipped unset everywhere. It now follows APP_ENV,
    so any non-development deployment refuses to send the cookie over plain
    HTTP. That only helps behind TLS - see the deployment notes.
    """
    settings = get_settings()
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.cookies_require_https,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/api/v1/auth",
    )


@router.post("/activate", response_model=None)
async def activate_account(
    request: Request,
    body: ActivateRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Set a password using an expiring code issued after staff identity verification."""
    client_ip = get_client_ip(request)
    await check_shared_rate_limit(f"activate:{client_ip}", ACTIVATION_RATE_LIMIT)
    await check_shared_rate_limit(f"setup-account:{body.registration_number.strip().upper()}", RateLimitConfig(5, 900))
    result = await AuthService(db).set_password_with_code(
        body.registration_number, body.setup_code, body.password,
    )
    return success_response(data=result)


@router.post("/login", response_model=None)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Authenticate and receive tokens.

    Returns access_token in response body.
    Sets refresh_token as HttpOnly cookie.
    """
    client_ip = get_client_ip(request)
    await check_shared_rate_limit(f"login:{client_ip}", RateLimitConfig(300, 60))

    await check_shared_rate_limit(f"login-account:{body.registration_number.strip().upper()}", RateLimitConfig(10, 900))
    service = AuthService(db)
    access_token, refresh_token, expires_in = await service.login(
        registration_number=body.registration_number,
        password=body.password,
    )

    _set_refresh_cookie(response, refresh_token)

    return success_response(
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": expires_in,
        }
    )


@router.post("/refresh", response_model=None)
async def refresh_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Refresh access token using the refresh token cookie.

    Implements token rotation: old refresh token is revoked, new one issued.
    """
    client_ip = get_client_ip(request)
    await check_shared_rate_limit(f"refresh:{client_ip}", RateLimitConfig(600, 60))

    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        from app.utils.exceptions import UnauthorizedException
        raise UnauthorizedException(message="No refresh token provided")

    service = AuthService(db)
    access_token, new_refresh, expires_in = await service.refresh_tokens(refresh_token)

    _set_refresh_cookie(response, new_refresh)

    return success_response(
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": expires_in,
        }
    )


@router.post("/logout", response_model=None)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db, scope="function"),
):
    """Logout: revoke refresh token and clear cookie."""
    refresh_token = request.cookies.get("refresh_token")

    if refresh_token:
        service = AuthService(db)
        await service.logout(refresh_token)

    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth",
    )

    return success_response(data={"message": "Logged out successfully"})
