"""
Property-based tests for referral code validation correctness.

Feature: referral-community, Property 4: Code validation correctness

Validates: Requirements 3.3, 3.4, 10.2
"""
from unittest.mock import patch
from contextlib import contextmanager

from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st

from app.services.referral_service import validate_referral_code


# --- In-memory database fake for validation queries ---


class FakeCursor:
    """Fake cursor that simulates SELECT queries used by validate_referral_code.

    The function executes two queries:
    1. SELECT rc.customer_id FROM shop.referral_codes WHERE code=%s AND laundry_id=%s AND is_active=TRUE
    2. SELECT first_name, phone_number, email FROM customers.customers WHERE customer_id=%s AND laundry_id=%s
    """

    def __init__(self, referral_codes, customers):
        """
        Args:
            referral_codes: list of dicts with keys: code, laundry_id, customer_id, is_active
            customers: list of dicts with keys: customer_id, laundry_id, first_name, phone_number, email
        """
        self._referral_codes = referral_codes
        self._customers = customers
        self._last_result = None

    def execute(self, sql, params=None):
        sql_lower = sql.strip().lower()
        if "shop.referral_codes" in sql_lower:
            # Query 1: look up code by code + laundry_id + is_active=TRUE
            code, laundry_id = params
            match = None
            for row in self._referral_codes:
                if (row["code"] == code and
                        row["laundry_id"] == laundry_id and
                        row["is_active"]):
                    match = row
                    break
            if match:
                self._last_result = {"customer_id": match["customer_id"]}
            else:
                self._last_result = None
        elif "customers.customers" in sql_lower:
            # Query 2: look up customer by customer_id + laundry_id
            customer_id, laundry_id = params
            match = None
            for row in self._customers:
                if (row["customer_id"] == customer_id and
                        row["laundry_id"] == laundry_id):
                    match = row
                    break
            if match:
                self._last_result = {
                    "first_name": match["first_name"],
                    "phone_number": match["phone_number"],
                    "email": match["email"],
                }
            else:
                self._last_result = None
        else:
            self._last_result = None

    def fetchone(self):
        return self._last_result


class FakeConnection:
    """Fake connection wrapping the fake cursor."""

    def __init__(self, referral_codes, customers):
        self._referral_codes = referral_codes
        self._customers = customers

    def cursor(self, row_factory=None):
        return FakeCursor(self._referral_codes, self._customers)

    def commit(self):
        pass

    def rollback(self):
        pass


@contextmanager
def fake_get_db(referral_codes, customers):
    """Context manager that yields a fake connection backed by provided data."""
    yield FakeConnection(referral_codes, customers)


# --- Hypothesis strategies ---

# Non-empty alphanumeric strings for IDs and codes
alphanum_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=20,
)

# Phone numbers: non-empty strings starting with +
phone_strategy = st.from_regex(r"\+\d{10,15}", fullmatch=True)

# Email strategy: simple valid-looking emails
email_strategy = st.from_regex(
    r"[a-z][a-z0-9]{0,10}@[a-z]{2,8}\.[a-z]{2,4}", fullmatch=True
)

# First names
first_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu")),
    min_size=1,
    max_size=15,
)


