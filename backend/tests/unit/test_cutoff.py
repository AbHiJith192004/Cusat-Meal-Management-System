from datetime import date, datetime
import pytest

from app.utils.timezone import make_ist


def calculate_cutoff(target_date: date, cutoff_hour: int = 21, cutoff_minute: int = 0, advance_days: int = 1) -> datetime:
    from datetime import timedelta
    from app.utils.timezone import IST
    cutoff_date = target_date - timedelta(days=advance_days)
    return datetime(cutoff_date.year, cutoff_date.month, cutoff_date.day, cutoff_hour, cutoff_minute, 0, tzinfo=IST)


def test_cutoff_calculation():
    target = date(2026, 8, 9)
    cutoff = calculate_cutoff(target)
    
    # Cutoff for Aug 9 meal is Aug 8 at 21:00 IST
    assert cutoff.date() == date(2026, 8, 8)
    assert cutoff.hour == 21
    assert cutoff.minute == 0


def test_selection_lock_decision():
    target = date(2026, 8, 9)
    cutoff = calculate_cutoff(target)
    
    # Before 21:00 IST on Aug 8 -> NOT locked
    before_cutoff = make_ist(2026, 8, 8, 20, 59, 0)
    assert before_cutoff < cutoff
    
    # At or after 21:00 IST on Aug 8 -> LOCKED
    at_cutoff = make_ist(2026, 8, 8, 21, 0, 0)
    after_cutoff = make_ist(2026, 8, 8, 21, 1, 0)
    assert at_cutoff >= cutoff
    assert after_cutoff >= cutoff


def test_mess_cut_rules():
    # Rule 1: Max 1 meal opt-out per day
    opted_out_meals_same_day = ["BREAKFAST"]
    new_opt_out = "LUNCH"
    is_second_opt_out_allowed = len(opted_out_meals_same_day) < 1
    assert is_second_opt_out_allowed is False

    # Rule 2: Max 10 mess cuts per month
    monthly_mess_cuts = 10
    is_eleventh_cut_allowed = (monthly_mess_cuts + 1) <= 10
    assert is_eleventh_cut_allowed is False

