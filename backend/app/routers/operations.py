import uuid
import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.attendance import Attendance
from app.models.billing import BillingPeriod, StudentBillSnapshot
from app.models.operations import (CommitteeAssignment, InventoryItem,
    InventoryMovement, LedgerEntry, MenuPublication, PaymentSubmission)
from app.models.notification import Notification
from app.models.user import User
from app.repositories.audit_repo import AuditRepository
from app.schemas.common import success_response
from app.schemas.operations import (BulkAttendanceCreate, CommitteeCreate,
    InventoryAdjust, InventoryCreate, LedgerCreate, MenuUpsert, PaymentCreate,
    PaymentReview, VoidRequest)
from app.security.dependencies import AdminUser, CurrentUser
from app.services.billing_lock import lock_open_period
from app.utils.exceptions import ConflictException, ForbiddenException, NotFoundException, ValidationException
from app.utils.timezone import now_ist, today_ist

router = APIRouter(prefix="/api/v1", tags=["Mess Operations"])


@router.get("/admin/student-options")
async def student_options(admin: AdminUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    rows = (await db.execute(select(User.id, User.name, User.registration_number).where(
        User.role == "STUDENT", User.account_status == "ACTIVE").order_by(User.name).limit(1000))).all()
    return success_response(data=[{"id": str(x.id), "name": x.name,
        "registration_number": x.registration_number} for x in rows])


def menu_dict(row):
    return {"id": str(row.id), "menu_date": row.menu_date.isoformat(),
            "meal_type": row.meal_type, "items": row.items, "notes": row.notes,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@router.get("/menus")
async def list_menus(current_user: CurrentUser,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    db: AsyncSession = Depends(get_db, scope="function")):
    start = start_date or today_ist()
    end = end_date or start + timedelta(days=6)
    if end < start or (end - start).days > 31:
        raise ValidationException(message="Select a menu range of 1 to 32 days.")
    rows = (await db.execute(select(MenuPublication).where(
        MenuPublication.menu_date.between(start, end)).order_by(
        MenuPublication.menu_date, MenuPublication.meal_type))).scalars().all()
    return success_response(data=[menu_dict(x) for x in rows])


@router.put("/admin/menus/{menu_date}/{meal_type}")
async def publish_menu(body: MenuUpsert, admin: AdminUser,
    menu_date: Annotated[date, Path()], meal_type: Annotated[str, Path()],
    db: AsyncSession = Depends(get_db, scope="function")):
    meal = meal_type.upper()
    if meal not in {"BREAKFAST", "LUNCH", "DINNER"}:
        raise ValidationException(message="Invalid meal type.")
    row = await db.scalar(select(MenuPublication).where(
        MenuPublication.menu_date == menu_date, MenuPublication.meal_type == meal).with_for_update())
    before = row.items if row else None
    if row:
        row.items, row.notes, row.published_by = body.items, body.notes, admin.id
    else:
        row = MenuPublication(menu_date=menu_date, meal_type=meal, items=body.items,
                              notes=body.notes, published_by=admin.id)
        db.add(row)
    await db.flush()
    await AuditRepository(db).log(admin.id, "MENU_PUBLISHED", "menu_publication", row.id,
                                   {"date": menu_date.isoformat(), "meal_type": meal,
                                    "before": before, "after": body.items})
    await db.refresh(row)
    return success_response(data=menu_dict(row))


def ledger_dict(row):
    return {"id": str(row.id), "entry_date": row.entry_date.isoformat(), "kind": row.kind,
            "category": row.category, "description": row.description, "amount": str(row.amount),
            "vendor": row.vendor, "reference": row.reference,
            "voided_at": row.voided_at.isoformat() if row.voided_at else None,
            "void_reason": row.void_reason}


@router.get("/admin/ledger")
async def list_ledger(admin: AdminUser, kind: Annotated[str | None, Query()] = None,
    start_date: Annotated[date | None, Query()] = None, end_date: Annotated[date | None, Query()] = None,
    include_voided: bool = False, db: AsyncSession = Depends(get_db, scope="function")):
    stmt = select(LedgerEntry)
    if kind:
        if kind.upper() not in {"PURCHASE", "OPERATIONAL", "ADMINISTRATIVE"}:
            raise ValidationException(message="Invalid ledger kind.")
        stmt = stmt.where(LedgerEntry.kind == kind.upper())
    if start_date: stmt = stmt.where(LedgerEntry.entry_date >= start_date)
    if end_date: stmt = stmt.where(LedgerEntry.entry_date <= end_date)
    if not include_voided: stmt = stmt.where(LedgerEntry.voided_at.is_(None))
    rows = (await db.execute(stmt.order_by(LedgerEntry.entry_date.desc(), LedgerEntry.created_at.desc()).limit(1000))).scalars().all()
    totals = {"PURCHASE": Decimal("0"), "OPERATIONAL": Decimal("0"), "ADMINISTRATIVE": Decimal("0")}
    for row in rows:
        if not row.voided_at: totals[row.kind] += row.amount
    return success_response(data={"entries": [ledger_dict(x) for x in rows],
                                  "totals": {k: str(v) for k, v in totals.items()}})


@router.get("/admin/ledger/period-summary")
async def ledger_period_summary(admin: AdminUser, month: Annotated[int, Query(ge=1, le=12)],
    year: Annotated[int, Query(ge=2024, le=2100)],
    db: AsyncSession = Depends(get_db, scope="function")):
    start, end = date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
    rows = (await db.execute(select(LedgerEntry.kind, func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
        LedgerEntry.entry_date.between(start, end), LedgerEntry.voided_at.is_(None)).group_by(LedgerEntry.kind))).all()
    totals = {"PURCHASE": Decimal("0"), "OPERATIONAL": Decimal("0"), "ADMINISTRATIVE": Decimal("0")}
    totals.update(dict(rows))
    return success_response(data={"month": month, "year": year,
        "purchases_value": str(totals["PURCHASE"]),
        "operational_expenses": str(totals["OPERATIONAL"]),
        "administrative_expenses": str(totals["ADMINISTRATIVE"])})


@router.post("/admin/ledger")
async def create_ledger(body: LedgerCreate, admin: AdminUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    await lock_open_period(db, body.entry_date)
    row = LedgerEntry(**body.model_dump(), created_by=admin.id)
    db.add(row); await db.flush()
    await AuditRepository(db).log(admin.id, "LEDGER_ENTRY_CREATED", "ledger_entry", row.id,
        {"kind": row.kind, "amount": str(row.amount), "date": row.entry_date.isoformat()})
    return success_response(data=ledger_dict(row))


@router.post("/admin/ledger/{entry_id}/void")
async def void_ledger(body: VoidRequest, admin: AdminUser, entry_id: Annotated[uuid.UUID, Path()],
    db: AsyncSession = Depends(get_db, scope="function")):
    row = await db.scalar(select(LedgerEntry).where(LedgerEntry.id == entry_id).with_for_update())
    if not row: raise NotFoundException(message="Ledger entry not found.")
    if row.voided_at: raise ConflictException(message="Ledger entry is already voided.")
    await lock_open_period(db, row.entry_date)
    row.voided_at, row.voided_by, row.void_reason = now_ist(), admin.id, body.reason.strip()
    await AuditRepository(db).log(admin.id, "LEDGER_ENTRY_VOIDED", "ledger_entry", row.id,
        {"reason": row.void_reason, "amount": str(row.amount)})
    return success_response(data=ledger_dict(row))


def inventory_dict(row):
    return {"id": str(row.id), "sku": row.sku, "name": row.name, "unit": row.unit,
            "quantity": str(row.quantity), "reorder_level": str(row.reorder_level),
            "unit_cost": str(row.unit_cost), "low_stock": row.quantity <= row.reorder_level,
            "is_active": row.is_active}


@router.get("/admin/inventory")
async def list_inventory(admin: AdminUser, db: AsyncSession = Depends(get_db, scope="function")):
    rows = (await db.execute(select(InventoryItem).where(InventoryItem.is_active.is_(True)).order_by(InventoryItem.name))).scalars().all()
    return success_response(data=[inventory_dict(x) for x in rows])


@router.post("/admin/inventory")
async def create_inventory(body: InventoryCreate, admin: AdminUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    row = InventoryItem(sku=body.sku.upper(), name=body.name.strip(), unit=body.unit.strip(),
        quantity=body.opening_quantity, reorder_level=body.reorder_level, unit_cost=body.unit_cost)
    db.add(row)
    try: await db.flush()
    except IntegrityError as exc:
        raise ConflictException(message="That inventory SKU already exists.") from exc
    if body.opening_quantity:
        db.add(InventoryMovement(item_id=row.id, quantity_delta=body.opening_quantity,
            balance_after=body.opening_quantity, reason="Opening balance", recorded_by=admin.id))
    await AuditRepository(db).log(admin.id, "INVENTORY_ITEM_CREATED", "inventory_item", row.id,
                                  {"sku": row.sku, "quantity": str(row.quantity)})
    return success_response(data=inventory_dict(row))


@router.post("/admin/inventory/{item_id}/adjust")
async def adjust_inventory(body: InventoryAdjust, admin: AdminUser,
    item_id: Annotated[uuid.UUID, Path()], db: AsyncSession = Depends(get_db, scope="function")):
    if body.quantity_delta == 0: raise ValidationException(message="Quantity change cannot be zero.")
    row = await db.scalar(select(InventoryItem).where(InventoryItem.id == item_id,
        InventoryItem.is_active.is_(True)).with_for_update())
    if not row: raise NotFoundException(message="Inventory item not found.")
    balance = row.quantity + body.quantity_delta
    if balance < 0: raise ConflictException(message="Adjustment would make stock negative.")
    before = row.quantity; row.quantity = balance
    movement = InventoryMovement(item_id=row.id, quantity_delta=body.quantity_delta,
        balance_after=balance, reason=body.reason.strip(), reference=body.reference, recorded_by=admin.id)
    db.add(movement); await db.flush()
    await AuditRepository(db).log(admin.id, "INVENTORY_ADJUSTED", "inventory_item", row.id,
        {"before": str(before), "delta": str(body.quantity_delta), "after": str(balance), "reason": body.reason})
    return success_response(data=inventory_dict(row))


@router.get("/admin/committee")
async def list_committee(admin: AdminUser, active_only: bool = True,
    db: AsyncSession = Depends(get_db, scope="function")):
    stmt = select(CommitteeAssignment, User).join(User, User.id == CommitteeAssignment.student_id)
    if active_only:
        stmt = stmt.where(CommitteeAssignment.revoked_at.is_(None), CommitteeAssignment.ends_at > now_ist())
    rows = (await db.execute(stmt.order_by(CommitteeAssignment.ends_at.desc()))).all()
    return success_response(data=[{"id": str(a.id), "student_id": str(a.student_id),
        "name": u.name, "registration_number": u.registration_number, "scope": a.scope,
        "starts_at": a.starts_at.isoformat(), "ends_at": a.ends_at.isoformat(),
        "revoked_at": a.revoked_at.isoformat() if a.revoked_at else None} for a, u in rows])


@router.post("/admin/committee/promote")
async def promote_committee(body: CommitteeCreate, admin: AdminUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    now = now_ist()
    if body.ends_at <= body.starts_at or body.ends_at <= now:
        raise ValidationException(message="Committee assignment must end after it starts and in the future.")
    if body.ends_at - body.starts_at > timedelta(days=31):
        raise ValidationException(message="Committee assignments are limited to 31 days.")
    student = await db.scalar(select(User).where(User.id == body.student_id))
    if not student or student.role != "STUDENT" or student.account_status != "ACTIVE":
        raise ValidationException(message="An active student account is required.")
    overlap = await db.scalar(select(CommitteeAssignment.id).where(
        CommitteeAssignment.student_id == body.student_id, CommitteeAssignment.revoked_at.is_(None),
        CommitteeAssignment.ends_at > body.starts_at, CommitteeAssignment.starts_at < body.ends_at))
    if overlap: raise ConflictException(message="This student already has an overlapping committee assignment.")
    row = CommitteeAssignment(**body.model_dump(), assigned_by=admin.id)
    db.add(row); await db.flush()
    await AuditRepository(db).log(admin.id, "COMMITTEE_ASSIGNED", "committee_assignment", row.id,
        {"student_id": str(row.student_id), "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()})
    return success_response(data={"id": str(row.id), "student_id": str(row.student_id), "ends_at": row.ends_at.isoformat()})


@router.post("/admin/committee/revoke/{student_id}")
async def revoke_committee(body: VoidRequest, admin: AdminUser,
    student_id: Annotated[uuid.UUID, Path()], db: AsyncSession = Depends(get_db, scope="function")):
    row = await db.scalar(select(CommitteeAssignment).where(
        CommitteeAssignment.student_id == student_id, CommitteeAssignment.revoked_at.is_(None),
        CommitteeAssignment.ends_at > now_ist()).order_by(CommitteeAssignment.ends_at.desc()).with_for_update())
    if not row: raise NotFoundException(message="No active committee assignment found.")
    row.revoked_at, row.revoked_by, row.revoke_reason = now_ist(), admin.id, body.reason.strip()
    await AuditRepository(db).log(admin.id, "COMMITTEE_REVOKED", "committee_assignment", row.id,
                                   {"student_id": str(student_id), "reason": row.revoke_reason})
    return success_response(data={"id": str(row.id), "revoked_at": row.revoked_at.isoformat()})


@router.post("/admin/attendance/bulk-mark")
async def bulk_attendance(body: BulkAttendanceCreate, admin: AdminUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    if body.meal_date > today_ist(): raise ValidationException(message="Attendance cannot be recorded in the future.")
    await lock_open_period(db, body.meal_date)
    users = (await db.execute(select(User.id).where(User.id.in_(body.student_ids), User.role == "STUDENT",
        User.account_status == "ACTIVE").with_for_update())).scalars().all()
    if set(users) != set(body.student_ids): raise ValidationException(message="Every ID must belong to an active student.")
    existing = (await db.execute(select(Attendance.student_id).where(Attendance.student_id.in_(body.student_ids),
        Attendance.meal_date == body.meal_date, Attendance.meal_type == body.meal_type))).scalars().all()
    if existing: raise ConflictException(message=f"Attendance already exists for {len(existing)} selected student(s).")
    rows = [Attendance(student_id=s, meal_date=body.meal_date, meal_type=body.meal_type,
        attendance_type="ADMIN_OVERRIDE", recorded_at=now_ist(), recorded_by=admin.id,
        reason=body.reason.strip()) for s in body.student_ids]
    db.add_all(rows); await db.flush()
    await AuditRepository(db).log(admin.id, "ATTENDANCE_BULK_RECORDED", "attendance_batch", None,
        {"student_ids": [str(x) for x in body.student_ids], "count": len(rows),
         "meal_date": body.meal_date.isoformat(), "meal_type": body.meal_type, "reason": body.reason})
    return success_response(data={"recorded": len(rows), "attendance_ids": [str(x.id) for x in rows]})


def payment_dict(row, user=None, period=None):
    data = {"id": str(row.id), "period_id": str(row.period_id), "student_id": str(row.student_id),
            "bill_revision": row.bill_revision, "utr": row.utr, "amount": str(row.amount),
            "status": row.status, "review_note": row.review_note,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None}
    if user: data.update({"student_name": user.name, "registration_number": user.registration_number})
    if period: data.update({"month": period.month, "year": period.year})
    return data


@router.get("/me/payments")
async def my_payments(current_user: CurrentUser, db: AsyncSession = Depends(get_db, scope="function")):
    rows = (await db.execute(select(PaymentSubmission, BillingPeriod).join(BillingPeriod,
        BillingPeriod.id == PaymentSubmission.period_id).where(PaymentSubmission.student_id == current_user.id)
        .order_by(PaymentSubmission.created_at.desc()))).all()
    return success_response(data=[payment_dict(p, period=b) for p, b in rows])


@router.post("/me/payments")
async def submit_payment(body: PaymentCreate, current_user: CurrentUser,
    db: AsyncSession = Depends(get_db, scope="function")):
    period = await db.scalar(select(BillingPeriod).where(BillingPeriod.month == body.month,
        BillingPeriod.year == body.year, BillingPeriod.is_published.is_(True)).with_for_update())
    if not period: raise NotFoundException(message="The bill has not been published yet.", code="BILL_NOT_PUBLISHED")
    snapshot = await db.scalar(select(StudentBillSnapshot).where(StudentBillSnapshot.period_id == period.id,
        StudentBillSnapshot.revision == period.revision, StudentBillSnapshot.student_id == current_user.id))
    if not snapshot: raise NotFoundException(message="No invoice was issued for this student.")
    expected = Decimal(str(snapshot.payload["grand_total"]))
    if body.amount != expected: raise ValidationException(message=f"Payment amount must equal the published bill total of {expected}.")
    row = await db.scalar(select(PaymentSubmission).where(PaymentSubmission.period_id == period.id,
        PaymentSubmission.student_id == current_user.id, PaymentSubmission.bill_revision == period.revision).with_for_update())
    if row and row.status != "REJECTED": raise ConflictException(message="A payment is already pending or verified for this bill.")
    if row:
        row.utr, row.amount, row.status = body.utr.upper(), body.amount, "PENDING"
        row.reviewed_by = row.reviewed_at = row.review_note = None
    else:
        row = PaymentSubmission(period_id=period.id, student_id=current_user.id,
            bill_revision=period.revision, utr=body.utr.upper(), amount=body.amount)
        db.add(row)
    try: await db.flush()
    except IntegrityError as exc: raise ConflictException(message="That UTR has already been submitted.") from exc
    await AuditRepository(db).log(current_user.id, "PAYMENT_SUBMITTED", "payment_submission", row.id,
        {"period_id": str(period.id), "revision": period.revision, "utr": row.utr, "amount": str(row.amount)})
    return success_response(data=payment_dict(row, period=period))


@router.get("/admin/payments")
async def list_payments(admin: AdminUser, status: Annotated[str | None, Query()] = None,
    db: AsyncSession = Depends(get_db, scope="function")):
    stmt = select(PaymentSubmission, User, BillingPeriod).join(User, User.id == PaymentSubmission.student_id).join(
        BillingPeriod, BillingPeriod.id == PaymentSubmission.period_id)
    if status:
        status = status.upper()
        if status not in {"PENDING", "VERIFIED", "REJECTED"}: raise ValidationException(message="Invalid payment status.")
        stmt = stmt.where(PaymentSubmission.status == status)
    rows = (await db.execute(stmt.order_by(PaymentSubmission.created_at.desc()).limit(1000))).all()
    return success_response(data=[payment_dict(p, u, b) for p, u, b in rows])


@router.post("/admin/payments/{payment_id}/review")
async def review_payment(body: PaymentReview, admin: AdminUser,
    payment_id: Annotated[uuid.UUID, Path()], db: AsyncSession = Depends(get_db, scope="function")):
    row = await db.scalar(select(PaymentSubmission).where(PaymentSubmission.id == payment_id).with_for_update())
    if not row: raise NotFoundException(message="Payment submission not found.")
    if row.status != "PENDING": raise ConflictException(message="Only pending payments can be reviewed.")
    period = await db.scalar(select(BillingPeriod).where(BillingPeriod.id == row.period_id).with_for_update())
    if not period or not period.is_published or period.revision != row.bill_revision:
        raise ConflictException(message="The related bill revision is no longer published.")
    row.status, row.reviewed_by, row.reviewed_at, row.review_note = body.decision, admin.id, now_ist(), body.note.strip()
    db.add(Notification(user_id=row.student_id,
        title="Payment verified" if body.decision == "VERIFIED" else "Payment needs correction",
        message=("Your mess bill payment was verified." if body.decision == "VERIFIED"
                 else f"Your payment submission was rejected: {row.review_note}"),
        notification_type="SYSTEM", is_read=False))
    await AuditRepository(db).log(admin.id, f"PAYMENT_{body.decision}", "payment_submission", row.id,
                                   {"student_id": str(row.student_id), "utr": row.utr, "note": row.review_note})
    return success_response(data=payment_dict(row))
