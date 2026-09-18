"""Integration regressions against a dedicated, migrated PostgreSQL test database.

These tests use real HTTP handlers, dependencies, commits, and separate sessions.
They only create randomly named synthetic records and never drop application data.
"""
import asyncio
import uuid
from datetime import timedelta

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


@pytest.mark.asyncio
async def test_created_admin_sets_own_password_via_setup_code(client):
    """The creator must not choose another administrator's password.

    create_admin used to accept a password and mark the account ACTIVE, so the
    Super Admin knew every admin's credentials and nothing forced a change.
    The account must now arrive PENDING with no password and a single-use code
    the new administrator redeems to pick their own.
    """
    from app.security.jwt_handler import hash_refresh_token

    super_admin = await user('SUPER_ADMIN')
    reg = 'ADMNEW-' + uuid.uuid4().hex[:10].upper()

    created = await client.post('/api/v1/super-admin/admins',
                                json={'registration_number': reg, 'name': 'New warden', 'role': 'ADMIN'},
                                headers=headers(super_admin))
    # Activation is rate limited per client IP (5/min in production) and every
    # test otherwise shares one address, so this test spends its own budget
    # rather than starving the suite's other activation tests.
    assert created.status_code == 200, created.text
    body = created.json()['data']
    assert body['account_status'] == 'PENDING'
    setup_code = body['setup_code']
    assert setup_code

    # No password is set, and only the code's digest is stored.
    async with async_session_factory() as db:
        row = await db.scalar(select(User).where(User.registration_number == reg))
        assert row.password_hash is None
        assert row.setup_code_hash == hash_refresh_token(setup_code)
        assert row.setup_code_hash != setup_code

    # The new administrator chooses their own password and can then sign in.
    chosen = 'warden-picks-this-one'
    transport = ASGITransport(app=create_app(), raise_app_exceptions=False, client=('10.77.0.4', 5555))
    async with AsyncClient(transport=transport, base_url='https://testserver') as own_ip:
        activated = await own_ip.post('/api/v1/auth/activate',
                                      json={'registration_number': reg, 'setup_code': setup_code,
                                            'password': chosen})
        assert activated.status_code == 200, activated.text

        signed_in = await own_ip.post('/api/v1/auth/login',
                                      json={'registration_number': reg, 'password': chosen})
        assert signed_in.status_code == 200, signed_in.text

        # The code is single use.
        assert (await own_ip.post('/api/v1/auth/activate',
                                  json={'registration_number': reg, 'setup_code': setup_code,
                                        'password': 'a-different-password'})).status_code == 401


@pytest.mark.asyncio
async def test_single_student_creation_requires_super_admin(client):
    """Student intake runs through the Super Admin's Excel import.

    POST /admin/students was reachable by any ADMIN, which was a second and
    wider intake route than the owner's provisioning rules allow.
    """
    admin, super_admin = await user('ADMIN'), await user('SUPER_ADMIN')
    payload = lambda: {'name': 'Mid-term joiner',
                       'registration_number': 'JOIN-' + uuid.uuid4().hex[:10].upper(),
                       'date_of_birth': '2005-04-02'}

    assert (await client.post('/api/v1/admin/students', json=payload(),
                              headers=headers(admin))).status_code == 403
    allowed = await client.post('/api/v1/admin/students', json=payload(),
                                headers=headers(super_admin))
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()['data']['account_status'] == 'PENDING'


