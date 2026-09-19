"""Fill a LOCAL demo database with enough realistic data to see every screen.

Production screens are mostly empty at launch -- no attendance, no fines, no
bills, no payments -- so there is no way to judge the interface from it. This
builds a parallel instance that looks like a mess a month into term.

Nothing here may ever touch production. The guard below refuses any database
that is not on localhost with 'demo' in its name, and ops/demo.sh only ever
points it at one it created itself.

Driven by ops/demo.sh; not meant to be run directly.
"""
from __future__ import annotations

import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

random.seed(20260919)  # same demo every time, so screenshots are comparable

STUDENTS = [
    # name, reg, type, hostel, room, dept, active
    ("Abhijith S",        "26021001", "HOSTELLER",   "Sanathana", "304", "Computer Science & Engineering", True),
    ("Sreyas K V",        "26021002", "HOSTELLER",   "Lakeside",  "51",  "Computer Applications", True),
    ("Anand Krishna V",   "26021003", "HOSTELLER",   "Sanathana", "112", "School of Management", True),
    ("Fathima Nasrin",    "26021004", "HOSTELLER",   "Lakeside",  "29B", "Marine Biology", True),
    ("Rahul Menon",       "26021005", "HOSTELLER",   "Sanathana", "58 A","Civil Engineering", True),
    ("Devika Nair",       "26021006", "DAY_SCHOLAR", None,        None,  "Physics", True),
    ("Joyal Joseph",      "26021007", "OUTMESS",     "Lakeside",  "04",  "Chemical Oceanography", True),
    ("Nikhil Raj",        "26021008", "HOSTELLER",   "Sanathana", "220", "Electronics", False),  # never activated
]

WEEK_MENU = {
    0: [("Chapati / Porotta", "Veg Stew", "Egg Curry", "Tea"),
        ("Kerala Rice Meals", "Fish Curry", "Avial", "Moru"),
        ("Chapati", "Chicken Curry", "Paneer Butter Masala", "Milk")],
    1: [("Idli", "Sambar", "Coconut Chutney", "Coffee"),
        ("Kerala Rice Meals", "Fish Fry", "Thoran", "Moru"),
        ("Porotta", "Beef Curry", "Curd Rice", "Tea")],
    2: [("Puttu", "Kadala Curry", "Banana", "Tea"),
        ("Rice Meals", "Sambar", "Cabbage Thoran", "Rasam"),
        ("Chapati", "Egg Roast", "Milk")],
    3: [("Dosa", "Sambar", "Chutney", "Coffee"),
        ("Ghee Rice", "Chicken Curry", "Pickle", "Payasam"),
        ("Porotta", "Veg Kurma", "Tea")],
    4: [("Appam", "Vegetable Stew", "Tea"),
        ("Kerala Meals", "Fish Curry", "Pulissery", "Payasam"),
        ("Chapati", "Chicken Curry", "Milk")],
    5: [("Upma", "Pappadam", "Coffee"),
        ("Biryani", "Raita", "Pickle"),
        ("Bread", "Egg Curry", "Tea")],
    6: [("Idiyappam", "Egg Curry", "Tea"),
        ("Rice Meals", "Sambar", "Beans Thoran", "Curd"),
        ("Fried Rice", "Gobi Manchurian", "Milk")],
}


