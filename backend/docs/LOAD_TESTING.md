# CUSAT Mess Management — Load Testing & Concurrency Guide

This document outlines the load testing scenario, concurrency goals, Locust configuration, and performance targets for the system.

---

## 1. Concurrency Goal & Scenarios

- **Target Capacity:** ~300 concurrent students (the entire hostel capacity accessing the system during peak meal hours).
- **Peak Hour Usage Pattern:**
  - 8:00 AM – 8:30 AM (Breakfast QR generation & scanning)
  - 1:00 PM – 1:30 PM (Lunch QR generation & scanning)
  - 7:30 PM – 8:30 PM (Dinner QR generation + selection cutoff lock at 8:30 PM)

---

## 2. Locust Load Test Setup

A pre-configured load test script is provided in `locustfile.py`.

### Execution Command
```bash
locust -f locustfile.py --headless -u 300 -r 30 -t 3m --host=http://localhost:8000
```

### Options Explained
- `-u 300`: Spawn 300 concurrent virtual users.
- `-r 30`: Ramp-up rate of 30 users per second (full 300 users in 10 seconds).
- `-t 3m`: Test duration of 3 minutes.
- `--host`: Target backend host URL.

---

## 3. Target SLA & Performance Budget

| Endpoint Group | Expected P95 Latency | Expected P99 Latency | Max Error Rate |
|---|---|---|---|
| Health Check (`GET /health`) | < 5ms | < 15ms | 0.00% |
| Student Dashboard (`GET /me/dashboard`) | < 50ms | < 120ms | < 0.1% |
| Meal Schedule (`GET /meals`) | < 40ms | < 100ms | < 0.1% |
| Selection Update (`PUT /meals/...`) | < 60ms | < 150ms | < 0.1% |
| QR Generation (`GET /attendance/qr`) | < 30ms | < 80ms | < 0.1% |
| QR Verification (`POST /attendance/verify`) | < 40ms | < 100ms | < 0.1% |
| QR Confirmation (`POST /attendance/confirm`) | < 70ms | < 180ms | 0.00% (Strict Transaction) |

---

## 4. Concurrency Guardrails & Protections

1. **DB Row Locking (`SELECT ... FOR UPDATE`):** Prevents duplicate attendance insertion under simultaneous admin scans.
2. **Database Unique Constraints:** `uq_attendance`, `uq_meal_selection`, and `uq_fine` act as structural safety nets against duplicate insertions even under race conditions.
3. **Async Connection Pooling:** SQLAlchemy engine configured with `pool_size=10`, `max_overflow=20`, and `pool_pre_ping=True`.
4. **Rate Limiting:** Sliding window rate limiter prevents brute-force login attempts and endpoint flooding.
