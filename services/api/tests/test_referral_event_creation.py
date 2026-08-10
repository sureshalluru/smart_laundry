"""
Property-based tests for referral event creation on valid registration.

Feature: referral-community, Property 5: Referral event creation on valid registration

**Validates: Requirements 3.1**

For any valid referral code used during registration, a referral event SHALL be created
linking the correct referrer and referee with status "signed_up", and no event SHALL be
created for invalid or missing codes.
"""
from unittest.mock import patch
from contextlib import contextmanager

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- Simulate the registration referral logic ---
# We extract the core logic from the registration flow (auth.py) into a testable
# function that mirrors what the actual endpoint does:
# 1. If referralCode is provided, validate it
# 2. If valid, look up code record and create a referral event
# 3. If invalid or missing, no event is created


class InMemoryReferralStore:
    """In-memory store simulating the referral codes and events tables."""

    def __init__(self, referral_codes=None, customers=None):
        """
        Args:
            referral_codes: list of dicts with keys: id, code, laundry_id, customer_id, is_active
            customers: list of dicts with keys: customer_id, laundry_id, first_name, phone_number, email
        """
        self.referral_codes = referral_codes or []
        self.customers = customers or []
        self.referral_events = []  # created events go here

    def lookup_code(self, code, laundry_id):
        """Look up a referral code record (active, matching laundry)."""
        for row in self.referral_codes:
            if (row["code"] == code and
                    row["laundry_id"] == laundry_id and
                    row["is_active"]):
                return row
        return None

    def lookup_customer(self, customer_id, laundry_id):
        """Look up a customer record."""
        for row in self.customers:
            if (row["customer_id"] == customer_id and
                    row["laundry_id"] == laundry_id):
                return row
        return None

    def create_referral_event(self, laundry_id, referrer_id, referee_id, referral_code_id, status):
        """Insert a referral event (mimics INSERT ON CONFLICT DO NOTHING)."""
        # Check uniqueness: (laundry_id, referee_id)
        for ev in self.referral_events:
            if ev["laundry_id"] == laundry_id and ev["referee_id"] == referee_id:
                return  # conflict — do nothing
        self.referral_events.append({
            "laundry_id": laundry_id,
            "referrer_id": referrer_id,
            "referee_id": referee_id,
            "referral_code_id": referral_code_id,
            "status": status,
        })


def simulate_registration_referral(
    store, referral_code, laundry_id, registering_phone, registering_email, new_customer_id
):
    """Simulate the referral handling that occurs during registration.

    This mirrors the logic in auth.py register endpoint:
    1. If referralCode is provided and laundry_id is set, validate the code
    2. If valid, look up code record to get referral_code_id and referrer_id
    3. Create a referral_event with status 'signed_up'
    4. If code is invalid/missing, do nothing
    """
    if not referral_code or not laundry_id:
        return  # No code or no laundry — nothing to do

    # Validate using the same logic as validate_referral_code
    code_row = store.lookup_code(referral_code, laundry_id)
    if not code_row:
        return  # Code not found — invalid

    referrer_customer_id = code_row["customer_id"]
    referrer = store.lookup_customer(referrer_customer_id, laundry_id)
    if not referrer:
        return  # Referrer not found — invalid

    # Self-referral check
    referrer_phone = referrer.get("phone_number") or ""
    referrer_email = referrer.get("email") or ""

    if (registering_phone and referrer_phone and registering_phone == referrer_phone):
        return  # Self-referral — no event
    if (registering_email and referrer_email and
            registering_email.lower() == referrer_email.lower()):
        return  # Self-referral — no event

    # Valid code — create the referral event
    store.create_referral_event(
        laundry_id=laundry_id,
        referrer_id=referrer_customer_id,
        referee_id=new_customer_id,
        referral_code_id=code_row["id"],
        status="signed_up",
    )


# --- Hypothesis strategies ---

alphanum_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=20,
)

phone_strategy = st.from_regex(r"\+\d{10,15}", fullmatch=True)

email_strategy = st.from_regex(
    r"[a-z][a-z0-9]{0,10}@[a-z]{2,8}\.[a-z]{2,4}", fullmatch=True
)

