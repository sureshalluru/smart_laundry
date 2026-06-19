"""
Migration: Add service_categories table and category_id FK on laundry_services.
Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS checks).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the service categories migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Create service_categories table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.service_categories (
                category_id SERIAL PRIMARY KEY,
                laundry_id TEXT NOT NULL,
                category_name TEXT NOT NULL,
                display_order INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (laundry_id, category_name)
            )
        """)

        # Add category_id column to laundry_services if not exists
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'shop'
                      AND table_name = 'laundry_services'
                      AND column_name = 'category_id'
                ) THEN
                    ALTER TABLE shop.laundry_services
                    ADD COLUMN category_id INT REFERENCES shop.service_categories(category_id) ON DELETE SET NULL;
                END IF;
            END $$;
        """)

        logger.info("Migration: service_categories table and FK applied successfully.")
