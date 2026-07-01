"""
Property-based test for payment gate bug condition exploration.

Feature: payment-gated-status-transitions, Property 1: Bug Condition -
Unpaid Orders Transition to Post-Processing Statuses Without Payment Verification

This test MUST FAIL on unfixed code — failure confirms the bug exists.
The test encodes the expected behavior: check_payment_gate should exist and
enforce payment requirements for gated status transitions.

GOAL: Surface counterexamples that demonstrate the bug exists — the unfixed code
has no check_payment_gate function, so any unpaid order can transition to gated
statuses unchecked.

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
"""

import pytest
from hypothesis import given, settings as hyp_settings, assume
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Gated statuses that require payment verification
gated_statuses = st.sampled_from([
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

# Payment statuses that are NOT 'Paid' (bug condition: payment_status != 'Paid')
unpaid_statuses = st.sampled_from([
    "Unpaid",
    "Pending",
    "Invoice Sent",
    "Failed",
])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_order(order_type: str, payment_status: str, grand_total: float = 28.19):
    """Build a mock order dict representing an unpaid order."""
    return {
        "order_id": "O-9C79890B",
        "order_type": order_type,
        "payment_status": payment_status,
        "grand_total": grand_total,
        "customer_id": "cust-001",
        "laundry_id": "laundry-001",
    }


# ===========================================================================
# PROPERTY TEST: Bug Condition — Payment Gate for Unpaid Orders
# Tag: "Feature: payment-gated-status-transitions, Property 1: Bug Condition"
# Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
# ===========================================================================


class TestPaymentGateBugCondition:
    """
    Feature: payment-gated-status-transitions, Property 1: Bug Condition -
    Unpaid Orders Transition to Post-Processing Statuses Without Payment Verification

    For any (order_type, payment_status, target_status) tuple where:
    - target_status ∈ {ReadyForDelivery, EnRouteToDelivery, Delivered}
    - payment_status != 'Paid'

    The check_payment_gate function SHALL:
    - For Online orders: return {"allowed": True, "charged": True} (auto-charge succeeds)
      OR {"allowed": False} (charge fails)
    - For non-Online orders: return {"allowed": False} with a payment-required error message

    **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
    """

    @given(
        order_type=st.just("Online"),
        payment_status=unpaid_statuses,
        target_status=gated_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_online_unpaid_orders_at_gated_status_triggers_auto_charge(
        self, order_type, payment_status, target_status
    ):
        """
        Property: For any Online order with payment_status != 'Paid' targeting a
        gated status (ReadyForDelivery, EnRouteToDelivery, Delivered), the
        check_payment_gate function SHALL return either:
        - {"allowed": True, "charged": True, ...} indicating auto-charge succeeded, OR
        - {"allowed": False, "error": "..."} indicating charge failed

        In both cases the gate MUST NOT return {"allowed": True} without "charged": True,
        because that would mean the transition was allowed without payment.

        **Validates: Requirements 2.1, 2.3**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, payment_status)
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        # The gate must either auto-charge successfully or reject
        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"

        if result.get("allowed"):
            # If allowed, it must have charged the card
            assert result.get("charged") is True, (
                f"Online unpaid order allowed to transition to {target_status} "
                f"without being charged. Result: {result}"
            )
        else:
            # If not allowed, must have an error message about payment
            assert "error" in result, (
                f"Gate blocked transition but no error message provided. Result: {result}"
            )
            assert "payment" in result["error"].lower() or "charge" in result["error"].lower(), (
                f"Error message should mention payment/charge. Got: {result['error']}"
            )

    @given(
        order_type=st.just("InStore"),
        payment_status=unpaid_statuses,
        target_status=gated_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_instore_unpaid_orders_at_gated_status_are_blocked(
        self, order_type, payment_status, target_status
    ):
        """
        Property: For any non-Online (InStore) order with payment_status != 'Paid'
        targeting a gated status (ReadyForDelivery, EnRouteToDelivery, Delivered),
        the check_payment_gate function SHALL return {"allowed": False} with an
        error message indicating payment is required.

        **Validates: Requirements 2.2**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, payment_status)
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        # Non-Online unpaid orders MUST be blocked
        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"
        assert result.get("allowed") is False, (
            f"InStore unpaid order should be BLOCKED from transitioning to "
            f"{target_status}, but gate returned: {result}"
        )
        assert "error" in result, (
            f"Gate blocked transition but no error message provided. Result: {result}"
        )
        assert "payment" in result["error"].lower(), (
            f"Error message should mention payment. Got: {result['error']}"
        )

    @given(
        order_type=order_types,
        payment_status=unpaid_statuses,
        target_status=gated_statuses,
    )
    @hyp_settings(max_examples=10, deadline=None)
    def test_unpaid_orders_never_silently_allowed_at_gated_statuses(
        self, order_type, payment_status, target_status
    ):
        """
        Property: For ANY unpaid order (regardless of order_type) targeting a
        gated status, the check_payment_gate function SHALL NEVER return
        {"allowed": True} without either charging (for Online) or blocking
        (for non-Online). A plain {"allowed": True} without "charged": True
        would indicate the bug still exists.

        **Validates: Requirements 1.1, 1.2, 1.3**
        """
        from app.services.payment_service import check_payment_gate

        order = build_order(order_type, payment_status)
        laundry_id = order["laundry_id"]

        result = check_payment_gate(order, target_status, laundry_id)

        assert isinstance(result, dict), f"Expected dict result, got {type(result)}"

        # The critical invariant: an unpaid order must NEVER be silently allowed
        # through without payment action
        if result.get("allowed") is True:
            assert result.get("charged") is True, (
                f"BUG DETECTED: Unpaid {order_type} order (payment_status='{payment_status}') "
                f"was allowed to transition to '{target_status}' without being charged. "
                f"This is the exact bug condition we're testing for. Result: {result}"
            )
