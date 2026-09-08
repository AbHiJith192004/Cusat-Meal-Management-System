# CUSAT Meal Management System

MessConnect is a hostel meal-management application for CUSAT. It combines a FastAPI API, PostgreSQL persistence, a React PWA, meal selection and menu publication, QR and bulk attendance, inventory and expense ledgers, committee scanner access, payment verification, monthly billing, and daily fine reconciliation.

## Repository layout

```text
backend/             FastAPI application, Alembic migrations, scripts and tests
frontend/            React 19 and Vite PWA
.do/app.yaml         DigitalOcean App Platform production specification
Dockerfile           Combined production frontend/API image
docker-compose.yml   Local PostgreSQL, API and frontend environment
docs/                Deployment runbook and verification evidence
```

## Local development

Copy `.env.docker.example` to `.env` and replace every required value. The signing keys must be different. Then run:

```bash
docker compose up --build
```

The database is available only inside the Compose network. The API is exposed on loopback port 8000 and the development frontend on loopback port 3000.

For direct development without Compose, create a Python 3.11 environment, install `backend/requirements.txt`, set `DATABASE_URL`, `JWT_SECRET_KEY`, and `QR_SECRET_KEY`, run `alembic upgrade head` from `backend/`, and start Uvicorn. Install frontend dependencies with `npm ci` and start Vite with `npm run dev`.

Demo data is never created during application startup. `python -m scripts.seed_demo_data` is development-only and refuses to run when `APP_ENV` is not `development`.

## Verification

```bash
cd backend
pytest tests/unit -q
pytest prod_tests -q
alembic check

cd ../frontend
npm ci
npm run lint
npm run build
npm audit --audit-level=moderate
```

Database-backed tests require a separate disposable PostgreSQL database through `TEST_DATABASE_URL`. The test safeguards reject production-like or non-test database targets.

The Operations screen is the staff workspace for weekly menus, purchases and expenses, live inventory balances, time-limited committee assignments, atomic bulk attendance, and UTR payment review. Ledger totals can be copied into a monthly billing draft; published bill revisions and verified payments remain immutable.

## Production deployment

The supported deployment target is DigitalOcean App Platform in Bangalore. The tracked specification uses one 1 vCPU/1 GiB web container, an attached managed PostgreSQL 16 database, a pre-deploy migration, and a daily reconciliation job.

Read [the DigitalOcean production runbook](docs/digitalocean-production-readiness.md) before applying `.do/app.yaml`. The database cluster name and encrypted signing secrets must be supplied in DigitalOcean; no production credential belongs in this repository.
