"""
Migration: Add driver_locations table for live driver tracking.
Creates routes.driver_locations table to store the latest GPS position per driver.
Safe to run multiple times (uses IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the driver locations migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Ensure routes schema exists
        cur.execute("CREATE SCHEMA IF NOT EXISTS routes")

        # Create driver_locations table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS routes.driver_locations (
                driver_id VARCHAR(50) PRIMARY KEY,
                laundry_id VARCHAR(50) NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                heading DOUBLE PRECISION DEFAULT 0,
                speed DOUBLE PRECISION DEFAULT 0,
                current_stop_position INTEGER DEFAULT 1,
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Create index on laundry_id for filtering by laundry
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_driver_locations_laundry
            ON routes.driver_locations(laundry_id)
        """)

        # Create composite index on (is_active, updated_at) for active driver queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_driver_locations_active
            ON routes.driver_locations(is_active, updated_at)
        """)

        logger.info("Migration: driver_locations table created successfully.")
