"""
Property-based tests for credit expiration logic.

Feature: referral-community, Property 15: Credit expiration logic

**Validates: Requirements 9.2**

For any reward credit whose expires_at is in the past, the expiration job SHALL
mark it as "expired" and it SHALL be excluded from the customer's available
balance thereafter.
"""
from decimal import Decimal
from datetime import datetime, timedelta

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating credit expiration logic ---


class InMemoryCreditExpirationStore:
    """In-memory store for testing credit expiration job logic."""

    def __init__(self, credits=None):
        """
        Args:
            credits: list of dicts with keys: id, customer_id, laundry_id,
                     amount, status, expires_at (datetime)
        """
        self.credits = credits or []
        self.notifications_sent = []

    def run_expiration_job(self, now):
        """Simulate the credit expiration job.

        Marks credits past expires_at as 'expired'.
        Sends reminder notifications for credits within 7 days of expiry.

        Args:
            now: The current datetime (for testing with controlled time).
        """
        for credit in self.credits:
            if credit["status"] != "active":
                continue

            if credit["expires_at"] < now:
                # Credit has expired
                credit["status"] = "expired"
            elif credit["expires_at"] <= now + timedelta(days=7):
                # Credit is within 7 days of expiry — send reminder
                self.notifications_sent.append({
                    "customer_id": credit["customer_id"],
                    "credit_id": credit["id"],
                    "type": "expiration_reminder",
                    "expires_at": credit["expires_at"],
                })

    def get_balance(self, customer_id, laundry_id):
        """Calculate available balance: sum of active credits only."""
        return sum(
            c["amount"]
            for c in self.credits
            if c["customer_id"] == customer_id
            and c["laundry_id"] == laundry_id
            and c["status"] == "active"
        )

    def get_active_credits(self, customer_id, laundry_id):
        """Get active credits for a customer."""
        return [
            c for c in self.credits
            if c["customer_id"] == customer_id
            and c["laundry_id"] == laundry_id
            and c["status"] == "active"
        ]


# --- Hypothesis strategies ---

credit_amount_strategy = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("100.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

# Days in the past (for expired credits)
days_past_strategy = st.integers(min_value=1, max_value=365)

# Days in the future (for non-expired credits)
days_future_strategy = st.integers(min_value=8, max_value=365)


class TestCreditExpirationLogic:
    """Property 15: Credit expiration logic.

    For any reward credit whose expires_at is in the past, the expiration job
    SHALL mark it as "expired" and it SHALL be excluded from the customer's
    available balance thereafter.

    **Validates: Requirements 9.2**
    """

    @given(
        amount=credit_amount_strategy,
        days_expired=days_past_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_expired_credits_marked_as_expired(self, amount, days_expired):
        """Credits whose expires_at is in the past SHALL be marked as 'expired'
        by the expiration job."""
        now = datetime(2024, 6, 15, 2, 0, 0)
        expires_at = now - timedelta(days=days_expired)

        store = InMemoryCreditExpirationStore(credits=[{
            "id": 1,
            "customer_id": "cust1",
            "laundry_id": "laundry1",
            "amount": amount,
            "status": "active",
            "expires_at": expires_at,
        }])

        store.run_expiration_job(now)

        assert store.credits[0]["status"] == "expired", (
            f"Credit with expires_at {expires_at} (now={now}) should be marked expired"
        )

    @given(
        amount=credit_amount_strategy,
        days_expired=days_past_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_expired_credits_excluded_from_balance(self, amount, days_expired):
        """After expiration job runs, expired credits SHALL be excluded from
        the customer's available balance."""
        now = datetime(2024, 6, 15, 2, 0, 0)
        expires_at = now - timedelta(days=days_expired)

        store = InMemoryCreditExpirationStore(credits=[{
            "id": 1,
            "customer_id": "cust1",
            "laundry_id": "laundry1",
            "amount": amount,
            "status": "active",
            "expires_at": expires_at,
        }])

        # Before expiration job, the credit is in balance
        balance_before = store.get_balance("cust1", "laundry1")
        assert balance_before == amount

        # Run the expiration job
        store.run_expiration_job(now)

        # After expiration job, the credit is NOT in balance
        balance_after = store.get_balance("cust1", "laundry1")
        assert balance_after == Decimal("0"), (
            f"Expired credit should not be in balance. Got {balance_after}"
        )

    @given(
        amount=credit_amount_strategy,
        days_future=days_future_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_non_expired_credits_remain_active(self, amount, days_future):
        """Credits whose expires_at is in the future (>7 days) SHALL remain 'active'."""
        now = datetime(2024, 6, 15, 2, 0, 0)
        expires_at = now + timedelta(days=days_future)

        store = InMemoryCreditExpirationStore(credits=[{
            "id": 1,
            "customer_id": "cust1",
            "laundry_id": "laundry1",
            "amount": amount,
            "status": "active",
            "expires_at": expires_at,
        }])

        store.run_expiration_job(now)

        assert store.credits[0]["status"] == "active", (
            f"Credit with expires_at {expires_at} (now={now}) should remain active"
        )

    @given(
        expired_amounts=st.lists(credit_amount_strategy, min_size=1, max_size=5),
        active_amounts=st.lists(credit_amount_strategy, min_size=1, max_size=5),
    )
    @hypothesis_settings(max_examples=100)
    def test_only_past_due_credits_expire_mixed_set(self, expired_amounts, active_amounts):
        """In a set of mixed credits, only those past expires_at SHALL be marked expired.
        Future credits SHALL remain active and in balance."""
        now = datetime(2024, 6, 15, 2, 0, 0)
        credits = []
        idx = 1

        # Credits that have expired (expires_at in the past)
        for amt in expired_amounts:
            credits.append({
                "id": idx,
                "customer_id": "cust1",
                "laundry_id": "laundry1",
                "amount": amt,
                "status": "active",
                "expires_at": now - timedelta(days=idx),
            })
            idx += 1

        # Credits still active (expires_at far in the future)
        for amt in active_amounts:
            credits.append({
                "id": idx,
                "customer_id": "cust1",
                "laundry_id": "laundry1",
                "amount": amt,
                "status": "active",
                "expires_at": now + timedelta(days=30 + idx),
            })
            idx += 1

        store = InMemoryCreditExpirationStore(credits=credits)
        store.run_expiration_job(now)

        # Balance should only include the still-active credits
        balance = store.get_balance("cust1", "laundry1")
        expected_balance = sum(active_amounts)
        assert balance == expected_balance, (
            f"Balance {balance} should equal sum of non-expired credits {expected_balance}"
        )

    @given(
        amount=credit_amount_strategy,
        days_until_expiry=st.integers(min_value=1, max_value=7),
    )
    @hypothesis_settings(max_examples=100)
    def test_credits_within_7_days_get_reminder_notification(self, amount, days_until_expiry):
        """Credits within 7 days of expiry SHALL trigger a reminder notification."""
        now = datetime(2024, 6, 15, 2, 0, 0)
        expires_at = now + timedelta(days=days_until_expiry)

        store = InMemoryCreditExpirationStore(credits=[{
            "id": 1,
            "customer_id": "cust1",
            "laundry_id": "laundry1",
            "amount": amount,
            "status": "active",
            "expires_at": expires_at,
        }])

        store.run_expiration_job(now)

        # Credit should still be active (not yet expired)
        assert store.credits[0]["status"] == "active"

        # A reminder notification should have been sent
        assert len(store.notifications_sent) == 1
        assert store.notifications_sent[0]["customer_id"] == "cust1"
        assert store.notifications_sent[0]["type"] == "expiration_reminder"
