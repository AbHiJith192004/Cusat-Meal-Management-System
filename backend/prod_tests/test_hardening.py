"""Integration regressions against a dedicated, migrated PostgreSQL test database.

These tests use real HTTP handlers, dependencies, commits, and separate sessions.
They only create randomly named synthetic records and never drop application data.
"""
import asyncio
import uuid
from datetime import date, timedelta

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func, event

from app.main import create_app
from app.database import async_session_factory, engine, init_db
from app.models.user import User
from app.models.meal import MealSelection
from app.models.attendance import Attendance
from app.security.jwt_handler import create_access_token
from app.services.auth_service import AuthService
from app.services.qr_service import QRService
from app.services.meal_timing_service import MealTimingService
from app.security.rate_limiter import check_shared_rate_limit, RateLimitConfig, get_client_ip
from app.config import get_settings
from app.config import Settings
from app.utils.timezone import now_ist
from app.utils.exceptions import RateLimitExceededException


@pytest_asyncio.fixture
async def client():
    # Fail closed if someone tries running the integration suite on production.
    cfg = get_settings()
    from sqlalchemy.engine import make_url
    url = make_url(cfg.DATABASE_URL)
    assert url.host in {'127.0.0.1', 'localhost'} and url.database.endswith('_test'), 'Dedicated local test DB required'
    async with AsyncClient(transport=ASGITransport(app=create_app(), raise_app_exceptions=False), base_url='https://testserver') as client:
        yield client
    await engine.dispose()


async def user(role='STUDENT'):
    async with async_session_factory() as db:
        obj = User(id=uuid.uuid4(), registration_number='HARDEN-' + uuid.uuid4().hex[:16].upper(),
                   name='Synthetic regression user', role=role, account_status='ACTIVE')
        db.add(obj)
        await db.commit()
        return obj


def headers(obj):
    return {'Authorization': 'Bearer ' + create_access_token(str(obj.id), obj.role, {'sv': obj.session_version})}


@pytest.mark.asyncio
async def test_calendar_read_only_and_atomic_day_persistence(client):
    student = await user()
    day = (now_ist().date() + timedelta(days=8)).isoformat()
    async with async_session_factory() as db:
        before = await db.scalar(select(func.count()).select_from(MealSelection))
    statements = []
    def count(*args): statements.append(args[2])
    event.listen(engine.sync_engine, 'before_cursor_execute', count)
    try:
        response = await client.get('/api/v1/meals', headers=headers(student))
    finally:
        event.remove(engine.sync_engine, 'before_cursor_execute', count)
    assert response.status_code == 200, response.text
    assert len(response.json()['data']) == 7
    assert len(statements) <= 5
    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(MealSelection)) == before
    response = await client.put(f'/api/v1/meals/{day}', json={'status': 'SKIPPED'}, headers=headers(student))
    assert response.status_code == 200, response.text
    async with async_session_factory() as db:
        selections = (await db.execute(select(MealSelection).where(MealSelection.student_id == student.id))).scalars().all()
        assert len(selections) == 3 and all(x.status == 'SKIPPED' for x in selections)
    invalid = await client.put(f'/api/v1/meals/{day}/BREAKFAST', json={'status': 'CONFIRMED'}, headers=headers(student))
    assert invalid.status_code == 422
    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(MealSelection).where(MealSelection.student_id == student.id, MealSelection.status == 'SKIPPED')) == 3
    assert (await client.get('/api/v1/meals?start_date=2026-01-01&end_date=2026-12-31', headers=headers(student))).status_code == 422


@pytest.mark.asyncio
async def test_setup_code_once_and_revokes_old_access(client):
    student, admin = await user(), await user('ADMIN')
    issued = await client.post(f'/api/v1/admin/students/{student.id}/setup-code', json={'reason': 'Identity checked in person for test'}, headers=headers(admin))
    assert issued.status_code == 200, issued.text
    body = {'registration_number': student.registration_number, 'setup_code': issued.json()['data']['setup_code'], 'password': 'Synthetic-Test-Passphrase-2026'}
    assert (await client.post('/api/v1/auth/activate', json=body)).status_code == 200
    assert (await client.get('/api/v1/me', headers=headers(student))).status_code == 401
    assert (await client.post('/api/v1/auth/activate', json=body)).status_code == 401
    assert (await client.post('/api/v1/auth/reset-password-dob', json={})).status_code == 404
    response = await client.post('/api/v1/auth/login', json={'registration_number': student.registration_number, 'password': body['password']})
    assert response.status_code == 200, response.text
    assert 'Secure' in response.headers['set-cookie'] and 'HttpOnly' in response.headers['set-cookie']


