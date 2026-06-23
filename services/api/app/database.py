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
        # Prefer DATABASE_URL if set (Render provides this), otherwise build from parts
        if settings.database_url and settings.database_url != "postgresql://localhost:5432/smart_laundry":
            conninfo = settings.database_url
        else:
            conninfo = f"host={settings.db_host} port={settings.db_port} dbname={settings.db_name} user={settings.db_user} password={settings.db_password} sslmode=prefer"
        _pool = ConnectionPool(
            conninfo=conninfo,
            min_size=2,
            max_size=20,
            # Check connection health before handing it to the app
            check=ConnectionPool.check_connection,
            # Recycle idle connections after 5 minutes (before server drops them)
            max_idle=300,
            # Reconnect stale connections automatically
            reconnect_timeout=5,
        )
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
            try:
                conn.rollback()
            except Exception:
                pass  # Connection already lost, pool will discard it
            raise


def get_cursor(conn):
    """Get a dict cursor from a connection."""
    return conn.cursor(row_factory=dict_row)
