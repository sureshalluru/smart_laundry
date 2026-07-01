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
