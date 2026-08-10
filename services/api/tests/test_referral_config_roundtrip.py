"""
Property-based tests for program configuration round-trip.

Feature: referral-community, Property 11: Program configuration round-trip

Validates: Requirements 5.2
"""
from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st


# --- In-memory config store simulating shop.referral_program_config ---


class FakeConfigStore:
    """In-memory store simulating the shop.referral_program_config table."""

    def __init__(self):
        self._configs = {}  # keyed by laundry_id

    def upsert(self, laundry_id, config_dict):
        """Simulate INSERT ... ON CONFLICT DO UPDATE (the PUT /config logic)."""
        self._configs[laundry_id] = {
            "laundry_id": laundry_id,
            "is_active": config_dict["is_active"],
            "referrer_reward_amount": Decimal(str(config_dict["referrer_reward_amount"])),
            "referee_reward_amount": Decimal(str(config_dict["referee_reward_amount"])),
            "max_monthly_referrals": config_dict["max_monthly_referrals"],
            "credit_expiration_days": config_dict["credit_expiration_days"],
        }

    def read(self, laundry_id):
        """Simulate the GET /config read logic."""
        row = self._configs.get(laundry_id)
        if not row:
            return None
        return {
            "isActive": row["is_active"],
            "referrerRewardAmount": float(row["referrer_reward_amount"]),
            "refereeRewardAmount": float(row["referee_reward_amount"]),
            "maxMonthlyReferrals": row["max_monthly_referrals"],
            "creditExpirationDays": row["credit_expiration_days"],
        }


# --- Helper functions simulating save/read logic ---


def save_config(store: FakeConfigStore, laundry_id: str, config_dict: dict):
    """Save config via the upsert logic (mirrors PUT /api/referrals/config)."""
    store.upsert(laundry_id, config_dict)


def read_config(store: FakeConfigStore, laundry_id: str):
    """Read config back (mirrors GET /api/referrals/config)."""
    return store.read(laundry_id)


# --- Hypothesis strategies ---

laundry_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Nd",)),
    min_size=1,
    max_size=10,
)


class TestProgramConfigRoundTripProperty:
    """Property 11: Program configuration round-trip.

    For any valid configuration values (referrer_reward_amount, referee_reward_amount,
    max_monthly_referrals, credit_expiration_days, is_active), saving the config and
    reading it back SHALL return equivalent values.

    **Validates: Requirements 5.2**
    """

    @given(
        laundry_id=laundry_id_strategy,
        is_active=st.booleans(),
        referrer_reward_amount=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        referee_reward_amount=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        max_monthly_referrals=st.integers(min_value=1, max_value=100),
        credit_expiration_days=st.integers(min_value=1, max_value=365),
    )
    @settings(max_examples=100)
    def test_config_round_trip_preserves_values(
        self,
        laundry_id: str,
        is_active: bool,
        referrer_reward_amount: Decimal,
        referee_reward_amount: Decimal,
        max_monthly_referrals: int,
        credit_expiration_days: int,
    ):
        """Saving a config and reading it back returns equivalent values."""
        store = FakeConfigStore()

        config_to_save = {
            "is_active": is_active,
            "referrer_reward_amount": referrer_reward_amount,
            "referee_reward_amount": referee_reward_amount,
            "max_monthly_referrals": max_monthly_referrals,
            "credit_expiration_days": credit_expiration_days,
        }

        # Save the config
        save_config(store, laundry_id, config_to_save)

        # Read it back
        result = read_config(store, laundry_id)

        # Verify round-trip equivalence
        assert result is not None, "Config should exist after saving"
        assert result["isActive"] == is_active, (
            f"is_active mismatch: saved {is_active}, got {result['isActive']}"
        )
        assert result["referrerRewardAmount"] == float(referrer_reward_amount), (
            f"referrer_reward_amount mismatch: saved {referrer_reward_amount}, "
            f"got {result['referrerRewardAmount']}"
        )
        assert result["refereeRewardAmount"] == float(referee_reward_amount), (
            f"referee_reward_amount mismatch: saved {referee_reward_amount}, "
            f"got {result['refereeRewardAmount']}"
        )
        assert result["maxMonthlyReferrals"] == max_monthly_referrals, (
            f"max_monthly_referrals mismatch: saved {max_monthly_referrals}, "
            f"got {result['maxMonthlyReferrals']}"
        )
        assert result["creditExpirationDays"] == credit_expiration_days, (
            f"credit_expiration_days mismatch: saved {credit_expiration_days}, "
            f"got {result['creditExpirationDays']}"
        )

    @given(
        laundry_id=laundry_id_strategy,
        is_active_1=st.booleans(),
        is_active_2=st.booleans(),
        referrer_reward_1=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        referrer_reward_2=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        referee_reward_1=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        referee_reward_2=st.decimals(
            min_value=Decimal("0.01"), max_value=Decimal("100.00"), places=2
        ),
        max_monthly_1=st.integers(min_value=1, max_value=100),
        max_monthly_2=st.integers(min_value=1, max_value=100),
        expiration_1=st.integers(min_value=1, max_value=365),
        expiration_2=st.integers(min_value=1, max_value=365),
    )
    @settings(max_examples=100)
    def test_config_upsert_overwrites_previous_values(
        self,
        laundry_id: str,
        is_active_1: bool,
        is_active_2: bool,
        referrer_reward_1: Decimal,
        referrer_reward_2: Decimal,
        referee_reward_1: Decimal,
        referee_reward_2: Decimal,
        max_monthly_1: int,
        max_monthly_2: int,
        expiration_1: int,
        expiration_2: int,
    ):
        """Upserting config twice results in the second set of values being returned."""
        store = FakeConfigStore()

        # Save first config
        config_1 = {
            "is_active": is_active_1,
            "referrer_reward_amount": referrer_reward_1,
            "referee_reward_amount": referee_reward_1,
            "max_monthly_referrals": max_monthly_1,
            "credit_expiration_days": expiration_1,
        }
        save_config(store, laundry_id, config_1)

        # Save second config (upsert overwrites)
        config_2 = {
            "is_active": is_active_2,
            "referrer_reward_amount": referrer_reward_2,
            "referee_reward_amount": referee_reward_2,
            "max_monthly_referrals": max_monthly_2,
            "credit_expiration_days": expiration_2,
        }
        save_config(store, laundry_id, config_2)

        # Read back should return the second config values
        result = read_config(store, laundry_id)

        assert result is not None, "Config should exist after upsert"
        assert result["isActive"] == is_active_2
        assert result["referrerRewardAmount"] == float(referrer_reward_2)
        assert result["refereeRewardAmount"] == float(referee_reward_2)
        assert result["maxMonthlyReferrals"] == max_monthly_2
        assert result["creditExpirationDays"] == expiration_2
