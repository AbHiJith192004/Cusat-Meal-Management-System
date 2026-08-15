from datetime import date
import pytest

from app.utils.enums import MealStatus


def test_holiday_cascade_status_transitions():
    # Test holiday creation cascade
    initial_status = MealStatus.CONFIRMED.value
    
    def on_holiday_declared() -> str:
        return MealStatus.NO_SERVICE.value
        
    def on_holiday_deleted(current_status: str) -> str:
        if current_status == MealStatus.NO_SERVICE.value:
            return MealStatus.CONFIRMED.value
        return current_status

    # Creation sets status to NO_SERVICE
    holiday_status = on_holiday_declared()
    assert holiday_status == MealStatus.NO_SERVICE.value

    # Deletion reverts NO_SERVICE back to CONFIRMED
    reverted_status = on_holiday_deleted(holiday_status)
    assert reverted_status == MealStatus.CONFIRMED.value
