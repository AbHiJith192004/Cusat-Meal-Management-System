"""Standalone fine reconciliation script for OS cron / scheduled tasks."""
import asyncio
import sys
from datetime import date, timedelta

from app.database import async_session_factory
from app.services.fine_service import FineService
from app.utils.timezone import today_ist


async def main():
    target_date = today_ist() - timedelta(days=1)  # Default yesterday
    if len(sys.argv) > 1:
        target_date = date.fromisoformat(sys.argv[1])

    print(f"[RECONCILIATION] Starting fine reconciliation for {target_date.isoformat()}...")

    async with async_session_factory() as session:
        service = FineService(session)
        total = 0
        for mt in ["BREAKFAST", "LUNCH", "DINNER"]:
            created = await service.reconcile_missed_meals(target_date, mt)
            print(f"  {mt}: {created} fines generated")
            total += created

        await session.commit()
        print(f"[RECONCILIATION] Completed. Total fines generated: {total}")


if __name__ == "__main__":
    asyncio.run(main())
