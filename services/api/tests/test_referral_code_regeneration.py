"""
Property-based tests for referral code regeneration.

Feature: referral-community, Property 2: Code regeneration invalidates previous code

Validates: Requirements 1.3
"""
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

from app.services.referral_service import (
    generate_referral_code,
    CLEAN_ALPHABET,
)


# --- In-memory database fake for referral_codes ---

class FakeReferralCodeStore:
    """In-memory store simulating shop.referral_codes table."""

    def __init__(self):
        self._rows = []
        self._next_id = 1

    def insert(self, customer_id, laundry_id, code, is_active=True):
        """Insert a referral code row. Raises if unique constraint violated."""
        # Check unique constraint: (laundry_id, code)
        for row in self._rows:
            if row["laundry_id"] == laundry_id and row["code"] == code:
                raise Exception("unique constraint violation: duplicate key")
        row = {
            "id": self._next_id,
            "customer_id": customer_id,
            "laundry_id": laundry_id,
            "code": code,
            "is_active": is_active,
        }
        self._next_id += 1
        self._rows.append(row)
        return row

    def deactivate(self, customer_id, laundry_id):
        """Set is_active=FALSE for all active codes of this customer/laundry."""
        for row in self._rows:
            if (
                row["customer_id"] == customer_id
                and row["laundry_id"] == laundry_id
                and row["is_active"]
            ):
                row["is_active"] = False

    def get_active_codes(self, customer_id, laundry_id):
        """Return all active codes for a customer/laundry pair."""
        return [
            row
            for row in self._rows
            if row["customer_id"] == customer_id
            and row["laundry_id"] == laundry_id
            and row["is_active"]
        ]

    def get_all_codes(self, customer_id, laundry_id):
        """Return all codes (active and inactive) for a customer/laundry pair."""
        return [
            row
            for row in self._rows
            if row["customer_id"] == customer_id
            and row["laundry_id"] == laundry_id
        ]


class FakeCursor:
    """Fake cursor that routes SQL operations to the in-memory store."""

    def __init__(self, store: FakeReferralCodeStore):
        self._store = store
        self._last_result = None

    def execute(self, sql, params=None):
        sql_lower = sql.strip().lower()
        if sql_lower.startswith("insert into shop.referral_codes"):
            # params: (customer_id, laundry_id, code)
            customer_id, laundry_id, code = params
            self._store.insert(customer_id, laundry_id, code, is_active=True)
        elif sql_lower.startswith("update shop.referral_codes"):
            # params: (customer_id, laundry_id)
            customer_id, laundry_id = params
            self._store.deactivate(customer_id, laundry_id)
        else:
            pass  # Ignore other queries in this test context

    def fetchone(self):
        return self._last_result


class FakeConnection:
    """Fake connection wrapping the store."""

    def __init__(self, store: FakeReferralCodeStore):
        self._store = store

    def cursor(self, row_factory=None):
        return FakeCursor(self._store)

    def commit(self):
        pass

    def rollback(self):
        pass


@contextmanager
def fake_get_db(store: FakeReferralCodeStore):
    """Context manager that yields a fake connection backed by the store."""
    yield FakeConnection(store)


# --- Hypothesis strategies ---

# Generate customer IDs as non-empty strings of alphanumeric chars
customer_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=20,
)

# Generate laundry IDs as non-empty digit strings (matching typical IDs)
laundry_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Nd",)),
    min_size=1,
    max_size=10,
)


class TestCodeRegenerationProperty:
    """Property 2: Code regeneration invalidates previous code.

    For any customer with an active referral code, requesting a new code SHALL
    result in the old code being marked inactive and a new active code existing —
    the customer SHALL have exactly one active code at any time.

    **Validates: Requirements 1.3**
    """

    @given(
        customer_id=customer_id_strategy,
        laundry_id=laundry_id_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_old_code_is_inactive_after_regeneration(
        self, customer_id: str, laundry_id: str
    ):
        """After regeneration, the old code is marked inactive."""
        store = FakeReferralCodeStore()

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(store),
        ):
            # Create initial code
            from app.services.referral_service import (
                create_referral_code_for_customer,
                regenerate_code,
            )

            old_code = create_referral_code_for_customer(customer_id, laundry_id)

            # Verify initial code is active
            active_before = store.get_active_codes(customer_id, laundry_id)
            assert len(active_before) == 1
            assert active_before[0]["code"] == old_code

            # Regenerate
            new_code = regenerate_code(customer_id, laundry_id)

            # Verify old code is now inactive
            all_codes = store.get_all_codes(customer_id, laundry_id)
            old_code_rows = [r for r in all_codes if r["code"] == old_code]
            assert len(old_code_rows) == 1
            assert old_code_rows[0]["is_active"] is False, (
                f"Old code '{old_code}' should be inactive after regeneration"
            )

    @given(
        customer_id=customer_id_strategy,
        laundry_id=laundry_id_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_exactly_one_active_code_after_regeneration(
        self, customer_id: str, laundry_id: str
    ):
        """After regeneration, exactly one active code exists for the customer."""
        store = FakeReferralCodeStore()

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(store),
        ):
            from app.services.referral_service import (
                create_referral_code_for_customer,
                regenerate_code,
            )

            # Create initial code
            create_referral_code_for_customer(customer_id, laundry_id)

            # Regenerate
            regenerate_code(customer_id, laundry_id)

            # Verify exactly one active code
            active_codes = store.get_active_codes(customer_id, laundry_id)
            assert len(active_codes) == 1, (
                f"Expected exactly 1 active code after regeneration, "
                f"found {len(active_codes)}"
            )

    @given(
        customer_id=customer_id_strategy,
        laundry_id=laundry_id_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_new_code_is_different_from_old_code(
        self, customer_id: str, laundry_id: str
    ):
        """After regeneration, the new code is different from the old code."""
        store = FakeReferralCodeStore()

        with patch(
            "app.services.referral_service.get_db",
            side_effect=lambda: fake_get_db(store),
        ):
            from app.services.referral_service import (
                create_referral_code_for_customer,
                regenerate_code,
            )

            # Create initial code
            old_code = create_referral_code_for_customer(customer_id, laundry_id)

            # Regenerate
            new_code = regenerate_code(customer_id, laundry_id)

            # The new code should be different from the old one
            # Note: With a 6-char code from 31-char alphabet, collision probability
            # is ~1 in 887 million. Hypothesis would need extraordinary luck to
            # generate matching secrets. We assert they differ.
            assert new_code != old_code, (
                f"New code '{new_code}' should differ from old code '{old_code}'"
            )

            # Verify the new code is the active one
            active_codes = store.get_active_codes(customer_id, laundry_id)
            assert len(active_codes) == 1
            assert active_codes[0]["code"] == new_code
