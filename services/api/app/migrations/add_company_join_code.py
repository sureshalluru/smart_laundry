"""
Migration: Add join_code column to shop.companies and backfill existing rows.

Adds a unique VARCHAR(20) column for company join codes.
Generates join codes for any existing companies that don't have one.
"""
import logging
import random
import string

from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def generate_join_code(company_name: str) -> str:
    """Generate a join code from company name prefix + 4 random chars.

    Format: {PREFIX}-{RANDOM}
    - PREFIX: first 4 alphanumeric chars of company name (uppercased), padded with 'X' if < 4
    - RANDOM: 4 random chars from [A-Z0-9]
    """
    alpha = ''.join(c for c in company_name.upper() if c.isalnum())
    prefix = (alpha + 'XXXX')[:4]
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=4))
    return f"{prefix}-{suffix}"


def run():
    """Add join_code column and backfill existing companies (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Add the column if it doesn't exist
            cur.execute("""
                ALTER TABLE shop.companies
                ADD COLUMN IF NOT EXISTS join_code VARCHAR(20) UNIQUE
            """)

            # Backfill: generate join codes for companies that don't have one
            cur.execute("""
                SELECT company_id, company_name
                FROM shop.companies
                WHERE join_code IS NULL
            """)
            rows = cur.fetchall()

            for row in rows:
                company_id = row[0]
                company_name = row[1]

                # Retry loop in case of uniqueness collision
                max_attempts = 10
                for attempt in range(max_attempts):
                    code = generate_join_code(company_name)
                    try:
                        cur.execute(
                            "UPDATE shop.companies SET join_code = %s WHERE company_id = %s",
                            (code, company_id),
                        )
                        break
                    except Exception:
                        if attempt == max_attempts - 1:
                            raise
                        # Rollback to savepoint on collision and retry
                        conn.rollback()
                        cur = get_cursor(conn)
                        continue

            logger.info(
                f"Migration add_company_join_code complete — "
                f"column added, {len(rows)} existing companies backfilled."
            )

    except Exception as e:
        logger.error(f"Migration add_company_join_code failed: {e}")
