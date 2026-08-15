import logging
import sys
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI

from app.config import get_settings
from app.database import init_db, close_db
from app.middleware.cors import setup_cors
from app.middleware.error_handler import register_exception_handlers
from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.routers import health, auth, student, meals, attendance, admin, notifications, super_admin

def configure_logging() -> None:
    """Configure structured logging."""
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
        stream=sys.stdout,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.info("Starting CUSAT Mess Management API")
    await init_db()
    yield
    await close_db()
    logger.info("CUSAT Mess Management API shut down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title="CUSAT Mess Management API",
        description="Backend API for CUSAT Boys Hostel Mess Management System",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    
    # Register exception handlers
    register_exception_handlers(app)
    
    # Setup CORS
    setup_cors(app)
    
    # Add request logging middleware
    app.add_middleware(RequestLoggingMiddleware)
    
    # Include routers
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(student.router)
    app.include_router(meals.router)
    app.include_router(attendance.router)
    app.include_router(admin.router)
    app.include_router(notifications.router)
    app.include_router(super_admin.router)

    from fastapi.responses import RedirectResponse

    @app.get("/", include_in_schema=False)
    async def root_redirect():
        """Redirect root URL to interactive Swagger UI documentation."""
        return RedirectResponse(url="/docs")
    
    return app


# Module-level app instance for uvicorn
app = create_app()
