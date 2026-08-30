"""
Migration: minimum billable weight (Phase 2 sub-phase 2b).

Adds tenant-configurable minimum billable weight for per-pound services.

Columns added (all nullable / default-off, so existing tenants are unaffected
until they explicitly opt in):

  shop.laundry_services.min_billable_weight  NUMERIC NULL
      Per-service minimum weight the tenant wants to bill (e.g. 20 lb minimum
      for wash-and-fold). NULL = no minimum for that service.

  orders.order_services.min_billable_weight  NUMERIC NULL
      Snapshot of the service's minimum at order-creation time, so later edits
      to the catalog value never rewrite the price of a historical order.

  shop.laundry_shops.min_weight_enabled  BOOLEAN NOT NULL DEFAULT FALSE
      Master tenant opt-in. When FALSE, billing is byte-identical to today —
      the shared pricing helper is called with apply_minimums=False.

  shop.laundry_shops.addons_enabled  BOOLEAN NOT NULL DEFAULT FALSE
      Master tenant opt-in for add-ons/extras (used in sub-phase 2c). Added
      here so the flags land together in one deploy.

  shop.laundry_shops.min_weight_scope  VARCHAR(20) NOT NULL DEFAULT 'all'
      Which order channels the minimum applies to: 'all', 'online', or
      'instore'. Only consulted when min_weight_enabled is TRUE. Default 'all'
      matches the intuitive "on = applies everywhere" behavior.

Idempotent: every statement uses IF NOT EXISTS, so re-running is a no-op.
Default FALSE on the flags means NO live tenant's billing changes on deploy.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add min-weight columns and tenant opt-in flags."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            cur.execute("""
                ALTER TABLE shop.laundry_services
                ADD COLUMN IF NOT EXISTS min_billable_weight NUMERIC
            """)

            cur.execute("""
                ALTER TABLE orders.order_services
                ADD COLUMN IF NOT EXISTS min_billable_weight NUMERIC
            """)

            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS min_weight_enabled BOOLEAN NOT NULL DEFAULT FALSE
            """)

            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS addons_enabled BOOLEAN NOT NULL DEFAULT FALSE
            """)

            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS min_weight_scope VARCHAR(20) NOT NULL DEFAULT 'all'
            """)

            logger.info(
                "Migration: min_billable_weight + min_weight_enabled/addons_enabled/"
                "min_weight_scope added (default off/all — no live billing change)."
            )
    except Exception as e:
        logger.error(f"Migration add_order_min_weight failed: {e}")
