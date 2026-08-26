from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings


def setup_cors(app: FastAPI) -> None:
    r"""Configure CORS from settings.

    Exact origins only. There used to be an
    `allow_origin_regex=r"https://.*\.onrender\.com"` here alongside
    `allow_credentials=True`. Render is multi-tenant, so any app deployed on
    that shared domain could call /auth/refresh with the browser attaching the
    victim's refresh cookie, then read the fresh access token straight out of
    the response body. Add real production hostnames to CORS_ORIGINS rather
    than widening this again.
    """
    settings = get_settings()

    origins = [o for o in settings.cors_origins_list if o]

    # Localhost cannot be reached by a third party, so these are safe to add
    # automatically - but only outside production.
    if settings.is_development:
        for dev_origin in (
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ):
            if dev_origin not in origins:
                origins.append(dev_origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
