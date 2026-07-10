"""
FAQ seeder service.
Copies active FAQ templates into tenant_faqs for a new tenant during onboarding.
Idempotent — skips seeding if tenant already has FAQ records.
"""
import logging
from app.database import get_cursor

logger = logging.getLogger(__name__)


def seed_tenant_faqs(laundry_id, conn):
    """
    Copy all active templates from shop.faq_templates into shop.tenant_faqs
    for the given tenant. Called during onboarding to pre-populate FAQ content.

    Idempotent: if the tenant already has any FAQ records, this is a no-op.

    Args:
        laundry_id: The tenant's laundry_id
        conn: A database connection (from get_db context manager)

    Returns:
        Number of FAQs seeded (0 if skipped).
    """
    cur = get_cursor(conn)

    # Check if tenant already has FAQ records — skip if yes
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM shop.tenant_faqs WHERE laundry_id = %s",
        (laundry_id,)
    )
    row = cur.fetchone()
    if row and row["cnt"] > 0:
        logger.info(f"FAQ seeding skipped for laundry_id={laundry_id}: already has {row['cnt']} FAQ(s).")
        return 0

    # Query all active templates
    cur.execute("""
        SELECT question, answer_template, slug, category, display_order
        FROM shop.faq_templates
        WHERE is_active = TRUE
        ORDER BY category, display_order
    """)
    templates = cur.fetchall()

    if not templates:
        logger.warning(f"FAQ seeding: no active templates found for laundry_id={laundry_id}.")
        return 0

    # Insert each template into tenant_faqs
    for tpl in templates:
        cur.execute("""
            INSERT INTO shop.tenant_faqs
                (laundry_id, question, answer_template, slug, category, display_order, is_enabled)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
        """, (
            laundry_id,
            tpl["question"],
            tpl["answer_template"],
            tpl["slug"],
            tpl["category"],
            tpl["display_order"],
        ))

    count = len(templates)
    logger.info(f"FAQ seeding complete for laundry_id={laundry_id}: {count} FAQ(s) seeded.")
    return count
