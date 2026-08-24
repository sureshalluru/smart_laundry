"""
Run this script once to add mobile order workflow columns to the orders table.
Adds processing_image_url and fold_image_url columns.
Note: weight_image_url and last_updated_by already exist — no changes needed for those.

Usage: python run_mobile_order_columns_migration.py
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

        print("Connected. Running mobile order columns migration...")

        # 1. Add processing_image_url to orders.orders
        print("  -> Adding processing_image_url column to orders.orders...")
        cur.execute("""
            ALTER TABLE orders.orders
            ADD COLUMN IF NOT EXISTS processing_image_url TEXT DEFAULT NULL;
        """)

        # 2. Add fold_image_url to orders.orders
        print("  -> Adding fold_image_url column to orders.orders...")
        cur.execute("""
            ALTER TABLE orders.orders
            ADD COLUMN IF NOT EXISTS fold_image_url TEXT DEFAULT NULL;
        """)

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("   - orders.orders now has 'processing_image_url' (TEXT, nullable)")
        print("   - orders.orders now has 'fold_image_url' (TEXT, nullable)")
        print("   - weight_image_url already existed — no change")
        print("   - last_updated_by already existed — no change")

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
