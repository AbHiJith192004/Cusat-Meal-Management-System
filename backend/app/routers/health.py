import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import success_response
from app.utils.timezone import now_ist

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Check API and database health."""
    db_status = "connected"
    status = "healthy"
    http_status = 200

    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("Database health check failed: %s", str(e))
        db_status = "disconnected"
        status = "unhealthy"
        http_status = 503

    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=http_status,
        content=success_response(
            data={
                "status": status,
                "database": db_status,
                "timestamp": now_ist().isoformat(),
            }
        ),
    )
