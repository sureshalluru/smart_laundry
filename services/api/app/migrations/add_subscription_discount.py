"""
Migration: Add subscription_discount column to laundry_shops for Subscribe & Save feature.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add subscription_discount to laundry_shops."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop'
                      AND table_name = 'laundry_shops'
                      AND column_name = 'subscription_discount'
                ) THEN
                    ALTER TABLE shop.laundry_shops
                    ADD COLUMN subscription_discount NUMERIC(5,2) DEFAULT 0;
                END IF;
            END $$;
        """)
        logger.info("Migration: subscription_discount column applied.")
