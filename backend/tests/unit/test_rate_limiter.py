"""Throttling surfaces that need no database.

The old version of this file exercised an in-memory SlidingWindowRateLimiter
that production never used, so it passed while the real DB-backed limiter went
untested. The bucket-counting logic now lives in Postgres and is covered by
prod_tests; what is unit-testable here is the keying and the configuration.
"""
from app.security.rate_limiter import (
    ACTIVATION_RATE_LIMIT,
    LOGIN_RATE_LIMIT,
    REFRESH_RATE_LIMIT,
    RateLimitConfig,
    _lockout_key,
)


def test_lockout_key_normalizes_registration_number():
    """Case and surrounding whitespace must not create separate buckets,
    or an attacker sidesteps the lockout by varying the spelling."""
    canonical = _lockout_key("TEST001")
    assert _lockout_key(" test001 ") == canonical
    assert _lockout_key("Test001") == canonical


def test_lockout_key_is_hashed_and_distinct_per_account():
    key = _lockout_key("TEST001")
    assert "TEST001" not in key           # raw identifiers never hit the table
    assert len(key) == 64                 # sha256 hex
    assert _lockout_key("TEST002") != key


def test_configured_limits_are_populated():
    for limit in (LOGIN_RATE_LIMIT, ACTIVATION_RATE_LIMIT, REFRESH_RATE_LIMIT):
        assert isinstance(limit, RateLimitConfig)
        assert limit.max_requests > 0
        assert limit.window_seconds > 0


def test_per_ip_login_limit_tolerates_shared_campus_nat():
    """A whole hostel shares one public address, so a tight per-IP login
    ceiling locks out legitimate students. Guessing is bounded by the
    per-account failure lockout instead."""
    assert LOGIN_RATE_LIMIT.max_requests >= 100
