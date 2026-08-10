"""
Migration: Add shop.notification_queue table for quiet hours message queuing.
Messages attempted during quiet hours (9 PM - 7 AM) are stored here and
delivered at 7 AM the next morning by the scheduler.
Safe to run multiple times (IF NOT EXISTS pattern).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create the notification_queue table."""
    with get_db() as conn:
        cur = get_cursor(conn)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.notification_queue (
                id SERIAL PRIMARY KEY,
                laundry_id TEXT,
                recipient TEXT NOT NULL,
                channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
                subject TEXT,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                scheduled_for TIMESTAMP NOT NULL,
                sent_at TIMESTAMP
            )
        """)

        # Index for efficient queue flushing queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_queue_status_scheduled
            ON shop.notification_queue (status, scheduled_for)
        """)

        logger.info("Migration: shop.notification_queue table created.")
