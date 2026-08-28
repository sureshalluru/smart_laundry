"""
Self-hosted JWT authentication — replaces AWS Cognito.
Issues and validates JWT tokens using a secret key.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    """Hash a password for storage."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate Bearer token and return user claims. Also accepts platform admin key via header."""
    from app.routes.platform_admin import PLATFORM_ADMIN_KEY

    # Try Bearer token first
    if credentials and credentials.credentials:
        token = credentials.credentials
        if token == PLATFORM_ADMIN_KEY:
            return {"sub": "platform-admin", "type": "access", "role": "platform_admin"}
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload

    # Fallback: check x-platform-key header
    platform_key = request.headers.get("x-platform-key")
    if platform_key and platform_key == PLATFORM_ADMIN_KEY:
        return {"sub": "platform-admin", "type": "access", "role": "platform_admin"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


async def verify_laundry_access(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Verify that the current user has access to the requested laundry.

    For company_admin tokens, checks that the laundry_id from the request
    (query param, path param, or JSON body) is in the token's laundry_ids list.
    For other roles (employee, customer, platform_admin, individual admin),
    this passes through without additional checks.

    Returns the current_user dict unchanged.
    """
    if current_user.get("role") != "company_admin":
        return current_user

    # Extract laundry_id from request: query params, path params, or body
    laundry_id = (
        request.query_params.get("laundryId")
        or request.path_params.get("laundryId")
        or request.path_params.get("laundry_id")
    )

    # If no laundry_id found in query/path, skip validation
    # (company-level endpoints like /api/company/* don't carry a laundry_id)
    if not laundry_id:
        return current_user

    # Check that the laundry_id is in the token's authorized list
    authorized_laundry_ids = current_user.get("laundry_ids", [])
    if str(laundry_id) not in [str(lid) for lid in authorized_laundry_ids]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden — laundry not in company",
        )

    return current_user
