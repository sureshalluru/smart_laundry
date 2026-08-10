"""
Property-based tests for event list filtering correctness.

Feature: referral-community, Property 13: Event list filtering correctness

Validates: Requirements 6.4
"""
from datetime import datetime, timedelta

from hypothesis import given, settings, assume
from hypothesis import strategies as st


# --- In-memory store simulating shop.referral_events ---


class FakeReferralEventStore:
    """In-memory store simulating shop.referral_events table."""

    def __init__(self):
        self._events = []
        self._next_id = 1

    def add_event(
        self,
        laundry_id: str,
        referrer_id: str,
        referee_id: str,
        status: str,
        created_at: datetime,
    ):
        """Insert a referral event with a specific created_at timestamp."""
        event = {
            "id": self._next_id,
            "laundry_id": laundry_id,
            "referrer_id": referrer_id,
            "referee_id": referee_id,
            "status": status,
            "created_at": created_at,
        }
        self._events.append(event)
        self._next_id += 1
        return event

    def filter_events(
        self,
        laundry_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        status_filter: str | None = None,
    ) -> list:
        """Filter events matching the GET /api/referrals/events logic.

        Mirrors the query:
            WHERE re.laundry_id = %s
            AND re.created_at >= %s (if start_date)
            AND re.created_at <= %s (if end_date)
            AND re.status = %s (if status_filter)
            ORDER BY re.created_at DESC
        """
        results = []
        for event in self._events:
            if event["laundry_id"] != laundry_id:
                continue
            if start_date is not None and event["created_at"] < start_date:
                continue
            if end_date is not None and event["created_at"] > end_date:
                continue
            if status_filter is not None and event["status"] != status_filter:
                continue
            results.append(event)

        # Order by created_at DESC (matching endpoint logic)
        results.sort(key=lambda e: e["created_at"], reverse=True)
        return results


# --- Hypothesis strategies ---

VALID_STATUSES = ["signed_up", "first_order_completed", "rewarded"]

status_strategy = st.sampled_from(VALID_STATUSES)

# Generate dates within a reasonable range (past 2 years)
date_strategy = st.datetimes(
    min_value=datetime(2023, 1, 1),
    max_value=datetime(2025, 12, 31),
)

laundry_id_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
    min_size=1,
    max_size=10,
)

# Strategy for generating a list of events
event_strategy = st.fixed_dictionaries(
    {
        "referrer_id": st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
            min_size=1,
            max_size=8,
        ),
        "referee_id": st.text(
            alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd")),
            min_size=1,
            max_size=8,
        ),
        "status": status_strategy,
        "created_at": date_strategy,
    }
)


