"""
Migration: Add address_verified columns to shop.laundry_shops.

Adds:
- address_verified BOOLEAN DEFAULT FALSE
- address_verified_at TIMESTAMP

Idempotent — checks pg_catalog before adding columns.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add address_verified and address_verified_at columns if they don't exist."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Check if address_verified column already exists
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'shop'
              AND table_name = 'laundry_shops'
              AND column_name = 'address_verified'
        """)
        if not cur.fetchone():
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN address_verified BOOLEAN DEFAULT FALSE
            """)
            logger.info("Added address_verified column to shop.laundry_shops")

        # Check if address_verified_at column already exists
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'shop'
              AND table_name = 'laundry_shops'
              AND column_name = 'address_verified_at'
        """)
        if not cur.fetchone():
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN address_verified_at TIMESTAMP
            """)
            logger.info("Added address_verified_at column to shop.laundry_shops")
