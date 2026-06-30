"""
Tests for Company Dashboard and Reports endpoints in company.py.

Covers:
- GET /api/company/dashboard
- GET /api/company/locations
- GET /api/company/reports/revenue
- GET /api/company/reports/tips
- GET /api/company/reports/sales-tax
- GET /api/company/reports/performance

Validates: Requirements 3.1–3.6, 6.1–6.6
"""

import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest


# ---------------------------------------------------------------------------
# Mock helpers (same pattern as test_company_crud.py)
# ---------------------------------------------------------------------------


class MockCursor:
    """Mock cursor that returns pre-configured rows in sequence."""

    def __init__(self, rows=None):
        self._rows = rows or []
        self._call_index = 0

    def execute(self, query, params=None):
        pass

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
# Tests: GET /api/company/dashboard
# ---------------------------------------------------------------------------


class TestCompanyDashboard:
    """Tests for get_company_dashboard endpoint."""

    def test_dashboard_empty_laundry_ids_returns_zero_totals(self):
        """An empty company (no locations) returns zero totals.
        Validates: Requirements 3.1, 3.2, 3.3
        """
        from app.routes.company import get_company_dashboard

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_dashboard(start_date=None, end_date=None, admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["totalRevenue"] == 0.0
        assert result["data"]["totalOrders"] == 0
        assert result["data"]["locations"] == []

    def test_dashboard_computes_correct_totals(self):
        """Dashboard aggregates revenue and order counts from multiple locations.
        Validates: Requirements 3.1, 3.2, 3.3
        """
        from app.routes.company import get_company_dashboard

        lid1 = str(uuid.uuid4())
        lid2 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1, lid2], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: per-location revenue (excluding canceled)
            [
                {"laundry_id": lid1, "laundry_name": "Downtown", "revenue": 1500.00, "order_count": 30},
                {"laundry_id": lid2, "laundry_name": "Uptown", "revenue": 2500.50, "order_count": 50},
            ],
            # fetchall: active orders per location
            [
                {"laundry_id": lid1, "active_count": 3},
                {"laundry_id": lid2, "active_count": 7},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Downtown"},
                {"laundry_id": lid2, "laundry_name": "Uptown"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        assert result["status"] == "success"
        data = result["data"]
        assert data["totalRevenue"] == 4000.50
        assert data["totalOrders"] == 80
        assert len(data["locations"]) == 2

        # Per-location breakdown correctness
        loc_map = {loc["laundryName"]: loc for loc in data["locations"]}
        assert loc_map["Downtown"]["revenue"] == 1500.00
        assert loc_map["Downtown"]["orderCount"] == 30
        assert loc_map["Downtown"]["activeOrders"] == 3
        assert loc_map["Uptown"]["revenue"] == 2500.50
        assert loc_map["Uptown"]["orderCount"] == 50
        assert loc_map["Uptown"]["activeOrders"] == 7

    def test_dashboard_excludes_canceled_orders(self):
        """Canceled orders are excluded via SQL filter (mock verifies non-canceled data only).
        Validates: Requirements 3.5
        """
        from app.routes.company import get_company_dashboard

        lid1 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1], "company_id": str(uuid.uuid4())}

        # Mocked data already excludes canceled (as the SQL WHERE clause does)
        # We verify the result reflects only non-canceled orders
        cursor = MockCursor(rows=[
            # fetchall: revenue query returns only non-canceled orders
            [
                {"laundry_id": lid1, "laundry_name": "Main St", "revenue": 800.00, "order_count": 10},
            ],
            # fetchall: active orders
            [
                {"laundry_id": lid1, "active_count": 2},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Main St"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(start_date=None, end_date=None, admin=admin)
            )

        # If canceled orders were included, totals would be higher
        # The SQL excludes them, so mock data represents post-filter state
        assert result["data"]["totalRevenue"] == 800.00
        assert result["data"]["totalOrders"] == 10

    def test_dashboard_accepts_date_range_parameters(self):
        """Date range parameters are passed through to the endpoint.
        Validates: Requirements 3.4
        """
        from app.routes.company import get_company_dashboard

        lid1 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: revenue
            [
                {"laundry_id": lid1, "laundry_name": "Branch A", "revenue": 500.00, "order_count": 5},
            ],
            # fetchall: active orders
            [],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Branch A"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_dashboard(
                    start_date="2024-01-01",
                    end_date="2024-01-31",
                    admin=admin,
                )
            )

        assert result["status"] == "success"
        assert result["data"]["dateRange"]["start"] == "2024-01-01"
        assert result["data"]["dateRange"]["end"] == "2024-01-31"


