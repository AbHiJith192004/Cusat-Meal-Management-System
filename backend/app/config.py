from functools import lru_cache
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    DATABASE_URL: str
    DB_POOL_SIZE: int = Field(default=5, ge=1, le=20)
    DB_MAX_OVERFLOW: int = Field(default=5, ge=0, le=20)
    DB_POOL_TIMEOUT: int = Field(default=10, ge=1, le=60)
    DB_COMMAND_TIMEOUT: int = Field(default=30, ge=1, le=120)
    # Enable only when the container has no direct public route and every
    # request reaches it through a trusted platform ingress. This is true for
    # DigitalOcean App Platform, while local and self-hosted deployments keep
    # the secure default below.
    TRUST_PROXY_HEADERS: bool = False
    STATIC_DIR: str = ""
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
    
    @field_validator("DATABASE_URL")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                value = "postgresql+asyncpg://" + value[len(prefix):]
                break
        # Managed PostgreSQL providers publish libpq-style `sslmode` URLs.
        # SQLAlchemy's asyncpg dialect expects the equivalent `ssl` key.
        value = value.replace("?sslmode=", "?ssl=").replace("&sslmode=", "&ssl=")
        return value

    @model_validator(mode="after")
    def validate_production(self):
        if not self.is_development:
            if self.ALLOW_TEST_MODE:
                raise ValueError("ALLOW_TEST_MODE must be false outside development")
            if min(len(self.JWT_SECRET_KEY), len(self.QR_SECRET_KEY)) < 32:
                raise ValueError("Production signing keys must each contain at least 32 characters")
            if self.JWT_SECRET_KEY == self.QR_SECRET_KEY:
                raise ValueError("JWT and QR signing keys must be different")
            if "*" in self.cors_origins_list:
                raise ValueError("Production CORS origins must be explicit")
        return self

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
