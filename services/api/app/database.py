"""
Database connection management — uses psycopg3 (pure Python, no C compiler needed).
"""
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from contextlib import contextmanager
from app.config import settings

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        conninfo = f"host={settings.db_host} port={settings.db_port} dbname={settings.db_name} user={settings.db_user} password={settings.db_password}"
        _pool = ConnectionPool(conninfo=conninfo, min_size=2, max_size=20)
    return _pool


@contextmanager
def get_db():
    """Context manager that provides a database connection from the pool."""
    with get_pool().connection() as conn:
        conn.autocommit = False
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def get_cursor(conn):
    """Get a dict cursor from a connection."""
    return conn.cursor(row_factory=dict_row)
