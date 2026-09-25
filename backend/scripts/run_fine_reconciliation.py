"""Nightly fine reconciliation, run by the daily-reconciliation SCHEDULED job.

This writes an audit row for every run, success or failure. It is the only
record that the run happened at all: the fines it creates are audited
individually, so a night with no fines legitimately due and a night where
this never executed were previously indistinguishable in the database. The
platform has no alert rule for a scheduled job failing, so silence was the
only symptom -- and the first visible consequence would have been a wrong
monthly bill, weeks later.
"""
import asyncio
import sys
from datetime import date, timedelta

from app.database import async_session_factory, close_db
from app.repositories.audit_repo import AuditRepository
from app.repositories.user_repo import RefreshTokenRepository
from app.services.fine_service import FineService
from app.utils.timezone import now_ist, today_ist


async def record(action: str, metadata: dict) -> None:
    """Write the run's outcome in a session of its own.

    A failure leaves the working session in a rolled-back transaction that
    cannot be written through, so this cannot ride along with it. actor_id is
    null: a cron job is not a user, and the column allows it.
    """
    async with async_session_factory() as session:
        await AuditRepository(session).log(
            actor_id=None,
            action=action,
            target_type="reconciliation",
            metadata=metadata,
        )
        await session.commit()


async def main(target_date: date | None = None):
    """Reconcile `target_date`, defaulting to yesterday.

    The date is a parameter rather than something read from sys.argv in here,
    so this can be called directly -- by a test, or by anything else that
    wants the same work without pretending to be a command line.
    """
    if target_date is None:
        target_date = today_ist() - timedelta(days=1)

    started = now_ist()
    print(f"[RECONCILIATION] Starting fine reconciliation for {target_date.isoformat()}...")

    try:
        try:
            async with async_session_factory() as session:
                service = FineService(session)
                per_meal = {}
                for mt in ["BREAKFAST", "LUNCH", "DINNER"]:
                    created = await service.reconcile_missed_meals(target_date, mt)
                    print(f"  {mt}: {created} fines generated")
                    per_meal[mt] = created

                await session.commit()
                purged = await RefreshTokenRepository(session).purge_expired()
                total = sum(per_meal.values())
                print(f"[RECONCILIATION] Completed. Total fines generated: {total}")
                print(f"[CLEANUP] Removed {purged} expired or old revoked refresh tokens")

            await record("RECONCILIATION_COMPLETED", {
                "target_date": target_date.isoformat(),
                "started_at": started.isoformat(),
                "fines_created": total,
                "per_meal": per_meal,
                "tokens_purged": purged,
            })
        except Exception as exc:
            # Record the failure, then re-raise so the process exits non-zero
            # and the platform marks the job failed. Recording is best effort:
            # if the database is what broke, this cannot work either, and the
            # original error is the one worth surfacing.
            try:
                await record("RECONCILIATION_FAILED", {
                    "target_date": target_date.isoformat(),
                    "started_at": started.isoformat(),
                    "error": f"{type(exc).__name__}: {exc}"[:500],
                })
            except Exception as also:  # noqa: BLE001 - never mask the real error
                print(f"[RECONCILIATION] Could not record the failure: {also}", file=sys.stderr)
            print(f"[RECONCILIATION] FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            raise
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main(date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else None))
