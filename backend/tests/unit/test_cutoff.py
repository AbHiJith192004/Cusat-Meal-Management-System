"""Selection cutoff and meal windows, exercised through the real service.

The previous version of this file defined its own calculate_cutoff() and
asserted against that, so MealTimingService itself was never executed and a
change to the real cutoff maths would not have failed anything here.

MealTimingService only needs its settings repository, so a stub repo is enough
to drive the real code with no database. get_by_key returning None is the
genuine "setting not configured" path, which falls back to DEFAULT_SETTINGS.
"""
from datetime import date, time

import pytest

from app.services.meal_timing_service import DEFAULT_SETTINGS, MealTimingService
from app.utils.timezone import IST, make_ist


class _StubSettingsRepo:
    """Stands in for SystemSettingRepository. `values` holds overrides; any key
    not present returns None, exactly as an unconfigured setting would."""

    def __init__(self, values: dict[str, str] | None = None):
        self.values = values or {}

    async def get_by_key(self, key: str):
        if key not in self.values:
            return None
        return type("Setting", (), {"value": self.values[key]})()


def _service(overrides: dict[str, str] | None = None) -> MealTimingService:
    service = MealTimingService.__new__(MealTimingService)
    service.settings_repo = _StubSettingsRepo(overrides)
    return service


@pytest.mark.asyncio
async def test_cutoff_defaults_to_2100_ist_the_previous_day():
    cutoff = await _service().get_cutoff_datetime(date(2026, 8, 9))
    assert cutoff.date() == date(2026, 8, 8)
    assert (cutoff.hour, cutoff.minute) == (21, 0)
    assert cutoff.tzinfo == IST


@pytest.mark.asyncio
async def test_cutoff_follows_configured_time_and_advance_days():
    cutoff = await _service({
        'selection_cutoff_time': '18:30',
        'selection_cutoff_advance_days': '2',
    }).get_cutoff_datetime(date(2026, 8, 9))
    assert cutoff.date() == date(2026, 8, 7)
    assert (cutoff.hour, cutoff.minute) == (18, 30)


@pytest.mark.asyncio
async def test_selection_locks_at_the_cutoff_minute_not_after_it():
    service, target = _service(), date(2026, 8, 9)
    assert await service.is_selection_locked(target, make_ist(2026, 8, 8, 20, 59, 0)) is False
    # The boundary itself is closed: 21:00:00 is already locked.
    assert await service.is_selection_locked(target, make_ist(2026, 8, 8, 21, 0, 0)) is True
    assert await service.is_selection_locked(target, make_ist(2026, 8, 8, 21, 1, 0)) is True


@pytest.mark.asyncio
async def test_cutoff_crosses_a_month_boundary():
    cutoff = await _service().get_cutoff_datetime(date(2026, 9, 1))
    assert cutoff.date() == date(2026, 8, 31)


# 2026-08-10 is a Monday, 2026-08-08 a Saturday, 2026-08-09 a Sunday.
MONDAY, SATURDAY, SUNDAY = date(2026, 8, 10), date(2026, 8, 8), date(2026, 8, 9)


@pytest.mark.asyncio
async def test_meal_window_uses_defaults_when_unconfigured():
    start, end = await _service().get_meal_window('BREAKFAST', MONDAY)
    assert (start, end) == (time(7, 15, tzinfo=IST), time(8, 30, tzinfo=IST))
    assert DEFAULT_SETTINGS['meal_window_breakfast_start'] == '07:15'


@pytest.mark.asyncio
async def test_weekends_have_their_own_windows():
    """Saturday and Sunday run later than the working week.

    The date is not decoration on get_meal_window: pass the wrong day and it
    silently returns the wrong hours, which is why it is a required argument.
    """
    service = _service()
    assert await service.get_meal_window('BREAKFAST', MONDAY) == (
        time(7, 15, tzinfo=IST), time(8, 30, tzinfo=IST))
    assert await service.get_meal_window('BREAKFAST', SATURDAY) == (
        time(8, 30, tzinfo=IST), time(9, 30, tzinfo=IST))
    assert await service.get_meal_window('BREAKFAST', SUNDAY) == \
        await service.get_meal_window('BREAKFAST', SATURDAY)

    assert await service.get_meal_window('LUNCH', MONDAY) == (
        time(12, 15, tzinfo=IST), time(13, 45, tzinfo=IST))
    assert await service.get_meal_window('LUNCH', SATURDAY) == (
        time(13, 0, tzinfo=IST), time(14, 0, tzinfo=IST))

    # Dinner is the same on both days today, and still reads its own weekend
    # keys, so the office can move one without the other later.
    assert await service.get_meal_window('DINNER', MONDAY) == \
        await service.get_meal_window('DINNER', SATURDAY) == (
            time(19, 45, tzinfo=IST), time(20, 45, tzinfo=IST))


