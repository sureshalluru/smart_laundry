"""
Property-based tests for credit application at checkout (FIFO).

Feature: referral-community, Property 9: Credit application as discount (FIFO)

**Validates: Requirements 4.5**

For any customer with N active credits totaling $X placing an order of $Y,
the applied discount SHALL equal min(X, Y), the remaining order total SHALL
equal max(0, Y - X), and credits SHALL be consumed in FIFO order (oldest first).
"""
from decimal import Decimal

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating credit application logic ---


class InMemoryCreditStore:
    """In-memory store for testing credit application FIFO logic."""

    def __init__(self, credits=None):
        """
        Args:
            credits: list of dicts with keys: id, customer_id, laundry_id,
                     amount, status, created_at (int for ordering)
        """
        self.credits = credits or []

    def get_active_credits(self, customer_id, laundry_id):
        """Get active credits ordered by created_at ASC (oldest first = FIFO)."""
        active = [
            c for c in self.credits
            if c["customer_id"] == customer_id
            and c["laundry_id"] == laundry_id
            and c["status"] == "active"
        ]
        return sorted(active, key=lambda c: c["created_at"])

    def mark_credit_used(self, credit_id, order_id):
        """Mark a credit as used."""
        for c in self.credits:
            if c["id"] == credit_id:
                c["status"] = "used"
                c["used_on_order_id"] = order_id


def apply_credits(store, customer_id, laundry_id, order_total):
    """Apply available credits to an order using FIFO (oldest first).

    This mirrors the logic described in the design document:
    - Query active credits ordered by created_at ASC
    - Apply oldest credits first up to order_total
    - Return (discount, remaining_total, used_credit_ids)

    Args:
        store: InMemoryCreditStore instance
        customer_id: The customer's ID
        laundry_id: The laundry tenant ID
        order_total: The order total in dollars (Decimal)

    Returns:
        tuple of (discount, remaining_total, used_credits)
        where used_credits is a list of (credit_id, applied_amount) tuples
    """
    credits = store.get_active_credits(customer_id, laundry_id)
    discount = Decimal("0.00")
    used = []
    remaining = order_total

    for credit in credits:
        if remaining <= 0:
            break
        applied = min(credit["amount"], remaining)
        discount += applied
        remaining -= applied
        used.append((credit["id"], applied))

    return discount, remaining, used


# --- Hypothesis strategies ---

# Credit amount: between $0.01 and $100.00
credit_amount_strategy = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("100.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Order total: between $0.01 and $500.00
order_total_strategy = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("500.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Number of credits: between 1 and 10
num_credits_strategy = st.integers(min_value=1, max_value=10)


def build_credits(amounts, customer_id="cust1", laundry_id="laundry1"):
    """Build a list of credit dicts from amounts, with sequential created_at for ordering."""
    return [
        {
            "id": i + 1,
            "customer_id": customer_id,
            "laundry_id": laundry_id,
            "amount": amt,
            "status": "active",
            "created_at": i,  # Sequential ordering (0, 1, 2, ...) = FIFO
            "used_on_order_id": None,
        }
        for i, amt in enumerate(amounts)
    ]


class TestCreditApplicationFIFO:
    """Property 9: Credit application as discount (FIFO).

    For any customer with N active credits totaling $X placing an order of $Y,
    the applied discount SHALL equal min(X, Y), the remaining order total SHALL
    equal max(0, Y - X), and credits SHALL be consumed in FIFO order (oldest first).

    **Validates: Requirements 4.5**
    """

    @given(
        amounts=st.lists(credit_amount_strategy, min_size=1, max_size=10),
        order_total=order_total_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_discount_equals_min_of_total_credits_and_order_total(
        self, amounts, order_total
    ):
        """Applied discount SHALL equal min(sum_of_active_credits, order_total)."""
        customer_id = "cust1"
        laundry_id = "laundry1"
        credits = build_credits(amounts, customer_id, laundry_id)
        store = InMemoryCreditStore(credits=credits)

        total_credits = sum(amounts)
        discount, remaining, used = apply_credits(
            store, customer_id, laundry_id, order_total
        )

        expected_discount = min(total_credits, order_total)
        assert discount == expected_discount, (
            f"Discount {discount} != min({total_credits}, {order_total}) = {expected_discount}"
        )

    @given(
        amounts=st.lists(credit_amount_strategy, min_size=1, max_size=10),
        order_total=order_total_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_remaining_total_equals_max_zero_order_minus_credits(
        self, amounts, order_total
    ):
        """Remaining order total SHALL equal max(0, order_total - sum_of_credits)."""
        customer_id = "cust1"
        laundry_id = "laundry1"
        credits = build_credits(amounts, customer_id, laundry_id)
        store = InMemoryCreditStore(credits=credits)

        total_credits = sum(amounts)
        discount, remaining, used = apply_credits(
            store, customer_id, laundry_id, order_total
        )

        expected_remaining = max(Decimal("0"), order_total - total_credits)
        assert remaining == expected_remaining, (
            f"Remaining {remaining} != max(0, {order_total} - {total_credits}) = {expected_remaining}"
        )

    @given(
        amounts=st.lists(credit_amount_strategy, min_size=2, max_size=10),
        order_total=order_total_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_credits_consumed_in_fifo_order(self, amounts, order_total):
        """Credits SHALL be consumed in FIFO order (oldest first, by created_at)."""
        customer_id = "cust1"
        laundry_id = "laundry1"
        credits = build_credits(amounts, customer_id, laundry_id)
        store = InMemoryCreditStore(credits=credits)

        discount, remaining, used = apply_credits(
            store, customer_id, laundry_id, order_total
        )

        # Verify the used credit IDs are in ascending order (oldest first)
        used_ids = [credit_id for credit_id, _ in used]
        assert used_ids == sorted(used_ids), (
            f"Credits not consumed in FIFO order. Used IDs: {used_ids}"
        )

        # Verify used credits correspond to the first N credits in FIFO order
        if used_ids:
            expected_first_ids = [c["id"] for c in sorted(credits, key=lambda c: c["created_at"])]
            for i, uid in enumerate(used_ids):
                assert uid == expected_first_ids[i], (
                    f"Credit at position {i} should be ID {expected_first_ids[i]}, got {uid}"
                )

    @given(
        amounts=st.lists(credit_amount_strategy, min_size=1, max_size=10),
        order_total=order_total_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_discount_plus_remaining_equals_order_total(self, amounts, order_total):
        """The discount + remaining SHALL always equal the original order total."""
        customer_id = "cust1"
        laundry_id = "laundry1"
        credits = build_credits(amounts, customer_id, laundry_id)
        store = InMemoryCreditStore(credits=credits)

        discount, remaining, used = apply_credits(
            store, customer_id, laundry_id, order_total
        )

        assert discount + remaining == order_total, (
            f"Discount ({discount}) + remaining ({remaining}) != order_total ({order_total})"
        )

    @given(
        amounts=st.lists(credit_amount_strategy, min_size=1, max_size=10),
        order_total=order_total_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_credit_applied_more_than_its_amount(self, amounts, order_total):
        """No individual credit SHALL have more applied than its amount."""
        customer_id = "cust1"
        laundry_id = "laundry1"
        credits = build_credits(amounts, customer_id, laundry_id)
        store = InMemoryCreditStore(credits=credits)

        discount, remaining, used = apply_credits(
            store, customer_id, laundry_id, order_total
        )

        for credit_id, applied_amount in used:
            credit = next(c for c in credits if c["id"] == credit_id)
            assert applied_amount <= credit["amount"], (
                f"Credit {credit_id} had {applied_amount} applied but only has {credit['amount']}"
            )
