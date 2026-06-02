"""
Promotions routes — replaces LaundryPromotionsService Lambda.
Handles: CRUD for promotions, promo validation, usage tracking.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize_row
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/list")
async def list_promotions(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all promotions for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT * FROM shop.promotions
            WHERE laundry_id = %s ORDER BY created_at DESC
        """, (laundryId,))
        promos = [serialize_row(r) for r in cur.fetchall()]
    return {"body": {"status": "success", "data": promos}}


@router.post("/update")
async def update_promotions(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Add, edit, or delete promotions."""
    # TODO: Port from LaundryPromotionsService updatePromotions
    return {"body": {"message": "TODO: implement updatePromotions"}}


@router.get("/validate")
async def validate_promo(
    promoCode: str = Query(...),
    laundryId: str = Query(...),
    customerId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Validate a promo code."""
    # TODO: Port from LaundryPromotionsService validatePromo
    return {"body": {"valid": False, "message": "TODO: implement validatePromo"}}
