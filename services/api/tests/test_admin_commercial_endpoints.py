"""
Unit tests for admin commercial account management endpoints.

Tests the following endpoints:
- GET /admin/customer-commercial
- PATCH /admin/customer-commercial
- PATCH /admin/frequency-commercial

**Validates: Requirements 1.1, 1.2, 1.4, 1.5, 3.1, 4.1, 4.5**
"""

import sys
import asyncio
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest

# ---------------------------------------------------------------------------
# Module-level patching: admin_extra.py imports `serialize` and `serialize_row`
# from `app.utils` which may not resolve correctly when the `app/utils/`
# package __init__.py doesn't re-export them. We ensure the symbols are
# available by patching them into the utils module before importing the route.
# ---------------------------------------------------------------------------
import app.utils as _utils_pkg
if not hasattr(_utils_pkg, "serialize"):
    _utils_pkg.serialize = lambda obj: obj
if not hasattr(_utils_pkg, "serialize_row"):
    _utils_pkg.serialize_row = lambda row: row


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor for database operations."""

    def __init__(self, fetchone_results=None):
        self.executed_queries = []
        self.executed_params = []
        self._fetchone_results = fetchone_results or []
        self._fetchone_index = 0

    def execute(self, query, params=None):
        self.executed_queries.append(query)
        self.executed_params.append(params)

    def fetchone(self):
        if self._fetchone_index < len(self._fetchone_results):
            result = self._fetchone_results[self._fetchone_index]
            self._fetchone_index += 1
            return result
        return None


class MockConnection:
    """Mock connection that yields a mock cursor."""

    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db(cursor):
    """Context manager that yields a mock connection."""
    conn = MockConnection(cursor)
    yield conn


def build_current_user():
    """Build a mock JWT current_user dict."""
    return {"empId": "admin-001", "laundryId": "laundry-001"}


def run_async(coro):
    """Helper to run an async function synchronously."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ===========================================================================
# Unit Tests for GET /admin/customer-commercial
# ===========================================================================


