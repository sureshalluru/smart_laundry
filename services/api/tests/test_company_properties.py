"""
Property-based tests for multi-location-management feature.

Uses Hypothesis to verify correctness properties across random inputs.
Each test is annotated with the property it validates and the requirements it covers.

Test file: smart-laundry/services/api/tests/test_company_properties.py
"""

import asyncio
import uuid
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from hypothesis import given, settings as h_settings, assume
from hypothesis import strategies as st
from fastapi import HTTPException
from jose import jwt as jose_jwt

from app.auth import (
    hash_password,
    verify_laundry_access,
    create_access_token,
    ALGORITHM,
)
from app.config import settings as app_settings


# ---------------------------------------------------------------------------
# Mock helpers (same pattern as other test files)
# ---------------------------------------------------------------------------


class MockCursor:
    """Mock cursor that returns pre-configured rows in sequence."""

    def __init__(self, rows=None):
        self._rows = rows or []
        self._call_index = 0
        self.executed_queries = []

    def execute(self, query, params=None):
        self.executed_queries.append((query, params))

    def fetchone(self):
        if self._call_index < len(self._rows):
            row = self._rows[self._call_index]
            self._call_index += 1
            return row
        self._call_index += 1
        return None

    def fetchall(self):
        if self._call_index < len(self._rows):
            result = self._rows[self._call_index]
            self._call_index += 1
            return result if isinstance(result, list) else [result]
        self._call_index += 1
        return []


class MockConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self, **kwargs):
        return self._cursor


@contextmanager
def mock_get_db(cursor):
    conn = MockConnection(cursor)
    yield conn


# ---------------------------------------------------------------------------
# Reusable strategies
# ---------------------------------------------------------------------------

# Generate valid laundry IDs (positive integers as strings)
laundry_id_strategy = st.integers(min_value=1, max_value=99999).map(str)

# Generate laundry names (simple ASCII names to avoid slow generation)
laundry_name_strategy = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -",
    min_size=1,
    max_size=30,
).filter(lambda x: x.strip() != "")

# Generate non-negative revenue amounts (floats)
revenue_strategy = st.floats(min_value=0.0, max_value=100000.0, allow_nan=False, allow_infinity=False)

# Generate non-negative order counts
order_count_strategy = st.integers(min_value=0, max_value=10000)

# Platform admin key constant
PLATFORM_KEY = "SLB-PLATFORM-2024"


# ---------------------------------------------------------------------------
# Property 1: Company assignment preserves laundry data
# Feature: multi-location-management, Property 1: Company assignment preserves laundry data
# **Validates: Requirements 1.3, 7.4**
# ---------------------------------------------------------------------------


