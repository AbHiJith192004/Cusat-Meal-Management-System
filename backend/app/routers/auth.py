import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    ActivateRequest,
    LoginRequest,
    ResetPasswordDobRequest,
    TokenResponse,
    MessageResponse,
)
from app.schemas.common import success_response
from app.services.auth_service import AuthService
from app.security.rate_limiter import (
    rate_limiter,
    get_client_ip,
    LOGIN_RATE_LIMIT,
    ACTIVATION_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/activate", response_model=None)
async def activate_account(
    request: Request,
    body: ActivateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Activate a pre-imported student account.
    
    Requires: registration_number, date_of_birth, password.
    Only PENDING accounts can be activated. DOB is verified against stored records.
    """
    client_ip = get_client_ip(request)
    rate_limiter.check_rate_limit(f"activate:{client_ip}", ACTIVATION_RATE_LIMIT)
    
    service = AuthService(db)
    result = await service.activate_account(
        registration_number=body.registration_number,
        date_of_birth=body.date_of_birth,
        password=body.password,
    )
    return success_response(data=result)


@router.post("/reset-password-dob", response_model=None)
async def reset_password_dob(
    request: Request,
    body: ResetPasswordDobRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset password by verifying Date of Birth against stored student records."""
    client_ip = get_client_ip(request)
    rate_limiter.check_rate_limit(f"reset_dob:{client_ip}", ACTIVATION_RATE_LIMIT)
    
    service = AuthService(db)
    result = await service.reset_password_by_dob(
        registration_number=body.registration_number,
        date_of_birth=body.date_of_birth,
        new_password=body.new_password,
    )
    return success_response(data=result)


@router.post("/login", response_model=None)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and receive tokens.
    
    Returns access_token in response body.
    Sets refresh_token as HttpOnly cookie.
    """
    client_ip = get_client_ip(request)
    rate_limiter.check_rate_limit(f"login:{client_ip}", LOGIN_RATE_LIMIT)
    
    service = AuthService(db)
    access_token, refresh_token, expires_in = await service.login(
        registration_number=body.registration_number,
        password=body.password,
    )
    
    # Set refresh token as HttpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set True in production (HTTPS)
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days
        path="/api/v1/auth",
    )
    
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
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using the refresh token cookie.
    
    Implements token rotation: old refresh token is revoked, new one issued.
    """
    client_ip = get_client_ip(request)
    rate_limiter.check_rate_limit(f"refresh:{client_ip}", REFRESH_RATE_LIMIT)
    
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        from app.utils.exceptions import UnauthorizedException
        raise UnauthorizedException(message="No refresh token provided")
    
    service = AuthService(db)
    access_token, new_refresh, expires_in = await service.refresh_tokens(refresh_token)
    
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/v1/auth",
    )
    
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
    db: AsyncSession = Depends(get_db),
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
