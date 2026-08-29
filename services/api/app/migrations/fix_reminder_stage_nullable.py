"""
Migration: make shop.customer_reminders.reminder_stage nullable.

The table was created with reminder_stage VARCHAR(50) NOT NULL, but several
event-marker inserts legitimately have no "stage":
  - /cart-started (customer_public.py)
  - abandoned_cart / missed_pickup / abandoned_cart_realtime (abandoned_cart_service.py)

These insert only (customer_id, laundry_id, reminder_type), so the NOT NULL
constraint makes them fail with:
  null value in column "reminder_stage" ... violates not-null constraint

Only engagement.py::_send_reminder supplies a real stage. Dropping NOT NULL is
the correct model — these rows are event markers, not staged reminders — and
fixes all four insert paths at once without inventing placeholder stage values.

Safe to run multiple times (guarded by information_schema check).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Drop the NOT NULL constraint on shop.customer_reminders.reminder_stage (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'shop'
                          AND table_name = 'customer_reminders'
                          AND column_name = 'reminder_stage'
                          AND is_nullable = 'NO'
                    ) THEN
                        ALTER TABLE shop.customer_reminders
                        ALTER COLUMN reminder_stage DROP NOT NULL;
                    END IF;
                END $$
            """)
            logger.info("Migration: shop.customer_reminders.reminder_stage is now nullable.")
    except Exception as e:
        logger.error(f"Migration fix_reminder_stage_nullable failed: {e}")
