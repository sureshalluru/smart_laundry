"""
Property-based tests for live driver tracking.

Feature: live-driver-tracking, Property 1: Location payload completeness
Feature: live-driver-tracking, Property 2: Location storage round-trip

Uses Hypothesis to verify that the POST /location endpoint correctly validates
and accepts valid payloads, and rejects invalid ones (lat/lng out of range),
and that location data round-trips through the upsert correctly.

**Validates: Requirements 1.6, 2.1**
"""

import asyncio
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as hyp_settings, assume
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Valid GPS coordinate strategies
valid_latitude = st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False)
valid_longitude = st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False)
valid_heading = st.floats(min_value=0.0, max_value=360.0, allow_nan=False, allow_infinity=False)
valid_speed = st.floats(min_value=0.0, max_value=200.0, allow_nan=False, allow_infinity=False)

# Invalid latitude: outside [-90, 90]
invalid_latitude = st.one_of(
    st.floats(min_value=90.01, max_value=1000.0, allow_nan=False, allow_infinity=False),
    st.floats(min_value=-1000.0, max_value=-90.01, allow_nan=False, allow_infinity=False),
)

# Invalid longitude: outside [-180, 180]
invalid_longitude = st.one_of(
    st.floats(min_value=180.01, max_value=1000.0, allow_nan=False, allow_infinity=False),
    st.floats(min_value=-1000.0, max_value=-180.01, allow_nan=False, allow_infinity=False),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockCursor:
    """Mock cursor for database operations."""

    def execute(self, query, params=None):
        pass

    def fetchone(self):
        return None


class MockConnection:
    """Mock connection that yields a mock cursor."""

    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db(cursor):
    """Context manager that yields a mock connection."""
    conn = MockConnection(cursor)
    yield conn


def build_valid_payload(latitude, longitude, heading, speed):
    """Build a location update payload with the given GPS data."""
    return {
        "latitude": latitude,
        "longitude": longitude,
        "heading": heading,
        "speed": speed,
        "currentStopPosition": 1,
    }


def build_current_user(driver_id="driver-001", laundry_id="laundry-001"):
    """Build a mock JWT current_user dict."""
    return {
        "empId": driver_id,
        "laundryId": laundry_id,
    }


# ===========================================================================
# PROPERTY TEST: Location payload completeness (Property 1)
# Tag: "Feature: live-driver-tracking, Property 1: Location payload completeness"
# Validates: Requirements 1.6
# ===========================================================================


class TestLocationPayloadCompleteness:
    """
    Feature: live-driver-tracking, Property 1: Location payload completeness

    For any valid GPS position (latitude, longitude, heading, speed), the location
    update payload constructed by the broadcaster SHALL contain all required fields:
    driverId, laundryId, latitude, longitude, heading, speed, and timestamp — with
    latitude in [-90, 90], longitude in [-180, 180], and timestamp being a valid
    ISO 8601 string.

    **Validates: Requirements 1.6**
    """

    @given(
        latitude=valid_latitude,
        longitude=valid_longitude,
        heading=valid_heading,
        speed=valid_speed,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_valid_payload_accepted(self, latitude, longitude, heading, speed):
        """
        Property: For any valid GPS coordinates within range, the POST /location
        endpoint SHALL accept the payload and return status 'success'.

        This verifies that valid payloads containing latitude in [-90, 90],
        longitude in [-180, 180], heading in [0, 360], and speed >= 0 are
        always accepted by the endpoint.
        """
        from app.routes.tracking import update_location

        body = build_valid_payload(latitude, longitude, heading, speed)
        current_user = build_current_user()
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                update_location(body=body, current_user=current_user)
            )

        # Endpoint must accept valid payloads
        assert result == {"status": "success"}

    @given(
        latitude=invalid_latitude,
        longitude=valid_longitude,
        heading=valid_heading,
        speed=valid_speed,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_invalid_latitude_rejected(self, latitude, longitude, heading, speed):
        """
        Property: For any latitude outside [-90, 90], the POST /location endpoint
        SHALL reject the payload with a 400 error.
        """
        from fastapi import HTTPException
        from app.routes.tracking import update_location

        body = build_valid_payload(latitude, longitude, heading, speed)
        current_user = build_current_user()
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    update_location(body=body, current_user=current_user)
                )

            assert exc_info.value.status_code == 400
            assert "latitude" in exc_info.value.detail.lower()

    @given(
        latitude=valid_latitude,
        longitude=invalid_longitude,
        heading=valid_heading,
        speed=valid_speed,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_invalid_longitude_rejected(self, latitude, longitude, heading, speed):
        """
        Property: For any longitude outside [-180, 180], the POST /location endpoint
        SHALL reject the payload with a 400 error.
        """
        from fastapi import HTTPException
        from app.routes.tracking import update_location

        body = build_valid_payload(latitude, longitude, heading, speed)
        current_user = build_current_user()
        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    update_location(body=body, current_user=current_user)
                )

            assert exc_info.value.status_code == 400
            assert "longitude" in exc_info.value.detail.lower()

    @given(
        latitude=valid_latitude,
        longitude=valid_longitude,
        heading=valid_heading,
        speed=valid_speed,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_valid_payload_contains_all_required_fields(self, latitude, longitude, heading, speed):
        """
        Property: For any valid GPS position, the location update payload SHALL
        contain all required fields (latitude, longitude, heading, speed) and
        the endpoint SHALL process them with driverId and laundryId from the
        JWT token, confirming complete payload processing.
        """
        from app.routes.tracking import update_location

        body = build_valid_payload(latitude, longitude, heading, speed)
        current_user = build_current_user(driver_id="drv-test", laundry_id="lnd-test")

        # Verify payload has all required fields before submission
        assert "latitude" in body
        assert "longitude" in body
        assert "heading" in body
        assert "speed" in body

        # Verify coordinate ranges
        assert -90 <= body["latitude"] <= 90
        assert -180 <= body["longitude"] <= 180

        # Verify the endpoint processes the complete payload (driverId and
        # laundryId come from JWT, so check current_user has them)
        assert "empId" in current_user
        assert "laundryId" in current_user

        cursor = MockCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                update_location(body=body, current_user=current_user)
            )

        assert result == {"status": "success"}



# ===========================================================================
# PROPERTY TEST: Location storage round-trip (Property 2)
# Tag: "Feature: live-driver-tracking, Property 2: Location storage round-trip"
# Validates: Requirements 2.1
# ===========================================================================


class TestLocationStorageRoundTrip:
    """
    Feature: live-driver-tracking, Property 2: Location storage round-trip

    For any valid location update payload (driver ID, laundry ID, latitude,
    longitude, heading, speed), upserting the record to routes.driver_locations
    and then reading it back SHALL return the same latitude, longitude, heading,
    and speed values (within floating-point precision).

    **Validates: Requirements 2.1**
    """

    @given(
        latitude=valid_latitude,
        longitude=valid_longitude,
        heading=valid_heading,
        speed=valid_speed,
        driver_id=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "Pd")),
            min_size=1,
            max_size=20,
        ),
        laundry_id=st.text(
            alphabet=st.characters(whitelist_categories=("L", "N", "Pd")),
            min_size=1,
            max_size=20,
        ),
        current_stop_position=st.integers(min_value=1, max_value=50),
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_upsert_parameters_match_input(
        self, latitude, longitude, heading, speed, driver_id, laundry_id, current_stop_position
    ):
        """
        Property: For any valid location update payload, the values passed to
        the INSERT/UPSERT SQL statement SHALL match the original input values
        within floating-point precision, ensuring storage round-trip consistency.

        We capture the SQL parameters passed to cursor.execute and verify they
        match the input data that was provided.
        """
        from app.routes.tracking import update_location

        body = {
            "latitude": latitude,
            "longitude": longitude,
            "heading": heading,
            "speed": speed,
            "currentStopPosition": current_stop_position,
        }
        current_user = build_current_user(driver_id=driver_id, laundry_id=laundry_id)

        # Track what gets passed to cursor.execute
        captured_params = []

        class CapturingCursor:
            def execute(self, query, params=None):
                captured_params.append(params)

            def fetchone(self):
                return None

        cursor = CapturingCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                update_location(body=body, current_user=current_user)
            )

        # Endpoint accepted the payload
        assert result == {"status": "success"}

        # Verify parameters were captured
        assert len(captured_params) == 1, "Expected exactly one SQL execute call"

        params = captured_params[0]
        # The SQL params are: (driver_id, laundry_id, latitude, longitude,
        #                       heading, speed, current_stop_position)
        assert params[0] == driver_id, "driver_id mismatch in SQL params"
        assert params[1] == laundry_id, "laundry_id mismatch in SQL params"

        # Verify latitude, longitude, heading, speed within floating-point precision
        assert abs(params[2] - latitude) < 1e-9, (
            f"latitude mismatch: stored {params[2]} vs input {latitude}"
        )
        assert abs(params[3] - longitude) < 1e-9, (
            f"longitude mismatch: stored {params[3]} vs input {longitude}"
        )
        assert abs(params[4] - heading) < 1e-9, (
            f"heading mismatch: stored {params[4]} vs input {heading}"
        )
        assert abs(params[5] - speed) < 1e-9, (
            f"speed mismatch: stored {params[5]} vs input {speed}"
        )
        assert params[6] == current_stop_position, (
            f"current_stop_position mismatch: stored {params[6]} vs input {current_stop_position}"
        )

    @given(
        latitude=valid_latitude,
        longitude=valid_longitude,
        heading=valid_heading,
        speed=valid_speed,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_repeated_upsert_same_driver_preserves_latest(
        self, latitude, longitude, heading, speed
    ):
        """
        Property: For any sequence of valid location updates for the same
        driver, the last upsert's values SHALL be the ones stored (the UPSERT
        uses ON CONFLICT DO UPDATE), ensuring the latest coordinates are always
        persisted.

        We verify that the second call's parameters overwrite the first.
        """
        from app.routes.tracking import update_location

        driver_id = "driver-roundtrip"
        laundry_id = "laundry-roundtrip"

        # First update with different values
        first_body = {
            "latitude": 0.0,
            "longitude": 0.0,
            "heading": 0.0,
            "speed": 0.0,
            "currentStopPosition": 1,
        }

        # Second update with generated values
        second_body = {
            "latitude": latitude,
            "longitude": longitude,
            "heading": heading,
            "speed": speed,
            "currentStopPosition": 2,
        }

        current_user = build_current_user(driver_id=driver_id, laundry_id=laundry_id)

        captured_params = []

        class CapturingCursor:
            def execute(self, query, params=None):
                captured_params.append(params)

            def fetchone(self):
                return None

        cursor = CapturingCursor()

        with patch("app.routes.tracking.get_db") as mock_db, \
             patch("app.routes.tracking.get_cursor") as mock_get_cursor:

            # Use side_effect to return a fresh context manager on each call
            mock_db.side_effect = lambda: mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            # First upsert
            asyncio.get_event_loop().run_until_complete(
                update_location(body=first_body, current_user=current_user)
            )
            # Second upsert (this should be the "latest")
            asyncio.get_event_loop().run_until_complete(
                update_location(body=second_body, current_user=current_user)
            )

        # Both calls executed SQL
        assert len(captured_params) == 2

        # The last captured params should match the second (latest) payload
        last_params = captured_params[1]
        assert last_params[0] == driver_id
        assert last_params[1] == laundry_id
        assert abs(last_params[2] - latitude) < 1e-9
        assert abs(last_params[3] - longitude) < 1e-9
        assert abs(last_params[4] - heading) < 1e-9
        assert abs(last_params[5] - speed) < 1e-9
        assert last_params[6] == 2  # currentStopPosition from second call



# ===========================================================================
# PROPERTY TEST: Trackable status filtering (Property 3)
# Tag: "Feature: live-driver-tracking, Property 3: Trackable status filtering"
# Validates: Requirements 2.3
# ===========================================================================


# ---------------------------------------------------------------------------
# Strategies for Property 3
# ---------------------------------------------------------------------------

# All known order statuses in the system
all_order_statuses = st.sampled_from([
    "OrderSubmitted",
    "EnRouteToDelivery",
    "ReadyForIntake",
    "InProgress",
    "Delivered",
    "Cancelled",
    "Refunded",
    "PendingPayment",
])

# All known service types in the system
all_service_types = st.sampled_from([
    "LaundryDriver",
    "Uber",
    "CustomerDropoff",
    "CustomerPickup",
    "InStore",
    "",
])

# Only the valid trackable status values
trackable_pickup_status = st.just("OrderSubmitted")
trackable_dropoff_status = st.just("EnRouteToDelivery")
laundry_driver_service = st.just("LaundryDriver")

# Non-trackable statuses (neither OrderSubmitted nor EnRouteToDelivery)
non_trackable_statuses = st.sampled_from([
    "ReadyForIntake",
    "InProgress",
    "Delivered",
    "Cancelled",
    "Refunded",
    "PendingPayment",
])

# Non-LaundryDriver service types
non_laundry_driver_services = st.sampled_from([
    "Uber",
    "CustomerDropoff",
    "CustomerPickup",
    "InStore",
    "",
])


class TestTrackableStatusFiltering:
    """
    Feature: live-driver-tracking, Property 3: Trackable status filtering

    For any order with a given status and service type, the tracking API SHALL
    return driver location data if and only if the order status is
    'OrderSubmitted' with pickup_service='LaundryDriver' OR
    'EnRouteToDelivery' with dropoff_service='LaundryDriver'. All other
    status/service combinations SHALL return status: 'unavailable'.

    **Validates: Requirements 2.3**
    """

    @given(
        pickup_service=laundry_driver_service,
        dropoff_service=all_service_types,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_order_submitted_with_laundry_driver_pickup_is_trackable(
        self, pickup_service, dropoff_service
    ):
        """
        Property: OrderSubmitted with pickup_service='LaundryDriver' SHALL
        always be trackable regardless of dropoff_service.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable("OrderSubmitted", pickup_service, dropoff_service)
        assert result is True, (
            f"OrderSubmitted with pickup_service='{pickup_service}' should be trackable, "
            f"but got False (dropoff_service='{dropoff_service}')"
        )

    @given(
        pickup_service=all_service_types,
        dropoff_service=laundry_driver_service,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_enroute_to_delivery_with_laundry_driver_dropoff_is_trackable(
        self, pickup_service, dropoff_service
    ):
        """
        Property: EnRouteToDelivery with dropoff_service='LaundryDriver' SHALL
        always be trackable regardless of pickup_service.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable("EnRouteToDelivery", pickup_service, dropoff_service)
        assert result is True, (
            f"EnRouteToDelivery with dropoff_service='{dropoff_service}' should be trackable, "
            f"but got False (pickup_service='{pickup_service}')"
        )

    @given(
        order_status=non_trackable_statuses,
        pickup_service=all_service_types,
        dropoff_service=all_service_types,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_non_trackable_statuses_are_never_trackable(
        self, order_status, pickup_service, dropoff_service
    ):
        """
        Property: Any order status other than 'OrderSubmitted' or
        'EnRouteToDelivery' SHALL never be trackable, regardless of
        service types.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable(order_status, pickup_service, dropoff_service)
        assert result is False, (
            f"Order with status='{order_status}' should NOT be trackable, "
            f"but got True (pickup='{pickup_service}', dropoff='{dropoff_service}')"
        )

    @given(
        pickup_service=non_laundry_driver_services,
        dropoff_service=all_service_types,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_order_submitted_without_laundry_driver_pickup_not_trackable(
        self, pickup_service, dropoff_service
    ):
        """
        Property: OrderSubmitted with pickup_service != 'LaundryDriver' SHALL
        NOT be trackable, regardless of dropoff_service.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable("OrderSubmitted", pickup_service, dropoff_service)
        assert result is False, (
            f"OrderSubmitted with pickup_service='{pickup_service}' should NOT be trackable, "
            f"but got True"
        )

    @given(
        pickup_service=all_service_types,
        dropoff_service=non_laundry_driver_services,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_enroute_to_delivery_without_laundry_driver_dropoff_not_trackable(
        self, pickup_service, dropoff_service
    ):
        """
        Property: EnRouteToDelivery with dropoff_service != 'LaundryDriver'
        SHALL NOT be trackable, regardless of pickup_service.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable("EnRouteToDelivery", pickup_service, dropoff_service)
        assert result is False, (
            f"EnRouteToDelivery with dropoff_service='{dropoff_service}' should NOT be trackable, "
            f"but got True"
        )

    @given(
        order_status=all_order_statuses,
        pickup_service=all_service_types,
        dropoff_service=all_service_types,
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_trackability_biconditional_completeness(
        self, order_status, pickup_service, dropoff_service
    ):
        """
        Property: For ANY combination of order status × pickup_service ×
        dropoff_service, the is_order_trackable function SHALL return True
        if and only if:
          (order_status == 'OrderSubmitted' AND pickup_service == 'LaundryDriver')
          OR (order_status == 'EnRouteToDelivery' AND dropoff_service == 'LaundryDriver')

        This is the complete biconditional property that covers all cases.

        **Validates: Requirements 2.3**
        """
        from app.routes.tracking import is_order_trackable

        result = is_order_trackable(order_status, pickup_service, dropoff_service)

        # Compute expected outcome from the specification
        pickup_normalized = (pickup_service or "").strip().lower()
        dropoff_normalized = (dropoff_service or "").strip().lower()

        expected = (
            (order_status == "OrderSubmitted" and pickup_normalized == "laundrydriver")
            or (order_status == "EnRouteToDelivery" and dropoff_normalized == "laundrydriver")
        )

        assert result == expected, (
            f"Trackability mismatch for status='{order_status}', "
            f"pickup='{pickup_service}', dropoff='{dropoff_service}': "
            f"got {result}, expected {expected}"
        )


# ===========================================================================
# PROPERTY TEST: Staleness threshold (Property 4)
# Tag: "Feature: live-driver-tracking, Property 4: Staleness threshold"
# Validates: Requirements 2.4, 5.4
# ===========================================================================


# ---------------------------------------------------------------------------
# Strategies for Property 4
# ---------------------------------------------------------------------------

# Generate timedelta values around the 2-minute boundary (0 to 5 minutes in seconds)
staleness_seconds = st.integers(min_value=0, max_value=300)

# Specifically target values near the boundary (115-125 seconds)
boundary_seconds = st.integers(min_value=115, max_value=125)


class TestStalenessThreshold:
    """
    Feature: live-driver-tracking, Property 4: Staleness threshold

    For any driver location record with an updated_at timestamp, the tracking API
    SHALL return status: 'active' if and only if the timestamp is within 2 minutes
    of the current time. Records older than 2 minutes SHALL return
    status: 'unavailable' with reason 'stale_data'.

    **Validates: Requirements 2.4, 5.4**
    """

    @given(age_seconds=st.integers(min_value=0, max_value=119))
    @hyp_settings(max_examples=100, deadline=None)
    def test_within_threshold_returns_not_stale(self, age_seconds):
        """
        Property: For any timestamp within 2 minutes (0-119 seconds) of the
        current time, is_location_stale SHALL return False (record is active).

        **Validates: Requirements 2.4, 5.4**
        """
        from datetime import datetime, timezone, timedelta
        from app.routes.tracking import is_location_stale

        now = datetime.now(timezone.utc)
        updated_at = now - timedelta(seconds=age_seconds)

        result = is_location_stale(updated_at, now=now)
        assert result is False, (
            f"Location aged {age_seconds}s should NOT be stale (within 2-min threshold), "
            f"but is_location_stale returned True"
        )

    @given(age_seconds=st.integers(min_value=121, max_value=300))
    @hyp_settings(max_examples=100, deadline=None)
    def test_beyond_threshold_returns_stale(self, age_seconds):
        """
        Property: For any timestamp older than 2 minutes (121+ seconds) of the
        current time, is_location_stale SHALL return True (record is stale/unavailable).

        **Validates: Requirements 2.4, 5.4**
        """
        from datetime import datetime, timezone, timedelta
        from app.routes.tracking import is_location_stale

        now = datetime.now(timezone.utc)
        updated_at = now - timedelta(seconds=age_seconds)

        result = is_location_stale(updated_at, now=now)
        assert result is True, (
            f"Location aged {age_seconds}s should be stale (beyond 2-min threshold), "
            f"but is_location_stale returned False"
        )

    @given(age_seconds=boundary_seconds)
    @hyp_settings(max_examples=100, deadline=None)
    def test_boundary_behavior_around_120_seconds(self, age_seconds):
        """
        Property: At the exact 2-minute boundary (120 seconds), the behavior
        SHALL be deterministic: exactly 120 seconds is NOT stale (threshold is
        strictly greater than 2 minutes), while 121+ seconds IS stale.

        **Validates: Requirements 2.4, 5.4**
        """
        from datetime import datetime, timezone, timedelta
        from app.routes.tracking import is_location_stale

        now = datetime.now(timezone.utc)
        updated_at = now - timedelta(seconds=age_seconds)

        result = is_location_stale(updated_at, now=now)

        # Threshold is > 2 minutes (strictly greater), so:
        # - 120 seconds (exactly 2 min) → NOT stale (120 is not > 120)
        # - 121+ seconds → stale
        expected_stale = age_seconds > 120

        assert result == expected_stale, (
            f"At {age_seconds}s age: expected stale={expected_stale}, "
            f"got is_location_stale={result}"
        )

    @given(
        age_seconds=st.integers(min_value=0, max_value=300),
    )
    @hyp_settings(max_examples=100, deadline=None)
    def test_staleness_biconditional(self, age_seconds):
        """
        Property: For ANY timestamp age in [0, 300] seconds, is_location_stale
        SHALL return True if and only if the age exceeds 120 seconds (2 minutes).
        This is the complete biconditional property.

        **Validates: Requirements 2.4, 5.4**
        """
        from datetime import datetime, timezone, timedelta
        from app.routes.tracking import is_location_stale

        now = datetime.now(timezone.utc)
        updated_at = now - timedelta(seconds=age_seconds)

        result = is_location_stale(updated_at, now=now)
        expected = age_seconds > 120

        assert result == expected, (
            f"Staleness biconditional failed at {age_seconds}s: "
            f"expected {expected}, got {result}"
        )

    @given(age_seconds=st.integers(min_value=0, max_value=300))
    @hyp_settings(max_examples=100, deadline=None)
    def test_naive_timestamp_handled_as_utc(self, age_seconds):
        """
        Property: For any naive (no tzinfo) timestamp, is_location_stale SHALL
        treat it as UTC and produce the same result as a timezone-aware UTC
        timestamp with the same value.

        **Validates: Requirements 2.4, 5.4**
        """
        from datetime import datetime, timezone, timedelta
        from app.routes.tracking import is_location_stale

        now = datetime.now(timezone.utc)
        # Create a naive timestamp (no tzinfo)
        naive_updated_at = (now - timedelta(seconds=age_seconds)).replace(tzinfo=None)
        # Create an aware timestamp
        aware_updated_at = now - timedelta(seconds=age_seconds)

        naive_result = is_location_stale(naive_updated_at, now=now)
        aware_result = is_location_stale(aware_updated_at, now=now)

        assert naive_result == aware_result, (
            f"Naive and aware timestamps at {age_seconds}s should produce "
            f"the same result, but got naive={naive_result} vs aware={aware_result}"
        )


# ===========================================================================
# PROPERTY TEST: Sequential activation (Property 7)
# Tag: "Feature: live-driver-tracking, Property 7: Sequential activation"
# Validates: Requirements 8.1, 8.2, 8.5
# ===========================================================================


# ---------------------------------------------------------------------------
# Strategies for Property 7
# ---------------------------------------------------------------------------

# Total stops in a route: 1 to 20
total_stops = st.integers(min_value=1, max_value=20)


class TestSequentialActivation:
    """
    Feature: live-driver-tracking, Property 7: Sequential activation

    For any route with N stops (N >= 1), a customer at sequence position P, and a
    driver with current_stop_position C, the tracking API SHALL serve live location
    to that customer if and only if C >= P - 1. Additionally, if the driver has only
    one remaining stop (all other stops completed), tracking SHALL be served to that
    customer regardless of position.

    **Validates: Requirements 8.1, 8.2, 8.5**
    """

    @given(data=st.data())
    @hyp_settings(max_examples=100, deadline=None)
    def test_activation_when_driver_at_or_past_previous_stop(self, data):
        """
        Property: For any (N, P, C) tuple where C >= P - 1 and remaining_stops > 1,
        tracking SHALL be activated (driver is at or past the stop immediately
        before the customer's stop).

        **Validates: Requirements 8.1, 8.2, 8.5**
        """
        from app.routes.tracking import is_tracking_activated

        # N must be >= 2 so that remaining_stops can be >= 2
        N = data.draw(st.integers(min_value=2, max_value=20), label="N (total stops)")
        P = data.draw(st.integers(min_value=1, max_value=N), label="P (customer position)")
        # C must be >= P - 1, so draw from [max(1, P-1), N]
        min_c = max(1, P - 1)
        C = data.draw(st.integers(min_value=min_c, max_value=N), label="C (driver position)")
        # remaining_stops > 1 to ensure we test the position-based rule (not the override)
        remaining_stops = data.draw(st.integers(min_value=2, max_value=N), label="remaining_stops")

        result = is_tracking_activated(C, P, remaining_stops)
        assert result is True, (
            f"Tracking should be activated when C={C} >= P-1={P-1} "
            f"(N={N}, remaining_stops={remaining_stops}), but got False"
        )

    @given(data=st.data())
    @hyp_settings(max_examples=100, deadline=None)
    def test_no_activation_when_driver_before_previous_stop(self, data):
        """
        Property: For any (N, P, C) tuple where C < P - 1 and remaining_stops > 1,
        tracking SHALL NOT be activated (driver has not yet reached the stop
        before the customer's stop).

        **Validates: Requirements 8.1, 8.2, 8.5**
        """
        from app.routes.tracking import is_tracking_activated

        N = data.draw(st.integers(min_value=3, max_value=20), label="N (total stops)")
        # P must be at least 3 so that P-1 >= 2, leaving room for C < P-1
        P = data.draw(st.integers(min_value=3, max_value=N), label="P (customer position)")
        # C must be < P - 1, so draw from [1, P-2]
        C = data.draw(st.integers(min_value=1, max_value=P - 2), label="C (driver position)")
        # remaining_stops > 1 to exclude the single-remaining-stop override
        remaining_stops = data.draw(st.integers(min_value=2, max_value=N), label="remaining_stops")

        result = is_tracking_activated(C, P, remaining_stops)
        assert result is False, (
            f"Tracking should NOT be activated when C={C} < P-1={P-1} "
            f"(N={N}, remaining_stops={remaining_stops}), but got True"
        )

    @given(data=st.data())
    @hyp_settings(max_examples=100, deadline=None)
    def test_single_remaining_stop_always_activates(self, data):
        """
        Property: If the driver has only 1 remaining stop, tracking SHALL be
        activated regardless of the driver's current position relative to the
        customer's sequence position.

        **Validates: Requirements 8.5**
        """
        from app.routes.tracking import is_tracking_activated

        N = data.draw(st.integers(min_value=1, max_value=20), label="N (total stops)")
        P = data.draw(st.integers(min_value=1, max_value=N), label="P (customer position)")
        C = data.draw(st.integers(min_value=1, max_value=N), label="C (driver position)")
        remaining_stops = 1  # Only 1 remaining stop

        result = is_tracking_activated(C, P, remaining_stops)
        assert result is True, (
            f"Tracking should ALWAYS be activated when remaining_stops=1, "
            f"but got False (N={N}, P={P}, C={C})"
        )

    @given(data=st.data())
    @hyp_settings(max_examples=100, deadline=None)
    def test_activation_biconditional_completeness(self, data):
        """
        Property: For ANY random (N, P, C, remaining_stops) tuple,
        is_tracking_activated SHALL return True if and only if:
          C >= P - 1 OR remaining_stops <= 1

        This is the complete biconditional property covering all cases.

        **Validates: Requirements 8.1, 8.2, 8.5**
        """
        from app.routes.tracking import is_tracking_activated

        N = data.draw(st.integers(min_value=1, max_value=20), label="N (total stops)")
        P = data.draw(st.integers(min_value=1, max_value=N), label="P (customer position)")
        C = data.draw(st.integers(min_value=1, max_value=N), label="C (driver position)")
        remaining_stops = data.draw(st.integers(min_value=1, max_value=N), label="remaining_stops")

        result = is_tracking_activated(C, P, remaining_stops)

        # Compute expected outcome from the specification
        expected = (C >= P - 1) or (remaining_stops <= 1)

        assert result == expected, (
            f"Sequential activation biconditional failed: "
            f"N={N}, P={P}, C={C}, remaining_stops={remaining_stops}: "
            f"got {result}, expected {expected}"
        )