@pytest.mark.asyncio
async def test_activation_codes_are_minted_in_bulk_and_rerunning_is_safe(client):
    """Bulk activation for a whole intake, and the footgun it has to avoid.

    Minting a code overwrites the stored digest, which silently kills any
    link already sent to that student. With 135 students that is not a
    theoretical risk -- a second run to catch late imports would invalidate
    every link from the first. So a live code is skipped unless reissue is
    passed, and this test is mostly about that.
    """
    from app.security.jwt_handler import hash_refresh_token
    from app.services.auth_service import AuthService

    super_admin = await user('SUPER_ADMIN')
    tag = uuid.uuid4().hex[:8].upper()
    pending_regs = [f'ACT{tag}-{i}' for i in range(3)]
    active_reg = f'ACTIVE{tag}'

    async with async_session_factory() as db:
        for reg in pending_regs:
            db.add(User(id=uuid.uuid4(), registration_number=reg, name='Pending student',
                        role='STUDENT', account_status='PENDING'))
        # An ACTIVE student with a real password: bulk activation must not
        # hand out a credential that would overwrite it.
        db.add(User(id=uuid.uuid4(), registration_number=active_reg, name='Already active',
                    role='STUDENT', account_status='ACTIVE', password_hash='argon2-placeholder'))
        await db.commit()

    async def mint(reissue=False):
        async with async_session_factory() as db:
            result = await AuthService(db).issue_activation_codes(
                super_admin.id, 'Bulk activation for the new intake', reissue)
            await db.commit()
            return result

    first = await mint()
    minted = {r['registration_number']: r['setup_code'] for r in first['issued']}
    assert set(pending_regs) <= set(minted), f"pending students missed: {set(pending_regs) - set(minted)}"
    assert active_reg not in minted, 'an ACTIVE student was handed an activation code'

    # Every code is distinct, and only its digest reaches the database.
    ours = [minted[r] for r in pending_regs]
    assert len(set(ours)) == 3
    async with async_session_factory() as db:
        for reg in pending_regs:
            row = await db.scalar(select(User).where(User.registration_number == reg))
            assert row.setup_code_hash == hash_refresh_token(minted[reg])
            assert row.setup_code_hash != minted[reg]
            # 48 hours, not the 30 minutes of a hand-delivered code: a link
            # sent to a WhatsApp group is read hours later.
            assert (row.setup_code_expires_at - now_ist()) > timedelta(hours=24)

    # A second run must NOT invalidate the links already sent.
    second = await mint()
    reissued = {r['registration_number'] for r in second['issued']}
    skipped = {r['registration_number'] for r in second['skipped']}
    assert set(pending_regs) <= skipped, 'a second run re-minted live codes'
    assert not (set(pending_regs) & reissued)
    async with async_session_factory() as db:
        for reg in pending_regs:
            row = await db.scalar(select(User).where(User.registration_number == reg))
            assert row.setup_code_hash == hash_refresh_token(minted[reg]), \
                'the originally issued code stopped working'

    # reissue replaces them, for when the links themselves leaked.
    third = await mint(reissue=True)
    replaced = {r['registration_number']: r['setup_code'] for r in third['issued']}
    assert set(pending_regs) <= set(replaced)
    async with async_session_factory() as db:
        for reg in pending_regs:
            row = await db.scalar(select(User).where(User.registration_number == reg))
            assert row.setup_code_hash == hash_refresh_token(replaced[reg])
            assert row.setup_code_hash != hash_refresh_token(minted[reg]), \
                'reissue did not actually replace the code'

    # The minted code genuinely activates the account through the public
    # endpoint -- the whole point, and not provable from the digest alone.
    reg = pending_regs[0]
    chosen = 'student-chooses-this-one'
    done = await client.post('/api/v1/auth/activate',
                             json={'registration_number': reg, 'setup_code': replaced[reg],
                                   'password': chosen})
    assert done.status_code == 200, done.text
    async with async_session_factory() as db:
        row = await db.scalar(select(User).where(User.registration_number == reg))
        assert row.account_status == 'ACTIVE'
        assert row.password_hash is not None
        assert row.setup_code_hash is None, 'the code survived redemption and is reusable'


