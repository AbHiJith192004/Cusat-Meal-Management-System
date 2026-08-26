from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Path, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit import AuditLog
from app.models.holiday import Holiday
from app.models.user import User
from app.schemas.attendance import ManualAttendanceRequest
from app.schemas.fine import WaiveFineRequest, ReconcileFinesRequest
from app.schemas.meal import HolidayCreateRequest
from app.schemas.common import success_response
from app.schemas.user import CreateStudentRequest
from app.schemas.meal_rate import (
    SetMealRateRequest,
    BulkSetMealRateRequest,
    PublishBillRequest,
    UnpublishBillRequest,
    UpdateStockRequest,
)
from app.services.billing_service import BillingService
from app.models.meal_rate import DailyMealRate
from app.security.dependencies import AdminUser
from app.services.attendance_service import AttendanceService
from app.services.fine_service import FineService
from app.services.student_service import StudentService
from app.services.holiday_service import HolidayService
from app.services.report_service import ReportService
from app.utils.enums import Role
from app.utils.timezone import today_ist

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Operations"])


@router.get("/dashboard")
async def get_admin_dashboard(
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated dashboard metrics for admins with live served, skipped, pending, and fined counts."""
    from app.models.attendance import Attendance
    from app.models.meal import MealSelection
    from app.models.fine import Fine

    today = today_ist()

    # Total students count
    count_stmt = select(func.count()).where(User.role == Role.STUDENT.value)
    total_students = (await db.execute(count_stmt)).scalar_one()

    menus = {
        "breakfast": "Appam & Egg Curry / Veg Stew + Tea",
        "lunch": "Kerala Meals, Fish Curry / Pulissery & Payasam",
        "dinner": "Chapati & Chicken Curry / Paneer Masala + Milk",
    }

    timings = {
        "breakfast": "8:00 AM – 9:30 AM",
        "lunch": "12:00 PM – 2:30 PM",
        "dinner": "7:00 PM – 9:30 PM",
    }

    today_stats = {}
    for mt in ["breakfast", "lunch", "dinner"]:
        mt_upper = mt.upper()
        # Attendance (Served) count
        served_res = await db.execute(
            select(func.count()).where(Attendance.meal_date == today, Attendance.meal_type == mt_upper)
        )
        served_count = served_res.scalar_one() or 0

        # Skipped count
        skipped_res = await db.execute(
            select(func.count()).where(MealSelection.meal_date == today, MealSelection.meal_type == mt_upper, MealSelection.status == "SKIPPED")
        )
        skipped_count = skipped_res.scalar_one() or 0

        # Confirmed count
        confirmed_res = await db.execute(
            select(func.count()).where(MealSelection.meal_date == today, MealSelection.meal_type == mt_upper, MealSelection.status == "CONFIRMED")
        )
        confirmed_count = confirmed_res.scalar_one() or total_students

        # Pending count (Confirmed minus Served)
        pending_count = max(0, confirmed_count - served_count)

        # Fined count
        fined_res = await db.execute(
            select(func.count()).where(Fine.meal_date == today, Fine.meal_type == mt_upper)
        )
        fined_count = fined_res.scalar_one() or 0

        today_stats[mt] = {
            "total": total_students,
            "confirmed": confirmed_count,
            "served": served_count,
            "attendance": served_count,
            "skipped": skipped_count,
            "pending": pending_count,
            "fined": fined_count,
            "not_eligible": 0,
            "menu": menus[mt],
            "time_window": timings[mt],
        }

    # Pending fines overall count
    fines_count_res = await db.execute(select(func.count()).where(Fine.status == "PENDING"))
    pending_fines_count = fines_count_res.scalar_one() or 0

    return success_response(
        data={
            "date": today.isoformat(),
            "total_students": total_students,
            "today_stats": today_stats,
            "pending_fines_count": pending_fines_count,
            "active_holidays_count": 0,
        }
    )


@router.get("/dashboard/students-by-status")
async def get_students_by_status(
    admin_user: AdminUser,
    meal_type: Annotated[str, Query(description="BREAKFAST, LUNCH, or DINNER")],
    category: Annotated[str, Query(description="SERVED, SKIPPED, PENDING, FINED, TOTAL, NOT_ELIGIBLE")],
    meal_date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    db: AsyncSession = Depends(get_db),
):
    """Get list of students for a specific metric drill-down category."""
    from datetime import date as date_type
    from app.models.attendance import Attendance
    from app.models.meal import MealSelection
    from app.models.fine import Fine
    from app.models.student import StudentProfile

    target_date = date_type.fromisoformat(meal_date) if meal_date else today_ist()
    mt = meal_type.upper()
    cat = category.upper()

    # Query all active students with their profiles
    stmt = (
        select(User, StudentProfile)
        .outerjoin(StudentProfile, User.id == StudentProfile.user_id)
        .where(User.role == Role.STUDENT.value)
    )
    res = await db.execute(stmt)
    all_students = res.all()

    # Fetch attendance, meal selections, and fines for target_date & mt
    att_res = await db.execute(select(Attendance).where(Attendance.meal_date == target_date, Attendance.meal_type == mt))
    attended_ids = {a.student_id for a in att_res.scalars().all()}

    sel_res = await db.execute(select(MealSelection).where(MealSelection.meal_date == target_date, MealSelection.meal_type == mt))
    selections = {s.student_id: s.status for s in sel_res.scalars().all()}

    fine_res = await db.execute(select(Fine).where(Fine.meal_date == target_date, Fine.meal_type == mt))
    fined_ids = {f.student_id for f in fine_res.scalars().all()}

    result = []
    for user, profile in all_students:
        status_in_meal = selections.get(user.id, "CONFIRMED")
        is_served = user.id in attended_ids
        is_fined = user.id in fined_ids

        # Filter by requested category
        if cat == "SERVED" and not is_served:
            continue
        elif cat == "SKIPPED" and status_in_meal != "SKIPPED":
            continue
        elif cat == "PENDING" and (is_served or status_in_meal == "SKIPPED"):
            continue
        elif cat == "FINED" and not is_fined:
            continue
        elif cat == "NOT_ELIGIBLE":
            continue

        display_status = "Served" if is_served else ("Skipped" if status_in_meal == "SKIPPED" else ("Fined" if is_fined else "Pending"))

        result.append({
            "id": str(user.id),
            "name": user.name,
            "registration_number": user.registration_number,
            "mess_id": profile.mess_id if profile else f"M-{user.registration_number}",
            "department": getattr(profile, "department", "Computer Science & Eng") if profile else "Computer Science & Eng",
            "campus_location": getattr(profile, "campus_location", "MAIN_CAMPUS") if profile else "MAIN_CAMPUS",
            "status": display_status,
        })

    return success_response(data=result)



@router.get("/students")
async def list_students(
    admin_user: AdminUser,
    query: Annotated[str | None, Query(description="Search name, reg_no, mess_id")] = None,
    account_status: Annotated[str | None, Query()] = None,
    student_type: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    """Search and filter student accounts with pagination."""
    service = StudentService(db)
    results, total = await service.search_students(
        query=query, account_status=account_status, student_type=student_type, page=page, per_page=per_page
    )
    return success_response(data=results, meta={"page": page, "per_page": per_page, "total": total, "total_pages": (total + per_page - 1) // per_page})


@router.post("/students")
async def create_student(
    body: CreateStudentRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new student account with PENDING status.
    
    The student can then activate their account using registration_number + date_of_birth.
    Required fields: name, registration_number, date_of_birth.
    Optional fields: mess_id, student_type.
    """
    import uuid as uuid_mod
    from datetime import date as date_type
    from app.models.student import StudentProfile
    from app.repositories.audit_repo import AuditRepository

    
    name = body.name
    registration_number = body.registration_number
    date_of_birth_str = body.date_of_birth
    department = body.department or "Computer Science"
    mess_id = body.mess_id
    student_type = "HOSTELLER"
    
    # Check if registration_number already exists
    existing = await db.execute(select(User).where(User.registration_number == registration_number))
    if existing.scalar_one_or_none():
        from app.utils.exceptions import ConflictException
        raise ConflictException(message=f"Account with registration number '{registration_number}' already exists.")
    
    try:
        dob = date_type.fromisoformat(date_of_birth_str)
    except ValueError:
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Invalid date_of_birth format. Use YYYY-MM-DD.")
    
    user_id = uuid_mod.uuid4()
    new_user = User(
        id=user_id,
        registration_number=registration_number,
        name=name,
        role=Role.STUDENT.value,
        account_status="PENDING",
    )
    db.add(new_user)
    
    campus_location = body.campus_location or "MAIN_CAMPUS"
    
    profile = StudentProfile(
        id=uuid_mod.uuid4(),
        user_id=user_id,
        mess_id=mess_id or f"M-{registration_number}",
        date_of_birth=dob,
        department=department,
        student_type=student_type,
        campus_location=campus_location,
    )
    db.add(profile)
    
    audit_repo = AuditRepository(db)
    await audit_repo.log(
        actor_id=admin_user.id,
        action="STUDENT_CREATED",
        target_type="user",
        target_id=user_id,
        metadata={"registration_number": registration_number, "name": name},
    )
    
    return success_response(
        data={
            "id": str(user_id),
            "registration_number": registration_number,
            "name": name,
            "account_status": "PENDING",
            "date_of_birth": dob.isoformat(),
            "mess_id": profile.mess_id,
            "student_type": student_type,
            "message": f"Student '{name}' created. They can now activate using Reg No + Date of Birth.",
        }
    )


@router.get("/students/{student_id}")
async def get_student_detail(
    student_id: Annotated[UUID, Path()],
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed student profile."""
    service = StudentService(db)
    user = await service.user_repo.get_user_with_profile(student_id)
    if not user:
        from app.utils.exceptions import NotFoundException
        raise NotFoundException(message="Student not found.")

    return success_response(
        data={
            "id": str(user.id),
            "registration_number": user.registration_number,
            "name": user.name,
            "account_status": user.account_status,
            "activated_at": user.activated_at.isoformat() if user.activated_at else None,
            "profile": {
                "mess_id": user.profile.mess_id if user.profile else None,
                # Birth year only. The full date is the sole verification factor
                # for /auth/reset-password-dob, so returning it to every admin
                # turned any admin session into a password reset for any student.
                "birth_year": user.profile.date_of_birth.year if user.profile else None,
                "student_type": user.profile.student_type if user.profile else None,
                "photo_url": user.profile.photo_url if user.profile else None,
            },
        }
    )


@router.post("/attendance/manual")
async def record_manual_attendance(
    body: ManualAttendanceRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    service = AttendanceService(db)
    attendance = await service.record_manual_attendance(
        student_id=body.student_id,
        meal_date=body.meal_date,
        meal_type=body.meal_type,
        attendance_type=body.attendance_type,
        reason=body.reason,
        admin_id=admin_user.id,
    )
    return success_response(
        data={
            "id": str(attendance.id),
            "student_id": str(attendance.student_id),
            "meal_date": attendance.meal_date.isoformat(),
            "meal_type": attendance.meal_type,
            "attendance_type": attendance.attendance_type,
            "recorded_at": attendance.recorded_at.isoformat(),
            "reason": attendance.reason,
        }
    )


@router.delete("/attendance/reset")
async def reset_attendance(
    admin_user: AdminUser,
    registration_number: Annotated[str, Query(description="Registration number of student")],
    reason: Annotated[str, Query(min_length=3, description="Why this attendance is being reset (audited)")],
    meal_type: Annotated[str | None, Query(description="BREAKFAST, LUNCH, DINNER or empty for all")] = None,
    meal_date: Annotated[str | None, Query(description="YYYY-MM-DD or empty for today")] = None,
    db: AsyncSession = Depends(get_db),
):
    """Remove attendance records, e.g. when the wrong QR code was scanned.

    Deleting attendance decides who gets fined, so this carries the same
    mandatory-reason and audit requirements as recording it does.
    """
    from sqlalchemy import delete
    from app.models.attendance import Attendance
    from app.repositories.audit_repo import AuditRepository
    from app.utils.timezone import today_ist
    from app.utils.exceptions import ValidationException
    from datetime import date as date_type

    if not reason or len(reason.strip()) < 3:
        raise ValidationException(
            message="A reason of at least 3 characters is required to reset attendance."
        )

    user_res = await db.execute(select(User).where(User.registration_number == registration_number))
    user = user_res.scalar_one_or_none()
    if not user:
        from app.utils.exceptions import NotFoundException
        raise NotFoundException(message=f"Student with registration number '{registration_number}' not found.")

    target_date = date_type.fromisoformat(meal_date) if meal_date else today_ist()

    # Read the rows before deleting so the audit entry records what was
    # actually removed. A bare rowcount cannot be reconstructed afterwards.
    doomed_stmt = select(Attendance).where(
        Attendance.student_id == user.id,
        Attendance.meal_date == target_date,
    )
    if meal_type:
        doomed_stmt = doomed_stmt.where(Attendance.meal_type == meal_type.upper())
    doomed = (await db.execute(doomed_stmt)).scalars().all()

    removed_snapshot = [
        {
            "attendance_id": str(a.id),
            "meal_type": a.meal_type,
            "attendance_type": a.attendance_type,
            "recorded_at": a.recorded_at.isoformat() if a.recorded_at else None,
            "recorded_by": str(a.recorded_by) if a.recorded_by else None,
        }
        for a in doomed
    ]

    stmt = delete(Attendance).where(
        Attendance.student_id == user.id,
        Attendance.meal_date == target_date,
    )
    if meal_type:
        stmt = stmt.where(Attendance.meal_type == meal_type.upper())

    result = await db.execute(stmt)

    await AuditRepository(db).log(
        actor_id=admin_user.id,
        action="ATTENDANCE_RESET",
        target_type="attendance",
        target_id=user.id,
        metadata={
            "student_id": str(user.id),
            "registration_number": registration_number,
            "meal_date": target_date.isoformat(),
            "meal_type": meal_type.upper() if meal_type else "ALL",
            "reason": reason.strip(),
            "records_removed": len(removed_snapshot),
            "removed": removed_snapshot,
        },
    )
    await db.commit()

    return success_response(
        data={
            "message": f"Successfully reset attendance for {user.name} ({registration_number}) on {target_date.isoformat()}.",
            "records_removed": result.rowcount,
        }
    )


@router.get("/fines")
async def list_fines(
    admin_user: AdminUser,
    status: Annotated[str | None, Query()] = None,
    student_id: Annotated[UUID | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    service = FineService(db)
    skip = (page - 1) * per_page
    fines = await service.fine_repo.list_fines(status=status, student_id=student_id, skip=skip, limit=per_page)

    data = [
        {
            "id": str(f.id),
            "student_id": str(f.student_id),
            "meal_date": f.meal_date.isoformat(),
            "meal_type": f.meal_type,
            "amount": float(f.amount),
            "status": f.status,
            "created_at": f.created_at.isoformat(),
            "waived_at": f.waived_at.isoformat() if f.waived_at else None,
            "waived_by": str(f.waived_by) if f.waived_by else None,
            "waiver_reason": f.waiver_reason,
        }
        for f in fines
    ]
    return success_response(data=data)


@router.post("/fines/{fine_id}/waive")
async def waive_fine(
    fine_id: Annotated[UUID, Path()],
    body: WaiveFineRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    service = FineService(db)
    fine = await service.waive_fine(fine_id=fine_id, reason=body.reason, admin_id=admin_user.id)
    return success_response(
        data={
            "id": str(fine.id),
            "status": fine.status,
            "waived_at": fine.waived_at.isoformat() if fine.waived_at else None,
            "waived_by": str(fine.waived_by) if fine.waived_by else None,
            "waiver_reason": fine.waiver_reason,
        }
    )


@router.post("/fines/reconcile")
async def trigger_reconciliation(
    body: ReconcileFinesRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    service = FineService(db)
    meals = [body.meal_type] if body.meal_type else ["BREAKFAST", "LUNCH", "DINNER"]
    total_created = 0
    for mt in meals:
        created = await service.reconcile_missed_meals(body.target_date, mt, actor_id=admin_user.id)
        total_created += created
    return success_response(
        data={"message": f"Reconciliation completed for {body.target_date.isoformat()}.", "fines_created": total_created}
    )


@router.post("/holidays")
async def declare_holiday(
    body: HolidayCreateRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Declare a holiday and cascade status changes."""
    service = HolidayService(db)
    holiday = await service.declare_holiday(
        holiday_date=body.date, meal_type=body.meal_type, reason=body.reason, admin_id=admin_user.id
    )
    return success_response(
        data={
            "id": str(holiday.id),
            "holiday_date": holiday.holiday_date.isoformat(),
            "meal_type": holiday.meal_type,
            "reason": holiday.reason,
            "created_at": holiday.created_at.isoformat(),
        }
    )


@router.delete("/holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: Annotated[UUID, Path()],
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a holiday and revert NO_SERVICE meals back to CONFIRMED."""
    service = HolidayService(db)
    await service.delete_holiday(holiday_id, admin_user.id)
    return success_response(data={"message": "Holiday deleted and meal selections reverted."})


@router.get("/meal-rates")
async def get_monthly_meal_rates(
    admin_user: AdminUser,
    year: Annotated[int, Query(ge=2024, le=2100)] = 2026,
    month: Annotated[int, Query(ge=1, le=12)] = 8,
    db: AsyncSession = Depends(get_db),
):
    """Get daily meal rates for all days in a specific month."""
    import calendar
    from decimal import Decimal

    num_days = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, num_days)

    stmt = select(DailyMealRate).where(
        and_(DailyMealRate.rate_date >= start_date, DailyMealRate.rate_date <= end_date)
    )
    res = await db.execute(stmt)
    rates_db = {r.rate_date: r for r in res.scalars().all()}

    rates_list = []
    for d in range(1, num_days + 1):
        cur_date = date(year, month, d)
        r = rates_db.get(cur_date)
        if r:
            rates_list.append({
                "id": str(r.id),
                "rate_date": cur_date.isoformat(),
                "breakfast_rate": float(r.breakfast_rate),
                "lunch_rate": float(r.lunch_rate),
                "dinner_rate": float(r.dinner_rate),
                "daily_total": float(r.daily_total),
                "notes": r.notes,
            })
        else:
            rates_list.append({
                "id": None,
                "rate_date": cur_date.isoformat(),
                "breakfast_rate": 30.0,
                "lunch_rate": 50.0,
                "dinner_rate": 40.0,
                "daily_total": 120.0,
                "notes": "Default Rate",
            })

    return success_response(data=rates_list)


@router.post("/meal-rates")
async def set_single_meal_rate(
    body: SetMealRateRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Set or update custom meal pricing for a single date."""
    stmt = select(DailyMealRate).where(DailyMealRate.rate_date == body.rate_date)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        existing.breakfast_rate = body.breakfast_rate
        existing.lunch_rate = body.lunch_rate
        existing.dinner_rate = body.dinner_rate
        existing.notes = body.notes
    else:
        existing = DailyMealRate(
            rate_date=body.rate_date,
            breakfast_rate=body.breakfast_rate,
            lunch_rate=body.lunch_rate,
            dinner_rate=body.dinner_rate,
            notes=body.notes,
        )
        db.add(existing)

    await db.commit()

    return success_response(
        data={
            "rate_date": existing.rate_date.isoformat(),
            "breakfast_rate": float(existing.breakfast_rate),
            "lunch_rate": float(existing.lunch_rate),
            "dinner_rate": float(existing.dinner_rate),
            "daily_total": float(existing.daily_total),
            "notes": existing.notes,
            "message": f"Meal rate updated for {existing.rate_date.isoformat()}.",
        }
    )


@router.post("/meal-rates/bulk")
async def set_bulk_meal_rates(
    body: BulkSetMealRateRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Bulk apply a daily meal pricing rate across an entire month."""
    import calendar

    num_days = calendar.monthrange(body.year, body.month)[1]
    updated_count = 0

    for d in range(1, num_days + 1):
        cur_date = date(body.year, body.month, d)
        stmt = select(DailyMealRate).where(DailyMealRate.rate_date == cur_date)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.breakfast_rate = body.breakfast_rate
            existing.lunch_rate = body.lunch_rate
            existing.dinner_rate = body.dinner_rate
            existing.notes = body.notes
        else:
            existing = DailyMealRate(
                rate_date=cur_date,
                breakfast_rate=body.breakfast_rate,
                lunch_rate=body.lunch_rate,
                dinner_rate=body.dinner_rate,
                notes=body.notes,
            )
            db.add(existing)
        updated_count += 1

    await db.commit()

    return success_response(
        data={
            "year": body.year,
            "month": body.month,
            "days_updated": updated_count,
            "daily_total": float(body.breakfast_rate + body.lunch_rate + body.dinner_rate),
            "message": f"Applied ₹{float(body.breakfast_rate + body.lunch_rate + body.dinner_rate):.2f}/day to all {updated_count} days of {calendar.month_name[body.month]} {body.year}.",
        }
    )


@router.get("/reports/monthly")
async def download_monthly_report(
    admin_user: AdminUser,
    year: Annotated[int, Query(ge=2024, le=2100)] = 2026,
    month: Annotated[int, Query(ge=1, le=12)] = 8,
    format: Annotated[str, Query(description="excel or pdf")] = "excel",
    db: AsyncSession = Depends(get_db),
):
    """Download monthly Excel or PDF report."""
    service = ReportService(db)
    fmt = format.lower()
    if fmt == "excel":
        content = await service.generate_monthly_excel_report(year, month)
        headers = {"Content-Disposition": f'attachment; filename="cusat_mess_report_{year}_{month:02d}.xlsx"'}
        return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
    elif fmt == "pdf":
        content = await service.generate_monthly_pdf_report(year, month)
        headers = {"Content-Disposition": f'attachment; filename="cusat_mess_report_{year}_{month:02d}.pdf"'}
        return Response(content=content, media_type="application/pdf", headers=headers)
    else:
        from app.utils.exceptions import ValidationException
        raise ValidationException(message="Format must be excel or pdf.")


@router.get("/audit")
async def get_audit_logs(
    admin_user: AdminUser,
    actor_id: Annotated[UUID | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
):
    """View system audit logs (append-only)."""
    stmt = select(AuditLog)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)

    stmt = stmt.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    data = [
        {
            "id": str(log.id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": str(log.target_id) if log.target_id else None,
            "metadata": log.metadata_,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return success_response(data=data)


# ---------------------------------------------------------------------------
# PERMANENT BILL PUBLICATION & STOCK LOCKING ENDPOINTS
# ---------------------------------------------------------------------------
# BILLING PERIODS AND PHYSICAL STOCK
#
# These used to be backed by a module-level `PUBLISHED_BILL_MONTHS: set[str]`
# hardcoded to two months. It reset on every restart, could not agree with
# itself across worker processes, and /stocks/update-physical echoed its input
# back without writing anywhere. All three now go through BillingService, which
# commits to real tables and audits every mutation.
# ---------------------------------------------------------------------------


@router.get("/bills/status")
async def get_bill_publication_status(
    admin_user: AdminUser,
    month: Annotated[int, Query(ge=1, le=12)],
    year: Annotated[int, Query(ge=2024, le=2100)],
    db: AsyncSession = Depends(get_db),
):
    """Whether a month is published and its stock frozen."""
    service = BillingService(db)
    return success_response(data=await service.get_status(month, year))


@router.post("/bills/publish")
async def publish_monthly_bill(
    body: PublishBillRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Publish a month: compute and freeze its figures in one transaction."""
    service = BillingService(db)
    result = await service.publish(
        month=body.month,
        year=body.year,
        figures={
            "opening_stock_value": body.opening_stock_value,
            "purchases_value": body.purchases_value,
            "closing_stock_value": body.closing_stock_value,
            "operational_expenses": body.operational_expenses,
            "administrative_expenses": body.administrative_expenses,
            "chargeable_days": body.chargeable_days,
        },
        actor_id=admin_user.id,
    )
    return success_response(data=result)


@router.post("/bills/unpublish")
async def unpublish_monthly_bill(
    body: UnpublishBillRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Reopen a published month for correction. Always audited with a reason."""
    service = BillingService(db)
    result = await service.unpublish(
        month=body.month, year=body.year, reason=body.reason, actor_id=admin_user.id
    )
    return success_response(data=result)


@router.get("/stocks")
async def list_stock_counts(
    admin_user: AdminUser,
    month: Annotated[int, Query(ge=1, le=12)],
    year: Annotated[int, Query(ge=2024, le=2100)],
    db: AsyncSession = Depends(get_db),
):
    """Physical closing-stock counts recorded for a month."""
    service = BillingService(db)
    return success_response(data=await service.list_stock_counts(month, year))


@router.post("/stocks/update-physical")
async def update_physical_stock(
    body: UpdateStockRequest,
    admin_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Record a physical closing count. Rejected once the month is published."""
    service = BillingService(db)
    result = await service.record_stock_count(
        month=body.month,
        year=body.year,
        item_id=body.item_id,
        physical_closing_qty=body.physical_closing_qty,
        actor_id=admin_user.id,
        item_name=body.item_name,
        unit=body.unit,
        unit_cost=body.unit_cost,
    )
    return success_response(data=result)

