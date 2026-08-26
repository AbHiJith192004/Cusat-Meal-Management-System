import time
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
from typing import Optional

from fastapi import Request

from app.utils.exceptions import RateLimitExceededException

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit rule."""
    max_requests: int
    window_seconds: int


class SlidingWindowRateLimiter:
    """In-memory sliding window rate limiter.
    
    Tracks request timestamps per key within a sliding time window.
    Thread-safe via locking. Suitable for single-process deployment.
    
    For multi-process deployment, replace with Redis-backed implementation.
    """

    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check_rate_limit(
        self,
        key: str,
        config: RateLimitConfig,
    ) -> None:
        """Check if a request is within the rate limit.
        
        Args:
            key: Identifier for the rate limit bucket (e.g., IP, user_id).
            config: Rate limit configuration.
            
        Raises:
            RateLimitExceededException: If the rate limit is exceeded.
        """
        now = time.monotonic()
        window_start = now - config.window_seconds

        with self._lock:
            # Remove expired timestamps
            self._requests[key] = [
                ts for ts in self._requests[key] if ts > window_start
            ]

            if len(self._requests[key]) >= config.max_requests:
                logger.warning("Rate limit exceeded for key: %s", key)
                raise RateLimitExceededException(
                    message=f"Too many requests. Limit: {config.max_requests} per {config.window_seconds}s."
                )

            self._requests[key].append(now)

    def cleanup(self) -> None:
        """Remove all expired entries. Call periodically to prevent memory growth."""
        now = time.monotonic()
        with self._lock:
            keys_to_delete = []
            for key, timestamps in self._requests.items():
                self._requests[key] = [ts for ts in timestamps if ts > now - 3600]
                if not self._requests[key]:
                    keys_to_delete.append(key)
            for key in keys_to_delete:
                del self._requests[key]


class AccountLockout:
    """Per-account failed-attempt lockout.

    The per-IP rate limit above only slows a single host down. Date of birth is
    a low-entropy factor, so a distributed guess against one account needs a
    limit that follows the *account*, not the caller. Counts only failures;
    a success clears the record.

    In-memory, like the rate limiter — single-process only. Move both to Redis
    together when this runs on more than one worker.
    """

    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def is_locked(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        now = time.monotonic()
        window_start = now - window_seconds
        with self._lock:
            recent = [ts for ts in self._failures[key] if ts > window_start]
            self._failures[key] = recent
            return len(recent) >= max_attempts

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def cleanup(self, window_seconds: int = 3600) -> None:
        now = time.monotonic()
        with self._lock:
            for key in list(self._failures):
                self._failures[key] = [ts for ts in self._failures[key] if ts > now - window_seconds]
                if not self._failures[key]:
                    del self._failures[key]


# Global instances
rate_limiter = SlidingWindowRateLimiter()
account_lockout = AccountLockout()


def _limits_for_env() -> dict[str, RateLimitConfig]:
    """Production gets real limits; development keeps loose ones so local
    testing is not fighting the limiter. Previously the loose "(dev)" values
    were the only values and shipped to production unchanged."""
    from app.config import get_settings

    if get_settings().is_development:
        return {
            "login": RateLimitConfig(max_requests=100, window_seconds=60),
            "activation": RateLimitConfig(max_requests=50, window_seconds=60),
            "refresh": RateLimitConfig(max_requests=100, window_seconds=60),
            "general": RateLimitConfig(max_requests=300, window_seconds=60),
        }
    return {
        "login": RateLimitConfig(max_requests=10, window_seconds=60),
        "activation": RateLimitConfig(max_requests=5, window_seconds=60),
        "refresh": RateLimitConfig(max_requests=30, window_seconds=60),
        "general": RateLimitConfig(max_requests=120, window_seconds=60),
    }


_LIMITS = _limits_for_env()

LOGIN_RATE_LIMIT = _LIMITS["login"]
ACTIVATION_RATE_LIMIT = _LIMITS["activation"]
REFRESH_RATE_LIMIT = _LIMITS["refresh"]
GENERAL_RATE_LIMIT = _LIMITS["general"]


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, considering proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"
