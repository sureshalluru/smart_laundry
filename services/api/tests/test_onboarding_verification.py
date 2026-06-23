"""
Tests for the onboarding verification router.

Includes:
- Property-based tests (hypothesis) for email duplicate detection (Property 2)
- Property-based tests (hypothesis) for address match comparison (Property 4)
- Unit tests for verification endpoints
"""

import time
import io
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as hyp_settings, assume
from hypothesis import strategies as st

from app.routes.onboarding_verification import (
    _compare_addresses,
    _extract_street_parts,
    _parse_claude_address_response,
)
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

# Street number + name strategy for address comparison tests
street_number_strategy = st.integers(min_value=1, max_value=99999).map(str)
street_name_strategy = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz ",
    min_size=2,
    max_size=30,
).filter(lambda s: s.strip() != "" and not s.startswith(" "))

city_strategy = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz ",
    min_size=2,
    max_size=20,
).filter(lambda s: s.strip() != "")

state_strategy = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz",
    min_size=2,
    max_size=2,
)

zip_strategy = st.from_regex(r"[0-9]{5}", fullmatch=True)


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
# PROPERTY TEST: Address match comparison (Property 4)
# Tag: "Feature: onboarding-verification, Property 4: Address match comparison"
# Validates: Requirements 4.3
# ===========================================================================


class TestAddressMatchComparisonProperty:
    """
    Feature: onboarding-verification, Property 4: Address match comparison

    For any pair of addresses (extracted and entered), the match function should
    return true if and only if, after normalization, the street number and name
    match, city matches, state matches, and zip code matches exactly.

    **Validates: Requirements 4.3**
    """

    @given(
        street_number=street_number_strategy,
        street_name=street_name_strategy,
        city=city_strategy,
        state=state_strategy,
        zip_code=zip_strategy,
    )
    @hyp_settings(max_examples=100)
    def test_identical_addresses_match(
        self, street_number, street_name, city, state, zip_code
    ):
        """
        Property: When extracted and entered addresses have identical components
        (number, name, city, state, zip), _compare_addresses returns True.
        """
        street = f"{street_number} {street_name}"
        extracted = {
            "found": True,
            "street": street,
            "city": city,
            "state": state,
            "zip": zip_code,
        }
        entered = normalize_address(street, city, state, zip_code)

        result = _compare_addresses(extracted, entered)
        assert result is True, (
            f"Expected match for identical addresses: "
            f"extracted={extracted}, entered={entered}"
        )

    @given(
        street_number=street_number_strategy,
        street_name=street_name_strategy,
        city=city_strategy,
        state=state_strategy,
        zip_code=zip_strategy,
        different_zip=zip_strategy,
    )
    @hyp_settings(max_examples=100)
    def test_different_zip_does_not_match(
        self, street_number, street_name, city, state, zip_code, different_zip
    ):
        """
        Property: When zip codes differ, _compare_addresses returns False.
        """
        assume(zip_code != different_zip)

        street = f"{street_number} {street_name}"
        extracted = {
            "found": True,
            "street": street,
            "city": city,
            "state": state,
            "zip": zip_code,
        }
        entered = normalize_address(street, city, state, different_zip)

        result = _compare_addresses(extracted, entered)
        assert result is False, (
            f"Expected no match when zips differ: "
            f"extracted zip={zip_code}, entered zip={different_zip}"
        )

    @given(
        street_number=street_number_strategy,
        street_name=street_name_strategy,
        city=city_strategy,
        different_city=city_strategy,
        state=state_strategy,
        zip_code=zip_strategy,
    )
    @hyp_settings(max_examples=100)
    def test_different_city_does_not_match(
        self, street_number, street_name, city, different_city, state, zip_code
    ):
        """
        Property: When cities differ, _compare_addresses returns False.
        """
        assume(city.strip().lower() != different_city.strip().lower())

        street = f"{street_number} {street_name}"
        extracted = {
            "found": True,
            "street": street,
            "city": city,
            "state": state,
            "zip": zip_code,
        }
        entered = normalize_address(street, different_city, state, zip_code)

        result = _compare_addresses(extracted, entered)
        assert result is False, (
            f"Expected no match when cities differ: "
            f"extracted city={city}, entered city={different_city}"
        )

    @given(
        street_number=street_number_strategy,
        street_name=street_name_strategy,
        city=city_strategy,
        state=state_strategy,
        different_state=state_strategy,
        zip_code=zip_strategy,
    )
    @hyp_settings(max_examples=100)
    def test_different_state_does_not_match(
        self, street_number, street_name, city, state, different_state, zip_code
    ):
        """
        Property: When states differ, _compare_addresses returns False.
        """
        assume(state.strip().lower() != different_state.strip().lower())

        street = f"{street_number} {street_name}"
        extracted = {
            "found": True,
            "street": street,
            "city": city,
            "state": state,
            "zip": zip_code,
        }
        entered = normalize_address(street, city, different_state, zip_code)

        result = _compare_addresses(extracted, entered)
        assert result is False, (
            f"Expected no match when states differ: "
            f"extracted state={state}, entered state={different_state}"
        )

    @given(
        street_number=street_number_strategy,
        different_number=street_number_strategy,
        street_name=street_name_strategy,
        city=city_strategy,
        state=state_strategy,
        zip_code=zip_strategy,
    )
    @hyp_settings(max_examples=100)
    def test_different_street_number_does_not_match(
        self, street_number, different_number, street_name, city, state, zip_code
    ):
        """
        Property: When street numbers differ, _compare_addresses returns False.
        """
        assume(street_number != different_number)

        extracted = {
            "found": True,
            "street": f"{street_number} {street_name}",
            "city": city,
            "state": state,
            "zip": zip_code,
        }
        entered = normalize_address(f"{different_number} {street_name}", city, state, zip_code)

        result = _compare_addresses(extracted, entered)
        assert result is False, (
            f"Expected no match when street numbers differ: "
            f"extracted={street_number}, entered={different_number}"
        )


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


