---
status: database_created_app_not_yet_created
updated: 2026-09-18
branch: main
provider: digitalocean
region: blr
estimated_monthly_usd_before_tax: 40.45
estimated_monthly_inr_after_18_percent_tax: 4573
planned_provider_change: hetzner_vps_after_first_month
live_changes: messconnect-db cluster created 2026-09-17, billing
---

# DigitalOcean production deployment

MessConnect is configured for a DigitalOcean App Platform deployment in Bangalore. The application uses one fixed shared 1 vCPU/1 GiB container, one separately created 1 vCPU/2 GiB managed PostgreSQL 16 cluster, and short-lived pre-deploy and scheduled jobs.

The database is 2 GiB rather than 1 GiB for one reason: connection count. DigitalOcean caps a 1 GiB cluster at 22 connections, and this app's measured configuration needs 40. The extra memory is incidental; the connection ceiling is the constraint.

This is deliberately a first-month arrangement. The intent is to move to a self-managed Hetzner VPS once a month of real production behaviour has shown what the system actually needs, at roughly a seventh of the cost. See "Leaving DigitalOcean" below; the exit is prepared now, while there is no data to lose, rather than improvised later. The React frontend is compiled into the FastAPI image, so it does not require a second service.

The complete application scope is now persisted in PostgreSQL. This includes menu authoring, purchase/operational/administrative ledgers, inventory catalogue and movement history, time-limited committee scanner access, atomic bulk attendance, bill-bound UTR submissions, and one-time staff payment review. Every privileged mutation writes append-only audit history. Voids and revocations retain the original record and their reason.

Billing can fill purchase and expense totals from the operational ledger before preview. A payment submission must equal the exact total of a currently published student bill revision. A bill cannot be reopened while that revision has a pending or verified payment, preventing a reviewed payment from silently changing underneath it.

The tracked `.do/app.yaml` is intentionally fail-closed: the managed database cluster name is a visible placeholder and the two signing secrets have no repository values. It cannot become a valid production deployment until an operator creates the database and supplies those settings in DigitalOcean.

## Monthly budget

| Component | Base monthly price |
|---|---:|
| App Platform fixed shared 1 vCPU / 1 GiB | $10.00 |
| Managed PostgreSQL 1 vCPU / 2 GiB / 30 GiB | $30.45 |
| Pre-deploy migration and daily reconciliation | Per-second runtime, normally small |
| Base total before job runtime and tax | $40.45 |

At a reference rate of INR 95.8 per USD, the base total with 18% Indian tax is approximately INR 4,573 per month. Bank foreign-exchange fees, a domain, excess transfer, and unusual job runtime are separate. Set a DigitalOcean spend alert at $45 and a second at $60.

Registering a GSTIN on the account removes the 18%, taking this to about INR 3,875. That is worth doing whoever ends up paying.

The 1 GiB service runs two Uvicorn workers. Upgrade to `apps-s-1vcpu-2gb` ($25/month) when production measurements show sustained memory pressure, restarts, database pool waits, or unacceptable peak latency. Do not downgrade to a development database: it has no default backups and is tied to the app lifecycle.

## Deployment procedure

1. Run the repository CI checks and merge this reviewed branch to `main`. All three components clone the public repository over HTTPS instead of using DigitalOcean's GitHub integration, so no OAuth grant against the GitHub account is needed. That integration only exists to enable deploy-on-push, which this spec deliberately does not want. Deploys are explicit: `doctl apps create-deployment <app-id>`. If the repository is ever made private, this has to change back to a `github:` source and the integration must then be authorised.
2. Done on 2026-09-17: `messconnect-db`, PostgreSQL 16, `db-s-1vcpu-2gb`, `BLR1`, single node. It is billing from that date. Do not select the $7 development database if this ever has to be recreated.
3. Done: `.do/app.yaml` names `messconnect-db` in its `databases` block, which attaches to that existing cluster rather than creating one. The cluster's password and connection string stay out of Git.
4. Generate two different secrets with `openssl rand -hex 32`. In DigitalOcean App Platform, set `JWT_SECRET_KEY` and `QR_SECRET_KEY` as encrypted run-time variables. Never paste either value into the app spec, a commit, logs, or chat.
5. Create the app from `.do/app.yaml` through `doctl apps create --spec .do/app.yaml`, or reproduce the spec in the control panel. The app must attach the existing managed database and use `${messconnect-db.DATABASE_PRIVATE_URL}`. Add the app as a database trusted source.
6. The app connects over the database's PUBLIC hostname with `sslmode=require`, not `DATABASE_PRIVATE_URL`. The private one was tried first and failed twice identically: the `migrate` job raised an asyncpg `TimeoutError` at step 7 of 13 reaching `private-messconnect-db-*`. App Platform components are not inside the cluster's VPC (`default-blr1`), so that hostname does not route for them, and adding the app as a trusted source did not change it. Access is restricted instead by trusted sources: `doctl databases firewalls list <cluster-id>` must show exactly `app:<app-id>` and nothing else. Note that a newly created cluster has an EMPTY trusted-source list, which for DO managed Postgres means reachable from any address on the internet -- adding the app rule is what closes that, and it is not optional.
7. The `migrate` pre-deploy job runs `alembic upgrade head`. The web component starts only after that succeeds. The `/health` readiness and liveness checks verify both API and database access.
8. The `daily-reconciliation` job runs at 01:00 `Asia/Kolkata`, calculates the previous day's missed-meal fines, and purges expired refresh tokens. Verify its first invocation and resulting rows before relying on it.
9. For an empty database, open a one-off console and run `python -m scripts.bootstrap_admin`. It refuses to create a second super administrator. Do not run demo seed commands in production.
10. Add the production domain after the generated `.ondigitalocean.app` URL passes staging. The app uses the same origin for frontend and API; `${APP_URL}` supplies the allowed origin. Verify login, refresh cookies, menu publication, student meal changes, QR and bulk attendance, committee expiry/revocation, ledger and inventory operations, billing preview/publication, payment submission/review, reconciliation, and logout through the final domain before switching DNS.

