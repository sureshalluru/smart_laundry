"""
Migration: saved customer preferences (Phase 2 sub-phase 2d).

shop.customer_preferences stores a customer's default choices for a given
tenant as a JSONB blob. The first use is default add-on selections (P2.6/2.7):
on order-create, if the customer sends no per-order add-ons, the order is seeded
from their saved defaults; the customer can opt to save a new selection as the
default.

Keyed uniquely by (customer_id, laundry_id) so preferences are per-tenant and
UPSERTable. Additive and optional — no existing flow changes unless a customer
saves a preference. Idempotent (IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create the per-tenant customer preferences table."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_preferences (
                    id            SERIAL NOT NULL PRIMARY KEY,
                    customer_id   VARCHAR(100) NOT NULL,
                    laundry_id    VARCHAR(50) NOT NULL,
                    preferences   JSONB DEFAULT '{}'::jsonb NOT NULL,
                    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            # Unique per customer+tenant so preferences can be UPSERTed.
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_preferences_customer_laundry
                ON shop.customer_preferences (customer_id, laundry_id)
            """)

            logger.info("Migration: customer_preferences table ready.")
    except Exception as e:
        logger.error(f"Migration add_customer_preferences failed: {e}")
