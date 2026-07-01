"""
Property-based test for mobile order processing preservation checking.

Feature: mobile-order-processing, Property 2: Preservation -
Desktop POS and Non-Mobile Behavior Unchanged

This test validates that the employee-update-services endpoint preserves:
1. Orders NOT in pre-facility statuses ("OrderSubmitted", "ReadyForIntake")
   do NOT have their order_status changed when services are updated
2. Total recalculation (sub_total) = sum(price * weight) for each service
3. Coupon discount logic produces correct total_cost = sub_total - discount

OBSERVATION (UNFIXED code):
- employee-update-services with order in status "Processing" → status remains "Processing"
- employee-update-services with order in status "ProcessingCompleted" → status remains "ProcessingCompleted"
- employee-update-services with order in status "ReceivedAtFacility" → status remains "ReceivedAtFacility"
- Total recalculation works correctly for various service weights
- Tip recalculation for percentage tips is correct after weight update

EXPECTED OUTCOME ON UNFIXED CODE: Tests PASS (confirms baseline behavior to preserve)

**Validates: Requirements 3.1, 3.4, 3.5, 3.6**
"""

import asyncio
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as hyp_settings, assume
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Post-facility statuses that should NOT trigger any status transition
non_transitioning_statuses = st.sampled_from([
    "Processing",
    "ProcessingCompleted",
    "ReceivedAtFacility",
    "ReadyForDelivery",
    "EnRouteToDelivery",
    "Delivered",
])

# Valid weight values (positive numbers representing lbs/count)
valid_weights = st.floats(min_value=0.1, max_value=100.0, allow_nan=False, allow_infinity=False)

# Valid service prices
valid_prices = st.floats(min_value=0.50, max_value=50.0, allow_nan=False, allow_infinity=False)

# Valid service names
service_names = st.sampled_from([
    "Wash & Fold",
    "Dry Clean",
    "Press Only",
    "Wash & Iron",
])

# Number of services in an order (1-4)
num_services = st.integers(min_value=1, max_value=4)

# Discount types
discount_types = st.sampled_from(["percentage", "fixed"])

# Discount values: percentage (1-50) or fixed (1-20)
discount_percentages = st.floats(min_value=1.0, max_value=50.0, allow_nan=False, allow_infinity=False)
discount_fixed = st.floats(min_value=1.0, max_value=20.0, allow_nan=False, allow_infinity=False)

# Tip percentages (common values)
tip_percentages = st.sampled_from([10, 15, 18, 20, 25])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockCursorPreservation:
    """Mock cursor for preservation tests that tracks queries and returns configured results."""

    def __init__(self, order_status, services, coupon=None, discount_type=None,
                 discount_value=0, min_order_value=0, tip_type="noTip",
                 tip_percentage=0, tip_amount=0):
        self.executed_queries = []
        self.executed_params = []
        self._order_status = order_status
        self._services = services  # list of (price, weight) tuples
        self._coupon = coupon
        self._discount_type = discount_type
        self._discount_value = discount_value
        self._min_order_value = min_order_value
        self._tip_type = tip_type
        self._tip_percentage = tip_percentage
        self._tip_amount = tip_amount

    def execute(self, query, params=None):
        self.executed_queries.append(query)
        self.executed_params.append(params)

    def fetchone(self):
        """Return mock data based on which query was most recently executed."""
        last_query = self.executed_queries[-1] if self.executed_queries else ""

        # Order + tips lookup
        if "FROM orders.orders o" in last_query and "LEFT JOIN orders.order_tips" in last_query:
            return {
                "order_id": "IS-PRESERVE001",
                "coupon": self._coupon,
                "discounted_price": 0,
                "tip_amount": self._tip_amount,
                "tip_percentage": self._tip_percentage,
                "tip_type": self._tip_type,
                "tip_method": "online" if self._tip_type != "noTip" else None,
                "tip_receiver_id": "EMP-001" if self._tip_type != "noTip" else None,
            }

        # Employee name lookup
        if "FROM shop.employees" in last_query:
            return {"first_name": "Test", "last_name": "Employee"}

        # Promotion lookup
        if "FROM shop.promotions" in last_query:
            if self._coupon and self._discount_type:
                return {
                    "discount_type": self._discount_type,
                    "discount_value": self._discount_value,
                    "minimum_order_value": self._min_order_value,
                }
            return None

        # Order status lookup
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

        # Order services for total recalculation - return our configured services
        if "FROM orders.order_services" in last_query:
            return [
                {"service_price": price, "weight_or_count": weight}
                for price, weight in self._services
            ]

        # Order products for total recalculation
        if "FROM orders.order_products" in last_query:
            return []

        return []