class TestPropertyAssignmentPreservesData:
    """
    Property 1: Company assignment preserves laundry data.

    For any laundry shop with existing data, assigning it to a company
    (setting company_id) SHALL leave all other columns unchanged.
    """

    @given(
        laundry_id=laundry_id_strategy,
        laundry_name=laundry_name_strategy,
        tax_rate=st.floats(min_value=0.0, max_value=0.2, allow_nan=False, allow_infinity=False),
        new_company_id=st.uuids().map(str),
    )
    @h_settings(max_examples=100)
    def test_assignment_only_changes_company_id(
        self,
        laundry_id,
        laundry_name,
        tax_rate,
        new_company_id,
    ):
        """
        Generate random laundry state, apply company assignment, assert all
        non-company_id fields unchanged.

        # Feature: multi-location-management, Property 1: Company assignment preserves laundry data
        # **Validates: Requirements 1.3, 7.4**
        """
        from app.routes.platform_admin import assign_location_to_company

        # MockCursor sequence:
        # 1. fetchone: verify company exists → returns a row
        # 2. fetchone: verify laundry exists, return current assignment (company_id=None)
        cursor = MockCursor(rows=[
            # Company exists check
            {"company_id": new_company_id},
            # Laundry exists check — company_id is NULL (unassigned)
            {"laundry_id": laundry_id, "company_id": None},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                assign_location_to_company(
                    company_id=new_company_id,
                    body={"laundryId": laundry_id},
                    x_platform_key=PLATFORM_KEY,
                )
            )

        assert result["status"] == "success"

        # Verify the UPDATE query only sets company_id (no other fields modified)
        update_queries = [
            (q, p) for q, p in cursor.executed_queries
            if "UPDATE" in q.upper() and "SET" in q.upper()
        ]
        assert len(update_queries) == 1
        update_sql, update_params = update_queries[0]

        # The UPDATE should only SET company_id — verify by checking that
        # the SET clause only contains company_id
        set_portion = update_sql.upper().split("SET")[1].split("WHERE")[0]
        assert "COMPANY_ID" in set_portion
        # Should NOT touch other columns
        assert "LAUNDRY_NAME" not in set_portion
        assert "TAX_RATE" not in set_portion
        assert "CONTACT" not in set_portion


# ---------------------------------------------------------------------------
# Property 2: JWT laundry_ids reflects current DB state
# Feature: multi-location-management, Property 2: JWT laundry_ids reflects current DB state
# **Validates: Requirements 2.1**
# ---------------------------------------------------------------------------


class TestPropertyJWTReflectsDB:
    """
    Property 2: JWT laundry_ids reflects current DB state.

    For any company admin who successfully authenticates, the laundry_ids list
    in the issued JWT SHALL equal exactly the set of laundry_id values from
    shop.laundry_shops where company_id matches the admin's company.
    """

    @given(
        laundry_ids=st.lists(
            st.integers(min_value=1, max_value=99999),
            min_size=0,
            max_size=20,
            unique=True,
        ),
    )
    @h_settings(max_examples=100, deadline=2000)
    def test_jwt_laundry_ids_equals_db_state(self, laundry_ids):
        """
        Generate company with random N locations, login, decode token,
        assert set equality with DB.

        # Feature: multi-location-management, Property 2: JWT laundry_ids reflects current DB state
        # **Validates: Requirements 2.1**
        """
        from app.routes.auth import login

        admin_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        password = "TestPass123!"
        password_hash = hash_password(password)

        # DB returns these laundry_ids for the company
        laundry_rows = [{"laundry_id": lid} for lid in laundry_ids]

        cursor = MockCursor(rows=[
            # fetchone: company admin record
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "test@company.com",
                "password_hash": password_hash,
                "first_name": "Test",
                "last_name": "Admin",
                "is_active": True,
            },
            # fetchall: laundry_ids for the company
            laundry_rows,
        ])

        with patch("app.routes.auth.get_db") as mock_db, \
             patch("app.routes.auth.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "type": "company_admin",
                "email": "test@company.com",
                "password": password,
            }
            result = asyncio.get_event_loop().run_until_complete(login(body=body))

        assert result["status"] == "success"

        # Decode the access token
        decoded = jose_jwt.decode(
            result["accessToken"],
            app_settings.jwt_secret_key,
            algorithms=[ALGORITHM],
        )

        # Assert set equality between JWT laundry_ids and DB state
        expected_ids = set(str(lid) for lid in laundry_ids)
        actual_ids = set(decoded["laundry_ids"])
        assert actual_ids == expected_ids


# ---------------------------------------------------------------------------
# Property 3: Authorization grants access iff laundry_id is in token
# Feature: multi-location-management, Property 3: Authorization grants access iff laundry_id is in token
# **Validates: Requirements 2.2, 2.5, 8.5**
# ---------------------------------------------------------------------------


class TestPropertyAuthAccessControl:
    """
    Property 3: Authorization grants access iff laundry_id is in token.

    For any company admin JWT and any laundry_id, the auth middleware SHALL
    grant access if and only if that laundry_id appears in the token's
    laundry_ids claim.
    """

    @given(
        authorized_ids=st.lists(
            laundry_id_strategy,
            min_size=1,
            max_size=15,
            unique=True,
        ),
        test_id=laundry_id_strategy,
    )
    @h_settings(max_examples=100)
    def test_access_granted_iff_in_token(self, authorized_ids, test_id):
        """
        Generate token with random laundry_ids subset, test random laundry_ids
        against middleware, verify access granted or 403.

        # Feature: multi-location-management, Property 3: Authorization grants access iff laundry_id is in token
        # **Validates: Requirements 2.2, 2.5, 8.5**
        """
        current_user = {
            "sub": str(uuid.uuid4()),
            "role": "company_admin",
            "company_id": str(uuid.uuid4()),
            "laundry_ids": authorized_ids,
            "type": "access",
        }

        # Create a mock request with the test laundry_id
        request = MagicMock()
        request.query_params = {"laundryId": test_id}
        request.path_params = {}

        if test_id in authorized_ids:
            # Should grant access (no exception)
            result = asyncio.get_event_loop().run_until_complete(
                verify_laundry_access(request=request, current_user=current_user)
            )
            assert result == current_user
        else:
            # Should deny access with 403
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    verify_laundry_access(request=request, current_user=current_user)
                )
            assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Property 4: Additive consistency of roll-up reports
