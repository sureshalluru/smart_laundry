"""
Property-based tests for referral code generation.

Feature: referral-community, Property 1: Referral code generation produces valid unique codes

Validates: Requirements 1.1, 1.2
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.referral_service import generate_referral_code, CLEAN_ALPHABET


class TestReferralCodeGenerationProperty:
    """Property 1: Referral code generation produces valid unique codes.

    For any number of generated referral codes, each code SHALL be 6-8 characters
    long, contain only uppercase alphanumeric characters (excluding O, 0, I, 1, L),
    and no two codes generated for the same tenant SHALL be identical.

    **Validates: Requirements 1.1, 1.2**
    """

    @given(length=st.integers(min_value=6, max_value=8))
    @settings(max_examples=100)
    def test_generated_code_has_correct_length(self, length: int):
        """Generated referral code has the exact requested length."""
        code = generate_referral_code(length)
        assert len(code) == length, (
            f"Expected code of length {length}, got '{code}' with length {len(code)}"
        )

    @given(length=st.integers(min_value=6, max_value=8))
    @settings(max_examples=100)
    def test_generated_code_contains_only_valid_characters(self, length: int):
        """Generated referral code only contains characters from CLEAN_ALPHABET."""
        code = generate_referral_code(length)
        invalid_chars = [c for c in code if c not in CLEAN_ALPHABET]
        assert not invalid_chars, (
            f"Code '{code}' contains invalid characters: {invalid_chars}. "
            f"Valid alphabet: {CLEAN_ALPHABET}"
        )

    @given(
        length=st.integers(min_value=6, max_value=8),
        batch_size=st.integers(min_value=2, max_value=50),
    )
    @settings(max_examples=100)
    def test_generated_codes_are_unique_within_batch(self, length: int, batch_size: int):
        """All codes generated in a batch are unique (simulating same-tenant generation)."""
        codes = [generate_referral_code(length) for _ in range(batch_size)]
        assert len(set(codes)) == len(codes), (
            f"Duplicate codes detected in batch of {batch_size} codes with length {length}. "
            f"Duplicates: {[c for c in codes if codes.count(c) > 1]}"
        )
