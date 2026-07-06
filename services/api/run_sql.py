"""
Run arbitrary SQL against the database.
Loads connection details from .env file.

Usage:
  python run_sql.py "SELECT * FROM shop.customers LIMIT 5"
  python run_sql.py "ALTER TYPE orders.order_status_enum ADD VALUE IF NOT EXISTS 'ReadyForDelivery'"
"""
import os
import sys
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Load .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "smart_laundry")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")


def run_sql(query):
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME}...")
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        print(f"Executing: {query[:200]}{'...' if len(query) > 200 else ''}\n")
        cur.execute(query)
        if cur.description:
            rows = cur.fetchall()
            for row in rows:
                print(dict(row))
            print(f"\n({len(rows)} rows)")
        else:
            print(f"✅ Done. Rows affected: {cur.rowcount}")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_sql.py \"YOUR SQL QUERY HERE\"")
        sys.exit(1)
    run_sql(sys.argv[1])
