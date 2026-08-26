import logging
import uuid
from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User, RefreshToken
from app.repositories.user_repo import UserRepository, RefreshTokenRepository
from app.repositories.audit_repo import AuditRepository
from app.security.password import hash_password, verify_password
from app.security.rate_limiter import account_lockout
from app.security.jwt_handler import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    get_refresh_token_expiry,
)
from app.utils.enums import AccountStatus
from app.utils.exceptions import (
    AccountNotFoundException,
    AccountAlreadyActivatedException,
    InvalidCredentialsException,
    AccountSuspendedException,
    UnauthorizedException,
    RateLimitExceededException,
)
from app.utils.timezone import now_ist

logger = logging.getLogger(__name__)
settings = get_settings()


class AuthService:
    """Service handling activation, login, logout, and token refresh."""

    # Deliberately identical whether the account is missing, has no profile,
    # or simply has a different DOB on file. Distinct messages let anyone
    # confirm which registration numbers exist, and they are sequential.
    GENERIC_ACTIVATION_FAILURE = (
        "We could not activate this account. Check the registration number "
        "and date of birth, then try again."
    )
    GENERIC_RESET_FAILURE = (
        "We could not verify those details. Check the registration number "
        "and date of birth, then try again."
    )

    @staticmethod
    def _assert_not_locked(lockout_key: str) -> None:
        """Per-account lockout, layered on top of the per-IP rate limit.

        The IP limit stops one host hammering the service; this stops a
        distributed guess against a single low-entropy factor (date of
        birth) spread across many hosts.
        """
        cfg = get_settings()
        if account_lockout.is_locked(
            lockout_key, cfg.AUTH_MAX_FAILED_ATTEMPTS, cfg.AUTH_LOCKOUT_MINUTES * 60
        ):
            raise RateLimitExceededException(
                message=(
                    "Too many failed attempts for this account. "
                    f"Try again in {cfg.AUTH_LOCKOUT_MINUTES} minutes."
                )
            )

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = RefreshTokenRepository(db)
        self.audit_repo = AuditRepository(db)

    async def activate_account(
        self, registration_number: str, date_of_birth: str, password: str
    ) -> dict:
        """Activate a pre-imported student account.

        Steps:
        1. Find user by registration number
        2. Verify account is PENDING
        3. Verify DOB matches
        4. Hash password with Argon2id
        5. Update status to ACTIVE
        6. Write audit log
        """
        lockout_key = f"activate:{registration_number.strip().upper()}"
        self._assert_not_locked(lockout_key)

        user = await self.user_repo.get_by_registration_number(registration_number)

        try:
            provided_dob = date.fromisoformat(date_of_birth)
        except ValueError:
            raise InvalidCredentialsException(message=self.GENERIC_ACTIVATION_FAILURE)

        # One generic failure covers "no such account", "no profile", and
        # "wrong DOB" so none of them can be told apart from outside.
        if user is None or user.profile is None or user.profile.date_of_birth != provided_dob:
            account_lockout.record_failure(lockout_key)
            logger.warning("Failed activation attempt for %s", registration_number)
            raise InvalidCredentialsException(message=self.GENERIC_ACTIVATION_FAILURE)

        # Past this point the caller has proved they know the DOB, so the
        # account's real state is safe to disclose.
        if user.account_status == AccountStatus.ACTIVE.value:
            raise AccountAlreadyActivatedException()

        if user.account_status == AccountStatus.SUSPENDED.value:
            raise AccountSuspendedException()

        account_lockout.clear(lockout_key)

        # Activate
        now = now_ist()
        user.password_hash = hash_password(password)
        user.account_status = AccountStatus.ACTIVE.value
        user.activated_at = now

        await self.audit_repo.log(
            actor_id=user.id,
            action="STUDENT_ACTIVATED",
            target_type="user",
            target_id=user.id,
            metadata={"registration_number": registration_number},
        )

        await self.db.commit()
        logger.info("Account activated: %s", registration_number)
        return {"message": "Account activated successfully. You can now log in."}

    async def reset_password_by_dob(
        self, registration_number: str, date_of_birth: str, new_password: str
    ) -> dict:
        """Reset password for a student account by verifying Date of Birth."""
        lockout_key = f"reset:{registration_number.strip().upper()}"
        self._assert_not_locked(lockout_key)

        user = await self.user_repo.get_by_registration_number(registration_number)

        try:
            provided_dob = date.fromisoformat(date_of_birth)
        except ValueError:
            raise InvalidCredentialsException(message=self.GENERIC_RESET_FAILURE)

        if user is None or user.profile is None or user.profile.date_of_birth != provided_dob:
            account_lockout.record_failure(lockout_key)
            logger.warning("Failed DOB password reset attempt for %s", registration_number)
            raise InvalidCredentialsException(message=self.GENERIC_RESET_FAILURE)

        if user.account_status == AccountStatus.SUSPENDED.value:
            raise AccountSuspendedException()

        account_lockout.clear(lockout_key)

        now = now_ist()
        user.password_hash = hash_password(new_password)
        if user.account_status == AccountStatus.PENDING.value:
            user.account_status = AccountStatus.ACTIVE.value
            user.activated_at = now

        await self.audit_repo.log(
            actor_id=user.id,
            action="PASSWORD_RESET_DOB",
            target_type="user",
            target_id=user.id,
            metadata={"registration_number": registration_number},
        )

        await self.db.commit()
        logger.info("Password reset via DOB for: %s", registration_number)
        return {"message": "Password reset successfully! You can now log in with your new password."}

    async def login(
        self, registration_number: str, password: str
    ) -> tuple[str, str, int]:
        """Authenticate a user and return tokens.

        Returns:
            Tuple of (access_token, refresh_token, expires_in_seconds)
        """
        lockout_key = f"login:{registration_number.strip().upper()}"
        self._assert_not_locked(lockout_key)

        user = await self.user_repo.get_by_registration_number(registration_number)

        if user is None or not user.password_hash or not verify_password(password, user.password_hash):
            account_lockout.record_failure(lockout_key)
            raise InvalidCredentialsException()

        # Credentials check out, so the account's own state can be reported
        # precisely - the caller has already proved who they are.
        if user.account_status == AccountStatus.PENDING.value:
            raise InvalidCredentialsException(message="Account not yet activated")

        if user.account_status == AccountStatus.SUSPENDED.value:
            raise AccountSuspendedException()

        account_lockout.clear(lockout_key)

        # Generate tokens
        access_token = create_access_token(str(user.id), user.role)
        refresh_token = generate_refresh_token()

        # Store refresh token hash
        token_record = RefreshToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=get_refresh_token_expiry(),
        )
        self.db.add(token_record)

        await self.audit_repo.log(
            actor_id=user.id,
            action="USER_LOGIN",
            target_type="user",
            target_id=user.id,
        )

        await self.db.commit()
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        logger.info("User logged in: %s", registration_number)
        return access_token, refresh_token, expires_in

    async def refresh_tokens(self, refresh_token: str) -> tuple[str, str, int]:
        """Rotate a refresh token and issue new access + refresh tokens.

        Implements refresh token rotation:
        1. Find token by hash
        2. Verify not expired
        3. Revoke old token
        4. Issue new token pair
        5. Link old → new for audit trail
        """
        token_hash = hash_refresh_token(refresh_token)
        token_record = await self.token_repo.get_by_token_hash(token_hash)

        if token_record is None:
            raise UnauthorizedException(message="Invalid refresh token")

        if token_record.expires_at.replace(tzinfo=None) < now_ist().replace(tzinfo=None):
            token_record.is_revoked = True
            raise UnauthorizedException(message="Refresh token expired")

        # Load the user
        user = await self.user_repo.get_by_id(token_record.user_id)
        if user is None or user.account_status != AccountStatus.ACTIVE.value:
            token_record.is_revoked = True
            raise UnauthorizedException(message="Account not available")

        # Rotate: revoke old, create new
        new_refresh = generate_refresh_token()
        new_hash = hash_refresh_token(new_refresh)

        token_record.is_revoked = True
        token_record.replaced_by = new_hash

        new_token_record = RefreshToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=new_hash,
            expires_at=get_refresh_token_expiry(),
        )
        self.db.add(new_token_record)
        await self.db.commit()

        access_token = create_access_token(str(user.id), user.role)
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return access_token, new_refresh, expires_in

    async def logout(self, refresh_token: str) -> dict:
        """Revoke a refresh token (logout)."""
        token_hash = hash_refresh_token(refresh_token)
        token_record = await self.token_repo.get_by_token_hash(token_hash)

        if token_record:
            token_record.is_revoked = True
            await self.db.commit()

        return {"message": "Logged out successfully"}
