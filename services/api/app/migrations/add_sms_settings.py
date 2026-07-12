"""
Migration: Add sms_enabled and sms_count columns to shop.laundry_shops.
Controls whether order-related SMS notifications are sent for a tenant.
Safe to run multiple times (IF NOT EXISTS pattern).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add SMS settings columns."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Add sms_enabled column (default FALSE — SMS off unless tenant opts in)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop' AND table_name = 'laundry_shops' AND column_name = 'sms_enabled'
                ) THEN
                    ALTER TABLE shop.laundry_shops ADD COLUMN sms_enabled BOOLEAN DEFAULT FALSE;
                END IF;
            END $$
        """)

        # Add sms_count column for tracking usage
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop' AND table_name = 'laundry_shops' AND column_name = 'sms_count'
                ) THEN
                    ALTER TABLE shop.laundry_shops ADD COLUMN sms_count INTEGER DEFAULT 0;
                END IF;
            END $$
        """)

        logger.info("Migration: sms_enabled and sms_count columns added to laundry_shops.")
