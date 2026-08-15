import uuid
import jwt
from datetime import datetime, timedelta
import pytest

from app.config import get_settings
from app.utils.exceptions import QRExpiredException, QRInvalidException
from app.utils.timezone import now_ist

settings = get_settings()


def test_qr_token_signing_and_decoding():
    student_id = str(uuid.uuid4())
    meal_type = "LUNCH"
    date_str = "2026-08-08"
    now = now_ist()
    exp = now + timedelta(seconds=60)

    payload = {
        "sub": student_id,
        "meal": meal_type,
        "date": date_str,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),
        "type": "qr",
    }

    token = jwt.encode(payload, settings.QR_SECRET_KEY, algorithm="HS256")
    decoded = jwt.decode(token, settings.QR_SECRET_KEY, algorithms=["HS256"])

    assert decoded["sub"] == student_id
    assert decoded["meal"] == meal_type
    assert decoded["date"] == date_str


def test_expired_qr_token():
    payload = {
        "sub": str(uuid.uuid4()),
        "meal": "DINNER",
        "date": "2026-08-08",
        "exp": int((now_ist() - timedelta(seconds=10)).timestamp()),
        "jti": str(uuid.uuid4()),
        "type": "qr",
    }
    token = jwt.encode(payload, settings.QR_SECRET_KEY, algorithm="HS256")

    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(token, settings.QR_SECRET_KEY, algorithms=["HS256"])


def test_tampered_qr_token():
    payload = {"sub": str(uuid.uuid4()), "meal": "BREAKFAST", "type": "qr"}
    token = jwt.encode(payload, "wrong_secret_key", algorithm="HS256")

    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, settings.QR_SECRET_KEY, algorithms=["HS256"])
