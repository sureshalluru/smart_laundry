"""
Migration: add recurring_discount to shop.laundry_shops.

This is the savings % for the plain "Recurring" plan (per-lb / per-item
recurring pickup), separate from subscription_discount (which is the
"Subscribe & Save" bag-subscription discount). Two independent knobs so a
tenant can price the two recurring plans differently.

Default is 0 (opt-in): existing tenants apply NO recurring discount until they
explicitly set one, so this changes no live billing on deploy. Idempotent.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                ALTER TABLE shop.laundry_shops
                ADD COLUMN IF NOT EXISTS recurring_discount NUMERIC(5,2) DEFAULT 0
            """)
            logger.info("Migration: recurring_discount column added (default 0 — no live billing change).")
    except Exception as e:
        logger.error(f"Migration add_recurring_discount failed: {e}")
