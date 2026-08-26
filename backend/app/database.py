import logging
from collections.abc import AsyncGenerator

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
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 300,
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


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database: create tables and seed demo data if needed."""
    import app.models  # Ensures all ORM models are registered in Base.metadata
    from app.models.base import Base
    
    # Create all tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)

        def add_missing_columns(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if inspector.has_table("student_profiles"):
                existing_cols = {c["name"] for c in inspector.get_columns("student_profiles")}
                if "department" not in existing_cols:
                    logger.info("Adding missing column 'department' to student_profiles")
                    sync_conn.execute(text("ALTER TABLE student_profiles ADD COLUMN department VARCHAR(100) DEFAULT 'Computer Science'"))
                    try:
                        sync_conn.commit()
                    except Exception:
                        pass
                if "campus_location" not in existing_cols:
                    logger.info("Adding missing column 'campus_location' to student_profiles")
                    sync_conn.execute(text("ALTER TABLE student_profiles ADD COLUMN campus_location VARCHAR(50) DEFAULT 'MAIN_CAMPUS'"))
                    try:
                        sync_conn.commit()
                    except Exception:
                        pass

        await conn.run_sync(add_missing_columns)

    logger.info("Database tables and columns ensured")
    
    # Auto-seed demo accounts on startup
    try:
        from app.seeder import seed_data
        await seed_data()
        logger.info("Database seed check completed")
    except Exception as e:
        logger.error("Seed script failed: %s", str(e), exc_info=True)
    
    logger.info("Database connection pool initialized")


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
    logger.info("Database connection pool closed")
