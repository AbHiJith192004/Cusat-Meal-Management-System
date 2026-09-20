from pydantic import BaseModel, Field
from typing import Optional, Literal


class CreateStudentRequest(BaseModel):
    """Request to create a new student account."""
    name: str = Field(..., min_length=1, max_length=255)
    registration_number: str = Field(..., min_length=1, max_length=50)
    date_of_birth: str = Field(..., description="Date of birth in YYYY-MM-DD format")
    department: Optional[str] = Field(default="Computer Science", max_length=100)
    mess_id: Optional[str] = Field(default=None, max_length=50)
    student_type: Literal["HOSTELLER", "DAY_SCHOLAR", "OUTMESS"] = "HOSTELLER"
    campus_location: Optional[str] = Field(default="MAIN_CAMPUS", description="MAIN_CAMPUS or LAKESIDE_CAMPUS")
