"""
Tests for Company CRUD endpoints in platform_admin.py.

Covers:
- POST /api/platform/companies (create)
- GET /api/platform/companies (list)
- GET /api/platform/companies/{company_id} (get details)
- PUT /api/platform/companies/{company_id} (update)
- DELETE /api/platform/companies/{company_id} (delete)
- POST /api/platform/companies/{company_id}/admins (create admin)
- PUT /api/platform/companies/{company_id}/locations (assign location)
- DELETE /api/platform/companies/{company_id}/locations/{laundry_id} (remove location)

Validates: Requirements 1.1–1.6, 2.1, 7.5
"""

import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Mock helpers (same pattern as existing tests)
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
# Tests: POST /api/platform/companies
# ---------------------------------------------------------------------------


class TestCreateCompany:
    """Tests for create_company endpoint."""

    def test_create_company_success(self):
        """Should create a company and return its details."""
        from app.routes.platform_admin import create_company

        company_id = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        cursor = MockCursor(rows=[{
            "company_id": company_id,
            "company_name": "Acme Laundry Group",
            "contact_email": "admin@acme.com",
            "contact_phone": "555-1234",
            "created_at": now,
            "updated_at": now,
        }])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {
                "company_name": "Acme Laundry Group",
                "contact_email": "admin@acme.com",
                "contact_phone": "555-1234",
            }
            result = asyncio.get_event_loop().run_until_complete(
                create_company(body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert result["company"]["companyName"] == "Acme Laundry Group"
        assert result["company"]["contactEmail"] == "admin@acme.com"
        assert result["company"]["contactPhone"] == "555-1234"
        assert result["company"]["companyId"] == company_id

    def test_create_company_missing_name(self):
        """Should return error if company_name is missing."""
        from app.routes.platform_admin import create_company

        result = asyncio.get_event_loop().run_until_complete(
            create_company(body={"company_name": ""}, x_platform_key="SLB-PLATFORM-2024")
        )

        assert result["status"] == "error"
        assert "required" in result["message"].lower()

    def test_create_company_optional_fields(self):
        """Should accept company creation without contact fields."""
        from app.routes.platform_admin import create_company

        company_id = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        cursor = MockCursor(rows=[{
            "company_id": company_id,
            "company_name": "Solo Laundry",
            "contact_email": None,
            "contact_phone": None,
            "created_at": now,
            "updated_at": now,
        }])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"company_name": "Solo Laundry"}
            result = asyncio.get_event_loop().run_until_complete(
                create_company(body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert result["company"]["contactEmail"] is None
        assert result["company"]["contactPhone"] is None

    def test_create_company_unauthorized(self):
        """Should raise 403 for invalid platform key."""
        from app.routes.platform_admin import create_company

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                create_company(body={"company_name": "Test"}, x_platform_key="INVALID-KEY")
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: GET /api/platform/companies
# ---------------------------------------------------------------------------


class TestListCompanies:
    """Tests for list_companies endpoint."""

    def test_list_companies_returns_all(self):
        """Should return all companies with location counts."""
        from app.routes.platform_admin import list_companies

        company_id1 = str(uuid.uuid4())
        company_id2 = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        # fetchall returns the list of companies, then fetchone for each count
        cursor = MockCursor(rows=[
            # fetchall: companies list
            [
                {"company_id": company_id1, "company_name": "Acme", "contact_email": "a@b.com", "contact_phone": "111", "created_at": now, "updated_at": now},
                {"company_id": company_id2, "company_name": "Beta", "contact_email": None, "contact_phone": None, "created_at": now, "updated_at": now},
            ],
            # fetchone: count for company 1
            {"cnt": 3},
            # fetchone: count for company 2
            {"cnt": 0},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                list_companies(x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert len(result["companies"]) == 2
        assert result["companies"][0]["companyName"] == "Acme"
        assert result["companies"][0]["locationCount"] == 3
        assert result["companies"][1]["companyName"] == "Beta"
        assert result["companies"][1]["locationCount"] == 0


# ---------------------------------------------------------------------------
# Tests: GET /api/platform/companies/{company_id}
# ---------------------------------------------------------------------------


class TestGetCompany:
    """Tests for get_company endpoint."""

    def test_get_company_success(self):
        """Should return company details with locations."""
        from app.routes.platform_admin import get_company

        company_id = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        cursor = MockCursor(rows=[
            # fetchone: company record
            {"company_id": company_id, "company_name": "Acme", "contact_email": "a@b.com", "contact_phone": "111", "created_at": now, "updated_at": now},
            # fetchall: locations
            [
                {"laundry_id": "1", "laundry_name": "Downtown"},
                {"laundry_id": "2", "laundry_name": "Uptown"},
            ],
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                get_company(company_id=company_id, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert result["company"]["companyName"] == "Acme"
        assert len(result["company"]["locations"]) == 2
        assert result["company"]["locations"][0]["laundryName"] == "Downtown"

    def test_get_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import get_company

        cursor = MockCursor(rows=[None])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    get_company(company_id="nonexistent-id", x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Tests: PUT /api/platform/companies/{company_id}
# ---------------------------------------------------------------------------


class TestUpdateCompany:
    """Tests for update_company endpoint."""

    def test_update_company_success(self):
        """Should update company fields and return updated record."""
        from app.routes.platform_admin import update_company

        company_id = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        cursor = MockCursor(rows=[
            # fetchone: company exists check
            {"company_id": company_id},
            # fetchone: RETURNING after update
            {"company_id": company_id, "company_name": "New Name", "contact_email": "new@b.com", "contact_phone": None, "created_at": now, "updated_at": now},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"company_name": "New Name", "contact_email": "new@b.com"}
            result = asyncio.get_event_loop().run_until_complete(
                update_company(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert result["company"]["companyName"] == "New Name"

    def test_update_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import update_company

        cursor = MockCursor(rows=[None])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    update_company(company_id="missing-id", body={"company_name": "X"}, x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404

    def test_update_company_no_fields(self):
        """Should return error if no update fields provided."""
        from app.routes.platform_admin import update_company

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[{"company_id": company_id}])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                update_company(company_id=company_id, body={}, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "error"
        assert "No fields" in result["message"]

    def test_update_company_empty_name_rejected(self):
        """Should return error if company_name is set to empty."""
        from app.routes.platform_admin import update_company

        company_id = str(uuid.uuid4())
        cursor = MockCursor(rows=[{"company_id": company_id}])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                update_company(company_id=company_id, body={"company_name": "  "}, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "error"
        assert "empty" in result["message"].lower()


# ---------------------------------------------------------------------------
# Tests: DELETE /api/platform/companies/{company_id}
# ---------------------------------------------------------------------------


class TestDeleteCompany:
    """Tests for delete_company endpoint."""

    def test_delete_company_success(self):
        """Should delete company and return success message."""
        from app.routes.platform_admin import delete_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_name": "To Be Deleted"},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                delete_company(company_id=company_id, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert "To Be Deleted" in result["message"]

    def test_delete_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import delete_company

        cursor = MockCursor(rows=[None])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    delete_company(company_id="missing-id", x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404

    def test_delete_company_unauthorized(self):
        """Should raise 403 for invalid platform key."""
        from app.routes.platform_admin import delete_company

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                delete_company(company_id="any-id", x_platform_key="BAD-KEY")
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: PUT /api/platform/companies/{company_id}/locations
# ---------------------------------------------------------------------------


class TestAssignLocationToCompany:
    """Tests for assign_location_to_company endpoint."""

    def test_assign_location_success(self):
        """Should assign an unassigned laundry to the company."""
        from app.routes.platform_admin import assign_location_to_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry exists, currently unassigned
            {"laundry_id": "5", "company_id": None},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"laundryId": "5"}
            result = asyncio.get_event_loop().run_until_complete(
                assign_location_to_company(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert "assigned" in result["message"].lower()

    def test_assign_location_already_same_company(self):
        """Should return success (no-op) if laundry already belongs to this company."""
        from app.routes.platform_admin import assign_location_to_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry already assigned to this company
            {"laundry_id": "5", "company_id": company_id},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"laundryId": "5"}
            result = asyncio.get_event_loop().run_until_complete(
                assign_location_to_company(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert "already assigned" in result["message"].lower()

    def test_assign_location_conflict_409(self):
        """Should return 409 if laundry already belongs to a different company."""
        from app.routes.platform_admin import assign_location_to_company

        company_id = str(uuid.uuid4())
        other_company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry belongs to a different company
            {"laundry_id": "5", "company_id": other_company_id},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"laundryId": "5"}
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    assign_location_to_company(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 409
            assert "another company" in exc_info.value.detail.lower()

    def test_assign_location_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import assign_location_to_company

        cursor = MockCursor(rows=[
            # fetchone: company does not exist
            None,
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"laundryId": "5"}
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    assign_location_to_company(company_id="nonexistent", body=body, x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404
            assert "company" in exc_info.value.detail.lower()

    def test_assign_location_laundry_not_found(self):
        """Should raise 404 if laundry does not exist."""
        from app.routes.platform_admin import assign_location_to_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry does not exist
            None,
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"laundryId": "999"}
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    assign_location_to_company(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404
            assert "laundry" in exc_info.value.detail.lower()

    def test_assign_location_missing_laundry_id(self):
        """Should raise 400 if laundryId is not provided."""
        from app.routes.platform_admin import assign_location_to_company

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                assign_location_to_company(company_id="any-id", body={}, x_platform_key="SLB-PLATFORM-2024")
            )
        assert exc_info.value.status_code == 400

    def test_assign_location_unauthorized(self):
        """Should raise 403 for invalid platform key."""
        from app.routes.platform_admin import assign_location_to_company

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                assign_location_to_company(company_id="any-id", body={"laundryId": "5"}, x_platform_key="BAD-KEY")
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: DELETE /api/platform/companies/{company_id}/locations/{laundry_id}
# ---------------------------------------------------------------------------


class TestRemoveLocationFromCompany:
    """Tests for remove_location_from_company endpoint."""

    def test_remove_location_success(self):
        """Should remove laundry from company (set company_id = NULL)."""
        from app.routes.platform_admin import remove_location_from_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry belongs to this company
            {"laundry_id": "5", "company_id": company_id},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            result = asyncio.get_event_loop().run_until_complete(
                remove_location_from_company(company_id=company_id, laundry_id="5", x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "success"
        assert "removed" in result["message"].lower()

    def test_remove_location_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import remove_location_from_company

        cursor = MockCursor(rows=[
            # fetchone: company does not exist
            None,
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    remove_location_from_company(company_id="nonexistent", laundry_id="5", x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404
            assert "company" in exc_info.value.detail.lower()

    def test_remove_location_laundry_not_in_company(self):
        """Should raise 404 if laundry doesn't belong to this company."""
        from app.routes.platform_admin import remove_location_from_company

        company_id = str(uuid.uuid4())
        other_company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry belongs to a different company
            {"laundry_id": "5", "company_id": other_company_id},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    remove_location_from_company(company_id=company_id, laundry_id="5", x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404
            assert "does not belong" in exc_info.value.detail.lower()

    def test_remove_location_laundry_not_found(self):
        """Should raise 404 if laundry does not exist."""
        from app.routes.platform_admin import remove_location_from_company

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: laundry does not exist
            None,
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    remove_location_from_company(company_id=company_id, laundry_id="999", x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404

    def test_remove_location_unauthorized(self):
        """Should raise 403 for invalid platform key."""
        from app.routes.platform_admin import remove_location_from_company

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                remove_location_from_company(company_id="any", laundry_id="5", x_platform_key="BAD-KEY")
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: POST /api/platform/companies/{company_id}/admins
# ---------------------------------------------------------------------------


class TestCreateCompanyAdmin:
    """Tests for create_company_admin endpoint."""

    def test_create_admin_success_with_password_hashing(self):
        """Should create admin and hash the password before storing."""
        from app.routes.platform_admin import create_company_admin

        company_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())
        now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: email uniqueness check (no existing admin)
            None,
            # fetchone: RETURNING after insert
            {
                "admin_id": admin_id,
                "company_id": company_id,
                "email": "admin@acme.com",
                "first_name": "John",
                "last_name": "Doe",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor, \
             patch("app.routes.platform_admin.hash_password") as mock_hash:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor
            mock_hash.return_value = "$2b$12$hashedpasswordvalue"

            body = {
                "email": "admin@acme.com",
                "password": "SecurePass123!",
                "first_name": "John",
                "last_name": "Doe",
            }
            result = asyncio.get_event_loop().run_until_complete(
                create_company_admin(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        # Verify hash_password was called with the raw password
        mock_hash.assert_called_once_with("SecurePass123!")

        assert result["status"] == "success"
        assert result["admin"]["email"] == "admin@acme.com"
        assert result["admin"]["firstName"] == "John"
        assert result["admin"]["lastName"] == "Doe"
        assert result["admin"]["isActive"] is True
        assert result["admin"]["adminId"] == admin_id
        assert result["admin"]["companyId"] == company_id

    def test_create_admin_email_required(self):
        """Should return error if email is missing or empty."""
        from app.routes.platform_admin import create_company_admin

        company_id = str(uuid.uuid4())

        body = {"email": "", "password": "SomePass123"}
        result = asyncio.get_event_loop().run_until_complete(
            create_company_admin(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
        )

        assert result["status"] == "error"
        assert "email" in result["message"].lower()

    def test_create_admin_password_required(self):
        """Should return error if password is missing or empty."""
        from app.routes.platform_admin import create_company_admin

        company_id = str(uuid.uuid4())

        body = {"email": "admin@acme.com", "password": ""}
        result = asyncio.get_event_loop().run_until_complete(
            create_company_admin(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
        )

        assert result["status"] == "error"
        assert "password" in result["message"].lower()

    def test_create_admin_duplicate_email(self):
        """Should return error if email already in use."""
        from app.routes.platform_admin import create_company_admin

        company_id = str(uuid.uuid4())

        cursor = MockCursor(rows=[
            # fetchone: company exists
            {"company_id": company_id},
            # fetchone: email already exists
            {"admin_id": str(uuid.uuid4())},
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"email": "existing@acme.com", "password": "SomePass123"}
            result = asyncio.get_event_loop().run_until_complete(
                create_company_admin(company_id=company_id, body=body, x_platform_key="SLB-PLATFORM-2024")
            )

        assert result["status"] == "error"
        assert "already" in result["message"].lower() or "email" in result["message"].lower()

    def test_create_admin_company_not_found(self):
        """Should raise 404 if company does not exist."""
        from app.routes.platform_admin import create_company_admin

        cursor = MockCursor(rows=[
            # fetchone: company does not exist
            None,
        ])

        with patch("app.routes.platform_admin.get_db") as mock_db, \
             patch("app.routes.platform_admin.get_cursor") as mock_get_cursor:

            mock_db.return_value = mock_get_db(cursor)
            mock_get_cursor.return_value = cursor

            body = {"email": "admin@acme.com", "password": "SomePass123"}
            with pytest.raises(HTTPException) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    create_company_admin(company_id="nonexistent", body=body, x_platform_key="SLB-PLATFORM-2024")
                )
            assert exc_info.value.status_code == 404

    def test_create_admin_unauthorized(self):
        """Should raise 403 for invalid platform key."""
        from app.routes.platform_admin import create_company_admin

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                create_company_admin(
                    company_id="any-id",
                    body={"email": "a@b.com", "password": "pass"},
                    x_platform_key="BAD-KEY",
                )
            )
        assert exc_info.value.status_code == 403
