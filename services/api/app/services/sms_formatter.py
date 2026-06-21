"""
SMS formatting for item tracking notifications.
Formats intake and completion SMS messages with itemized counts.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# SMS segment limit
SINGLE_SEGMENT_LIMIT = 160


def format_intake_sms(
    shop_name: str,
    order_id: str,
    items: list[dict],
    base_url: str = "",
    laundry_id: str = "",
) -> str:
    """
    Format the intake confirmation SMS message.

    Args:
        shop_name: Name of the laundry shop
        order_id: Order identifier
        items: List of dicts with 'category' and 'count'
        base_url: Base URL for the tracking page link
        laundry_id: Laundry ID for the tracking page link

    Returns:
        Formatted SMS message string
    """
    items_str = ", ".join(
        f"{item['count']} {item['category']}" for item in items if item.get("count", 0) > 0
    )

    message = f"{shop_name} received your laundry ({order_id}): {items_str}"

    if base_url and laundry_id:
        tracking_url = f"{base_url}/order-tracking/{order_id}?laundryId={laundry_id}"
        message += f" View photos: {tracking_url}"

    return message


def format_completion_sms(
    shop_name: str,
    items: list[dict],
    has_discrepancies: bool = False,
    base_url: str = "",
    order_id: str = "",
    laundry_id: str = "",
) -> str:
    """
    Format the fold completion SMS message.

    Args:
        shop_name: Name of the laundry shop
        items: List of dicts with 'category' and 'count'
        has_discrepancies: Whether any discrepancies were acknowledged
        base_url: Base URL for the tracking page link
        order_id: Order ID for the tracking page link
        laundry_id: Laundry ID for the tracking page link

    Returns:
        Formatted SMS message string
    """
    items_str = ", ".join(
        f"{item['count']} {item['category']}" for item in items if item.get("count", 0) > 0
    )

    message = f"Your laundry is ready! {shop_name} folded: {items_str}"

    if has_discrepancies:
        message += " Note: item difference noted — please contact us with questions."

    if base_url and order_id and laundry_id:
        tracking_url = f"{base_url}/order-tracking/{order_id}?laundryId={laundry_id}"
        message += f" View details: {tracking_url}"

    return message


def is_multi_part(message: str) -> bool:
    """
    Check if a message exceeds the single SMS segment limit.

    Args:
        message: The SMS message text

    Returns:
        True if the message needs multi-part delivery
    """
    return len(message) > SINGLE_SEGMENT_LIMIT
