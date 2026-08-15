from typing import Any, Dict, List, Optional


class BusinessException(Exception):
    """Base class for typed business exceptions."""
    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: Optional[Dict[str, Any] | List[Any]] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class NotFoundException(BusinessException):
    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 404, details)


class UnauthorizedException(BusinessException):
    def __init__(self, message: str = "Unauthorized access", code: str = "UNAUTHORIZED", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 401, details)


class ForbiddenException(BusinessException):
    def __init__(self, message: str = "Access forbidden", code: str = "FORBIDDEN", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 403, details)


class ConflictException(BusinessException):
    def __init__(self, message: str = "Resource conflict", code: str = "CONFLICT", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 409, details)


class ValidationException(BusinessException):
    def __init__(self, message: str = "Validation error", code: str = "VALIDATION_ERROR", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 422, details)


class RateLimitException(BusinessException):
    def __init__(self, message: str = "Rate limit exceeded", code: str = "RATE_LIMIT_EXCEEDED", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code, 429, details)


# Specific Exceptions
class AccountNotFoundException(NotFoundException):
    def __init__(self, message: str = "User account not found"):
        super().__init__(message, code="ACCOUNT_NOT_FOUND")


class AccountAlreadyActivatedException(ConflictException):
    def __init__(self, message: str = "Account is already activated"):
        super().__init__(message, code="ACCOUNT_ALREADY_ACTIVATED")


class InvalidCredentialsException(UnauthorizedException):
    def __init__(self, message: str = "Invalid username or password"):
        super().__init__(message, code="INVALID_CREDENTIALS")


class AccountSuspendedException(ForbiddenException):
    def __init__(self, message: str = "Account is suspended"):
        super().__init__(message, code="ACCOUNT_SUSPENDED")


class MealSelectionLockedException(ConflictException):
    def __init__(self, message: str = "Meal selection is locked after 9:00 PM"):
        super().__init__(message, code="MEAL_SELECTION_LOCKED")


class MealNotFoundException(NotFoundException):
    def __init__(self, message: str = "Meal not found"):
        super().__init__(message, code="MEAL_NOT_FOUND")


class AttendanceAlreadyRecordedException(ConflictException):
    def __init__(self, message: str = "Attendance has already been recorded"):
        super().__init__(message, code="ATTENDANCE_ALREADY_RECORDED")


class AttendanceUnavailableException(ConflictException):
    def __init__(self, message: str = "Attendance cannot be recorded at this time"):
        super().__init__(message, code="ATTENDANCE_UNAVAILABLE")


class MealSkippedException(ConflictException):
    def __init__(self, message: str = "You have skipped this meal"):
        super().__init__(message, code="MEAL_SKIPPED")


class QRExpiredException(UnauthorizedException):
    def __init__(self, message: str = "QR code has expired"):
        super().__init__(message, code="QR_EXPIRED")


class QRInvalidException(UnauthorizedException):
    def __init__(self, message: str = "QR code is invalid"):
        super().__init__(message, code="QR_INVALID")


class QRReplayDetectedException(ConflictException):
    def __init__(self, message: str = "QR code replay detected"):
        super().__init__(message, code="QR_REPLAY_DETECTED")


class HolidayConflictException(ConflictException):
    def __init__(self, message: str = "Conflicts with a scheduled holiday"):
        super().__init__(message, code="HOLIDAY_CONFLICT")


class FineAlreadyExistsException(ConflictException):
    def __init__(self, message: str = "A fine already exists for this date/meal"):
        super().__init__(message, code="FINE_ALREADY_EXISTS")


class FineNotWaivableException(ConflictException):
    def __init__(self, message: str = "This fine cannot be waived"):
        super().__init__(message, code="FINE_NOT_WAIVABLE")


class RateLimitExceededException(RateLimitException):
    def __init__(self, message: str = "Too many requests. Please try again later"):
        super().__init__(message, code="RATE_LIMIT_EXCEEDED")


class ImportValidationException(ValidationException):
    def __init__(self, message: str = "Error validating import data", details: Optional[Dict[str, Any] | List[Any]] = None):
        super().__init__(message, code="IMPORT_VALIDATION_ERROR", details=details)
