"""
Migration: Add vision_tasks table for async Vision AI processing.
Creates tracking.vision_tasks table to track background AI processing jobs
for item counting in intake/fold flows.
Safe to run multiple times (uses IF NOT EXISTS checks).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the vision_tasks migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Ensure tracking schema exists
        cur.execute("CREATE SCHEMA IF NOT EXISTS tracking")

        # Create vision_tasks table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tracking.vision_tasks (
                task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                vision_status TEXT NOT NULL DEFAULT 'pending',
                photo_urls JSONB NOT NULL,
                items JSONB,
                token_hash TEXT NOT NULL,
                error_message TEXT,
                processing_time_ms INT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (order_id, laundry_id, phase)
            )
        """)

        # Create indexes for performance
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_vision_tasks_order_id
            ON tracking.vision_tasks (order_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_vision_tasks_status
            ON tracking.vision_tasks (vision_status)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_vision_tasks_laundry_status
            ON tracking.vision_tasks (laundry_id, vision_status)
        """)

        logger.info("Migration: vision_tasks table created successfully.")
