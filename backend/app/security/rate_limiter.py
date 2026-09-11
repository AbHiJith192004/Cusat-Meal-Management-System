"""Auth throttling, all of it backed by the `auth_rate_limits` table.

Two complementary controls, deliberately keyed differently:

* a per-IP request limit, which stops one host hammering the service; and
* a per-account *failure* lockout, which stops a distributed guess against a
  single account. Under campus NAT the per-IP limit is necessarily coarse -
  a whole hostel shares one public address - so the per-account lockout is
  what actually protects an individual credential.

Both live in Postgres rather than process memory. An in-memory version used
to sit here; it could not survive a restart and silently weakened as soon as
more than one worker ran, which is exactly when throttling matters most.
"""
import hashlib
import logging

from fastapi import Request
from sqlalchemy import text

from app.utils.exceptions import RateLimitExceededException

logger = logging.getLogger(__name__)


class RateLimitConfig:
    """Configuration for a rate limit rule."""

    __slots__ = ("max_requests", "window_seconds")

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds


def _limits_for_env() -> dict[str, RateLimitConfig]:
    """Development keeps loose limits so local testing is not fighting the
    limiter. These are the values the endpoints actually use - the handlers
    used to inline their own numbers, so the production figures named here
    were never the ones enforced.

    The per-IP login and refresh ceilings are intentionally high: students
    share a campus NAT address, so a tight per-IP limit locks out the whole
    hostel rather than an attacker. Credential guessing is bounded by the
    per-account lockout below instead.
    """
    from app.config import get_settings

    if get_settings().is_development:
        return {
            "login": RateLimitConfig(max_requests=600, window_seconds=60),
            "activation": RateLimitConfig(max_requests=50, window_seconds=60),
            "refresh": RateLimitConfig(max_requests=600, window_seconds=60),
        }
    return {
        "login": RateLimitConfig(max_requests=300, window_seconds=60),
        "activation": RateLimitConfig(max_requests=5, window_seconds=60),
        "refresh": RateLimitConfig(max_requests=600, window_seconds=60),
    }


_LIMITS = _limits_for_env()

LOGIN_RATE_LIMIT = _LIMITS["login"]
ACTIVATION_RATE_LIMIT = _LIMITS["activation"]
REFRESH_RATE_LIMIT = _LIMITS["refresh"]

# Per-account setup-code attempts. Separate from login because activation is
# a different credential with a different blast radius.
SETUP_ACCOUNT_RATE_LIMIT = RateLimitConfig(max_requests=5, window_seconds=900)


def get_client_ip(request: Request) -> str:
    """Use the ingress-provided client address only with explicit opt-in.

    Direct deployments must leave TRUST_PROXY_HEADERS disabled because a
    caller can otherwise forge X-Forwarded-For and bypass per-IP limits.
    """
    import ipaddress
    from app.config import get_settings

    if get_settings().TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def check_shared_rate_limit(key: str, config: RateLimitConfig) -> None:
    """Atomic fixed-window limits shared by all workers; persisted even on auth failure.

    Expired buckets are deleted through an indexed expiry lookup. A fresh
    window starts at the first request, rather than at a global clock boundary.
    """
    from app.database import async_session_factory

    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(text("DELETE FROM auth_rate_limits WHERE expires_at < now()"))
            result = await session.execute(text("""
                INSERT INTO auth_rate_limits (key, attempts, expires_at)
                VALUES (:key, 1, now() + make_interval(secs => :window))
                ON CONFLICT (key) DO UPDATE SET attempts = auth_rate_limits.attempts + 1
                RETURNING attempts
            """), {"key": _digest(key), "window": config.window_seconds})
            attempts = result.scalar_one()
    if attempts > config.max_requests:
        raise RateLimitExceededException(message="Too many attempts. Please try again later.")


# --- Per-account failure lockout -------------------------------------------
# Counts failures only, so a legitimate user signing in repeatedly is never
# throttled by their own successes. A success clears the record.

def _lockout_key(registration_number: str) -> str:
    return _digest(f"login-failures:{registration_number.strip().upper()}")


async def check_account_lockout(registration_number: str) -> int:
    """Reject before verifying a password if the account is locked out.

    Returns the current failure count so the caller can skip the clearing
    round-trip on the overwhelmingly common case of a clean sign-in.
    """
    from app.config import get_settings
    from app.database import async_session_factory

    settings = get_settings()
    async with async_session_factory() as session:
        attempts = await session.scalar(text(
            "SELECT attempts FROM auth_rate_limits WHERE key = :key AND expires_at > now()"
        ), {"key": _lockout_key(registration_number)})
    if attempts is not None and attempts >= settings.AUTH_MAX_FAILED_ATTEMPTS:
        logger.warning("Account lockout active for registration number ending %s",
                       registration_number.strip()[-3:])
        raise RateLimitExceededException(
            message=f"Too many failed sign-in attempts. Try again in "
                    f"{settings.AUTH_LOCKOUT_MINUTES} minutes."
        )
    return attempts or 0


async def record_auth_failure(registration_number: str) -> None:
    """Count one failed sign-in. The window starts at the first failure."""
    from app.config import get_settings
    from app.database import async_session_factory

    window = get_settings().AUTH_LOCKOUT_MINUTES * 60
    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(text("""
                INSERT INTO auth_rate_limits (key, attempts, expires_at)
                VALUES (:key, 1, now() + make_interval(secs => :window))
                ON CONFLICT (key) DO UPDATE SET attempts = auth_rate_limits.attempts + 1
            """), {"key": _lockout_key(registration_number), "window": window})


async def clear_auth_failures(registration_number: str) -> None:
    """Drop the failure record after a successful sign-in."""
    from app.database import async_session_factory

    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(
                text("DELETE FROM auth_rate_limits WHERE key = :key"),
                {"key": _lockout_key(registration_number)},
            )
