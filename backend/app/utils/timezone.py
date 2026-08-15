from datetime import date, datetime, time
from zoneinfo import ZoneInfo

# Single source of truth for timezone
IST = ZoneInfo("Asia/Kolkata")


def now_ist() -> datetime:
    """Get current datetime in Asia/Kolkata timezone."""
    return datetime.now(IST)


def today_ist() -> date:
    """Get current date in Asia/Kolkata timezone."""
    return now_ist().date()


def to_ist(dt: datetime) -> datetime:
    """Convert a datetime to Asia/Kolkata timezone."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


def make_ist(
    year: int,
    month: int,
    day: int,
    hour: int = 0,
    minute: int = 0,
    second: int = 0,
) -> datetime:
    """Create a timezone-aware datetime in Asia/Kolkata."""
    return datetime(year, month, day, hour, minute, second, tzinfo=IST)


def make_ist_time(hour: int, minute: int = 0, second: int = 0) -> time:
    """Create a time object (used for meal window comparisons)."""
    return time(hour, minute, second, tzinfo=IST)


def is_time_between(current: time, start: time, end: time) -> bool:
    """Check if current time is between start and end (inclusive)."""
    return start <= current <= end
