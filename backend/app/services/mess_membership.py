"""Who is actually on the mess, written down once.

`student_type` was purely descriptive before OUTMESS existed: the admin list
filtered on it and the profile response displayed it, but nothing that moved
money ever read it. Both the billing calculator and the fine reconciler
selected their cohort as `role == STUDENT and account_status != PENDING`.

That made adding OUTMESS to the enum quietly dangerous. A missing meal
selection counts as CONFIRMED in both of those places -- deliberately, so
that a student who never opens the calendar is still billed for the food
they ate -- so an outmess student would have drawn a full month of opted-in
days, been charged a share of the mess's expenses for meals they never took,
and enlarged the denominator that sets everybody else's per-day rate. It
would have looked like it worked.

So the exclusion lives here, in one place that both call sites use, rather
than as two copies of the same `not_in` clause that can drift apart.
"""
from sqlalchemy import Select, select

from app.models.student import StudentProfile
from app.utils.enums import StudentType


def excluded_from_the_mess() -> Select:
    """User ids that must never be billed, fined, or served a meal.

    A subquery rather than a join so that a STUDENT row with no profile at
    all is treated as on the mess. That is the safe direction: such an
    account is a data problem to be noticed on a bill, not a student to be
    silently dropped from billing.
    """
    return select(StudentProfile.user_id).where(
        StudentProfile.student_type == StudentType.OUTMESS.value
    )
