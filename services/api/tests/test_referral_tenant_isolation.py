"""
Property-based tests for tenant isolation in analytics.

Feature: referral-community, Property 12: Tenant isolation in analytics

Validates: Requirements 6.2
"""
from datetime import datetime, timedelta
from decimal import Decimal

from hypothesis import given, settings, assume
from hypothesis import strategies as st


# --- In-memory stores simulating referral tables scoped by laundry_id ---


class FakeReferralEventStore:
    """In-memory store simulating shop.referral_events table."""

    def __init__(self):
        self._events = []  # list of event dicts
        self._next_id = 1

    def add_event(self, laundry_id: str, referrer_id: str, referee_id: str, status: str):
        """Insert a referral event."""
        event = {
            "id": self._next_id,
            "laundry_id": laundry_id,
            "referrer_id": referrer_id,
            "referee_id": referee_id,
            "status": status,
            "created_at": datetime.now(),
        }
        self._events.append(event)
        self._next_id += 1
        return event

    def count_total(self, laundry_id: str) -> int:
        """COUNT(*) FROM shop.referral_events WHERE laundry_id = %s"""
        return sum(1 for e in self._events if e["laundry_id"] == laundry_id)

    def count_monthly(self, laundry_id: str) -> int:
        """COUNT(*) WHERE laundry_id AND created_at >= start of current month."""
        month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return sum(
            1
            for e in self._events
            if e["laundry_id"] == laundry_id and e["created_at"] >= month_start
        )

    def get_top_referrers(self, laundry_id: str) -> list:
        """Top referrers by count of completed referrals for this laundry."""
        counts = {}
        for e in self._events:
            if e["laundry_id"] == laundry_id and e["status"] in (
                "first_order_completed",
                "rewarded",
            ):
                counts[e["referrer_id"]] = counts.get(e["referrer_id"], 0) + 1
        sorted_referrers = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        return [{"referrer_id": r, "count": c} for r, c in sorted_referrers[:10]]

    def get_all_for_laundry(self, laundry_id: str) -> list:
        """Return all events for a given laundry."""
        return [e for e in self._events if e["laundry_id"] == laundry_id]


class FakeRewardCreditStore:
    """In-memory store simulating shop.reward_credits table."""

    def __init__(self):
        self._credits = []
        self._next_id = 1

    def add_credit(self, customer_id: str, laundry_id: str, amount: Decimal):
        """Insert a reward credit."""
        credit = {
            "id": self._next_id,
            "customer_id": customer_id,
            "laundry_id": laundry_id,
            "amount": amount,
            "status": "active",
            "created_at": datetime.now(),
        }
        self._credits.append(credit)
        self._next_id += 1
        return credit

    def total_rewards_issued(self, laundry_id: str) -> Decimal:
        """SUM(amount) FROM shop.reward_credits WHERE laundry_id = %s"""
        return sum(
            (c["amount"] for c in self._credits if c["laundry_id"] == laundry_id),
            Decimal("0"),
        )


# --- Analytics query function (mirrors GET /api/referrals/analytics logic) ---


def query_analytics(
    event_store: FakeReferralEventStore,
    credit_store: FakeRewardCreditStore,
    laundry_id: str,
) -> dict:
    """Simulate the analytics query logic for a single laundry.

    Returns the same structure as GET /api/referrals/analytics.
    """
    total_referrals = event_store.count_total(laundry_id)
    monthly_referrals = event_store.count_monthly(laundry_id)
    total_rewards_issued = credit_store.total_rewards_issued(laundry_id)
    top_referrers = event_store.get_top_referrers(laundry_id)

    return {
        "totalReferrals": total_referrals,
        "monthlyReferrals": monthly_referrals,
        "totalRewardsIssued": total_rewards_issued,
        "topReferrers": top_referrers,
    }


# --- Hypothesis strategies ---

laundry_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=10,
)

customer_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=10,
)

event_status_strategy = st.sampled_from(["signed_up", "first_order_completed", "rewarded"])


