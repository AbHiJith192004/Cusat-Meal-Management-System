import pytest
import time
from app.security.rate_limiter import (
    SlidingWindowRateLimiter,
    RateLimitConfig,
    RateLimitExceededException,
)


def test_rate_limiter_allows_under_limit():
    limiter = SlidingWindowRateLimiter()
    config = RateLimitConfig(max_requests=3, window_seconds=60)
    
    # 3 requests should succeed
    limiter.check_rate_limit("test_key", config)
    limiter.check_rate_limit("test_key", config)
    limiter.check_rate_limit("test_key", config)


def test_rate_limiter_blocks_over_limit():
    limiter = SlidingWindowRateLimiter()
    config = RateLimitConfig(max_requests=2, window_seconds=60)
    
    limiter.check_rate_limit("test_key", config)
    limiter.check_rate_limit("test_key", config)
    
    with pytest.raises(RateLimitExceededException) as exc_info:
        limiter.check_rate_limit("test_key", config)
        
    assert exc_info.value.code == "RATE_LIMIT_EXCEEDED"
    assert exc_info.value.status_code == 429


def test_rate_limiter_keys_isolated():
    limiter = SlidingWindowRateLimiter()
    config = RateLimitConfig(max_requests=1, window_seconds=60)
    
    limiter.check_rate_limit("user_1", config)
    # Different user key should succeed
    limiter.check_rate_limit("user_2", config)
    
    with pytest.raises(RateLimitExceededException):
        limiter.check_rate_limit("user_1", config)