@pytest.mark.asyncio
async def test_refresh_only_one_concurrent_rotation(client):
    student = await user()
    async with async_session_factory() as db:
        from app.models.user import RefreshToken
        from app.security.jwt_handler import hash_refresh_token
        raw = uuid.uuid4().hex
        db.add(RefreshToken(user_id=student.id, token_hash=hash_refresh_token(raw), expires_at=now_ist()+timedelta(days=1)))
        await db.commit()
    async def rotate():
        return await client.post('/api/v1/auth/refresh', headers={'Cookie': f'refresh_token={raw}'})
    responses = await asyncio.gather(rotate(), rotate())
    assert sorted(r.status_code for r in responses) == [200, 401]


@pytest.mark.asyncio
async def test_qr_admin_binding_expiry_and_concurrent_confirm(client, monkeypatch):
    async def open_window(*args, **kwargs): return True
    monkeypatch.setattr(MealTimingService, 'is_within_meal_window', open_window)
    student, admin, other = await user(), await user('ADMIN'), await user('ADMIN')
    async with async_session_factory() as db:
        token, _, _ = await QRService(db).generate_qr_token(student.id, 'LUNCH')
    verified = await client.post('/api/v1/attendance/verify', json={'qr_token': token}, headers=headers(admin))
    assert verified.status_code == 200, verified.text
    ticket = verified.json()['data']['verification_id']
    assert (await client.post('/api/v1/attendance/confirm', json={'verification_id': ticket}, headers=headers(other))).status_code == 401
    claims = jwt.decode(ticket, get_settings().QR_SECRET_KEY, algorithms=['HS256'])
    expired = jwt.encode({**claims, 'exp': int(now_ist().timestamp())-1}, get_settings().QR_SECRET_KEY, algorithm='HS256')
    assert (await client.post('/api/v1/attendance/confirm', json={'verification_id': expired}, headers=headers(admin))).status_code != 200
    async def confirm():
        return await client.post('/api/v1/attendance/confirm', json={'verification_id': ticket}, headers=headers(admin))
    responses = await asyncio.gather(confirm(), confirm())
    assert sorted(r.status_code for r in responses) == [200, 409], [r.text for r in responses]
    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Attendance).where(Attendance.student_id == student.id)) == 1


@pytest.mark.asyncio
async def test_startup_does_not_seed_or_change_users(client):
    async with async_session_factory() as db:
        before = list((await db.execute(select(User.id, User.password_hash, User.updated_at))).all())
    await init_db()
    async with async_session_factory() as db:
        after = list((await db.execute(select(User.id, User.password_hash, User.updated_at))).all())
    assert sorted(before) == sorted(after)


@pytest.mark.asyncio
async def test_shared_rate_limit_atomic(client, monkeypatch):
    key = 'regression:' + uuid.uuid4().hex
    async def attempt():
        try:
            await check_shared_rate_limit(key, RateLimitConfig(3, 60))
            return True
        except RateLimitExceededException:
            return False
    assert sum(await asyncio.gather(*(attempt() for _ in range(8)))) == 3
    from starlette.requests import Request
    request = Request({'type': 'http', 'client': ('127.0.0.1', 1), 'headers': [(b'x-forwarded-for', b'203.0.113.1')]})
    assert get_client_ip(request) == '127.0.0.1'
    monkeypatch.setattr(get_settings(), 'TRUST_PROXY_HEADERS', True)
    assert get_client_ip(request) == '203.0.113.1'
    malformed = Request({'type': 'http', 'client': ('127.0.0.2', 1), 'headers': [(b'x-forwarded-for', b'not-an-ip')]})
    assert get_client_ip(malformed) == '127.0.0.2'