class TestGetCustomerCommercial:
    """
    Tests for GET /admin/customer-commercial.

    **Validates: Requirements 1.1, 1.4, 4.6**
    """

    def test_get_commercial_fields_success(self):
        """
        WHEN a valid customerId and laundryId are provided and the customer exists,
        THEN return 200 with billingEmail and isCommercial fields.
        """
        from app.routes.admin_extra import get_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"billing_email": "billing@corp.com", "is_commercial": True}
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                get_customer_commercial(
                    customerId="cust-001",
                    laundryId="laundry-001",
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        assert result["body"]["billingEmail"] == "billing@corp.com"
        assert result["body"]["isCommercial"] is True

    def test_get_commercial_fields_customer_not_found(self):
        """
        WHEN the customer does not exist,
        THEN return 404 with "Customer not found" message.
        """
        from app.routes.admin_extra import get_customer_commercial

        cursor = MockCursor(fetchone_results=[])  # No rows

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                get_customer_commercial(
                    customerId="nonexistent-id",
                    laundryId="laundry-001",
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 404
        assert "Customer not found" in result["body"]["message"]


# ===========================================================================
# Unit Tests for PATCH /admin/customer-commercial
# ===========================================================================


class TestUpdateCustomerCommercial:
    """
    Tests for PATCH /admin/customer-commercial.

    **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 4.1, 4.5**
    """

    def test_set_billing_email_success(self):
        """
        WHEN a valid billing email is provided,
        THEN update billing_email and return 200.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"customer_id": "cust-001"}  # Customer exists
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "billingEmail": "billing@company.com"
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        assert "updated successfully" in result["body"]["message"]
        # Verify the UPDATE query used the correct email value
        update_query = cursor.executed_queries[-1]
        assert "billing_email" in update_query
        assert cursor.executed_params[-1] == ("billing@company.com", "cust-001")

    def test_clear_billing_email_with_null(self):
        """
        WHEN billingEmail is explicitly passed as null,
        THEN clear the billing_email field (set to NULL).
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"customer_id": "cust-001"}
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "billingEmail": None
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        # Verify the UPDATE query sets billing_email = NULL
        update_query = cursor.executed_queries[-1]
        assert "billing_email = NULL" in update_query

    def test_clear_billing_email_with_empty_string(self):
        """
        WHEN billingEmail is explicitly passed as empty string,
        THEN clear the billing_email field (set to NULL).
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"customer_id": "cust-001"}
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "billingEmail": "   "
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        update_query = cursor.executed_queries[-1]
        assert "billing_email = NULL" in update_query

    def test_toggle_is_commercial_on(self):
        """
        WHEN isCommercial is set to true,
        THEN update the customer's is_commercial flag and return 200.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"customer_id": "cust-001"}
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "isCommercial": True
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        update_query = cursor.executed_queries[-1]
        assert "is_commercial" in update_query
        assert cursor.executed_params[-1] == (True, "cust-001")

    def test_toggle_is_commercial_off(self):
        """
        WHEN isCommercial is set to false,
        THEN update the customer's is_commercial flag to false and return 200.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            {"customer_id": "cust-001"}
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "isCommercial": False
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        update_query = cursor.executed_queries[-1]
        assert "is_commercial" in update_query
        assert cursor.executed_params[-1] == (False, "cust-001")

    def test_reject_invalid_email_format(self):
        """
        WHEN an invalid email format is provided for billingEmail,
        THEN return 400 with validation error message.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001",
                        "billingEmail": "not-a-valid-email"
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 400
        assert "Invalid billing email" in result["body"]["message"]

    def test_customer_not_found_returns_404(self):
        """
        WHEN the customer does not exist in the database,
        THEN return 404.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[
            None  # Customer not found
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "nonexistent-id",
                        "laundryId": "laundry-001",
                        "isCommercial": True
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 404
        assert "Customer not found" in result["body"]["message"]

    def test_no_fields_provided_returns_400(self):
        """
        WHEN neither billingEmail nor isCommercial is provided in the body,
        THEN return 400 with "No fields to update" message.
        """
        from app.routes.admin_extra import update_customer_commercial

        cursor = MockCursor(fetchone_results=[])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_customer_commercial(
                    body={
                        "customerId": "cust-001",
                        "laundryId": "laundry-001"
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 400
        assert "No fields to update" in result["body"]["message"]


# ===========================================================================
# Unit Tests for PATCH /admin/frequency-commercial
# ===========================================================================


class TestUpdateFrequencyCommercial:
    """
    Tests for PATCH /admin/frequency-commercial.

    **Validates: Requirements 3.1, 3.2, 3.3**
    """

    def test_convert_frequency_to_commercial_success(self):
        """
        WHEN a valid frequencyId, laundryId, and isCommercial=true are provided,
        THEN update the frequency record and return 200.
        """
        from app.routes.admin_extra import update_frequency_commercial

        cursor = MockCursor(fetchone_results=[
            {"frequency_id": "freq-001"}  # Frequency exists
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_frequency_commercial(
                    body={
                        "frequencyId": "freq-001",
                        "laundryId": "laundry-001",
                        "isCommercial": True
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 200
        assert "updated successfully" in result["body"]["message"]
        # Verify the UPDATE query was called with correct params
        update_query = cursor.executed_queries[-1]
        assert "is_commercial" in update_query
        assert cursor.executed_params[-1] == (True, "freq-001", "laundry-001")

    def test_frequency_not_found_returns_404(self):
        """
        WHEN the frequency record does not exist,
        THEN return 404 with "Frequency record not found" message.
        """
        from app.routes.admin_extra import update_frequency_commercial

        cursor = MockCursor(fetchone_results=[
            None  # Frequency not found
        ])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_frequency_commercial(
                    body={
                        "frequencyId": "nonexistent-freq",
                        "laundryId": "laundry-001",
                        "isCommercial": True
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 404
        assert "Frequency record not found" in result["body"]["message"]

    def test_missing_is_commercial_returns_400(self):
        """
        WHEN isCommercial is not provided in the body,
        THEN return 400 with "Missing isCommercial" message.
        """
        from app.routes.admin_extra import update_frequency_commercial

        cursor = MockCursor(fetchone_results=[])

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = run_async(
                update_frequency_commercial(
                    body={
                        "frequencyId": "freq-001",
                        "laundryId": "laundry-001"
                    },
                    current_user=build_current_user()
                )
            )

        assert result["statusCode"] == 400
        assert "Missing isCommercial" in result["body"]["message"]
