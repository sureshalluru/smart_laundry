"""
Property-based tests for reward distribution on referral completion.

Feature: referral-community, Property 7: Reward distribution issues correct amounts to both parties

**Validates: Requirements 4.1, 4.2**

For any referral event transitioning to "first_order_completed" while the referral
program is active, a reward credit SHALL be created for the referrer equal to the
configured referrer_reward_amount AND for the referee equal to the configured
referee_reward_amount.
"""
from decimal import Decimal

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating reward distribution logic ---


class InMemoryRewardStore:
    """In-memory store simulating referral_events, referral_program_config, and reward_credits."""

    def __init__(self, events=None, config=None):
        """
        Args:
            events: list of dicts with keys: id, laundry_id, referrer_id, referee_id,
                    status, referrer_rewarded, referee_rewarded
            config: dict with keys: laundry_id, is_active, referrer_reward_amount,
                    referee_reward_amount, max_monthly_referrals, credit_expiration_days
        """
        self.events = events or []
        self.config = config
        self.reward_credits = []
        self.monthly_referral_counts = {}  # {referrer_id: count}

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
                return True
        return False

    def mark_referrer_rewarded(self, event_id):
        """Mark the event's referrer_rewarded as True."""
        for event in self.events:
            if event["id"] == event_id:
                event["referrer_rewarded"] = True

    def mark_referee_rewarded(self, event_id):
        """Mark the event's referee_rewarded as True."""
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
        """Get number of rewarded referrals this month for a referrer."""
        return self.monthly_referral_counts.get(referrer_id, 0)

    def get_config(self, laundry_id):
        """Get the referral program config for a laundry."""
        if self.config and self.config.get("laundry_id") == laundry_id:
            return self.config
        return None


def simulate_process_first_order_reward(store, customer_id, laundry_id):
    """Simulate the reward distribution part of process_first_order_reward.

    This mirrors the logic in referral_service.py:
    1. Find signed_up event for this referee
    2. Transition to first_order_completed
    3. Check if program is active
    4. Issue reward to referee (always when program active)
    5. Check monthly cap, issue reward to referrer if under cap

    Args:
        store: InMemoryRewardStore instance
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

# Reward amounts: between $1.00 and $100.00
reward_amount_strategy = st.decimals(
    min_value=Decimal("1.00"),
    max_value=Decimal("100.00"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

max_monthly_strategy = st.integers(min_value=1, max_value=50)

expiration_days_strategy = st.integers(min_value=7, max_value=365)


class TestRewardDistribution:
    """Property 7: Reward distribution issues correct amounts to both parties.

    For any referral event transitioning to "first_order_completed" while the referral
    program is active, a reward credit SHALL be created for the referrer equal to the
    configured referrer_reward_amount AND for the referee equal to the configured
    referee_reward_amount.

    **Validates: Requirements 4.1, 4.2**
    """

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
        expiration_days=expiration_days_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_both_parties_receive_correct_reward_amounts(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
        expiration_days,
    ):
        """When program is active and referrer is under monthly cap, both parties
        SHALL receive reward credits equal to the configured amounts.
        """
        assume(referrer_id != referee_id)

        store = InMemoryRewardStore(
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
                "credit_expiration_days": expiration_days,
            },
        )

        result = simulate_process_first_order_reward(store, referee_id, laundry_id)

        # Verify both were rewarded
        assert result["rewarded"] is True
        assert result["referrer_rewarded"] is True
        assert result["referee_rewarded"] is True

        # Verify exactly 2 credits were created
        assert len(store.reward_credits) == 2

        # Find the referee's credit
        referee_credits = [c for c in store.reward_credits
                          if c["customer_id"] == referee_id and c["source"] == "referee_reward"]
        assert len(referee_credits) == 1
        assert referee_credits[0]["amount"] == referee_reward
        assert referee_credits[0]["laundry_id"] == laundry_id
        assert referee_credits[0]["referral_event_id"] == event_id

        # Find the referrer's credit
        referrer_credits = [c for c in store.reward_credits
                           if c["customer_id"] == referrer_id and c["source"] == "referrer_reward"]
        assert len(referrer_credits) == 1
        assert referrer_credits[0]["amount"] == referrer_reward
        assert referrer_credits[0]["laundry_id"] == laundry_id
        assert referrer_credits[0]["referral_event_id"] == event_id

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        max_monthly=max_monthly_strategy,
        expiration_days=expiration_days_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_referee_always_gets_configured_amount(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        max_monthly,
        expiration_days,
    ):
        """The referee's reward credit SHALL always equal the configured referee_reward_amount
        when the program is active (regardless of referrer's cap status).
        """
        assume(referrer_id != referee_id)

        store = InMemoryRewardStore(
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
                "credit_expiration_days": expiration_days,
            },
        )

        simulate_process_first_order_reward(store, referee_id, laundry_id)

        # Referee should always get their configured reward amount
        referee_credits = [c for c in store.reward_credits
                          if c["customer_id"] == referee_id and c["source"] == "referee_reward"]
        assert len(referee_credits) == 1
        assert referee_credits[0]["amount"] == referee_reward
        assert referee_credits[0]["status"] == "active"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
        expiration_days=expiration_days_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_referrer_gets_configured_amount_when_under_cap(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
        expiration_days,
    ):
        """The referrer's reward credit SHALL equal the configured referrer_reward_amount
        when under the monthly cap.
        """
        assume(referrer_id != referee_id)

        # Set a high cap so referrer is definitely under it
        store = InMemoryRewardStore(
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
                "max_monthly_referrals": 50,
                "credit_expiration_days": expiration_days,
            },
        )
        # Referrer has 0 monthly referrals (under cap)
        store.monthly_referral_counts[referrer_id] = 0

        simulate_process_first_order_reward(store, referee_id, laundry_id)

        # Referrer should get their configured reward amount
        referrer_credits = [c for c in store.reward_credits
                           if c["customer_id"] == referrer_id and c["source"] == "referrer_reward"]
        assert len(referrer_credits) == 1
        assert referrer_credits[0]["amount"] == referrer_reward
        assert referrer_credits[0]["status"] == "active"
