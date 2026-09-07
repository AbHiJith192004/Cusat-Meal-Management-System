"""Publication takes an exclusive lock; independent student writes can share it."""
from sqlalchemy import select, text
from app.models.billing import BillingPeriod
from app.utils.exceptions import ConflictException

async def lock_open_period(session, day, *, exclusive=False):
    function = 'pg_advisory_xact_lock' if exclusive else 'pg_advisory_xact_lock_shared'
    await session.execute(text(f'SELECT {function}(734201, :period)'), {'period': day.year * 12 + day.month})
    published = await session.scalar(select(BillingPeriod.is_published).where(
        BillingPeriod.year == day.year, BillingPeriod.month == day.month))
    if published:
        raise ConflictException(message='This billing month is published. Reopen it with a correction reason before changing billing inputs.', code='BILL_PERIOD_FROZEN')
