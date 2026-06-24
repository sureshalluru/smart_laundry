"""
Migration: Add referral fields to shop.laundry_shops

Adds referred_by_name and referred_by_email columns to track who referred
each tenant. Used for the 10% monthly subscription referral payout.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add referral columns to laundry_shops table (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Check if columns already exist
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'shop' AND table_name = 'laundry_shops'
                AND column_name IN ('referred_by_name', 'referred_by_email')
            """)
            existing = {row["column_name"] for row in cur.fetchall()}

            if "referred_by_name" not in existing:
                cur.execute("ALTER TABLE shop.laundry_shops ADD COLUMN referred_by_name VARCHAR(255)")
                logger.info("Added referred_by_name column to shop.laundry_shops")

            if "referred_by_email" not in existing:
                cur.execute("ALTER TABLE shop.laundry_shops ADD COLUMN referred_by_email VARCHAR(255)")
                logger.info("Added referred_by_email column to shop.laundry_shops")

    except Exception as e:
        logger.error(f"Migration add_referral_fields failed: {e}")
