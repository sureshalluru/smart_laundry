"""
Tests for POST /api/platform/onboard/lookup-join-code endpoint.

Validates: Requirements 9.1, 9.3, 9.4
"""

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor that returns pre-configured rows."""

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
# Tests: POST /api/platform/onboard/lookup-join-code
# ---------------------------------------------------------------------------


class TestLookupJoinCode:
    """Tests for lookup_join_code endpoint."""

    def test_lookup_valid_join_code(self):
        """Should return masked company info for a valid join code."""
        from app.routes.company_join import lookup_join_code

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[
            {
                "company_id": company_id,
                "company_name": "Acme Laundry",
                "contact_email": "john@company.com",
            }
        ])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = lookup_join_code(body={"joinCode": "ACME-7X4K"})

        assert result["status"] == "success"
        assert result["companyId"] == company_id
        assert result["maskedName"] == "A**********y"
        assert result["maskedEmail"] == "j**n@company.com"

    def test_lookup_invalid_join_code(self):
        """Should return generic error for non-existent join code (no info leakage)."""
        from app.routes.company_join import lookup_join_code

        cursor = MockCursor(rows=[])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = lookup_join_code(body={"joinCode": "XXXX-0000"})

        assert result["status"] == "error"
        assert result["message"] == "Invalid join code"
        # Ensure no company info is leaked
        assert "companyId" not in result
        assert "maskedName" not in result
        assert "maskedEmail" not in result

    def test_lookup_empty_join_code(self):
        """Should return error for empty join code without hitting database."""
        from app.routes.company_join import lookup_join_code

        result = lookup_join_code(body={"joinCode": ""})

        assert result["status"] == "error"
        assert result["message"] == "Invalid join code"

    def test_lookup_whitespace_only_join_code(self):
        """Should return error for whitespace-only join code."""
        from app.routes.company_join import lookup_join_code

        result = lookup_join_code(body={"joinCode": "   "})

        assert result["status"] == "error"
        assert result["message"] == "Invalid join code"

    def test_lookup_missing_join_code_field(self):
        """Should return error if joinCode field is missing from body."""
        from app.routes.company_join import lookup_join_code

        result = lookup_join_code(body={})

        assert result["status"] == "error"
        assert result["message"] == "Invalid join code"

    def test_lookup_company_with_no_email(self):
        """Should return company info with maskedEmail as None when contact_email is None."""
        from app.routes.company_join import lookup_join_code

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[
            {
                "company_id": company_id,
                "company_name": "Beta Corp",
                "contact_email": None,
            }
        ])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = lookup_join_code(body={"joinCode": "BETA-1234"})

        assert result["status"] == "success"
        assert result["companyId"] == company_id
        assert result["maskedName"] == "B*******p"
        assert result["maskedEmail"] is None

    def test_lookup_no_information_leakage_same_error(self):
        """Error response for invalid code should be identical regardless of reason (format vs no match)."""
        from app.routes.company_join import lookup_join_code

        # Missing field
        result1 = lookup_join_code(body={})
        # Empty string
        result2 = lookup_join_code(body={"joinCode": ""})

        # Both should produce the exact same response structure
        assert result1 == result2
        assert result1 == {"status": "error", "message": "Invalid join code"}


# ---------------------------------------------------------------------------
# Tests: POST /api/platform/onboard/company-verify
# ---------------------------------------------------------------------------


class TestCompanyVerify:
    """Tests for company_verify endpoint."""

    def test_verify_sends_code_when_email_exists(self):
        """Should generate code, store it, send email, and return success."""
        from app.routes.company_join import company_verify

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[{"contact_email": "admin@acme.com"}])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor, \
             patch("app.routes.company_join.send_email", return_value=True) as mock_send, \
             patch("app.routes.company_join.verification_store") as mock_store:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = company_verify(body={"companyId": company_id})

        assert result["status"] == "success"
        assert result["message"] == "Verification code sent"
        mock_store.store_code.assert_called_once()
        call_args = mock_store.store_code.call_args[0]
        assert call_args[0] == f"company_join:{company_id}"
        assert len(call_args[1]) == 6
        assert call_args[1].isdigit()
        mock_send.assert_called_once()
        assert mock_send.call_args[0][0] == "admin@acme.com"

    def test_verify_returns_error_when_no_contact_email(self):
        """Should return NO_CONTACT_EMAIL error when company has no email."""
        from app.routes.company_join import company_verify

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[{"contact_email": None}])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = company_verify(body={"companyId": company_id})

        assert result["status"] == "error"
        assert result["code"] == "NO_CONTACT_EMAIL"
        assert result["message"] == "Company cannot be joined via self-service"

    def test_verify_returns_error_when_company_not_found(self):
        """Should return error when company ID doesn't exist."""
        from app.routes.company_join import company_verify

        cursor = MockCursor(rows=[])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = company_verify(body={"companyId": str(uuid.uuid4())})

        assert result["status"] == "error"
        assert result["message"] == "Company not found"

    def test_verify_returns_error_when_company_id_empty(self):
        """Should return error for empty companyId."""
        from app.routes.company_join import company_verify

        result = company_verify(body={"companyId": ""})

        assert result["status"] == "error"
        assert result["message"] == "Company ID is required"

    def test_verify_returns_error_when_company_id_missing(self):
        """Should return error when companyId field is missing."""
        from app.routes.company_join import company_verify

        result = company_verify(body={})

        assert result["status"] == "error"
        assert result["message"] == "Company ID is required"

    def test_verify_still_returns_success_when_email_fails_to_send(self):
        """Should return success even if the email sending fails (fire-and-forget pattern)."""
        from app.routes.company_join import company_verify

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[{"contact_email": "admin@acme.com"}])

        with patch("app.routes.company_join.get_db") as mock_db, \
             patch("app.routes.company_join.get_cursor") as mock_get_cursor, \
             patch("app.routes.company_join.send_email", return_value=False) as mock_send, \
             patch("app.routes.company_join.verification_store") as mock_store:
            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = company_verify(body={"companyId": company_id})

        assert result["status"] == "success"
        assert result["message"] == "Verification code sent"


