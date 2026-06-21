"""
Migration: Add item tracking tables for laundry item counting and reconciliation.
Creates tracking schema with tables for item categories, intake records,
fold records, and tracking sessions.
Safe to run multiple times (uses IF NOT EXISTS checks).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the item tracking migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Create tracking schema
        cur.execute("CREATE SCHEMA IF NOT EXISTS tracking")

        # Create item_categories table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracking.item_categories (
                category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                laundry_id TEXT NOT NULL,
                name TEXT NOT NULL,
                display_order INT NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (laundry_id, name)
            )
        """)

        # Create intake_records table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracking.intake_records (
                record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                items JSONB NOT NULL,
                photo_urls JSONB NOT NULL,
                vision_results JSONB,
                status TEXT NOT NULL DEFAULT 'confirmed',
                confirmed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (order_id, laundry_id)
            )
        """)

        # Create fold_records table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracking.fold_records (
                record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                items JSONB NOT NULL,
                photo_urls JSONB NOT NULL,
                vision_results JSONB,
                discrepancies JSONB,
                acknowledgements JSONB,
                status TEXT NOT NULL DEFAULT 'confirmed',
                confirmed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (order_id, laundry_id)
            )
        """)

        # Create tracking_sessions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracking.tracking_sessions (
                session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'waiting',
                result_data JSONB,
                expires_at TIMESTAMP NOT NULL,
                confirmed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (order_id, laundry_id, phase)
            )
        """)

        # Create indexes for performance
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_intake_records_order_id
            ON tracking.intake_records (order_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_intake_records_laundry_id
            ON tracking.intake_records (laundry_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_fold_records_order_id
            ON tracking.fold_records (order_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_fold_records_laundry_id
            ON tracking.fold_records (laundry_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tracking_sessions_order_id
            ON tracking.tracking_sessions (order_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tracking_sessions_status
            ON tracking.tracking_sessions (status)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_item_categories_laundry_id
            ON tracking.item_categories (laundry_id)
        """)

        # Add unique constraint on tracking_sessions if not exists
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_sessions_unique_order_phase
            ON tracking.tracking_sessions (order_id, laundry_id, phase)
        """)

        logger.info("Migration: item tracking tables created successfully.")


# Default categories to seed for new laundries
DEFAULT_CATEGORIES = [
    "Shirts",
    "Pants",
    "Shorts",
    "Socks (pairs)",
    "Underwear",
    "Towels",
    "Sheets",
    "Comforters",
    "Delicates",
    "Other",
]


def seed_default_categories(laundry_id: str):
    """
    Insert default item categories for a laundry if none exist.
    Safe to call multiple times — only inserts if no categories are configured.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Check if laundry already has categories
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM tracking.item_categories WHERE laundry_id = %s",
            (laundry_id,),
        )
        row = cur.fetchone()
        if row and row["cnt"] > 0:
            return  # Categories already exist

        # Insert defaults
        for i, name in enumerate(DEFAULT_CATEGORIES):
            cur.execute(
                """
                INSERT INTO tracking.item_categories (laundry_id, name, display_order)
                VALUES (%s, %s, %s)
                ON CONFLICT (laundry_id, name) DO NOTHING
                """,
                (laundry_id, name, i),
            )

        logger.info(f"Seeded default item categories for laundry {laundry_id}.")
