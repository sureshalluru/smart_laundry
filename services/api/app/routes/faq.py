"""
Public FAQ routes — no auth required.
Serves resolved FAQ content for tenant-specific FAQ pages.
"""
from fastapi import APIRouter, HTTPException
from app.database import get_db, get_cursor
from app.services.faq_token_resolver import resolve_tokens, get_tenant_data
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{laundry_id}")
async def get_faq_index(laundry_id: str):
    """
    Return all enabled FAQs for tenant, grouped by category, sorted by
    display_order within each category, with resolved tokens.
    No authentication required.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Validate laundry_id exists
        cur.execute(
            "SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        shop = cur.fetchone()
        if not shop:
            raise HTTPException(status_code=404, detail="Laundry not found")

        laundry_name = shop["laundry_name"] or ""

        # Get tenant data for token resolution
        tenant_data = get_tenant_data(laundry_id, conn)

        # Fetch all enabled FAQs sorted by category then display_order
        cur.execute(
            """
            SELECT slug, question, answer_template, category
            FROM shop.tenant_faqs
            WHERE laundry_id = %s AND is_enabled = TRUE
            ORDER BY category, display_order ASC
            """,
            (laundry_id,),
        )
        rows = cur.fetchall()

        # Auto-seed if tenant has no FAQs yet (first access triggers seeding)
        if not rows:
            try:
                from app.services.faq_seeder import seed_tenant_faqs
                seed_tenant_faqs(laundry_id, conn)
                # Re-fetch after seeding
                cur.execute(
                    """
                    SELECT slug, question, answer_template, category
                    FROM shop.tenant_faqs
                    WHERE laundry_id = %s AND is_enabled = TRUE
                    ORDER BY category, display_order ASC
                    """,
                    (laundry_id,),
                )
                rows = cur.fetchall()
            except Exception as seed_err:
                logger.warning(f"FAQ auto-seed failed for {laundry_id}: {seed_err}")

    # Group by category preserving order
    categories_map = {}
    categories_order = []
    for row in rows:
        cat = row["category"]
        if cat not in categories_map:
            categories_map[cat] = []
            categories_order.append(cat)
        categories_map[cat].append({
            "slug": row["slug"],
            "question": row["question"],
            "answer": resolve_tokens(row["answer_template"], tenant_data),
        })

    categories = [
        {"name": cat, "faqs": categories_map[cat]}
        for cat in categories_order
    ]

    return {
        "laundryName": laundry_name,
        "categories": categories,
    }


@router.get("/{laundry_id}/{slug}")
async def get_faq_detail(laundry_id: str, slug: str):
    """
    Return a single FAQ with resolved tokens.
    Returns 404 if slug not found or FAQ is disabled.
    No authentication required.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Validate laundry_id exists
        cur.execute(
            "SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        shop = cur.fetchone()
        if not shop:
            raise HTTPException(status_code=404, detail="Laundry not found")

        laundry_name = shop["laundry_name"] or ""

        # Fetch the specific FAQ (must be enabled)
        cur.execute(
            """
            SELECT faq_id, slug, question, answer_template, category, display_order
            FROM shop.tenant_faqs
            WHERE laundry_id = %s AND slug = %s AND is_enabled = TRUE
            """,
            (laundry_id, slug),
        )
        faq = cur.fetchone()
        if not faq:
            raise HTTPException(status_code=404, detail="FAQ not found")

        # Get tenant data for token resolution
        tenant_data = get_tenant_data(laundry_id, conn)

        # Fetch adjacent FAQs in same category for navigation
        cur.execute(
            """
            SELECT slug, question, display_order
            FROM shop.tenant_faqs
            WHERE laundry_id = %s AND category = %s AND is_enabled = TRUE
            ORDER BY display_order ASC
            """,
            (laundry_id, faq["category"]),
        )
        category_faqs = cur.fetchall()

    # Determine prev/next within category
    adjacent = {"prev": None, "next": None}
    for i, item in enumerate(category_faqs):
        if item["slug"] == slug:
            if i > 0:
                adjacent["prev"] = {
                    "slug": category_faqs[i - 1]["slug"],
                    "question": category_faqs[i - 1]["question"],
                }
            if i < len(category_faqs) - 1:
                adjacent["next"] = {
                    "slug": category_faqs[i + 1]["slug"],
                    "question": category_faqs[i + 1]["question"],
                }
            break

    return {
        "question": faq["question"],
        "answer": resolve_tokens(faq["answer_template"], tenant_data),
        "slug": faq["slug"],
        "category": faq["category"],
        "laundryName": laundry_name,
        "adjacentFaqs": adjacent,
    }
