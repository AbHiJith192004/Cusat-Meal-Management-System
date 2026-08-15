# 🏛️ CUSAT Meal Management System

> **Full-Stack Hostel Mess Management Application** for Cochin University of Science and Technology (CUSAT). Includes FastAPI backend REST API, PostgreSQL/SQLite database ORM, React 19 PWA frontend, anti-fraud QR scanner, and automated fine reconciliation.

---

## 📁 Repository Structure

```text
Cusat-Meal-Management-System/
├── backend/                  # FastAPI Python Backend REST API
│   ├── app/                  # Application code (Routers, Services, Models, Repositories)
│   ├── migrations/           # Alembic Database Migrations
│   ├── scripts/              # Fine Reconciliation & Demo Seeding Scripts
│   ├── tests/                # PyTest Unit Test Suite (16/16 Passed)
│   └── Dockerfile            # Python 3.11 Backend Container Spec
├── frontend/                 # React 19 + Vite + Tailwind CSS PWA
│   ├── src/                  # React Components, Views, and API Wrapper
│   ├── public/               # PWA Manifest, Service Worker & App Icons
│   └── Dockerfile            # Node 20 Frontend Container Spec
└── docker-compose.yml        # Orchestrates PostgreSQL + Backend + Frontend
```

---

## ⚡ Quick Start Instructions

### 1. Localhost Dev Execution
```bash
# Start Backend
cd backend
python -m venv venv
venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Start Frontend
cd ../frontend
npm install
npm run dev
```

### 2. Docker Compose Execution
```bash
docker compose up --build -d
```

---

## 🔑 Demo Test Credentials

| Role | Registration No | Password | Capabilities |
|---|---|---|---|
| **Student** | `TEST001` | `password123` | Meal planning, 9:00 PM cutoff lock, 60s signed JWT QR code |
| **Admin** | `ADMIN001` | `password123` | Live WebCam scanner, student directory, monthly Excel/PDF reports |
| **Super Admin** | `SADMIN001` | `password123` | Student Excel bulk import, system settings batch update |
