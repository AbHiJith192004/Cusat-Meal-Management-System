import logging
from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine_kwargs = {
    "echo": settings.is_development,
    "pool_pre_ping": True,
}
if not is_sqlite:
    engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_recycle": 300,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "connect_args": {"command_timeout": settings.DB_COMMAND_TIMEOUT},
    })

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Commit mutations before HTTP success; discard all read-side changes.

    All consumers MUST use Depends(get_db, scope="function") so failures
    during commit can still produce an error response.
    """
    async with async_session_factory() as session:
        try:
            yield session
            if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                await session.commit()
            else:
                await session.rollback()
        except BaseException:
            await session.rollback()
            raise


async def init_db() -> None:
    """Check connectivity. Schema changes belong to the pre-deploy migration.

    Startup never creates accounts, resets passwords, or changes settings.
    Development demo data requires an explicit script invocation.
    """
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    logger.info("Database connection pool initialized")


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
    logger.info("Database connection pool closed")
