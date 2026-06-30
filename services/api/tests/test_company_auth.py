"""
Tests for Company Admin authentication in auth.py.

Covers:
- POST /api/auth/login with type=company_admin
- Successful login issues correct JWT claims
- Invalid credentials return 401
- Missing fields return 400
- Inactive admin returns 401

Validates: Requirements 2.1
"""

import asyncio
import uuid
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from jose import jwt

from app.auth import hash_password, ALGORITHM
from app.config import settings


# ---------------------------------------------------------------------------
# Mock helpers (same pattern as test_company_crud.py)
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor that returns pre-configured rows in sequence."""

    def __init__(self, rows=None):
        self._rows = rows or []
        self._call_index = 0

    def execute(self, query, params=None):
        pass

    def fetchone(self):
        if self._call_index < len(self._rows):
            row = self._rows[self._call_index]
            self._call_index += 1
            return row
        self._call_index += 1
        return None

    def fetchall(self):
        if self._call_index < len(self._rows):
            result = self._rows[self._call_index]
            self._call_index += 1
            return result if isinstance(result, list) else [result]
        self._call_index += 1
        return []


class MockConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db(cursor):
    conn = MockConnection(cursor)
    yield conn


# ---------------------------------------------------------------------------
# Tests: POST /api/auth/login with type=company_admin
# ---------------------------------------------------------------------------


class TestCompanyAdminLogin:
    """Tests for company admin login via /api/auth/login."""

    def test_login_success_returns_jwt_with_correct_claims(self):
        """Should issue JWT with sub, role, company_id, laundry_ids, email, name."""
        from app.routes.auth import login

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        password = "SecurePass123!"
        password_hash = hash_password(password)

        cursor = MockCursor(rows=[
            # fetchone: company admin record
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "owner@acme.com",
                "password_hash": password_hash,
                "first_name": "John",
                "last_name": "Doe",
                "is_active": True,
            },
            # fetchall: laundry_ids for the company
            [
                {"laundry_id": "1"},
                {"laundry_id": "3"},
                {"laundry_id": "7"},
            ],
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "owner@acme.com",
                "password": password,
            }
            result = asyncio.get_event_loop().run_until_complete(login(body=body))

        assert result["status"] == "success"
        assert "accessToken" in result
        assert "refreshToken" in result
        assert result["user"]["role"] == "company_admin"
        assert result["user"]["company_id"] == company_id
        assert result["user"]["email"] == "owner@acme.com"
        assert result["user"]["name"] == "John Doe"
        assert result["user"]["laundry_ids"] == ["1", "3", "7"]
        assert result["user"]["sub"] == admin_id

        # Decode access token and verify claims
        decoded = jwt.decode(result["accessToken"], settings.jwt_secret_key, algorithms=[ALGORITHM])
        assert decoded["sub"] == admin_id
        assert decoded["role"] == "company_admin"
        assert decoded["company_id"] == company_id
        assert decoded["laundry_ids"] == ["1", "3", "7"]
        assert decoded["email"] == "owner@acme.com"
        assert decoded["name"] == "John Doe"
        assert decoded["type"] == "access"

    def test_login_success_empty_laundry_ids(self):
        """Should return empty laundry_ids list when company has no locations."""
        from app.routes.auth import login

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        password = "Test123!"
        password_hash = hash_password(password)

        cursor = MockCursor(rows=[
            # fetchone: company admin record
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "admin@solo.com",
                "password_hash": password_hash,
                "first_name": "Jane",
                "last_name": None,
                "is_active": True,
            },
            # fetchall: no laundries assigned
            [],
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "admin@solo.com",
                "password": password,
            }
            result = asyncio.get_event_loop().run_until_complete(login(body=body))

        assert result["status"] == "success"
        assert result["user"]["laundry_ids"] == []
        assert result["user"]["name"] == "Jane"

    def test_login_invalid_password_returns_401(self):
        """Should return 401 when password does not match hash."""
        from app.routes.auth import login

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        password_hash = hash_password("CorrectPassword")

        cursor = MockCursor(rows=[
            # fetchone: company admin record
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "owner@acme.com",
                "password_hash": password_hash,
                "first_name": "John",
                "last_name": "Doe",
                "is_active": True,
            },
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "owner@acme.com",
                "password": "WrongPassword",
            }
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(login(body=body))

            assert exc_info.value.status_code == 401
            assert "Invalid credentials" in exc_info.value.detail

    def test_login_email_not_found_returns_401(self):
        """Should return 401 when email does not exist in company_admins."""
        from app.routes.auth import login

        cursor = MockCursor(rows=[
            # fetchone: no admin found
            None,
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "nonexistent@acme.com",
                "password": "AnyPassword",
            }
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(login(body=body))

            assert exc_info.value.status_code == 401
            assert "Invalid credentials" in exc_info.value.detail

    def test_login_missing_email_returns_400(self):
        """Should return 400 when email is missing."""
        from app.routes.auth import login

        body = {
            "type": "company_admin",
            "password": "SomePassword",
        }
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(login(body=body))

        assert exc_info.value.status_code == 400
        assert "Email and password required" in exc_info.value.detail

    def test_login_missing_password_returns_400(self):
        """Should return 400 when password is missing."""
        from app.routes.auth import login

        body = {
            "type": "company_admin",
            "email": "admin@acme.com",
        }
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(login(body=body))

        assert exc_info.value.status_code == 400
        assert "Email and password required" in exc_info.value.detail

    def test_login_inactive_admin_returns_401(self):
        """Should return 401 when admin is inactive (is_active = FALSE)."""
        from app.routes.auth import login

        # An inactive admin won't be found by the query (WHERE is_active = TRUE)
        cursor = MockCursor(rows=[
            # fetchone: no admin found (filtered out by is_active = TRUE)
            None,
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "inactive@acme.com",
                "password": "AnyPassword",
            }
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(login(body=body))

            assert exc_info.value.status_code == 401
            assert "Invalid credentials" in exc_info.value.detail

    def test_login_laundry_ids_are_strings(self):
        """Should convert laundry_ids to strings in the JWT payload."""
        from app.routes.auth import login

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        password = "Test123!"
        password_hash = hash_password(password)

        cursor = MockCursor(rows=[
            # fetchone: company admin record
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "owner@multi.com",
                "password_hash": password_hash,
                "first_name": "Alice",
                "last_name": "Smith",
                "is_active": True,
            },
            # fetchall: laundry_ids (as integers from DB)
            [
                {"laundry_id": 10},
                {"laundry_id": 20},
            ],
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "owner@multi.com",
                "password": password,
            }
            result = asyncio.get_event_loop().run_until_complete(login(body=body))

        assert result["user"]["laundry_ids"] == ["10", "20"]
        # Verify they're strings in the decoded JWT too
        decoded = jwt.decode(result["accessToken"], settings.jwt_secret_key, algorithms=[ALGORITHM])
        assert all(isinstance(lid, str) for lid in decoded["laundry_ids"])



# ---------------------------------------------------------------------------
# Tests: verify_laundry_access middleware
# Validates: Requirements 2.2, 2.3, 2.5, 8.4, 8.5
# ---------------------------------------------------------------------------


class TestVerifyLaundryAccess:
    """Tests for the verify_laundry_access dependency in app/auth.py."""

    def _make_request(self, query_params=None, path_params=None):
        """Create a mock Request object with query_params and path_params."""
        request = MagicMock()
        request.query_params = query_params or {}
        request.path_params = path_params or {}
        return request

    def test_company_admin_access_granted_for_authorized_laundry(self):
        """Should pass through when laundry_id is in the token's laundry_ids list."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["1", "3", "7"],
            "type": "access",
        }
        request = self._make_request(query_params={"laundryId": "3"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_company_admin_access_denied_for_unauthorized_laundry(self):
        """Should raise 403 when laundry_id is NOT in the token's laundry_ids list."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["1", "3", "7"],
            "type": "access",
        }
        request = self._make_request(query_params={"laundryId": "99"})

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                verify_laundry_access(request=request, current_user=current_user)
            )
        assert exc_info.value.status_code == 403
        assert "Forbidden" in exc_info.value.detail
        assert "laundry not in company" in exc_info.value.detail

    def test_company_admin_access_via_path_param_laundryId(self):
        """Should check laundry_id from path params (laundryId variant)."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["10", "20"],
            "type": "access",
        }
        request = self._make_request(path_params={"laundryId": "20"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_company_admin_access_via_path_param_laundry_id(self):
        """Should check laundry_id from path params (laundry_id snake_case variant)."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["5", "15"],
            "type": "access",
        }
        request = self._make_request(path_params={"laundry_id": "5"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_company_admin_no_laundry_id_in_request_passes_through(self):
        """Should pass through when no laundry_id is in the request (company-level endpoints)."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["1", "3"],
            "type": "access",
        }
        request = self._make_request()  # No query params or path params

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_non_company_admin_passes_through_unchanged(self):
        """Should pass through for non-company_admin roles without any laundry_id check."""
        from app.auth import verify_laundry_access

        # Employee token
        current_user = {
            "sub": "emp-123",
            "role": "employee",
            "laundry_id": "5",
            "type": "access",
        }
        request = self._make_request(query_params={"laundryId": "99"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_individual_admin_passes_through_unchanged(self):
        """Should pass through for individual admin tokens (no role field)."""
        from app.auth import verify_laundry_access

        # Individual admin token (no role or role != company_admin)
        current_user = {
            "sub": "admin-999",
            "type": "access",
            "laundry_id": "5",
        }
        request = self._make_request(query_params={"laundryId": "5"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_platform_admin_passes_through_unchanged(self):
        """Should pass through for platform_admin role."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "platform-admin",
            "type": "access",
            "role": "platform_admin",
        }
        request = self._make_request(query_params={"laundryId": "42"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_company_admin_integer_laundry_id_string_comparison(self):
        """Should handle string/int comparison correctly (laundry_ids stored as strings)."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": ["1", "3", "7"],
            "type": "access",
        }
        # Query param comes as string "7"
        request = self._make_request(query_params={"laundryId": "7"})

        result = asyncio.get_event_loop().run_until_complete(
            verify_laundry_access(request=request, current_user=current_user)
        )
        assert result == current_user

    def test_company_admin_empty_laundry_ids_denies_all(self):
        """Should deny access for company_admin with empty laundry_ids list."""
        from app.auth import verify_laundry_access

        current_user = {
            "sub": "admin-123",
            "role": "company_admin",
            "company_id": "company-456",
            "laundry_ids": [],
            "type": "access",
        }
        request = self._make_request(query_params={"laundryId": "1"})

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                verify_laundry_access(request=request, current_user=current_user)
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: POST /api/auth/refresh with company_admin tokens
# Validates: Requirements 2.4
# ---------------------------------------------------------------------------


class TestCompanyAdminTokenRefresh:
    """Tests for token refresh with company_admin tokens."""

    def test_refresh_preserves_company_admin_claims(self):
        """Should issue a new access token with all company_admin claims preserved."""
        from app.routes.auth import refresh_token
        from app.auth import create_refresh_token

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())

        token_data = {
            "sub": admin_id,
            "role": "company_admin",
            "company_id": company_id,
            "laundry_ids": ["1", "3", "7"],
            "email": "owner@acme.com",
            "name": "John Doe",
        }
        refresh = create_refresh_token(token_data)

        body = {"refreshToken": refresh}
        result = asyncio.get_event_loop().run_until_complete(refresh_token(body=body))

        assert result["status"] == "success"
        assert "accessToken" in result

        # Decode the new access token and verify all claims are preserved
        decoded = jwt.decode(result["accessToken"], settings.jwt_secret_key, algorithms=[ALGORITHM])
        assert decoded["sub"] == admin_id
        assert decoded["role"] == "company_admin"
        assert decoded["company_id"] == company_id
        assert decoded["laundry_ids"] == ["1", "3", "7"]
        assert decoded["email"] == "owner@acme.com"
        assert decoded["name"] == "John Doe"
        assert decoded["type"] == "access"

    def test_refresh_with_empty_laundry_ids(self):
        """Should preserve empty laundry_ids list during refresh."""
        from app.routes.auth import refresh_token
        from app.auth import create_refresh_token

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())

        token_data = {
            "sub": admin_id,
            "role": "company_admin",
            "company_id": company_id,
            "laundry_ids": [],
            "email": "new@acme.com",
            "name": "New Admin",
        }
        refresh = create_refresh_token(token_data)

        body = {"refreshToken": refresh}
        result = asyncio.get_event_loop().run_until_complete(refresh_token(body=body))

        decoded = jwt.decode(result["accessToken"], settings.jwt_secret_key, algorithms=[ALGORITHM])
        assert decoded["role"] == "company_admin"
        assert decoded["laundry_ids"] == []
        assert decoded["company_id"] == company_id

    def test_refresh_rejects_access_token(self):
        """Should return 401 when an access token is used instead of a refresh token."""
        from app.routes.auth import refresh_token
        from app.auth import create_access_token

        token_data = {
            "sub": str(uuid.uuid4()),
            "role": "company_admin",
            "company_id": str(uuid.uuid4()),
            "laundry_ids": ["1"],
            "email": "owner@acme.com",
            "name": "John Doe",
        }
        access = create_access_token(token_data)

        body = {"refreshToken": access}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(refresh_token(body=body))

        assert exc_info.value.status_code == 401
        assert "Invalid refresh token" in exc_info.value.detail

    def test_refresh_missing_token_returns_400(self):
        """Should return 400 when refreshToken is not provided."""
        from app.routes.auth import refresh_token

        body = {}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(refresh_token(body=body))

        assert exc_info.value.status_code == 400
        assert "Refresh token required" in exc_info.value.detail

    def test_refresh_invalid_token_returns_401(self):
        """Should return 401 when the refresh token is malformed/invalid."""
        from app.routes.auth import refresh_token

        body = {"refreshToken": "invalid.token.value"}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(refresh_token(body=body))

        assert exc_info.value.status_code == 401
