#!/usr/bin/env bash
#
# Takes a restorable snapshot of the production database.
#
# This does two jobs that look separate and are not:
#
#   1. It is the backup that outlives the hosting provider. DigitalOcean's
#      own point-in-time recovery only ever restores into another
#      DigitalOcean cluster, so it is worth nothing on the day we leave --
#      and worth nothing if the account itself is what went wrong.
#
#   2. It is the migration. Moving to a Hetzner VPS is this dump, then a
#      pg_restore against the new server. There is no third step. Which
#      means the file this produces has to be known-good BEFORE the move,
#      not discovered to be empty during it.
#
# Needs pg_dump 16 on the host: brew install postgresql@16
#
# Usage:
#   ops/backup_db.sh                      # reads $DATABASE_URL
#   ops/backup_db.sh "postgresql://..."   # or takes it as an argument
#
# Output lands in ops/backups/ and is gitignored -- it contains every
# student's name, date of birth and billing history.

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ]; then
    echo "error: no database URL. Pass one, or set DATABASE_URL." >&2
    exit 64
fi

# The app talks asyncpg; pg_dump does not know that dialect.
DB_URL="${DB_URL/postgresql+asyncpg:/postgresql:}"

OUT_DIR="$(cd "$(dirname "$0")" && pwd)/backups"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$OUT_DIR/messconnect-$STAMP.dump"

echo "==> dumping to $(basename "$DUMP")"
# Custom format: compressed, and pg_restore can read a table list out of it
# without a server, which is what the verification below relies on.
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DB_URL"

# A dump that ran without error can still be empty -- wrong database name in
# the URL is the classic way, and it exits 0. Check the contents, not the
# exit code. These are the tables whose loss is unrecoverable: identity,
# what each student ate, and what they were charged and paid. Everything
# else can be rebuilt from them, from the intake sheet, or from the menu.
REQUIRED=(users student_profiles meal_selections attendance
          billing_periods student_bill_snapshots payment_submissions)
LISTING="$(pg_restore --list "$DUMP")"

missing=()
for table in "${REQUIRED[@]}"; do
    grep -qE "TABLE (DATA )?public $table " <<<"$LISTING" || missing+=("$table")
done

if [ ${#missing[@]} -gt 0 ]; then
    echo "error: dump is missing ${missing[*]} -- refusing to call this a backup" >&2
    echo "       kept at $DUMP for inspection" >&2
    exit 1
fi

SIZE="$(du -h "$DUMP" | cut -f1)"
TABLES="$(grep -cE "TABLE DATA public " <<<"$LISTING" || true)"
echo "==> ok: $SIZE, $TABLES tables with data"
echo
echo "To restore this onto a fresh server (this is also the Hetzner cutover):"
echo "  createdb -h <host> -U <user> messconnect"
echo "  pg_restore -h <host> -U <user> -d messconnect --no-owner $DUMP"
