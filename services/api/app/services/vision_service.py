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


def build_vision_prompt(categories: list[str], phase: str = "intake") -> str:
    """
    Build the structured prompt for Claude Vision to identify and count
    laundry items from multiple angle photos.

    Uses different prompts for intake (dirty, spread out) vs fold (clean, stacked).

    Args:
        categories: List of configured item category names
        phase: "intake" for dirty laundry spread out, "fold" for folded stacks

    Returns:
        The system prompt string
    """
    categories_str = ", ".join(categories)

    if phase == "fold":
        return _build_fold_prompt(categories_str)
    else:
        return _build_intake_prompt(categories_str)


def _build_intake_prompt(categories_str: str) -> str:
    """Prompt for dirty laundry spread out on a table."""
    return f"""You are a laundry garment inventory assistant at a laundromat. You are analyzing 4 photos of DIRTY laundry items spread out on a table, taken from 4 specific angles:
- Photo 1: LEFT side view
- Photo 2: RIGHT side view  
- Photo 3: FRONT/STRAIGHT view
- Photo 4: TOP/OVERHEAD view

Your goal is to identify and count every visible garment by cross-referencing all 4 angles.

RULES:
1. Classify every garment using ONLY one of the categories listed below. Do NOT invent new garment categories.
2. Count only garments that are actually visible across the photos.
3. Cross-reference ALL 4 angles — the same items appear in all photos. Use left+right to see items hidden from one side. Use top view for overall layout. Use front view for depth.
4. Do NOT double-count — each physical item should be counted exactly once regardless of how many photos show it.
5. Do NOT guess hidden garments inside bunches or folds.
6. Treat matching socks as 1 pair only when both socks are visible.
7. Ignore hangers, bags, tables, laundry carts, baskets, and background objects.
8. Use visible edges, collars, sleeves, waistbands, and fabric boundaries to distinguish separate items.
9. Be thorough — a typical laundry batch has 5-30 items. Count every piece of fabric that is a garment.
10. If unsure about an item type, classify it using the CLOSEST matching category from the list. Only use "Other" as a last resort.

ALLOWED CATEGORIES (use ONLY these — do not invent new ones): {categories_str}

PRIORITY: Getting the TOTAL COUNT of all items correct is MORE important than perfect classification. If you're unsure whether something is a "T-shirt" or "Casual Shirt", pick your best guess — but NEVER skip counting an item just because you're unsure what type it is. Every garment must be counted.

NOTE: Items are spread out and separated on the table — each item should be clearly distinguishable from its neighbors. Count each distinct item you can see.

For each category found, report:
- category: The item type from the list above
- count: Number of individual items of that type
- confidence: 0-100 how certain you are about the count
- note: (optional) any observation about visibility or uncertainty

Also report the total item count across all categories.

RESPOND WITH ONLY THIS JSON — nothing else before or after:

{{
  "total_items": 10,
  "items": [
    {{"category": "T-shirts", "count": 5, "confidence": 92}},
    {{"category": "Pants", "count": 3, "confidence": 85, "note": "2 are bunched together"}},
    {{"category": "Socks (pairs)", "count": 2, "confidence": 70, "note": "some may be singles"}}
  ]
}}

Remember: Every piece of fabric that is a wearable garment should be counted. TOTAL COUNT accuracy is the #1 priority. Use all 4 angles to verify your count. Do NOT return an empty items list if garments are visible."""


