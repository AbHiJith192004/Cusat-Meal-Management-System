# CUSAT Mess Management System — API Documentation

> **Base URL:** `/api/v1`  
> **Interactive Docs:** [http://localhost:8000/docs](http://localhost:8000/docs) (OpenAPI / Swagger UI)  
> **Auth Header:** `Authorization: Bearer <access_token>`

---

## Response Envelope

All API endpoints return a standardized JSON envelope:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "MEAL_SELECTION_LOCKED",
    "message": "Meal selection is locked after 8:30 PM.",
    "details": null
  }
}
```

---

## Machine-Readable Error Codes

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request payload failed schema validation |
| `UNAUTHORIZED` | 401 | Missing, expired, or invalid token |
| `FORBIDDEN` | 403 | Insufficient role or access level |
| `NOT_FOUND` | 404 | Resource does not exist |
| `ACCOUNT_NOT_FOUND` | 404 | Student registration number not found |
| `ACCOUNT_ALREADY_ACTIVATED` | 409 | Account has already been activated |
| `INVALID_CREDENTIALS` | 401 | Registration number or password incorrect |
| `ACCOUNT_SUSPENDED` | 403 | User account is suspended |
| `MEAL_SELECTION_LOCKED` | 409 | Past selection cutoff time (8:30 PM IST) |
| `ATTENDANCE_ALREADY_RECORDED` | 409 | Duplicate attendance attempt |
| `ATTENDANCE_UNAVAILABLE` | 409 | Outside meal window or no service |
| `MEAL_SKIPPED` | 409 | Attempting QR for skipped meal |
| `QR_EXPIRED` | 401 | QR token has expired (> 60s TTL) |
| `QR_INVALID` | 401 | Malformed or invalid signature |
| `HOLIDAY_CONFLICT` | 409 | Conflicts with a declared holiday |
| `FINE_NOT_WAIVABLE` | 409 | Fine is not in PENDING status |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Endpoint Reference

### 1. System Health
* `GET /health` — Check server status & database connectivity (Public)

### 2. Authentication
* `POST /api/v1/auth/activate` — Activate pre-imported student account with reg_no + DOB
* `POST /api/v1/auth/login` — Authenticate with reg_no + password. Sets HttpOnly refresh token cookie
* `POST /api/v1/auth/refresh` — Rotate refresh token cookie and receive new access token
* `POST /api/v1/auth/logout` — Revoke refresh token and clear cookie

### 3. Student Profile & Dashboard
* `GET /api/v1/me` — Get current user profile (Role: STUDENT, ADMIN, SUPER_ADMIN)
* `GET /api/v1/me/dashboard` — Get today's meal status summary and notifications count

### 4. Meal Selections
* `GET /api/v1/meals` — Get student's meal selections for date range (`start_date`, `end_date`)
* `PUT /api/v1/meals/{date}/{meal}` — Update selection to `CONFIRMED` or `SKIPPED` (Subject to 8:30 PM cutoff)

### 5. Attendance & QR
* `GET /api/v1/attendance/qr` — Generate signed, short-lived QR token for current meal window (60s TTL)
* `POST /api/v1/attendance/verify` — Admin scans QR token: returns verified student details (Role: ADMIN)
* `POST /api/v1/attendance/confirm` — Admin confirms verification ticket: writes attendance record atomically (Role: ADMIN)
* `POST /api/v1/admin/attendance/manual` — Admin records manual attendance / admin override with mandatory reason (Role: ADMIN)

### 6. Fine Management
* `GET /api/v1/admin/fines` — Filter & list fines (Role: ADMIN)
* `POST /api/v1/admin/fines/{id}/waive` — Waive fine with mandatory reason (Role: ADMIN)
* `POST /api/v1/admin/fines/reconcile` — Trigger manual fine reconciliation job (Role: ADMIN)

### 7. Holidays & Notifications
* `POST /api/v1/admin/holidays` — Declare holiday and cascade `NO_SERVICE` status (Role: ADMIN)
* `DELETE /api/v1/admin/holidays/{id}` — Delete holiday and revert meal statuses (Role: ADMIN)
* `GET /api/v1/notifications` — List student notifications (unread first)
* `POST /api/v1/notifications/{id}/read` — Mark notification as read

### 8. Reports & Audit
* `GET /api/v1/admin/reports/monthly` — Download monthly report (`format=excel` or `format=pdf`) (Role: ADMIN)
* `GET /api/v1/admin/audit` — View append-only system audit log (Role: ADMIN)

### 9. Super Admin
* `POST /api/v1/super-admin/students/import` — Import pre-registered students from Excel file (Role: SUPER_ADMIN)
* `POST /api/v1/super-admin/admins` — Create new ADMIN or SUPER_ADMIN account (Role: SUPER_ADMIN)
* `GET /api/v1/super-admin/settings` — Get all system configuration settings (Role: SUPER_ADMIN)
* `PUT /api/v1/super-admin/settings` — Update system configuration settings (Role: SUPER_ADMIN)
