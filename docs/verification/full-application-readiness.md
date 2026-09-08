---
verified: 2026-09-08
scope: complete_application_except_live_cloud_deployment
result: passed_locally
---

# Full application readiness evidence

The modules previously excluded from the production release now use PostgreSQL as their source of truth. The implementation includes menu publication, purchase and expense ledger entries, inventory items and movements, committee scanner assignments, bulk attendance, and bill-bound UTR payment review.

## Integrity controls

- Menu records are unique by service date and meal, and student meal responses include only the published record.
- Financial entries are voided with a reason and audit event; original records remain available.
- Billing can populate purchase, operating, and administrative totals from non-voided ledger entries for the selected month.
- Inventory movements lock the item row and reject a negative resulting balance.
- Committee scanner access has a start, expiry, scope, assignment history, and revocation history. It does not grant general administrator access.
- Bulk attendance accepts at most 300 distinct active students and writes the full batch atomically. Existing attendance rejects the full request.
- A UTR is globally unique and must match the exact amount and revision of a published student bill. A review can happen once. Bills with pending or verified payments cannot be reopened.
- Every privileged mutation adds an append-only audit event.

## Local verification

| Check | Result |
|---|---|
| Production integration suite | 19 passed |
| Backend unit suite | 17 passed |
| Clean migration upgrade, downgrade, upgrade | Passed |
| Alembic model/schema drift check | Passed |
| TypeScript type check | Passed |
| Vite production build | Passed |
| npm production dependency audit | 0 known vulnerabilities |
| Python dependency audit | 0 known vulnerabilities |
| 300 concurrent durable meal-selection writes, one worker | 300/300 HTTP 200 and 300/300 rows persisted; p95 2290 ms, p99 2455 ms |
| Operations page render at 320 px and 1440 px | No horizontal overflow, browser runtime errors, or automated accessibility violations |

The integration suite exercises persisted read-after-write behavior, validation, role boundaries, committee scanner authorization, atomic conflict handling, audit creation, payment amount binding, one-time payment review, and the block on reopening a paid bill.

DigitalOcean build, managed database restore, ingress behavior, scheduled-job execution, final-domain cookies, and mobile/desktop acceptance checks require a live staging environment. They remain release gates in the deployment runbook rather than claims made by local testing.
