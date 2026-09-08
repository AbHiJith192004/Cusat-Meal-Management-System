"""One definition of opted-in-day billing, shared by preview and publication."""
import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from sqlalchemy import select
from app.models.user import User
from app.models.meal import MealSelection
from app.models.holiday import Holiday
from app.models.fine import Fine
from app.utils.timezone import IST

MEALS = ('BREAKFAST', 'LUNCH', 'DINNER')
POLICY = 'OPTED_IN_DAYS_PLUS_FINES_V1'
CENT = Decimal('0.01')


async def calculate_bills(session, year: int, month: int, expenses: Decimal) -> dict:
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    # Pending, never-activated imports do not silently accrue default charges.
    users = (await session.execute(select(User).where(
        User.role == 'STUDENT', User.account_status != 'PENDING'
    ).order_by(User.registration_number, User.id))).scalars().all()
    selections = (await session.execute(select(MealSelection).where(
        MealSelection.meal_date.between(start, end)))).scalars().all()
    holidays = (await session.execute(select(Holiday).where(
        Holiday.holiday_date.between(start, end)))).scalars().all()
    fines = (await session.execute(select(Fine).where(
        Fine.meal_date.between(start, end), Fine.status != 'WAIVED'
    ).order_by(Fine.meal_date, Fine.meal_type, Fine.id))).scalars().all()
    selections = {(s.student_id, s.meal_date, s.meal_type): s.status for s in selections}
    holidays = {(h.holiday_date, h.meal_type) for h in holidays}
    fine_map = {}
    for fine in fines:
        fine_map.setdefault(fine.student_id, []).append({
            'id': str(fine.id), 'meal_date': fine.meal_date.isoformat(),
            'meal_type': fine.meal_type, 'amount': str(fine.amount), 'status': fine.status,
        })
    students = []
    for user in users:
        enrolled = (user.activated_at or user.created_at).astimezone(IST).date()
        if enrolled > end:
            continue
        days = []
        current = max(start, enrolled)
        while current <= end:
            if any((current, None) not in holidays and (current, meal) not in holidays
                   and selections.get((user.id, current, meal), 'CONFIRMED') == 'CONFIRMED'
                   for meal in MEALS):
                days.append(current.isoformat())
            current += timedelta(days=1)
        lines = fine_map.get(user.id, [])
        students.append({
            'student_id': str(user.id),
            'student': {'name': user.name, 'registration_number': user.registration_number},
            'effective_days': len(days), 'opted_in_days': days,
            'enrollment_date': enrolled.isoformat(),
            'fines': lines, 'total_fines': str(sum((Decimal(f['amount']) for f in lines), Decimal('0.00'))),
        })
    denominator = sum(s['effective_days'] for s in students)
    rate = expenses / denominator if denominator else Decimal('0')
    # Allocate exact cents using largest remainders; never lose/add money by
    # multiplying a rounded display rate. Registration/UUID order breaks ties.
    shares = [rate * s['effective_days'] for s in students]
    allocated = [share.quantize(CENT, rounding=ROUND_DOWN) for share in shares]
    if denominator:
        cents_left = int((expenses - sum(allocated)) / CENT)
        order = sorted(range(len(students)), key=lambda i: (-(shares[i] - allocated[i]), i))
        for i in order[:cents_left]:
            allocated[i] += CENT
    for s, charge in zip(students, allocated):
        s.update({'month': month, 'year': year, 'policy': POLICY,
                  'mess_daily_rate': str(rate.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)),
                  'base_charge': str(charge), 'food_charge': str(charge),
                  'grand_total': str(charge + Decimal(s['total_fines']))})
    return {'policy': POLICY, 'chargeable_days': denominator,
            'mess_daily_rate': str(rate.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)),
            'total_fines': str(sum((Decimal(s['total_fines']) for s in students), Decimal('0.00'))),
            'students': students}
