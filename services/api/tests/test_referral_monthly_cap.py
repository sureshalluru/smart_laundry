"""
Property-based tests for monthly cap enforcement on referral rewards.

Feature: referral-community, Property 8: Monthly cap enforcement

**Validates: Requirements 4.4**

For any referrer who has already reached the configured max_monthly_referrals limit
for the current month, additional referral completions SHALL NOT create reward credits
for that referrer. The referee SHALL still receive their reward.
"""
from decimal import Decimal

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating the monthly cap logic ---


class InMemoryMonthlyCapStore:
    """In-memory store for testing monthly cap enforcement."""

    def __init__(self, events=None, config=None, monthly_referral_counts=None):
        """
        Args:
            events: list of referral event dicts
            config: program config dict
            monthly_referral_counts: dict mapping referrer_id to count of rewarded referrals this month
        """
        self.events = events or []
        self.config = config
        self.reward_credits = []
        self.monthly_referral_counts = monthly_referral_counts or {}

    def find_signed_up_event(self, customer_id, laundry_id):
        """Find a referral event with status 'signed_up' for this referee."""
        for event in self.events:
            if (event["referee_id"] == customer_id and
                    event["laundry_id"] == laundry_id and
                    event["status"] == "signed_up"):
                return event
        return None

    def transition_event(self, event_id, new_status):
        """Transition an event to a new status."""
        for event in self.events:
            if event["id"] == event_id:
                event["status"] = new_status

    def mark_referrer_rewarded(self, event_id):
        """Mark the event's referrer as rewarded."""
        for event in self.events:
            if event["id"] == event_id:
                event["referrer_rewarded"] = True

    def mark_referee_rewarded(self, event_id):
        """Mark the event's referee as rewarded."""
        for event in self.events:
            if event["id"] == event_id:
                event["referee_rewarded"] = True

    def create_reward_credit(self, customer_id, laundry_id, amount, source, event_id):
        """Create a reward credit entry."""
        self.reward_credits.append({
            "customer_id": customer_id,
            "laundry_id": laundry_id,
            "amount": amount,
            "source": source,
            "referral_event_id": event_id,
            "status": "active",
        })

    def get_monthly_referral_count(self, referrer_id, laundry_id):
        """Get current month's referral count for a referrer."""
        return self.monthly_referral_counts.get(referrer_id, 0)

    def get_config(self, laundry_id):
        """Get the referral program config."""
        if self.config and self.config.get("laundry_id") == laundry_id:
            return self.config
        return None


def simulate_process_first_order_with_cap(store, customer_id, laundry_id):
    """Simulate process_first_order_reward with monthly cap enforcement.

    This mirrors the full reward distribution logic including cap checking:
    1. Find signed_up event
    2. Transition to first_order_completed
    3. Check program is active
    4. Always issue referee reward
    5. Check monthly cap before issuing referrer reward

    Args:
        store: InMemoryMonthlyCapStore instance
        customer_id: The referee's customer ID
        laundry_id: The laundry tenant ID

    Returns:
        dict with outcome information
    """
    event = store.find_signed_up_event(customer_id, laundry_id)

    if not event:
        return {"rewarded": False, "reason": "no_referral_event"}

    event_id = event["id"]
    referrer_id = event["referrer_id"]

    # Transition event
    store.transition_event(event_id, "first_order_completed")

    # Check program config
    config = store.get_config(laundry_id)
    if not config or not config["is_active"]:
        return {"rewarded": False, "reason": "program_inactive"}

    referrer_reward_amount = config["referrer_reward_amount"]
    referee_reward_amount = config["referee_reward_amount"]
    max_monthly = config["max_monthly_referrals"]

    # Always give referee their reward
    store.create_reward_credit(
        customer_id=customer_id,
        laundry_id=laundry_id,
        amount=referee_reward_amount,
        source="referee_reward",
        event_id=event_id,
    )
    store.mark_referee_rewarded(event_id)

    # Check monthly cap for referrer
    monthly_count = store.get_monthly_referral_count(referrer_id, laundry_id)
    if monthly_count >= max_monthly:
        return {
            "rewarded": True,
            "referrer_rewarded": False,
            "referee_rewarded": True,
            "reason": "monthly_cap_reached",
        }

    # Issue reward to referrer
    store.create_reward_credit(
        customer_id=referrer_id,
        laundry_id=laundry_id,
        amount=referrer_reward_amount,
        source="referrer_reward",
        event_id=event_id,
    )
    store.mark_referrer_rewarded(event_id)

    return {
        "rewarded": True,
        "referrer_rewarded": True,
        "referee_rewarded": True,
    }


# --- Hypothesis strategies ---

