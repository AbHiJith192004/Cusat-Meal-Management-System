from pydantic import BaseModel, Field


class ActivateRequest(BaseModel):
    registration_number: str = Field(min_length=1, max_length=50)
    setup_code: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=12, max_length=128)


class ActivateWithDobRequest(BaseModel):
    registration_number: str = Field(min_length=1, max_length=50)
    # Text, not date, so the browser's own format and a typed 19/04/2001 both
    # reach the same parser the importer uses. Rejecting a real student over
    # a separator would send them to the mess office for nothing.
    date_of_birth: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    """Request body for login."""
    registration_number: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