@pytest.mark.asyncio
async def test_dob_activation_works_once_and_can_never_reset_a_live_account(client):   # noqa: ARG001 - fixture sets up the engine
    """Activation on id + date of birth, and the boundary that makes it safe.

    Date of birth is a weak secret: on the live sheet 141 of 143 ids are 2602
    plus four digits, and a hostel-mate knows a birthday rather than guessing
    it. This route is therefore restricted to PENDING accounts. Once a student
    has a password, the same details must not move it -- that would be a
    reset, and ids plus dates of birth are explicitly not reset credentials.

    Takes its own client address. Activation is 5/minute per IP and the
    buckets live in Postgres, so they outlast a single test and even a single
    run; sharing the fixture's address makes this 429 rather than assert
    anything. Each activation test therefore owns an address. The `client`
    fixture is still requested because it is what initialises the engine.
    """
    from app.models.student import StudentProfile
    from datetime import date

    reg = 'DOB' + uuid.uuid4().hex[:10].upper()
    dob = date(2004, 4, 19)

    async with async_session_factory() as db:
        u = User(id=uuid.uuid4(), registration_number=reg, name='Pending student',
                 role='STUDENT', account_status='PENDING')
        db.add(u)
        await db.flush()
        db.add(StudentProfile(id=uuid.uuid4(), user_id=u.id, date_of_birth=dob,
                              student_type='HOSTELLER', campus_location='MAIN_CAMPUS'))
        await db.commit()
        student_id = u.id

    async with AsyncClient(transport=ASGITransport(app=create_app(), raise_app_exceptions=False,
                                                  client=('10.77.0.8', 5558)),
                           base_url='https://testserver') as own:
        async def attempt(dob_text, password='student-chosen-passphrase'):
            return await own.post('/api/v1/auth/activate-with-dob',
                                  json={'registration_number': reg,
                                        'date_of_birth': dob_text, 'password': password})

        # A wrong date is refused, and the message must not reveal whether the
        # id exists -- the ids are already easy to enumerate.
        wrong = await attempt('2004-04-20')
        assert wrong.status_code == 401, wrong.text
        missing = await own.post('/api/v1/auth/activate-with-dob',
                                 json={'registration_number': 'NOSUCHSTUDENT',
                                       'date_of_birth': '2004-04-19',
                                       'password': 'student-chosen-passphrase'})
        assert missing.status_code == 401
        assert wrong.json()['error']['message'] == missing.json()['error']['message']

        # The real date activates, accepting the separator the sheet and the
        # browser each use.
        ok = await attempt('19/04/2004')
        assert ok.status_code == 200, ok.text
        async with async_session_factory() as db:
            row = await db.scalar(select(User).where(User.id == student_id))
            assert row.account_status == 'ACTIVE'
            assert row.password_hash is not None
            assert row.activated_at is not None

        signed_in = await own.post('/api/v1/auth/login',
                                   json={'registration_number': reg,
                                         'password': 'student-chosen-passphrase'})
        assert signed_in.status_code == 200, signed_in.text

        # THE IMPORTANT ASSERTION. The same correct date must not be able to
        # replace the password now that one exists.
        again = await attempt('2004-04-19', password='attacker-chosen-passphrase')
        assert again.status_code == 401, 'date of birth reset a live account'
        still_theirs = await own.post('/api/v1/auth/login',
                                      json={'registration_number': reg,
                                            'password': 'student-chosen-passphrase'})
        assert still_theirs.status_code == 200, 'the original password stopped working'


@pytest.mark.asyncio
async def test_dob_activation_spends_an_outstanding_setup_code(client):   # noqa: ARG001 - fixture sets up the engine
    """A code issued before the student self-activated must not stay usable.

    Uses its own client address rather than the shared `client` fixture:
    activation is capped at 5/minute per IP, and the test above spends that
    budget, so sharing one address makes this fail with 429 instead of
    testing anything. Worth noting that this is the same reason students on
    one campus NAT address throttle each other on activation day.
    """
    from app.models.student import StudentProfile
    from app.services.auth_service import AuthService
    from datetime import date

    reg = 'DOBC' + uuid.uuid4().hex[:9].upper()
    admin = await user('ADMIN')
    async with async_session_factory() as db:
        u = User(id=uuid.uuid4(), registration_number=reg, name='Pending student',
                 role='STUDENT', account_status='PENDING')
        db.add(u)
        await db.flush()
        db.add(StudentProfile(id=uuid.uuid4(), user_id=u.id, date_of_birth=date(2005, 1, 2),
                              student_type='HOSTELLER', campus_location='MAIN_CAMPUS'))
        await db.commit()
        issued = await AuthService(db).issue_setup_code(u.id, admin.id, 'Identity checked in person')
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=create_app(), raise_app_exceptions=False,
                                                  client=('10.77.0.9', 5559)),
                           base_url='https://testserver') as own:
        done = await own.post('/api/v1/auth/activate-with-dob',
                              json={'registration_number': reg, 'date_of_birth': '2005-01-02',
                                    'password': 'student-chosen-passphrase'})
        assert done.status_code == 200, done.text

        stale = await own.post('/api/v1/auth/activate',
                               json={'registration_number': reg,
                                     'setup_code': issued['setup_code'],
                                     'password': 'someone-elses-passphrase'})
        assert stale.status_code == 401, 'a setup code outlived the activation it was for'
