#!/usr/bin/env bash
#
# The nightly fine reconciliation, as cron calls it.
#
# On App Platform this was a SCHEDULED job in .do/app.yaml. Here it is one
# crontab line calling this wrapper. The wrapper exists for one reason: cron
# writes no timestamps, so without it a log of failures gives no way to tell
# which night each belongs to.
#
# The job itself writes an audit row whether it succeeds or fails. That row
# is the only record the run happened at all -- a night with no fines due
# and a night this never executed look identical in the fines table, and the
# first visible symptom of the difference is a wrong monthly bill, weeks
# later. To read the last week of runs, open psql and query from there:
#
#   docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
#     sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
#
#   SELECT created_at, action, metadata FROM audit_logs
#    WHERE target_type = 'reconciliation'
#    ORDER BY created_at DESC LIMIT 7;
#
# Seven rows for seven nights. Fewer means nights where this did not run.

set -uo pipefail
cd "$(dirname "$0")"

START="$(date -Iseconds)"
echo "[$START] reconciliation starting"

docker compose -f docker-compose.prod.yml --env-file .env \
    --profile tools run --rm -T reconcile
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
    echo "[$(date -Iseconds)] reconciliation finished ok (started $START)"
else
    echo "[$(date -Iseconds)] reconciliation FAILED with exit $STATUS (started $START)" >&2
fi
exit "$STATUS"
