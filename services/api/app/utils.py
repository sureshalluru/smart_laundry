"""
Shared utility functions — migrated from Lambda utils.py modules.
"""
from datetime import datetime, date, time, timezone
from decimal import Decimal, ROUND_HALF_UP
import uuid as _uuid


def serialize(obj):
    """Recursively convert PostgreSQL types to JSON-serializable values."""
    if isinstance(obj, dict):
        return {k: serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize(i) for i in obj]
    if isinstance(obj, datetime):
        return obj.strftime('%Y-%m-%dT%H:%M:%S.') + f"{obj.microsecond:06d}Z"
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, time):
        return str(obj)
    if isinstance(obj, Decimal):
        f = float(obj)
        return int(f) if f == int(f) else f
    if isinstance(obj, _uuid.UUID):
        return str(obj)
    return obj


def to_camel(snake_str):
    """Convert snake_case to camelCase."""
    parts = snake_str.split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])


def serialize_row(row):
    """Convert a RealDictRow to camelCase JSON-safe dict."""
    return {to_camel(k): serialize(v) for k, v in dict(row).items()}


def get_current_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def round_decimal(value):
    if isinstance(value, Decimal):
        return value.quantize(Decimal('1.00'), rounding=ROUND_HALF_UP)
    return value
