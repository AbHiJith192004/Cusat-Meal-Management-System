FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose port
EXPOSE 8000

# Entrypoint script: wait for DB, run alembic, seed demo data, and start uvicorn
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed_demo_data.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
