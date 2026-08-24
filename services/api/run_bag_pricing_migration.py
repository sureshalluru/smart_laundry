"""
Run this script once to add per-bag pricing columns to the database.
Usage: python run_bag_pricing_migration.py
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

        print("Connected. Running migration...")

        # 1. Add bag_price to laundry_shops
        print("  -> Adding bag_price column to shop.laundry_shops...")
        cur.execute("""
            ALTER TABLE shop.laundry_shops
            ADD COLUMN IF NOT EXISTS bag_price NUMERIC(10,2) DEFAULT 30.00;
        """)

        # 2. Add pricing_type to orders
        print("  -> Adding pricing_type column to orders.orders...")
        cur.execute("""
            ALTER TABLE orders.orders
            ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'per_pound';
        """)

        # 3. Backfill existing orders
        print("  -> Setting pricing_type = 'per_pound' for existing orders...")
        cur.execute("""
            UPDATE orders.orders
            SET pricing_type = 'per_pound'
            WHERE pricing_type IS NULL;
        """)

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("   - shop.laundry_shops now has 'bag_price' (default $30.00)")
        print("   - orders.orders now has 'pricing_type' (default 'per_pound')")

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
