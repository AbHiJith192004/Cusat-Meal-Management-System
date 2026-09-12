# CUSAT Mess Management — Load Testing & Concurrency Guide

This document outlines the load testing scenario, concurrency goals, Locust configuration, and performance targets for the system.

---

## 1. Concurrency Goal & Scenarios

- **Target Capacity:** ~300 concurrent students (the entire hostel capacity accessing the system during peak meal hours).
- **Peak Hour Usage Pattern:**
  - 8:00 AM – 8:30 AM (Breakfast QR generation & scanning)
  - 1:00 PM – 1:30 PM (Lunch QR generation & scanning)
  - 7:30 PM – 8:30 PM (Dinner QR generation + selection cutoff lock at 8:30 PM)

---

## 2. Locust Load Test Setup

A pre-configured load test script is provided in `locustfile.py`.

### Execution Command
```bash
locust -f locustfile.py --headless -u 300 -r 30 -t 3m --host=http://localhost:8000
```

### Options Explained
- `-u 300`: Spawn 300 concurrent virtual users.
- `-r 30`: Ramp-up rate of 30 users per second (full 300 users in 10 seconds).
- `-t 3m`: Test duration of 3 minutes.
- `--host`: Target backend host URL.

> `on_start()` never calls `/api/v1/auth/login`, so every request currently
> runs with an empty `Authorization` header and only measures how fast the
> app returns 401s. Mint real tokens (e.g. `create_access_token` directly, as
> the actual local run below did) or add a login call before trusting numbers
> from this script.

---

## 3. Target SLA & Performance Budget

| Endpoint Group | Expected P95 Latency | Expected P99 Latency | Max Error Rate |
|---|---|---|---|
| Health Check (`GET /health`) | < 5ms | < 15ms | 0.00% |
| Student Dashboard (`GET /me/dashboard`) | < 50ms | < 120ms | < 0.1% |
| Meal Schedule (`GET /meals`) | < 40ms | < 100ms | < 0.1% |
| Selection Update (`PUT /meals/...`) | < 60ms | < 150ms | < 0.1% |
| QR Generation (`GET /attendance/qr`) | < 30ms | < 80ms | < 0.1% |
| QR Verification (`POST /attendance/verify`) | < 40ms | < 100ms | < 0.1% |
| QR Confirmation (`POST /attendance/confirm`) | < 70ms | < 180ms | 0.00% (Strict Transaction) |

---

## 4. Concurrency Guardrails & Protections

1. **DB Row Locking (`SELECT ... FOR UPDATE`):** Prevents duplicate attendance insertion under simultaneous admin scans.
2. **Database Unique Constraints:** `uq_attendance`, `uq_meal_selection`, and `uq_fine` act as structural safety nets against duplicate insertions even under race conditions.
3. **Async Connection Pooling:** SQLAlchemy engine configured per `.do/app.yaml` (`DB_POOL_SIZE=10`, `DB_MAX_OVERFLOW=10` per worker, `WEB_CONCURRENCY=2` → 40 pooled connections per instance) with `pool_pre_ping=True`. These are `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` env vars (`app/config.py`), not fixed code constants — verify the deployed values match this file rather than assuming it.
4. **Rate Limiting:** Auth endpoints are throttled through the `auth_rate_limits` table (`app/security/rate_limiter.py`) — a per-IP sliding window plus a failure-only per-account lockout, both shared across all workers/instances.

---

## 5. Measured Result (2026-09-12, local single-vCPU proxy)

Ran the actual mixed workload (dashboard, meal schedule, meal-selection writes,
notifications) at 300 concurrent synthetic students against a local backend
built with the exact production flags (`--no-proxy-headers`,
`TRUST_PROXY_HEADERS=true`) and connection-pool/worker settings. This is a
single-vCPU laptop, not DO's infrastructure, and the client, app, and database
all shared its cores, so treat these as directional, not authoritative —
re-run against real staging infra before trusting them for a go-live decision.

| Config (`WEB_CONCURRENCY` / pool+overflow, per worker) | P50 | P95 | P99 | Error rate |
|---|---|---|---|---|
| 1 / 5+5 (previous default) | 2.3s | 6.9s | 9.3s | 0% |
| 1 / 20+20 | 0.8–1.2s (two runs, see note) | 5.1–6.3s | 8.3–8.9s | 0% |
| 2 / 10+10 (current default, same 40-connection total budget) | 0.8s | 5.4s | 7.2s | 0% |

Correctness held at every setting: 0% HTTP error rate at every phase tested
(one transient `ReadError` per ~800-2000 requests under the heaviest spikes),
and persisted row counts matched expected writes exactly — no double bookings,
no dropped updates. The bottleneck was latency, not correctness, and it traced
to the connection pool: `db_connections` observed via `pg_stat_activity` capped
almost exactly at the configured pool ceiling, and worst-case latency at the
old 5+5 setting sat right at `DB_POOL_TIMEOUT`'s 10s default — i.e. requests
were queuing for a pool slot, not failing outright.

The two `1 / 20+20` figures (0.8s and 1.2s P50) came from separate runs of the
identical config and illustrate real run-to-run noise on shared, uncontrolled
hardware — a caution against reading small differences between nearby configs
as significant without repeated trials. What is consistent across every trial:
raising the pool from the previous 5+5 default produced a large, repeated
improvement (roughly 2-3x on P50); an intermediate value (15+10 per worker,
one trial) showed no such improvement, so the relationship is not simply
linear in pool size — don't extrapolate a specific intermediate value's
behaviour without testing it directly.

P95/P99 remained multi-second even at the best local settings, which — on a
laptop with a saturating client alongside the server — does not by itself mean
DO's real (separate-machine, presumably multi-core) infrastructure would show
the same tail. Re-run this same harness against actual staging infra with an
external load generator before concluding the tail latency is fixed.

Before raising `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` further, confirm the
provisioned `messconnect-db` plan's `max_connections` has headroom for
`WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` per `web` instance, plus
the `migrate` and `daily-reconciliation` jobs, plus any second instance if
`instance_count` is raised.
