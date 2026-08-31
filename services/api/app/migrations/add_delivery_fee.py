"""
Migration: distance/flat delivery fee (Phase 3).

Adds a tenant-configurable delivery fee. The tenant chooses one of three modes
(`none` | `flat` | `distance`) and sets the amounts. Everything defaults to
`none` (free delivery) so EVERY existing tenant bills byte-identically until
they explicitly opt in.

Columns added on shop.laundry_shops (all nullable / defaulted → no live change):

  delivery_fee_mode          VARCHAR(10) NOT NULL DEFAULT 'none'
      The tenant's choice: 'none' (no fee), 'flat' (one fixed fee per
      delivery), or 'distance' (base + per-mile). Unknown/missing → treated as
      'none' by the pricing helper.

  delivery_fee_enabled       BOOLEAN NOT NULL DEFAULT FALSE
      Convenience mirror (enabled = mode != 'none'), kept so the flag lifecycle
      matches the Phase-2 min_weight_enabled/addons_enabled pattern.

  delivery_fee_flat          NUMERIC(10,2) DEFAULT 0
      The flat fee amount (used in 'flat' mode).

  delivery_fee_base          NUMERIC(10,2) DEFAULT 0
  delivery_fee_per_mile      NUMERIC(10,2) DEFAULT 0
  delivery_fee_free_radius_mi NUMERIC(10,2) DEFAULT 0
  delivery_fee_max           NUMERIC(10,2) NULL          (null = no cap)
  delivery_fee_road_factor   NUMERIC(6,3) DEFAULT 1.0
      'distance' mode parameters: fee = base + max(0, road_factor*miles -
      free_radius) * per_mile, capped at max.

  latitude / longitude       NUMERIC(10,7) / NUMERIC(10,7) NULL
      Cached geocoded coordinates of the shop, so 'distance' mode geocodes the
      shop at most once rather than on every order.

Columns added on orders.orders (snapshotted at order time, so later config
edits never rewrite a historical order):

  delivery_fee               NUMERIC(10,2) DEFAULT 0
  delivery_distance_mi       NUMERIC(10,2) NULL

Idempotent: every statement uses IF NOT EXISTS, so re-running is a no-op.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add delivery-fee config columns (shop) and snapshot columns (orders)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # ── Tenant config on shop.laundry_shops ──────────────────────────
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_mode VARCHAR(10) NOT NULL DEFAULT 'none'
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_enabled BOOLEAN NOT NULL DEFAULT FALSE
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_flat NUMERIC(10,2) DEFAULT 0
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_base NUMERIC(10,2) DEFAULT 0
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_per_mile NUMERIC(10,2) DEFAULT 0
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_free_radius_mi NUMERIC(10,2) DEFAULT 0
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_max NUMERIC(10,2)
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS delivery_fee_road_factor NUMERIC(6,3) DEFAULT 1.0
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7)
            """)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)
            """)
            # Max serviceable distance (miles) from the shop. NULL = no limit.
            # When set, an address farther than this is treated as not
            # serviceable even if its zip is in serviceable_zip_codes.
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS max_serviceable_distance_mi NUMERIC(10,2)
            """)

            # ── Per-order snapshot on orders.orders ──────────────────────────
            cur.execute("""
                ALTER TABLE orders.orders
                ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0
            """)
            cur.execute("""
                ALTER TABLE orders.orders
                ADD COLUMN IF NOT EXISTS delivery_distance_mi NUMERIC(10,2)
            """)

            logger.info(
                "Migration: delivery fee columns added (mode default 'none' — "
                "no live billing change)."
            )
    except Exception as e:
        logger.error(f"Migration add_delivery_fee failed: {e}")
