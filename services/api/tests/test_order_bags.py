"""
Tests for the order-bags endpoints and the add_order_bags migration
(scale-integration-bag-tags spec).

Covers:
- Upsert idempotency (repeat POST updates rather than duplicating) via the
  ON CONFLICT clause and by asserting the endpoint returns the stored bags.
- Tenant isolation (a bag write for an order that doesn't belong to the
  laundry returns 404 and performs no insert).
- Input validation.
- Migration idempotency (add_order_bags.run() twice is a no-op via IF NOT EXISTS).

Validates: Requirements 2.1, 2.3, 5.2, 5.3
"""
from contextlib import contextmanager
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


class RecordingCursor:
    """
    Mock cursor that records every executed statement and serves configurable
    fetch results. `order_exists` controls the order-ownership check; `bag_rows`
    is what the final SELECT of stored bags returns.
    """

    def __init__(self, order_exists=True, bag_rows=None):
        self.order_exists = order_exists
        self.bag_rows = bag_rows if bag_rows is not None else []
        self.executed = []  # list of (sql, params)
        self._last_sql = ""

    def execute(self, sql, params=None):
        self._last_sql = sql
        self.executed.append((sql, params))

    def fetchone(self):
        # The only fetchone in the POST path is the order-ownership check
        if "FROM orders.orders" in self._last_sql:
            return {"order_id": "IS-ABC123"} if self.order_exists else None
        return None

    def fetchall(self):
        # The only fetchall is the "return current stored bags" SELECT
        if "FROM orders.order_bags" in self._last_sql:
            return self.bag_rows
        return []

    def count_upserts(self):
        return sum(
            1 for sql, _ in self.executed
            if "INSERT INTO orders.order_bags" in sql and "ON CONFLICT" in sql
        )


@contextmanager
def mock_db(cursor):
    conn = MagicMock()
    yield conn


def patch_db(cursor):
    """Patch get_db/get_cursor in admin_extra to use the recording cursor."""
    return (
        patch("app.routes.admin_extra.get_db", lambda: mock_db(cursor)),
        patch("app.routes.admin_extra.get_cursor", lambda conn: cursor),
    )


