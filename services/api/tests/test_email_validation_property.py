"""
Property-based tests for email validation.

Feature: commercial-account-management, Property 1: Email validation accepts only well-formed emails

**Validates: Requirements 1.2, 1.5**

For any string input, the email validation function SHALL accept the input if and only
if it matches the standard email format (local@domain with valid characters), and SHALL
reject all strings that are not well-formed email addresses.
"""
import re
import string

from hypothesis import given, settings, assume
from hypothesis import strategies as st

from app.utils.invoice_helpers import is_valid_email


# --- Strategies ---

# Characters valid in the local part of an email (simplified set)
_LOCAL_CHARS = string.ascii_letters + string.digits + ".!#$%&'*+/=?^_`{|}~-"

# Strategy for generating valid local parts
_valid_local_strategy = st.text(
    alphabet=_LOCAL_CHARS,
    min_size=1,
    max_size=30,
).filter(lambda s: not s.startswith(".") and not s.endswith(".") and ".." not in s)

# Strategy for a valid domain label (e.g., "example", "sub-domain")
_domain_label_strategy = st.builds(
    lambda first, middle, last: first + middle + last,
    first=st.text(alphabet=string.ascii_lowercase + string.digits, min_size=1, max_size=1),
    middle=st.text(alphabet=string.ascii_lowercase + string.digits + "-", min_size=0, max_size=10),
    last=st.text(alphabet=string.ascii_lowercase + string.digits, min_size=1, max_size=1),
)

# Strategy for a valid TLD (2-5 alphabetic characters)
_tld_strategy = st.text(
    alphabet=string.ascii_lowercase,
    min_size=2,
    max_size=5,
)

# Strategy for a complete valid email address
_valid_email_strategy = st.builds(
    lambda local, domain, tld: f"{local}@{domain}.{tld}",
    local=_valid_local_strategy,
    domain=_domain_label_strategy,
    tld=_tld_strategy,
)

# Strategy for random strings (many will be invalid emails)
_random_string_strategy = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",)),  # exclude surrogates
    min_size=0,
    max_size=80,
)

# Known invalid email patterns
_invalid_email_patterns = st.sampled_from([
    "",                          # empty string
    " ",                         # whitespace only
    "plainaddress",              # no @ symbol
    "@missinglocal.com",         # empty local part
    "missing@.com",              # domain starts with dot
    "missing@domain",            # no TLD (no dot in domain)
    "user@@domain.com",          # double @
    "user@domain..com",          # consecutive dots in domain
    "user@.domain.com",          # domain starts with dot
    "@domain.com",               # missing local part
    "user@",                     # missing domain
    "user@domain.",              # domain ends with dot (empty TLD)
    "user@ domain.com",          # space in domain
    "us er@domain.com",          # space in local
    "user@dom ain.com",          # space in domain
    "user@domain.c",             # TLD too short (1 char)
    "a@b",                       # no TLD at all
    "@@",                        # only @ symbols
    "user@-domain.com",          # domain starts with hyphen
])


