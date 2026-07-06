"""
Invoice email resolution utilities for dual-email invoicing.

Centralizes the logic for determining which email addresses should receive
invoices, supporting both account_email and billing_email scenarios.
"""
import re


# Regex for standard email validation: local@domain.tld
# - Local part: one or more characters that are not @ or whitespace
# - Single @ separator
# - Domain: one or more characters that are not @ or whitespace, containing at least one dot
# - TLD: at least 2 characters after the last dot
_EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$"
)


def is_valid_email(value: str) -> bool:
    """
    Validate whether a string is a well-formed email address.

    Uses a regex-based approach consistent with standard email validation.
    Accepts standard format: local@domain.tld

    Rules:
    - Must contain exactly one @ symbol
    - Local part must be non-empty and use valid characters
    - Domain must be non-empty and contain at least one dot
    - TLD must be at least 2 alphabetic characters
    - No leading/trailing whitespace (string is stripped before validation)

    Args:
        value: The string to validate.

    Returns:
        True if the string is a valid email, False otherwise.
    """
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    if not stripped:
        return False
    return _EMAIL_REGEX.match(stripped) is not None


def resolve_invoice_emails(customer: dict) -> list[str]:
    """
    Return the list of email addresses to send invoices to.

    Resolution rules (billing_email is primary Stripe recipient):
    - If both account_email and billing_email exist and are distinct →
      [billing_email, account_email]
    - If only account_email exists → [account_email]
    - If only billing_email exists → [billing_email]
    - If neither exists → []

    Args:
        customer: A dict with 'email' and 'billing_email' keys.

    Returns:
        A list of non-empty, trimmed, deduplicated email addresses.
        When both are present, billing_email comes first (Stripe invoice
        primary recipient).
    """
    account_email = (customer.get("email") or "").strip()
    billing_email = (customer.get("billing_email") or "").strip()

    emails: list[str] = []

    if billing_email:
        emails.append(billing_email)

    if account_email and account_email != billing_email:
        emails.append(account_email)

    return emails