@pytest.mark.asyncio
async def test_meal_window_lookup_is_case_insensitive():
    assert await _service().get_meal_window('lunch', MONDAY) == \
        await _service().get_meal_window('LUNCH', MONDAY)


@pytest.mark.asyncio
async def test_within_window_only_on_the_meal_date_and_inside_the_hours():
    service = _service()
    inside = make_ist(2026, 8, 10, 12, 30, 0)
    assert await service.is_within_meal_window('LUNCH', MONDAY, inside) is True
    # Right time of day, wrong day: a QR from yesterday must not scan today.
    assert await service.is_within_meal_window('LUNCH', date(2026, 8, 11), inside) is False
    assert await service.is_within_meal_window('LUNCH', MONDAY,
                                               make_ist(2026, 8, 10, 12, 14, 0)) is False
    assert await service.is_within_meal_window('LUNCH', MONDAY,
                                               make_ist(2026, 8, 10, 13, 46, 0)) is False


@pytest.mark.asyncio
async def test_the_window_checked_is_the_one_for_that_day_of_the_week():
    """12:30 is lunch on a Monday and too early for it on a Sunday."""
    service = _service()
    assert await service.is_within_meal_window(
        'LUNCH', MONDAY, make_ist(2026, 8, 10, 12, 30, 0)) is True
    assert await service.is_within_meal_window(
        'LUNCH', SUNDAY, make_ist(2026, 8, 9, 12, 30, 0)) is False
    # ...and 13:30 is lunch on the Sunday but past it on the Monday.
    assert await service.is_within_meal_window(
        'LUNCH', SUNDAY, make_ist(2026, 8, 9, 13, 30, 0)) is True
    assert await service.is_within_meal_window(
        'LUNCH', MONDAY, make_ist(2026, 8, 10, 13, 50, 0)) is False


@pytest.mark.asyncio
async def test_window_boundaries_are_inclusive_at_both_ends():
    service = _service()
    for moment in (make_ist(2026, 8, 10, 12, 15, 0), make_ist(2026, 8, 10, 13, 45, 0)):
        assert await service.is_within_meal_window('LUNCH', MONDAY, moment) is True
    for moment in (make_ist(2026, 8, 9, 13, 0, 0), make_ist(2026, 8, 9, 14, 0, 0)):
        assert await service.is_within_meal_window('LUNCH', SUNDAY, moment) is True


@pytest.mark.asyncio
async def test_monthly_mess_cut_limit_defaults_to_ten():
    assert await _service().get_max_monthly_mess_cuts() == 10


@pytest.mark.asyncio
async def test_monthly_mess_cut_limit_follows_the_setting():
    assert await _service({'max_monthly_mess_cuts': '15'}).get_max_monthly_mess_cuts() == 15


@pytest.mark.asyncio
async def test_monthly_mess_cut_limit_of_zero_is_honoured():
    """Zero suspends mess cuts entirely - a real choice, not an unset value."""
    assert await _service({'max_monthly_mess_cuts': '0'}).get_max_monthly_mess_cuts() == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('bad', ['', '   ', 'ten', 'abc', '5.5', '-3', None])
async def test_unusable_limit_falls_back_instead_of_breaking_selection(bad):
    """update_settings stores any string with no validation, so a typo on the
    settings screen must not make meal selection raise for every student."""
    assert await _service({'max_monthly_mess_cuts': bad}).get_max_monthly_mess_cuts() == 10


@pytest.mark.asyncio
async def test_limit_tolerates_surrounding_whitespace():
    assert await _service({'max_monthly_mess_cuts': ' 12 '}).get_max_monthly_mess_cuts() == 12
