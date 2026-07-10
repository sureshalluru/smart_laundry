"""
Migration: Add faq_templates and tenant_faqs tables for SEO FAQ pages.
Creates shop.faq_templates (global template library) and shop.tenant_faqs
(per-tenant FAQ content) tables.
Safe to run multiple times (uses IF NOT EXISTS checks).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the FAQ tables migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Ensure shop schema exists
        cur.execute("CREATE SCHEMA IF NOT EXISTS shop")

        # Create faq_templates table (global template library)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.faq_templates (
                template_id SERIAL PRIMARY KEY,
                question TEXT NOT NULL,
                answer_template TEXT NOT NULL,
                slug VARCHAR(200) NOT NULL UNIQUE,
                category VARCHAR(100) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Create tenant_faqs table (per-tenant FAQ content)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.tenant_faqs (
                faq_id SERIAL PRIMARY KEY,
                laundry_id VARCHAR NOT NULL REFERENCES shop.laundry_shops(laundry_id),
                question TEXT NOT NULL,
                answer_template TEXT NOT NULL,
                slug VARCHAR(200) NOT NULL,
                category VARCHAR(100) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Add unique constraint on (laundry_id, slug)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_tenant_faqs_laundry_slug'
                ) THEN
                    ALTER TABLE shop.tenant_faqs
                    ADD CONSTRAINT uq_tenant_faqs_laundry_slug UNIQUE (laundry_id, slug);
                END IF;
            END $$
        """)

        # Add composite index for efficient FAQ index queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tenant_faqs_laundry_enabled_category_order
            ON shop.tenant_faqs (laundry_id, is_enabled, category, display_order)
        """)

        logger.info("Migration: faq_templates and tenant_faqs tables created successfully.")
