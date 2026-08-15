import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings
from app.database import get_db
from app.main import create_app
from app.models import Base
from app.models.user import User
from app.models.student import StudentProfile
from app.utils.enums import Role, AccountStatus, StudentType


settings = get_settings()

# Use test database
test_engine = create_async_engine(
    settings.TEST_DATABASE_URL or settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)
test_session_factory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def setup_test_db():
    """Create all tables at session start, drop at end (if DB is reachable)."""
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    except Exception as e:
        # If DB connection fails, yield gracefully for tests that don't need DB
        yield
    finally:
        await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test database session."""
    async with test_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client."""
    app = create_app()
    
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def test_student_user(db_session: AsyncSession) -> User:
    """Create a test student user (PENDING status, not yet activated)."""
    user = User(
        id=uuid.uuid4(),
        registration_number="TEST001",
        name="Test Student",
        role=Role.STUDENT.value,
        account_status=AccountStatus.PENDING.value,
    )
    profile = StudentProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        date_of_birth=date(2000, 1, 15),
        student_type=StudentType.HOSTELLER.value,
    )
    db_session.add(user)
    db_session.add(profile)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def test_admin_user(db_session: AsyncSession) -> User:
    """Create a test admin user."""
    user = User(
        id=uuid.uuid4(),
        registration_number="ADMIN001",
        name="Test Admin",
        role=Role.ADMIN.value,
        account_status=AccountStatus.ACTIVE.value,
        password_hash="placeholder_will_be_set_in_auth_tests",
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def test_super_admin_user(db_session: AsyncSession) -> User:
    """Create a test super admin user."""
    user = User(
        id=uuid.uuid4(),
        registration_number="SADMIN001",
        name="Test Super Admin",
        role=Role.SUPER_ADMIN.value,
        account_status=AccountStatus.ACTIVE.value,
        password_hash="placeholder_will_be_set_in_auth_tests",
    )
    db_session.add(user)
    await db_session.flush()
    return user