# ---------------------------------------------------------------------------
# Tests: POST /api/platform/onboard/company-confirm
# ---------------------------------------------------------------------------


class TestCompanyConfirm:
    """Tests for company_confirm endpoint.

    Validates: Requirements 9.7, 9.8, 9.9, 10.3, 10.4
    """

    def test_confirm_success_returns_token(self):
        """Should return a token on successful code verification."""
        from app.routes.company_join import company_confirm

        company_id = str(uuid.uuid4())
        token = str(uuid.uuid4())

        with patch("app.routes.company_join.verification_store") as mock_store:
            mock_store.verify_code.return_value = (True, "", 0)
            mock_store.create_token.return_value = token

            result = company_confirm(body={"companyId": company_id, "code": "123456"})

        assert result["status"] == "success"
        assert result["token"] == token
        mock_store.verify_code.assert_called_once_with(f"company_join:{company_id}", "123456")
        mock_store.create_token.assert_called_once_with(f"company_join:{company_id}")

    def test_confirm_invalid_code(self):
        """Should return INVALID_CODE error with attempts remaining on wrong code."""
        from app.routes.company_join import company_confirm

        company_id = str(uuid.uuid4())

        with patch("app.routes.company_join.verification_store") as mock_store:
            mock_store.verify_code.return_value = (False, "INVALID_CODE", 2)

            result = company_confirm(body={"companyId": company_id, "code": "000000"})

        assert result["status"] == "error"
        assert result["code"] == "INVALID_CODE"
        assert result["message"] == "Invalid verification code"
        assert result["attemptsRemaining"] == 2

    def test_confirm_expired_code(self):
        """Should return CODE_EXPIRED error when code has expired."""
        from app.routes.company_join import company_confirm

        company_id = str(uuid.uuid4())

        with patch("app.routes.company_join.verification_store") as mock_store:
            mock_store.verify_code.return_value = (False, "CODE_EXPIRED", 0)

            result = company_confirm(body={"companyId": company_id, "code": "123456"})

        assert result["status"] == "error"
        assert result["code"] == "CODE_EXPIRED"
        assert result["message"] == "Code expired, please request a new one"

    def test_confirm_max_attempts(self):
        """Should return MAX_ATTEMPTS error when too many failed attempts."""
        from app.routes.company_join import company_confirm

        company_id = str(uuid.uuid4())

        with patch("app.routes.company_join.verification_store") as mock_store:
            mock_store.verify_code.return_value = (False, "MAX_ATTEMPTS", 0)

            result = company_confirm(body={"companyId": company_id, "code": "123456"})

        assert result["status"] == "error"
        assert result["code"] == "MAX_ATTEMPTS"
        assert result["message"] == "Too many attempts, please request a new code"

    def test_confirm_empty_company_id(self):
        """Should return error for empty companyId."""
        from app.routes.company_join import company_confirm

        result = company_confirm(body={"companyId": "", "code": "123456"})

        assert result["status"] == "error"
        assert result["message"] == "Company ID and code are required"

    def test_confirm_empty_code(self):
        """Should return error for empty code."""
        from app.routes.company_join import company_confirm

        company_id = str(uuid.uuid4())
        result = company_confirm(body={"companyId": company_id, "code": ""})

        assert result["status"] == "error"
        assert result["message"] == "Company ID and code are required"

    def test_confirm_missing_fields(self):
        """Should return error when both fields are missing."""
        from app.routes.company_join import company_confirm

        result = company_confirm(body={})

        assert result["status"] == "error"
        assert result["message"] == "Company ID and code are required"
