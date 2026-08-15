import math
from dataclasses import dataclass
from typing import Any

from fastapi import Query


@dataclass
class PaginationParams:
    """Pagination parameters extracted from query string."""
    page: int = 1
    per_page: int = 20
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page
    
    @property
    def limit(self) -> int:
        return self.per_page


def get_pagination(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
) -> PaginationParams:
    """FastAPI dependency for pagination parameters."""
    return PaginationParams(page=page, per_page=per_page)


def create_pagination_meta(
    total: int,
    params: PaginationParams,
) -> dict[str, Any]:
    """Create pagination metadata for API response."""
    return {
        "page": params.page,
        "per_page": params.per_page,
        "total": total,
        "total_pages": math.ceil(total / params.per_page) if params.per_page > 0 else 0,
    }
