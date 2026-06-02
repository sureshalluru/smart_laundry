"""
Database compatibility layer — uses psycopg3.
Provides the same interface as the Lambda db.py module.
"""
import psycopg
from psycopg.rows import dict_row
from app.config import settings
from datetime import datetime, date, time
from decimal import Decimal
import uuid as _uuid
import threading

_local = threading.local()


def get_conn():
    """Get or create a connection for the current thread."""
    conn = getattr(_local, 'conn', None)
    if conn is None or conn.closed:
        conninfo = f"host={settings.db_host} port={settings.db_port} dbname={settings.db_name} user={settings.db_user} password={settings.db_password}"
        conn = psycopg.connect(conninfo, autocommit=False, row_factory=dict_row)
        _local.conn = conn
    return conn


def get_cursor():
    return get_conn().cursor()


def commit():
    conn = getattr(_local, 'conn', None)
    if conn and not conn.closed:
        conn.commit()


def rollback():
    conn = getattr(_local, 'conn', None)
    if conn and not conn.closed:
        try:
            conn.rollback()
        except Exception:
            pass


def close():
    conn = getattr(_local, 'conn', None)
    if conn and not conn.closed:
        try:
            conn.close()
        except Exception:
            pass
    _local.conn = None


def set_emp_id(emp_id):
    """Set employee ID for audit triggers."""
    if emp_id:
        get_cursor().execute("SET LOCAL app.current_emp_id = %s", (str(emp_id),))


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
    """Convert a dict row to camelCase JSON-safe dict."""
    return {to_camel(k): serialize(v) for k, v in dict(row).items()}
