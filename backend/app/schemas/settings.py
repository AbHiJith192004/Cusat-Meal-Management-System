from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class SystemSettingResponse(BaseModel):
    id: UUID
    key: str
    value: str
    description: str | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UpdateSettingRequest(BaseModel):
    value: str
