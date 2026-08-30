"""
Migration: add-ons & processing extras (Phase 2 sub-phase 2c).

Two tables:

  shop.laundry_addons — per-tenant catalog of add-ons/extras the tenant offers.
      Scoped by laundry_id so, unlike the shared service catalog, one tenant's
      add-ons never leak to another. pricing_basis is 'per_pound' (priced on the
      order's billed weight) or 'per_item' (priced by quantity).

  orders.order_addons — snapshot of the add-ons applied to a specific order.
      name / basis / unit_price are copied onto the row at apply-time so later
      catalog price edits never rewrite a historical order (P2.1d).

Both are additive and gated by shop.laundry_shops.addons_enabled (added in the
2b migration, default FALSE), so no existing tenant produces add-on lines until
they opt in and configure a catalog. Idempotent (IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create the add-on catalog and order-addon snapshot tables."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_addons (
                    addon_id        SERIAL NOT NULL PRIMARY KEY,
                    laundry_id      VARCHAR(50) NOT NULL,
                    addon_name      VARCHAR(255) NOT NULL,
                    description     TEXT,
                    pricing_basis   VARCHAR(20) DEFAULT 'per_item' NOT NULL,
                    unit_price      NUMERIC NOT NULL,
                    customer_access BOOLEAN DEFAULT true NOT NULL,
                    is_active       BOOLEAN DEFAULT true NOT NULL,
                    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_laundry_addons_laundry_id
                ON shop.laundry_addons (laundry_id)
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_addons (
                    id              SERIAL NOT NULL PRIMARY KEY,
                    order_id        VARCHAR(50) NOT NULL,
                    laundry_id      VARCHAR(50) NOT NULL,
                    addon_id        INT,
                    addon_name      VARCHAR(255) NOT NULL,
                    pricing_basis   VARCHAR(20) DEFAULT 'per_item' NOT NULL,
                    unit_price      NUMERIC NOT NULL,
                    quantity        NUMERIC,
                    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_order_addons_order_id
                ON orders.order_addons (order_id)
            """)

            logger.info("Migration: laundry_addons + order_addons tables ready.")
    except Exception as e:
        logger.error(f"Migration add_order_addons failed: {e}")
