"""
Migration: Add google_review_url column to shop.laundry_shops.
Allows each laundry to configure their Google Review link for customer notifications.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add google_review_url to laundry_shops table (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'shop'
                          AND table_name = 'laundry_shops'
                          AND column_name = 'google_review_url'
                    ) THEN
                        ALTER TABLE shop.laundry_shops
                        ADD COLUMN google_review_url TEXT;
                    END IF;
                END $$
            """)
            logger.info("Migration: google_review_url column added to shop.laundry_shops.")
    except Exception as e:
        logger.error(f"Migration add_google_review_url failed: {e}")
