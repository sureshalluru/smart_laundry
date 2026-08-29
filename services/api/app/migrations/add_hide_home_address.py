"""
Migration: Add hide_home_address column to shop.laundry_shops.

For home-based operators (pickup & delivery with no public drop-off location),
this flag hides the shop's street address from all client-facing surfaces
(website, booking portal, SEO city pages, public API, AI chat) while keeping
the address stored internally for driver routing and account verification.
Only city/state and the service area are shown publicly when this is enabled.

Safe to run multiple times (IF NOT EXISTS pattern).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add hide_home_address to laundry_shops table (idempotent)."""
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
                          AND column_name = 'hide_home_address'
                    ) THEN
                        ALTER TABLE shop.laundry_shops
                        ADD COLUMN hide_home_address BOOLEAN DEFAULT FALSE;
                    END IF;
                END $$
            """)
            logger.info("Migration: hide_home_address column added to shop.laundry_shops.")
    except Exception as e:
        logger.error(f"Migration add_hide_home_address failed: {e}")
