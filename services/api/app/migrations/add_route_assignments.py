"""
Migration: Add route assignments tables for multi-driver route optimization.
Creates routes schema with route_assignments and geocode_cache tables.
Safe to run multiple times (uses IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the route assignments migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Add 'Driver' to the employee role enum if not exists
        try:
            cur.execute("ALTER TYPE orders.employee_role_enum ADD VALUE IF NOT EXISTS 'Driver'")
        except Exception as e:
            # IF NOT EXISTS not supported on all PG versions for enums
            logger.info(f"Driver role enum may already exist: {e}")

        # Normalize legacy role values to standard ones.
        # On a fresh database the enum has no legacy labels ('Delivery Driver',
        # etc.), so these comparisons raise and would poison the whole
        # transaction. Wrap each in a SAVEPOINT so a failure rolls back only
        # that statement, leaving the rest of the migration intact.
        for legacy_sql in (
            "UPDATE shop.employees SET role = 'Driver' WHERE role = 'Delivery Driver'",
            "UPDATE shop.employees SET role = 'Employee' WHERE role IN ('Attendant', 'LaundryCare Specialist')",
        ):
            try:
                cur.execute("SAVEPOINT role_norm")
                cur.execute(legacy_sql)
                cur.execute("RELEASE SAVEPOINT role_norm")
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT role_norm")
                logger.info(f"Role normalization skipped (no legacy values on fresh DB): {e}")

        # Create routes schema
        cur.execute("CREATE SCHEMA IF NOT EXISTS routes")

        # Create route_assignments table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS routes.route_assignments (
                id SERIAL PRIMARY KEY,
                laundry_id VARCHAR(50) NOT NULL,
                route_date DATE NOT NULL,
                driver_id VARCHAR(50) NOT NULL,
                order_id VARCHAR(50) NOT NULL,
                sequence_position INTEGER NOT NULL,
                cluster_index INTEGER,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(laundry_id, route_date, order_id)
            )
        """)

        # Create indexes
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_route_assignments_driver_date
            ON routes.route_assignments(driver_id, route_date)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_route_assignments_laundry_date
            ON routes.route_assignments(laundry_id, route_date)
        """)

        # Create geocode cache table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS routes.geocode_cache (
                address_hash VARCHAR(64) PRIMARY KEY,
                address TEXT NOT NULL,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                cached_at TIMESTAMP DEFAULT NOW()
            )
        """)

        logger.info("Migration: route_assignments and geocode_cache tables created successfully.")
