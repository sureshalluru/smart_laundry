"""
Admin FAQ API endpoints — authenticated CRUD for tenant FAQ management.
"""
import re
import logging
from fastapi import APIRouter, Depends, Query, Body, HTTPException
from fastapi.responses import JSONResponse
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.faq_token_resolver import (
    validate_tokens,
    SUPPORTED_TOKENS,
    get_tenant_data,
    resolve_tokens,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _generate_slug(question: str) -> str:
    """
    Generate a URL-safe slug from a question string.
    - Lowercase
    - Replace non-alphanumeric chars with hyphens
    - Collapse consecutive hyphens
    - Trim leading/trailing hyphens
    """
    slug = question.lower()
    slug = re.sub(r"[^a-z0-9]", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")
    return slug


@router.get("/list")
async def list_faqs(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all FAQs (enabled + disabled) for admin management."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT faq_id, question, answer_template, slug, category,
                   display_order, is_enabled, created_at, updated_at
            FROM shop.tenant_faqs
            WHERE laundry_id = %s
            ORDER BY category, display_order ASC
            """,
            (laundryId,),
        )
        rows = cur.fetchall()

    faqs = [
        {
            "faqId": row["faq_id"],
            "question": row["question"],
            "answerTemplate": row["answer_template"],
            "slug": row["slug"],
            "category": row["category"],
            "displayOrder": row["display_order"],
            "isEnabled": row["is_enabled"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]
    return {"faqs": faqs}


@router.post("/create")
async def create_faq(
    laundryId: str = Query(...),
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create a new FAQ. Auto-generates slug from question text."""
    question = body.get("question", "").strip()
    answer_template = body.get("answerTemplate", "").strip()
    category = body.get("category", "").strip()
    display_order = body.get("displayOrder", 0)

    if not question:
        raise HTTPException(status_code=422, detail="Question is required")
    if not answer_template:
        raise HTTPException(status_code=422, detail="Answer template is required")
    if not category:
        raise HTTPException(status_code=422, detail="Category is required")

    # Validate tokens in answer template
    invalid = validate_tokens(answer_template)
    if invalid:
        invalid_list = sorted(invalid)
        detail_tokens = ", ".join(f"{{{{{t}}}}}" for t in invalid_list)
        return JSONResponse(
            status_code=422,
            content={
                "detail": f"Invalid tokens: {detail_tokens}",
                "invalidTokens": invalid_list,
            },
        )

    # Auto-generate slug from question
    slug = _generate_slug(question)
    if not slug:
        raise HTTPException(status_code=422, detail="Cannot generate a valid slug from the question")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check for duplicate slug within same tenant
        cur.execute(
            "SELECT faq_id FROM shop.tenant_faqs WHERE laundry_id = %s AND slug = %s",
            (laundryId, slug),
        )
        if cur.fetchone():
            raise HTTPException(
                status_code=409,
                detail="A FAQ with this URL already exists",
            )

        cur.execute(
            """
            INSERT INTO shop.tenant_faqs
                (laundry_id, question, answer_template, slug, category, display_order, is_enabled, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW(), NOW())
            RETURNING faq_id, created_at
            """,
            (laundryId, question, answer_template, slug, category, display_order),
        )
        result = cur.fetchone()

    return {
        "faqId": result["faq_id"],
        "slug": slug,
        "createdAt": result["created_at"].isoformat() if result["created_at"] else None,
    }


@router.put("/update")
async def update_faq(
    laundryId: str = Query(...),
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Update FAQ question, answer, category, display_order, or is_enabled."""
    faq_id = body.get("faqId")
    if not faq_id:
        raise HTTPException(status_code=422, detail="faqId is required")

    # Build dynamic update fields
    updates = []
    params = []

    if "question" in body:
        updates.append("question = %s")
        params.append(body["question"].strip())

    if "answerTemplate" in body:
        answer_template = body["answerTemplate"].strip()
        # Validate tokens
        invalid = validate_tokens(answer_template)
        if invalid:
            invalid_list = sorted(invalid)
            detail_tokens = ", ".join(f"{{{{{t}}}}}" for t in invalid_list)
            return JSONResponse(
                status_code=422,
                content={
                    "detail": f"Invalid tokens: {detail_tokens}",
                    "invalidTokens": invalid_list,
                },
            )
        updates.append("answer_template = %s")
        params.append(answer_template)

    if "category" in body:
        updates.append("category = %s")
        params.append(body["category"].strip())

    if "displayOrder" in body:
        updates.append("display_order = %s")
        params.append(body["displayOrder"])

    if "isEnabled" in body:
        updates.append("is_enabled = %s")
        params.append(body["isEnabled"])

    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    updates.append("updated_at = NOW()")
    params.extend([faq_id, laundryId])

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            f"""
            UPDATE shop.tenant_faqs
            SET {', '.join(updates)}
            WHERE faq_id = %s AND laundry_id = %s
            """,
            params,
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="FAQ not found")

    return {"status": "success", "message": "FAQ updated"}


@router.put("/reorder")
async def reorder_faqs(
    laundryId: str = Query(...),
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Batch update display_order for a list of faq_ids."""
    items = body.get("items", [])
    if not items:
        raise HTTPException(status_code=422, detail="items list is required")

    with get_db() as conn:
        cur = get_cursor(conn)
        for item in items:
            faq_id = item.get("faqId")
            display_order = item.get("displayOrder")
            if faq_id is None or display_order is None:
                continue
            cur.execute(
                """
                UPDATE shop.tenant_faqs
                SET display_order = %s, updated_at = NOW()
                WHERE faq_id = %s AND laundry_id = %s
                """,
                (display_order, faq_id, laundryId),
            )

    return {"status": "success", "message": "FAQs reordered"}


@router.get("/available-tokens")
async def get_available_tokens(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Return list of supported template tokens with current resolved values for the tenant."""
    with get_db() as conn:
        tenant_data = get_tenant_data(laundryId, conn)

    tokens = []
    for token_name, description in SUPPORTED_TOKENS.items():
        tokens.append({
            "token": token_name,
            "description": description,
            "placeholder": f"{{{{{token_name}}}}}",
            "currentValue": tenant_data.get(token_name),
        })

    return {"tokens": tokens}


@router.post("/seed")
async def seed_faqs(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Seed FAQ templates for a tenant.
    Copies all active templates from shop.faq_templates into shop.tenant_faqs.
    Idempotent — skips if tenant already has FAQs.
    """
    from app.services.faq_seeder import seed_tenant_faqs

    with get_db() as conn:
        count = seed_tenant_faqs(laundryId, conn)

    if count == 0:
        return {"status": "success", "message": "FAQs already exist for this tenant. No changes made.", "seeded": 0}

    return {"status": "success", "message": f"{count} FAQs seeded successfully.", "seeded": count}
