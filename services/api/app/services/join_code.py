"""
Join code generation and retry utilities for company onboarding.

Join code format: {PREFIX}-{RANDOM}
- PREFIX: First 4 alphanumeric characters of company name (uppercased), padded with 'X' if < 4
- RANDOM: 4 random characters from [A-Z0-9]
"""
import logging
import random
import string

import psycopg

from app.database import get_cursor

logger = logging.getLogger(__name__)

# Character set for the random suffix
JOIN_CODE_CHARS = string.ascii_uppercase + string.digits

# Max retries when a uniqueness constraint violation occurs
MAX_RETRY_ATTEMPTS = 10


def generate_join_code(company_name: str) -> str:
    """Generate a join code from company name prefix + 4 random chars.

    Format: {PREFIX}-{RANDOM}
    - PREFIX: first 4 alphanumeric chars of company name (uppercased), padded with 'X' if < 4
    - RANDOM: 4 random chars from [A-Z0-9]

    Examples:
        "Acme Laundry Co" -> "ACME-7X4K"
        "Hi"             -> "HIXX-9R2T"
        "A!@#"           -> "AXXX-3M7P"
    """
    alpha = ''.join(c for c in company_name.upper() if c.isascii() and c.isalnum())
    prefix = (alpha + 'XXXX')[:4]
    suffix = ''.join(random.choices(JOIN_CODE_CHARS, k=4))
    return f"{prefix}-{suffix}"


def generate_join_code_with_retry(company_name: str, conn, company_id: str) -> str:
    """Generate a join code and update the company record, retrying on uniqueness violations.

    Args:
        company_name: The company name used to derive the code prefix.
        conn: An active database connection (within a transaction).
        company_id: The company_id to update.

    Returns:
        The successfully stored join code.

    Raises:
        RuntimeError: If all retry attempts fail due to uniqueness collisions.
    """
    for attempt in range(MAX_RETRY_ATTEMPTS):
        code = generate_join_code(company_name)
        try:
            cur = get_cursor(conn)
            cur.execute(
                "UPDATE shop.companies SET join_code = %s WHERE company_id = %s",
                (code, company_id),
            )
            return code
        except psycopg.errors.UniqueViolation:
            conn.rollback()
            if attempt == MAX_RETRY_ATTEMPTS - 1:
                logger.error(
                    f"Failed to generate unique join code for company {company_id} "
                    f"after {MAX_RETRY_ATTEMPTS} attempts"
                )
                raise RuntimeError(
                    f"Could not generate a unique join code after {MAX_RETRY_ATTEMPTS} attempts"
                )
            logger.warning(
                f"Join code collision for company {company_id}, attempt {attempt + 1}"
            )
            continue

    # Should not reach here, but just in case
    raise RuntimeError("Unexpected exit from retry loop")
