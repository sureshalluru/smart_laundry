"""
Migration: back-fill new FAQ templates into existing tenants.

CONTEXT
-------
FAQ content flows in two stages:
  1. shop.faq_templates — the global template library (edited in
     seed_faq_templates.py).
  2. shop.tenant_faqs   — a per-tenant COPY made ONCE at onboarding by
     app.services.faq_seeder.seed_tenant_faqs.

The per-tenant seeder is guarded to skip any tenant that already has FAQ rows,
so when we ADD new templates (e.g. delivery-fee / add-ons / tipping FAQs) they
only reach BRAND-NEW tenants. Tenants onboarded earlier never see them.

WHAT THIS DOES
--------------
For every existing tenant, insert any active template whose slug the tenant
does NOT already have. It is:
  - insert-only per (laundry_id, slug), relying on the existing UNIQUE
    constraint uq_tenant_faqs_laundry_slug + ON CONFLICT DO NOTHING, so it
    NEVER updates, re-enables, reorders, or overwrites a FAQ the tenant has
    already customized or disabled;
  - idempotent — re-running inserts nothing once every tenant has every slug;
  - self-healing for future template additions — any new template slug is
    picked up on the next deploy without editing this file again.

It intentionally does NOT modify existing rows. Rewording an existing template
is a separate concern (a tenant may have edited their copy); this only ADDS
missing FAQs so a content refresh actually reaches live tenants.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Insert, for every tenant, each active template slug they are
            # missing. The LEFT JOIN ... WHERE tf.faq_id IS NULL selects only
            # (tenant, template) pairs that don't yet exist; ON CONFLICT is a
            # belt-and-suspenders guard against the unique constraint.
            cur.execute(
                """
                INSERT INTO shop.tenant_faqs
                    (laundry_id, question, answer_template, slug, category, display_order, is_enabled)
                SELECT s.laundry_id, t.question, t.answer_template, t.slug,
                       t.category, t.display_order, TRUE
                FROM shop.laundry_shops s
                CROSS JOIN shop.faq_templates t
                LEFT JOIN shop.tenant_faqs tf
                       ON tf.laundry_id = s.laundry_id AND tf.slug = t.slug
                WHERE t.is_active = TRUE
                  AND tf.faq_id IS NULL
                ON CONFLICT (laundry_id, slug) DO NOTHING
                """
            )
            inserted = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
            logger.info(
                f"Migration backfill_tenant_faqs: inserted {inserted} missing "
                f"tenant FAQ row(s) from active templates (existing FAQs untouched)."
            )
    except Exception as e:
        logger.error(f"Migration backfill_tenant_faqs failed: {e}")
