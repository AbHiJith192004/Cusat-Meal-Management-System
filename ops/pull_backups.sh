#!/usr/bin/env bash
#
# Copy the server's nightly dumps down to this machine.
#
#   MESSCONNECT_HOST=user@1.2.3.4 ops/pull_backups.sh
#   ops/pull_backups.sh --host user@1.2.3.4 --dest ~/messconnect-backups
#
# WHY THIS EXISTS. backup.sh writes dumps to /var/backups/messconnect on the
# server. A dump that lives only on the machine it is a backup of is not a
# backup: in November 2026 this project's provider deleted the app and its
# database over an unpaid invoice, and there was no copy anywhere else.
# This is the second copy. It is deliberately dumb -- no cloud account, no
# OAuth, no new credential -- because the cheapest backup that actually runs
# beats the sophisticated one that was never finished.
#
# There is no default host. A wrong default fails looking like a network
# fault, which is the slowest kind of wrong to diagnose.

set -euo pipefail

HOST="${MESSCONNECT_HOST:-}"
DEST="${MESSCONNECT_BACKUP_DEST:-$HOME/messconnect-backups}"
KEY="${MESSCONNECT_SSH_KEY:-$HOME/.ssh/id_ed25519_messconnect}"

while [ $# -gt 0 ]; do
    case "$1" in
        --host) HOST="${2:-}"; shift 2 ;;
        --dest) DEST="${2:-}"; shift 2 ;;
        --key)  KEY="${2:-}";  shift 2 ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 64 ;;
    esac
done

[ -n "$HOST" ] || { echo "no host. Set MESSCONNECT_HOST=user@ip or pass --host." >&2; exit 64; }
[ -f "$KEY" ]  || { echo "no ssh key at $KEY" >&2; exit 64; }

mkdir -p "$DEST"

# The dumps are mode 700 and owned by the deploy user, so the login user
# cannot read them directly. --rsync-path runs the remote side under sudo.
# That is the whole reason this is rsync and not scp.
rsync -az --timeout=120 \
    -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes" \
    --rsync-path="sudo rsync" \
    "$HOST:/var/backups/messconnect/" "$DEST/"

COUNT="$(find "$DEST" -name '*.dump' -type f | wc -l | tr -d ' ')"
NEWEST="$(find "$DEST" -name '*.dump' -type f -exec basename {} \; | sort | tail -1)"
printf '%s  ok: %s dumps in %s, newest %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$COUNT" "$DEST" "${NEWEST:-none}"

# A copy you have never opened is a hope, not a backup. Prove the newest one
# is a readable archive, not a truncated file or an HTML error page.
if command -v pg_restore >/dev/null && [ -n "$NEWEST" ]; then
    if pg_restore --list "$DEST/$NEWEST" >/dev/null 2>&1; then
        echo "           newest dump is a readable custom-format archive"
    else
        echo "WARNING: $NEWEST is NOT a readable pg_restore archive" >&2
        exit 1
    fi
fi
