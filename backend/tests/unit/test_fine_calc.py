"""Fine amount resolution and waiver validation, through the real FineService.

The previous version defined should_generate_fine() and transition_to_waived()
inside the test and asserted against those, so FineService never ran. What is
unit-testable here is the part of the real code that executes before any
database access; the reconciliation and persistence paths are covered by the
integration suite.
"""
from decimal import Decimal

import pytest

from app.services.fine_service import FineService
from app.utils.enums import FineStatus
from app.utils.exceptions import ValidationException


class _StubSettingsRepo:
    def __init__(self, values: dict[str, str] | None = None):
        self.values = values or {}

    async def get_by_key(self, key: str):
        if key not in self.values:
            return None
        return type("Setting", (), {"value": self.values[key]})()


def _service(overrides: dict[str, str] | None = None) -> FineService:
    service = FineService.__new__(FineService)
    service.settings_repo = _StubSettingsRepo(overrides)
    return service


@pytest.mark.asyncio
async def test_fine_amount_falls_back_to_thirty_when_unconfigured():
    amount = await _service().get_fine_amount()
    assert amount == Decimal('30.00')
    assert isinstance(amount, Decimal)


@pytest.mark.asyncio
async def test_fine_amount_uses_the_configured_value():
    assert await _service({'fine_amount': '45.50'}).get_fine_amount() == Decimal('45.50')


@pytest.mark.asyncio
async def test_fine_amount_is_decimal_not_float():
    """Money must not round-trip through binary floating point."""
    amount = await _service({'fine_amount': '0.10'}).get_fine_amount()
    assert amount * 3 == Decimal('0.30')


@pytest.mark.asyncio
@pytest.mark.parametrize('reason', ['', '   ', 'ok', ' a '])
async def test_waiver_requires_a_substantive_reason(reason):
    """Rejected before any database work, so a stub-free service suffices.

    A waiver erases a real charge, so the reason is the only audit trail of
    why. Blank and near-blank reasons are refused.
    """
    with pytest.raises(ValidationException):
        await FineService.__new__(FineService).waive_fine(fine_id=None, reason=reason, admin_id=None)


def test_waived_is_a_distinct_terminal_status():
    assert FineStatus.WAIVED.value != FineStatus.PENDING.value
    assert FineStatus.WAIVED.value == 'WAIVED'
