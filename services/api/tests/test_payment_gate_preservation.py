"""
Property-based test for payment gate preservation checking.

Feature: payment-gated-status-transitions, Property 2: Preservation -
Non-Gated Transitions and Paid Orders Pass Unchanged

This test validates that the payment gate does NOT interfere with:
1. Status transitions to non-gated statuses (OrderSubmitted, ReadyForIntake,
   ReceivedAtFacility, Processing, ProcessingStarted, ProcessingCompleted)
   regardless of payment_status
2. Orders with payment_status='Paid' transitioning freely to ANY status
   (including gated ones like ReadyForDelivery, EnRouteToDelivery, Delivered)

OBSERVATION (UNFIXED code): All of the above transitions currently work without
any payment checks because no check_payment_gate function exists yet.

EXPECTED OUTCOME ON UNFIXED CODE: Tests FAIL with ImportError since
check_payment_gate does not exist. This is expected — the tests validate
preservation AFTER the fix is implemented.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
"""

import pytest
from hypothesis import given, settings as hyp_settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Non-gated statuses: transitions to these should ALWAYS be allowed
non_gated_statuses = st.sampled_from([
    "OrderSubmitted",
    "ReadyForIntake",
    "ReceivedAtFacility",
    "Processing",
    "ProcessingStarted",
    "ProcessingCompleted",
])

# All statuses including gated ones (for paid order tests)
all_statuses = st.sampled_from([
    "OrderSubmitted",
    "ReadyForIntake",
    "ReceivedAtFacility",
    "Processing",
    "ProcessingStarted",
    "ProcessingCompleted",
    "ReadyForDelivery",
    "EnRouteToDelivery",
    "Delivered",
    "OrderPickedUp",
])

# Order types in the system
order_types = st.sampled_from([
    "Online",
    "InStore",
])

# All possible payment statuses (including unpaid ones)
all_payment_statuses = st.sampled_from([
    "Paid",
    "Unpaid",
    "Pending",
    "Invoice Sent",
    "Failed",
])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_order(order_type: str, payment_status: str, grand_total: float = 28.19):
    """Build a mock order dict for testing."""
    return {
        "order_id": "O-PRESERVE-TEST",
        "order_type": order_type,
        "payment_status": payment_status,
        "grand_total": grand_total,
        "customer_id": "cust-001",
        "laundry_id": "laundry-001",
    }


# ===========================================================================
# PROPERTY TEST: Preservation — Non-Gated Transitions and Paid Orders
# Tag: "Feature: payment-gated-status-transitions, Property 2: Preservation"
# Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
# ===========================================================================


class TestPaymentGatePreservation:
    """
    Feature: payment-gated-status-transitions, Property 2: Preservation -
    Non-Gated Transitions and Paid Orders Pass Unchanged

    For any (order_type, payment_status, target_status) tuple where:
    - target_status NOT IN {ReadyForDelivery, EnRouteToDelivery, Delivered}
      OR
    - payment_status = 'Paid'

    The check_payment_gate function MUST return {"allowed": True},
    meaning the gate does NOT block the transition.

    **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
    """

    @given(
        order_type=order_types,
        payment_status=all_payment_statuses,
        target_status=non_gated_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_non_gated_statuses_always_allowed_regardless_of_payment(
        self, order_type, payment_status, target_status
    ):
        """
        Property: For any order (regardless of order_type or payment_status)
        targeting a non-gated status (OrderSubmitted, ReadyForIntake,
        ReceivedAtFacility, Processing, ProcessingStarted, ProcessingCompleted),
        the check_payment_gate function MUST return {"allowed": True}.

        The payment gate should ONLY apply to post-processing statuses
        (ReadyForDelivery, EnRouteToDelivery, Delivered). All earlier status
        transitions must pass through unchanged.

        **Validates: Requirements 3.1, 3.2, 3.3**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, payment_status)
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        # Non-gated statuses MUST always be allowed
        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"
        assert result.get("allowed") is True, (
            f"Non-gated status '{target_status}' was BLOCKED by payment gate for "
            f"order_type='{order_type}', payment_status='{payment_status}'. "
            f"Non-gated transitions must never be blocked. Result: {result}"
        )

    @given(
        order_type=order_types,
        target_status=all_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_paid_orders_transition_freely_to_any_status(
        self, order_type, target_status
    ):
        """
        Property: For any order with payment_status='Paid' (regardless of
        order_type), transitions to ANY status including gated statuses
        (ReadyForDelivery, EnRouteToDelivery, Delivered) MUST be allowed.

        The payment gate only applies when payment_status != 'Paid'. Once
        an order is paid, it should transition freely as before.

        **Validates: Requirements 3.4**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, "Paid")
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        # Paid orders MUST always be allowed regardless of target status
        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"
        assert result.get("allowed") is True, (
            f"Paid order was BLOCKED from transitioning to '{target_status}' "
            f"(order_type='{order_type}'). Paid orders must never be blocked by "
            f"the payment gate. Result: {result}"
        )
        # A paid order should NOT trigger a charge
        assert result.get("charged") is not True, (
            f"Paid order was charged AGAIN when transitioning to '{target_status}'. "
            f"Already-paid orders should not be re-charged. Result: {result}"
        )

    @given(
        order_type=order_types,
        payment_status=all_payment_statuses,
        target_status=non_gated_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_gate_returns_no_error_for_non_gated_transitions(
        self, order_type, payment_status, target_status
    ):
        """
        Property: For non-gated transitions, the gate result must not contain
        an error field. The response should be a clean {"allowed": True}
        indicating no payment processing was needed or attempted.

        **Validates: Requirements 3.5, 3.6**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, payment_status)
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        # Must be allowed
        assert result.get("allowed") is True, (
            f"Non-gated status '{target_status}' was blocked. Result: {result}"
        )
        # Must not have an error
        assert "error" not in result, (
            f"Non-gated transition returned an error field even though it was "
            f"allowed. This suggests unnecessary payment processing. Result: {result}"
        )
