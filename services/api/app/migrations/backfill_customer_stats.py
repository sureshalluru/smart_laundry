"""
Migration: Backfill customer_laundry_stats with real order data.

The stats table was only ever INSERT'd with zeroes. This one-time backfill
populates total_orders_placed, total_order_value, last_completed_order_id,
and last_completed_at from actual completed orders.

Safe to run multiple times — it overwrites stats with the latest computed
values, so re-running is harmless (idempotent by outcome).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Backfill customer_laundry_stats from completed orders."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Compute stats from orders with status_category = 'Completed'
            # and update the stats table in one statement.
            cur.execute("""
                UPDATE shop.customer_laundry_stats cls
                SET
                    total_orders_placed = sub.order_count,
                    total_order_value = sub.order_total,
                    last_completed_order_id = sub.last_order_id,
                    last_completed_at = sub.last_completed
                FROM (
                    SELECT
                        o.customer_id,
                        o.laundry_id,
                        COUNT(*) AS order_count,
                        COALESCE(SUM(o.grand_total), 0) AS order_total,
                        (ARRAY_AGG(o.order_id ORDER BY o.updated_at DESC))[1] AS last_order_id,
                        MAX(o.updated_at) AS last_completed
                    FROM orders.orders o
                    WHERE o.status_category = 'Completed'
                      AND o.customer_id IS NOT NULL
                    GROUP BY o.customer_id, o.laundry_id
                ) sub
                WHERE cls.customer_id = sub.customer_id
                  AND cls.laundry_id = sub.laundry_id
            """)

            updated = cur.rowcount
            logger.info(
                f"Migration backfill_customer_stats complete — "
                f"{updated} customer-laundry records updated with real order totals."
            )

    except Exception as e:
        logger.error(f"Migration backfill_customer_stats failed: {e}")