class TestUploadProofEndpoint:
    """Unit tests for the upload-proof endpoint."""

    def test_upload_proof_rejects_files_over_10mb(self):
        """upload-proof rejects files larger than 10MB."""
        import asyncio
        from fastapi import HTTPException
        from app.routes.onboarding_verification import upload_proof, MAX_FILE_SIZE

        # Create a mock file that reports allowed content type but is too large
        mock_file = MagicMock()
        mock_file.content_type = "image/jpeg"
        # read() returns content > 10MB
        large_content = b"x" * (MAX_FILE_SIZE + 1)

        async def fake_read():
            return large_content

        mock_file.read = fake_read

        mock_bg_tasks = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                upload_proof(
                    background_tasks=mock_bg_tasks,
                    file=mock_file,
                    street="123 Main St",
                    city="Austin",
                    state="TX",
                    zipCode="78664",
                )
            )

        assert exc_info.value.status_code == 400
        assert "10MB" in exc_info.value.detail

    def test_upload_proof_rejects_non_allowed_file_types(self):
        """upload-proof rejects non-JPEG/PNG/PDF files."""
        import asyncio
        from fastapi import HTTPException
        from app.routes.onboarding_verification import upload_proof

        # Create a mock file with an unsupported content type
        mock_file = MagicMock()
        mock_file.content_type = "text/plain"

        mock_bg_tasks = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                upload_proof(
                    background_tasks=mock_bg_tasks,
                    file=mock_file,
                    street="123 Main St",
                    city="Austin",
                    state="TX",
                    zipCode="78664",
                )
            )

        assert exc_info.value.status_code == 400
        assert "Unsupported file format" in exc_info.value.detail


class TestProofStatusEndpoint:
    """Unit tests for the proof-status endpoint."""

    def test_proof_status_returns_processing(self):
        """proof-status returns processing status."""
        import asyncio
        from app.routes.onboarding_verification import get_proof_status

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.get_proof_status.return_value = {"status": "processing"}

            result = asyncio.get_event_loop().run_until_complete(
                get_proof_status("proof-123")
            )

        assert result["status"] == "processing"

    def test_proof_status_returns_verified(self):
        """proof-status returns verified with addressVerified=True."""
        import asyncio
        from app.routes.onboarding_verification import get_proof_status

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.get_proof_status.return_value = {"status": "verified"}

            result = asyncio.get_event_loop().run_until_complete(
                get_proof_status("proof-456")
            )

        assert result["status"] == "verified"
        assert result["addressVerified"] is True

    def test_proof_status_returns_review_required(self):
        """proof-status returns review_required with addressVerified=False."""
        import asyncio
        from app.routes.onboarding_verification import get_proof_status

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.get_proof_status.return_value = {"status": "review_required"}

            result = asyncio.get_event_loop().run_until_complete(
                get_proof_status("proof-789")
            )

        assert result["status"] == "review_required"
        assert result["addressVerified"] is False
        assert "message" in result

    def test_proof_status_returns_404_for_unknown_proof(self):
        """proof-status returns 404 for unknown proof ID."""
        import asyncio
        from fastapi import HTTPException
        from app.routes.onboarding_verification import get_proof_status

        with patch("app.routes.onboarding_verification.verification_store") as mock_store:
            mock_store.get_proof_status.return_value = None

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    get_proof_status("nonexistent-proof")
                )

            assert exc_info.value.status_code == 404
