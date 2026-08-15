import uuid
from datetime import date

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meal import MealSelection
from app.repositories.base import BaseRepository


class MealRepository(BaseRepository[MealSelection]):
    def __init__(self, session: AsyncSession):
        super().__init__(MealSelection, session)

    async def get_student_meal(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str
    ) -> MealSelection | None:
        stmt = select(MealSelection).where(
            and_(
                MealSelection.student_id == student_id,
                MealSelection.meal_date == meal_date,
                MealSelection.meal_type == meal_type,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_student_meals_range(
        self, student_id: uuid.UUID, start_date: date, end_date: date
    ) -> list[MealSelection]:
        stmt = select(MealSelection).where(
            and_(
                MealSelection.student_id == student_id,
                MealSelection.meal_date >= start_date,
                MealSelection.meal_date <= end_date,
            )
        ).order_by(MealSelection.meal_date, MealSelection.meal_type)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_student_skipped_meals_for_date(
        self, student_id: uuid.UUID, meal_date: date
    ) -> list[MealSelection]:
        stmt = select(MealSelection).where(
            and_(
                MealSelection.student_id == student_id,
                MealSelection.meal_date == meal_date,
                MealSelection.status == "SKIPPED",
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_student_meals_for_date(
        self, student_id: uuid.UUID, meal_date: date
    ) -> list[MealSelection]:
        stmt = select(MealSelection).where(
            and_(
                MealSelection.student_id == student_id,
                MealSelection.meal_date == meal_date,
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_student_skipped_meals_for_month(
        self, student_id: uuid.UUID, year: int, month: int
    ) -> list[MealSelection]:
        import calendar
        _, last_day = calendar.monthrange(year, month)
        start_d = date(year, month, 1)
        end_d = date(year, month, last_day)

        stmt = select(MealSelection).where(
            and_(
                MealSelection.student_id == student_id,
                MealSelection.meal_date >= start_d,
                MealSelection.meal_date <= end_d,
                MealSelection.status == "SKIPPED",
            )
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def count_student_monthly_mess_cuts(
        self, student_id: uuid.UUID, year: int, month: int
    ) -> int:
        """Count distinct dates in the given month where all 3 meals (BREAKFAST, LUNCH, DINNER) are SKIPPED (Full Day Mess Cut)."""
        skipped = await self.get_student_skipped_meals_for_month(student_id, year, month)
        from collections import defaultdict
        by_date = defaultdict(set)
        for m in skipped:
            by_date[m.meal_date].add(m.meal_type.upper())
        return sum(1 for d, types in by_date.items() if len(types) == 3)



