#!/usr/bin/env bash
#
# Restore a dump over the live database. Destructive, on purpose.
#
#   ./restore.sh /var/backups/messconnect/messconnect-20261111-023000.dump
#   ./restore.sh <dump> --yes      non-interactive (cutover scripts only)
#
# Two jobs, one procedure:
#
#   1. Disaster recovery. Something went wrong and last night's dump is the
#      state you want back.
#
#   2. The migration itself. Moving from DigitalOcean -- or from any other
#      host -- is backup.sh on the old box and this on the new one. There is
#      no third step. Which is why the dump has to be known-good BEFORE the
#      move, not discovered to be empty during it.
#
# RUN IT ONCE ON PURPOSE, the week you set the server up, against a dump you
# just took. A restore procedure nobody has executed is a hope. Doing it
# early costs an hour; doing it first during an outage costs the data.

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.prod.yml
dc() { docker compose -f "$COMPOSE_FILE" --env-file .env "$@"; }

DUMP="${1:-}"
ASSUME_YES=false
[ "${2:-}" = "--yes" ] && ASSUME_YES=true

[ -n "$DUMP" ] || { echo "usage: ./restore.sh <dump file> [--yes]" >&2; exit 64; }
[ -f "$DUMP" ] || { echo "error: no such file: $DUMP" >&2; exit 66; }
[ -f .env ]    || { echo "error: no deploy/.env" >&2; exit 64; }

IN_CONTAINER=/tmp/messconnect-restore.dump
cleanup() { dc exec -T db sh -c "rm -f $IN_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> starting the database"
dc up -d db
for _ in $(seq 1 30); do
    dc exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 && break
    sleep 2
done

echo "==> copying the dump into the database container"
dc exec -T db sh -c "cat > $IN_CONTAINER" < "$DUMP"

# Read the archive before trusting it. An empty or truncated dump must not
# be allowed to replace a database that still has rows in it.
echo "==> checking the archive"
LISTING="$(dc exec -T db pg_restore --list "$IN_CONTAINER")" \
    || { echo "error: this file is not a readable custom-format dump" >&2; exit 1; }
TABLES="$(grep -cE 'TABLE DATA public ' <<<"$LISTING" || true)"
[ "$TABLES" -gt 0 ] || { echo "error: the dump contains no table data. Refusing to restore it." >&2; exit 1; }

# current_schema() rather than a quoted 'public': same answer, and it keeps
# this line free of nested quoting in a script people read while something
# is already going wrong.
EXISTING="$(dc exec -T db sh -c \
    'psql -tAq -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()"' 2>/dev/null || echo 0)"

cat <<WARNING

  About to REPLACE the live database.

    dump          $DUMP
    tables in it  $TABLES
    tables now    ${EXISTING:-0}  (these are dropped and will not come back)

  If the current database has anything you have not dumped, stop now and run
  ./backup.sh first.

WARNING

if [ "$ASSUME_YES" != true ]; then
    printf 'Type RESTORE to continue: '
    read -r answer
    [ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }
fi

# The app must be down first. Restoring under a live app means its open
# connections block the drop, and any request served mid-restore sees a
# half-populated schema.
echo "==> stopping the app"
dc stop app >/dev/null

echo "==> recreating the database"
dc exec -T db sh -c '
set -e
psql -q -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)"
psql -q -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
'

echo "==> restoring"
# --exit-on-error: a partial restore that reports success is worse than a
# failure, because it looks finished.
dc exec -T db sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error '"$IN_CONTAINER"

echo "==> bringing the schema to head (in case the dump predates a migration)"
dc --profile tools run --rm -T migrate >/dev/null

echo "==> starting the app"
dc up -d app

echo
echo "Restored. Verify before telling anyone it is back:"
echo "  docker compose -f $COMPOSE_FILE --env-file .env exec -T db sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT count(*) FROM users\"'"
