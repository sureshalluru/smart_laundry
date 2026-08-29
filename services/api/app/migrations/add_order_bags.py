"""
Migration: Add orders.order_bags table for per-bag weights.

For operators who bill per pound across multiple bags, this table records one
row per physical bag on an order, with an optional weight. The order-level
weight applied to the weight-based service line stays the source of truth for
totals (written via employee-update-services); this table is the per-bag
detail used for display, auditing, and bag tags.

weight is nullable so a store can print bag tags without weighing, or weigh
only some bags. UNIQUE(order_id, laundry_id, bag_number) allows idempotent
upsert of a bag's weight.

Safe to run multiple times (IF NOT EXISTS pattern).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create orders.order_bags table (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_bags (
                    id          SERIAL NOT NULL PRIMARY KEY,
                    order_id    VARCHAR(50) NOT NULL,
                    laundry_id  VARCHAR(50) NOT NULL,
                    bag_number  INT NOT NULL,
                    weight      NUMERIC,
                    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_order_bags_order_bag
                ON orders.order_bags (order_id, laundry_id, bag_number)
            """)
            logger.info("Migration: orders.order_bags table ready.")
    except Exception as e:
        logger.error(f"Migration add_order_bags failed: {e}")
