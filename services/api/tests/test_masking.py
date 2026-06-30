"""
Unit tests for mask_name() and mask_email() utility functions.

Validates: Requirements 9.3
"""
from app.routes.company_join import mask_name, mask_email


class TestMaskName:
    """Unit tests for mask_name()."""

    def test_single_char_name(self):
        """Single character name returned as-is."""
        assert mask_name("A") == "A"

    def test_two_char_name(self):
        """Two character name: first char + asterisk."""
        assert mask_name("AB") == "A*"

    def test_three_char_name(self):
        """Three character name: first + asterisk + last."""
        assert mask_name("Abc") == "A*c"

    def test_typical_name(self):
        """Typical company name masks middle characters."""
        assert mask_name("Acme Laundry") == "A**********y"

    def test_preserves_length(self):
        """Masked output has same length as input."""
        name = "Test Company"
        result = mask_name(name)
        assert len(result) == len(name)

    def test_preserves_first_and_last(self):
        """First and last characters are preserved."""
        name = "Hello"
        result = mask_name(name)
        assert result[0] == "H"
        assert result[-1] == "o"

    def test_middle_chars_are_asterisks(self):
        """All middle characters are asterisks."""
        name = "Testing"
        result = mask_name(name)
        assert result[1:-1] == "*****"


class TestMaskEmail:
    """Unit tests for mask_email()."""

    def test_single_char_local(self):
        """Single character local part returned as-is."""
        assert mask_email("a@example.com") == "a@example.com"

    def test_two_char_local(self):
        """Two character local: first + asterisk."""
        assert mask_email("ab@example.com") == "a*@example.com"

    def test_typical_email(self):
        """Typical email masks local part, preserves domain."""
        assert mask_email("john@company.com") == "j**n@company.com"

    def test_preserves_domain(self):
        """Domain is fully preserved."""
        result = mask_email("user@subdomain.example.org")
        assert result.endswith("@subdomain.example.org")

    def test_local_length_preserved(self):
        """Masked local part has same length as original."""
        email = "testuser@domain.com"
        result = mask_email(email)
        local_result = result.split("@")[0]
        local_original = email.split("@")[0]
        assert len(local_result) == len(local_original)

    def test_local_first_and_last_preserved(self):
        """First and last chars of local part preserved."""
        email = "hello@test.com"
        result = mask_email(email)
        local_result = result.split("@")[0]
        assert local_result[0] == "h"
        assert local_result[-1] == "o"

    def test_local_middle_are_asterisks(self):
        """Middle chars of local part are asterisks."""
        email = "testing@domain.com"
        result = mask_email(email)
        local_result = result.split("@")[0]
        assert local_result[1:-1] == "*****"

    def test_email_with_at_in_domain(self):
        """Only splits on first @ sign."""
        # Edge case: technically invalid but tests split behavior
        result = mask_email("user@sub@domain.com")
        assert result == "u**r@sub@domain.com"
