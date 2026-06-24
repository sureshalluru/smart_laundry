"""
Tests for the onboarding verification router.

Includes:
- Property-based tests (hypothesis) for email duplicate detection (Property 2)
- Unit tests for verification endpoints
"""

import time
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as hyp_settings, assume
from hypothesis import strategies as st

from app.services.verification_store import verification_store, normalize_address


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Email strategy: simple patterns that are valid for our tests
email_local_part = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789._",
    min_size=1,
    max_size=20,
)
email_domain = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789",
    min_size=1,
    max_size=10,
)
email_strategy = st.builds(
    lambda local, domain: f"{local}@{domain}.com",
    email_local_part,
    email_domain,
)


# ---------------------------------------------------------------------------
# Helper: mock database context manager
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor that can be configured with rows to return."""

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
    """Mock connection that yields a mock cursor."""

    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db(cursor):
    """Context manager that yields a mock connection with the given cursor."""
    conn = MockConnection(cursor)
    yield conn


# ===========================================================================
# PROPERTY TEST: Email duplicate detection correctness (Property 2)
# Tag: "Feature: onboarding-verification, Property 2: Email duplicate detection correctness"
# Validates: Requirements 2.1, 2.2
# ===========================================================================


class TestEmailDuplicateDetectionProperty:
    """
    Feature: onboarding-verification, Property 2: Email duplicate detection correctness

    For any email address, the duplicate check should return "duplicate found" if and
    only if that email (case-insensitive) exists in shop.employees with an Admin role
    OR as the contact_email of a laundry shop.

    **Validates: Requirements 2.1, 2.2**
    """

    @given(
        email=email_strategy,
        employee_exists=st.booleans(),
        shop_exists=st.booleans(),
    )
    @hyp_settings(max_examples=100)
    def test_duplicate_returned_iff_email_exists(
        self, email, employee_exists, shop_exists
    ):
        """
        Property: verify-email returns EMAIL_DUPLICATE iff email exists in employees
        (Admin role) OR laundry_shops (contact_email).
        """
        import asyncio
        from app.routes.onboarding_verification import verify_email

        # Set up mock cursor to return appropriate results
        rows = []
        # First query: employees table
        if employee_exists:
            rows.append({"employee_id": "emp-123"})
        else:
            rows.append(None)
        # Second query: laundry_shops table
        if shop_exists:
            rows.append({"laundry_id": "shop-456"})
        else:
            rows.append(None)

        cursor = MockCursor(rows=rows)

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor, \
             patch("app.routes.onboarding_verification.send_email", return_value=True), \
             patch("app.routes.onboarding_verification.verification_store") as mock_store:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"email": email}
            result = asyncio.get_event_loop().run_until_complete(verify_email(body))

            should_be_duplicate = employee_exists or shop_exists

            if should_be_duplicate:
                assert result["status"] == "error"
                assert result["code"] == "EMAIL_DUPLICATE"
            else:
                assert result["status"] == "success"
                assert result["message"] == "Verification code sent"


# ===========================================================================
# UNIT TESTS: Verification endpoints (Task 2.4)
# Validates: Requirements 1.1, 1.3, 2.1, 2.2, 3.1, 3.3, 4.1
# ===========================================================================


class TestVerifyEmailEndpoint:
    """Unit tests for the verify-email endpoint."""

    def test_verify_email_returns_duplicate_when_email_in_employees(self):
        """verify-email returns EMAIL_DUPLICATE when email exists in employees."""
        import asyncio
        from app.routes.onboarding_verification import verify_email

        cursor = MockCursor(rows=[{"employee_id": "emp-123"}, None])

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                verify_email({"email": "existing@example.com"})
            )

        assert result["status"] == "error"
        assert result["code"] == "EMAIL_DUPLICATE"
        assert "already exists" in result["message"]

    def test_verify_email_returns_duplicate_when_email_in_laundry_shops(self):
        """verify-email returns EMAIL_DUPLICATE when email exists in laundry_shops."""
        import asyncio
        from app.routes.onboarding_verification import verify_email

        # First query (employees) returns nothing, second (shops) returns a match
        cursor = MockCursor(rows=[None, {"laundry_id": "shop-456"}])

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                verify_email({"email": "shopowner@example.com"})
            )

        assert result["status"] == "error"
        assert result["code"] == "EMAIL_DUPLICATE"

    def test_verify_email_sends_code_when_email_is_new(self):
        """verify-email sends verification code when email is not a duplicate."""
        import asyncio
        from app.routes.onboarding_verification import verify_email

        cursor = MockCursor(rows=[None, None])

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor, \
             patch("app.routes.onboarding_verification.send_email", return_value=True) as mock_send, \
             patch("app.routes.onboarding_verification.verification_store") as mock_store:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                verify_email({"email": "newuser@example.com"})
            )

        assert result["status"] == "success"
        assert result["message"] == "Verification code sent"
        mock_store.store_code.assert_called_once()
        mock_send.assert_called_once()


class TestConfirmCodeEndpoint:
    """Unit tests for the confirm-code endpoint."""

    def test_confirm_code_returns_token_on_correct_code(self):
        """confirm-code returns token on correct code."""
        import asyncio
        from app.routes.onboarding_verification import confirm_code

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.verify_code.return_value = (True, "", 0)
            mock_store.create_token.return_value = "test-token-uuid"

            result = asyncio.get_event_loop().run_until_complete(
                confirm_code({"email": "user@example.com", "code": "123456"})
            )

        assert result["status"] == "success"
        assert result["token"] == "test-token-uuid"

    def test_confirm_code_returns_error_with_remaining_attempts(self):
        """confirm-code returns error with remaining attempts on wrong code."""
        import asyncio
        from app.routes.onboarding_verification import confirm_code

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.verify_code.return_value = (False, "INVALID_CODE", 2)

            result = asyncio.get_event_loop().run_until_complete(
                confirm_code({"email": "user@example.com", "code": "999999"})
            )

        assert result["status"] == "error"
        assert result["code"] == "INVALID_CODE"
        assert result["attemptsRemaining"] == 2
        assert "2 attempt" in result["message"]


class TestCheckAddressEndpoint:
    """Unit tests for the check-address endpoint."""

    def test_check_address_returns_duplicate_when_address_matches(self):
        """check-address returns ADDRESS_DUPLICATE when address exists."""
        import asyncio
        from app.routes.onboarding_verification import check_address

        cursor = MockCursor(rows=[{"laundry_id": "shop-789"}])

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                check_address({
                    "street": "123 Main St",
                    "city": "Austin",
                    "state": "TX",
                    "zipCode": "78664"
                })
            )

        assert result["status"] == "error"
        assert result["code"] == "ADDRESS_DUPLICATE"

    def test_check_address_returns_no_duplicate_for_new_address(self):
        """check-address returns success when address is new."""
        import asyncio
        from app.routes.onboarding_verification import check_address

        cursor = MockCursor(rows=[None])

        with patch("app.routes.onboarding_verification.get_db") as mock_db, \
             patch("app.routes.onboarding_verification.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                check_address({
                    "street": "456 New Ave",
                    "city": "Dallas",
                    "state": "TX",
                    "zipCode": "75201"
                })
            )

        assert result["status"] == "success"
        assert result["duplicate"] is False
