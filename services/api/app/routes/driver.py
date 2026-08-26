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

        # Get the authenticated driver's emp_id from JWT
        driver_id = current_user.get("sub", "") or current_user.get("empId", "")
        logger.info(f"Driver orders request: driver_id={driver_id}, laundryId={laundryId}, dates={start} to {end}")

        # Check if this driver has route assignments for any of these dates
        cur.execute("""
            SELECT order_id FROM routes.route_assignments
            WHERE laundry_id = %s AND UPPER(driver_id) = UPPER(%s)
              AND route_date BETWEEN %s AND %s AND status != 'completed'
        """, (laundryId, driver_id, start, end))
        assigned_order_ids = {row["order_id"] for row in cur.fetchall()}
        logger.info(f"Driver {driver_id} has {len(assigned_order_ids)} assigned orders: {assigned_order_ids}")

        # Check if ANY route assignments exist for this laundry/date range
        # (to distinguish "route planner not used" from "used but not assigned to this driver")
        # We no longer return empty — always return orders so the frontend can handle display.
        # The Available/Unassigned section handles claimable orders separately.

        # Fetch orders based on assignment state
        if assigned_order_ids:
            # Driver has assignments — fetch those specific orders
            placeholders = ",".join(["%s"] * len(assigned_order_ids))
            cur.execute(f"""
                SELECT o.order_id, o.customer_id, o.address_id, o.order_type, o.order_status,
                       o.payment_status, o.pickup_date, o.pickup_time_interval,
                       o.dropoff_date, o.dropoff_time_interval,
                       o.laundry_bags, o.special_instructions, o.total_cost, o.grand_total,
                       o.created_at, o.updated_at,
                       o.pickup_service, o.dropoff_service, o.image_url,
                       c.first_name, c.last_name, c.phone_number,
                       ca.address AS customer_address,
                       ca.address_instructions AS delivery_instructions,
                       ca.door_number
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
                WHERE o.order_id IN ({placeholders})
                ORDER BY COALESCE(o.pickup_date, o.dropoff_date) ASC
            """, list(assigned_order_ids))
        else:
            # No assignments for this driver — show all orders for the date range
            cur.execute("""
                SELECT o.order_id, o.customer_id, o.address_id, o.order_type, o.order_status,
                       o.payment_status, o.pickup_date, o.pickup_time_interval,
                       o.dropoff_date, o.dropoff_time_interval,
                       o.laundry_bags, o.special_instructions, o.total_cost, o.grand_total,
                       o.created_at, o.updated_at,
                       o.pickup_service, o.dropoff_service, o.image_url,
                       c.first_name, c.last_name, c.phone_number,
                       ca.address AS customer_address,
                       ca.address_instructions AS delivery_instructions,
                       ca.door_number
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
                WHERE o.laundry_id = %s
                  AND (
                    (o.order_type IN ('Online', 'Commercial') AND o.order_status IN ('OrderSubmitted','ReadyForIntake') AND o.pickup_date BETWEEN %s AND %s)
                    OR
                    (o.order_status IN ('EnRouteToDelivery', 'ProcessingCompleted', 'ReadyForDelivery')
                     AND o.dropoff_date BETWEEN %s AND %s
                     AND LOWER(REPLACE(o.dropoff_service, ' ', '')) = 'laundrydriver'
                     AND o.address_id IS NOT NULL)
                  )
                ORDER BY COALESCE(o.pickup_date, o.dropoff_date) ASC
            """, (laundryId, start, end, start, end))

        rows = cur.fetchall()
        logger.info(f"Driver {driver_id}: fetched {len(rows)} order rows from DB")
        orders = []
        for r in rows:
            d = serialize_row(r)
            d['customerName'] = f"{d.pop('firstName', '')} {d.pop('lastName', '')}".strip()
            d['customerPhone'] = d.pop('phoneNumber', '')
            d.setdefault('pickupService', d.pop('pickup_service', None) or 'LaundryDriver')
            d.setdefault('dropoffService', d.pop('dropoff_service', None) or 'LaundryDriver')
            d['isAssigned'] = d.get('orderId') in assigned_order_ids
            orders.append(d)

        logger.info(f"Driver {driver_id}: returning {len(orders)} orders")

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
    """Upload delivery/pickup/scale image to S3 and store URL in DB."""
    image_base64 = body.get("imageBase64", "")
    order_id = orderId or body.get("orderId")
    laundry_id = laundryId or body.get("laundryId", "1")
    img_type = imageType or body.get("imageType", "pickup")  # "pickup" or "weight"
    
    if not order_id or not image_base64:
        return {"statusCode": 400, "body": {"message": "Missing orderId or image data"}}

    # Upload to S3
    from app.services.s3_service import upload_order_image
    result = upload_order_image(laundry_id, order_id, image_base64, img_type)

    if result["status"] != "success":
        # Fallback: store base64 directly in DB if S3 fails (ensure data isn't lost)
        logger.warning(f"S3 upload failed for {order_id}, falling back to DB storage: {result.get('message')}")
        # Store with data: prefix so display works
        if not image_base64.startswith("data:"):
            image_base64 = f"data:image/jpeg;base64,{image_base64}"
        with get_db() as conn:
            cur = get_cursor(conn)
            if img_type == "weight":
                cur.execute("UPDATE orders.orders SET weight_image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_base64, order_id))
            else:
                cur.execute("UPDATE orders.orders SET image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_base64, order_id))
        return {"statusCode": 200, "body": {"message": f"{img_type.capitalize()} image saved (local fallback)"}}

    # Store S3 URL in DB
    image_url = result["url"]
    with get_db() as conn:
        cur = get_cursor(conn)
        if img_type == "weight":
            cur.execute("UPDATE orders.orders SET weight_image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_url, order_id))
        else:
            cur.execute("UPDATE orders.orders SET image_url = %s, updated_at = NOW() WHERE order_id = %s", (image_url, order_id))

    return {"statusCode": 200, "body": {"message": f"{img_type.capitalize()} image uploaded successfully", "url": image_url}}
