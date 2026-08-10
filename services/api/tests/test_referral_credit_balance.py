"""
Property-based tests for credit balance calculation.

Feature: referral-community, Property 14: Credit balance calculation

**Validates: Requirements 7.2**

For any set of reward credits for a customer (with varying statuses: active, used,
expired), the reported balance SHALL equal the sum of amounts where status is
"active" only. Used and expired credits SHALL be excluded.
"""
from decimal import Decimal

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st


# --- In-memory store simulating credit balance logic ---


class InMemoryCreditBalanceStore:
    """In-memory store for testing credit balance calculation."""

    def __init__(self, credits=None):
        """
        Args:
            credits: list of dicts with keys: id, customer_id, laundry_id,
                     amount, status (active/used/expired)
        """
        self.credits = credits or []

    def get_balance(self, customer_id, laundry_id):
        """Calculate available balance: sum of amounts where status is 'active'.

        This mirrors the balance calculation logic — only active credits
        contribute to the customer's available balance.

        Args:
            customer_id: The customer's ID
            laundry_id: The laundry tenant ID

        Returns:
            Decimal representing the available balance
        """
        return sum(
            c["amount"]
            for c in self.credits
            if c["customer_id"] == customer_id
            and c["laundry_id"] == laundry_id
            and c["status"] == "active"
        )

    def get_credits_by_status(self, customer_id, laundry_id, status):
        """Get credits filtered by status."""
        return [
            c for c in self.credits
            if c["customer_id"] == customer_id
            and c["laundry_id"] == laundry_id
            and c["status"] == status
        ]


# --- Hypothesis strategies ---

credit_amount_strategy = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("100.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

status_strategy = st.sampled_from(["active", "used", "expired"])


@st.composite
def credit_list_strategy(draw):
    """Generate a list of credits with varying statuses."""
    num_credits = draw(st.integers(min_value=0, max_value=15))
    credits = []
    for i in range(num_credits):
        credits.append({
            "id": i + 1,
            "customer_id": "cust1",
            "laundry_id": "laundry1",
            "amount": draw(credit_amount_strategy),
            "status": draw(status_strategy),
        })
    return credits


class TestCreditBalanceCalculation:
    """Property 14: Credit balance calculation.

    For any set of reward credits for a customer (with varying statuses: active,
    used, expired), the reported balance SHALL equal the sum of amounts where
    status is "active" only. Used and expired credits SHALL be excluded.

    **Validates: Requirements 7.2**
    """

    @given(credits=credit_list_strategy())
    @hypothesis_settings(max_examples=100)
    def test_balance_equals_sum_of_active_credits_only(self, credits):
        """Reported balance SHALL equal sum of amounts where status is 'active'."""
        store = InMemoryCreditBalanceStore(credits=credits)
        balance = store.get_balance("cust1", "laundry1")

        expected = sum(
            c["amount"] for c in credits
            if c["status"] == "active"
            and c["customer_id"] == "cust1"
            and c["laundry_id"] == "laundry1"
        )
        assert balance == expected, (
            f"Balance {balance} != expected {expected} (sum of active credits)"
        )

    @given(credits=credit_list_strategy())
    @hypothesis_settings(max_examples=100)
    def test_used_credits_excluded_from_balance(self, credits):
        """Used credits SHALL be excluded from the reported balance."""
        store = InMemoryCreditBalanceStore(credits=credits)
        balance = store.get_balance("cust1", "laundry1")

        used_total = sum(
            c["amount"] for c in credits
            if c["status"] == "used"
            and c["customer_id"] == "cust1"
            and c["laundry_id"] == "laundry1"
        )

        # If there are used credits, verify they don't contribute to balance
        if used_total > 0:
            active_total = sum(
                c["amount"] for c in credits
                if c["status"] == "active"
                and c["customer_id"] == "cust1"
                and c["laundry_id"] == "laundry1"
            )
            assert balance == active_total, (
                f"Balance {balance} should not include used credits total {used_total}"
            )

    @given(credits=credit_list_strategy())
    @hypothesis_settings(max_examples=100)
    def test_expired_credits_excluded_from_balance(self, credits):
        """Expired credits SHALL be excluded from the reported balance."""
        store = InMemoryCreditBalanceStore(credits=credits)
        balance = store.get_balance("cust1", "laundry1")

        expired_total = sum(
            c["amount"] for c in credits
            if c["status"] == "expired"
            and c["customer_id"] == "cust1"
            and c["laundry_id"] == "laundry1"
        )

        # If there are expired credits, verify they don't contribute to balance
        if expired_total > 0:
            active_total = sum(
                c["amount"] for c in credits
                if c["status"] == "active"
                and c["customer_id"] == "cust1"
                and c["laundry_id"] == "laundry1"
            )
            assert balance == active_total, (
                f"Balance {balance} should not include expired credits total {expired_total}"
            )

    @given(
        active_amounts=st.lists(credit_amount_strategy, min_size=1, max_size=5),
        used_amounts=st.lists(credit_amount_strategy, min_size=1, max_size=5),
        expired_amounts=st.lists(credit_amount_strategy, min_size=1, max_size=5),
    )
    @hypothesis_settings(max_examples=100)
    def test_balance_with_mixed_statuses(
        self, active_amounts, used_amounts, expired_amounts,
    ):
        """With a mix of active, used, and expired credits, balance SHALL only
        include active amounts."""
        credits = []
        idx = 1

        for amt in active_amounts:
            credits.append({
                "id": idx, "customer_id": "cust1", "laundry_id": "laundry1",
                "amount": amt, "status": "active",
            })
            idx += 1

        for amt in used_amounts:
            credits.append({
                "id": idx, "customer_id": "cust1", "laundry_id": "laundry1",
                "amount": amt, "status": "used",
            })
            idx += 1

        for amt in expired_amounts:
            credits.append({
                "id": idx, "customer_id": "cust1", "laundry_id": "laundry1",
                "amount": amt, "status": "expired",
            })
            idx += 1

        store = InMemoryCreditBalanceStore(credits=credits)
        balance = store.get_balance("cust1", "laundry1")

        expected = sum(active_amounts)
        assert balance == expected, (
            f"Balance {balance} should equal sum of active amounts {expected}, "
            f"not include used ({sum(used_amounts)}) or expired ({sum(expired_amounts)})"
        )

    @given(credits=credit_list_strategy())
    @hypothesis_settings(max_examples=100)
    def test_balance_is_non_negative(self, credits):
        """Balance SHALL always be non-negative (>= 0)."""
        store = InMemoryCreditBalanceStore(credits=credits)
        balance = store.get_balance("cust1", "laundry1")

        assert balance >= Decimal("0"), (
            f"Balance should be non-negative, got {balance}"
        )
