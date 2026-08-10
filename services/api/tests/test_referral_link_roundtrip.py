"""
Property-based tests for referral link round-trip.

Feature: referral-community, Property 3: Referral link round-trip

Validates: Requirements 2.1, 2.4
"""
from urllib.parse import urlparse, parse_qs, urlencode, quote

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.referral_service import CLEAN_ALPHABET


# --- Helper functions under test ---


def construct_referral_link(domain: str, laundry_id: str, code: str) -> str:
    """Construct a referral link in the format https://{domain}/{laundryId}/site?ref={code}."""
    return f"https://{domain}/{laundry_id}/site?ref={quote(code, safe='')}"


def extract_referral_code(url: str) -> str | None:
    """Extract the referral code from a referral link's query parameters."""
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    codes = params.get("ref")
    if codes:
        return codes[0]
    return None


def extract_laundry_id(url: str) -> str | None:
    """Extract the laundry ID from the path segment of a referral link."""
    parsed = urlparse(url)
    # Path format: /{laundryId}/site
    parts = parsed.path.strip("/").split("/")
    if len(parts) >= 2 and parts[1] == "site":
        return parts[0]
    return None


# --- Hypothesis strategies ---

# Codes: strings from CLEAN_ALPHABET of length 6-8
referral_code_strategy = st.text(
    alphabet=CLEAN_ALPHABET,
    min_size=6,
    max_size=8,
)

# Laundry IDs: numeric digit strings of length 1-10
laundry_id_strategy = st.text(
    alphabet="0123456789",
    min_size=1,
    max_size=10,
)

# Domains: simple domain strings
domain_strategy = st.just("www.example.com")


class TestReferralLinkRoundTripProperty:
    """Property 3: Referral link round-trip.

    For any valid referral code and laundry ID, constructing a referral link
    and then extracting the code from that link's query parameters SHALL produce
    the original code.

    **Validates: Requirements 2.1, 2.4**
    """

    @given(
        domain=domain_strategy,
        laundry_id=laundry_id_strategy,
        code=referral_code_strategy,
    )
    @settings(max_examples=100)
    def test_referral_code_round_trips_through_link(
        self, domain: str, laundry_id: str, code: str
    ):
        """Constructing a referral link and extracting the ref param yields the original code."""
        link = construct_referral_link(domain, laundry_id, code)
        extracted_code = extract_referral_code(link)
        assert extracted_code == code, (
            f"Code round-trip failed. Original: '{code}', Extracted: '{extracted_code}', "
            f"Link: '{link}'"
        )

    @given(
        domain=domain_strategy,
        laundry_id=laundry_id_strategy,
        code=referral_code_strategy,
    )
    @settings(max_examples=100)
    def test_laundry_id_round_trips_through_link(
        self, domain: str, laundry_id: str, code: str
    ):
        """Constructing a referral link and extracting the laundry ID from the path yields the original ID."""
        link = construct_referral_link(domain, laundry_id, code)
        extracted_id = extract_laundry_id(link)
        assert extracted_id == laundry_id, (
            f"Laundry ID round-trip failed. Original: '{laundry_id}', "
            f"Extracted: '{extracted_id}', Link: '{link}'"
        )
