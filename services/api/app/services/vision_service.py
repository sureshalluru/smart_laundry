"""
Vision service — integrates with Anthropic Claude Vision API to identify
and count laundry items from photos.
"""
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

import anthropic
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class VisionResultItem:
    category: str
    count: int
    confidence: int
    note: Optional[str] = None


@dataclass
class VisionResult:
    items: list[VisionResultItem] = field(default_factory=list)
    processing_time_ms: int = 0
    raw_response: Optional[str] = None


def build_vision_prompt(categories: list[str]) -> str:
    """
    Build the structured prompt for Claude Vision to identify and count
    laundry items from multiple angle photos.

    Args:
        categories: List of configured item category names

    Returns:
        The system prompt string
    """
    categories_str = ", ".join(categories)

    return f"""You are a laundry item counter. You are looking at photos of laundry items spread out on a table, taken from 2-3 different angles.

Your task:
1. Identify all individual laundry items visible across the provided photos
2. Cross-reference the different angle views to get an accurate count — do NOT double-count items visible in multiple photos
3. Classify each item using ONLY these categories: {categories_str}
4. Count the total number of individual items per category
5. Assign a confidence score (0-100) for each category's count

IMPORTANT RULES:
- Count INDIVIDUAL items, not stacks or groups
- Cross-reference angles to resolve items that may be hidden or overlapping in one view
- If an item doesn't match any category, classify it as "Other"
- If items are overlapping or partially hidden from ALL angles, lower the confidence score
- Respond ONLY with valid JSON in this exact format:

{{
  "items": [
    {{"category": "Shirts", "count": 5, "confidence": 95}},
    {{"category": "Pants", "count": 3, "confidence": 88, "note": "2 partially overlapping"}}
  ]
}}

Categories to use: {categories_str}
"""


async def analyze_photos(
    image_urls: list[str],
    categories: list[str],
) -> VisionResult:
    """
    Send images to Claude Vision API for item identification and counting.

    Args:
        image_urls: List of S3 URLs for the uploaded photos (2-3 angle shots)
        categories: List of configured item category names for classification

    Returns:
        VisionResult with identified items, counts, and confidence scores

    Raises:
        VisionServiceError: If the API call fails
    """
    import time

    start_time = time.time()

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Build content blocks with images
        content = []
        for url in image_urls:
            content.append({
                "type": "image",
                "source": {
                    "type": "url",
                    "url": url,
                },
            })

        content.append({
            "type": "text",
            "text": "Please identify and count all laundry items visible in these photos. The photos show the same set of items from different angles.",
        })

        # Call Claude Vision
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=build_vision_prompt(categories),
            messages=[
                {
                    "role": "user",
                    "content": content,
                }
            ],
        )

        # Parse the response
        response_text = response.content[0].text
        processing_time = int((time.time() - start_time) * 1000)

        # Extract JSON from response
        result_data = _parse_vision_response(response_text, categories)

        return VisionResult(
            items=result_data,
            processing_time_ms=processing_time,
            raw_response=response_text,
        )

    except anthropic.APIConnectionError as e:
        logger.error(f"Claude Vision API connection error: {e}")
        raise VisionServiceError("VISION_UNAVAILABLE", "Could not connect to Claude Vision API")
    except anthropic.RateLimitError as e:
        logger.error(f"Claude Vision API rate limit: {e}")
        raise VisionServiceError("RATE_LIMIT", "Claude Vision API rate limit exceeded")
    except anthropic.APIStatusError as e:
        logger.error(f"Claude Vision API error: {e}")
        raise VisionServiceError("API_ERROR", f"Claude Vision API error: {e.message}")
    except Exception as e:
        logger.error(f"Vision service unexpected error: {e}")
        raise VisionServiceError("UNEXPECTED_ERROR", str(e))


def _parse_vision_response(response_text: str, categories: list[str]) -> list[VisionResultItem]:
    """
    Parse Claude's response text into structured VisionResultItems.
    Handles cases where response may include markdown code blocks.
    """
    # Strip markdown code blocks if present
    text = response_text.strip()
    if text.startswith("```"):
        # Remove opening ```json or ```
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse vision response as JSON: {text[:200]}")
        return []

    items = []
    for item in data.get("items", []):
        category = item.get("category", "Other")

        # Map unknown categories to "Other"
        if category not in categories and category != "Other":
            note = item.get("note", "")
            note = f"Originally identified as '{category}'. {note}".strip()
            category = "Other"
            item["note"] = note

        items.append(VisionResultItem(
            category=category,
            count=item.get("count", 0),
            confidence=item.get("confidence", 50),
            note=item.get("note"),
        ))

    return items


def flag_low_confidence(items: list[VisionResultItem], threshold: int = 80) -> list[dict]:
    """
    Flag items with confidence below threshold for employee review.

    Args:
        items: List of vision result items
        threshold: Confidence threshold (default 80)

    Returns:
        List of items as dicts with 'flagged' boolean added
    """
    return [
        {
            "category": item.category,
            "count": item.count,
            "confidence": item.confidence,
            "note": item.note,
            "flagged": item.confidence < threshold,
        }
        for item in items
    ]


def accumulate_tallies(rounds: list[list[VisionResultItem]]) -> list[VisionResultItem]:
    """
    Combine results from multiple photo rounds into a single tally.

    Args:
        rounds: List of VisionResult item lists from each round

    Returns:
        Combined tally with summed counts and averaged confidence
    """
    tally: dict[str, dict] = {}

    for round_items in rounds:
        for item in round_items:
            if item.category in tally:
                tally[item.category]["count"] += item.count
                tally[item.category]["confidences"].append(item.confidence)
                if item.note:
                    tally[item.category]["notes"].append(item.note)
            else:
                tally[item.category] = {
                    "count": item.count,
                    "confidences": [item.confidence],
                    "notes": [item.note] if item.note else [],
                }

    result = []
    for category, data in tally.items():
        avg_confidence = sum(data["confidences"]) // len(data["confidences"])
        note = "; ".join(data["notes"]) if data["notes"] else None
        result.append(VisionResultItem(
            category=category,
            count=data["count"],
            confidence=avg_confidence,
            note=note,
        ))

    return result


class VisionServiceError(Exception):
    """Raised when the vision service encounters an error."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)
