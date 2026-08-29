"""
FAQ token resolver service.
Resolves {{token}} placeholders in FAQ answer templates with real tenant data
from shop.laundry_shops, shop.laundry_services, and related tables.
"""
import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported tokens — maps token name to human-readable description
# ---------------------------------------------------------------------------
SUPPORTED_TOKENS = {
    "shop_name": "Laundry shop name",
    "address": "Full street address",
    "city": "City name",
    "state": "State abbreviation",
    "zip_code": "ZIP code",
    "phone": "Contact phone number",
    "price_wash_fold": "Wash & fold price per pound",
    "price_dry_clean": "Dry cleaning base price",
    "price_comforter": "Comforter wash price",
    "hours": "Operating hours summary",
    "delivery_areas": "Serviceable zip codes",
}

# ---------------------------------------------------------------------------
# Fallback text by token category — never leave raw {{token}} or empty string
# ---------------------------------------------------------------------------
FALLBACK_PRICING = "Please contact us for current pricing"
FALLBACK_CONTACT = "Please visit our location"
FALLBACK_HOURS = "Please contact us for our current hours"
FALLBACK_ADDRESS = "Please contact us for our location"

FALLBACK_TEXT = {
    "shop_name": FALLBACK_CONTACT,
    "address": FALLBACK_ADDRESS,
    "city": FALLBACK_ADDRESS,
    "state": FALLBACK_ADDRESS,
    "zip_code": FALLBACK_ADDRESS,
    "phone": FALLBACK_CONTACT,
    "price_wash_fold": FALLBACK_PRICING,
    "price_dry_clean": FALLBACK_PRICING,
    "price_comforter": FALLBACK_PRICING,
    "hours": FALLBACK_HOURS,
    "delivery_areas": FALLBACK_ADDRESS,
}

# Default fallback for completely unknown tokens
FALLBACK_UNKNOWN = "Please contact us for current details"

# Regex to match all {{token}} patterns
_TOKEN_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def get_tenant_data(laundry_id, conn) -> dict:
    """
    Query shop.laundry_shops and shop.laundry_services to build a
    token name → resolved value mapping for the given tenant.

    Args:
        laundry_id: The tenant's laundry_id
        conn: A database connection (from get_db context manager)

    Returns:
        Dict mapping token names to their resolved string values.
        Only includes tokens where a real value was found.
    """
    from app.database import get_cursor

    cur = get_cursor(conn)
    data = {}

    # --- Shop info ---
    cur.execute("""
        SELECT laundry_name, street, city, state, zip_code,
               contact_phone, serviceable_zip_codes, hide_home_address
        FROM shop.laundry_shops
        WHERE laundry_id = %s
    """, (laundry_id,))
    shop = cur.fetchone()

    if shop:
        if shop.get("laundry_name"):
            data["shop_name"] = shop["laundry_name"]

        # Build the address token. For home-based operators (hide_home_address),
        # the AI chat must NEVER reveal the street — use city/state only so a
        # visitor asking "where are you located?" only sees the service area.
        if shop.get("hide_home_address"):
            parts = [shop.get("city"), shop.get("state")]
        else:
            parts = [shop.get("street"), shop.get("city"), shop.get("state"), shop.get("zip_code")]
        full_address = ", ".join(p for p in parts if p)
        if full_address:
            data["address"] = full_address

        if shop.get("city"):
            data["city"] = shop["city"]
        if shop.get("state"):
            data["state"] = shop["state"]
        if shop.get("zip_code"):
            data["zip_code"] = shop["zip_code"]
        if shop.get("contact_phone"):
            data["phone"] = shop["contact_phone"]

        # Delivery areas from serviceable_zip_codes (stored as array)
        zips = shop.get("serviceable_zip_codes")
        if zips and isinstance(zips, list) and len(zips) > 0:
            data["delivery_areas"] = ", ".join(str(z) for z in zips)

    # --- Service prices ---
    cur.execute("""
        SELECT service_name, price
        FROM shop.laundry_services
        WHERE laundry_id = %s AND is_active = TRUE
    """, (laundry_id,))
    services = cur.fetchall()

    for svc in services:
        name = (svc.get("service_name") or "").lower()
        price = svc.get("price")
        if price is None:
            continue
        price_str = f"${float(price):.2f}"

        # Match service names to token categories
        if "wash" in name and "fold" in name:
            data["price_wash_fold"] = f"{price_str}/lb"
        elif "dry" in name and "clean" in name:
            data["price_dry_clean"] = price_str
        elif "comforter" in name:
            data["price_comforter"] = price_str

    # --- Hours (from site_content.hours if set, else instore_pickup_time_slots) ---
    # site_content.hours is what the tenant configures as their store operating hours
    # Format: [{"day": "Mon-Fri", "time": "7AM - 10PM"}, ...]
    cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    sc_row = cur.fetchone()
    sc = sc_row["site_content"] if sc_row and sc_row.get("site_content") else {}
    
    if sc.get("hours") and isinstance(sc["hours"], list) and len(sc["hours"]) > 0:
        # Use configured store hours from site_content
        hours_parts = [f"{h.get('day', '')}: {h.get('time', '')}" for h in sc["hours"] if h.get("day") and h.get("time")]
        if hours_parts:
            data["hours"] = ", ".join(hours_parts)
    
    if "hours" not in data:
        # Fallback to instore_pickup_time_slots
        cur.execute("""
            SELECT day_of_week, start_time, end_time
            FROM shop.instore_pickup_time_slots
            WHERE laundry_id = %s
            ORDER BY id
        """, (laundry_id,))
        slots = cur.fetchall()

        if slots:
            hours_summary = _summarize_hours(slots)
            if hours_summary:
                data["hours"] = hours_summary

    return data


