"""
Migration: Create shop.company_admins table.

Provides company admin credentials (email, password hash) for
multi-location management authentication.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create shop.company_admins table with indexes (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.company_admins (
                    admin_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company_id     UUID NOT NULL REFERENCES shop.companies(company_id) ON DELETE CASCADE,
                    email          VARCHAR(255) NOT NULL UNIQUE,
                    password_hash  VARCHAR(255) NOT NULL,
                    first_name     VARCHAR(100),
                    last_name      VARCHAR(100),
                    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_company_admins_email
                ON shop.company_admins(email)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_company_admins_company
                ON shop.company_admins(company_id)
            """)

            logger.info("Migration add_company_admins complete — shop.company_admins table created.")

    except Exception as e:
        logger.error(f"Migration add_company_admins failed: {e}")
