from typing import Any, Generic, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """Error detail in API response."""
    code: str
    message: str
    details: Any | None = None


class PaginationMeta(BaseModel):
    """Pagination metadata."""
    page: int
    per_page: int
    total: int
    total_pages: int


class APIResponse(BaseModel, Generic[T]):
    """Standard API response envelope."""
    success: bool
    data: T | None = None
    error: ErrorDetail | None = None
    meta: PaginationMeta | None = None
    
    model_config = ConfigDict(from_attributes=True)


def success_response(
    data: Any = None,
    meta: dict | None = None,
) -> dict:
    """Create a success response dict."""
    response = {"success": True, "data": data}
    if meta:
        response["meta"] = meta
    return response


def error_response(
    code: str,
    message: str,
    details: Any = None,
) -> dict:
    """Create an error response dict."""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
    }