class MockConnectionPreservation:
    """Mock connection that yields a mock cursor."""

    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db_preservation(cursor):
    """Context manager that yields a mock connection."""
    conn = MockConnectionPreservation(cursor)
    yield conn


# ===========================================================================
# PROPERTY TEST: Preservation — Desktop POS and Non-Mobile Behavior Unchanged
# Tag: "Feature: mobile-order-processing, Property 2: Preservation"
# Validates: Requirements 3.1, 3.4, 3.5, 3.6
# ===========================================================================


class TestMobileOrderPreservation:
    """
    Feature: mobile-order-processing, Property 2: Preservation -
    Desktop POS and Non-Mobile Behavior Unchanged

    For any order where status is NOT in ("OrderSubmitted", "ReadyForIntake"),
    calling employee-update-services does NOT change order_status.
    Additionally, total recalculation and coupon logic must work correctly.

    EXPECTED: These tests PASS on unfixed code (confirms baseline behavior).

    **Validates: Requirements 3.1, 3.4, 3.5, 3.6**
    """

    @given(
        order_status=non_transitioning_statuses,
        weight=valid_weights,
        service_name=service_names,
    )
    @hyp_settings(max_examples=20, deadline=None)
    def test_non_prefacility_status_not_changed_by_update_services(
        self, order_status, weight, service_name
    ):
        """
        Property: For all orders where status is NOT in ("OrderSubmitted",
        "ReadyForIntake"), calling employee-update-services does NOT change
        order_status. The endpoint only updates service weights and totals.

        Observed on UNFIXED code: employee-update-services never changes
        order_status for any status (including pre-facility ones — that's the bug).
        This test confirms it doesn't change status for post-facility statuses,
        which is correct behavior that MUST be preserved after the fix.

        **Validates: Requirements 3.1, 3.4**
        """
        from app.routes.admin_extra import employee_update_services

        cursor = MockCursorPreservation(
            order_status=order_status,
            services=[(2.50, weight)],
        )

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-PRESERVE001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db_preservation(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        # Endpoint should return 200
        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # PRESERVATION: order_status must NOT be changed for non-pre-facility statuses
        # Check that no UPDATE query attempts to change order_status to something else
        status_change_attempted = any(
            "order_status" in q and "UPDATE orders.orders" in q
            and "ReceivedAtFacility" in q
            for q in cursor.executed_queries
        )

        assert not status_change_attempted, (
            f"REGRESSION: employee-update-services attempted to change order_status "
            f"for order in '{order_status}' status. Non-pre-facility orders must "
            f"never have their status changed by this endpoint. "
            f"Weight={weight}, Service={service_name}"
        )

    @given(
        weight=valid_weights,
        service_name=service_names,
    )
    @hyp_settings(max_examples=20, deadline=None)
    def test_total_recalculation_produces_correct_sub_total(
        self, weight, service_name
    ):
        """
        Property: For all valid service weight inputs, total recalculation
        produces correct sub_total = sum(price * weight) for each service.

        The endpoint recalculates sub_total by summing (service_price * weight_or_count)
        for all services in the order. This must remain correct after the fix.

        **Validates: Requirements 3.5**
        """
        from app.routes.admin_extra import employee_update_services

        # Service catalog prices
        catalog = {
            "Wash & Fold": 2.50,
            "Dry Clean": 5.00,
            "Press Only": 3.00,
            "Wash & Iron": 3.50,
        }
        price = catalog[service_name]

        # After update, the service will have this price and weight
        cursor = MockCursorPreservation(
            order_status="Processing",
            services=[(price, weight)],
        )

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-PRESERVE001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db_preservation(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # Verify sub_total calculation: sum(price * weight) for each service
        expected_sub_total = round(price * weight, 2)
        actual_sub_total = result["body"]["subTotal"]

        assert abs(actual_sub_total - expected_sub_total) < 0.01, (
            f"REGRESSION: sub_total calculation is wrong. "
            f"Expected: {expected_sub_total} (price={price} * weight={weight}), "
            f"Got: {actual_sub_total}"
        )

    @given(
        weight=valid_weights,
        service_name=service_names,
        discount_pct=discount_percentages,
    )
    @hyp_settings(max_examples=20, deadline=None)
    def test_coupon_discount_produces_correct_total_cost(
        self, weight, service_name, discount_pct
    ):
        """
        Property: Coupon discount logic produces correct
        total_cost = sub_total - discount for percentage coupons.

        When a percentage coupon is applied:
          discount = sub_total * (discount_pct / 100)
          total_cost = sub_total - discount

        This calculation must be preserved after the fix.

        **Validates: Requirements 3.5, 3.6**
        """
        from app.routes.admin_extra import employee_update_services

        catalog = {
            "Wash & Fold": 2.50,
            "Dry Clean": 5.00,
            "Press Only": 3.00,
            "Wash & Iron": 3.50,
        }
        price = catalog[service_name]

        # Use a coupon with percentage discount, min_order_value=0 so it always applies
        cursor = MockCursorPreservation(
            order_status="Processing",
            services=[(price, weight)],
            coupon="SAVE10",
            discount_type="percentage",
            discount_value=discount_pct,
            min_order_value=0,
        )

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-PRESERVE001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db_preservation(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # Verify coupon discount logic
        expected_sub_total = round(price * weight, 2)
        expected_discount = round(expected_sub_total * (discount_pct / 100), 2)
        expected_total_cost = round(expected_sub_total - expected_discount, 2)

        actual_sub_total = result["body"]["subTotal"]
        actual_total_cost = result["body"]["totalCost"]

        assert abs(actual_sub_total - expected_sub_total) < 0.01, (
            f"REGRESSION: sub_total wrong with coupon. "
            f"Expected: {expected_sub_total}, Got: {actual_sub_total}"
        )
        assert abs(actual_total_cost - expected_total_cost) < 0.01, (
            f"REGRESSION: total_cost wrong with percentage coupon. "
            f"Expected: {expected_total_cost} (sub_total={expected_sub_total} - "
            f"discount={expected_discount} [{discount_pct}%]), Got: {actual_total_cost}"
        )

    @given(
        weight=valid_weights,
        service_name=service_names,
        tip_pct=tip_percentages,
    )
    @hyp_settings(max_examples=20, deadline=None)
    def test_tip_recalculation_correct_for_percentage_tips(
        self, weight, service_name, tip_pct
    ):
        """
        Property: Tip recalculation for percentage tips is correct after
        weight update. When tip_type is "percentage", tip_amount should be
        recalculated as sub_total * (tip_percentage / 100).

        grand_total = total_cost + tip_amount

        **Validates: Requirements 3.5**
        """
        from app.routes.admin_extra import employee_update_services

        catalog = {
            "Wash & Fold": 2.50,
            "Dry Clean": 5.00,
            "Press Only": 3.00,
            "Wash & Iron": 3.50,
        }
        price = catalog[service_name]

        cursor = MockCursorPreservation(
            order_status="Processing",
            services=[(price, weight)],
            tip_type="percentage",
            tip_percentage=tip_pct,
            tip_amount=0,  # Will be recalculated
        )

        body = {
            "servicesToUpdate": [
                {"id": 1, "serviceName": service_name, "weightOrCount": weight}
            ],
            "empId": "EMP-001",
            "orderId": "IS-PRESERVE001",
            "laundryId": "5",
        }

        with patch("app.routes.admin_extra.get_db") as mock_db, \
             patch("app.routes.admin_extra.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db_preservation(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                employee_update_services(body=body)
            )

        assert result["statusCode"] == 200, f"Endpoint failed: {result}"

        # Verify tip recalculation
        expected_sub_total = round(price * weight, 2)
        expected_tip = round(expected_sub_total * (tip_pct / 100), 2)
        # total_cost = sub_total (no coupon)
        expected_grand_total = round(expected_sub_total + expected_tip, 2)

        actual_grand_total = result["body"]["grandTotal"]

        assert abs(actual_grand_total - expected_grand_total) < 0.01, (
            f"REGRESSION: grand_total wrong with percentage tip. "
            f"Expected: {expected_grand_total} (total_cost={expected_sub_total} + "
            f"tip={expected_tip} [{tip_pct}%]), Got: {actual_grand_total}"
        )
