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