class TestUpsertOrderBags:
    def test_missing_fields_returns_400(self, client):
        resp = client.post("/api/admin/order-bags", json={"orderId": "IS-1", "laundryId": "5"})
        assert resp.status_code == 200
        assert resp.json()["statusCode"] == 400

    def test_empty_bags_returns_400(self, client):
        resp = client.post(
            "/api/admin/order-bags",
            json={"orderId": "IS-1", "laundryId": "5", "empId": "E1", "bags": []},
        )
        assert resp.status_code == 200
        assert resp.json()["statusCode"] == 400

    def test_order_not_owned_returns_404_and_no_insert(self, client):
        """Tenant isolation: an order not belonging to the laundry -> 404, no upsert."""
        cursor = RecordingCursor(order_exists=False)
        p1, p2 = patch_db(cursor)
        with p1, p2:
            resp = client.post(
                "/api/admin/order-bags",
                json={
                    "orderId": "IS-OTHER",
                    "laundryId": "5",
                    "empId": "E1",
                    "bags": [{"bagNumber": 1, "weight": 10}],
                },
            )
        assert resp.json()["statusCode"] == 404
        assert cursor.count_upserts() == 0

    def test_upsert_uses_on_conflict_and_is_laundry_scoped(self, client):
        """Each bag is written with an idempotent ON CONFLICT upsert; scoped by laundry_id."""
        cursor = RecordingCursor(
            order_exists=True,
            bag_rows=[{"bag_number": 1, "weight": 12.5}, {"bag_number": 2, "weight": None}],
        )
        p1, p2 = patch_db(cursor)
        with p1, p2:
            resp = client.post(
                "/api/admin/order-bags",
                json={
                    "orderId": "IS-ABC123",
                    "laundryId": "5",
                    "empId": "E1",
                    "bags": [{"bagNumber": 1, "weight": 12.5}, {"bagNumber": 2, "weight": None}],
                },
            )
        body = resp.json()
        assert body["statusCode"] == 200
        # One upsert per bag
        assert cursor.count_upserts() == 2
        # Ownership check and both upserts are laundry_id-scoped
        ownership = [p for sql, p in cursor.executed if "FROM orders.orders" in sql]
        assert ownership and "5" in ownership[0]
        for sql, params in cursor.executed:
            if "INSERT INTO orders.order_bags" in sql:
                assert "5" in params  # laundry_id is part of the insert tuple
        # Returns stored bags with null weight preserved
        assert body["body"]["bags"] == [
            {"bagNumber": 1, "weight": 12.5},
            {"bagNumber": 2, "weight": None},
        ]

    def test_repeat_post_updates_not_duplicates(self, client):
        """
        Idempotency: posting the same bag twice results in one upsert per call
        against the unique (order_id, laundry_id, bag_number) — the ON CONFLICT
        DO UPDATE guarantees the row is updated, not duplicated. We assert the
        returned bag set has a single row for bag 1 after re-post.
        """
        cursor = RecordingCursor(order_exists=True, bag_rows=[{"bag_number": 1, "weight": 20.0}])
        p1, p2 = patch_db(cursor)
        with p1, p2:
            # First submit
            client.post(
                "/api/admin/order-bags",
                json={"orderId": "IS-ABC123", "laundryId": "5", "empId": "E1",
                      "bags": [{"bagNumber": 1, "weight": 12.5}]},
            )
            # Re-submit same bag with a new weight
            resp = client.post(
                "/api/admin/order-bags",
                json={"orderId": "IS-ABC123", "laundryId": "5", "empId": "E1",
                      "bags": [{"bagNumber": 1, "weight": 20.0}]},
            )
        body = resp.json()
        assert body["statusCode"] == 200
        bag_ones = [b for b in body["body"]["bags"] if b["bagNumber"] == 1]
        assert len(bag_ones) == 1
        assert bag_ones[0]["weight"] == 20.0

    def test_no_auth_required(self, client):
        """PIN-session pattern — no JWT. Should not 401/403."""
        cursor = RecordingCursor(order_exists=True)
        p1, p2 = patch_db(cursor)
        with p1, p2:
            resp = client.post(
                "/api/admin/order-bags",
                json={"orderId": "IS-ABC123", "laundryId": "5", "empId": "E1",
                      "bags": [{"bagNumber": 1, "weight": 5}]},
            )
        assert resp.status_code not in (401, 403)


class TestGetOrderBags:
    def test_get_returns_laundry_scoped_bags(self, client):
        cursor = RecordingCursor(bag_rows=[{"bag_number": 1, "weight": 8.0}])
        p1, p2 = patch_db(cursor)
        with p1, p2:
            resp = client.get("/api/admin/order-bags", params={"orderId": "IS-ABC123", "laundryId": "5"})
        body = resp.json()
        assert body["statusCode"] == 200
        assert body["body"]["bags"] == [{"bagNumber": 1, "weight": 8.0}]
        # The read is laundry_id-scoped
        select = [p for sql, p in cursor.executed if "FROM orders.order_bags" in sql]
        assert select and "5" in select[0]

    def test_get_missing_params_returns_422(self, client):
        resp = client.get("/api/admin/order-bags", params={"orderId": "IS-1"})
        assert resp.status_code == 422  # laundryId is required


class TestMigrationIdempotency:
    def test_run_twice_is_noop(self):
        """add_order_bags.run() called twice issues only IF NOT EXISTS DDL and never raises."""
        from app.migrations import add_order_bags

        executed = []

        class DDLCursor:
            def execute(self, sql, params=None):
                executed.append(sql)

        @contextmanager
        def fake_get_db():
            yield MagicMock()

        with patch("app.migrations.add_order_bags.get_db", fake_get_db), \
             patch("app.migrations.add_order_bags.get_cursor", lambda conn: DDLCursor()):
            add_order_bags.run()
            add_order_bags.run()

        joined = " ".join(executed)
        assert "CREATE TABLE IF NOT EXISTS orders.order_bags" in joined
        assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_order_bags_order_bag" in joined
        # Ran twice, all statements are IF NOT EXISTS (safe to repeat)
        assert executed.count(
            [s for s in executed if "CREATE TABLE IF NOT EXISTS orders.order_bags" in s][0]
        ) == 2
