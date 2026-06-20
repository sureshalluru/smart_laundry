"""
Migration: Add auto_charge column to laundry_frequency and subscription_discount to frequency config.
Safe to run multiple times (IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the auto-charge migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Add auto_charge to laundry_frequency
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'orders'
                      AND table_name = 'laundry_frequency'
                      AND column_name = 'auto_charge'
                ) THEN
                    ALTER TABLE orders.laundry_frequency
                    ADD COLUMN auto_charge BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        """)

        # Add subscription_discount to frequency_intervals (optional discount %)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop'
                      AND table_name = 'frequency_intervals'
                      AND column_name = 'subscription_discount'
                ) THEN
                    ALTER TABLE shop.frequency_intervals
                    ADD COLUMN subscription_discount NUMERIC(5,2) DEFAULT 0;
                END IF;
            END $$;
        """)

        # Add auto_charge_enabled to frequency_intervals (operator toggle per interval)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop'
                      AND table_name = 'frequency_intervals'
                      AND column_name = 'auto_charge_enabled'
                ) THEN
                    ALTER TABLE shop.frequency_intervals
                    ADD COLUMN auto_charge_enabled BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        """)

        logger.info("Migration: auto_charge columns applied successfully.")