def _build_fold_prompt(categories_str: str) -> str:
    """Prompt for folded/clean laundry stacked on a table."""
    return f"""You are analyzing 4 photos of FOLDED clean laundry on a table, taken from 4 specific angles:
- Photo 1: LEFT side view (reveals stack layers from the left)
- Photo 2: RIGHT side view (reveals stack layers from the right)
- Photo 3: FRONT/STRAIGHT view (shows stack height and item edges)
- Photo 4: TOP/OVERHEAD view (shows the top items and stack layout)

Your goal is to estimate the number of individual garments in the folded stacks by cross-referencing all angles.

RULES:
1. Classify every garment using ONLY one of the categories listed below. Do NOT invent new garment categories.
2. Count only garments whose boundaries can be visually distinguished across the 4 angles.
3. Use LEFT and RIGHT views to count visible layers in each stack.
4. Use FRONT view to see stack height and identify separate folded items by their edges.
5. Use TOP view to identify item types by their visible surface (collar = shirt, waistband = pants, etc.).
6. Do NOT assume garments hidden deep inside a stack — only count what you can see evidence of from any angle.
7. Cross-reference all angles to get the most accurate count — side views reveal layers that top views miss.
8. Folded items typically show distinct edges for each item — count the layers.
9. Be conservative but not overly so — if you can see distinct fold lines, count them.
10. If unsure about an item type, use the CLOSEST matching category. Only use "Other" as a last resort.

ALLOWED CATEGORIES (use ONLY these — do not invent new ones): {categories_str}

PRIORITY: Getting the TOTAL COUNT of all items correct is MORE important than perfect classification. If you're unsure whether something is a "T-shirt" or "Dress Shirt" when folded, pick your best guess — but NEVER skip counting an item just because you're unsure what type it is.

NOTE: Items are separated and individually folded — each item should be clearly distinguishable. Count each distinct folded item you can see.

For each category found, report:
- category: The item type from the list above
- count: Number of individual items you can identify
- confidence: 0-100 how certain you are (lower for items deep in stack)
- note: (optional) observation about stack depth or visibility

Also report the total item count across all categories.

RESPOND WITH ONLY THIS JSON — nothing else before or after:

{{
  "total_items": 10,
  "items": [
    {{"category": "T-shirts", "count": 5, "confidence": 88, "note": "5 distinct fold layers visible from side"}},
    {{"category": "Pants", "count": 3, "confidence": 90}},
    {{"category": "Towels", "count": 2, "confidence": 95, "note": "clearly separated"}}
  ]
}}

Remember: Folded laundry always has items. TOTAL COUNT accuracy is the #1 priority. Use all 4 angles — especially side views — to count layers. Do NOT return an empty items list if folded garments are visible."""


def _resize_image(image_bytes: bytes, media_type: str, max_dimension: int = 1568) -> bytes:
    """
    Resize image so longest side is at most max_dimension pixels.
    Uses Pillow. Returns resized bytes in the same format.
    Falls back to original if Pillow unavailable or resize fails.
    """
    try:
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_bytes))

        # Only resize if larger than max
        width, height = img.size
        if max(width, height) <= max_dimension:
            return image_bytes

        # Calculate new dimensions maintaining aspect ratio
        if width > height:
            new_width = max_dimension
            new_height = int(height * (max_dimension / width))
        else:
            new_height = max_dimension
            new_width = int(width * (max_dimension / height))

        img = img.resize((new_width, new_height), Image.LANCZOS)

        # Save to bytes
        output = io.BytesIO()
        fmt = "PNG" if media_type == "image/png" else "JPEG"
        img.save(output, format=fmt, quality=85)
        resized_bytes = output.getvalue()

        logger.info(f"[VISION] Resized image from {width}x{height} ({len(image_bytes)} bytes) to {new_width}x{new_height} ({len(resized_bytes)} bytes)")
        return resized_bytes
    except ImportError:
        logger.warning("[VISION] Pillow not installed, skipping image resize")
        return image_bytes
    except Exception as e:
        logger.warning(f"[VISION] Image resize failed: {e}, using original")
        return image_bytes


