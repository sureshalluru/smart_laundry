"""
Unit tests for POST /api/tracking/deactivate endpoint.

Tests the deactivate endpoint which marks a driver's tracking session as inactive
when an order is delivered.

**Validates: Requirements 2.6, 5.3**
"""

import asyncio
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor for database operations."""

    def __init__(self):
        self.executed_queries = []
        self.executed_params = []

    def execute(self, query, params=None):
        self.executed_queries.append(query)
        self.executed_params.append(params)

    def fetchone(self):
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


def build_current_user(driver_id="driver-001", laundry_id="laundry-001"):
    """Build a mock JWT current_user dict."""
    return {
        "empId": driver_id,
        "laundryId": laundry_id,
    }


# ===========================================================================
# Unit Tests for POST /deactivate
# ===========================================================================


class TestDeactivateEndpoint:
    """
    Tests for POST /api/tracking/deactivate.

    This endpoint marks a driver's tracking session as inactive when an order
    is delivered. It authenticates via JWT and sets is_active=false.

    **Validates: Requirements 2.6, 5.3**
    """

    def test_deactivate_success(self):
        """
        WHEN a driver calls POST /deactivate with a valid orderId and JWT,
        THEN it should set is_active=false and return success.
        """
        from app.routes.tracking import deactivate_tracking

        body = {"orderId": "O-12345"}
        current_user = build_current_user(driver_id="driver-001")
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                deactivate_tracking(body=body, current_user=current_user)
            )

        assert result == {"status": "success"}

        # Verify the UPDATE query was executed with correct params
        assert len(cursor.executed_queries) == 1
        assert "is_active = FALSE" in cursor.executed_queries[0]
        assert cursor.executed_params[0] == ("driver-001",)

    def test_deactivate_missing_order_id(self):
        """
        WHEN orderId is missing from the request body,
        THEN it should return 400 Bad Request.
        """
        from fastapi import HTTPException
        from app.routes.tracking import deactivate_tracking

        body = {}
        current_user = build_current_user(driver_id="driver-001")
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    deactivate_tracking(body=body, current_user=current_user)
                )

            assert exc_info.value.status_code == 400
            assert "orderId" in exc_info.value.detail

    def test_deactivate_missing_emp_id_in_token(self):
        """
        WHEN JWT token is missing empId,
        THEN it should return 401 Unauthorized.
        """
        from fastapi import HTTPException
        from app.routes.tracking import deactivate_tracking

        body = {"orderId": "O-12345"}
        current_user = {"laundryId": "laundry-001"}  # No empId or sub
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    deactivate_tracking(body=body, current_user=current_user)
                )

            assert exc_info.value.status_code == 401

    def test_deactivate_uses_sub_claim_as_fallback(self):
        """
        WHEN JWT token has 'sub' instead of 'empId',
        THEN it should use 'sub' as the driver_id.
        """
        from app.routes.tracking import deactivate_tracking

        body = {"orderId": "O-12345"}
        current_user = {"sub": "driver-from-sub", "laundryId": "laundry-001"}
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                deactivate_tracking(body=body, current_user=current_user)
            )

        assert result == {"status": "success"}
        assert cursor.executed_params[0] == ("driver-from-sub",)
