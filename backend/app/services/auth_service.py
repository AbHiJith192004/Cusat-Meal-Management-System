import logging
import uuid
from datetime import timedelta
import secrets
import hmac
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User, RefreshToken
from app.repositories.user_repo import UserRepository, RefreshTokenRepository
from app.repositories.audit_repo import AuditRepository
from app.security.password import hash_password, verify_password
from app.security.rate_limiter import (
    check_account_lockout,
    clear_auth_failures,
    record_auth_failure,
)
from app.security.jwt_handler import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    get_refresh_token_expiry,
)
from app.utils.enums import AccountStatus
from app.utils.exceptions import (
    InvalidCredentialsException,
    AccountSuspendedException,
    UnauthorizedException,
)
from app.utils.timezone import now_ist

logger = logging.getLogger(__name__)
settings = get_settings()


class AuthService:
    """Service handling activation, login, logout, and token refresh."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.token_repo = RefreshTokenRepository(db)
        self.audit_repo = AuditRepository(db)

    # A code handed over in person is used within minutes, and a short window
    # limits the damage if it is overheard. A code sent as an activation link
    # to a whole intake cannot be: students read messages hours later, and
    # re-minting 135 codes because the window closed is the problem this is
    # meant to avoid. Hence two windows, not one.
    HANDOVER_TTL_MINUTES = 30
    ACTIVATION_LINK_TTL_MINUTES = 48 * 60

    async def issue_setup_code(self, student_id: uuid.UUID, actor_id: uuid.UUID, reason: str,
                               ttl_minutes: int | None = None) -> dict:
        from app.utils.exceptions import ValidationException
        user = (await self.db.execute(select(User).where(User.id == student_id).with_for_update())).scalar_one_or_none()
        if not user or user.role != "STUDENT" or user.account_status == "SUSPENDED":
            raise ValidationException(message="An eligible student account is required.")
        code = secrets.token_urlsafe(32)
        user.setup_code_hash = hash_refresh_token(code)
        user.setup_code_expires_at = now_ist() + timedelta(
            minutes=ttl_minutes if ttl_minutes is not None else self.HANDOVER_TTL_MINUTES)
        await self.audit_repo.log(actor_id=actor_id, action="ACCOUNT_SETUP_CODE_ISSUED",
                                  target_type="user", target_id=user.id, metadata={"reason": reason})
        # Only the digest is stored. Staff delivers this once after checking identity.
        return {"setup_code": code, "expires_at": user.setup_code_expires_at.isoformat()}

    async def issue_activation_codes(self, actor_id: uuid.UUID, reason: str,
                                     reissue: bool = False) -> dict:
        """Mint activation codes for every student who still cannot sign in.

        Minting a code overwrites whatever digest the account held, which
        silently invalidates any link already sent to that student. So by
        default an account that still holds an unexpired code is SKIPPED and
        reported, making this safe to run twice -- the realistic case being
        a second run to catch students imported after the first batch.
        Passing reissue replaces them, for when the links themselves leaked
        or were lost.

        Only PENDING accounts are touched. An ACTIVE student already has a
        password, and handing out a credential that overwrites it in bulk is
        not activation, it is a mass password reset.
        """
        now = now_ist()
        students = (await self.db.execute(select(User).where(
            User.role == "STUDENT",
            User.account_status == AccountStatus.PENDING.value,
        ).order_by(User.registration_number, User.id).with_for_update())).scalars().all()

        issued, skipped = [], []
        for user in students:
            holds_live_code = (user.setup_code_hash is not None
                               and user.setup_code_expires_at is not None
                               and user.setup_code_expires_at > now)
            if holds_live_code and not reissue:
                skipped.append({
                    "registration_number": user.registration_number,
                    "name": user.name,
                    "reason": "Already holds an unexpired code; its link is still valid.",
                    "expires_at": user.setup_code_expires_at.isoformat(),
                })
                continue
            code = secrets.token_urlsafe(32)
            user.setup_code_hash = hash_refresh_token(code)
            user.setup_code_expires_at = now + timedelta(minutes=self.ACTIVATION_LINK_TTL_MINUTES)
            await self.audit_repo.log(
                actor_id=actor_id, action="ACCOUNT_SETUP_CODE_ISSUED",
                target_type="user", target_id=user.id,
                metadata={"reason": reason, "bulk": True, "reissue": reissue},
            )
            issued.append({
                "registration_number": user.registration_number,
                "name": user.name,
                "setup_code": code,
                "expires_at": user.setup_code_expires_at.isoformat(),
            })
        return {
            "issued": issued,
            "skipped": skipped,
            "issued_count": len(issued),
            "skipped_count": len(skipped),
            "pending_total": len(students),
        }

    async def set_password_with_code(self, registration_number: str, setup_code: str, password: str) -> dict:
        user = (await self.db.execute(select(User).where(
            User.registration_number == registration_number.strip().upper()).with_for_update())).scalar_one_or_none()
        if (not user or user.account_status == "SUSPENDED" or not user.setup_code_hash
                or not user.setup_code_expires_at or user.setup_code_expires_at <= now_ist()
                or not hmac.compare_digest(user.setup_code_hash, hash_refresh_token(setup_code))):
            raise InvalidCredentialsException(message="Setup code is invalid or expired. Contact mess staff.")
        user.password_hash = await run_in_threadpool(hash_password, password)
        user.account_status = "ACTIVE"
        user.activated_at = user.activated_at or now_ist()
        user.setup_code_hash = None
        user.setup_code_expires_at = None
        user.session_version += 1
        await self.token_repo.revoke_all_user_tokens(user.id)
        await self.audit_repo.log(actor_id=user.id, action="PASSWORD_SET_WITH_CODE",
                                  target_type="user", target_id=user.id)
        return {"message": "Password saved. Sign in with your new password."}

    async def activate_with_date_of_birth(self, registration_number: str, date_of_birth,
                                         password: str) -> dict:
        """First activation using the student's own id and date of birth.

        THE ONE RULE THAT MAKES THIS TOLERABLE: it works only while the
        account is PENDING. Date of birth is a weak secret -- 141 of 143
        student ids on the live sheet are 2602 plus four digits, and a
        hostel-mate does not guess a birthday, they know it -- so it must
        never be able to take an account that already has a password. That
        would be a reset, and the standing decision is that ids and dates of
        birth do not suffice for a reset. After activation this path is
        permanently closed for that account and only a staff-issued code
        works, which is set_password_with_code above.

        Chosen over activation links because sending 139 students their own
        individual link by hand was not workable, and the links cannot be
        posted to a group -- any student could then claim any account.

        The residual risk is real and accepted: someone who knows another
        student's id and birthday can activate that account first, and the
        rightful student then finds activation refused. That is visible in
        the audit log and an administrator can re-issue, which is why the
        action below is logged distinctly from a code redemption.
        """
        from app.utils.exceptions import ValidationException
        from app.models.student import StudentProfile

        if date_of_birth is None:
            raise ValidationException(message="A valid date of birth is required.")

        row = (await self.db.execute(
            select(User, StudentProfile)
            .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
            .where(User.registration_number == registration_number.strip().upper())
            .with_for_update(of=User)
        )).first()

        # One message for every failure. Distinguishing "no such student" from
        # "wrong date" would turn this into a way to test which ids exist, and
        # the ids are already easy to enumerate.
        refusal = InvalidCredentialsException(
            message="We could not match those details. If your account is already "
                    "set up, sign in instead, or ask mess staff for a setup code.")

        if row is None:
            raise refusal
        user, profile = row
        if (user.role != "STUDENT"
                or user.account_status != AccountStatus.PENDING.value
                or profile is None
                or profile.date_of_birth != date_of_birth):
            raise refusal

        user.password_hash = await run_in_threadpool(hash_password, password)
        user.account_status = AccountStatus.ACTIVE.value
        user.activated_at = user.activated_at or now_ist()
        # Any outstanding staff-issued code is spent along with this, so a
        # code handed out earlier cannot be redeemed a second time later.
        user.setup_code_hash = None
        user.setup_code_expires_at = None
        user.session_version += 1
        await self.token_repo.revoke_all_user_tokens(user.id)
        await self.audit_repo.log(actor_id=user.id, action="PASSWORD_SET_WITH_DATE_OF_BIRTH",
                                  target_type="user", target_id=user.id)
        return {"message": "Password saved. Sign in with your new password."}

    async def login(
        self, registration_number: str, password: str
    ) -> tuple[str, str, int]:
        """Authenticate a user and return tokens.

        Returns:
            Tuple of (access_token, refresh_token, expires_in_seconds)
        """
        # Failure-only lockout, checked before any password work so a locked
        # account costs an attacker nothing to discover and no Argon2 time.
        prior_failures = await check_account_lockout(registration_number)

        user = (await self.db.execute(select(User).where(User.registration_number == registration_number.strip().upper()).with_for_update())).scalar_one_or_none()

        if user is None or not user.password_hash or not await run_in_threadpool(verify_password, password, user.password_hash):
            # Recorded on its own connection: this must survive the rollback
            # that the raised exception triggers on the request transaction.
            await record_auth_failure(registration_number)
            raise InvalidCredentialsException()

        # Credentials check out, so the account's own state can be reported
        # precisely - the caller has already proved who they are.
        if user.account_status == AccountStatus.PENDING.value:
            raise InvalidCredentialsException(message="Account not yet activated")

        if user.account_status == AccountStatus.SUSPENDED.value:
            raise AccountSuspendedException()


        if prior_failures:
            await clear_auth_failures(registration_number)


        # Generate tokens
        access_token = create_access_token(str(user.id), user.role, {"sv": user.session_version})
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
        owner_id = await self.db.scalar(select(RefreshToken.user_id).where(
            RefreshToken.token_hash == token_hash, RefreshToken.is_revoked.is_(False)))
        if owner_id is None:
            raise UnauthorizedException(message="Invalid refresh token")
        # Use the same user-then-token lock order as password changes.
        await self.db.execute(select(User.id).where(User.id == owner_id).with_for_update())
        token_record = await self.token_repo.get_by_token_hash(token_hash)

        if token_record is None:
            raise UnauthorizedException(message="Invalid refresh token")

        if token_record.expires_at <= now_ist():
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

        access_token = create_access_token(str(user.id), user.role, {"sv": user.session_version})
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