class TestTenantIsolationInAnalyticsProperty:
    """Property 12: Tenant isolation in analytics.

    For any two laundries with referral data, querying analytics for laundry A
    SHALL return counts and events exclusively from laundry A, with zero
    contamination from laundry B's data.

    **Validates: Requirements 6.2**
    """

    @given(
        laundry_id_a=laundry_id_strategy,
        laundry_id_b=laundry_id_strategy,
        events_a_count=st.integers(min_value=0, max_value=20),
        events_b_count=st.integers(min_value=0, max_value=20),
        rewards_a_count=st.integers(min_value=0, max_value=20),
        rewards_b_count=st.integers(min_value=0, max_value=20),
    )
    @settings(max_examples=100)
    def test_analytics_for_laundry_a_excludes_laundry_b_data(
        self,
        laundry_id_a: str,
        laundry_id_b: str,
        events_a_count: int,
        events_b_count: int,
        rewards_a_count: int,
        rewards_b_count: int,
    ):
        """Querying analytics for laundry A returns only laundry A's data."""
        assume(laundry_id_a != laundry_id_b)

        event_store = FakeReferralEventStore()
        credit_store = FakeRewardCreditStore()

        # Populate events for laundry A
        for i in range(events_a_count):
            event_store.add_event(
                laundry_id=laundry_id_a,
                referrer_id=f"referrer_a_{i}",
                referee_id=f"referee_a_{i}",
                status="first_order_completed",
            )

        # Populate events for laundry B
        for i in range(events_b_count):
            event_store.add_event(
                laundry_id=laundry_id_b,
                referrer_id=f"referrer_b_{i}",
                referee_id=f"referee_b_{i}",
                status="first_order_completed",
            )

        # Populate reward credits for laundry A
        for i in range(rewards_a_count):
            credit_store.add_credit(
                customer_id=f"customer_a_{i}",
                laundry_id=laundry_id_a,
                amount=Decimal("5.00"),
            )

        # Populate reward credits for laundry B
        for i in range(rewards_b_count):
            credit_store.add_credit(
                customer_id=f"customer_b_{i}",
                laundry_id=laundry_id_b,
                amount=Decimal("10.00"),
            )

        # Query analytics for laundry A
        result_a = query_analytics(event_store, credit_store, laundry_id_a)

        # totalReferrals must equal only laundry A's event count
        assert result_a["totalReferrals"] == events_a_count, (
            f"totalReferrals should be {events_a_count} (laundry A only), "
            f"got {result_a['totalReferrals']}"
        )

        # monthlyReferrals must equal only laundry A's event count
        # (all events added just now, so all are in current month)
        assert result_a["monthlyReferrals"] == events_a_count, (
            f"monthlyReferrals should be {events_a_count} (laundry A only), "
            f"got {result_a['monthlyReferrals']}"
        )

        # totalRewardsIssued must equal only laundry A's credits
        expected_rewards_a = Decimal("5.00") * rewards_a_count
        assert result_a["totalRewardsIssued"] == expected_rewards_a, (
            f"totalRewardsIssued should be {expected_rewards_a} (laundry A only), "
            f"got {result_a['totalRewardsIssued']}"
        )

        # topReferrers must only contain laundry A referrer IDs
        for entry in result_a["topReferrers"]:
            assert entry["referrer_id"].startswith("referrer_a_"), (
                f"topReferrers should only contain laundry A referrers, "
                f"found {entry['referrer_id']}"
            )

    @given(
        laundry_id_a=laundry_id_strategy,
        laundry_id_b=laundry_id_strategy,
        events_a_count=st.integers(min_value=0, max_value=20),
        events_b_count=st.integers(min_value=0, max_value=20),
        rewards_a_count=st.integers(min_value=0, max_value=20),
        rewards_b_count=st.integers(min_value=0, max_value=20),
    )
    @settings(max_examples=100)
    def test_analytics_for_laundry_b_excludes_laundry_a_data(
        self,
        laundry_id_a: str,
        laundry_id_b: str,
        events_a_count: int,
        events_b_count: int,
        rewards_a_count: int,
        rewards_b_count: int,
    ):
        """Querying analytics for laundry B returns only laundry B's data."""
        assume(laundry_id_a != laundry_id_b)

        event_store = FakeReferralEventStore()
        credit_store = FakeRewardCreditStore()

        # Populate events for laundry A
        for i in range(events_a_count):
            event_store.add_event(
                laundry_id=laundry_id_a,
                referrer_id=f"referrer_a_{i}",
                referee_id=f"referee_a_{i}",
                status="rewarded",
            )

        # Populate events for laundry B
        for i in range(events_b_count):
            event_store.add_event(
                laundry_id=laundry_id_b,
                referrer_id=f"referrer_b_{i}",
                referee_id=f"referee_b_{i}",
                status="rewarded",
            )

        # Populate reward credits for laundry A
        for i in range(rewards_a_count):
            credit_store.add_credit(
                customer_id=f"customer_a_{i}",
                laundry_id=laundry_id_a,
                amount=Decimal("7.50"),
            )

        # Populate reward credits for laundry B
        for i in range(rewards_b_count):
            credit_store.add_credit(
                customer_id=f"customer_b_{i}",
                laundry_id=laundry_id_b,
                amount=Decimal("3.00"),
            )

        # Query analytics for laundry B
        result_b = query_analytics(event_store, credit_store, laundry_id_b)

        # totalReferrals must equal only laundry B's event count
        assert result_b["totalReferrals"] == events_b_count, (
            f"totalReferrals should be {events_b_count} (laundry B only), "
            f"got {result_b['totalReferrals']}"
        )

        # monthlyReferrals must equal only laundry B's event count
        assert result_b["monthlyReferrals"] == events_b_count, (
            f"monthlyReferrals should be {events_b_count} (laundry B only), "
            f"got {result_b['monthlyReferrals']}"
        )

        # totalRewardsIssued must equal only laundry B's credits
        expected_rewards_b = Decimal("3.00") * rewards_b_count
        assert result_b["totalRewardsIssued"] == expected_rewards_b, (
            f"totalRewardsIssued should be {expected_rewards_b} (laundry B only), "
            f"got {result_b['totalRewardsIssued']}"
        )

        # topReferrers must only contain laundry B referrer IDs
        for entry in result_b["topReferrers"]:
            assert entry["referrer_id"].startswith("referrer_b_"), (
                f"topReferrers should only contain laundry B referrers, "
                f"found {entry['referrer_id']}"
            )

    @given(
        laundry_id_a=laundry_id_strategy,
        laundry_id_b=laundry_id_strategy,
        events_b_count=st.integers(min_value=1, max_value=20),
        rewards_b_count=st.integers(min_value=1, max_value=20),
    )
    @settings(max_examples=100)
    def test_empty_laundry_analytics_unaffected_by_other_laundry(
        self,
        laundry_id_a: str,
        laundry_id_b: str,
        events_b_count: int,
        rewards_b_count: int,
    ):
        """A laundry with zero data returns zeroed analytics regardless of other laundry data."""
        assume(laundry_id_a != laundry_id_b)

        event_store = FakeReferralEventStore()
        credit_store = FakeRewardCreditStore()

        # Populate only laundry B with data
        for i in range(events_b_count):
            event_store.add_event(
                laundry_id=laundry_id_b,
                referrer_id=f"referrer_b_{i}",
                referee_id=f"referee_b_{i}",
                status="first_order_completed",
            )

        for i in range(rewards_b_count):
            credit_store.add_credit(
                customer_id=f"customer_b_{i}",
                laundry_id=laundry_id_b,
                amount=Decimal("5.00"),
            )

        # Query analytics for laundry A (which has no data)
        result_a = query_analytics(event_store, credit_store, laundry_id_a)

        assert result_a["totalReferrals"] == 0, (
            f"Empty laundry A should have 0 totalReferrals, got {result_a['totalReferrals']}"
        )
        assert result_a["monthlyReferrals"] == 0, (
            f"Empty laundry A should have 0 monthlyReferrals, got {result_a['monthlyReferrals']}"
        )
        assert result_a["totalRewardsIssued"] == Decimal("0"), (
            f"Empty laundry A should have $0 totalRewardsIssued, "
            f"got {result_a['totalRewardsIssued']}"
        )
        assert result_a["topReferrers"] == [], (
            f"Empty laundry A should have empty topReferrers, "
            f"got {result_a['topReferrers']}"
        )
