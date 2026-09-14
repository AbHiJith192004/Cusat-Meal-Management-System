import logging
from datetime import date, datetime, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.settings_repo import SystemSettingRepository
from app.config import get_settings
from app.utils.timezone import now_ist, IST

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "meal_window_breakfast_start": "07:00",
    "meal_window_breakfast_end": "09:30",
    "meal_window_lunch_start": "12:00",
    "meal_window_lunch_end": "14:30",
    "meal_window_dinner_start": "19:00",
    "meal_window_dinner_end": "21:30",
    "selection_cutoff_time": "21:00",
    "selection_cutoff_advance_days": "1",
    "fine_amount": "30.00",
    "qr_validity_seconds": "60",
    "max_monthly_mess_cuts": "10",
}


class MealTimingService:
    """Centralized service for meal window timing and selection cutoff calculations."""

    def __init__(self, session: AsyncSession):
        self.settings_repo = SystemSettingRepository(session)

    async def _get_val(self, key: str) -> str:
        setting = await self.settings_repo.get_by_key(key)
        if setting:
            return setting.value
        return DEFAULT_SETTINGS.get(key, "")

    async def get_max_monthly_mess_cuts(self) -> int:
        """How many full-day mess cuts a student may take in one calendar month.

        Read from the system settings rather than hardcoded, so the figure the
        Super Admin sees on the settings screen is the one actually enforced.
        It used to be a literal 10 in meal_service while this setting existed
        and was never read, which meant editing it silently did nothing.

        update_settings stores whatever string it is given with no validation,
        so a typo must not break meal selection for every student: anything
        non-numeric or negative falls back to the default and is logged.
        """
        raw = await self._get_val("max_monthly_mess_cuts")
        default = int(DEFAULT_SETTINGS["max_monthly_mess_cuts"])
        try:
            value = int(str(raw).strip())
        except (TypeError, ValueError):
            logger.warning(
                "max_monthly_mess_cuts is not a number (%r); using %d", raw, default
            )
            return default
        if value < 0:
            logger.warning(
                "max_monthly_mess_cuts is negative (%d); using %d", value, default
            )
            return default
        # Zero is honoured, not treated as unset: it is a legitimate way to
        # suspend mess cuts entirely, e.g. during exam weeks.
        return value

    async def get_cutoff_datetime(self, target_date: date) -> datetime:
        """Calculate the cutoff datetime for a target meal date.
        
        Default: 21:00 (9:00 PM) IST on the day before (advance_days=1).
        """
        cutoff_time_str = await self._get_val("selection_cutoff_time")
        advance_days_str = await self._get_val("selection_cutoff_advance_days")

        h, m = map(int, cutoff_time_str.split(":"))
        advance_days = int(advance_days_str)

        cutoff_date = target_date - timedelta(days=advance_days)
        return datetime(cutoff_date.year, cutoff_date.month, cutoff_date.day, h, m, 0, tzinfo=IST)

    async def is_selection_locked(self, target_date: date, current_dt: datetime | None = None) -> bool:
        """Check if meal selection is locked for target_date at current_dt (default now_ist())."""
        now = current_dt or now_ist()
        cutoff_dt = await self.get_cutoff_datetime(target_date)
        return now >= cutoff_dt

    async def get_meal_window(self, meal_type: str) -> tuple[time, time]:
        """Get (start_time, end_time) for a meal type."""
        mt = meal_type.lower()
        start_str = await self._get_val(f"meal_window_{mt}_start")
        end_str = await self._get_val(f"meal_window_{mt}_end")

        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))

        return time(sh, sm, tzinfo=IST), time(eh, em, tzinfo=IST)

    async def is_within_meal_window(
        self, meal_type: str, target_date: date, current_dt: datetime | None = None
    ) -> bool:
        """Check if current_dt is inside the meal service window on target_date.
        
        When ALLOW_TEST_MODE is True, always returns True for testing.
        """
        settings = get_settings()
        if settings.ALLOW_TEST_MODE:
            return True

        now = current_dt or now_ist()
        if now.date() != target_date:
            return False

        start_time, end_time = await self.get_meal_window(meal_type)
        cur_time = now.timetz()
        return start_time <= cur_time <= end_time
