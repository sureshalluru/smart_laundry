"""
Property-based tests for community board privacy formatting.

Feature: referral-community, Property 16: Community board privacy formatting

**Validates: Requirements 8.2, 8.4**

For any customer name (first name + last name), community board activity messages
SHALL contain only the first name, and leaderboard entries SHALL display as
"FirstName L." format. No full last name, email, or phone SHALL appear.
"""
from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- Privacy formatting functions (pure logic) ---


def format_activity_message(first_name, last_name, action="just earned a reward"):
    """Format a community board activity message using first name only.

    Privacy requirement: Only the first name appears in activity messages.
    No last name, email, or phone number.

    Args:
        first_name: Customer's first name
        last_name: Customer's last name (should NOT appear in output)
        action: Description of the activity

    Returns:
        Formatted activity message string
    """
    return f"{first_name} {action}!"


def format_leaderboard_entry(first_name, last_name):
    """Format a leaderboard entry as "FirstName L." (first name + last initial + period).

    Privacy requirement: Only first name and last initial shown.
    No full last name, email, or phone number.

    Args:
        first_name: Customer's first name
        last_name: Customer's last name (only first character used)

    Returns:
        Formatted leaderboard name string, e.g. "John D."
    """
    if last_name:
        return f"{first_name} {last_name[0].upper()}."
    return first_name


# --- Hypothesis strategies ---

# Names: at least 1 char, only letters
first_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
    min_size=1,
    max_size=20,
)

last_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Lu", "Ll")),
    min_size=1,
    max_size=30,
)

# Email-like strings
email_strategy = st.emails()

# Phone-like strings
phone_strategy = st.from_regex(r"\+1[0-9]{10}", fullmatch=True)

# Activity actions
action_strategy = st.sampled_from([
    "just earned a reward",
    "referred a friend",
    "earned their 5th referral reward",
    "joined the community",
])


class TestCommunityBoardPrivacyFormatting:
    """Property 16: Community board privacy formatting.

    For any customer name (first name + last name), community board activity
    messages SHALL contain only the first name, and leaderboard entries SHALL
    display as "FirstName L." format. No full last name, email, or phone
    SHALL appear.

    **Validates: Requirements 8.2, 8.4**
    """

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
        action=action_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_activity_message_contains_only_first_name(
        self, first_name, last_name, action
    ):
        """Activity messages SHALL contain only the first name, not the full last name."""
        assume(len(last_name) > 1)  # Ensure last name is more than 1 char to meaningfully test
        assume(last_name not in first_name)  # Exclude case where last name is substring of first name

        message = format_activity_message(first_name, last_name, action)

        # First name should appear in the message
        assert first_name in message, (
            f"First name '{first_name}' should appear in message: '{message}'"
        )

        # Full last name should NOT appear in the message
        assert last_name not in message, (
            f"Full last name '{last_name}' should NOT appear in message: '{message}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_leaderboard_entry_shows_first_name_and_last_initial(
        self, first_name, last_name
    ):
        """Leaderboard entries SHALL display as 'FirstName L.' format."""
        assume(len(last_name) > 1)
        assume(last_name not in first_name)  # Exclude case where last name is substring of first name

        entry = format_leaderboard_entry(first_name, last_name)

        # Should start with first name
        assert entry.startswith(first_name), (
            f"Leaderboard entry '{entry}' should start with first name '{first_name}'"
        )

        # Should contain the last initial followed by a period
        expected_suffix = f" {last_name[0].upper()}."
        assert entry.endswith(expected_suffix), (
            f"Leaderboard entry '{entry}' should end with '{expected_suffix}'"
        )

        # Full last name should NOT appear
        assert last_name not in entry, (
            f"Full last name '{last_name}' should NOT appear in entry: '{entry}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
        email=email_strategy,
        action=action_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_email_in_activity_message(self, first_name, last_name, email, action):
        """No email address SHALL appear in activity messages."""
        message = format_activity_message(first_name, last_name, action)

        assert email not in message, (
            f"Email '{email}' should NOT appear in activity message: '{message}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
        phone=phone_strategy,
        action=action_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_phone_in_activity_message(self, first_name, last_name, phone, action):
        """No phone number SHALL appear in activity messages."""
        message = format_activity_message(first_name, last_name, action)

        assert phone not in message, (
            f"Phone '{phone}' should NOT appear in activity message: '{message}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
        email=email_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_email_in_leaderboard_entry(self, first_name, last_name, email):
        """No email address SHALL appear in leaderboard entries."""
        assume(len(last_name) > 1)

        entry = format_leaderboard_entry(first_name, last_name)

        assert email not in entry, (
            f"Email '{email}' should NOT appear in leaderboard entry: '{entry}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
        phone=phone_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_phone_in_leaderboard_entry(self, first_name, last_name, phone):
        """No phone number SHALL appear in leaderboard entries."""
        assume(len(last_name) > 1)

        entry = format_leaderboard_entry(first_name, last_name)

        assert phone not in entry, (
            f"Phone '{phone}' should NOT appear in leaderboard entry: '{entry}'"
        )

    @given(
        first_name=first_name_strategy,
        last_name=last_name_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_leaderboard_format_is_exactly_firstname_space_initial_dot(
        self, first_name, last_name
    ):
        """Leaderboard format SHALL be exactly 'FirstName L.' — first name,
        space, uppercase last initial, period."""
        assume(len(last_name) >= 1)

        entry = format_leaderboard_entry(first_name, last_name)

        expected = f"{first_name} {last_name[0].upper()}."
        assert entry == expected, (
            f"Leaderboard entry '{entry}' should be exactly '{expected}'"
        )
