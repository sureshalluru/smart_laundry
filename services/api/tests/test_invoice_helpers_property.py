"""
Property-based tests for invoice email resolution.

Feature: commercial-account-management, Property 2: Invoice email resolution correctness

Validates: Requirements 2.1, 2.2, 2.4, 2.5
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from app.utils.invoice_helpers import resolve_invoice_emails


# --- Strategies ---

# Valid email strategy: generates realistic email-like strings
_valid_email_strategy = st.builds(
    lambda local, domain, tld: f"{local}@{domain}.{tld}",
    local=st.text(
        alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="._+-"),
        min_size=1,
        max_size=30,
    ),
    domain=st.text(
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

# Whitespace-only strategy
_whitespace_strategy = st.sampled_from([" ", "  ", "\t", "\n", " \t ", "  \n  "])

# "Empty-like" strategy: None, empty string, or whitespace-only
_empty_like_strategy = st.one_of(
    st.none(),
    st.just(""),
    _whitespace_strategy,
)

# General email field strategy: either a valid email or an empty-like value
_email_field_strategy = st.one_of(
    _valid_email_strategy,
    _empty_like_strategy,
)


def _is_effective(value) -> bool:
    """Return True if the value is a non-empty, non-whitespace string."""
    if value is None:
        return False
    return value.strip() != ""


def _effective_value(value) -> str:
    """Return the trimmed value if effective, else empty string."""
    if value is None:
        return ""
    return value.strip()


class TestResolveInvoiceEmailsProperty:
    """Property 2: Invoice email resolution correctness.

    For any customer record with arbitrary values for `email` and `billing_email`
    (including None, empty string, whitespace-only, and valid emails),
    `resolve_invoice_emails` SHALL return a list containing exactly the non-empty,
    trimmed, deduplicated email addresses from the pair — billing_email first if both
    are present and distinct, account_email only if billing_email is absent,
    billing_email only if account_email is absent, and an empty list if both are absent.

    **Validates: Requirements 2.1, 2.2, 2.4, 2.5**
    """

    @given(email=_email_field_strategy, billing_email=_email_field_strategy)
    @settings(max_examples=200)
    def test_both_set_and_distinct_returns_billing_first(self, email, billing_email):
        """When both emails are set and distinct, result is [billing_email, account_email]."""
        customer = {"email": email, "billing_email": billing_email}
        result = resolve_invoice_emails(customer)

        acct = _effective_value(email)
        bill = _effective_value(billing_email)

        if acct and bill and acct != bill:
            assert result == [bill, acct], (
                f"Expected ['{bill}', '{acct}'] but got {result} "
                f"for email={email!r}, billing_email={billing_email!r}"
            )

    @given(email=_valid_email_strategy)
    @settings(max_examples=200)
    def test_only_account_email_set(self, email):
        """When only account_email is set (billing is None/empty), result is [account_email]."""
        for billing in [None, "", "   ", "\t\n"]:
            customer = {"email": email, "billing_email": billing}
            result = resolve_invoice_emails(customer)
            expected = [email.strip()]
            assert result == expected, (
                f"Expected {expected} but got {result} "
                f"for email={email!r}, billing_email={billing!r}"
            )

    @given(billing_email=_valid_email_strategy)
    @settings(max_examples=200)
    def test_only_billing_email_set(self, billing_email):
        """When only billing_email is set (account is None/empty), result is [billing_email]."""
        for email in [None, "", "   ", "\t\n"]:
            customer = {"email": email, "billing_email": billing_email}
            result = resolve_invoice_emails(customer)
            expected = [billing_email.strip()]
            assert result == expected, (
                f"Expected {expected} but got {result} "
                f"for email={email!r}, billing_email={billing_email!r}"
            )

    @given(empty_email=_empty_like_strategy, empty_billing=_empty_like_strategy)
    @settings(max_examples=200)
    def test_both_empty_returns_empty_list(self, empty_email, empty_billing):
        """When both emails are None/empty/whitespace, result is []."""
        customer = {"email": empty_email, "billing_email": empty_billing}
        result = resolve_invoice_emails(customer)
        assert result == [], (
            f"Expected [] but got {result} "
            f"for email={empty_email!r}, billing_email={empty_billing!r}"
        )

    @given(email=_valid_email_strategy)
    @settings(max_examples=200)
    def test_same_email_deduplicates(self, email):
        """When billing_email equals account_email (after trim), result is deduplicated to single entry."""
        # Test exact match
        customer = {"email": email, "billing_email": email}
        result = resolve_invoice_emails(customer)
        expected = [email.strip()]
        assert result == expected, (
            f"Expected {expected} (deduplicated) but got {result} "
            f"for email={email!r}, billing_email={email!r}"
        )

    @given(email=_valid_email_strategy)
    @settings(max_examples=200)
    def test_same_email_with_whitespace_deduplicates(self, email):
        """When billing_email equals account_email after trimming whitespace, result is deduplicated."""
        padded = f"  {email}  "
        customer = {"email": email, "billing_email": padded}
        result = resolve_invoice_emails(customer)
        expected = [email.strip()]
        assert result == expected, (
            f"Expected {expected} (deduplicated) but got {result} "
            f"for email={email!r}, billing_email={padded!r}"
        )

    @given(email=_email_field_strategy, billing_email=_email_field_strategy)
    @settings(max_examples=200)
    def test_result_contains_only_trimmed_nonempty_strings(self, email, billing_email):
        """All entries in the result are non-empty trimmed strings."""
        customer = {"email": email, "billing_email": billing_email}
        result = resolve_invoice_emails(customer)
        for addr in result:
            assert isinstance(addr, str), f"Expected str, got {type(addr)}"
            assert addr == addr.strip(), f"Expected trimmed string, got '{addr}'"
            assert addr != "", "Empty string in result list"

    @given(email=_email_field_strategy, billing_email=_email_field_strategy)
    @settings(max_examples=200)
    def test_result_has_no_duplicates(self, email, billing_email):
        """The result list never contains duplicate entries."""
        customer = {"email": email, "billing_email": billing_email}
        result = resolve_invoice_emails(customer)
        assert len(result) == len(set(result)), (
            f"Duplicate entries in result: {result} "
            f"for email={email!r}, billing_email={billing_email!r}"
        )

    @given(email=_email_field_strategy, billing_email=_email_field_strategy)
    @settings(max_examples=200)
    def test_result_max_length_is_two(self, email, billing_email):
        """The result list has at most 2 entries."""
        customer = {"email": email, "billing_email": billing_email}
        result = resolve_invoice_emails(customer)
        assert len(result) <= 2, (
            f"Expected at most 2 entries, got {len(result)}: {result} "
            f"for email={email!r}, billing_email={billing_email!r}"
        )

    @given(email=_email_field_strategy, billing_email=_email_field_strategy)
    @settings(max_examples=200)
    def test_full_truth_table_correctness(self, email, billing_email):
        """Comprehensive truth table verification for all input combinations."""
        customer = {"email": email, "billing_email": billing_email}
        result = resolve_invoice_emails(customer)

        acct = _effective_value(email)
        bill = _effective_value(billing_email)

        if acct and bill and acct != bill:
            # Both set and distinct → [billing_email, account_email]
            assert result == [bill, acct]
        elif acct and bill and acct == bill:
            # Both set but same (deduplicated) → [the_email]
            assert result == [acct]
        elif acct and not bill:
            # Only account_email → [account_email]
            assert result == [acct]
        elif bill and not acct:
            # Only billing_email → [billing_email]
            assert result == [bill]
        else:
            # Neither → []
            assert result == []
