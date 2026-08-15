from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from uuid import UUID
from typing import Optional


class UserBriefResponse(BaseModel):
    """Brief user info for lists."""
    id: UUID
    registration_number: str
    name: str
    role: str
    account_status: str
    
    model_config = ConfigDict(from_attributes=True)


class CreateStudentRequest(BaseModel):
    """Request to create a new student account."""
    name: str = Field(..., min_length=1, max_length=255)
    registration_number: str = Field(..., min_length=1, max_length=50)
    date_of_birth: str = Field(..., description="Date of birth in YYYY-MM-DD format")
    department: Optional[str] = Field(default="Computer Science", max_length=100)
    mess_id: Optional[str] = Field(default=None, max_length=50)
    student_type: str = Field(default="HOSTELLER", description="Always HOSTELLER for CUSAT Boys Hostel")
    campus_location: Optional[str] = Field(default="MAIN_CAMPUS", description="MAIN_CAMPUS or LAKESIDE_CAMPUS")
