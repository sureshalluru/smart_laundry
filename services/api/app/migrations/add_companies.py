"""
Migration: Create shop.companies table.

Provides the company entity that groups multiple laundry locations
under a single parent for multi-location management.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create shop.companies table (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.companies (
                    company_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company_name  VARCHAR(255) NOT NULL,
                    contact_email VARCHAR(255),
                    contact_phone VARCHAR(50),
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            logger.info("Migration add_companies complete — shop.companies table created.")

    except Exception as e:
        logger.error(f"Migration add_companies failed: {e}")