def _summarize_hours(slots) -> str:
    """
    Build a human-readable hours summary from time slot rows.
    E.g. "Mon-Fri: 8:00 AM - 6:00 PM, Sat: 9:00 AM - 3:00 PM"
    """
    if not slots:
        return ""

    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_abbrev = {"Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed",
                  "Thursday": "Thu", "Friday": "Fri", "Saturday": "Sat", "Sunday": "Sun"}

    # Group by time range
    schedule = {}
    for slot in slots:
        day = slot.get("day_of_week", "")
        start = str(slot.get("start_time", ""))[:5]
        end = str(slot.get("end_time", ""))[:5]
        time_range = f"{_format_time(start)} - {_format_time(end)}"

        if time_range not in schedule:
            schedule[time_range] = []
        schedule[time_range].append(day)

    # Build summary
    parts = []
    for time_range, days in schedule.items():
        # Sort days by standard order
        sorted_days = sorted(days, key=lambda d: day_order.index(d) if d in day_order else 99)
        if len(sorted_days) >= 3 and _is_consecutive(sorted_days, day_order):
            first = day_abbrev.get(sorted_days[0], sorted_days[0][:3])
            last = day_abbrev.get(sorted_days[-1], sorted_days[-1][:3])
            parts.append(f"{first}-{last}: {time_range}")
        else:
            day_names = ", ".join(day_abbrev.get(d, d[:3]) for d in sorted_days)
            parts.append(f"{day_names}: {time_range}")

    return ", ".join(parts) if parts else ""


def _is_consecutive(days, day_order):
    """Check if a list of days forms a consecutive run in the week."""
    indices = [day_order.index(d) for d in days if d in day_order]
    if not indices:
        return False
    indices.sort()
    for i in range(1, len(indices)):
        if indices[i] - indices[i - 1] != 1:
            return False
    return True


def _format_time(time_str: str) -> str:
    """Convert HH:MM (24h) to 12-hour format with AM/PM."""
    try:
        parts = time_str.split(":")
        hour = int(parts[0])
        minute = parts[1] if len(parts) > 1 else "00"
        if hour == 0:
            return f"12:{minute} AM"
        elif hour < 12:
            return f"{hour}:{minute} AM"
        elif hour == 12:
            return f"12:{minute} PM"
        else:
            return f"{hour - 12}:{minute} PM"
    except (ValueError, IndexError):
        return time_str


def resolve_tokens(answer_template: str, tenant_data: dict) -> str:
    """
    Replace all {{token}} placeholders in the answer template with actual
    tenant values from the data map.

    - Known tokens with values → replaced with the value
    - Known tokens without values → replaced with category-specific fallback
    - Unknown tokens → replaced with generic fallback text
    - Guarantees: no {{...}} patterns remain in output

    Args:
        answer_template: The FAQ answer text containing {{token}} placeholders
        tenant_data: Dict mapping token names to resolved string values

    Returns:
        Fully resolved answer string with no remaining {{...}} patterns
    """
    def _replace_token(match):
        token_name = match.group(1)
        # Check if we have a real value in tenant data
        if token_name in tenant_data:
            return tenant_data[token_name]
        # Use category-specific fallback for known tokens
        if token_name in FALLBACK_TEXT:
            return FALLBACK_TEXT[token_name]
        # Unknown token — use generic fallback
        return FALLBACK_UNKNOWN

    return _TOKEN_PATTERN.sub(_replace_token, answer_template)


def validate_tokens(answer_template: str) -> set:
    """
    Return the set of invalid (unsupported) token names used in the template.
    Used by admin validation to reject answers with unknown tokens.

    Args:
        answer_template: The FAQ answer text to validate

    Returns:
        Set of token names that are NOT in SUPPORTED_TOKENS.
        Empty set means all tokens are valid.
    """
    used_tokens = set(_TOKEN_PATTERN.findall(answer_template))
    invalid = used_tokens - set(SUPPORTED_TOKENS.keys())
    return invalid
