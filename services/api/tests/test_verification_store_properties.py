"""
Property-based tests for VerificationStore token round-trip.

Feature: company-onboarding-ui, Property 7: Company join token validation round-trip

Validates: Requirements 10.5
"""

import time
from unittest.mock import patch

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.verification_store import (
    VerificationStore,
    TOKEN_TTL,
)


class TestTokenRoundTripProperty:
    """Property 7: Company join token validation round-trip.

    For any key where verification succeeds, the token returned by `create_token`
    SHALL be accepted by `validate_token` when used within the TTL window.
    Conversely, for any token that has expired (elapsed > TOKEN_TTL),
    `validate_token` SHALL return None.

    **Validates: Requirements 10.5**
    """

    @given(key=st.text(min_size=1))
    @settings(max_examples=100)
    def test_token_accepted_within_ttl(self, key: str):
        """For any key, create_token produces a token immediately accepted by validate_token."""
        store = VerificationStore()
        store._cleanup_thread = None

        token = store.create_token(key)

        # Token should be valid immediately (within TTL)
        result = store.validate_token(token)
        assert result == key, (
            f"Token created for key {key!r} was not accepted by validate_token. "
            f"Expected {key!r}, got {result!r}"
        )

    @given(key=st.text(min_size=1))
    @settings(max_examples=100)
    def test_token_rejected_after_ttl(self, key: str):
        """For any key, after TOKEN_TTL expires, validate_token returns None."""
        store = VerificationStore()
        store._cleanup_thread = None

        token = store.create_token(key)

        # Manually expire the token by setting created_at in the past
        with store._lock:
            store._tokens[token]["created_at"] = time.time() - (TOKEN_TTL + 1)

        result = store.validate_token(token)
        assert result is None, (
            f"Token for key {key!r} was accepted after TTL expiry. "
            f"Expected None, got {result!r}"
        )
