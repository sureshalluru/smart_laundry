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
        _conn = None
    elif _conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
        # Only rollback if the transaction is in an error/aborted state
        # STATUS_IN_TRANSACTION with no error means a normal open transaction — leave it alone
        if _conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_INERROR:
            try:
                _conn.rollback()
            except Exception:
                _conn = None

    if _conn is None:
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
    try:
        get_conn().rollback()
    except Exception:
        # If rollback itself fails, force a fresh connection next time
        global _conn
        _conn = None

def set_emp_id(emp_id):
    """
    Set the current employee ID for the transaction so audit triggers can read it.
    SET LOCAL resets automatically on commit/rollback.
    """
    if emp_id:
        get_cursor().execute("SET LOCAL app.current_emp_id = %s", (str(emp_id),))

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
