from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings


def setup_cors(app: FastAPI) -> None:
    """Configure CORS middleware from environment settings."""
    settings = get_settings()
    origins = list(settings.cors_origins_list)
    
    # Ensure production Render domains & local dev domains are always allowed
    default_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://cusat-emal-frontend.onrender.com",
        "https://cusat-meal-management-system.onrender.com",
    ]
    for o in default_origins:
        if o not in origins:
            origins.append(o)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"https://.*\.onrender\.com",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
