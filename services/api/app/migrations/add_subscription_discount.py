"""
Migration: Add subscription_discount column to laundry_shops for Subscribe & Save feature.
Default is 5% for all tenants.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add subscription_discount to laundry_shops with default 5%."""
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
                    ADD COLUMN subscription_discount NUMERIC(5,2) DEFAULT 5;
                END IF;
            END $$;
        """)
        # Ensure default is 5 and update existing NULLs/zeros
        cur.execute("""
            ALTER TABLE shop.laundry_shops ALTER COLUMN subscription_discount SET DEFAULT 5;
        """)
        cur.execute("""
            UPDATE shop.laundry_shops SET subscription_discount = 5
            WHERE subscription_discount IS NULL OR subscription_discount = 0;
        """)
        logger.info("Migration: subscription_discount default set to 5%%.")
