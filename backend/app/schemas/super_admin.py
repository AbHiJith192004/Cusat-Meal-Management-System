from pydantic import BaseModel, Field

from app.utils.enums import Role


class CreateAdminRequest(BaseModel):
    """No password field on purpose.

    The creator used to choose the new administrator's password, which meant
    one person knew another's credentials and nothing ever forced a change.
    The account is now created PENDING with no password, and the new
    administrator sets their own through the same setup-code flow students
    use.
    """

    registration_number: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default=Role.ADMIN.value, description="ADMIN or SUPER_ADMIN")


class UpdateSettingItem(BaseModel):
    key: str
    value: str


class BatchUpdateSettingsRequest(BaseModel):
    settings: list[UpdateSettingItem]
