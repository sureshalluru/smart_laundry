"""
Unit tests for build_weight_detection_prompt() in vision_service.py.
Validates: Requirements 2.2
"""
import json
import pytest

from app.services.vision_service import build_weight_detection_prompt


class TestBuildWeightDetectionPrompt:
    """Tests for the weight detection prompt builder."""

    def test_returns_non_empty_string(self):
        """Prompt should return a non-empty string."""
        prompt = build_weight_detection_prompt()
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_instructs_weight_reading(self):
        """Prompt should instruct Claude to read weight from a scale display."""
        prompt = build_weight_detection_prompt()
        assert "weight" in prompt.lower()
        assert "scale" in prompt.lower()
        assert "display" in prompt.lower()

    def test_specifies_json_output_format(self):
        """Prompt should specify the expected JSON output structure."""
        prompt = build_weight_detection_prompt()
        assert '"weight"' in prompt
        assert '"unit"' in prompt
        assert '"confidence"' in prompt

    def test_specifies_supported_units(self):
        """Prompt should mention lbs, kg, and oz as valid units."""
        prompt = build_weight_detection_prompt()
        assert "lbs" in prompt
        assert "kg" in prompt
        assert "oz" in prompt

    def test_handles_scale_not_visible_edge_case(self):
        """Prompt should instruct returning null when scale is not visible."""
        prompt = build_weight_detection_prompt()
        assert "null" in prompt
        # Should mention what to do when scale isn't visible
        assert "not visible" in prompt.lower() or "no scale" in prompt.lower()

    def test_handles_unreadable_display_edge_case(self):
        """Prompt should handle cases where the display is unreadable."""
        prompt = build_weight_detection_prompt()
        assert "unreadable" in prompt.lower() or "blurry" in prompt.lower() or "obscured" in prompt.lower()

    def test_handles_multiple_scales_edge_case(self):
        """Prompt should instruct how to handle multiple scales in frame."""
        prompt = build_weight_detection_prompt()
        assert "multiple" in prompt.lower()

    def test_json_example_is_valid(self):
        """The JSON examples in the prompt should be valid JSON."""
        prompt = build_weight_detection_prompt()
        # Extract the success JSON example
        success_json = '{\n  "weight": 12.5,\n  "unit": "lbs",\n  "confidence": 92\n}'
        assert success_json in prompt
        parsed = json.loads(success_json)
        assert parsed["weight"] == 12.5
        assert parsed["unit"] == "lbs"
        assert parsed["confidence"] == 92

        # Extract the failure JSON example
        failure_json = '{\n  "weight": null,\n  "unit": null,\n  "confidence": 0\n}'
        assert failure_json in prompt
        parsed_fail = json.loads(failure_json)
        assert parsed_fail["weight"] is None
        assert parsed_fail["confidence"] == 0

    def test_existing_functions_unchanged(self):
        """Verify existing build_vision_prompt and analyze_photos are still importable."""
        from app.services.vision_service import build_vision_prompt, analyze_photos
        # build_vision_prompt should accept categories and phase
        prompt = build_vision_prompt(["T-shirts", "Pants"], phase="intake")
        assert isinstance(prompt, str)
        assert "T-shirts" in prompt
