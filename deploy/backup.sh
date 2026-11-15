#!/usr/bin/env bash
#
# Nightly database dump, verified, pruned, and copied off this server.
#
#   ./backup.sh
#
# This is ops/backup_db.sh adapted to the VPS: pg_dump runs inside the
# database container, so the server needs no PostgreSQL client installed and
# no version skew is possible -- the dumping binary is always the same major
# version as the server that wrote the data.
#
# Why it verifies instead of trusting the exit code: pg_dump against the
# wrong database name succeeds and writes an archive containing nothing.
# A backup nobody has checked is a belief, not a backup.
#
# Why it insists on an off-server copy: in November 2026 the DigitalOcean
# app and its managed database were destroyed for an unpaid invoice. The
# provider's own point-in-time recovery died with the cluster, and there was
# no dump anywhere else. The local copies this script keeps would have gone
# the same way had they lived only on the deleted machine. Set
# BACKUP_OFFSITE_REMOTE.

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.prod.yml
dc() { docker compose -f "$COMPOSE_FILE" --env-file .env "$@"; }

[ -f .env ] || { echo "error: no deploy/.env" >&2; exit 64; }

# Read only the settings this script needs, without sourcing the whole file
# (a password containing a space or a # would be mangled by `source`).
setting() { grep -E "^$1=" .env | head -1 | cut -d= -f2- ; }

BACKUP_DIR="$(setting BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/messconnect}"
BACKUP_KEEP="$(setting BACKUP_KEEP)"; BACKUP_KEEP="${BACKUP_KEEP:-14}"
OFFSITE="$(setting BACKUP_OFFSITE_REMOTE)"

mkdir -p "$BACKUP_DIR" || { echo "error: cannot create $BACKUP_DIR" >&2; exit 73; }

STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/messconnect-$STAMP.dump"
IN_CONTAINER=/tmp/messconnect-backup.dump

# Whatever happens, do not leave the working copy inside the container.
cleanup() { dc exec -T db sh -c "rm -f $IN_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

dc ps --status running --services 2>/dev/null | grep -qx db \
    || { echo "error: the db container is not running" >&2; exit 69; }

echo "==> dumping to $(basename "$DUMP")"
# Credentials are read from the container's own environment, so they are
# never an argument on the host and never land in a shell history or a
# process list.
dc exec -T db sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges --file='"$IN_CONTAINER"

# Verify INSIDE the container, where pg_restore can seek the archive.
LISTING="$(dc exec -T db pg_restore --list "$IN_CONTAINER")"

# The tables whose loss is unrecoverable: who each student is, what they
# ate, and what they were charged and paid. Everything else can be rebuilt
# from these, from the intake sheet, or from the menu.
REQUIRED=(users student_profiles meal_selections attendance
          billing_periods student_bill_snapshots payment_submissions)
missing=()
for table in "${REQUIRED[@]}"; do
    grep -qE "TABLE (DATA )?public $table " <<<"$LISTING" || missing+=("$table")
done
if [ ${#missing[@]} -gt 0 ]; then
    echo "error: dump is missing ${missing[*]} -- refusing to call this a backup" >&2
    exit 1
fi

# Only now is it worth copying out.
dc exec -T db cat "$IN_CONTAINER" > "$DUMP"
chmod 600 "$DUMP"

SIZE="$(du -h "$DUMP" | cut -f1)"
TABLES="$(grep -cE "TABLE DATA public " <<<"$LISTING" || true)"
echo "==> ok: $SIZE, $TABLES tables with data"

# --- Off-server copy ------------------------------------------------------
if [ -n "$OFFSITE" ]; then
    if command -v rclone >/dev/null; then
        echo "==> copying to $OFFSITE"
        rclone copy "$DUMP" "$OFFSITE" \
            || { echo "error: the off-server copy FAILED. The dump exists only on this server." >&2; exit 1; }
        echo "==> off-server copy done"
    else
        echo "error: BACKUP_OFFSITE_REMOTE is set but rclone is not installed" >&2
        exit 1
    fi
else
    echo
    echo "WARNING: no off-server copy. BACKUP_OFFSITE_REMOTE is empty in deploy/.env," >&2
    echo "         so this dump exists only on the server it is a backup of. That is" >&2
    echo "         the exact position this project was in when its provider deleted" >&2
    echo "         the app and the database in November 2026." >&2
    echo "         Until rclone is configured, pull it down by hand from your laptop:" >&2
    echo "           rsync -avz SERVER:$BACKUP_DIR/ ~/messconnect-backups/" >&2
    echo
fi

# --- Prune ----------------------------------------------------------------
# Keep the newest BACKUP_KEEP dumps. Nothing is deleted until the new one
# above is written and verified, so the oldest is only ever dropped in
# exchange for a good new one.
cd "$BACKUP_DIR"
ls -1t messconnect-*.dump 2>/dev/null | tail -n "+$((BACKUP_KEEP + 1))" | while read -r old; do
    echo "==> pruning $old"
    rm -f -- "$old"
done
