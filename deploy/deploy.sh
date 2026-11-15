#!/usr/bin/env bash
#
# Build, migrate, release, verify. The whole deployment.
#
#   ./deploy.sh              deploy the working tree as it stands
#   ./deploy.sh --pull       fast-forward main from origin first
#   ./deploy.sh --skip-backup
#
# The order below is not arbitrary. A dump is taken BEFORE the migration,
# because a migration is the one routine operation that can destroy data
# while exiting 0, and the pre-migration state is exactly what you want back
# when it does. The migration then runs as its own step, finishing before
# any new container starts -- the same ordering App Platform's PRE_DEPLOY
# job gave for free, and the reason two app versions never see two schemas.
#
# Nothing here rolls the DATABASE back on failure. `alembic downgrade` is
# not a rollback, it is another migration, and running one unattended
# against a schema that just failed is how a bad deploy becomes a lost
# month. The image rolls back automatically; the data is restored by hand,
# from the dump this script just took, with restore.sh.

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.prod.yml
dc() { docker compose -f "$COMPOSE_FILE" --env-file .env "$@"; }

say()  { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

PULL=false
SKIP_BACKUP=false
for arg in "$@"; do
    case "$arg" in
        --pull) PULL=true ;;
        --skip-backup) SKIP_BACKUP=true ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) fail "unknown option: $arg" ;;
    esac
done

# --- 0. Preconditions -----------------------------------------------------
[ -f .env ] || fail "no deploy/.env. Copy .env.prod.example to .env and fill it in."
command -v docker >/dev/null || fail "docker is not installed. Run bootstrap.sh first."
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is missing. Run bootstrap.sh first."

# A build that runs out of disk halfway leaves a half-written image and a
# confusing error. Check first; it is one line and it has to be said once.
AVAIL_KB="$(df -Pk . | awk 'NR==2 {print $4}')"
if [ "$AVAIL_KB" -lt 3145728 ]; then
    printf 'WARNING: only %s MB free on this filesystem. A build needs ~2 GB.\n' "$((AVAIL_KB / 1024))" >&2
    printf '         Reclaim space with: docker system prune -a --volumes\n' >&2
    printf '         (that deletes unused images AND unused volumes -- read it twice)\n\n' >&2
fi

if [ "$PULL" = true ]; then
    say "Fast-forwarding from origin"
    # --ff-only on purpose: if the server's checkout has diverged, stop and
    # let a human look, rather than merging something nobody reviewed onto
    # the machine students are using.
    git -C .. pull --ff-only origin main || fail "could not fast-forward. Check 'git -C .. status' on the server."
fi

COMMIT="$(git -C .. rev-parse --short HEAD 2>/dev/null || echo unknown)"
say "Deploying commit $COMMIT"

# --- 0.5 Check the proxy config before anything depends on it -------------
# A typo in the Caddyfile does not fail the build and does not fail the
# migration -- it fails when Caddy restarts, by which point the old site is
# already gone. Catch it here, while nothing has changed.
say "Validating the Caddy configuration"
dc run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
    || fail "deploy/Caddyfile is not valid. Nothing has been changed. Run this to see why:
  docker compose -f $COMPOSE_FILE --env-file .env run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile"

# --- 1. Back up before anything can change the schema ---------------------
if [ "$SKIP_BACKUP" = true ]; then
    printf 'Skipping the pre-deploy backup because --skip-backup was passed.\n'
elif dc ps --status running --services 2>/dev/null | grep -qx db; then
    say "Pre-deploy backup"
    ./backup.sh || fail "the pre-deploy backup failed. Nothing has been changed. Fix the backup before deploying."
else
    printf 'Database is not running yet -- first deploy, nothing to back up.\n'
fi

# --- 2. Build -------------------------------------------------------------
# Keep the image that is currently serving, under a second tag, so a failed
# release can be put back in one command. Tags survive `docker image prune`.
if docker image inspect messconnect-app:latest >/dev/null 2>&1; then
    docker tag messconnect-app:latest messconnect-app:previous
    HAVE_PREVIOUS=true
else
    HAVE_PREVIOUS=false
fi

say "Building the application image (frontend lint + build, then the API)"
dc build app || fail "the build failed. Nothing has been changed; the running version is untouched."

# --- 3. Migrate -----------------------------------------------------------
say "Starting the database"
dc up -d db
dc --profile tools run --rm -T migrate >/dev/null || {
    printf '\nThe migration failed. The old version is still running and still\n' >&2
    printf 'serving students -- do not restart it until this is understood.\n\n' >&2
    printf '  logs:    cd %s && docker compose -f %s --profile tools run --rm migrate\n' "$PWD" "$COMPOSE_FILE" >&2
    printf '  restore: ./restore.sh <the dump taken above>\n' >&2
    exit 1
}
say "Schema is at head"

# --- 4. Release -----------------------------------------------------------
say "Starting the new version"
dc up -d --remove-orphans

# --- 5. Verify ------------------------------------------------------------
# Through the container, not the public URL: this has to work on the very
# first deploy, before DNS is pointed and before a certificate exists.
# /health, not /health/live -- readiness, which answers 503 unless the
# database is actually reachable from inside the new container.
say "Waiting for the new version to report healthy"
probe() {
    dc exec -T app python -c "
import sys, urllib.request
try:
    sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=5).status == 200 else 1)
except Exception:
    sys.exit(1)
" >/dev/null 2>&1
}

HEALTHY=false
for _ in $(seq 1 30); do
    if probe; then HEALTHY=true; break; fi
    sleep 3
done

if [ "$HEALTHY" != true ]; then
    printf '\nThe new version never became healthy after 90 seconds.\n' >&2
    dc logs --tail 60 app >&2 || true
    if [ "$HAVE_PREVIOUS" = true ]; then
        printf '\nRolling the IMAGE back to the previous one.\n' >&2
        docker tag messconnect-app:previous messconnect-app:latest
        dc up -d app
        printf 'Rolled back. NOTE: any schema change the migration made is STILL\n' >&2
        printf 'applied. If the old code cannot run against the new schema, restore\n' >&2
        printf 'the pre-deploy dump with ./restore.sh.\n' >&2
    else
        printf '\nNo previous image to roll back to -- this was the first deploy.\n' >&2
    fi
    exit 1
fi

# --- 6. Tidy --------------------------------------------------------------
# Dangling layers only. Tagged images, including :previous, are kept.
docker image prune -f >/dev/null 2>&1 || true

printf '%s  %s\n' "$(date -Iseconds)" "$COMMIT" >> .last-deploy

say "Deployed $COMMIT"
dc ps
printf '\nPublic check (only meaningful once DNS points here):\n'
printf '  curl -sS https://%s/health\n\n' "$(grep -E '^MESS_DOMAIN=' .env | cut -d= -f2-)"
