"""
Property-based tests for masking functions (mask_name and mask_email).

Feature: company-onboarding-ui, Property 3: Masking function preserves boundary characters

Validates: Requirements 9.3
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from app.routes.company_join import mask_name, mask_email


class TestMaskNameProperty:
    """Property 3: Masking function preserves boundary characters (mask_name).

    For any non-empty string, the mask function SHALL preserve the first and last
    characters while replacing all intermediate characters with asterisks. The masked
    output length SHALL equal the original input length.

    **Validates: Requirements 9.3**
    """

    @given(name=st.text(min_size=1))
    @settings(max_examples=200)
    def test_output_length_equals_input_length(self, name: str):
        """Masked output has the same length as the input."""
        result = mask_name(name)
        assert len(result) == len(name), (
            f"Length mismatch: input '{name!r}' (len={len(name)}) "
            f"produced '{result!r}' (len={len(result)})"
        )

    @given(name=st.text(min_size=1))
    @settings(max_examples=200)
    def test_first_char_preserved(self, name: str):
        """First character of the input is preserved in the output."""
        result = mask_name(name)
        assert result[0] == name[0], (
            f"First char mismatch: input '{name!r}' has first char '{name[0]}' "
            f"but result '{result!r}' has first char '{result[0]}'"
        )

    @given(name=st.text(min_size=3))
    @settings(max_examples=200)
    def test_last_char_preserved(self, name: str):
        """Last character of the input is preserved for strings of length >= 3."""
        result = mask_name(name)
        assert result[-1] == name[-1], (
            f"Last char mismatch: input '{name!r}' has last char '{name[-1]}' "
            f"but result '{result!r}' has last char '{result[-1]}'"
        )

    @given(name=st.text(min_size=3))
    @settings(max_examples=200)
    def test_middle_chars_are_asterisks(self, name: str):
        """All middle characters (between first and last) are asterisks for len >= 3."""
        result = mask_name(name)
        middle = result[1:-1]
        assert all(c == '*' for c in middle), (
            f"Middle chars not all asterisks: input '{name!r}' "
            f"produced middle '{middle}' in result '{result!r}'"
        )


class TestMaskEmailProperty:
    """Property 3: Masking function preserves boundary characters (mask_email).

    For any valid email-like string (local@domain), the mask function SHALL preserve
    the domain part unchanged, preserve the first and last characters of the local part,
    and replace intermediate characters with asterisks. The local part length SHALL be
    preserved.

    **Validates: Requirements 9.3**
    """

    # Strategy: generate valid email-like strings with guaranteed structure
    # Build domain as "label.tld" to avoid filtering issues
    _domain_strategy = st.builds(
        lambda label, tld: f"{label}.{tld}",
        label=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N")),
            min_size=1,
            max_size=15,
        ),
        tld=st.text(
            alphabet=st.characters(whitelist_categories=("L",)),
            min_size=2,
            max_size=5,
        ),
    )

    email_strategy = st.builds(
        lambda local, domain: f"{local}@{domain}",
        local=st.text(
            alphabet=st.characters(
                whitelist_categories=("L", "N"),
                whitelist_characters="._+-",
            ),
            min_size=1,
            max_size=50,
        ),
        domain=_domain_strategy,
    )

    email_strategy_long_local = st.builds(
        lambda local, domain: f"{local}@{domain}",
        local=st.text(
            alphabet=st.characters(
                whitelist_categories=("L", "N"),
                whitelist_characters="._+-",
            ),
            min_size=3,
            max_size=50,
        ),
        domain=_domain_strategy,
    )

    @given(email=email_strategy)
    @settings(max_examples=200)
    def test_domain_preserved_unchanged(self, email: str):
        """Domain part (after @) is fully preserved in the masked output."""
        result = mask_email(email)
        original_domain = email.split('@', 1)[1]
        result_domain = result.split('@', 1)[1]
        assert result_domain == original_domain, (
            f"Domain mismatch: input '{email}' has domain '{original_domain}' "
            f"but result '{result}' has domain '{result_domain}'"
        )

    @given(email=email_strategy)
    @settings(max_examples=200)
    def test_local_part_first_char_preserved(self, email: str):
        """First character of the local part is preserved."""
        result = mask_email(email)
        original_local = email.split('@', 1)[0]
        result_local = result.split('@', 1)[0]
        assert result_local[0] == original_local[0], (
            f"Local first char mismatch: input local '{original_local}' "
            f"but result local '{result_local}'"
        )

    @given(email=email_strategy_long_local)
    @settings(max_examples=200)
    def test_local_part_last_char_preserved(self, email: str):
        """Last character of the local part is preserved for local parts with len >= 3."""
        result = mask_email(email)
        original_local = email.split('@', 1)[0]
        result_local = result.split('@', 1)[0]
        assert result_local[-1] == original_local[-1], (
            f"Local last char mismatch: input local '{original_local}' "
            f"but result local '{result_local}'"
        )

    @given(email=email_strategy)
    @settings(max_examples=200)
    def test_local_part_length_preserved(self, email: str):
        """Local part length is preserved after masking."""
        result = mask_email(email)
        original_local = email.split('@', 1)[0]
        result_local = result.split('@', 1)[0]
        assert len(result_local) == len(original_local), (
            f"Local length mismatch: input local '{original_local}' (len={len(original_local)}) "
            f"but result local '{result_local}' (len={len(result_local)})"
        )
