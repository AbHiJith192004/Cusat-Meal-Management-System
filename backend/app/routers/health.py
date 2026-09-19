import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import success_response
from app.utils.timezone import now_ist

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health/live")
async def liveness_check():
    """Is this process alive? Deliberately touches nothing else.

    The platform RESTARTS a container whose liveness probe fails, so this
    probe must never depend on the database. It used to: /health below was
    wired to both probes, and it answers 503 when Postgres is unreachable.
    A brief database blip -- a failover, a connection-ceiling spike -- would
    therefore kill every web container, which cannot help the database and
    makes things worse, because the restarted containers all reconnect at
    once against the very pool that was already saturated.

    Readiness is what should react to a sick database: /health still does
    that, and the platform withholds traffic instead of killing the process.
    """
    return success_response(data={"status": "alive", "timestamp": now_ist().isoformat()})


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db, scope="function")):
    """Readiness: can this instance actually serve requests?

    Answers 503 while the database is unreachable so the load balancer takes
    this instance out of rotation. Wire this to readiness ONLY -- see above.
    """
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
