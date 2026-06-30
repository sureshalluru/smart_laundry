"""
Migration: Add company_id FK column to shop.laundry_shops.

Links laundry shops to their parent company for multi-location
management. The column is nullable — standalone laundries have
company_id = NULL and continue to operate identically.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add company_id FK to shop.laundry_shops with index (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Add company_id column if it doesn't already exist
            cur.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'shop'
                          AND table_name = 'laundry_shops'
                          AND column_name = 'company_id'
                    ) THEN
                        ALTER TABLE shop.laundry_shops
                            ADD COLUMN company_id UUID
                            REFERENCES shop.companies(company_id)
                            ON DELETE SET NULL;
                    END IF;
                END $$
            """)

            # Create index on the new column
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_laundry_shops_company
                ON shop.laundry_shops(company_id)
            """)

            logger.info(
                "Migration add_laundry_company_fk complete — "
                "company_id column added to shop.laundry_shops."
            )

    except Exception as e:
        logger.error(f"Migration add_laundry_company_fk failed: {e}")
