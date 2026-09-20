"""Validate system settings before they are written.

`update_settings` used to store whatever string it was handed. That was
survivable while the only way in was a hand-written curl, and it stops being
survivable the moment there is a screen for it.

The meal windows are the sharp edge. `MealTimingService.get_meal_window` does
`map(int, value.split(":"))`, so a value of "12.00" or "noon" raises inside
`GET /api/v1/meals` -- the endpoint every student's home screen and meal
planner calls. One typo would take meal selection down for the whole hostel,
and the bad value would still be sitting in the database after a restart.

So the keys the application parses are checked here, before the write. Keys
this module does not know are passed through unchanged, exactly as before:
this is a guard on the ones that can break something, not a new whitelist that
would reject settings added later.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from app.services.meal_timing_service import DEFAULT_SETTINGS
from app.utils.exceptions import ValidationException

MEALS = ("breakfast", "lunch", "dinner")

# "7:00" and "07:00" both parse; anything else does not.
_CLOCK = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _minutes(value: str) -> int | None:
    m = _CLOCK.match((value or "").strip())
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def _clock_key(key: str, value: str, label: str) -> None:
    if _minutes(value) is None:
        raise ValidationException(
            message=f"{label} must be a 24-hour time like 12:00 or 09:30. Got {value!r}.",
            code="SETTING_INVALID_TIME",
            details={"key": key},
        )


def _int_key(key: str, value: str, label: str, low: int, high: int) -> None:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValidationException(
            message=f"{label} must be a whole number. Got {value!r}.",
            code="SETTING_NOT_A_NUMBER",
            details={"key": key},
        ) from None
    if not low <= number <= high:
        raise ValidationException(
            message=f"{label} must be between {low} and {high}. Got {number}.",
            code="SETTING_OUT_OF_RANGE",
            details={"key": key},
        )


def _money_key(key: str, value: str, label: str) -> None:
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationException(
            message=f"{label} must be an amount like 30.00. Got {value!r}.",
            code="SETTING_NOT_A_NUMBER",
            details={"key": key},
        ) from None
    if amount < 0:
        raise ValidationException(
            message=f"{label} cannot be negative.",
            code="SETTING_OUT_OF_RANGE",
            details={"key": key},
        )


def validate_settings(incoming: dict[str, str], stored: dict[str, str]) -> None:
    """Raise ValidationException if any known setting would be left invalid.

    `incoming` is what this request changes, `stored` what the database holds
    now. Both are needed for the start/end comparison: a request may move only
    one end of a window, and it still has to end up after the other one.
    """
    for key, value in incoming.items():
        if key.startswith("meal_window_"):
            _clock_key(key, value, key.replace("_", " "))
        elif key == "selection_cutoff_time":
            _clock_key(key, value, "The opt-out cutoff time")
        elif key == "selection_cutoff_advance_days":
            _int_key(key, value, "Cutoff advance days", 0, 7)
        elif key == "max_monthly_mess_cuts":
            _int_key(key, value, "Maximum monthly mess cuts", 0, 31)
        elif key == "qr_validity_seconds":
            # Below ~15s a student cannot get the phone out of their pocket in
            # time. The ceiling is 2 minutes: nobody sees a face at the door
            # (a deliberate trade for queue speed), so the pass's short life is
            # what stops a screenshot being forwarded to a friend. Five minutes
            # would be generous to the queue and generous to that too.
            _int_key(key, value, "Pass validity in seconds", 15, 120)
        elif key == "fine_amount":
            _money_key(key, value, "The missed-meal fine")

    # DEFAULT_SETTINGS first, because that is what MealTimingService falls back
    # to when a row is absent. Skipping the comparison for a missing row would
    # let an end time be set before the start the application is really using.
    effective = {**DEFAULT_SETTINGS, **stored, **incoming}
    for meal in MEALS:
        start_raw = effective.get(f"meal_window_{meal}_start")
        end_raw = effective.get(f"meal_window_{meal}_end")
        if start_raw is None or end_raw is None:
            continue
        start, end = _minutes(start_raw), _minutes(end_raw)
        # A stored value could already be malformed from before this guard
        # existed; do not block an edit that is on its way to fixing it.
        if start is None or end is None:
            continue
        if start >= end:
            raise ValidationException(
                message=(
                    f"{meal.capitalize()} would start at {start_raw} and end at {end_raw}. "
                    "The end must be after the start."
                ),
                code="SETTING_WINDOW_INVERTED",
                details={"key": f"meal_window_{meal}_end"},
            )
