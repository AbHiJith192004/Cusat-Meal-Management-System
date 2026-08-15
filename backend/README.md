# CUSAT Boys Hostel Mess Management System — Backend API

Production-ready backend API for managing daily mess operations.

## Tech Stack Summary

| Technology | Description |
|---|---|
| **Language** | Python 3.11+ |
| **Framework** | FastAPI |
| **Database** | PostgreSQL (Async via `asyncpg`) |
| **ORM** | SQLAlchemy 2.0+ (async) |
| **Migrations** | Alembic |
| **Validation** | Pydantic v2 |
| **Testing** | pytest, pytest-asyncio, httpx |

## Prerequisites

- Python 3.11+
- Docker & Docker Compose
- Git

## Setup Instructions

1. Clone repo:
   ```bash
   git clone <repository_url>
   cd cusat-mess-backend
   ```
2. Start PostgreSQL:
   ```bash
   docker-compose up -d
   ```
3. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```
5. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env as needed
   ```
6. Run database migrations:
   ```bash
   alembic upgrade head
   ```
7. Start the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Documentation

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Testing

Run the test suite with:

```bash
pytest -v
```

## Project Structure Overview

```
app/
├── core/           # Security, config, exceptions
├── api/            # Route handlers (controllers)
├── models/         # SQLAlchemy models
├── schemas/        # Pydantic validation schemas
├── services/       # Business logic layer
└── tests/          # Test suite
```

## API Overview

- **Auth**: Login, Register, Password Reset
- **Users**: Profile management, Role administration
- **Students**: Mess cutting (leaves), Extras billing
- **Menu**: View weekly menu, Rate meals
- **Attendance**: QR-based or manual attendance

## License

MIT License
