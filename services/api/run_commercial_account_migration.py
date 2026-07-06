"""
Run this script once to add commercial account columns to the database.

Adds:
  - billing_email VARCHAR(255) DEFAULT NULL to shop.customers
  - is_commercial BOOLEAN NOT NULL DEFAULT FALSE to shop.customers
  - is_commercial BOOLEAN NOT NULL DEFAULT FALSE to orders.laundry_frequency

Uses ADD COLUMN IF NOT EXISTS so it is safe to re-run.

Usage: python run_commercial_account_migration.py
"""
import os
import sys
import psycopg2

# Load .env file if present (for local development)
from pathlib import Path
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


def run_migration():
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")

    conn = None
    cur = None
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )
        conn.autocommit = True
        cur = conn.cursor()

        print("Connected. Adding commercial account columns...")

        # Add billing_email to shop.customers
        cur.execute(
            "ALTER TABLE shop.customers "
            "ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255) DEFAULT NULL"
        )
        print("   - Added billing_email to shop.customers")

        # Add is_commercial to shop.customers
        cur.execute(
            "ALTER TABLE shop.customers "
            "ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN NOT NULL DEFAULT FALSE"
        )
        print("   - Added is_commercial to shop.customers")

        # Add is_commercial to orders.laundry_frequency
        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN NOT NULL DEFAULT FALSE"
        )
        print("   - Added is_commercial to orders.laundry_frequency")

        print("\n✅ Migration completed successfully!")
        print("   - billing_email VARCHAR(255) DEFAULT NULL on shop.customers")
        print("   - is_commercial BOOLEAN NOT NULL DEFAULT FALSE on shop.customers")
        print("   - is_commercial BOOLEAN NOT NULL DEFAULT FALSE on orders.laundry_frequency")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()