first_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
    min_size=1,
    max_size=15,
)

code_id_strategy = st.integers(min_value=1, max_value=100000)


class TestReferralEventCreation:
    """Property 5: Referral event creation on valid registration.

    For any valid referral code used during registration, a referral event SHALL be
    created linking the correct referrer and referee with status "signed_up", and no
    event SHALL be created for invalid or missing codes.

    **Validates: Requirements 3.1**
    """

    @given(
        code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        referrer_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        code_id=code_id_strategy,
        first_name=first_name_strategy,
        referrer_phone=phone_strategy,
        referrer_email=email_strategy,
        registering_phone=phone_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_valid_code_creates_event_with_correct_data(
        self,
        code,
        laundry_id,
        referrer_id,
        referee_id,
        code_id,
        first_name,
        referrer_phone,
        referrer_email,
        registering_phone,
        registering_email,
    ):
        """When a valid referral code is provided, a referral event is created with
        correct referrer_id, referee_id, and status "signed_up".
        """
        # Ensure no self-referral
        assume(registering_phone != referrer_phone)
        assume(registering_email.lower() != referrer_email.lower())
        # Ensure referrer and referee are distinct
        assume(referrer_id != referee_id)

        store = InMemoryReferralStore(
            referral_codes=[{
                "id": code_id,
                "code": code,
                "laundry_id": laundry_id,
                "customer_id": referrer_id,
                "is_active": True,
            }],
            customers=[{
                "customer_id": referrer_id,
                "laundry_id": laundry_id,
                "first_name": first_name,
                "phone_number": referrer_phone,
                "email": referrer_email,
            }],
        )

        simulate_registration_referral(
            store=store,
            referral_code=code,
            laundry_id=laundry_id,
            registering_phone=registering_phone,
            registering_email=registering_email,
            new_customer_id=referee_id,
        )

        # Verify event was created
        assert len(store.referral_events) == 1
        event = store.referral_events[0]
        assert event["referrer_id"] == referrer_id
        assert event["referee_id"] == referee_id
        assert event["laundry_id"] == laundry_id
        assert event["referral_code_id"] == code_id
        assert event["status"] == "signed_up"

    @given(
        invalid_code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        registering_phone=phone_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_invalid_code_creates_no_event(
        self,
        invalid_code,
        laundry_id,
        referee_id,
        registering_phone,
        registering_email,
    ):
        """When an invalid code is provided, no event is created."""
        # Store has no codes — any code provided will be invalid
        store = InMemoryReferralStore(
            referral_codes=[],
            customers=[],
        )

        simulate_registration_referral(
            store=store,
            referral_code=invalid_code,
            laundry_id=laundry_id,
            registering_phone=registering_phone,
            registering_email=registering_email,
            new_customer_id=referee_id,
        )

        # Verify no event was created
        assert len(store.referral_events) == 0

    @given(
        laundry_id=alphanum_strategy,
        referee_id=alphanum_strategy,
        registering_phone=phone_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_code_creates_no_event(
        self,
        laundry_id,
        referee_id,
        registering_phone,
        registering_email,
    ):
        """When no code is provided, no event is created."""
        store = InMemoryReferralStore(
            referral_codes=[{
                "id": 1,
                "code": "VALIDCODE",
                "laundry_id": laundry_id,
                "customer_id": "some_referrer",
                "is_active": True,
            }],
            customers=[{
                "customer_id": "some_referrer",
                "laundry_id": laundry_id,
                "first_name": "John",
                "phone_number": "+15551234567",
                "email": "john@example.com",
            }],
        )

        # Pass None/empty as referral_code
        simulate_registration_referral(
            store=store,
            referral_code=None,
            laundry_id=laundry_id,
            registering_phone=registering_phone,
            registering_email=registering_email,
            new_customer_id=referee_id,
        )

        assert len(store.referral_events) == 0

        # Also test with empty string
        simulate_registration_referral(
            store=store,
            referral_code="",
            laundry_id=laundry_id,
            registering_phone=registering_phone,
            registering_email=registering_email,
            new_customer_id=referee_id,
        )

        assert len(store.referral_events) == 0
