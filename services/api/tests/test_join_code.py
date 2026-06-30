"""
Unit tests for the join_code service module.

Tests the generate_join_code() function and the retry helper.
"""
import re
from unittest.mock import patch, MagicMock

import psycopg
import pytest

from app.services.join_code import generate_join_code, generate_join_code_with_retry


# ---------------------------------------------------------------------------
# generate_join_code() unit tests
# ---------------------------------------------------------------------------


class TestGenerateJoinCode:
    """Unit tests for the generate_join_code function."""

    def test_basic_company_name(self):
        """Standard company name produces valid format."""
        code = generate_join_code("Acme Laundry Co")
        assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', code)
        assert code.startswith("ACME-")

    def test_short_name_padded_with_x(self):
        """Names with fewer than 4 alphanumeric chars are padded with X."""
        code = generate_join_code("Hi")
        assert code.startswith("HIXX-")

    def test_single_char_name(self):
        """Single character name pads with three X's."""
        code = generate_join_code("A")
        assert code.startswith("AXXX-")

    def test_non_alphanumeric_chars_stripped(self):
        """Non-alphanumeric characters are ignored in prefix derivation."""
        code = generate_join_code("A!@#$%^&*()")
        assert code.startswith("AXXX-")

    def test_numeric_chars_in_name(self):
        """Numeric characters in company name are included."""
        code = generate_join_code("123 Main St Laundry")
        assert code.startswith("123M-")

    def test_lowercase_uppercased(self):
        """Lowercase characters are uppercased."""
        code = generate_join_code("acme")
        assert code.startswith("ACME-")

    def test_output_format_regex(self):
        """Output always matches the expected format."""
        names = ["Test", "ABCDEFGH", "x", "12", "Hello World!", "café"]
        for name in names:
            code = generate_join_code(name)
            assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', code), f"Failed for name: {name}"

    def test_output_length(self):
        """Output is always exactly 9 characters (4 + dash + 4)."""
        code = generate_join_code("Any Company Name")
        assert len(code) == 9

    def test_unicode_alphanumeric_handling(self):
        """Unicode letters that are not ASCII alphanumeric are stripped."""
        code = generate_join_code("café")
        # 'c', 'a', 'f' are ASCII alphanumeric; 'é' is NOT ASCII so it's stripped
        # Result prefix: "CAF" + pad -> "CAFX"
        assert code.startswith("CAFX-")
        assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', code)


# ---------------------------------------------------------------------------
# generate_join_code_with_retry() unit tests
# ---------------------------------------------------------------------------


class TestGenerateJoinCodeWithRetry:
    """Unit tests for the retry helper."""

    def test_success_on_first_attempt(self):
        """Successful insert on first try returns the code."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()

        with patch("app.services.join_code.get_cursor", return_value=mock_cursor):
            result = generate_join_code_with_retry("Test Company", mock_conn, "comp-123")

        assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', result)
        assert result.startswith("TEST-")
        mock_cursor.execute.assert_called_once()

    def test_retries_on_unique_violation(self):
        """Retries on UniqueViolation and succeeds on second attempt."""
        mock_conn = MagicMock()
        mock_cursor_fail = MagicMock()
        mock_cursor_success = MagicMock()

        # First call raises UniqueViolation, second succeeds
        mock_cursor_fail.execute.side_effect = psycopg.errors.UniqueViolation()

        call_count = [0]

        def mock_get_cursor(conn):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_cursor_fail
            return mock_cursor_success

        with patch("app.services.join_code.get_cursor", side_effect=mock_get_cursor):
            result = generate_join_code_with_retry("Test Company", mock_conn, "comp-123")

        assert re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', result)
        mock_conn.rollback.assert_called_once()

    def test_raises_after_max_attempts(self):
        """Raises RuntimeError after exhausting all retry attempts."""
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = psycopg.errors.UniqueViolation()

        with patch("app.services.join_code.get_cursor", return_value=mock_cursor):
            with pytest.raises(RuntimeError, match="Could not generate a unique join code"):
                generate_join_code_with_retry("Test Company", mock_conn, "comp-123")

        # Should have called rollback for each failed attempt
        assert mock_conn.rollback.call_count == 10
