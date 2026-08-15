from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

# Configure Argon2id hasher with sensible defaults
ph = PasswordHasher(
    time_cost=3,        # iterations
    memory_cost=65536,  # 64MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its Argon2id hash.
    
    Returns True if the password matches, False otherwise.
    Never raises on mismatch — just returns False.
    """
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Check if a password hash needs to be rehashed (e.g., if params changed)."""
    return ph.check_needs_rehash(password_hash)