async def main() -> int:
    from sqlalchemy.engine import make_url
    from app.config import get_settings

    url = make_url(get_settings().DATABASE_URL)
    if url.host not in {"localhost", "127.0.0.1"} or "demo" not in (url.database or ""):
        print("refusing: demo seeding only runs against a local database named *demo*",
              file=sys.stderr)
        return 2

    from app.database import async_session_factory, close_db
    from app.models.user import User
    from app.models.student import StudentProfile
    from app.models.meal import MealSelection
    from app.models.attendance import Attendance
    from app.models.fine import Fine
    from app.models.operations import (LedgerEntry, MenuPublication, InventoryItem,
                                       CommitteeAssignment, PaymentSubmission)
    from app.security.password import hash_password
    from app.services.billing_service import BillingService
    from app.utils.timezone import now_ist

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    password = hash_password("demo-password-2026")
    start = today.replace(day=1)                       # this month, for activity
    last_month_end = start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)   # the month we bill

    async with async_session_factory() as db:
        # --- people ----------------------------------------------------
        sadmin = User(id=uuid.uuid4(), registration_number="DEMOSUPER", name="Dr. Ramesh Sharma (Super)",
                      email="super@demo.local", password_hash=password,
                      role="SUPER_ADMIN", account_status="ACTIVE", activated_at=now_ist())
        admin = User(id=uuid.uuid4(), registration_number="DEMOADMIN", name="Mess Office (Admin)",
                     email="admin@demo.local", password_hash=password,
                     role="ADMIN", account_status="ACTIVE", activated_at=now_ist())
        db.add_all([sadmin, admin])
        await db.flush()

        students = []
        enrolled = datetime.combine(last_month_start, datetime.min.time()).astimezone()
        for name, reg, stype, hostel, room, dept, active in STUDENTS:
            u = User(id=uuid.uuid4(), registration_number=reg, name=name,
                     email=f"{reg}@ug.cusat.ac.in", phone="9" + reg[-9:].rjust(9, "0"),
                     password_hash=password if active else None,
                     role="STUDENT", account_status="ACTIVE" if active else "PENDING",
                     activated_at=enrolled if active else None, created_at=enrolled)
            db.add(u)
            await db.flush()
            db.add(StudentProfile(id=uuid.uuid4(), user_id=u.id, mess_id=f"M-{reg}",
                                  date_of_birth=date(2004, 1 + (len(students) % 12), 10),
                                  department=dept, student_type=stype,
                                  campus_location="MAIN_CAMPUS", course="B.Tech",
                                  hostel_name=hostel, room_number=room))
            students.append((u, stype, active))

        # --- the week's menu, every slot filled -------------------------
        meals = ["BREAKFAST", "LUNCH", "DINNER"]
        for offset in range(7):
            for mi, items in enumerate(WEEK_MENU[offset]):
                db.add(MenuPublication(menu_date=monday + timedelta(days=offset),
                                       meal_type=meals[mi], items=list(items),
                                       published_by=admin.id))

        # --- a month of behaviour --------------------------------------
        # Attendance for most students most days, a scatter of mess cuts, and
        # fines where someone opted in and never scanned.
        eaters = [u for u, stype, active in students if active and stype != "OUTMESS"]
        day = start
        while day < today:
            for u in eaters:
                for meal in meals:
                    roll = random.random()
                    if roll < 0.10:
                        db.add(MealSelection(id=uuid.uuid4(), student_id=u.id, meal_date=day,
                                             meal_type=meal, status="SKIPPED"))
                    elif roll < 0.88:
                        db.add(Attendance(id=uuid.uuid4(), student_id=u.id, meal_date=day,
                                          meal_type=meal, attendance_type="QR_SCAN",
                                          recorded_at=now_ist(), recorded_by=admin.id))
                    elif roll < 0.92:
                        db.add(Fine(id=uuid.uuid4(), student_id=u.id, meal_date=day,
                                    meal_type=meal, amount=Decimal("30.00"), status="PENDING"))
            day += timedelta(days=1)

        # --- the books --------------------------------------------------
        for entry_day, kind, cat, desc, amt, vendor in [
            (5,  "PURCHASE", "Grocery", "General provisions and spices", "9800", "Kerala Traders"),
            (5,  "PURCHASE", "Milk", "Toned milk pouches (Milma)", "4160", "Milma Depot"),
            (7,  "PURCHASE", "Fish", "Fresh harbour fish", "6200", "Harbour Market"),
            (8,  "PURCHASE", "Meat", "Broiler chicken lot", "8550", "Al Noor Chicken"),
            (9,  "PURCHASE", "Vegetables", "Vegetables and produce", "3600", "Market"),
            (6,  "OPERATIONAL", "Gas/Fuel", "Indane commercial LPG refill", "7400", "Indane"),
            (10, "OPERATIONAL", "Maintenance", "Kitchen exhaust filter cleaning", "2800", None),
            (11, "OPERATIONAL", "Sanitation", "Pest control spraying", "1800", None),
            (3,  "ADMINISTRATIVE", "Salary", "Kitchen staff salary", "85000", None),
            (3,  "ADMINISTRATIVE", "Allowance", "Staff allowance", "12000", None),
        ]:
            db.add(LedgerEntry(id=uuid.uuid4(), entry_date=start + timedelta(days=entry_day),
                               kind=kind, category=cat, description=desc,
                               amount=Decimal(amt), vendor=vendor, created_by=admin.id))

        for sku, iname, unit, qty, reorder, cost in [
            ("RICE50", "Rice", "kg", "180", "50", "62"),
            ("OIL15",  "Cooking oil", "l", "22", "20", "145"),
            ("GAS19",  "LPG cylinder", "unit", "3", "4", "1850"),
            ("SUGAR",  "Sugar", "kg", "45", "20", "48"),
            ("DAL",    "Toor dal", "kg", "12", "25", "130"),
        ]:
            db.add(InventoryItem(id=uuid.uuid4(), sku=sku, name=iname, unit=unit,
                                 quantity=Decimal(qty), reorder_level=Decimal(reorder),
                                 unit_cost=Decimal(cost)))

        # Scanner access for one student, so the committee panel is not empty.
        db.add(CommitteeAssignment(id=uuid.uuid4(), student_id=eaters[0].id,
                                   starts_at=now_ist() - timedelta(days=1),
                                   ends_at=now_ist() + timedelta(days=6),
                                   scope="ATTENDANCE_SCANNER", assigned_by=admin.id))
        await db.commit()

        # --- last month's bill, through the real service ----------------
        last = last_month_end
        figures = {"opening_stock_value": "18000.00", "purchases_value": "132000.00",
                   "closing_stock_value": "15000.00", "operational_expenses": "22000.00",
                   "administrative_expenses": "97000.00"}
        service = BillingService(db)
        preview = await service.preview(last.month, last.year, figures)
        await service.publish(last.month, last.year,
                              {**figures, "preview_token": preview["preview_token"]}, sadmin.id)
        await db.commit()

        period = await service.get_period(last.month, last.year)
        # Payments in each state, so the review screen shows all three.
        for i, (u, stype, active) in enumerate([s for s in students if s[2]][:3]):
            db.add(PaymentSubmission(
                id=uuid.uuid4(), period_id=period.id, student_id=u.id,
                bill_revision=period.revision, utr=f"UTR{20260900 + i}DEMO",
                amount=Decimal(str(preview["students"][i]["grand_total"])),
                status=["PENDING", "VERIFIED", "REJECTED"][i],
                reviewed_by=None if i == 0 else admin.id,
                reviewed_at=None if i == 0 else now_ist(),
                review_note=None if i == 0 else ("Matched the bank statement." if i == 1
                                                 else "UTR not found on the statement."),
            ))
        await db.commit()

        print(f"seeded {len(students)} students, a full week of menus, "
              f"a published {last.strftime('%B %Y')} bill and 3 payment submissions")
    await close_db()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
