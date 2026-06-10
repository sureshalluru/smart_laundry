"""
Driver routes — ported from LaundryShopService get_driver_orders_by_date_range.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from datetime import datetime
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize_row
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/laundry-orders-info")
@router.post("/laundry-orders-info")
async def driver_orders(
    operation: str = Query(...),
    laundryId: str = Query(...),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    body: dict = Body(None),
    current_user: dict = Depends(get_current_user),
):
    """Get orders for driver view — ported from Lambda."""
    # Get dates from body if not in query params
    if body:
        startDate = startDate or body.get("startDate")
        endDate = endDate or body.get("endDate")

    if not startDate or not endDate:
        return {"statusCode": 200, "body": {"orders": []}}

    try:
        start = datetime.strptime(startDate, "%Y-%m-%d").date()
        end = datetime.strptime(endDate, "%Y-%m-%d").date()
    except ValueError:
        return {"statusCode": 400, "body": {"error": "Invalid date format"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT o.order_id, o.customer_id, o.address_id, o.order_type, o.order_status,
                   o.payment_status, o.pickup_date, o.pickup_time_interval,
                   o.dropoff_date, o.dropoff_time_interval,
                   o.laundry_bags, o.special_instructions, o.total_cost, o.grand_total,
                   o.created_at, o.updated_at,
                   c.first_name, c.last_name, c.phone_number,
                   ca.address AS customer_address,
                   ca.address_instructions AS delivery_instructions,
                   ca.door_number
            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
            WHERE o.laundry_id = %s
              AND o.order_type = 'Online'
              AND (
                (o.order_status IN ('OrderSubmitted','ReadyForIntake') AND o.pickup_date BETWEEN %s AND %s)
                OR
                (o.order_status IN ('EnRouteToDelivery') AND o.dropoff_date BETWEEN %s AND %s)
              )
            ORDER BY COALESCE(o.pickup_date, o.dropoff_date) ASC
        """, (laundryId, start, end, start, end))

        rows = cur.fetchall()
        orders = []
        for r in rows:
            d = serialize_row(r)
            d['customerName'] = f"{d.pop('firstName', '')} {d.pop('lastName', '')}".strip()
            d['customerPhone'] = d.pop('phoneNumber', '')
            d.setdefault('pickupService', 'LaundryDriver')
            d.setdefault('dropoffService', 'LaundryDriver')
            orders.append(d)

    return {"statusCode": 200, "body": {"orders": orders}}


@router.post("/upload-image")
async def upload_image(
    operation: Optional[str] = Query(None),
    laundryId: Optional[str] = Query(None),
    orderId: Optional[str] = Query(None),
    imageType: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Upload delivery/pickup/scale image — stores as base64 in DB."""
    image_base64 = body.get("imageBase64", "")
    order_id = orderId or body.get("orderId")
    img_type = imageType or body.get("imageType", "pickup")  # "pickup" or "weight"
    
    if not order_id or not image_base64:
        return {"statusCode": 400, "body": {"message": "Missing orderId or image data"}}

    if len(image_base64) > 700000:
        return {"statusCode": 400, "body": {"message": "Image too large. Please use a smaller photo."}}

    with get_db() as conn:
        cur = get_cursor(conn)
        if img_type == "weight":
            cur.execute("UPDATE orders.orders SET weight_image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_base64, order_id))
        else:
            cur.execute("UPDATE orders.orders SET image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_base64, order_id))

    return {"statusCode": 200, "body": {"message": f"{img_type.capitalize()} image uploaded successfully"}}
