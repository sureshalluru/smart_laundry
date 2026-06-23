"""
Tests for the verification store module.

Includes:
- Property-based tests (hypothesis) for verification code validity and address normalization
- Unit tests for verification store operations
"""

import time
import string
from unittest.mock import patch

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from app.services.verification_store import (
    VerificationStore,
    normalize_address,
    CODE_TTL,
    TOKEN_TTL,
    MAX_ATTEMPTS,
)


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

email_strategy = st.emails()
six_digit_code_strategy = st.text(
    alphabet=string.digits, min_size=6, max_size=6
)
# Timestamps within a reasonable window (now - 20 min to now)
timestamp_offset_strategy = st.floats(min_value=0, max_value=1200)
attempt_count_strategy = st.integers(min_value=0, max_value=5)

# Address strings: printable text of reasonable length
address_string_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Z", "P")),
    min_size=0,
    max_size=100,
)


# ===========================================================================
# PROPERTY TEST: Verification code validity (Property 1)
# Tag: "Feature: onboarding-verification, Property 1: Verification code validity"
# Validates: Requirements 1.3, 1.4, 1.5
# ===========================================================================


class TestVerificationCodeValidityProperty:
    """
    Feature: onboarding-verification, Property 1: Verification code validity

    For any email verification attempt with a code and timestamp, the verification
    should succeed if and only if the submitted code matches the stored code AND the
    code was created less than 10 minutes ago AND fewer than 3 failed attempts have
    been made.

    **Validates: Requirements 1.3, 1.4, 1.5**
    """

    @given(
        email=email_strategy,
        stored_code=six_digit_code_strategy,
        submitted_code=six_digit_code_strategy,
        age_seconds=st.floats(min_value=0, max_value=1200),
        prior_attempts=st.integers(min_value=0, max_value=4),
    )
    @settings(max_examples=100)
    def test_verification_succeeds_iff_conditions_met(
        self, email, stored_code, submitted_code, age_seconds, prior_attempts
    ):
        """
        Property: verification succeeds iff code matches AND created_at < 10 min ago
        AND attempts < 3.
        """
        store = VerificationStore()
        # Stop the cleanup thread from interfering
        store._cleanup_thread = None

        # Directly inject state to control timing and attempts
        created_at = time.time() - age_seconds
        with store._lock:
            store._codes[email] = {
                "code": stored_code,
                "created_at": created_at,
                "attempts": prior_attempts,
            }

        success, error_code, remaining = store.verify_code(email, submitted_code)

        code_matches = stored_code == submitted_code
        not_expired = age_seconds < CODE_TTL
        under_max_attempts = prior_attempts < MAX_ATTEMPTS

        should_succeed = code_matches and not_expired and under_max_attempts

        if should_succeed:
            assert success is True, (
                f"Expected success but got error_code={error_code}, "
                f"code_matches={code_matches}, age={age_seconds}, attempts={prior_attempts}"
            )
        else:
            assert success is False, (
                f"Expected failure but got success, "
                f"code_matches={code_matches}, age={age_seconds}, attempts={prior_attempts}"
            )
            # Verify correct error code
            if not not_expired:
                assert error_code == "CODE_EXPIRED"
            elif not under_max_attempts:
                assert error_code == "MAX_ATTEMPTS"
            elif not code_matches:
                assert error_code == "INVALID_CODE"


# ===========================================================================
# PROPERTY TEST: Address normalization idempotence (Property 3)
# Tag: "Feature: onboarding-verification, Property 3: Address normalization idempotence"
# Validates: Requirements 3.2
# ===========================================================================