## Existing database migration

If the Render database contains records, do not create accounts or seed the DigitalOcean database. Take a PostgreSQL export, restore it into the new managed cluster, run Alembic, and compare record counts for users, meals, attendance, fines, billing revisions, and audit logs. Rehearse this on an isolated database first. During the final cutover, stop writes on the old application, take a final export, restore and validate it, then switch DNS. Keep the old service read-only until rollback risk has passed.

An immediate application rollback should deploy the previously reviewed image while leaving the additive schema in place. Do not run destructive Alembic downgrades against production data.

## Backups, and leaving DigitalOcean

DigitalOcean takes its own daily backups with point-in-time recovery, and those are the first line of defence. They are also non-portable: they restore only into another DigitalOcean cluster. They are therefore no help on the day we move to Hetzner, and no help if the account itself is the problem.

`ops/backup_db.sh` covers both gaps with one file. It takes a custom-format `pg_dump`, then refuses to call the result a backup unless the dump actually contains the tables whose loss is unrecoverable: `users`, `student_profiles`, `meal_selections`, `attendance`, `billing_periods`, `student_bill_snapshots`, `payment_submissions`. That check exists because a `pg_dump` pointed at the wrong database succeeds and exits 0.

Verified on 2026-09-18 against a local PostgreSQL 16 with the full Alembic schema: dump, restore into a separate empty database, matching row counts, the student row read back intact, `alembic_version` preserved at `20260917_regfields`, and the unique index on `registration_number` still rejecting a duplicate after restore.

Run it weekly during the first month, and keep the output off the laptop that is also the development machine. The files contain every student's name, date of birth and billing history, so `ops/backups/` is gitignored and the dumps should not go anywhere unencrypted or shared.

The Hetzner migration is that same dump plus `pg_restore`, which is why it is worth having the routine working before there is data that matters. What the first month on DigitalOcean is for is measuring the things that decide the target VPS size: peak concurrent students at meal times, actual memory use of the web container, database size growth, and whether two Uvicorn workers were enough. Move at a month boundary after a billing period is published and paid, never mid-month with an open period, and keep the DigitalOcean app running read-only until the new host has served a full meal cycle.

## Platform-specific security

`TRUST_PROXY_HEADERS=true` is set only on the App Platform web component. App Platform is the public ingress and the container has no direct public address, so the application may use the first validated `X-Forwarded-For` address for rate limiting. Local and direct-host deployments keep the default `false`; enabling it on a directly reachable server would allow callers to forge addresses.

The application budgets its database connections explicitly against the cluster's 47-connection ceiling: two web workers at 8 + 8 each is 32, and the two jobs are capped at 4 each because they do not inherit the web component's environment and would otherwise take the 5 + 5 default from `config.py`. That is 40, leaving 7 spare. It disables test mode, requires independent signing keys, and exposes no production API documentation. Sensitive responses remain non-cacheable and migrations and seed operations do not run inside web workers.

## Required staging evidence

- DigitalOcean build and pre-deploy migration succeed from a clean `main` checkout.
- `/health` remains healthy during normal traffic and a service restart.
- A backup can be restored into an isolated database and its key record counts match.
- Forwarded-client addresses behave correctly behind DigitalOcean ingress while a direct forged header remains untrusted outside that environment.
- The 1 GiB instance completes the representative meal-time burst without memory restarts or unacceptable latency.
- The scheduled reconciliation runs once, remains idempotent on a repeat, and produces the intended opted-in-days-plus-fines results.
- All critical mobile and desktop flows pass through the final HTTPS domain, including the Operations screen and student payment confirmation.

Production remains conditionally ready until these checks are completed on DigitalOcean. The existing local verification is recorded under `docs/verification/` and covers the application behavior, database mutations, billing calculations, frontend build, dependency audits, and representative load; it does not certify the new cloud environment.
