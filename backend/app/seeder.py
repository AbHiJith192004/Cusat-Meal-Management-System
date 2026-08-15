import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from app.database import async_session_factory, engine
from app.models.base import Base
from app.models.user import User
from app.models.student import StudentProfile
from app.models.meal import MealSelection
from app.models.settings import SystemSetting
from app.security.password import hash_password
from app.utils.enums import Role, AccountStatus, StudentType, MealStatus, MealType
from app.utils.timezone import now_ist, today_ist

logger = logging.getLogger(__name__)


async def seed_data():
    async with async_session_factory() as session:
        # 1. Seed System Settings
        settings_to_seed = [
            ("meal_window_breakfast_start", "07:00", "Breakfast start time"),
            ("meal_window_breakfast_end", "09:30", "Breakfast end time"),
            ("meal_window_lunch_start", "12:00", "Lunch start time"),
            ("meal_window_lunch_end", "14:30", "Lunch end time"),
            ("meal_window_dinner_start", "19:00", "Dinner start time"),
            ("meal_window_dinner_end", "21:30", "Dinner end time"),
            ("selection_cutoff_time", "21:00", "Selection cutoff time (9:00 PM)"),
            ("selection_cutoff_advance_days", "1", "Days in advance for cutoff"),
            ("fine_amount", "30.00", "Default missed meal fine in INR"),
            ("qr_validity_seconds", "60", "QR code validity TTL in seconds"),
            ("max_monthly_mess_cuts", "10", "Maximum allowed mess cuts per month"),
        ]
        for key, val, desc in settings_to_seed:
            res = await session.execute(select(SystemSetting).where(SystemSetting.key == key))
            existing = res.scalar_one_or_none()
            if not existing:
                session.add(SystemSetting(id=uuid.uuid4(), key=key, value=val, description=desc))
            elif key == "selection_cutoff_time":
                existing.value = val

        # 2. Seed Demo Student User (TEST001 / password123)
        res = await session.execute(select(User).where(User.registration_number == "TEST001"))
        student_user = res.scalar_one_or_none()
        if not student_user:
            student_user = User(
                id=uuid.uuid4(),
                registration_number="TEST001",
                name="Rahul Kumar",
                password_hash=hash_password("password123"),
                role=Role.STUDENT.value,
                account_status=AccountStatus.ACTIVE.value,
                activated_at=now_ist(),
            )
            profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=student_user.id,
                mess_id="MESS-101",
                date_of_birth=date(2000, 1, 15),
                student_type=StudentType.HOSTELLER.value,
            )
            session.add(student_user)
            session.add(profile)
            logger.info("[SEED] Created student: TEST001 / password123")
        else:
            student_user.password_hash = hash_password("password123")
            student_user.account_status = AccountStatus.ACTIVE.value
            logger.info("[SEED] Updated student TEST001 password")

        # 2b. Seed Demo Lakeside Student User (LAKESIDE001 / password123)
        res = await session.execute(select(User).where(User.registration_number == "LAKESIDE001"))
        lakeside_user = res.scalar_one_or_none()
        if not lakeside_user:
            lakeside_user = User(
                id=uuid.uuid4(),
                registration_number="LAKESIDE001",
                name="Anand V. (Lakeside)",
                password_hash=hash_password("password123"),
                role=Role.STUDENT.value,
                account_status=AccountStatus.ACTIVE.value,
                activated_at=now_ist(),
            )
            lakeside_profile = StudentProfile(
                id=uuid.uuid4(),
                user_id=lakeside_user.id,
                mess_id="MESS-LAKE-01",
                date_of_birth=date(2001, 5, 20),
                student_type=StudentType.HOSTELLER.value,
                campus_location="LAKESIDE_CAMPUS",
                department="Marine Engineering (Lakeside)",
            )
            session.add(lakeside_user)
            session.add(lakeside_profile)
            logger.info("[SEED] Created Lakeside student: LAKESIDE001 / password123")
        else:
            lakeside_user.password_hash = hash_password("password123")
            lakeside_user.account_status = AccountStatus.ACTIVE.value
            logger.info("[SEED] Updated Lakeside student LAKESIDE001 password")

        # 3. Seed Demo Admin User (ADMIN001 / password123)
        res = await session.execute(select(User).where(User.registration_number == "ADMIN001"))
        admin_user = res.scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                id=uuid.uuid4(),
                registration_number="ADMIN001",
                name="Dr. Ramesh Sharma (Admin)",
                password_hash=hash_password("password123"),
                role=Role.ADMIN.value,
                account_status=AccountStatus.ACTIVE.value,
                activated_at=now_ist(),
            )
            session.add(admin_user)
            logger.info("[SEED] Created admin: ADMIN001 / password123")
        else:
            admin_user.password_hash = hash_password("password123")
            logger.info("[SEED] Updated admin ADMIN001 password")

        # 4. Seed Demo Super Admin User (SADMIN001 / password123)
        res = await session.execute(select(User).where(User.registration_number == "SADMIN001"))
        sadmin_user = res.scalar_one_or_none()
        if not sadmin_user:
            sadmin_user = User(
                id=uuid.uuid4(),
                registration_number="SADMIN001",
                name="Super Warden (Super Admin)",
                password_hash=hash_password("password123"),
                role=Role.SUPER_ADMIN.value,
                account_status=AccountStatus.ACTIVE.value,
                activated_at=now_ist(),
            )
            session.add(sadmin_user)
            logger.info("[SEED] Created super admin: SADMIN001 / password123")

        # 5. Seed Meal Selections for Next 7 Days for Demo Student
        today = today_ist()
        for i in range(7):
            day = today + timedelta(days=i)
            for mt in [MealType.BREAKFAST.value, MealType.LUNCH.value, MealType.DINNER.value]:
                res = await session.execute(
                    select(MealSelection).where(
                        MealSelection.student_id == student_user.id,
                        MealSelection.meal_date == day,
                        MealSelection.meal_type == mt,
                    )
                )
                if not res.scalar_one_or_none():
                    session.add(
                        MealSelection(
                            id=uuid.uuid4(),
                            student_id=student_user.id,
                            meal_date=day,
                            meal_type=mt,
                            status=MealStatus.CONFIRMED.value,
                        )
                    )

        await session.commit()
        logger.info("[SEED] All demo data seeded successfully!")
