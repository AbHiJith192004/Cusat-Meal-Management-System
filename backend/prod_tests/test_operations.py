import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.database import async_session_factory
from app.models.attendance import Attendance
from app.models.audit import AuditLog
from app.models.billing import BillingPeriod, StudentBillSnapshot
from app.models.operations import InventoryItem, LedgerEntry, MenuPublication, PaymentSubmission
from app.models.notification import Notification
from app.utils.timezone import now_ist
from prod_tests.test_hardening import client, headers, user


@pytest.mark.asyncio
async def test_operational_workflows_persist_validate_and_audit(client):
    admin, student, second = await user('ADMIN'), await user(), await user()
    h = headers(admin)
    day = now_ist().date()

    menu = await client.put(f'/api/v1/admin/menus/{day}/LUNCH',
        json={'items': ['Rice', 'Dal'], 'notes': 'Vegetarian'}, headers=h)
    assert menu.status_code == 200, menu.text
    listed = await client.get(f'/api/v1/menus?start_date={day}&end_date={day}', headers=headers(student))
    assert listed.status_code == 200 and listed.json()['data'][0]['items'] == ['Rice', 'Dal']

    ledger = await client.post('/api/v1/admin/ledger', json={'entry_date': str(day),
        'kind': 'PURCHASE', 'category': 'Rice', 'description': 'Monthly rice delivery',
        'amount': '1250.50', 'vendor': 'Synthetic supplier'}, headers=h)
    assert ledger.status_code == 200, ledger.text
    ledger_id = ledger.json()['data']['id']
    assert (await client.post(f'/api/v1/admin/ledger/{ledger_id}/void',
        json={'reason': 'Duplicate supplier invoice'}, headers=h)).status_code == 200

    stock = await client.post('/api/v1/admin/inventory', json={'sku': 'SYN-' + uuid.uuid4().hex[:8],
        'name': 'Synthetic rice', 'unit': 'kg', 'opening_quantity': '10',
        'reorder_level': '3', 'unit_cost': '50'}, headers=h)
    assert stock.status_code == 200, stock.text
    stock_id = stock.json()['data']['id']
    adjusted = await client.post(f'/api/v1/admin/inventory/{stock_id}/adjust',
        json={'quantity_delta': '-8', 'reason': 'Kitchen issue'}, headers=h)
    assert adjusted.status_code == 200 and adjusted.json()['data']['low_stock'] is True
    rejected = await client.post(f'/api/v1/admin/inventory/{stock_id}/adjust',
        json={'quantity_delta': '-3', 'reason': 'Would be negative'}, headers=h)
    assert rejected.status_code == 409

    start, end = now_ist() - timedelta(minutes=1), now_ist() + timedelta(hours=3)
    assigned = await client.post('/api/v1/admin/committee/promote', json={'student_id': str(student.id),
        'starts_at': start.isoformat(), 'ends_at': end.isoformat(), 'scope': 'ATTENDANCE_SCANNER'}, headers=h)
    assert assigned.status_code == 200, assigned.text
    profile = await client.get('/api/v1/me', headers=headers(student))
    assert profile.json()['data']['capabilities']['attendance_scanner'] is True
    assert (await client.post('/api/v1/attendance/verify', json={'qr_token':'invalid'}, headers=headers(second))).status_code == 403
    assert (await client.post('/api/v1/attendance/verify', json={'qr_token':'invalid'}, headers=headers(student))).status_code != 403
    overlap = await client.post('/api/v1/admin/committee/promote', json={'student_id': str(student.id),
        'starts_at': start.isoformat(), 'ends_at': end.isoformat(), 'scope': 'ATTENDANCE_SCANNER'}, headers=h)
    assert overlap.status_code == 409

    bulk = await client.post('/api/v1/admin/attendance/bulk-mark', json={'student_ids': [str(student.id), str(second.id)],
        'meal_date': str(day), 'meal_type': 'DINNER', 'reason': 'Signed paper attendance register'}, headers=h)
    assert bulk.status_code == 200 and bulk.json()['data']['recorded'] == 2
    recent = await client.get('/api/v1/attendance/recent', headers=headers(student))
    assert recent.status_code == 200 and any(x['student_name'] == student.name for x in recent.json()['data'])
    duplicate = await client.post('/api/v1/admin/attendance/bulk-mark', json={'student_ids': [str(student.id)],
        'meal_date': str(day), 'meal_type': 'DINNER', 'reason': 'Signed paper attendance register'}, headers=h)
    assert duplicate.status_code == 409

    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(MenuPublication).where(MenuPublication.menu_date == day)) >= 1
        assert await db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.id == uuid.UUID(ledger_id), LedgerEntry.voided_at.is_not(None))) == 1
        assert await db.scalar(select(InventoryItem.quantity).where(InventoryItem.id == uuid.UUID(stock_id))) == Decimal('2.000')
        assert await db.scalar(select(func.count()).select_from(Attendance).where(Attendance.meal_date == day, Attendance.meal_type == 'DINNER', Attendance.student_id.in_([student.id, second.id]))) == 2
        assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.actor_id == admin.id)) >= 6


@pytest.mark.asyncio
async def test_payment_is_bound_to_published_invoice_and_reviewed_once(client):
    admin, student = await user('ADMIN'), await user()
    async with async_session_factory() as db:
        existing = set((await db.execute(select(BillingPeriod.month, BillingPeriod.year))).all())
        month, year = next((m, y) for y in range(2024, 2101) for m in range(1, 13) if (m, y) not in existing)
        period = BillingPeriod(month=month, year=year, is_published=True, revision=1,
            published_at=now_ist(), published_by=admin.id)
        db.add(period); await db.flush()
        db.add(StudentBillSnapshot(period_id=period.id, student_id=student.id, revision=1,
            payload={'grand_total': '432.10', 'student': {'name': student.name,
            'registration_number': student.registration_number}}))
        await db.commit()
    wrong = await client.post('/api/v1/me/payments', json={'month':month,'year':year,
        'utr':'SYNTHETIC123','amount':'400.00'}, headers=headers(student))
    assert wrong.status_code == 422
    submitted = await client.post('/api/v1/me/payments', json={'month':month,'year':year,
        'utr':'SYNTHETIC'+uuid.uuid4().hex[:12].upper(),'amount':'432.10'}, headers=headers(student))
    assert submitted.status_code == 200, submitted.text
    payment_id = submitted.json()['data']['id']
    reviewed = await client.post(f'/api/v1/admin/payments/{payment_id}/review',
        json={'decision':'VERIFIED','note':'Matched against bank statement'}, headers=headers(admin))
    assert reviewed.status_code == 200 and reviewed.json()['data']['status'] == 'VERIFIED'
    blocked_reopen = await client.post('/api/v1/admin/bills/unpublish',
        json={'month': month, 'year': year, 'reason':'Correction after payment'}, headers=headers(admin))
    assert blocked_reopen.status_code == 409
    assert (await client.post(f'/api/v1/admin/payments/{payment_id}/review',
        json={'decision':'REJECTED','note':'Second review prohibited'}, headers=headers(admin))).status_code == 409
    async with async_session_factory() as db:
        row = await db.scalar(select(PaymentSubmission).where(PaymentSubmission.id == uuid.UUID(payment_id)))
        assert row.status == 'VERIFIED' and row.reviewed_by == admin.id
        assert await db.scalar(select(func.count()).select_from(Notification).where(
            Notification.user_id == student.id, Notification.title == 'Payment verified')) == 1