class TestEventListFilteringCorrectnessProperty:
    """Property 13: Event list filtering correctness.

    For any set of referral events and any combination of date range and status
    filters, the returned events SHALL all satisfy the filter criteria — every
    returned event's created_at SHALL fall within the date range AND its status
    SHALL match the filter.

    **Validates: Requirements 6.4**
    """

    @given(
        laundry_id=laundry_id_strategy,
        events=st.lists(event_strategy, min_size=0, max_size=30),
        status_filter=st.sampled_from(VALID_STATUSES),
    )
    @settings(max_examples=100)
    def test_filtering_by_status_returns_only_matching_status(
        self,
        laundry_id: str,
        events: list,
        status_filter: str,
    ):
        """When filtering by status, all returned events have that status."""
        store = FakeReferralEventStore()

        # Populate the store
        for i, ev in enumerate(events):
            store.add_event(
                laundry_id=laundry_id,
                referrer_id=ev["referrer_id"],
                referee_id=ev["referee_id"],
                status=ev["status"],
                created_at=ev["created_at"],
            )

        # Filter by status only
        results = store.filter_events(
            laundry_id=laundry_id,
            status_filter=status_filter,
        )

        # Assert: every returned event has the filtered status
        for event in results:
            assert event["status"] == status_filter, (
                f"Event {event['id']} has status '{event['status']}', "
                f"expected '{status_filter}'"
            )

        # Assert: count matches expected
        expected_count = sum(1 for ev in events if ev["status"] == status_filter)
        assert len(results) == expected_count, (
            f"Expected {expected_count} events with status '{status_filter}', "
            f"got {len(results)}"
        )

    @given(
        laundry_id=laundry_id_strategy,
        events=st.lists(event_strategy, min_size=0, max_size=30),
        start_date=date_strategy,
        end_date=date_strategy,
    )
    @settings(max_examples=100)
    def test_filtering_by_date_range_returns_only_events_within_range(
        self,
        laundry_id: str,
        events: list,
        start_date: datetime,
        end_date: datetime,
    ):
        """When filtering by date range, all returned events' created_at falls within the range."""
        # Ensure start_date <= end_date
        if start_date > end_date:
            start_date, end_date = end_date, start_date

        store = FakeReferralEventStore()

        # Populate the store
        for i, ev in enumerate(events):
            store.add_event(
                laundry_id=laundry_id,
                referrer_id=ev["referrer_id"],
                referee_id=ev["referee_id"],
                status=ev["status"],
                created_at=ev["created_at"],
            )

        # Filter by date range only
        results = store.filter_events(
            laundry_id=laundry_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Assert: every returned event's created_at is within the range
        for event in results:
            assert event["created_at"] >= start_date, (
                f"Event {event['id']} created_at {event['created_at']} "
                f"is before start_date {start_date}"
            )
            assert event["created_at"] <= end_date, (
                f"Event {event['id']} created_at {event['created_at']} "
                f"is after end_date {end_date}"
            )

        # Assert: count matches expected
        expected_count = sum(
            1
            for ev in events
            if ev["created_at"] >= start_date and ev["created_at"] <= end_date
        )
        assert len(results) == expected_count, (
            f"Expected {expected_count} events in date range, got {len(results)}"
        )

    @given(
        laundry_id=laundry_id_strategy,
        events=st.lists(event_strategy, min_size=0, max_size=30),
        start_date=date_strategy,
        end_date=date_strategy,
        status_filter=st.sampled_from(VALID_STATUSES),
    )
    @settings(max_examples=100)
    def test_filtering_by_both_date_range_and_status(
        self,
        laundry_id: str,
        events: list,
        start_date: datetime,
        end_date: datetime,
        status_filter: str,
    ):
        """When filtering by both date range and status, all returned events satisfy both criteria."""
        # Ensure start_date <= end_date
        if start_date > end_date:
            start_date, end_date = end_date, start_date

        store = FakeReferralEventStore()

        # Populate the store
        for i, ev in enumerate(events):
            store.add_event(
                laundry_id=laundry_id,
                referrer_id=ev["referrer_id"],
                referee_id=ev["referee_id"],
                status=ev["status"],
                created_at=ev["created_at"],
            )

        # Filter by both status and date range
        results = store.filter_events(
            laundry_id=laundry_id,
            start_date=start_date,
            end_date=end_date,
            status_filter=status_filter,
        )

        # Assert: every returned event satisfies BOTH criteria
        for event in results:
            assert event["status"] == status_filter, (
                f"Event {event['id']} has status '{event['status']}', "
                f"expected '{status_filter}'"
            )
            assert event["created_at"] >= start_date, (
                f"Event {event['id']} created_at {event['created_at']} "
                f"is before start_date {start_date}"
            )
            assert event["created_at"] <= end_date, (
                f"Event {event['id']} created_at {event['created_at']} "
                f"is after end_date {end_date}"
            )

        # Assert: count matches expected (no events missing)
        expected_count = sum(
            1
            for ev in events
            if ev["status"] == status_filter
            and ev["created_at"] >= start_date
            and ev["created_at"] <= end_date
        )
        assert len(results) == expected_count, (
            f"Expected {expected_count} events matching both filters, "
            f"got {len(results)}"
        )
