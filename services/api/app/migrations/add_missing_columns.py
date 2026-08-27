"""
Migration: Add columns and tables that were previously only in standalone
run_*_migration.py scripts and never integrated into run_all().

Covers:
- is_paused, pause_resume_date, pause_started_at, original_pickup_date,
  reschedule_offset, consecutive_skips, total_skips_30d, last_skip_date,
  tip_amount, tip_percentage, tip_type, tip_method, is_commercial
  on orders.laundry_frequency
- shop.engagement_config table
- shop.customer_reminders table (if not exists)

Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add missing columns and tables for fresh installs."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # ── orders.laundry_frequency: subscription management columns ──
            frequency_columns = [
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS pause_resume_date DATE",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS pause_started_at TIMESTAMPTZ",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS original_pickup_date DATE",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS reschedule_offset INTEGER",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS consecutive_skips INTEGER DEFAULT 0",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS total_skips_30d INTEGER DEFAULT 0",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS last_skip_date DATE",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS tip_percentage NUMERIC(6,2)",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS tip_type TEXT",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS tip_method TEXT",
                "ALTER TABLE orders.laundry_frequency ADD COLUMN IF NOT EXISTS is_commercial BOOLEAN NOT NULL DEFAULT FALSE",
            ]
            for sql in frequency_columns:
                cur.execute(sql)

            # ── shop.engagement_config ─────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.engagement_config (
                    id SERIAL PRIMARY KEY,
                    laundry_id TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    message_template TEXT,
                    promo_code TEXT,
                    interval_days INTEGER DEFAULT 7,
                    max_sends INTEGER DEFAULT 4,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.customer_reminders (may already exist from engagement) ─
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_reminders (
                    id SERIAL PRIMARY KEY,
                    customer_id TEXT NOT NULL,
                    laundry_id TEXT NOT NULL,
                    reminder_type TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_customer_reminders_lookup
                ON shop.customer_reminders(customer_id, laundry_id, reminder_type, created_at DESC)
            """)

            logger.info("Migration add_missing_columns complete — subscription/engagement columns and tables added.")

    except Exception as e:
        logger.error(f"Migration add_missing_columns failed: {e}")
