import uuid
from datetime import date

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.holiday import Holiday
from app.repositories.base import BaseRepository


class HolidayRepository(BaseRepository[Holiday]):
    def __init__(self, session: AsyncSession):
        super().__init__(Holiday, session)

    async def get_for_date(self, holiday_date: date, meal_type: str | None = None) -> list[Holiday]:
        stmt = select(Holiday).where(Holiday.holiday_date == holiday_date)
        if meal_type:
            stmt = stmt.where(or_(Holiday.meal_type == meal_type, Holiday.meal_type.is_(None)))
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_in_range(self, start_date: date, end_date: date) -> list[Holiday]:
        stmt = select(Holiday).where(
            and_(Holiday.holiday_date >= start_date, Holiday.holiday_date <= end_date)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())
