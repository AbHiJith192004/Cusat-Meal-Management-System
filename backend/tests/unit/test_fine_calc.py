from decimal import Decimal
import pytest

from app.utils.enums import FineStatus, MealStatus


def test_fine_eligibility_logic():
    # Helper to test fine generation conditions
    def should_generate_fine(meal_status: str, has_attendance: bool, is_holiday: bool) -> bool:
        if is_holiday:
            return False
        if meal_status == MealStatus.SKIPPED.value or meal_status == MealStatus.NO_SERVICE.value:
            return False
        if meal_status == MealStatus.CONFIRMED.value and not has_attendance:
            return True
        return False

    assert should_generate_fine("CONFIRMED", has_attendance=False, is_holiday=False) is True
    assert should_generate_fine("CONFIRMED", has_attendance=True, is_holiday=False) is False
    assert should_generate_fine("SKIPPED", has_attendance=False, is_holiday=False) is False
    assert should_generate_fine("CONFIRMED", has_attendance=False, is_holiday=True) is False


def test_fine_waiver_state_machine():
    fine_status = FineStatus.PENDING.value
    
    # Valid transition: PENDING -> WAIVED
    def transition_to_waived(current_status: str, reason: str) -> str:
        if not reason or len(reason.strip()) < 3:
            raise ValueError("Reason required")
        if current_status != FineStatus.PENDING.value:
            raise ValueError("Can only waive PENDING fines")
        return FineStatus.WAIVED.value

    assert transition_to_waived(fine_status, "Medical reason") == FineStatus.WAIVED.value

    with pytest.raises(ValueError, match="Can only waive PENDING fines"):
        transition_to_waived(FineStatus.WAIVED.value, "Another reason")

    with pytest.raises(ValueError, match="Reason required"):
        transition_to_waived(FineStatus.PENDING.value, "")
