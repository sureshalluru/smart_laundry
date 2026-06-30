"""
Property-based tests for join code generation.

Feature: company-onboarding-ui, Property 5: Join code generation follows format specification
Feature: company-onboarding-ui, Property 6: Join code uniqueness across generations

Validates: Requirements 12.1, 12.3
"""
import re

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.join_code import generate_join_code

# Regex for valid join code format: exactly 4 uppercase alphanumeric, dash, 4 uppercase alphanumeric
JOIN_CODE_PATTERN = re.compile(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$')


def _expected_prefix(company_name: str) -> str:
    """Compute the expected prefix from a company name using the spec logic."""
    alpha = ''.join(c for c in company_name.upper() if c.isascii() and c.isalnum())
    return (alpha + 'XXXX')[:4]


class TestJoinCodeFormatProperty:
    """Property 5: Join code generation follows format specification.

    For any non-empty company name, the generated join code SHALL match the pattern
    ^[A-Z0-9]{4}-[A-Z0-9]{4}$ where the first 4 characters are derived from the
    first 4 alphanumeric characters of the company name (uppercased, padded with 'X').

    **Validates: Requirements 12.1**
    """

    @given(company_name=st.text(min_size=1))
    @settings(max_examples=200)
    def test_join_code_matches_format(self, company_name: str):
        """Generated join code always matches the expected regex format."""
        code = generate_join_code(company_name)
        assert JOIN_CODE_PATTERN.match(code), (
            f"Join code '{code}' does not match pattern ^[A-Z0-9]{{4}}-[A-Z0-9]{{4}}$ "
            f"for company name '{company_name!r}'"
        )

    @given(company_name=st.text(min_size=1))
    @settings(max_examples=200)
    def test_join_code_prefix_derived_from_name(self, company_name: str):
        """The prefix (first 4 chars before the dash) equals the expected derivation."""
        code = generate_join_code(company_name)
        actual_prefix = code.split('-')[0]
        expected = _expected_prefix(company_name)
        assert actual_prefix == expected, (
            f"Prefix '{actual_prefix}' does not match expected '{expected}' "
            f"for company name '{company_name!r}'"
        )


class TestJoinCodeUniquenessProperty:
    """Property 6: Join code uniqueness across generations.

    For any set of 100 generated join codes from varied company names,
    all codes SHALL be unique (set size == list size). With 36^4 = 1,679,616
    possible suffixes per prefix, collision probability in 100 codes is negligible.

    **Validates: Requirements 12.3**
    """

    @given(
        company_names=st.lists(
            st.text(
                alphabet=st.characters(categories=("L", "N", "P", "Z")),
                min_size=1,
                max_size=50,
            ),
            min_size=100,
            max_size=100,
        )
    )
    @settings(max_examples=100)
    def test_generated_codes_are_unique(self, company_names: list):
        """Generating 100 codes from varied company names produces all unique values."""
        codes = [generate_join_code(name) for name in company_names]
        assert len(set(codes)) == len(codes), (
            f"Collision detected among 100 generated join codes. "
            f"Duplicates: {[c for c in codes if codes.count(c) > 1]}"
        )