class TestCodeValidationCorrectness:
    """Property 4: Code validation correctness.

    For any referral code input and laundry context, the validation function SHALL
    return valid=true if and only if the code exists, is active, and belongs to the
    specified laundry. It SHALL return valid=false with reason "self_referral" if the
    code owner's phone or email matches the registering user. It SHALL return
    valid=false with reason "code_not_found" for any code not in the system.

    **Validates: Requirements 3.3, 3.4, 10.2**
    """

    @given(
        code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        customer_id=alphanum_strategy,
        first_name=first_name_strategy,
        referrer_phone=phone_strategy,
        referrer_email=email_strategy,
        registering_phone=phone_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_valid_code_returns_valid_true(
        self,
        code,
        laundry_id,
        customer_id,
        first_name,
        referrer_phone,
        referrer_email,
        registering_phone,
        registering_email,
    ):
        """Valid code returns {"valid": True, "referrerFirstName": <name>}.

        When the code exists, is active, belongs to the laundry, and the
        registering user is not the code owner, validation returns valid=True.
        """
        # Ensure no self-referral: phone and email must differ
        assume(registering_phone != referrer_phone)
        assume(registering_email.lower() != referrer_email.lower())

        referral_codes = [
            {
                "code": code,
                "laundry_id": laundry_id,
                "customer_id": customer_id,
                "is_active": True,
            }
        ]
        customers = [
            {
                "customer_id": customer_id,
                "laundry_id": laundry_id,
                "first_name": first_name,
                "phone_number": referrer_phone,
                "email": referrer_email,
            }
        ]

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(referral_codes, customers),
        ):
            result = validate_referral_code(
                code, laundry_id, registering_phone, registering_email
            )

        assert result["valid"] is True
        assert result["referrerFirstName"] == first_name

    @given(
        code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        registering_phone=phone_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_nonexistent_code_returns_code_not_found(
        self,
        code,
        laundry_id,
        registering_phone,
        registering_email,
    ):
        """Non-existent code returns {"valid": False, "reason": "code_not_found"}.

        When the code does not exist in the system for the given laundry,
        validation returns code_not_found.
        """
        # Empty store — no referral codes exist
        referral_codes = []
        customers = []

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(referral_codes, customers),
        ):
            result = validate_referral_code(
                code, laundry_id, registering_phone, registering_email
            )

        assert result["valid"] is False
        assert result["reason"] == "code_not_found"

    @given(
        code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        customer_id=alphanum_strategy,
        first_name=first_name_strategy,
        shared_phone=phone_strategy,
        referrer_email=email_strategy,
        registering_email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_self_referral_phone_match_returns_self_referral(
        self,
        code,
        laundry_id,
        customer_id,
        first_name,
        shared_phone,
        referrer_email,
        registering_email,
    ):
        """Self-referral (phone match) returns {"valid": False, "reason": "self_referral"}.

        When the registering user's phone matches the code owner's phone,
        validation returns self_referral.
        """
        # Ensure email doesn't also match (we're testing phone match specifically)
        assume(registering_email.lower() != referrer_email.lower())

        referral_codes = [
            {
                "code": code,
                "laundry_id": laundry_id,
                "customer_id": customer_id,
                "is_active": True,
            }
        ]
        customers = [
            {
                "customer_id": customer_id,
                "laundry_id": laundry_id,
                "first_name": first_name,
                "phone_number": shared_phone,
                "email": referrer_email,
            }
        ]

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(referral_codes, customers),
        ):
            # Use the SAME phone number as the referrer
            result = validate_referral_code(
                code, laundry_id, shared_phone, registering_email
            )

        assert result["valid"] is False
        assert result["reason"] == "self_referral"

    @given(
        code=alphanum_strategy,
        laundry_id=alphanum_strategy,
        customer_id=alphanum_strategy,
        first_name=first_name_strategy,
        referrer_phone=phone_strategy,
        shared_email=email_strategy,
        registering_phone=phone_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_self_referral_email_match_returns_self_referral(
        self,
        code,
        laundry_id,
        customer_id,
        first_name,
        referrer_phone,
        shared_email,
        registering_phone,
    ):
        """Self-referral (email match) returns {"valid": False, "reason": "self_referral"}.

        When the registering user's email matches the code owner's email (case-insensitive),
        validation returns self_referral.
        """
        # Ensure phone doesn't also match (we're testing email match specifically)
        assume(registering_phone != referrer_phone)

        referral_codes = [
            {
                "code": code,
                "laundry_id": laundry_id,
                "customer_id": customer_id,
                "is_active": True,
            }
        ]
        customers = [
            {
                "customer_id": customer_id,
                "laundry_id": laundry_id,
                "first_name": first_name,
                "phone_number": referrer_phone,
                "email": shared_email,
            }
        ]

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(referral_codes, customers),
        ):
            # Use the SAME email as the referrer
            result = validate_referral_code(
                code, laundry_id, registering_phone, shared_email
            )

        assert result["valid"] is False
        assert result["reason"] == "self_referral"
