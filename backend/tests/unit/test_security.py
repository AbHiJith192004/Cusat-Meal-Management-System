import pytest
from app.security.password import hash_password, verify_password, needs_rehash
from app.security.jwt_handler import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.utils.exceptions import UnauthorizedException


def test_password_hashing():
    password = "SecretPassword123!"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False
    assert needs_rehash(hashed) is False


def test_jwt_access_token():
    user_id = "123e4567-e89b-12d3-a456-426614174000"
    role = "STUDENT"
    
    token = create_access_token(user_id=user_id, role=role)
    payload = decode_access_token(token)
    
    assert payload["sub"] == user_id
    assert payload["role"] == role
    assert payload["type"] == "access"


def test_invalid_jwt_token():
    with pytest.raises(UnauthorizedException):
        decode_access_token("invalid.token.str")


def test_refresh_token_generation():
    raw_token = generate_refresh_token()
    token_hash = hash_refresh_token(raw_token)
    
    assert len(raw_token) >= 32
    assert len(token_hash) == 64  # SHA-256 hex string length
    assert hash_refresh_token(raw_token) == token_hash
