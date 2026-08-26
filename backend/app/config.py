from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    DATABASE_URL: str
    TEST_DATABASE_URL: str = ""
    
    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # QR
    QR_SECRET_KEY: str
    QR_VALIDITY_SECONDS: int = 60
    
    # CORS
    # Exact origins only. A wildcard subdomain regex combined with
    # allow_credentials lets any app on a shared host read authenticated
    # responses, so the regex that used to live in middleware/cors.py is gone.
    CORS_ORIGINS: str = "http://localhost:3000"
    CORS_ALLOW_CREDENTIALS: bool = True

    # Auth hardening
    # Per-account lockout sits alongside the per-IP rate limit: the IP limit
    # stops one host hammering the service, the lockout stops a distributed
    # guess against a single low-entropy factor (date of birth).
    AUTH_MAX_FAILED_ATTEMPTS: int = 5
    AUTH_LOCKOUT_MINUTES: int = 15

    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    ALLOW_TEST_MODE: bool = False  # Set False so QR codes only work strictly during official meal windows
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
    
    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def cookies_require_https(self) -> bool:
        """Secure flag for auth cookies. True everywhere except local dev."""
        return not self.is_development


@lru_cache
def get_settings() -> Settings:
    return Settings()
