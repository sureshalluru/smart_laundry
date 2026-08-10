"""
Property-based tests for inactive program reward deferral.

Feature: referral-community, Property 10: Inactive program defers rewards

**Validates: Requirements 3.5, 5.5**

For any referral event reaching "first_order_completed" while the program is inactive,
no reward credits SHALL be issued. The event SHALL still be tracked with correct status.
"""
from decimal import Decimal

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating inactive program behavior ---


class InMemoryInactiveProgramStore:
    """In-memory store for testing inactive program reward deferral."""

    def __init__(self, events=None, config=None):
        """
        Args:
            events: list of referral event dicts
            config: program config dict (with is_active=False for this test)
        """
        self.events = events or []
        self.config = config
        self.reward_credits = []

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

    def get_config(self, laundry_id):
        """Get the referral program config."""
        if self.config and self.config.get("laundry_id") == laundry_id:
            return self.config
        return None


def simulate_process_first_order_inactive_program(store, customer_id, laundry_id):
    """Simulate process_first_order_reward when program may be inactive.

    This mirrors the logic in referral_service.py:
    1. Find signed_up event
    2. Transition to first_order_completed (always, regardless of program status)
    3. Check if program is active
    4. If inactive: return without issuing rewards
    5. If active: issue rewards (not the focus of this test)

    Args:
        store: InMemoryInactiveProgramStore instance
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

    # Transition event status (this happens REGARDLESS of program status)
    store.transition_event(event_id, "first_order_completed")

    # Check program config
    config = store.get_config(laundry_id)
    if not config or not config["is_active"]:
        # Program inactive — event status was updated but no rewards issued
        return {"rewarded": False, "reason": "program_inactive"}

    # If we get here, program is active — issue rewards
    referee_reward_amount = config["referee_reward_amount"]
    referrer_reward_amount = config["referrer_reward_amount"]

    store.create_reward_credit(
        customer_id=customer_id,
        laundry_id=laundry_id,
        amount=referee_reward_amount,
        source="referee_reward",
        event_id=event_id,
    )
    store.mark_referee_rewarded(event_id)

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


class TestInactiveProgramDefersRewards:
    """Property 10: Inactive program defers rewards.

    For any referral event reaching "first_order_completed" while the program is inactive,
    no reward credits SHALL be issued. The event SHALL still be tracked with correct status.

    **Validates: Requirements 3.5, 5.5**
    """

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_credits_issued_when_program_inactive(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
    ):
        """When program is inactive, no reward credits SHALL be issued to either party."""
        assume(referrer_id != referee_id)

        store = InMemoryInactiveProgramStore(
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
                "is_active": False,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": 10,
                "credit_expiration_days": 90,
            },
        )

        result = simulate_process_first_order_inactive_program(store, referee_id, laundry_id)

        # Verify no rewards were issued
        assert result["rewarded"] is False
        assert result["reason"] == "program_inactive"

        # Verify zero reward credits created
        assert len(store.reward_credits) == 0

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_event_status_still_transitions_when_program_inactive(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
    ):
        """Even when program is inactive, the event status SHALL transition to
        'first_order_completed' — tracking continues regardless of reward distribution.
        """
        assume(referrer_id != referee_id)

        store = InMemoryInactiveProgramStore(
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
                "is_active": False,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": 10,
                "credit_expiration_days": 90,
            },
        )

        simulate_process_first_order_inactive_program(store, referee_id, laundry_id)

        # Verify the event status was updated to 'first_order_completed'
        event = store.events[0]
        assert event["status"] == "first_order_completed"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_credits_when_no_config_exists(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
    ):
        """When no program config exists for the laundry (treated as inactive),
        no reward credits SHALL be issued but event status SHALL still transition.
        """
        assume(referrer_id != referee_id)

        store = InMemoryInactiveProgramStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
            config=None,  # No config exists
        )

        result = simulate_process_first_order_inactive_program(store, referee_id, laundry_id)

        # Verify no rewards were issued
        assert result["rewarded"] is False
        assert result["reason"] == "program_inactive"

        # Verify zero reward credits created
        assert len(store.reward_credits) == 0

        # Verify event status still transitioned
        event = store.events[0]
        assert event["status"] == "first_order_completed"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        referrer_reward=reward_amount_strategy,
        referee_reward=reward_amount_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_referrer_rewarded_flag_stays_false_when_inactive(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
        referrer_reward,
        referee_reward,
    ):
        """When program is inactive, referrer_rewarded and referee_rewarded flags
        SHALL remain False on the event.
        """
        assume(referrer_id != referee_id)

        store = InMemoryInactiveProgramStore(
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
                "is_active": False,
                "referrer_reward_amount": referrer_reward,
                "referee_reward_amount": referee_reward,
                "max_monthly_referrals": 10,
                "credit_expiration_days": 90,
            },
        )

        simulate_process_first_order_inactive_program(store, referee_id, laundry_id)

        # Verify reward flags remain False
        event = store.events[0]
        assert event["referrer_rewarded"] is False
        assert event["referee_rewarded"] is False