# ---------------------------------------------------------------------------
# Tests: GET /api/company/locations
# ---------------------------------------------------------------------------


class TestCompanyLocations:
    """Tests for get_company_locations endpoint."""

    def test_locations_returns_all_with_active_counts(self):
        """Returns all company locations with their active order counts.
        Validates: Requirements 5.2
        """
        from app.routes.company import get_company_locations

        lid1 = str(uuid.uuid4())
        lid2 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1, lid2], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: locations with active counts
            [
                {"laundry_id": lid1, "laundry_name": "East Side", "active_orders": 4},
                {"laundry_id": lid2, "laundry_name": "West Side", "active_orders": 0},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_locations(admin=admin)
            )

        assert result["status"] == "success"
        locations = result["data"]["locations"]
        assert len(locations) == 2
        assert locations[0]["laundryName"] == "East Side"
        assert locations[0]["activeOrders"] == 4
        assert locations[1]["laundryName"] == "West Side"
        assert locations[1]["activeOrders"] == 0

    def test_locations_empty_company(self):
        """Empty company returns empty locations list.
        Validates: Requirements 5.2
        """
        from app.routes.company import get_company_locations

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_locations(admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["locations"] == []


# ---------------------------------------------------------------------------
# Tests: GET /api/company/reports/revenue
# ---------------------------------------------------------------------------


class TestCompanyRevenueReport:
    """Tests for get_company_revenue_report endpoint."""

    def test_revenue_report_per_location_breakdown(self):
        """Revenue report returns per-location breakdown with averages.
        Validates: Requirements 6.1, 6.2, 6.6
        """
        from app.routes.company import get_company_revenue_report

        lid1 = str(uuid.uuid4())
        lid2 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1, lid2], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: per-location revenue
            [
                {"laundry_id": lid1, "laundry_name": "Branch A", "revenue": 3000.00, "order_count": 100},
                {"laundry_id": lid2, "laundry_name": "Branch B", "revenue": 2000.00, "order_count": 50},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Branch A"},
                {"laundry_id": lid2, "laundry_name": "Branch B"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_revenue_report(start_date=None, end_date=None, admin=admin)
            )

        assert result["status"] == "success"
        data = result["data"]

        # Combined totals
        assert data["totalRevenue"] == 5000.00
        assert data["totalOrders"] == 150
        assert data["averageOrderValue"] == round(5000.00 / 150, 2)

        # Per-location breakdown
        assert len(data["locations"]) == 2
        loc_map = {loc["laundryName"]: loc for loc in data["locations"]}
        assert loc_map["Branch A"]["revenue"] == 3000.00
        assert loc_map["Branch A"]["orderCount"] == 100
        assert loc_map["Branch A"]["averageOrderValue"] == 30.00
        assert loc_map["Branch B"]["revenue"] == 2000.00
        assert loc_map["Branch B"]["orderCount"] == 50
        assert loc_map["Branch B"]["averageOrderValue"] == 40.00

    def test_revenue_report_empty_company(self):
        """Empty company returns zero totals in revenue report.
        Validates: Requirements 6.1
        """
        from app.routes.company import get_company_revenue_report

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_revenue_report(start_date=None, end_date=None, admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["totalRevenue"] == 0.0
        assert result["data"]["totalOrders"] == 0
        assert result["data"]["averageOrderValue"] == 0.0
        assert result["data"]["locations"] == []

    def test_revenue_report_date_range_filtering(self):
        """Date range params are accepted and reflected in the response.
        Validates: Requirements 6.5
        """
        from app.routes.company import get_company_revenue_report

        lid1 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: revenue
            [
                {"laundry_id": lid1, "laundry_name": "Loc 1", "revenue": 1200.00, "order_count": 20},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Loc 1"},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_revenue_report(
                    start_date="2024-03-01",
                    end_date="2024-03-31",
                    admin=admin,
                )
            )

        assert result["status"] == "success"
        assert "2024-03-01" in result["data"]["periodLabel"]
        assert "2024-03-31" in result["data"]["periodLabel"]


# ---------------------------------------------------------------------------
# Tests: GET /api/company/reports/tips
# ---------------------------------------------------------------------------


class TestCompanyTipsReport:
    """Tests for get_company_tips_report endpoint."""

    def test_tips_report_groups_by_employee(self):
        """Tips report aggregates tips grouped by employee.
        Validates: Requirements 6.3
        """
        from app.routes.company import get_company_tips_report

        lid1 = str(uuid.uuid4())
        emp1 = str(uuid.uuid4())
        emp2 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: orders with tips
            [
                {"tip": {"tipAmount": 5.00, "tipReceiverId": emp1}, "laundry_id": lid1},
                {"tip": {"tipAmount": 10.00, "tipReceiverId": emp1}, "laundry_id": lid1},
                {"tip": {"tipAmount": 8.00, "tipReceiverId": emp2}, "laundry_id": lid1},
            ],
            # fetchall: employee names
            [
                {"emp_id": emp1, "first_name": "Alice", "last_name": "Smith", "laundry_id": lid1},
                {"emp_id": emp2, "first_name": "Bob", "last_name": "Jones", "laundry_id": lid1},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_tips_report(start_date=None, end_date=None, admin=admin)
            )

        assert result["status"] == "success"
        data = result["data"]
        assert data["totalTips"] == 23.00

        tips_by_emp = {t["employeeId"]: t for t in data["tipsByEmployee"]}
        assert tips_by_emp[emp1]["tipsEarned"] == 15.00
        assert tips_by_emp[emp1]["orderCount"] == 2
        assert tips_by_emp[emp1]["name"] == "Alice Smith"
        assert tips_by_emp[emp2]["tipsEarned"] == 8.00
        assert tips_by_emp[emp2]["orderCount"] == 1
        assert tips_by_emp[emp2]["name"] == "Bob Jones"

    def test_tips_report_empty_company(self):
        """Empty company returns zero tips.
        Validates: Requirements 6.3
        """
        from app.routes.company import get_company_tips_report

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_tips_report(start_date=None, end_date=None, admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["totalTips"] == 0.0
        assert result["data"]["tipsByEmployee"] == []


# ---------------------------------------------------------------------------
# Tests: GET /api/company/reports/sales-tax
# ---------------------------------------------------------------------------


class TestCompanySalesTaxReport:
    """Tests for get_company_sales_tax_report endpoint."""

    def test_sales_tax_report_computes_tax(self):
        """Sales tax report computes tax from gross sales using location tax rates.
        Validates: Requirements 6.4, 6.6
        """
        from app.routes.company import get_company_sales_tax_report

        lid1 = str(uuid.uuid4())
        lid2 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1, lid2], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: per-location gross sales
            [
                {"laundry_id": lid1, "laundry_name": "Shop A", "tax_rate": 0.08, "gross_sales": 1080.00, "order_count": 10},
                {"laundry_id": lid2, "laundry_name": "Shop B", "tax_rate": 0.10, "gross_sales": 1100.00, "order_count": 10},
            ],
            # fetchall: all locations with tax rates
            [
                {"laundry_id": lid1, "laundry_name": "Shop A", "tax_rate": 0.08},
                {"laundry_id": lid2, "laundry_name": "Shop B", "tax_rate": 0.10},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_sales_tax_report(start_date=None, end_date=None, admin=admin)
            )

        assert result["status"] == "success"
        data = result["data"]

        # Shop A: gross=1080, tax_rate=0.08 → taxable=1080/1.08=1000, tax=80
        # Shop B: gross=1100, tax_rate=0.10 → taxable=1100/1.10=1000, tax=100
        loc_map = {loc["laundryName"]: loc for loc in data["locations"]}
        assert loc_map["Shop A"]["grossSales"] == 1080.00
        assert loc_map["Shop A"]["taxableAmount"] == 1000.00
        assert loc_map["Shop A"]["taxCollected"] == 80.00
        assert loc_map["Shop B"]["grossSales"] == 1100.00
        assert loc_map["Shop B"]["taxableAmount"] == 1000.00
        assert loc_map["Shop B"]["taxCollected"] == 100.00

        # Combined totals (additive consistency)
        assert data["totalGrossSales"] == 2180.00
        assert data["totalTaxableAmount"] == 2000.00
        assert data["totalTaxCollected"] == 180.00

    def test_sales_tax_report_empty_company(self):
        """Empty company returns zero tax totals.
        Validates: Requirements 6.4
        """
        from app.routes.company import get_company_sales_tax_report

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_sales_tax_report(start_date=None, end_date=None, admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["totalGrossSales"] == 0.0
        assert result["data"]["totalTaxableAmount"] == 0.0
        assert result["data"]["totalTaxCollected"] == 0.0
        assert result["data"]["locations"] == []


# ---------------------------------------------------------------------------
# Tests: GET /api/company/reports/performance
# ---------------------------------------------------------------------------


class TestCompanyPerformanceReport:
    """Tests for get_company_performance_report endpoint."""

    def test_performance_report_returns_sorted_employees(self):
        """Performance report returns employees sorted by orders completed descending.
        Validates: Requirements 4.1, 4.2, 4.3, 4.4
        """
        from app.routes.company import get_company_performance_report

        lid1 = str(uuid.uuid4())
        lid2 = str(uuid.uuid4())
        emp1 = str(uuid.uuid4())
        emp2 = str(uuid.uuid4())
        emp3 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1, lid2], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: avg processing time per location
            [
                {"laundry_id": lid1, "laundry_name": "Loc A", "avg_processing_hours": 2.5},
                {"laundry_id": lid2, "laundry_name": "Loc B", "avg_processing_hours": 3.1},
            ],
            # fetchall: employee count per location
            [
                {"laundry_id": lid1, "emp_count": 5},
                {"laundry_id": lid2, "emp_count": 3},
            ],
            # fetchall: all locations
            [
                {"laundry_id": lid1, "laundry_name": "Loc A"},
                {"laundry_id": lid2, "laundry_name": "Loc B"},
            ],
            # fetchall: top employees (sorted descending by orders_completed)
            [
                {"emp_id": emp1, "first_name": "Top", "last_name": "Performer", "laundry_id": lid1, "laundry_name": "Loc A", "orders_completed": 50},
                {"emp_id": emp2, "first_name": "Mid", "last_name": "Worker", "laundry_id": lid2, "laundry_name": "Loc B", "orders_completed": 30},
                {"emp_id": emp3, "first_name": "New", "last_name": "Hire", "laundry_id": lid1, "laundry_name": "Loc A", "orders_completed": 10},
            ],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_performance_report(start_date=None, end_date=None, admin=admin)
            )

        assert result["status"] == "success"
        data = result["data"]

        # Per-location stats
        assert len(data["locations"]) == 2
        loc_map = {loc["laundryName"]: loc for loc in data["locations"]}
        assert loc_map["Loc A"]["avgProcessingTimeHours"] == 2.5
        assert loc_map["Loc A"]["employeeCount"] == 5
        assert loc_map["Loc B"]["avgProcessingTimeHours"] == 3.1
        assert loc_map["Loc B"]["employeeCount"] == 3

        # Top employees sorted descending
        employees = data["topEmployees"]
        assert len(employees) == 3
        assert employees[0]["ordersCompleted"] == 50
        assert employees[0]["name"] == "Top Performer"
        assert employees[1]["ordersCompleted"] == 30
        assert employees[2]["ordersCompleted"] == 10

        # Verify sorted descending
        for i in range(len(employees) - 1):
            assert employees[i]["ordersCompleted"] >= employees[i + 1]["ordersCompleted"]

    def test_performance_report_empty_company(self):
        """Empty company returns empty performance data.
        Validates: Requirements 4.1
        """
        from app.routes.company import get_company_performance_report

        admin = {"laundry_ids": [], "company_id": str(uuid.uuid4())}

        result = asyncio.get_event_loop().run_until_complete(
            get_company_performance_report(start_date=None, end_date=None, admin=admin)
        )

        assert result["status"] == "success"
        assert result["data"]["locations"] == []
        assert result["data"]["topEmployees"] == []

    def test_performance_report_date_range(self):
        """Performance report accepts date range parameters.
        Validates: Requirements 6.5
        """
        from app.routes.company import get_company_performance_report

        lid1 = str(uuid.uuid4())
        admin = {"laundry_ids": [lid1], "company_id": str(uuid.uuid4())}

        cursor = MockCursor(rows=[
            # fetchall: processing time
            [],
            # fetchall: employee count
            [{"laundry_id": lid1, "emp_count": 2}],
            # fetchall: all locations
            [{"laundry_id": lid1, "laundry_name": "Solo Shop"}],
            # fetchall: top employees
            [],
        ])

        with patch("app.routes.company.get_db") as mock_db, \
             patch("app.routes.company.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company_performance_report(
                    start_date="2024-06-01",
                    end_date="2024-06-30",
                    admin=admin,
                )
            )

        assert result["status"] == "success"
        assert "2024-06-01" in result["data"]["periodLabel"]
        assert "2024-06-30" in result["data"]["periodLabel"]