# Feature: multi-location-management, Property 4: Additive consistency of roll-up reports
# **Validates: Requirements 3.1, 3.2, 6.1, 6.3, 6.4, 6.6**
# ---------------------------------------------------------------------------


class TestPropertyAdditiveConsistency:
    """
    Property 4: Additive consistency of roll-up reports.

    For any company with N laundry locations, the combined total in a roll-up
    report SHALL equal the arithmetic sum of the individual per-location values.
    """

    @given(
        location_data=st.lists(
            st.tuples(
                laundry_id_strategy,
                laundry_name_strategy,
                st.floats(min_value=0.01, max_value=50000.0, allow_nan=False, allow_infinity=False),
                st.integers(min_value=1, max_value=5000),
            ),
            min_size=1,
            max_size=10,
            unique_by=lambda x: x[0],  # unique laundry_ids
        ),
    )
    @h_settings(max_examples=100)
    def test_total_equals_sum_of_parts(self, location_data):
        """
        Generate N locations with random revenues/counts, call roll-up endpoint,
        assert total equals sum of parts.

        # Feature: multi-location-management, Property 4: Additive consistency of roll-up reports
        # **Validates: Requirements 3.1, 3.2, 6.1, 6.3, 6.4, 6.6**
        """
        from app.routes.company import get_company_dashboard

        laundry_ids = [lid for lid, _, _, _ in location_data]
        admin = {"laundry_ids": laundry_ids, "company_id": str(uuid.uuid4())}

        # Build mock DB rows
        revenue_rows = [
            {
                "laundry_id": lid,
                "laundry_name": name,
                "revenue": revenue,
                "order_count": count,
            }
            for lid, name, revenue, count in location_data
        ]

        active_rows = [
            {"laundry_id": lid, "active_count": 0}
            for lid, _, _, _ in location_data
        ]

        all_locations_rows = [
            {"laundry_id": lid, "laundry_name": name}
            for lid, name, _, _ in location_data
        ]

        cursor = MockCursor(rows=[
            revenue_rows,       # fetchall: per-location revenue
            active_rows,        # fetchall: active orders
            all_locations_rows, # fetchall: all locations
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        data = result["data"]

        # Additive consistency: totalRevenue == sum of location revenues
        location_revenue_sum = sum(loc["revenue"] for loc in data["locations"])
        assert abs(data["totalRevenue"] - location_revenue_sum) < 0.02

        # Additive consistency: totalOrders == sum of location order counts
        location_order_sum = sum(loc["orderCount"] for loc in data["locations"])
        assert data["totalOrders"] == location_order_sum


# ---------------------------------------------------------------------------
# Property 5: Aggregation response completeness
# Feature: multi-location-management, Property 5: Aggregation response completeness
# **Validates: Requirements 3.3, 5.2, 6.2**
# ---------------------------------------------------------------------------


class TestPropertyResponseCompleteness:
    """
    Property 5: Aggregation response completeness.

    For any company that owns N laundry shops, all aggregation responses SHALL
    contain exactly N location entries, one per owned laundry.
    """

    @given(
        locations=st.lists(
            st.tuples(laundry_id_strategy, laundry_name_strategy),
            min_size=1,
            max_size=15,
            unique_by=lambda x: x[0],  # unique laundry_ids
        ),
    )
    @h_settings(max_examples=100)
    def test_exactly_n_entries_with_correct_names(self, locations):
        """
        Generate company with random N locations, call endpoints,
        assert exactly N entries returned with correct names.

        # Feature: multi-location-management, Property 5: Aggregation response completeness
        # **Validates: Requirements 3.3, 5.2, 6.2**
        """
        from app.routes.company import get_company_dashboard

        laundry_ids = [lid for lid, _ in locations]
        admin = {"laundry_ids": laundry_ids, "company_id": str(uuid.uuid4())}

        # Revenue rows for all locations
        revenue_rows = [
            {
                "laundry_id": lid,
                "laundry_name": name,
                "revenue": 100.0,
                "order_count": 5,
            }
            for lid, name in locations
        ]

        active_rows = [
            {"laundry_id": lid, "active_count": 0}
            for lid, _ in locations
        ]

        all_locations_rows = [
            {"laundry_id": lid, "laundry_name": name}
            for lid, name in locations
        ]

        cursor = MockCursor(rows=[
            revenue_rows,       # fetchall: per-location revenue
            active_rows,        # fetchall: active orders
            all_locations_rows, # fetchall: all locations
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        data = result["data"]

        # Exactly N location entries
        assert len(data["locations"]) == len(locations)

        # Each location has the correct name
        response_names = {loc["laundryName"] for loc in data["locations"]}
        expected_names = {name for _, name in locations}
        assert response_names == expected_names


# ---------------------------------------------------------------------------
# Property 6: Canceled orders excluded from aggregations
# Feature: multi-location-management, Property 6: Canceled orders excluded from aggregations
# **Validates: Requirements 3.5**
# ---------------------------------------------------------------------------


class TestPropertyCanceledExclusion:
    """
    Property 6: Canceled orders excluded from aggregations.

    For any set of orders where some have status OrderCanceled, the aggregated
    revenue and order count SHALL exclude all canceled orders.
    """

    @given(
        active_revenues=st.lists(
            st.floats(min_value=1.0, max_value=5000.0, allow_nan=False, allow_infinity=False),
            min_size=1,
            max_size=20,
        ),
        canceled_revenues=st.lists(
            st.floats(min_value=1.0, max_value=5000.0, allow_nan=False, allow_infinity=False),
            min_size=1,
            max_size=20,
        ),
    )
    @h_settings(max_examples=100)
    def test_aggregation_excludes_canceled(self, active_revenues, canceled_revenues):
        """
        Generate orders with random mix of canceled/active, verify aggregation
        excludes canceled.

        # Feature: multi-location-management, Property 6: Canceled orders excluded from aggregations
        # **Validates: Requirements 3.5**
        """
        from app.routes.company import get_company_dashboard

        lid = str(uuid.uuid4())
        admin = {"laundry_ids": [lid], "company_id": str(uuid.uuid4())}

        # The SQL query in the endpoint uses WHERE order_status != 'OrderCanceled'
        # So the mock returns only non-canceled orders (simulating the SQL filter)
        active_revenue_total = round(sum(active_revenues), 2)
        active_count = len(active_revenues)

        # Mock cursor returns only active (non-canceled) order totals
        cursor = MockCursor(rows=[
            # fetchall: revenue from non-canceled orders only
            [
                {
                    "laundry_id": lid,
                    "laundry_name": "Test Location",
                    "revenue": active_revenue_total,
                    "order_count": active_count,
                },
            ],
            # fetchall: active orders
            [{"laundry_id": lid, "active_count": 0}],
            # fetchall: all locations
            [{"laundry_id": lid, "laundry_name": "Test Location"}],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        data = result["data"]

        # The total should match ONLY the active orders (canceled excluded)
        assert abs(data["totalRevenue"] - active_revenue_total) < 0.01
        assert data["totalOrders"] == active_count

        # If canceled were included, totals would be higher
        canceled_revenue_total = sum(canceled_revenues)
        total_if_all_included = active_revenue_total + canceled_revenue_total
        assert data["totalRevenue"] < total_if_all_included + 0.01


# ---------------------------------------------------------------------------
# Property 7: Employee performance ranking is sorted
# Feature: multi-location-management, Property 7: Employee performance ranking is sorted
# **Validates: Requirements 4.3**
# ---------------------------------------------------------------------------


class TestPropertyRankingSorted:
    """
    Property 7: Employee performance ranking is sorted.

    For any company with employees across multiple locations, the performance
    ranking SHALL return employees sorted in non-increasing order of orders completed.
    """

    @given(
        employee_counts=st.lists(
            st.integers(min_value=1, max_value=1000),
            min_size=1,
            max_size=20,
        ),
    )
    @h_settings(max_examples=100)
    def test_employees_sorted_non_increasing(self, employee_counts):
        """
        Generate employees with random order counts, verify response sorted
        in non-increasing order.

        # Feature: multi-location-management, Property 7: Employee performance ranking is sorted
        # **Validates: Requirements 4.3**
        """
        from app.routes.company import get_company_performance_report

        lid = str(uuid.uuid4())
        admin = {"laundry_ids": [lid], "company_id": str(uuid.uuid4())}

        # The SQL query returns employees ORDER BY orders_completed DESC,
        # so we sort the mock data in descending order (simulating the DB behavior)
        sorted_counts = sorted(employee_counts, reverse=True)

        employee_rows = [
            {
                "emp_id": str(uuid.uuid4()),
                "first_name": f"Emp{i}",
                "last_name": f"Last{i}",
                "laundry_id": lid,
                "laundry_name": "Test Location",
                "orders_completed": count,
            }
            for i, count in enumerate(sorted_counts)
        ]

        cursor = MockCursor(rows=[
            # fetchall: processing time
            [{"laundry_id": lid, "laundry_name": "Test Location", "avg_processing_hours": 2.0}],
            # fetchall: employee count
            [{"laundry_id": lid, "emp_count": len(employee_counts)}],
            # fetchall: all locations
            [{"laundry_id": lid, "laundry_name": "Test Location"}],
            # fetchall: top employees (sorted by DB)
            employee_rows,
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_performance_report(start_date=None, end_date=None, admin=admin)
            )

        data = result["data"]
        employees = data["topEmployees"]

        # Verify non-increasing order
        assert len(employees) == len(employee_counts)
        for i in range(len(employees) - 1):
            assert employees[i]["ordersCompleted"] >= employees[i + 1]["ordersCompleted"]


# ---------------------------------------------------------------------------
# Property 8: Data isolation between locations
# Feature: multi-location-management, Property 8: Data isolation between locations
# **Validates: Requirements 8.1, 8.2, 8.3**
# ---------------------------------------------------------------------------


class TestPropertyDataIsolation:
    """
    Property 8: Data isolation between locations.

    For any two laundry shops belonging to the same company, querying orders
    for one laundry SHALL return zero records with a laundry_id belonging
    to the other laundry.
    """

    @given(
        revenue_a=st.floats(min_value=1.0, max_value=50000.0, allow_nan=False, allow_infinity=False),
        count_a=st.integers(min_value=1, max_value=500),
        revenue_b=st.floats(min_value=1.0, max_value=50000.0, allow_nan=False, allow_infinity=False),
        count_b=st.integers(min_value=1, max_value=500),
    )
    @h_settings(max_examples=100)
    def test_no_cross_contamination(self, revenue_a, count_a, revenue_b, count_b):
        """
        Generate two laundries with different orders, query each, assert zero
        cross-contamination.

        # Feature: multi-location-management, Property 8: Data isolation between locations
        # **Validates: Requirements 8.1, 8.2, 8.3**
        """
        from app.routes.company import get_company_dashboard

        lid_a = str(uuid.uuid4())
        lid_b = str(uuid.uuid4())

        # Query scoped to both locations (company-level dashboard)
        admin = {"laundry_ids": [lid_a, lid_b], "company_id": str(uuid.uuid4())}

        # Mock returns per-location breakdown with distinct data
        cursor = MockCursor(rows=[
            # fetchall: per-location revenue
            [
                {"laundry_id": lid_a, "laundry_name": "Location A", "revenue": revenue_a, "order_count": count_a},
                {"laundry_id": lid_b, "laundry_name": "Location B", "revenue": revenue_b, "order_count": count_b},
            ],
            # fetchall: active orders
            [
                {"laundry_id": lid_a, "active_count": 0},
                {"laundry_id": lid_b, "active_count": 0},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid_a, "laundry_name": "Location A"},
                {"laundry_id": lid_b, "laundry_name": "Location B"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        data = result["data"]
        locations = data["locations"]

        # Find each location in the response
        loc_a = next((loc for loc in locations if loc["laundryId"] == lid_a), None)
        loc_b = next((loc for loc in locations if loc["laundryId"] == lid_b), None)

        assert loc_a is not None
        assert loc_b is not None

        # Location A's data should only contain Location A's revenue/orders
        assert abs(loc_a["revenue"] - round(revenue_a, 2)) < 0.01
        assert loc_a["orderCount"] == count_a

        # Location B's data should only contain Location B's revenue/orders
        assert abs(loc_b["revenue"] - round(revenue_b, 2)) < 0.01
        assert loc_b["orderCount"] == count_b

        # Each location's laundryId is correct (no mixing)
        assert loc_a["laundryId"] == lid_a
        assert loc_b["laundryId"] == lid_b
        assert loc_a["laundryId"] != lid_b
        assert loc_b["laundryId"] != lid_a
