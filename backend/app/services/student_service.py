import uuid
from typing import Any

from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.student import StudentProfile
from app.repositories.user_repo import UserRepository
from app.utils.enums import Role


class StudentService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)

    async def search_students(
        self,
        query: str | None = None,
        account_status: str | None = None,
        student_type: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """Search student accounts with optional filters and pagination."""
        stmt = (
            select(User)
            .join(User.profile)
            .where(User.role == Role.STUDENT.value)
            .options(selectinload(User.profile))
        )

        if query:
            q = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    User.name.ilike(q),
                    User.registration_number.ilike(q),
                    StudentProfile.mess_id.ilike(q),
                )
            )

        if account_status:
            stmt = stmt.where(User.account_status == account_status)
        if student_type:
            stmt = stmt.where(StudentProfile.student_type == student_type)

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        # Paginate
        stmt = stmt.order_by(User.registration_number).offset((page - 1) * per_page).limit(per_page)
        res = await self.session.execute(stmt)
        users = res.scalars().all()

        from app.models.meal import MealSelection
        results = []
        for u in users:
            done_cnt = (await self.session.execute(
                select(func.count()).where(MealSelection.student_id == u.id, MealSelection.status == "ATTENDED")
            )).scalar_one() or 0

            skipped_cnt = (await self.session.execute(
                select(func.count()).where(MealSelection.student_id == u.id, MealSelection.status == "SKIPPED")
            )).scalar_one() or 0

            results.append({
                "id": str(u.id),
                "registration_number": u.registration_number,
                "name": u.name,
                "account_status": u.account_status,
                "activated_at": u.activated_at.isoformat() if u.activated_at else None,
                "mess_id": u.profile.mess_id if u.profile else None,
                "date_of_birth": u.profile.date_of_birth.isoformat() if u.profile else None,
                "student_type": u.profile.student_type if u.profile else None,
                "campus_location": u.profile.campus_location if (u.profile and hasattr(u.profile, "campus_location")) else "MAIN_CAMPUS",
                "photo_url": u.profile.photo_url if u.profile else None,
                "meals_done": done_cnt,
                "meals_skipped": skipped_cnt,
            })

        return results, total
