"""
Migration: Add input_weight and category_id columns to orders.order_services
for unified cart mixed-type order support.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add input_weight and category_id to orders.order_services."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Add input_weight column
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'orders'
                      AND table_name = 'order_services'
                      AND column_name = 'input_weight'
                ) THEN
                    ALTER TABLE orders.order_services
                    ADD COLUMN input_weight BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        """)

        # Add category_id column
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'orders'
                      AND table_name = 'order_services'
                      AND column_name = 'category_id'
                ) THEN
                    ALTER TABLE orders.order_services
                    ADD COLUMN category_id VARCHAR(50);
                END IF;
            END $$;
        """)

        logger.info("Migration: input_weight and category_id columns added to orders.order_services.")
