"""
Unit tests for the /api/admin/item-tracking/detect-weight endpoint.
Tests validate request handling, base64 validation, and graceful failure modes.

Validates: Requirements 2.2
"""
import base64
import json
import pytest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    from app.main import app
    return TestClient(app)


class TestDetectWeightEndpoint:
    """Tests for the detect-weight endpoint."""

    def test_missing_image_returns_400(self, client):
        """Empty imageBase64 should return 400 with weight=None."""
        response = client.post(
            "/api/admin/item-tracking/detect-weight",
            json={"imageBase64": "", "laundryId": "L001", "orderId": "ORD001"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 400
        assert data["body"]["weight"] is None
        assert data["body"]["confidence"] == 0

    def test_invalid_base64_returns_400(self, client):
        """Invalid base64 data should return 400 with weight=None."""
        response = client.post(
            "/api/admin/item-tracking/detect-weight",
            json={"imageBase64": "not-valid-base64!!!", "laundryId": "L001", "orderId": "ORD001"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 400
        assert data["body"]["weight"] is None

    def test_too_small_image_returns_400(self, client):
        """Image data smaller than 1000 bytes should return 400."""
        # Create a tiny valid base64 string (less than 1000 bytes decoded)
        small_data = base64.b64encode(b"x" * 100).decode()
        response = client.post(
            "/api/admin/item-tracking/detect-weight",
            json={"imageBase64": small_data, "laundryId": "L001", "orderId": "ORD001"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 400
        assert "corrupted or too small" in data["body"]["message"]
        assert data["body"]["weight"] is None

    def test_strips_data_url_prefix(self, client):
        """Data URL prefix (data:image/jpeg;base64,...) should be stripped before processing."""
        # Create valid-sized base64 image data
        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000  # JPEG-like header
        encoded = base64.b64encode(fake_image).decode()
        data_url = f"data:image/jpeg;base64,{encoded}"

        with patch("app.config.settings") as mock_settings:
            mock_settings.anthropic_api_key = ""
            response = client.post(
                "/api/admin/item-tracking/detect-weight",
                json={"imageBase64": data_url, "laundryId": "L001", "orderId": "ORD001"},
            )
            assert response.status_code == 200
            data = response.json()
            # Should reach the "not configured" branch (not the invalid base64 branch)
            assert data["statusCode"] == 503
            assert "not configured" in data["body"]["message"]

    @patch("app.config.settings")
    def test_no_api_key_returns_503(self, mock_settings, client):
        """Missing Anthropic API key should return 503 with weight=None."""
        mock_settings.anthropic_api_key = ""

        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        encoded = base64.b64encode(fake_image).decode()

        response = client.post(
            "/api/admin/item-tracking/detect-weight",
            json={"imageBase64": encoded, "laundryId": "L001", "orderId": "ORD001"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 503
        assert data["body"]["weight"] is None

    def test_successful_weight_detection(self, client):
        """Successful Claude Vision response should return parsed weight."""
        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        encoded = base64.b64encode(fake_image).decode()

        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = '{"weight": 12.5, "unit": "lbs", "confidence": 92}'

        with patch("anthropic.Anthropic") as MockClient:
            mock_client_instance = MagicMock()
            mock_client_instance.messages.create.return_value = mock_response
            MockClient.return_value = mock_client_instance

            with patch("app.config.settings") as mock_settings:
                mock_settings.anthropic_api_key = "test-key"

                response = client.post(
                    "/api/admin/item-tracking/detect-weight",
                    json={"imageBase64": encoded, "laundryId": "L001", "orderId": "ORD001"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 200
        assert data["body"]["weight"] == 12.5
        assert data["body"]["unit"] == "lbs"
        assert data["body"]["confidence"] == 92

    def test_vision_returns_null_weight_gracefully(self, client):
        """When Vision AI can't read scale, should return weight=None gracefully."""
        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        encoded = base64.b64encode(fake_image).decode()

        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = '{"weight": null, "unit": null, "confidence": 0}'

        with patch("anthropic.Anthropic") as MockClient:
            mock_client_instance = MagicMock()
            mock_client_instance.messages.create.return_value = mock_response
            MockClient.return_value = mock_client_instance

            with patch("app.config.settings") as mock_settings:
                mock_settings.anthropic_api_key = "test-key"

                response = client.post(
                    "/api/admin/item-tracking/detect-weight",
                    json={"imageBase64": encoded, "laundryId": "L001", "orderId": "ORD001"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 200
        assert data["body"]["weight"] is None
        assert data["body"]["confidence"] == 0

    def test_api_connection_error_returns_graceful_failure(self, client):
        """API connection errors should return weight=None gracefully."""
        import anthropic as anthropic_module

        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        encoded = base64.b64encode(fake_image).decode()

        with patch("anthropic.Anthropic") as MockClient:
            mock_client_instance = MagicMock()
            mock_client_instance.messages.create.side_effect = anthropic_module.APIConnectionError(
                request=MagicMock()
            )
            MockClient.return_value = mock_client_instance

            with patch("app.config.settings") as mock_settings:
                mock_settings.anthropic_api_key = "test-key"

                response = client.post(
                    "/api/admin/item-tracking/detect-weight",
                    json={"imageBase64": encoded, "laundryId": "L001", "orderId": "ORD001"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["statusCode"] == 200
        assert data["body"]["weight"] is None
        assert data["body"]["confidence"] == 0

    def test_no_auth_required(self, client):
        """Endpoint should not require JWT auth (PIN-session pattern)."""
        # If auth were required, we'd get 401/403 without a token
        # Instead we get a validation error for missing body (422) or process normally
        response = client.post(
            "/api/admin/item-tracking/detect-weight",
            json={"imageBase64": "", "laundryId": "L001", "orderId": "ORD001"},
        )
        # Should not be 401 or 403
        assert response.status_code != 401
        assert response.status_code != 403

    def test_existing_photo_upload_status_unchanged(self, client):
        """Verify the photo-upload-status endpoint still exists and is accessible."""
        # Just confirm the endpoint exists (will fail on missing required params, not 404)
        response = client.post("/api/admin/photo-upload-status")
        # Should get 422 (missing query params) not 404 (endpoint not found)
        assert response.status_code == 422


class TestDetectWeightReconciledWrite:
    """
    The reconciled detect-weight write persists to the AUTHORITATIVE location
    (orders.orders.total_weight + weight-based orders.order_services) and
    recomputes totals — never the legacy laundry_orders.service_weight.

    Validates: Requirements 4.1, 4.2, 4.3, 4.4
    """

    from contextlib import contextmanager

    class RecordingCursor:
        """Records executed SQL; serves service/product/order rows for recompute."""

        def __init__(self):
            self.executed = []
            self._last = ""
            # After the weight UPDATE, order_services has one weight-based line at $1.59/lb
            self._service_rows = [{"service_price": 1.59, "weight_or_count": 10.0}]
            self._product_rows = []
            self._order_row = {"discounted_price": 0, "tip_amount": 0}

        def execute(self, sql, params=None):
            self._last = sql
            self.executed.append((sql, params))

        def fetchall(self):
            if "FROM orders.order_services" in self._last:
                return self._service_rows
            if "FROM orders.order_products" in self._last:
                return self._product_rows
            return []

        def fetchone(self):
            if "FROM orders.orders" in self._last:
                return self._order_row
            return None

    @staticmethod
    def _vision_patches(weight_json='{"weight": 10.0, "unit": "lbs", "confidence": 95}'):
        """Returns (anthropic_patch, settings_patch) that make Vision return a weight."""
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = weight_json
        client_patch = patch("anthropic.Anthropic")
        return client_patch, mock_response

    def _run(self, client, cursor, monkey_raises=False):
        import base64
        from contextlib import contextmanager

        fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
        encoded = base64.b64encode(fake_image).decode()

        @contextmanager
        def fake_get_db():
            if monkey_raises:
                raise RuntimeError("db down")
            yield MagicMock()

        client_patch, mock_response = self._vision_patches()
        with client_patch as MockClient:
            inst = MagicMock()
            inst.messages.create.return_value = mock_response
            MockClient.return_value = inst
            with patch("app.config.settings") as mock_settings, \
                 patch("app.routes.item_tracking.get_db", fake_get_db), \
                 patch("app.routes.item_tracking.get_cursor", lambda conn: cursor):
                mock_settings.anthropic_api_key = "test-key"
                return client.post(
                    "/api/admin/item-tracking/detect-weight",
                    json={"imageBase64": encoded, "laundryId": "L001", "orderId": "ORD001"},
                )

    def test_writes_authoritative_columns_not_legacy(self, client):
        cursor = self.RecordingCursor()
        resp = self._run(client, cursor)
        assert resp.status_code == 200
        sqls = " ".join(s for s, _ in cursor.executed)
        # Authoritative writes present
        assert "UPDATE orders.orders" in sqls
        assert "total_weight" in sqls
        assert "UPDATE orders.order_services" in sqls
        assert "input_weight = true" in sqls
        # Legacy write gone
        assert "laundry_orders" not in sqls
        assert "service_weight" not in sqls

    def test_recomputes_totals_and_is_laundry_scoped(self, client):
        cursor = self.RecordingCursor()
        resp = self._run(client, cursor)
        assert resp.status_code == 200
        # Final totals UPDATE: 1.59 * 10 = 15.90, no discount/tip
        totals_updates = [
            (s, p) for s, p in cursor.executed
            if "UPDATE orders.orders" in s and "sub_total" in s
        ]
        assert totals_updates, "expected a totals recompute UPDATE"
        sql, params = totals_updates[0]
        assert 15.9 in params  # sub_total == total_cost == grand_total == 15.90
        # laundry_id scoping on the authoritative order-level write
        weight_updates = [
            p for s, p in cursor.executed
            if "UPDATE orders.orders" in s and "total_weight" in s
        ]
        assert weight_updates and "L001" in weight_updates[0]
        assert "ORD001" in weight_updates[0]

    def test_response_shape_unchanged(self, client):
        cursor = self.RecordingCursor()
        resp = self._run(client, cursor)
        data = resp.json()
        assert data["statusCode"] == 200
        assert data["body"]["weight"] == 10.0
        assert data["body"]["unit"] == "lbs"
        assert data["body"]["confidence"] == 95

    def test_db_error_does_not_break_detection(self, client):
        """If the authoritative write fails, detection still returns the weight."""
        cursor = self.RecordingCursor()
        resp = self._run(client, cursor, monkey_raises=True)
        data = resp.json()
        # Fail-soft: weight still returned, no 500
        assert data["statusCode"] == 200
        assert data["body"]["weight"] == 10.0
