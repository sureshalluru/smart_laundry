"""SMS Marketing — send targeted text message blasts to customer segments."""
from fastapi import APIRouter, Depends, Body, Query
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.notification_service import send_sms_for_tenant
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/blast")
async def send_sms_blast(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Send an SMS blast to a customer segment.

    Body:
        laundryId: str (required)
        message: str (required) — the message to send (max 160 chars recommended)
        segment: str — 'all' | 'inactive_30' | 'inactive_60' | 'high_value' | 'new' | 'commercial'
        promoCode: str (optional) — appended to message if provided
    """
    laundry_id = body.get("laundryId")
    message = body.get("message", "").strip()
    segment = body.get("segment", "all")
    promo_code = body.get("promoCode", "").strip()

    if not laundry_id or not message:
        return {"status": "error", "message": "Missing laundryId or message"}

    if len(message) > 300:
        return {"status": "error", "message": "Message too long (max 300 characters)"}

    # Append promo code if provided
    full_message = message
    if promo_code:
        full_message += f" Use code: {promo_code}"

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check SMS is enabled for this laundry
        cur.execute(
            "SELECT sms_enabled, laundry_name FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        shop = cur.fetchone()
        if not shop or not shop.get("sms_enabled"):
            return {"status": "error", "message": "SMS is not enabled for this location"}

        # Build segment query
        base_query = """
            SELECT DISTINCT c.customer_id, c.first_name, c.phone_number
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.phone_number IS NOT NULL AND c.phone_number != ''
              AND c.notif_sms = TRUE
        """
        params = [laundry_id]

        if segment == "inactive_30":
            base_query += " AND (cls.last_completed_at IS NULL OR cls.last_completed_at < NOW() - INTERVAL '30 days')"
        elif segment == "inactive_60":
            base_query += " AND (cls.last_completed_at IS NULL OR cls.last_completed_at < NOW() - INTERVAL '60 days')"
        elif segment == "high_value":
            base_query += " AND cls.total_order_value >= 100"
        elif segment == "new":
            base_query += " AND c.created_at > NOW() - INTERVAL '30 days'"
        elif segment == "commercial":
            base_query += " AND c.is_commercial = TRUE"
        # 'all' = no additional filter

        base_query += " LIMIT 500"  # Safety cap

        cur.execute(base_query, params)
        customers = cur.fetchall()

        sent = 0
        failed = 0
        for cust in customers:
            try:
                # Personalize with first name
                personalized = full_message.replace("{name}", cust["first_name"] or "there")
                send_sms_for_tenant(cust["phone_number"], personalized, laundry_id)
                sent += 1
            except Exception as e:
                logger.warning(f"Blast SMS failed for {cust['customer_id']}: {e}")
                failed += 1

    logger.info(f"SMS blast for laundry {laundry_id}: segment={segment}, sent={sent}, failed={failed}")
    return {"status": "success", "sent": sent, "failed": failed, "total": len(customers)}


@router.get("/segments")
async def get_segment_counts(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get customer counts per segment for preview before sending."""
    with get_db() as conn:
        cur = get_cursor(conn)

        base = """
            SELECT COUNT(DISTINCT c.customer_id) AS cnt
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.phone_number IS NOT NULL AND c.phone_number != ''
              AND c.notif_sms = TRUE
        """

        segments = {}
        for seg, extra in [
            ("all", ""),
            ("inactive_30", " AND (cls.last_completed_at IS NULL OR cls.last_completed_at < NOW() - INTERVAL '30 days')"),
            ("inactive_60", " AND (cls.last_completed_at IS NULL OR cls.last_completed_at < NOW() - INTERVAL '60 days')"),
            ("high_value", " AND cls.total_order_value >= 100"),
            ("new", " AND c.created_at > NOW() - INTERVAL '30 days'"),
            ("commercial", " AND c.is_commercial = TRUE"),
        ]:
            cur.execute(base + extra, (laundryId,))
            segments[seg] = cur.fetchone()["cnt"]

    return {"status": "success", "segments": segments}
