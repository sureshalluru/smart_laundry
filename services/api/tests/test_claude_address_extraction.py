"""
Unit tests for Claude address extraction helpers in onboarding_verification.py.

Tests:
- _parse_claude_address_response with valid JSON
- _parse_claude_address_response with found: false
- _parse_claude_address_response with markdown code blocks
- _extract_street_parts returns correct number and name
- _extract_street_parts returns None for invalid input
"""
import pytest
from app.routes.onboarding_verification import _parse_claude_address_response, _extract_street_parts


class TestParseCloudeAddressResponse:
    """Tests for _parse_claude_address_response."""

    def test_valid_json_with_found_true(self):
        """Parse valid JSON response with found=true."""
        response = '{"found": true, "street": "123 Main St", "city": "Austin", "state": "TX", "zip": "78664"}'
        result = _parse_claude_address_response(response)
        assert result is not None
        assert result["found"] is True
        assert result["street"] == "123 Main St"
        assert result["city"] == "Austin"
        assert result["state"] == "TX"
        assert result["zip"] == "78664"

    def test_valid_json_with_found_false(self):
        """Parse valid JSON response with found=false."""
        response = '{"found": false, "street": "", "city": "", "state": "", "zip": ""}'
        result = _parse_claude_address_response(response)
        assert result is not None
        assert result["found"] is False

    def test_markdown_code_block_json(self):
        """Parse JSON wrapped in markdown code blocks."""
        response = '```json\n{"found": true, "street": "456 Oak Ave", "city": "Dallas", "state": "TX", "zip": "75201"}\n```'
        result = _parse_claude_address_response(response)
        assert result is not None
        assert result["found"] is True
        assert result["street"] == "456 Oak Ave"
        assert result["city"] == "Dallas"

    def test_markdown_code_block_no_language(self):
        """Parse JSON wrapped in plain markdown code blocks (no language tag)."""
        response = '```\n{"found": true, "street": "789 Elm Blvd", "city": "Houston", "state": "TX", "zip": "77001"}\n```'
        result = _parse_claude_address_response(response)
        assert result is not None
        assert result["found"] is True
        assert result["street"] == "789 Elm Blvd"

    def test_invalid_json_returns_none(self):
        """Return None for completely invalid response."""
        response = "I cannot read this document clearly."
        result = _parse_claude_address_response(response)
        assert result is None

    def test_json_embedded_in_text(self):
        """Parse JSON embedded in surrounding text."""
        response = 'Here is the extracted address:\n{"found": true, "street": "100 Pine St", "city": "Seattle", "state": "WA", "zip": "98101"}\nLet me know if you need more.'
        result = _parse_claude_address_response(response)
        assert result is not None
        assert result["found"] is True
        assert result["street"] == "100 Pine St"


class TestExtractStreetParts:
    """Tests for _extract_street_parts."""

    def test_valid_street_returns_number_and_name(self):
        """Extract number and name from a standard street address."""
        result = _extract_street_parts("123 Main Street")
        assert result is not None
        assert result["number"] == "123"
        assert result["name"] == "Main Street"

    def test_valid_street_with_suite(self):
        """Extract parts from street address with suite."""
        result = _extract_street_parts("456 Oak Ave Suite 100")
        assert result is not None
        assert result["number"] == "456"
        assert result["name"] == "Oak Ave Suite 100"

    def test_no_number_returns_none(self):
        """Return None when street has no leading number."""
        result = _extract_street_parts("Main Street")
        assert result is None

    def test_empty_string_returns_none(self):
        """Return None for empty string."""
        result = _extract_street_parts("")
        assert result is None

    def test_only_number_returns_none(self):
        """Return None when only a number with no street name."""
        result = _extract_street_parts("123")
        assert result is None

    def test_strips_whitespace(self):
        """Handle leading/trailing whitespace."""
        result = _extract_street_parts("  789 Elm Blvd  ")
        assert result is not None
        assert result["number"] == "789"
        assert result["name"] == "Elm Blvd"
