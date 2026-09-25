# Monitoring MessConnect in production

App `8116d81b-48a2-45a5-b2e6-3f2ea1a2acd7`, live at
https://messconnect-uyeus.ondigitalocean.app

There is deliberately **no custom monitoring dashboard**. A dashboard is a
pull mechanism, and the moment it matters most is 02:00, which is exactly
when nobody is looking at one. It would also need its own auth, hosting and
uptime, and then something to watch the watcher. What follows is push, plus
the two screens that already exist.

## What is already covered

| Concern | Covered by |
| --- | --- |
| Is the process alive | `/health/live` — liveness probe, never touches the database |
| Can it serve traffic | `/health` — readiness probe, checks Postgres |
| Deploy broke | DO alert `DEPLOYMENT_FAILED` |
| Domain/TLS broke | DO alert `DOMAIN_FAILED` |
| Container wedged or thrashing | DO alerts CPU >85%/10m, MEM >85%/10m, `RESTART_COUNT` >3/10m |
| What the app did | in-app audit log: fines, waivers, settings, suspensions, closures |
| Whether the mess is being used | Overview → trend + reach + volume, 7/14/30 days |
| App unreachable from outside | DO Uptime check `messconnect-health` → `down_global` alert |
| Nightly fines actually ran | Overview heartbeat, from the job's own audit row |
| Logs, metrics graphs, deploy history | the DO console |

Liveness and readiness must stay split. Pointing liveness at `/health` means
a database blip kills every container, and the restarts all reconnect at once
against the pool that was already saturated.

## The nightly job heartbeat

`jobs[daily-reconciliation]` runs `python -m scripts.run_fine_reconciliation`
at 01:00 IST and raises the missed-meal fines.

**There is no DO alert rule for a scheduled job failing.** The five rules
above are the complete set, and the utilisation ones are scoped to `web`.

So the job records itself. Every run writes an audit row —
`RECONCILIATION_COMPLETED` or `RECONCILIATION_FAILED`, `actor_id` null —
and `GET /admin/dashboard` returns the latest as `last_reconciliation`. The
Overview shows it above the trend card:

- quiet grey line — ran, with the count of fines raised
- red — the last run **failed**, with the error
- red — the last success is **older than 26 hours**, so it has missed its
  slot and fines are not being raised
- grey — never reported (only before the first run after deploy)

Before this, fines were audited one at a time, so a night with nothing due
and a night the job never executed were identical in the database. The first
visible symptom would have been a wrong monthly bill, weeks later.

To check by hand, or to re-run a specific date:

```bash
doctl apps logs 8116d81b-48a2-45a5-b2e6-3f2ea1a2acd7 daily-reconciliation --type run
```

## The external uptime check

DO's own health check is internal: it tells the platform to stop routing
traffic to a sick container. It does not tell a person the app is
unreachable, and `DEPLOYMENT_FAILED` does not fire for an app that is
running but broken. So there is a DigitalOcean Uptime check watching from
outside — no third-party service, same account, managed with `doctl`.

| | |
| --- | --- |
| Check | `messconnect-health` · `39c00aff-b870-46e4-a65f-25808634b7ec` |
| Target | `https://messconnect-uyeus.ondigitalocean.app/health` |
| Regions | `se_asia`, `eu_west`, `us_east` |
| Alert | `MessConnect is down` · `96dd7c19-ed1a-466e-90a3-3b6335adc418` |
| Fires when | `down_global` — unreachable from **all** regions for 2 minutes |
| Goes to | the DO account email |

```bash
doctl monitoring uptime list
doctl monitoring uptime alert list 39c00aff-b870-46e4-a65f-25808634b7ec
```

`down_global` rather than `down` on purpose: the app runs in one region
(blr1), so if it is genuinely down it is down everywhere, and alerting when
any single checker has a network blip would only teach you to ignore the
alert.

**A non-2xx response counts as DOWN.** This was measured, not assumed — the
DO docs do not say. A temporary check was pointed at a URL on the same host
that returns 401, and it registered `DOWN` within 45 seconds. That is what
makes `/health` the right target: it answers 503 when Postgres is
unreachable, so a sick database pages you even though the container is
still serving.

The check's live per-region status is not exposed by `doctl`; it is in the
DO console, or:

```bash
curl -s -H "Authorization: Bearer $DO_TOKEN" \
  https://api.digitalocean.com/v2/uptime/checks/39c00aff-b870-46e4-a65f-25808634b7ec/state
```

That endpoint also reports `days_to_ssl_expiry`, which is why there is no
separate `ssl_expiry` alert: the certificate for `*.ondigitalocean.app` is
DO-managed and renews itself. Add one if a custom domain is ever attached.

## Still to set up: send the app alerts somewhere you will see (2 minutes)

All five alerts currently go to **one email address and zero Slack
webhooks**. Check with:

```bash
doctl apps list-alerts 8116d81b-48a2-45a5-b2e6-3f2ea1a2acd7
```

Create an Incoming Webhook in Slack, then:

```bash
cp ops/alert-destinations.example.yaml ops/alert-destinations.yaml
# paste the webhook URL in, and uncomment the slack_webhooks block
doctl apps update-alert-destinations 8116d81b-48a2-45a5-b2e6-3f2ea1a2acd7 <alert-id> \
  --app-alert-destinations ops/alert-destinations.yaml
```

One call per alert ID.

**The two filenames are not interchangeable.** `…example.yaml` is the
committed template with a placeholder. `ops/alert-destinations.yaml` is the
one you fill in, and it is **git-ignored** — a Slack webhook URL is a
credential, anyone holding it can post into the channel, and this repository
is public. Verified: with a webhook in the local file, `git add -A` stages
only `.gitignore`.

This command changes **only** the destinations and does not touch the app
spec, which matters: `doctl apps update --spec .do/app.yaml` would push the
repo's `SECRET` envs, which have no values on purpose, and wipe the live
signing keys.

## What is deliberately not here

- **Error tracking (Sentry).** Worth adding once there are 500s that the
  runtime logs cannot explain. Not before.
- **Uptime/latency dashboards.** The DO console already draws them.
- **Alerting on business metrics** (attendance dipped, fines spiked). These
  move for real reasons — a holiday, an exam week — so they would mostly cry
  wolf. The Overview is the right place to look at them.
