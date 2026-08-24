"""
Run this script once to make emp_id nullable in order_reviews table.
This allows customers to submit reviews even when no specific employee processed their order.
Usage: python run_review_empid_migration.py
"""
import os
import sys
import psycopg2

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

        # Make emp_id nullable in order_reviews
        print("  -> Making emp_id nullable in orders.order_reviews...")
        cur.execute("""
            ALTER TABLE orders.order_reviews
            ALTER COLUMN emp_id DROP NOT NULL;
        """)

        conn.commit()
        print("\n✅ Migration completed successfully!")
        print("   - orders.order_reviews.emp_id is now nullable")

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
