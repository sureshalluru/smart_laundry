"""
Property-based test for mobile order processing bug condition exploration.

Feature: mobile-order-processing, Property 1: Bug Condition -
Mobile Order Processing Inline Workflow and Auto-Status Transitions

This test MUST FAIL on unfixed code — failure confirms the bug exists.
The test encodes the expected behavior: employee-update-services should
automatically transition order status to "ReceivedAtFacility" when weight
is entered for orders in pre-facility statuses.

GOAL: Surface counterexamples that demonstrate the bug exists — the unfixed code
updates totals but never transitions order status from pre-facility statuses.

**Validates: Requirements 1.2, 2.2**
"""

import asyncio
from unittest.mock import patch, MagicMock, call
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as hyp_settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Pre-facility statuses that should trigger auto-transition to ReceivedAtFacility
pre_facility_statuses = st.sampled_from([
    "OrderSubmitted",
    "ReadyForIntake",
])

# Valid weight values (positive numbers representing lbs/count)
valid_weights = st.floats(min_value=0.1, max_value=100.0, allow_nan=False, allow_infinity=False)

# Valid service names
service_names = st.sampled_from([
    "Wash & Fold",
    "Dry Clean",
    "Press Only",
    "Wash & Iron",
])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor that tracks executed queries and returns configured results."""

    def __init__(self, order_status="OrderSubmitted"):
        self.executed_queries = []
        self.executed_params = []
        self._order_status = order_status
        self._call_count = 0

    def execute(self, query, params=None):
        self.executed_queries.append(query)
        self.executed_params.append(params)
        self._call_count += 1

    def fetchone(self):
        """Return mock data based on which query was most recently executed."""
        last_query = self.executed_queries[-1] if self.executed_queries else ""

        # First query: SELECT order + tips
        if "FROM orders.orders o" in last_query and "LEFT JOIN orders.order_tips" in last_query:
            return {
                "order_id": "IS-TEST001",
                "coupon": None,
                "discounted_price": 0,
                "tip_amount": 0,
                "tip_percentage": 0,
                "tip_type": "noTip",
                "tip_method": None,
                "tip_receiver_id": None,
            }

        # Employee name lookup
        if "FROM shop.employees" in last_query:
            return {"first_name": "Test", "last_name": "Employee"}

        # Order status lookup (for checking current status before transition)
        if "order_status" in last_query and "FROM orders.orders" in last_query:
            return {"order_status": self._order_status}

        return None

    def fetchall(self):
        """Return mock data for fetchall queries."""
        last_query = self.executed_queries[-1] if self.executed_queries else ""

        # Service catalog lookup
        if "FROM shop.laundry_services" in last_query:
            return [
                {"service_name": "Wash & Fold", "price": 2.50, "input_weight": True},
                {"service_name": "Dry Clean", "price": 5.00, "input_weight": False},
                {"service_name": "Press Only", "price": 3.00, "input_weight": False},
                {"service_name": "Wash & Iron", "price": 3.50, "input_weight": True},
            ]

        # Order services for total recalculation
        if "FROM orders.order_services" in last_query:
            return [
                {"service_price": 2.50, "weight_or_count": 10.0},
            ]

        # Order products for total recalculation
        if "FROM orders.order_products" in last_query:
            return []

        return []


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


# ===========================================================================
# PROPERTY TEST: Bug Condition — Auto-Status Transition on Weight Entry
# Tag: "Feature: mobile-order-processing, Property 1: Bug Condition"
# Validates: Requirements 1.2, 2.2
# ===========================================================================


class TestMobileOrderBugCondition:
    """
    Feature: mobile-order-processing, Property 1: Bug Condition -
    Mobile Order Processing Inline Workflow and Auto-Status Transitions

    For any weight save action from MobileWeightEntry where the order's
    current status is "OrderSubmitted" or "ReadyForIntake", the
    employee-update-services endpoint SHALL automatically transition
    the order status to "ReceivedAtFacility" and record the transition
    in order history.

    EXPECTED: These tests FAIL on unfixed code because the endpoint
    only updates totals without any status transition logic.

    **Validates: Requirements 1.2, 2.2**
    """

    @given(
        order_status=st.just("OrderSubmitted"),
        weight=valid_weights,
        service_name=service_names,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_order_submitted_transitions_to_received_at_facility(
        self, order_status, weight, service_name
    ):
        """
        Property: Case 1 — employee-update-services called with order in status
        "OrderSubmitted" → assert order status changes to "ReceivedAtFacility".

        Currently fails: no status transition logic in the endpoint.

        **Validates: Requirements 1.2, 2.2**
        """
        from app.routes.admin_extra import employee_update_services

        cursor = MockCursor(order_status=order_status)

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-TEST001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        # Endpoint should return 200 (this part works)
        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # BUG CONDITION ASSERTION: The order status MUST be updated to ReceivedAtFacility
        # On unfixed code, this assertion will FAIL because the endpoint never
        # executes an UPDATE to change order_status.
        all_queries = " ".join(cursor.executed_queries)
        status_transition_executed = any(
            "ReceivedAtFacility" in q and "order_status" in q
            for q in cursor.executed_queries
        )

        assert status_transition_executed, (
            f"BUG CONFIRMED: employee-update-services returned 200 with updated totals "
            f"but order_status remains '{order_status}' — no status transition logic exists. "
            f"Expected: UPDATE orders.orders SET order_status = 'ReceivedAtFacility' "
            f"for pre-facility order. Weight={weight}, Service={service_name}"
        )

    @given(
        order_status=st.just("ReadyForIntake"),
        weight=valid_weights,
        service_name=service_names,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_ready_for_intake_transitions_to_received_at_facility(
        self, order_status, weight, service_name
    ):
        """
        Property: Case 2 — employee-update-services called with order in status
        "ReadyForIntake" → assert order status changes to "ReceivedAtFacility".

        Currently fails: same reason — no status transition logic in the endpoint.

        **Validates: Requirements 1.2, 2.2**
        """
        from app.routes.admin_extra import employee_update_services

        cursor = MockCursor(order_status=order_status)

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-TEST001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        # Endpoint should return 200 (this part works)
        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # BUG CONDITION ASSERTION: The order status MUST be updated to ReceivedAtFacility
        # On unfixed code, this assertion will FAIL because the endpoint never
        # executes an UPDATE to change order_status.
        status_transition_executed = any(
            "ReceivedAtFacility" in q and "order_status" in q
            for q in cursor.executed_queries
        )

        assert status_transition_executed, (
            f"BUG CONFIRMED: employee-update-services returned 200 with updated totals "
            f"but order_status remains '{order_status}' — no status transition logic exists. "
            f"Expected: UPDATE orders.orders SET order_status = 'ReceivedAtFacility' "
            f"for pre-facility order. Weight={weight}, Service={service_name}"
        )

    @given(
        order_status=pre_facility_statuses,
        weight=valid_weights,
        service_name=service_names,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_order_history_records_status_transition(
        self, order_status, weight, service_name
    ):
        """
        Property: For any pre-facility order status, after weight entry via
        employee-update-services, an order_history record SHALL be created
        documenting the auto-status transition.

        Currently fails: no order_history record for status transition is created
        (only the "update_services" action is recorded).

        **Validates: Requirements 1.2, 2.2**
        """
        from app.routes.admin_extra import employee_update_services

        cursor = MockCursor(order_status=order_status)

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-TEST001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        # Endpoint should return 200
        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # BUG CONDITION ASSERTION: An order_history record for the auto-status
        # transition MUST exist (separate from the "update_services" audit record)
        status_history_recorded = any(
            "order_history" in q and "auto_status_transition" in q
            for q in cursor.executed_queries
        )

        assert status_history_recorded, (
            f"BUG CONFIRMED: employee-update-services returned 200 but no order_history "
            f"record was created for the auto-status transition from '{order_status}' to "
            f"'ReceivedAtFacility'. Only the 'update_services' action is recorded. "
            f"Weight={weight}, Service={service_name}"
        )
