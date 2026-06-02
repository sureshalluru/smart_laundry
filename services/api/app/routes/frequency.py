"""
Order Frequency routes — replaces OrderFrequencyService Lambda.
This was a scheduled Lambda (CloudWatch Events) that auto-generates recurring orders.
In FastAPI, this runs as a background task or cron job.
"""
from fastapi import APIRouter, Depends
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/process")
async def process_frequencies(
    current_user: dict = Depends(get_current_user),
):
    """
    Manually trigger frequency processing.
    In production, this should be called by a cron job (Render Cron Jobs).
    
    TODO: Port from OrderFrequencyService lambda_handler
    - Scan laundry_frequency for active records
    - Check if pickup/dropoff date matches today
    - Auto-create orders
    - Create payment holds
    - Schedule Uber pickups
    - Send notifications
    """
    return {"status": "success", "message": "TODO: implement frequency processing"}


@router.get("/active")
async def get_active_frequencies(
    laundryId: str,
    current_user: dict = Depends(get_current_user),
):
    """List active frequency subscriptions for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT lf.*, c.first_name, c.last_name, c.phone_number
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            WHERE lf.laundry_id = %s AND lf.is_active = TRUE
        """, (laundryId,))
        frequencies = [dict(r) for r in cur.fetchall()]
    return {"body": {"status": "success", "data": frequencies}}