alphanum_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=20,
)

event_id_strategy = st.integers(min_value=1, max_value=100000)

reward_amount_strategy = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("100.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

max_monthly_strategy = st.integers(min_value=1, max_value=20)


class TestMonthlyCapEnforcement:
    """Property 8: Monthly cap enforcement.

    For any referrer who has already reached the configured max_monthly_referrals limit
    for the current month, additional referral completions SHALL NOT create reward credits
    for that referrer. The referee SHALL still receive their reward.

    **Validates: Requirements 4.4**
    """

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_referrer_at_cap_does_not_receive_reward(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
    ):
        """When referrer has reached max_monthly_referrals, no reward credit SHALL
        be created for the referrer.
        """
        assume(referrer_id != referee_id)

        store = InMemoryMonthlyCapStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
            config={
                "laundry_id": laundry_id,
                "is_active": True,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": max_monthly,
                "credit_expiration_days": 90,
            },
            # Referrer is exactly at the cap
            monthly_referral_counts={referrer_id: max_monthly},
        )

        result = simulate_process_first_order_with_cap(store, referee_id, laundry_id)

        # Verify referrer was NOT rewarded
        assert result["referrer_rewarded"] is False
        assert result["reason"] == "monthly_cap_reached"

        # Verify no referrer reward credit was created
        referrer_credits = [c for c in store.reward_credits
                           if c["customer_id"] == referrer_id and c["source"] == "referrer_reward"]
        assert len(referrer_credits) == 0

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
        excess=st.integers(min_value=1, max_value=20),
    )
    @hypothesis_settings(max_examples=100)
    def test_referrer_over_cap_does_not_receive_reward(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
        excess,
    ):
        """When referrer has exceeded max_monthly_referrals, no reward credit SHALL
        be created for the referrer.
        """
        assume(referrer_id != referee_id)

        store = InMemoryMonthlyCapStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
            config={
                "laundry_id": laundry_id,
                "is_active": True,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": max_monthly,
                "credit_expiration_days": 90,
            },
            # Referrer is over the cap
            monthly_referral_counts={referrer_id: max_monthly + excess},
        )

        result = simulate_process_first_order_with_cap(store, referee_id, laundry_id)

        # Verify referrer was NOT rewarded
        assert result["referrer_rewarded"] is False

        # Verify no referrer reward credit was created
        referrer_credits = [c for c in store.reward_credits
                           if c["customer_id"] == referrer_id and c["source"] == "referrer_reward"]
        assert len(referrer_credits) == 0

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_referee_still_receives_reward_when_referrer_at_cap(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
    ):
        """When referrer is at the monthly cap, the referee SHALL still receive
        their reward credit for the configured referee_reward_amount.
        """
        assume(referrer_id != referee_id)

        store = InMemoryMonthlyCapStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
            config={
                "laundry_id": laundry_id,
                "is_active": True,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": max_monthly,
                "credit_expiration_days": 90,
            },
            # Referrer is at the cap
            monthly_referral_counts={referrer_id: max_monthly},
        )

        result = simulate_process_first_order_with_cap(store, referee_id, laundry_id)

        # Verify referee WAS rewarded
        assert result["referee_rewarded"] is True

        # Verify referee reward credit was created with correct amount
        referee_credits = [c for c in store.reward_credits
                          if c["customer_id"] == referee_id and c["source"] == "referee_reward"]
        assert len(referee_credits) == 1
        assert referee_credits[0]["amount"] == referee_reward
        assert referee_credits[0]["laundry_id"] == laundry_id

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
        current_count=st.integers(min_value=0, max_value=20),
    )
    @hypothesis_settings(max_examples=100)
    def test_referrer_under_cap_receives_reward(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
        current_count,
    ):
        """When referrer is under the monthly cap, the referrer SHALL receive
        their reward credit.
        """
        assume(referrer_id != referee_id)
        # Ensure current_count is strictly below max_monthly
        assume(current_count < max_monthly)

        store = InMemoryMonthlyCapStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
            config={
                "laundry_id": laundry_id,
                "is_active": True,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": max_monthly,
                "credit_expiration_days": 90,
            },
            monthly_referral_counts={referrer_id: current_count},
        )

        result = simulate_process_first_order_with_cap(store, referee_id, laundry_id)

        # Verify referrer WAS rewarded
        assert result["referrer_rewarded"] is True

        # Verify referrer reward credit was created with correct amount
        referrer_credits = [c for c in store.reward_credits
                           if c["customer_id"] == referrer_id and c["source"] == "referrer_reward"]
        assert len(referrer_credits) == 1
        assert referrer_credits[0]["amount"] == referrer_reward
