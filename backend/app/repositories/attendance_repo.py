import uuid
from datetime import date

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.repositories.base import BaseRepository


class AttendanceRepository(BaseRepository[Attendance]):
    def __init__(self, session: AsyncSession):
        super().__init__(Attendance, session)

    async def get_student_attendance(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str
    ) -> Attendance | None:
        stmt = select(Attendance).where(
            and_(
                Attendance.student_id == student_id,
                Attendance.meal_date == meal_date,
                Attendance.meal_type == meal_type,
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_for_update(
        self, student_id: uuid.UUID, meal_date: date, meal_type: str
    ) -> Attendance | None:
        """SELECT ... FOR UPDATE to lock the row and prevent concurrent insertion."""
        stmt = (
            select(Attendance)
            .where(
                and_(
                    Attendance.student_id == student_id,
                    Attendance.meal_date == meal_date,
                    Attendance.meal_type == meal_type,
                )
            )
            .with_for_update()
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()
