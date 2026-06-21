"""
Migration: Add customer_pricing table for per-customer custom pricing and discounts.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create customer_pricing table."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.customer_pricing (
                id SERIAL PRIMARY KEY,
                customer_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                pricing_type TEXT NOT NULL DEFAULT 'discount',
                service_name TEXT,
                value NUMERIC(10,2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (customer_id, laundry_id, service_name)
            )
        """)
        logger.info("Migration: customer_pricing table applied.")
