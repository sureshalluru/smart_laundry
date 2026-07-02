"""
Run this script once to add 'Processing' to the order_status_enum in PostgreSQL.
The enum currently has 'ProcessingStarted' but not 'Processing'.

Usage: python run_add_processing_status_migration.py
"""
import os
import sys
import psycopg2

DB_HOST = os.getenv("DB_HOST", "smart-laundry.cpy626ke6rm6.us-east-1.rds.amazonaws.com")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "smart_laundry")
DB_USER = os.getenv("DB_USER", "smart_laundry")
DB_PASSWORD = os.getenv("DB_PASSWORD", "tNxSN6rX6eB0LTHlSDff")


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
        conn.autocommit = True  # ALTER TYPE requires autocommit
        cur = conn.cursor()

        print("Connected. Adding 'Processing' to order_status_enum...")

        # Add 'Processing' to the enum (IF NOT EXISTS prevents error if already added)
        cur.execute("ALTER TYPE orders.order_status_enum ADD VALUE IF NOT EXISTS 'Processing' AFTER 'ReceivedAtFacility'")

        print("\n✅ Migration completed successfully!")
        print("   - 'Processing' added to orders.order_status_enum")
        print("   - Placed after 'ReceivedAtFacility' in enum order")

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
