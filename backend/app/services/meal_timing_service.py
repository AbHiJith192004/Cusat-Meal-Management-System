import logging
from datetime import date, datetime, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.settings_repo import SystemSettingRepository
from app.config import get_settings
from app.utils.timezone import now_ist, IST

logger = logging.getLogger(__name__)

# Weekends run later and shorter than weekdays -- the kitchen and the students
# both start later on a Saturday. Only breakfast and lunch actually differ
# today, but dinner carries its own weekend pair anyway so the office can move
# one without the other later.
WEEKEND_SUFFIX = "_weekend"


def window_keys(meal: str, on_date: date) -> tuple[str, str]:
    """The (start_key, end_key) that govern `meal` on `on_date`.

    Saturday and Sunday use the weekend pair. This is the only place that
    decides which set applies, so the settings screen, the validator, the
    student's meal list and the fine reconciliation cannot drift apart on it.
    """
    suffix = WEEKEND_SUFFIX if on_date.weekday() >= 5 else ""
    meal = meal.lower()
    return f"meal_window_{meal}_start{suffix}", f"meal_window_{meal}_end{suffix}"


DEFAULT_SETTINGS = {
    "meal_window_breakfast_start": "07:15",
    "meal_window_breakfast_end": "08:30",
    "meal_window_lunch_start": "12:15",
    "meal_window_lunch_end": "13:45",
    "meal_window_dinner_start": "19:45",
    "meal_window_dinner_end": "20:45",
    "meal_window_breakfast_start_weekend": "08:30",
    "meal_window_breakfast_end_weekend": "09:30",
    "meal_window_lunch_start_weekend": "13:00",
    "meal_window_lunch_end_weekend": "14:00",
    "meal_window_dinner_start_weekend": "19:45",
    "meal_window_dinner_end_weekend": "20:45",
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

    async def get_qr_validity_seconds(self) -> int:
        """How long an issued meal pass stays valid.

        The setting row wins when it is present and sane; otherwise the
        environment value (QR_VALIDITY_SECONDS, itself defaulting to 60). That
        order keeps any deployment that sets the variable working exactly as
        before while making the row the operational control once the mess
        office uses it.

        Garbage falls back rather than raising: this is on the path that issues
        every student's pass, and a typo in a settings row must not stop the
        dining hall working.
        """
        fallback = get_settings().QR_VALIDITY_SECONDS
        # Deliberately NOT _get_val: that substitutes DEFAULT_SETTINGS when the
        # row is absent, which would make "no row" indistinguishable from
        # "row says 60" and quietly override a deployment that sets
        # QR_VALIDITY_SECONDS in its environment. Absent means absent here.
        setting = await self.settings_repo.get_by_key("qr_validity_seconds")
        if setting is None:
            return fallback
        raw = setting.value
        try:
            value = int(str(raw).strip())
        except (TypeError, ValueError):
            logger.warning(
                "qr_validity_seconds is not a number (%r); using %d", raw, fallback
            )
            return fallback
        # Mirrors the bounds settings_validation enforces on the way in. A row
        # written before that guard existed could still be outside them.
        if not 15 <= value <= 120:
            logger.warning(
                "qr_validity_seconds %d is outside 15-120; using %d", value, fallback
            )
            return fallback
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

    async def get_meal_window(self, meal_type: str, on_date: date) -> tuple[time, time]:
        """(start_time, end_time) for a meal ON A PARTICULAR DATE.

        The date is required, not optional with a today default: weekends have
        their own windows, and a caller that forgot to pass the day it cares
        about would silently judge a Saturday by the weekday times. The fine
        reconciliation is exactly that caller -- it runs after midnight about
        the day before.
        """
        start_key, end_key = window_keys(meal_type, on_date)
        start_str = await self._get_val(start_key)
        end_str = await self._get_val(end_key)

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

        start_time, end_time = await self.get_meal_window(meal_type, target_date)
        cur_time = now.timetz()
        return start_time <= cur_time <= end_time