def test_digitalocean_database_url_is_asyncpg_compatible():
    cfg = Settings(
        DATABASE_URL='postgresql://doadmin:secret@private-db:25060/defaultdb?sslmode=require',
        JWT_SECRET_KEY='j' * 32,
        QR_SECRET_KEY='q' * 32,
    )
    assert cfg.DATABASE_URL == 'postgresql+asyncpg://doadmin:secret@private-db:25060/defaultdb?ssl=require'


@pytest.mark.asyncio
async def test_commit_failure_returns_error_not_success(client):
    from fastapi import Depends
    from app.database import get_db
    from sqlalchemy.ext.asyncio import AsyncSession
    app = create_app()
    first = await user()
    @app.post('/regression/commit-failure')
    async def failing_write(db: AsyncSession = Depends(get_db, scope='function')):
        db.add(User(id=uuid.uuid4(), registration_number=first.registration_number,
                    name='Duplicate must fail', role='STUDENT', account_status='PENDING'))
        return {'success': True}
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url='https://testserver') as local:
        response = await local.post('/regression/commit-failure')
    assert response.status_code == 500
    assert 'Duplicate' not in response.text


@pytest.mark.asyncio
async def test_body_size_limit_and_sensitive_cache_headers(client):
    response = await client.post('/api/v1/auth/login', content=b'x' * 65537, headers={'Content-Type': 'application/json'})
    assert response.status_code == 413
    assert response.headers['cache-control'] == 'no-store'
    response = await client.post('/api/v1/auth/login', json={'registration_number': 'NONEXISTENT', 'password': 'test'})
    assert response.status_code == 401
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-frame-options'] == 'DENY'
    assert "frame-ancestors 'none'" in response.headers['content-security-policy']
    assert (await client.get('/openapi.json')).status_code == 404


@pytest.mark.asyncio
async def test_failed_login_lockout_engages_and_clears_on_success(client):
    """The per-account lockout was previously imported but never called, so a
    single account could be guessed against indefinitely. It must engage after
    AUTH_MAX_FAILED_ATTEMPTS failures and survive the rolled-back request
    transaction that each failure triggers."""
    from app.security.password import hash_password
    from app.security.rate_limiter import clear_auth_failures

    cfg = get_settings()
    student = await user()
    async with async_session_factory() as db:
        obj = await db.get(User, student.id)
        obj.password_hash = hash_password('correct-horse-battery-staple')
        obj.activated_at = now_ist()
        await db.commit()
    await clear_auth_failures(student.registration_number)

    body = {'registration_number': student.registration_number, 'password': 'wrong'}
    for _ in range(cfg.AUTH_MAX_FAILED_ATTEMPTS):
        assert (await client.post('/api/v1/auth/login', json=body)).status_code == 401

    # Further attempts are refused before any password is checked, and the
    # correct password is refused too - the lockout follows the account.
    assert (await client.post('/api/v1/auth/login', json=body)).status_code == 429
    good = {'registration_number': student.registration_number,
            'password': 'correct-horse-battery-staple'}
    assert (await client.post('/api/v1/auth/login', json=good)).status_code == 429

    await clear_auth_failures(student.registration_number)
    assert (await client.post('/api/v1/auth/login', json=good)).status_code == 200

    # A success wipes the counter, so a legitimate user is never throttled by
    # their own earlier typos.
    assert (await client.post('/api/v1/auth/login', json=body)).status_code == 401
    for _ in range(cfg.AUTH_MAX_FAILED_ATTEMPTS - 1):
        await client.post('/api/v1/auth/login', json=body)
    assert (await client.post('/api/v1/auth/login', json=good)).status_code == 429


@pytest.mark.asyncio
async def test_case_variants_share_one_lockout_bucket(client):
    """Varying the spelling of a registration number must not mint a fresh
    allowance of guesses."""
    from app.security.rate_limiter import clear_auth_failures

    cfg = get_settings()
    student = await user()
    await clear_auth_failures(student.registration_number)
    for i in range(cfg.AUTH_MAX_FAILED_ATTEMPTS):
        spelling = student.registration_number.lower() if i % 2 else student.registration_number
        assert (await client.post('/api/v1/auth/login',
                                  json={'registration_number': spelling, 'password': 'wrong'})).status_code == 401
    assert (await client.post('/api/v1/auth/login',
                              json={'registration_number': student.registration_number.lower(),
                                    'password': 'wrong'})).status_code == 429
    await clear_auth_failures(student.registration_number)
