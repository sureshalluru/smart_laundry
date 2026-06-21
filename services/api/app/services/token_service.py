"""
Token service for item tracking — generates and validates short-lived JWT tokens
used in QR code URLs for the mobile upload page.
"""
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass

from jose import jwt, JWTError
from app.config import settings

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
DEFAULT_EXPIRY_HOURS = 2


@dataclass
class TokenPayload:
    order_id: str
    laundry_id: str
    phase: str
    employee_id: str
    exp: datetime
    iat: datetime


def generate_token(
    order_id: str,
    laundry_id: str,
    phase: str,
    employee_id: str,
    expires_in_hours: int = DEFAULT_EXPIRY_HOURS,
) -> str:
    """
    Generate a short-lived JWT for mobile upload page access.

    Args:
        order_id: The order this token grants access to
        laundry_id: The laundry shop ID
        phase: Either "intake" or "fold"
        employee_id: ID of the employee generating the token
        expires_in_hours: Token validity duration (default 2 hours)

    Returns:
        Encoded JWT string
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=expires_in_hours)

    payload = {
        "orderId": order_id,
        "laundryId": laundry_id,
        "phase": phase,
        "employeeId": employee_id,
        "exp": expire,
        "iat": now,
        "type": "item_tracking",
    }

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def validate_token(token: str) -> Optional[TokenPayload]:
    """
    Validate and decode a tracking token.

    Args:
        token: The JWT string to validate

    Returns:
        TokenPayload if valid, None if expired or invalid
    """
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])

        # Verify it's an item tracking token
        if payload.get("type") != "item_tracking":
            logger.warning("Token validation failed: wrong token type")
            return None

        return TokenPayload(
            order_id=payload["orderId"],
            laundry_id=payload["laundryId"],
            phase=payload["phase"],
            employee_id=payload["employeeId"],
            exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        )
    except JWTError as e:
        logger.warning(f"Token validation failed: {e}")
        return None
    except (KeyError, TypeError) as e:
        logger.warning(f"Token payload malformed: {e}")
        return None


def hash_token(token: str) -> str:
    """
    Create a SHA-256 hash of the token for storage in the database.
    We store the hash (not the raw token) for security.
    """
    return hashlib.sha256(token.encode()).hexdigest()
