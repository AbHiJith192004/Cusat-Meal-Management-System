# MessConnect backend

FastAPI service for the CUSAT hostel mess: meal selection, menu publication, QR
and bulk attendance, expense ledgers, monthly billing and payment review.

| | |
|---|---|
| Language | Python 3.11 |
| Framework | FastAPI |
| Database | PostgreSQL 16, async via `asyncpg` |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Tests | pytest, pytest-asyncio, httpx |

## Running it

The supported local setup is Docker Compose **from the repository root**, which
starts Postgres, runs the migrations and serves the API and frontend together:

```bash
cp .env.docker.example .env   # then fill in every required value
docker compose up --build
```

To run the API directly instead, from this directory:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # edit DATABASE_URL, JWT_SECRET_KEY, QR_SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

The two signing keys must differ from each other, and the application refuses
to start in production without them.

Interactive API documentation is served at `/docs` and `/redoc`, but **only
when `APP_ENV=development`**. In production all three of `/docs`, `/redoc` and
`/openapi.json` are disabled.

## Tests

The suite needs two separate databases: `prod_tests` runs against
`DATABASE_URL`, whose name must end in `_test`, and the unit suite runs against
`TEST_DATABASE_URL`. `tests/conftest.py` refuses to run if the two point at the
same database, so the suite can never touch the application database.

```bash
export DATABASE_URL=postgresql+asyncpg://user@localhost:5432/messconnect_test
export TEST_DATABASE_URL=postgresql+asyncpg://user@localhost:5432/messconnect_unit
export JWT_SECRET_KEY=... QR_SECRET_KEY=... PYTHONPATH=.

alembic upgrade head
alembic check          # fails if a model change has no migration
ruff check .
pytest tests prod_tests -q
```

## Layout

```
app/
├── config.py        Settings, read from the environment
├── database.py      Async engine, session and transaction boundary
├── main.py          App factory, middleware and router registration
├── static.py        Serves the built frontend with an SPA fallback
├── middleware/      CORS, security headers, error handling, request logging
├── models/          SQLAlchemy ORM models
├── repositories/    Query helpers over the models
├── routers/         HTTP endpoints
├── schemas/         Pydantic request schemas
├── security/        JWT, password hashing, rate limiting, dependencies
├── services/        Business logic (billing, attendance, imports, reports)
└── utils/           Enums, exceptions, pagination, IST timezone helpers

migrations/          Alembic revisions
scripts/             Admin bootstrap, fine reconciliation, demo seeding
tests/unit/          Unit tests
prod_tests/          Integration and hardening tests
```

## Endpoints

Everything is under `/api/v1`, except `/health` (readiness, touches the
database) and `/health/live` (liveness, deliberately does not).

| Group | Purpose |
|---|---|
| `auth` | Login, refresh, logout, account activation by setup code or date of birth |
| `me` | Own profile, dashboard, bill and payment submissions |
| `meals` | Per-meal and whole-day opt-in and opt-out, subject to the cutoff |
| `attendance` | Issue, verify and confirm the signed QR meal pass |
| `admin` | Students, attendance corrections, fines, holidays, stock, billing, reports, audit |
| `admin` (operations) | Menus, expense ledger, inventory, committee scanner access, bulk attendance, payment review |
| `super-admin` | Create administrators, system settings, student roll import |

Responses are a `{"success": ..., "data": ...}` envelope built by
`app/schemas/common.py`; request bodies are validated by the Pydantic schemas
in `app/schemas/`.
