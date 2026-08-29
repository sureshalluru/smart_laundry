"""
Migration: backfill null shop.employees.joining_date and set a sensible default.

shop.employees.joining_date is nullable with no default. Employees created
without a joining date show as NULL, which the Manager screen rendered as
1969-12-31 (new Date(null) → Unix epoch). This backfills existing NULL rows
from created_at (a real onboarding date) and sets the column default to
CURRENT_DATE so future inserts never go NULL.

joining_date is display-only — it is not read by billing, reporting, referral,
or account-history calculations — so this is safe.

Safe to run multiple times (WHERE joining_date IS NULL makes the backfill a
no-op on re-run; SET DEFAULT is idempotent).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Backfill null joining_date from created_at and default future rows to today."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                UPDATE shop.employees
                SET joining_date = created_at::date
                WHERE joining_date IS NULL
            """)
            cur.execute("""
                ALTER TABLE shop.employees
                ALTER COLUMN joining_date SET DEFAULT CURRENT_DATE
            """)
            logger.info("Migration: employee joining_date backfilled and defaulted to CURRENT_DATE.")
    except Exception as e:
        logger.error(f"Migration backfill_employee_joining_date failed: {e}")
