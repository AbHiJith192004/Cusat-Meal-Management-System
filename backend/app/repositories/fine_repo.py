import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fine import Fine
from app.repositories.base import BaseRepository
from app.utils.enums import FineStatus


class FineRepository(BaseRepository[Fine]):
    def __init__(self, session: AsyncSession):
        super().__init__(Fine, session)

    async def get_by_student_and_meal(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str
    ) -> Fine | None:
        stmt = select(Fine).where(
            and_(
                Fine.student_id == student_id,
                Fine.meal_date == meal_date,
                Fine.meal_type == meal_type,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_student_fines(
        self, student_id: uuid.UUID, status: str | None = None
    ) -> list[Fine]:
        stmt = select(Fine).where(Fine.student_id == student_id)
        if status:
            stmt = stmt.where(Fine.status == status)
        stmt = stmt.order_by(Fine.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_fines(
        self,
        status: str | None = None,
        student_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[Fine]:
        stmt = select(Fine)
        if status:
            stmt = stmt.where(Fine.status == status)
        if student_id:
            stmt = stmt.where(Fine.student_id == student_id)
        stmt = stmt.order_by(Fine.created_at.desc()).offset(skip).limit(limit)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())