class TestAddressNormalizationIdempotenceProperty:
    """
    Feature: onboarding-verification, Property 3: Address normalization idempotence

    For any address string, applying the normalization function twice should produce
    the same result as applying it once: normalize(normalize(addr)) == normalize(addr).

    **Validates: Requirements 3.2**
    """

    @given(
        street=address_string_strategy,
        city=address_string_strategy,
        state=address_string_strategy,
        zip_code=address_string_strategy,
    )
    @settings(max_examples=100)
    def test_normalize_is_idempotent(self, street, city, state, zip_code):
        """
        Property: normalize(normalize(addr)) == normalize(addr) for all fields.
        """
        # First normalization
        once = normalize_address(street, city, state, zip_code)

        # Second normalization (apply normalize to normalized output)
        twice = normalize_address(
            once["street"], once["city"], once["state"], once["zip_code"]
        )

        assert once == twice, (
            f"Normalization is not idempotent!\n"
            f"Input: street={street!r}, city={city!r}, state={state!r}, zip={zip_code!r}\n"
            f"Once: {once}\n"
            f"Twice: {twice}"
        )


# ===========================================================================
# UNIT TESTS: Verification store operations (Task 1.4)
# Validates: Requirements 1.4, 1.5
# ===========================================================================


class TestVerificationStoreUnit:
    """Unit tests for the VerificationStore class."""

    def setup_method(self):
        """Create a fresh store for each test."""
        self.store = VerificationStore()
        self.store._cleanup_thread = None

    # --- Test: code generation stores exactly 6 numeric digits ---

    def test_store_code_stores_six_digit_code(self):
        """store_code stores the provided 6-digit code correctly."""
        email = "test@example.com"
        code = "123456"
        self.store.store_code(email, code)

        entry = self.store._codes[email]
        assert entry["code"] == "123456"
        assert len(entry["code"]) == 6
        assert entry["code"].isdigit()

    def test_stored_code_has_correct_structure(self):
        """Stored code entry contains code, created_at, and attempts."""
        email = "user@test.com"
        code = "098765"
        self.store.store_code(email, code)

        entry = self.store._codes[email]
        assert "code" in entry
        assert "created_at" in entry
        assert "attempts" in entry
        assert entry["attempts"] == 0

    # --- Test: expired code returns CODE_EXPIRED error ---

    def test_expired_code_returns_code_expired(self):
        """Verification of an expired code (>10 min old) returns CODE_EXPIRED."""
        email = "expired@test.com"
        code = "111111"

        # Inject a code that was created 11 minutes ago
        with self.store._lock:
            self.store._codes[email] = {
                "code": code,
                "created_at": time.time() - 660,  # 11 minutes ago
                "attempts": 0,
            }

        success, error_code, remaining = self.store.verify_code(email, code)

        assert success is False
        assert error_code == "CODE_EXPIRED"

    def test_nonexistent_email_returns_code_expired(self):
        """Verification for a non-existent email returns CODE_EXPIRED."""
        success, error_code, remaining = self.store.verify_code(
            "nobody@test.com", "000000"
        )
        assert success is False
        assert error_code == "CODE_EXPIRED"

    # --- Test: 3 wrong attempts returns MAX_ATTEMPTS error ---

    def test_max_attempts_returns_max_attempts_error(self):
        """After 3 failed attempts, verification returns MAX_ATTEMPTS."""
        email = "attempts@test.com"
        code = "222222"

        # Inject code with 3 prior attempts
        with self.store._lock:
            self.store._codes[email] = {
                "code": code,
                "created_at": time.time(),
                "attempts": 3,
            }

        success, error_code, remaining = self.store.verify_code(email, code)

        assert success is False
        assert error_code == "MAX_ATTEMPTS"
        assert remaining == 0

    def test_incremental_attempts_until_max(self):
        """Each wrong code increments attempts; after 3, MAX_ATTEMPTS is returned."""
        email = "counting@test.com"
        correct_code = "333333"
        wrong_code = "999999"

        self.store.store_code(email, correct_code)

        # First wrong attempt
        success, error_code, remaining = self.store.verify_code(email, wrong_code)
        assert success is False
        assert error_code == "INVALID_CODE"
        assert remaining == 2

        # Second wrong attempt
        success, error_code, remaining = self.store.verify_code(email, wrong_code)
        assert success is False
        assert error_code == "INVALID_CODE"
        assert remaining == 1

        # Third wrong attempt
        success, error_code, remaining = self.store.verify_code(email, wrong_code)
        assert success is False
        assert error_code == "INVALID_CODE"
        assert remaining == 0

        # Fourth attempt - now MAX_ATTEMPTS
        success, error_code, remaining = self.store.verify_code(email, correct_code)
        assert success is False
        assert error_code == "MAX_ATTEMPTS"

    # --- Test: token creation and validation round-trip ---

    def test_token_creation_and_validation_roundtrip(self):
        """create_token returns a token that validate_token can look up."""
        email = "token@test.com"
        token = self.store.create_token(email)

        assert token is not None
        assert len(token) > 0

        # Validate returns the associated email
        result = self.store.validate_token(token)
        assert result == email

    def test_expired_token_returns_none(self):
        """An expired token (>30 min) returns None on validation."""
        email = "expired-token@test.com"
        token = self.store.create_token(email)

        # Manually expire the token
        with self.store._lock:
            self.store._tokens[token]["created_at"] = time.time() - (TOKEN_TTL + 1)

        result = self.store.validate_token(token)
        assert result is None

    def test_invalid_token_returns_none(self):
        """A non-existent token returns None on validation."""
        result = self.store.validate_token("nonexistent-token-uuid")
        assert result is None

    # --- Test: cleanup removes only expired entries ---

    def test_cleanup_removes_expired_codes(self):
        """cleanup_expired removes codes older than CODE_TTL."""
        # Store an expired code
        with self.store._lock:
            self.store._codes["old@test.com"] = {
                "code": "111111",
                "created_at": time.time() - (CODE_TTL + 60),
                "attempts": 0,
            }
            # Store a fresh code
            self.store._codes["fresh@test.com"] = {
                "code": "222222",
                "created_at": time.time(),
                "attempts": 0,
            }

        self.store.cleanup_expired()

        assert "old@test.com" not in self.store._codes
        assert "fresh@test.com" in self.store._codes

    def test_cleanup_removes_expired_tokens(self):
        """cleanup_expired removes tokens older than TOKEN_TTL."""
        # Store an expired token
        with self.store._lock:
            self.store._tokens["expired-token"] = {
                "email": "old@test.com",
                "created_at": time.time() - (TOKEN_TTL + 60),
            }
            # Store a fresh token
            self.store._tokens["fresh-token"] = {
                "email": "new@test.com",
                "created_at": time.time(),
            }

        self.store.cleanup_expired()

        assert "expired-token" not in self.store._tokens
        assert "fresh-token" in self.store._tokens

    def test_cleanup_removes_expired_proofs(self):
        """cleanup_expired removes proofs older than TOKEN_TTL."""
        # Store an expired proof
        with self.store._lock:
            self.store._proofs["old-proof"] = {
                "proof_id": "old-proof",
                "s3_key": "proof-docs/old.pdf",
                "status": "verified",
                "entered_address": {},
                "address_verified": True,
                "created_at": time.time() - (TOKEN_TTL + 60),
            }
            # Store a fresh proof
            self.store._proofs["fresh-proof"] = {
                "proof_id": "fresh-proof",
                "s3_key": "proof-docs/new.pdf",
                "status": "processing",
                "entered_address": {},
                "address_verified": False,
                "created_at": time.time(),
            }

        self.store.cleanup_expired()

        assert "old-proof" not in self.store._proofs
        assert "fresh-proof" in self.store._proofs

    def test_cleanup_does_not_remove_fresh_entries(self):
        """cleanup_expired leaves non-expired entries intact."""
        self.store.store_code("active@test.com", "444444")
        token = self.store.create_token("active@test.com")
        self.store.store_proof("active-proof", "proof-docs/doc.pdf", {"street": "123 Main"})

        self.store.cleanup_expired()

        assert "active@test.com" in self.store._codes
        assert token in self.store._tokens
        assert "active-proof" in self.store._proofs
