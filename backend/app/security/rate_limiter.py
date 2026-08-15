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


# Global rate limiter instance
rate_limiter = SlidingWindowRateLimiter()

# Pre-defined rate limit configurations
LOGIN_RATE_LIMIT = RateLimitConfig(max_requests=100, window_seconds=60)     # 100 per min (dev)
ACTIVATION_RATE_LIMIT = RateLimitConfig(max_requests=50, window_seconds=60) # 50 per min (dev)
REFRESH_RATE_LIMIT = RateLimitConfig(max_requests=100, window_seconds=60)    # 100 per min
GENERAL_RATE_LIMIT = RateLimitConfig(max_requests=300, window_seconds=60)    # 300 per min


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, considering proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"