async def analyze_photos(
    image_urls: list[str],
    categories: list[str],
    phase: str = "intake",
    image_data: list[tuple[bytes, str]] | None = None,
) -> VisionResult:
    """
    Send images to Claude Vision API for item identification and counting.

    Args:
        image_urls: List of S3 URLs for the uploaded photos (2-3 angle shots)
        categories: List of configured item category names for classification
        phase: "intake" for dirty laundry, "fold" for folded stacks
        image_data: Optional pre-loaded image data as [(bytes, content_type), ...].
                    When provided, skips HTTP re-download from S3.

    Returns:
        VisionResult with identified items, counts, and confidence scores

    Raises:
        VisionServiceError: If the API call fails
    """
    import time

    start_time = time.time()

    try:
        if not settings.anthropic_api_key:
            raise VisionServiceError("VISION_UNAVAILABLE", "Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment.")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        import base64

        content = []

        if image_data:
            # Use pre-loaded bytes directly (skip HTTP re-download from S3)
            for i, (img_bytes, media_type) in enumerate(image_data):
                img_bytes = _resize_image(img_bytes, media_type, max_dimension=1568)
                img_base64 = base64.standard_b64encode(img_bytes).decode("utf-8")
                logger.info(f"[VISION] Using pre-loaded image {i+1}/{len(image_data)}: {len(img_bytes)} bytes, {media_type}")
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": img_base64,
                    },
                })
        else:
            # Fallback: fetch from URLs (existing behavior for backward compatibility)
            import httpx

            for i, url in enumerate(image_urls):
                try:
                    logger.info(f"[VISION] Fetching image {i+1}/{len(image_urls)}: {url[:80]}...")
                    resp = httpx.get(url, timeout=10)
                    if resp.status_code == 200:
                        # Detect media type
                        media_type = "image/jpeg"
                        if resp.content[:8] == b'\x89PNG\r\n\x1a\n':
                            media_type = "image/png"
                        # Resize before encoding
                        img_bytes = _resize_image(resp.content, media_type, max_dimension=1568)
                        img_base64 = base64.standard_b64encode(img_bytes).decode("utf-8")
                        logger.info(f"[VISION] Image {i+1} fetched OK: {len(img_bytes)} bytes, {media_type}")
                        content.append({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": img_base64,
                            },
                        })
                    else:
                        logger.warning(f"[VISION] Failed to fetch image {i+1} from {url}: HTTP {resp.status_code}")
                except Exception as e:
                    logger.warning(f"[VISION] Failed to fetch image {i+1} from {url}: {e}")

        if not content:
            raise VisionServiceError("INVALID_IMAGE", "Could not fetch any uploaded images for analysis")

        content.append({
            "type": "text",
            "text": "Please identify and count all laundry items visible in these photos. The photos show the same set of items from different angles.",
        })

        # Call Claude Vision
        logger.info(f"[VISION] Calling Claude with {len(content) - 1} images, phase={phase}, categories: {categories}")
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=build_vision_prompt(categories, phase=phase),
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

        logger.info(f"[VISION] Claude response ({processing_time}ms): {response_text[:500]}")

        # Extract JSON from response
        result_data = _parse_vision_response(response_text, categories)

        logger.info(f"[VISION] Parsed {len(result_data)} item categories from response")
        if len(result_data) == 0:
            logger.warning(f"[VISION] ZERO ITEMS DETECTED! Full response: {response_text}")

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

    # Try to extract JSON from anywhere in the response
    if not text.startswith("{"):
        # Look for JSON object in the text
        import re
        json_match = re.search(r'\{[\s\S]*"items"[\s\S]*\}', text)
        if json_match:
            text = json_match.group()
            logger.info(f"[VISION] Extracted JSON from mixed response")
        else:
            logger.warning(f"[VISION] No JSON found in response: {text[:300]}")
            return []

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"[VISION] JSON parse failed: {e}. Text: {text[:300]}")
        return []

    if "items" not in data:
        logger.warning(f"[VISION] Response JSON has no 'items' key. Keys: {list(data.keys())}")
        return []

    logger.info(f"[VISION] Parsed JSON successfully with {len(data['items'])} items")

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
