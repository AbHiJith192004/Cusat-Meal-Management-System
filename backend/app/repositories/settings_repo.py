from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import SystemSetting
from app.repositories.base import BaseRepository


class SystemSettingRepository(BaseRepository[SystemSetting]):
    def __init__(self, session: AsyncSession):
        super().__init__(SystemSetting, session)

    async def get_by_key(self, key: str) -> SystemSetting | None:
        stmt = select(SystemSetting).where(SystemSetting.key == key)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_settings(self) -> list[SystemSetting]:
        stmt = select(SystemSetting)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
