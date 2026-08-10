"""
Property-based tests for referral event state transition on first order completion.

Feature: referral-community, Property 6: Event state transition on first order completion

**Validates: Requirements 3.2**

For any referral event with status "signed_up", when the referee's first paid order
completes, the event status SHALL transition to "first_order_completed". Events already
in "first_order_completed" or "rewarded" status SHALL not transition again.
"""
from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating the referral event state machine ---


class InMemoryEventTransitionStore:
    """In-memory store simulating referral_events and referral_program_config tables."""

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


def simulate_first_order_event_transition(store, customer_id, laundry_id):
    """Simulate the event state transition part of process_first_order_reward.

    This extracts ONLY the state transition logic:
    1. Look for a referral_event with status 'signed_up' for this customer as referee
    2. If found, transition to 'first_order_completed'
    3. If event is already in 'first_order_completed' or 'rewarded', do nothing

    Args:
        store: InMemoryEventTransitionStore instance
        customer_id: The referee's customer ID
        laundry_id: The laundry tenant ID

    Returns:
        dict with:
        - {"transitioned": True, "event_id": <id>, "new_status": "first_order_completed"}
        - {"transitioned": False, "reason": "no_signed_up_event"}
    """
    event = store.find_signed_up_event(customer_id, laundry_id)

    if not event:
        # No event with status 'signed_up' — either no event exists,
        # or event is already in a later state
        return {"transitioned": False, "reason": "no_signed_up_event"}

    # Transition to 'first_order_completed'
    store.transition_event(event["id"], "first_order_completed")

    return {
        "transitioned": True,
        "event_id": event["id"],
        "new_status": "first_order_completed",
    }


# --- Hypothesis strategies ---

alphanum_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=20,
)

event_id_strategy = st.integers(min_value=1, max_value=100000)


class TestEventStateTransition:
    """Property 6: Event state transition on first order completion.

    For any referral event with status "signed_up", when the referee's first paid order
    completes, the event status SHALL transition to "first_order_completed". Events
    already in "first_order_completed" or "rewarded" status SHALL not transition again.

    **Validates: Requirements 3.2**
    """

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_signed_up_event_transitions_to_first_order_completed(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
    ):
        """When a referee completes their first order and event is 'signed_up',
        the event status SHALL transition to 'first_order_completed'.
        """
        assume(referrer_id != referee_id)

        store = InMemoryEventTransitionStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
        )

        result = simulate_first_order_event_transition(store, referee_id, laundry_id)

        # Verify transition occurred
        assert result["transitioned"] is True
        assert result["new_status"] == "first_order_completed"

        # Verify the event in the store was updated
        event = store.events[0]
        assert event["status"] == "first_order_completed"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_first_order_completed_event_does_not_transition_again(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
    ):
        """Events already in 'first_order_completed' status SHALL NOT transition again."""
        assume(referrer_id != referee_id)

        store = InMemoryEventTransitionStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "first_order_completed",
                "referrer_rewarded": True,
                "referee_rewarded": True,
            }],
        )

        result = simulate_first_order_event_transition(store, referee_id, laundry_id)

        # Verify NO transition occurred
        assert result["transitioned"] is False
        assert result["reason"] == "no_signed_up_event"

        # Verify event status unchanged
        event = store.events[0]
        assert event["status"] == "first_order_completed"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_rewarded_event_does_not_transition_again(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
    ):
        """Events already in 'rewarded' status SHALL NOT transition again."""
        assume(referrer_id != referee_id)

        store = InMemoryEventTransitionStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "rewarded",
                "referrer_rewarded": True,
                "referee_rewarded": True,
            }],
        )

        result = simulate_first_order_event_transition(store, referee_id, laundry_id)

        # Verify NO transition occurred
        assert result["transitioned"] is False
        assert result["reason"] == "no_signed_up_event"

        # Verify event status unchanged
        event = store.events[0]
        assert event["status"] == "rewarded"

    @given(
        event_id=event_id_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_second_order_does_not_retrigger_transition(
        self,
        event_id,
        laundry_id,
        referrer_id,
        referee_id,
    ):
        """Calling the transition function a second time after the first order
        SHALL NOT modify an already-transitioned event.
        """
        assume(referrer_id != referee_id)

        store = InMemoryEventTransitionStore(
            events=[{
                "id": event_id,
                "laundry_id": laundry_id,
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "status": "signed_up",
                "referrer_rewarded": False,
                "referee_rewarded": False,
            }],
        )

        # First order — should transition
        result1 = simulate_first_order_event_transition(store, referee_id, laundry_id)
        assert result1["transitioned"] is True
        assert store.events[0]["status"] == "first_order_completed"

        # Second order — should NOT transition again
        result2 = simulate_first_order_event_transition(store, referee_id, laundry_id)
        assert result2["transitioned"] is False
        assert result2["reason"] == "no_signed_up_event"

        # Status remains unchanged
        assert store.events[0]["status"] == "first_order_completed"
