"""
Property-based tests for community milestone detection.

Feature: referral-community, Property 17: Community milestone detection

**Validates: Requirements 8.3**

For any laundry whose total referral count crosses a configured milestone threshold
(50, 100, 250, 500), the community board SHALL include a milestone entry for that
threshold.
"""
from hypothesis import given, settings as hypothesis_settings, assume
from hypothesis import strategies as st


# --- Milestone detection logic (pure function) ---

DEFAULT_MILESTONES = [50, 100, 250, 500]


def detect_milestones(total_referrals, milestones=None):
    """Detect which community milestones have been reached.

    For any laundry whose total referral count crosses a milestone threshold,
    a milestone entry SHALL be included in the community board.

    Args:
        total_referrals: The total number of referrals for the laundry (all time).
        milestones: List of milestone thresholds (default: [50, 100, 250, 500]).

    Returns:
        List of milestone values that have been reached (i.e., total >= threshold).
    """
    if milestones is None:
        milestones = DEFAULT_MILESTONES

    return [m for m in milestones if total_referrals >= m]


def detect_newly_crossed_milestones(previous_total, current_total, milestones=None):
    """Detect milestones newly crossed between previous and current totals.

    This is used to generate milestone announcements on the community board.

    Args:
        previous_total: The previous total referral count.
        current_total: The current total referral count.
        milestones: List of milestone thresholds.

    Returns:
        List of milestone values newly crossed (previous < milestone <= current).
    """
    if milestones is None:
        milestones = DEFAULT_MILESTONES

    return [m for m in milestones if previous_total < m <= current_total]


# --- Hypothesis strategies ---

# Total referrals: between 0 and 1000
total_referrals_strategy = st.integers(min_value=0, max_value=1000)

# Custom milestone lists
milestones_strategy = st.lists(
    st.integers(min_value=1, max_value=1000),
    min_size=1,
    max_size=10,
    unique=True,
).map(sorted)


class TestCommunityMilestoneDetection:
    """Property 17: Community milestone detection.

    For any laundry whose total referral count crosses a configured milestone
    threshold (50, 100, 250, 500), the community board SHALL include a milestone
    entry for that threshold.

    **Validates: Requirements 8.3**
    """

    @given(total_referrals=total_referrals_strategy)
    @hypothesis_settings(max_examples=100)
    def test_milestones_included_when_threshold_crossed(self, total_referrals):
        """When total referrals >= a milestone threshold, that milestone SHALL
        be included in the community board."""
        reached = detect_milestones(total_referrals)

        for milestone in DEFAULT_MILESTONES:
            if total_referrals >= milestone:
                assert milestone in reached, (
                    f"Milestone {milestone} should be included when total={total_referrals}"
                )
            else:
                assert milestone not in reached, (
                    f"Milestone {milestone} should NOT be included when total={total_referrals}"
                )

    @given(
        total_referrals=total_referrals_strategy,
        milestones=milestones_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_all_crossed_milestones_are_included(self, total_referrals, milestones):
        """For any configured milestone list, all thresholds <= total SHALL be included."""
        reached = detect_milestones(total_referrals, milestones)

        expected = [m for m in milestones if total_referrals >= m]
        assert reached == expected, (
            f"With total={total_referrals} and milestones={milestones}, "
            f"expected {expected} but got {reached}"
        )

    @given(
        total_referrals=total_referrals_strategy,
        milestones=milestones_strategy,
    )
    @hypothesis_settings(max_examples=100)
    def test_no_uncrossed_milestones_are_included(self, total_referrals, milestones):
        """Milestones > total referrals SHALL NOT be included."""
        reached = detect_milestones(total_referrals, milestones)

        for m in milestones:
            if total_referrals < m:
                assert m not in reached, (
                    f"Milestone {m} should not be included when total={total_referrals}"
                )

    @given(
        previous_total=total_referrals_strategy,
        increment=st.integers(min_value=1, max_value=200),
    )
    @hypothesis_settings(max_examples=100)
    def test_newly_crossed_milestones_detected(self, previous_total, increment):
        """When referral count increases and crosses a threshold, that milestone
        SHALL be newly detected."""
        current_total = previous_total + increment
        newly_crossed = detect_newly_crossed_milestones(previous_total, current_total)

        for m in DEFAULT_MILESTONES:
            if previous_total < m <= current_total:
                assert m in newly_crossed, (
                    f"Milestone {m} should be newly crossed when going from "
                    f"{previous_total} to {current_total}"
                )
            else:
                assert m not in newly_crossed, (
                    f"Milestone {m} should NOT be newly crossed when going from "
                    f"{previous_total} to {current_total}"
                )

    @given(total_referrals=st.integers(min_value=0, max_value=49))
    @hypothesis_settings(max_examples=100)
    def test_no_milestones_below_first_threshold(self, total_referrals):
        """When total referrals < 50, no default milestones SHALL be reached."""
        reached = detect_milestones(total_referrals)
        assert reached == [], (
            f"No milestones should be reached with total={total_referrals}, got {reached}"
        )

    @given(total_referrals=st.integers(min_value=500, max_value=1000))
    @hypothesis_settings(max_examples=100)
    def test_all_milestones_reached_above_max_threshold(self, total_referrals):
        """When total referrals >= 500, all default milestones SHALL be reached."""
        reached = detect_milestones(total_referrals)
        assert reached == DEFAULT_MILESTONES, (
            f"All milestones should be reached with total={total_referrals}, got {reached}"
        )
