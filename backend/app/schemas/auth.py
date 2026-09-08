from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from uuid import UUID


class ActivateRequest(BaseModel):
    registration_number: str = Field(min_length=1, max_length=50)
    setup_code: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    """Request body for login."""
    registration_number: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """Response with access token (refresh token goes in HttpOnly cookie)."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token expiry in seconds")


class UserResponse(BaseModel):
    """Public user info returned by /me."""
    id: UUID
    registration_number: str
    name: str
    role: str
    account_status: str
    activated_at: datetime | None = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserProfileResponse(BaseModel):
    """User info with student profile."""
    id: UUID
    registration_number: str
    name: str
    role: str
    account_status: str
    activated_at: datetime | None = None
    profile: "StudentProfileResponse | None" = None
    
    model_config = ConfigDict(from_attributes=True)


class StudentProfileResponse(BaseModel):
    """Student profile details."""
    id: UUID
    mess_id: str | None = None
    date_of_birth: str  # We'll convert date to string
    student_type: str
    photo_url: str | None = None
    
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
