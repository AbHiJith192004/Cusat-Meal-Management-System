from enum import Enum


class Role(str, Enum):
    """User roles for RBAC."""
    STUDENT = "STUDENT"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class AccountStatus(str, Enum):
    """User account status."""
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class MealType(str, Enum):
    """Types of meals served."""
    BREAKFAST = "BREAKFAST"
    LUNCH = "LUNCH"
    DINNER = "DINNER"


class MealStatus(str, Enum):
    """Meal selection status."""
    CONFIRMED = "CONFIRMED"
    SKIPPED = "SKIPPED"
    NO_SERVICE = "NO_SERVICE"


class AttendanceType(str, Enum):
    """How attendance was recorded."""
    QR = "QR"
    MANUAL = "MANUAL"
    ADMIN_OVERRIDE = "ADMIN_OVERRIDE"


class FineStatus(str, Enum):
    """Fine payment/waiver status."""
    PENDING = "PENDING"
    WAIVED = "WAIVED"
    PAID = "PAID"


class StudentType(str, Enum):
    """Student residential type."""
    HOSTELLER = "HOSTELLER"
    DAY_SCHOLAR = "DAY_SCHOLAR"


class NotificationType(str, Enum):
    """Notification category."""
    ATTENDANCE = "ATTENDANCE"
    FINE = "FINE"
    SYSTEM = "SYSTEM"
    MEAL = "MEAL"