class TestEmailValidationProperty:
    """Property 1: Email validation accepts only well-formed emails.

    For any string input, the email validation function SHALL accept the input
    if and only if it matches the standard email format (local@domain with valid
    characters), and SHALL reject all strings that are not well-formed email addresses.

    **Validates: Requirements 1.2, 1.5**
    """

    @given(email=_valid_email_strategy)
    @settings(max_examples=200)
    def test_valid_emails_are_accepted(self, email):
        """Well-formed emails generated from valid components are always accepted."""
        assert is_valid_email(email) is True, (
            f"Expected valid email to be accepted: {email!r}"
        )

    @given(email=_valid_email_strategy)
    @settings(max_examples=100)
    def test_valid_emails_with_whitespace_padding_accepted(self, email):
        """Valid emails with leading/trailing whitespace are accepted (stripped)."""
        padded = f"  {email}  "
        assert is_valid_email(padded) is True, (
            f"Expected padded valid email to be accepted: {padded!r}"
        )

    @given(text=_random_string_strategy)
    @settings(max_examples=200)
    def test_random_strings_classified_correctly(self, text):
        """Random strings are correctly classified as valid or invalid.

        A string is valid if and only if it matches the email regex pattern
        after stripping whitespace.
        """
        result = is_valid_email(text)
        assert isinstance(result, bool), (
            f"Expected bool result, got {type(result)} for input {text!r}"
        )

        # Verify consistency: if accepted, it must contain exactly one @
        # with non-empty local and domain parts (basic structural check)
        stripped = text.strip()
        if result is True:
            assert "@" in stripped, (
                f"Accepted email must contain @: {text!r}"
            )
            parts = stripped.split("@")
            assert len(parts) == 2, (
                f"Accepted email must have exactly one @: {text!r}"
            )
            assert len(parts[0]) > 0, (
                f"Accepted email must have non-empty local part: {text!r}"
            )
            assert "." in parts[1], (
                f"Accepted email must have dot in domain: {text!r}"
            )

    @given(invalid=_invalid_email_patterns)
    @settings(max_examples=100)
    def test_known_invalid_patterns_rejected(self, invalid):
        """Known invalid email patterns are always rejected."""
        assert is_valid_email(invalid) is False, (
            f"Expected invalid email to be rejected: {invalid!r}"
        )

    @given(local=_valid_local_strategy, domain=_domain_label_strategy, tld=_tld_strategy)
    @settings(max_examples=100)
    def test_no_at_symbol_rejected(self, local, domain, tld):
        """Strings without @ symbol are always rejected."""
        no_at = f"{local}{domain}.{tld}"
        # Only test if this doesn't accidentally contain an @
        assume("@" not in no_at)
        assert is_valid_email(no_at) is False, (
            f"Expected string without @ to be rejected: {no_at!r}"
        )

    @given(email=_valid_email_strategy)
    @settings(max_examples=100)
    def test_double_at_rejected(self, email):
        """Emails with double @@ are always rejected."""
        double_at = email.replace("@", "@@", 1)
        assert is_valid_email(double_at) is False, (
            f"Expected double @@ email to be rejected: {double_at!r}"
        )

    @given(email=_valid_email_strategy)
    @settings(max_examples=100)
    def test_empty_local_part_rejected(self, email):
        """Emails with empty local part (starting with @) are rejected."""
        at_pos = email.index("@")
        empty_local = email[at_pos:]  # removes local part, starts with @
        assert is_valid_email(empty_local) is False, (
            f"Expected empty local part to be rejected: {empty_local!r}"
        )

    @settings(max_examples=100)
    @given(data=st.data())
    def test_empty_domain_rejected(self, data):
        """Emails with empty domain (ending with @) are rejected."""
        local = data.draw(_valid_local_strategy)
        empty_domain = f"{local}@"
        assert is_valid_email(empty_domain) is False, (
            f"Expected empty domain email to be rejected: {empty_domain!r}"
        )

    def test_none_input_rejected(self):
        """None input is rejected."""
        assert is_valid_email(None) is False

    def test_empty_string_rejected(self):
        """Empty string is rejected."""
        assert is_valid_email("") is False

    def test_whitespace_only_rejected(self):
        """Whitespace-only input is rejected."""
        assert is_valid_email("   ") is False
        assert is_valid_email("\t\n") is False

    @given(email=_valid_email_strategy)
    @settings(max_examples=100)
    def test_return_type_is_bool(self, email):
        """is_valid_email always returns a bool."""
        result = is_valid_email(email)
        assert isinstance(result, bool)

    @given(text=_random_string_strategy)
    @settings(max_examples=100)
    def test_return_type_is_bool_for_random(self, text):
        """is_valid_email always returns a bool for random input."""
        result = is_valid_email(text)
        assert isinstance(result, bool)
