# CUSAT Mess Management — Frontend Integration Guide

This guide provides everything the frontend team (React / PWA) needs to integrate against the backend API without guessing.

---

## 1. Environment & Setup

- **Base URL:** `http://localhost:8000/api/v1` (Development)
- **Timezone:** All timestamps are timezone-aware ISO 8601 strings in `Asia/Kolkata` (UTC+5:30), e.g. `2026-08-08T19:30:00+05:30`.
- **Dates:** ISO 8601 date strings, e.g. `2026-08-08`.

---

## 2. Authentication Flow

### Session Architecture
1. **Access Token:** Short-lived JWT (15 minutes). Returned in response body on `/login` and `/refresh`. Frontend stores in memory (state/context) and sends via `Authorization: Bearer <access_token>` header on every protected request.
2. **Refresh Token:** Long-lived secure token (7 days). Set automatically by the server in an `HttpOnly`, `SameSite=Lax` cookie. Frontend does not touch this cookie; browser manages it automatically.

### Activation Flow (First-time Students)
1. Pre-imported students activate at `/auth/activate` with:
   - `registration_number`: e.g. `2026001`
   - `date_of_birth`: `YYYY-MM-DD`
   - `password`: minimum 8 characters
2. On success, prompt student to log in.

### Login & Token Refresh Flow
1. POST `/auth/login` with `registration_number` and `password`.
2. Save `access_token` in React state/memory.
3. Set up an HTTP interceptor (Axios / Fetch):
   - On 401 response with code `UNAUTHORIZED` or `TOKEN_EXPIRED`:
   - Call POST `/auth/refresh` (with `credentials: "include"` so the refresh cookie is sent).
   - Receive new `access_token`, update state, and retry the original request.
   - If `/refresh` fails, redirect user to `/login`.

---

## 3. QR Attendance Workflow (Highest Security)

### Student Side (Mobile Web App)
1. Student navigates to Attendance tab inside meal window (e.g. 12:00 – 14:30 for Lunch).
2. Call `GET /api/v1/attendance/qr?meal_type=LUNCH`.
3. Receive response:
   ```json
   {
     "success": true,
     "data": {
       "qr_token": "eyJhbGciOiJIUzI1Ni...",
       "expires_at": "2026-08-08T13:15:00+05:30",
       "validity_seconds": 60
     }
   }
   ```
4. Render `qr_token` as a QR code image (using libraries like `qrcode.react`).
5. Show a 60-second countdown timer. Auto-refresh token when expired.

### Admin Side (Scanner App)
1. Admin uses camera / scanner to scan student's QR code.
2. Call POST `/api/v1/attendance/verify` with `{ "qr_token": "<scanned_token>" }`.
3. Response returns student info for verification:
   ```json
   {
     "success": true,
     "data": {
       "verification_id": "v123-uuid",
       "student_id": "s456-uuid",
       "student_name": "Rahul Kumar",
       "registration_number": "2026001",
       "meal_date": "2026-08-08",
       "meal_type": "LUNCH",
       "photo_url": "https://...",
       "expires_at": "2026-08-08T13:15:00+05:30"
     }
   }
   ```
4. Display student photo and details to Admin.
5. Admin taps "Confirm Attendance" button:
   Call POST `/api/v1/attendance/confirm` with `{ "verification_id": "v123-uuid" }`.
6. Show green checkmark confirmation.

---

## 4. Meal Cutoff Rules

- **Default Cutoff:** 20:30 IST (8:30 PM) the day before the meal date.
- **Example:** Selections for August 9 meals lock on August 8 at 20:30 IST.
- If a student attempts `PUT /api/v1/meals/2026-08-09/LUNCH` after cutoff:
  - Returns HTTP 409 Conflict:
    ```json
    {
      "success": false,
      "error": {
        "code": "MEAL_SELECTION_LOCKED",
        "message": "Meal selection is locked after 8:30 PM."
      }
    }
    ```
- Frontend UI should lock controls based on client calculation, but MUST handle `MEAL_SELECTION_LOCKED` error gracefully.

---

## 5. Enum Reference

- **Role:** `STUDENT`, `ADMIN`, `SUPER_ADMIN`
- **AccountStatus:** `PENDING`, `ACTIVE`, `SUSPENDED`
- **StudentType:** `HOSTELLER`, `DAY_SCHOLAR`
- **MealType:** `BREAKFAST`, `LUNCH`, `DINNER`
- **MealStatus:** `CONFIRMED`, `SKIPPED`, `NO_SERVICE`
- **AttendanceType:** `QR`, `MANUAL`, `ADMIN_OVERRIDE`
- **FineStatus:** `PENDING`, `WAIVED`, `PAID`
