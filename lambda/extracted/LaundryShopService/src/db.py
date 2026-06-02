"""
Shared PostgreSQL connection helper.
Reads DB credentials from Lambda environment variables.
"""
import os
import psycopg2
import psycopg2.extras

_conn = None

def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(
            host=os.environ["DB_HOST"],
            port=int(os.environ.get("DB_PORT", 5432)),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
        )
        _conn.autocommit = False
    return _conn

def get_cursor():
    return get_conn().cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def commit():
    get_conn().commit()

def rollback():
    get_conn().rollback()

def serialize(obj):
    """
    Recursively convert PostgreSQL types that are not JSON serializable:
      datetime / date  → ISO string with Z suffix
      Decimal          → float (or int if whole number)
      UUID             → str
      dict / list      → recurse
    Use this before returning any DB row in a Lambda response.
    """
    import datetime
    from decimal import Decimal
    import uuid as _uuid

    if isinstance(obj, dict):
        return {k: serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize(i) for i in obj]
    if isinstance(obj, datetime.datetime):
        # Always return Z-suffix ISO format the UI expects
        return obj.strftime('%Y-%m-%dT%H:%M:%S.') + f"{obj.microsecond:06d}Z"
    if isinstance(obj, datetime.date):
        return obj.isoformat()
    if isinstance(obj, datetime.time):
        return str(obj)
    if isinstance(obj, Decimal):
        f = float(obj)
        return int(f) if f == int(f) else f
    if isinstance(obj, _uuid.UUID):
        return str(obj)
    return obj


def to_camel(snake_str):
    """Convert snake_case string to camelCase."""
    parts = snake_str.split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])


def serialize_row(row):
    """
    Convert a psycopg2 RealDictRow to a camelCase JSON-safe dict.
    Combines serialize() + snake_case → camelCase key conversion.
    """
    return {to_camel(k): serialize(v) for k, v in dict(row).items()}
