"""
Run this script once to add washing and drying workflow columns to the orders table.
Adds washing_image_url and drying_image_url columns for multi-photo capture during
the washing and drying workflow steps.

Usage: python run_washing_drying_columns_migration.py
"""
import os
import sys
import psycopg2

# Load from environment; safe local defaults (never hardcode production creds)
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
        conn.autocommit = False
        cur = conn.cursor()

        print("Connected. Running washing/drying columns migration...")

        # 1. Add washing_image_url to orders.orders
        print("  -> Adding washing_image_url column to orders.orders...")
        cur.execute("""
            ALTER TABLE orders.orders
            ADD COLUMN IF NOT EXISTS washing_image_url TEXT DEFAULT NULL;
        """)

        # 2. Add drying_image_url to orders.orders
        print("  -> Adding drying_image_url column to orders.orders...")
        cur.execute("""
            ALTER TABLE orders.orders
            ADD COLUMN IF NOT EXISTS drying_image_url TEXT DEFAULT NULL;
        """)

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("   - orders.orders now has 'washing_image_url' (TEXT, nullable)")
        print("   - orders.orders now has 'drying_image_url' (TEXT, nullable)")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()
