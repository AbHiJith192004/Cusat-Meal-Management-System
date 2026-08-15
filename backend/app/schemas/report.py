from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class MonthlyReportSummary(BaseModel):
    month: int
    year: int
    total_students: int
    total_confirmed_meals: int
    total_attendance_recorded: int
    total_skipped_meals: int
    total_fines_count: int
    total_fines_amount: Decimal
    total_waived_fines_amount: Decimal
