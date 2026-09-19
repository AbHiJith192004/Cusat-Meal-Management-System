#!/usr/bin/env bash
#
# Stand up a LOCAL demo of MessConnect, filled with a month of realistic data,
# so every screen can be judged with something in it. Production is nearly
# empty by design -- no attendance, no fines, no bills -- which makes it
# useless for looking at the interface.
#
#   ops/demo.sh          start it (rebuilds the data from scratch each time)
#   ops/demo.sh stop     shut it down and delete the demo database
#
# It touches nothing outside /tmp and the repo's own frontend/dist. The
# database is created fresh on port 55433 and named messconnect_demo; the
# seeder refuses to run against anything that is not local and not *demo*.
#
# Needs postgres 16 and the project's python venv, both already used by the
# test suite.

set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"

PGDATA=/tmp/messconnect-demo-pgdata
PGSOCK=/tmp/mess-audit-pgsock
PGPORT=55433
APPPORT=8099
LOG=/tmp/messconnect-demo

stop() {
  pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $APPPORT" 2>/dev/null || true
  if [ -d "$PGDATA" ]; then
    LC_ALL=C LANG=C pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
    rm -rf "$PGDATA"
  fi
  rm -f "$LOG"-*.log
  echo "demo stopped, demo database deleted"
}

if [ "${1:-}" = "stop" ]; then stop; exit 0; fi

command -v initdb >/dev/null || { echo "postgres not found: brew install postgresql@16" >&2; exit 1; }
VENV="$REPO/.audit-venv/bin"
[ -x "$VENV/python" ] || { echo "python venv missing at $VENV" >&2; exit 1; }

echo "==> resetting the demo database"
stop >/dev/null 2>&1 || true
mkdir -p "$PGSOCK"
# LC_ALL=C: without it the server dies with 'postmaster became multithreaded
# during startup' on macOS. -k: a socket inside the repo exceeds the 103-byte
# path limit, so it lives in /tmp.
LC_ALL=C LANG=C initdb -D "$PGDATA" -U postgres --encoding=UTF8 --locale=C >/dev/null 2>&1
LC_ALL=C LANG=C pg_ctl -D "$PGDATA" \
  -o "-p $PGPORT -k $PGSOCK -c listen_addresses=localhost" \
  -l "$LOG-pg.log" start >/dev/null
sleep 2
psql -h localhost -p $PGPORT -U postgres -q -c "CREATE DATABASE messconnect_demo;"

export DATABASE_URL="postgresql+asyncpg://postgres@localhost:$PGPORT/messconnect_demo"
export TEST_DATABASE_URL="$DATABASE_URL"
# Throwaway keys for a throwaway instance. Production keys live only in
# DigitalOcean; config.py requires 32+ characters even here.
export JWT_SECRET_KEY="demo-instance-signing-key-not-for-production-1"
export QR_SECRET_KEY="demo-instance-qr-key-not-for-production-22222"
export APP_ENV=development
export ALLOW_TEST_MODE=false
export PYTHONPATH=.
export STATIC_DIR="$REPO/frontend/dist"

echo "==> applying migrations"
(cd backend && "$VENV/alembic" upgrade head >/dev/null)

echo "==> seeding a month of demo data"
# APP_ENV=development turns on SQLAlchemy echo, which buries the one line
# worth reading under thousands of statements.
(cd backend && "$VENV/python" "$REPO/ops/demo_seed.py" 2>&1 | grep -vE "sqlalchemy|^\[|^ *(SELECT|INSERT|UPDATE|FROM|WHERE|VALUES|ORDER|RETURNING)" || true)

echo "==> building the frontend"
# VITE_API_BASE_URL matters: without it the bundle calls localhost:8000 for a
# 127.0.0.1 host and every screen reports 'could not reach the server'.
(cd frontend && VITE_API_BASE_URL=/api/v1 npm run build >/dev/null 2>&1)

echo "==> starting the app"
(cd backend && nohup "$VENV/uvicorn" app.main:app --host 127.0.0.1 --port $APPPORT \
   > "$LOG-app.log" 2>&1 &)
for _ in $(seq 1 30); do
  curl -s -m 1 -o /dev/null "http://127.0.0.1:$APPPORT/health" && break
  sleep 1
done

cat <<INFO

  Demo running at  http://127.0.0.1:$APPPORT

  Super admin   DEMOSUPER    demo-password-2026
  Admin         DEMOADMIN    demo-password-2026
  Student       26021001     demo-password-2026   (has meals, fines, a bill)
  Outmess       26021007     demo-password-2026   (never billed)
  Not activated 26021008     -- use it to see the activation flow

  Every student password is demo-password-2026.

  Stop it with:  ops/demo.sh stop

INFO
