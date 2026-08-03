"""
Run this script once to add subscription management columns for recurring order
self-service (reschedule, skip, pause, resume).

Adds to orders.laundry_frequency:
  - is_paused BOOLEAN DEFAULT FALSE
  - pause_resume_date DATE
  - pause_started_at TIMESTAMPTZ
  - original_pickup_date DATE
  - reschedule_offset INTEGER
  - consecutive_skips INTEGER DEFAULT 0
  - total_skips_30d INTEGER DEFAULT 0
  - last_skip_date DATE

Creates new table orders.subscription_actions for audit log.

Adds to shop.laundry_shops:
  - subscription_cutoff_hours INTEGER DEFAULT 12

All changes use IF NOT EXISTS / safe defaults — safe to re-run.

Usage: python run_add_subscription_management_migration.py
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

        print("Connected. Adding subscription management columns...\n")

        # ─── orders.laundry_frequency — pause columns ───
        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE"
        )
        print("   ✓ is_paused BOOLEAN DEFAULT FALSE on orders.laundry_frequency")

        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS pause_resume_date DATE"
        )
        print("   ✓ pause_resume_date DATE on orders.laundry_frequency")

        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS pause_started_at TIMESTAMPTZ"
        )
        print("   ✓ pause_started_at TIMESTAMPTZ on orders.laundry_frequency")

        # ─── orders.laundry_frequency — reschedule columns ───
        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS original_pickup_date DATE"
        )
        print("   ✓ original_pickup_date DATE on orders.laundry_frequency")

        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS reschedule_offset INTEGER"
        )
        print("   ✓ reschedule_offset INTEGER on orders.laundry_frequency")

        # ─── orders.laundry_frequency — skip tracking ───
        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS consecutive_skips INTEGER DEFAULT 0"
        )
        print("   ✓ consecutive_skips INTEGER DEFAULT 0 on orders.laundry_frequency")

        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS total_skips_30d INTEGER DEFAULT 0"
        )
        print("   ✓ total_skips_30d INTEGER DEFAULT 0 on orders.laundry_frequency")

        cur.execute(
            "ALTER TABLE orders.laundry_frequency "
            "ADD COLUMN IF NOT EXISTS last_skip_date DATE"
        )
        print("   ✓ last_skip_date DATE on orders.laundry_frequency")

        # ─── orders.subscription_actions table ───
        print("\n   Creating orders.subscription_actions table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders.subscription_actions (
                action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                frequency_id UUID NOT NULL,
                action_type VARCHAR(20) NOT NULL,
                actor VARCHAR(20) NOT NULL DEFAULT 'customer',
                original_date DATE,
                new_date DATE,
                reason VARCHAR(100),
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        print("   ✓ orders.subscription_actions table created")

        # Indexes
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_subscription_actions_freq
            ON orders.subscription_actions(frequency_id, created_at DESC)
        """)
        print("   ✓ idx_subscription_actions_freq index")

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_subscription_actions_type
            ON orders.subscription_actions(action_type, created_at DESC)
        """)
        print("   ✓ idx_subscription_actions_type index")

        # ─── shop.laundry_shops — cutoff window ───
        cur.execute(
            "ALTER TABLE shop.laundry_shops "
            "ADD COLUMN IF NOT EXISTS subscription_cutoff_hours INTEGER DEFAULT 12"
        )
        print("   ✓ subscription_cutoff_hours INTEGER DEFAULT 12 on shop.laundry_shops")

        print("\n✅ Migration completed successfully!")
        print("\nSummary:")
        print("   - 8 columns added to orders.laundry_frequency")
        print("   - 1 new table: orders.subscription_actions (with 2 indexes)")
        print("   - 1 column added to shop.laundry_shops")
        print("\nAll existing rows are unaffected (safe defaults applied).")

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
