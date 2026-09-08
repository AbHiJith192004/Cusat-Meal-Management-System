---
status: full_application_ready_for_digitalocean_staging_not_yet_live
updated: 2026-09-08
branch: codex/digitalocean-production-readiness
provider: digitalocean
region: blr
estimated_monthly_usd_before_tax: 25.15
estimated_monthly_inr_after_18_percent_tax: 2805
live_changes: none
---

# DigitalOcean production deployment

MessConnect is configured for a low-cost DigitalOcean App Platform deployment in Bangalore. The application uses one fixed shared 1 vCPU/1 GiB container, one separately created 1 vCPU/1 GiB managed PostgreSQL 16 cluster, and short-lived pre-deploy and scheduled jobs. The React frontend is compiled into the FastAPI image, so it does not require a second service.

The complete application scope is now persisted in PostgreSQL. This includes menu authoring, purchase/operational/administrative ledgers, inventory catalogue and movement history, time-limited committee scanner access, atomic bulk attendance, bill-bound UTR submissions, and one-time staff payment review. Every privileged mutation writes append-only audit history. Voids and revocations retain the original record and their reason.

Billing can fill purchase and expense totals from the operational ledger before preview. A payment submission must equal the exact total of a currently published student bill revision. A bill cannot be reopened while that revision has a pending or verified payment, preventing a reviewed payment from silently changing underneath it.

The tracked `.do/app.yaml` is intentionally fail-closed: the managed database cluster name is a visible placeholder and the two signing secrets have no repository values. It cannot become a valid production deployment until an operator creates the database and supplies those settings in DigitalOcean.

## Monthly budget

| Component | Base monthly price |
|---|---:|
| App Platform fixed shared 1 vCPU / 1 GiB | $10.00 |
| Managed PostgreSQL 1 vCPU / 1 GiB / 10 GiB | $15.15 |
| Pre-deploy migration and daily reconciliation | Per-second runtime, normally small |
| Base total before job runtime and tax | $25.15 |

At the 2026-09-07 reference rate of INR 94.49 per USD, the base total with 18% Indian tax is approximately INR 2,805 per month. Bank foreign-exchange fees, a domain, excess transfer, and unusual job runtime are separate. Set a DigitalOcean spend alert at $30 and a second alert at $40.

The 1 GiB service runs one Uvicorn worker. Upgrade to `apps-s-1vcpu-2gb` ($25/month) when staging or production measurements show sustained memory pressure, restarts, database pool waits, or unacceptable peak latency. Do not downgrade to a development database: it has no default backups and is tied to the app lifecycle.

## Deployment procedure

1. Run the repository CI checks and merge this reviewed branch to `main`. `.do/app.yaml` deliberately deploys `main` with automatic deploys disabled.
2. In DigitalOcean, create a PostgreSQL 16 managed database in Bangalore (`BLR1`) using the Basic Regular 1 vCPU / 1 GiB plan with 10 GiB storage. Put it in the same Bangalore VPC as the App Platform app. Do not select the $7 development database.
3. Replace `REPLACE_WITH_DATABASE_CLUSTER_NAME` in `.do/app.yaml` with the exact managed database cluster name. Do not put its password or connection string in Git.
4. Generate two different secrets with `openssl rand -hex 32`. In DigitalOcean App Platform, set `JWT_SECRET_KEY` and `QR_SECRET_KEY` as encrypted run-time variables. Never paste either value into the app spec, a commit, logs, or chat.
5. Create the app from `.do/app.yaml` through `doctl apps create --spec .do/app.yaml`, or reproduce the spec in the control panel. The app must attach the existing managed database and use `${messconnect-db.DATABASE_PRIVATE_URL}`. Add the app as a database trusted source.
6. Confirm that the app and database use the same Bangalore VPC before deployment. Public database access should remain disabled except for a temporary, tightly restricted migration source when needed.
7. The `migrate` pre-deploy job runs `alembic upgrade head`. The web component starts only after that succeeds. The `/health` readiness and liveness checks verify both API and database access.
8. The `daily-reconciliation` job runs at 01:00 `Asia/Kolkata`, calculates the previous day's missed-meal fines, and purges expired refresh tokens. Verify its first invocation and resulting rows before relying on it.
9. For an empty database, open a one-off console and run `python -m scripts.bootstrap_admin`. It refuses to create a second super administrator. Do not run demo seed commands in production.
10. Add the production domain after the generated `.ondigitalocean.app` URL passes staging. The app uses the same origin for frontend and API; `${APP_URL}` supplies the allowed origin. Verify login, refresh cookies, menu publication, student meal changes, QR and bulk attendance, committee expiry/revocation, ledger and inventory operations, billing preview/publication, payment submission/review, reconciliation, and logout through the final domain before switching DNS.

## Existing database migration

If the Render database contains records, do not create accounts or seed the DigitalOcean database. Take a PostgreSQL export, restore it into the new managed cluster, run Alembic, and compare record counts for users, meals, attendance, fines, billing revisions, and audit logs. Rehearse this on an isolated database first. During the final cutover, stop writes on the old application, take a final export, restore and validate it, then switch DNS. Keep the old service read-only until rollback risk has passed.

An immediate application rollback should deploy the previously reviewed image while leaving the additive schema in place. Do not run destructive Alembic downgrades against production data.

## Platform-specific security

`TRUST_PROXY_HEADERS=true` is set only on the App Platform web component. App Platform is the public ingress and the container has no direct public address, so the application may use the first validated `X-Forwarded-For` address for rate limiting. Local and direct-host deployments keep the default `false`; enabling it on a directly reachable server would allow callers to forge addresses.

The application limits the one worker to ten pooled database connections including overflow, disables test mode, requires independent signing keys, and exposes no production API documentation. Sensitive responses remain non-cacheable and migrations and seed operations do not run inside web workers.

## Required staging evidence

- DigitalOcean build and pre-deploy migration succeed from a clean `main` checkout.
- `/health` remains healthy during normal traffic and a service restart.
- A backup can be restored into an isolated database and its key record counts match.
- Forwarded-client addresses behave correctly behind DigitalOcean ingress while a direct forged header remains untrusted outside that environment.
- The 1 GiB instance completes the representative meal-time burst without memory restarts or unacceptable latency.
- The scheduled reconciliation runs once, remains idempotent on a repeat, and produces the intended opted-in-days-plus-fines results.
- All critical mobile and desktop flows pass through the final HTTPS domain, including the Operations screen and student payment confirmation.

Production remains conditionally ready until these checks are completed on DigitalOcean. The existing local verification is recorded under `docs/verification/` and covers the application behavior, database mutations, billing calculations, frontend build, dependency audits, and representative load; it does not certify the new cloud environment.
