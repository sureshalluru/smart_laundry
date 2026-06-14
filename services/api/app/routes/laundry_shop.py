"""
Laundry Shop routes — replaces LaundryShopService Lambda.
Handles: services, products, shop info, reports.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize_row
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/shop-info")
async def get_shop_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get laundry shop information."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'viewServices':
            cur.execute("""
                SELECT * FROM shop.laundry_services
                WHERE laundry_id = %s AND is_active = TRUE
            """, (laundryId,))
            return {"body": {"data": [serialize_row(r) for r in cur.fetchall()]}}

        elif operation == 'viewAllProducts':
            cur.execute("""
                SELECT * FROM shop.laundry_products
                WHERE laundry_id = %s AND is_active = TRUE
            """, (laundryId,))
            return {"body": {"data": [serialize_row(r) for r in cur.fetchall()]}}

        elif operation in ('viewShopInfo', 'fetchShopDetails'):
            cur.execute("SELECT * FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
            shop = cur.fetchone()
            if not shop:
                return {"body": {"status": "error", "message": "Laundry not found"}}
            return {"body": {"status": "success", "data": serialize_row(shop)}}

        elif operation == 'viewLaundryInfoById':
            return _get_full_laundry_info(cur, laundryId)

    return {"body": "Operation not found"}


@router.post("/shop-info")
async def update_shop_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update laundry shop settings."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'updateServices':
            # TODO: Port from LaundryShopService
            return {"body": {"message": "TODO: implement updateServices"}}

        elif operation == 'updateProducts':
            # TODO: Port from LaundryShopService
            return {"body": {"message": "TODO: implement updateProducts"}}

        elif operation == 'modifyServiceableZipCodes':
            # TODO: Port from LaundryShopService
            return {"body": {"message": "TODO: implement modifyServiceableZipCodes"}}

        elif operation == 'updateLaundryInfo':
            # TODO: Port from LaundryShopService (logo/domain update)
            return {"body": {"message": "TODO: implement updateLaundryInfo"}}

    return {"body": "Operation not found"}


@router.get("/reports")
async def get_reports(
    operation: str = Query(...),
    laundryId: str = Query(...),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate reports — monthly summary, order reports, tip analytics."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'monthlySummary':
            # TODO: Port from LaundryShopService
            return {"body": {"message": "TODO: implement monthlySummary"}}

        elif operation == 'generateReports':
            # TODO: Port from generate_reports.py
            return {"body": {"message": "TODO: implement generateReports"}}

        elif operation == 'viewTipsByLaundryId':
            # TODO: Port from LaundryShopService
            return {"body": {"message": "TODO: implement viewTipsByLaundryId"}}

    return {"body": "Operation not found"}


def _get_full_laundry_info(cur, laundry_id):
    """Full laundry info with services, time slots, promotions."""
    cur.execute("SELECT * FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    shop = cur.fetchone()
    if not shop:
        return {"body": {"status": "error", "message": "Laundry not found"}}

    cur.execute("""
        SELECT * FROM shop.laundry_services
        WHERE laundry_id = %s AND is_active = TRUE
    """, (laundry_id,))
    services = [serialize_row(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM shop.delivery_time_slots WHERE laundry_id = %s", (laundry_id,))
    delivery_slots = [serialize_row(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM shop.instore_pickup_time_slots WHERE laundry_id = %s", (laundry_id,))
    instore_slots = [serialize_row(r) for r in cur.fetchall()]

    return {"body": {
        "status": "success",
        "data": {
            **serialize_row(shop),
            "services": services,
            "deliveryTimeSlots": delivery_slots,
            "instorePickupTimeSlots": instore_slots,
        }
    }}


@router.put("/delivery-schedule")
async def update_delivery_schedule(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Update delivery time slots and interval for a laundry."""
    laundry_id = body.get("laundryId")
    slots = body.get("deliveryTimeSlots", [])
    delivery_time_interval = body.get("deliveryTimeInterval")

    if not laundry_id:
        return {"statusCode": 400, "body": {"status": "error", "message": "Missing laundryId"}}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Update delivery time interval on laundry_shops if provided
        if delivery_time_interval is not None:
            cur.execute("""
                UPDATE shop.laundry_shops SET delivery_time_interval = %s WHERE laundry_id = %s
            """, (int(delivery_time_interval), laundry_id))

        # Replace all delivery time slots
        cur.execute("DELETE FROM shop.delivery_time_slots WHERE laundry_id = %s", (laundry_id,))
        for slot in slots:
            day = slot.get("day")
            start_time = slot.get("startTime")
            end_time = slot.get("endTime")
            if day and start_time and end_time:
                cur.execute("""
                    INSERT INTO shop.delivery_time_slots (laundry_id, day_of_week, start_time, end_time)
                    VALUES (%s, %s, %s, %s)
                """, (laundry_id, day, start_time, end_time))

    return {"statusCode": 200, "body": {"status": "success", "message": "Delivery schedule updated"}}


@router.get("/delivery-schedule")
async def get_delivery_schedule(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get delivery time slots and interval for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)

        cur.execute("SELECT delivery_time_interval FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        shop = cur.fetchone()

        cur.execute("""
            SELECT day_of_week AS day, start_time AS "startTime", end_time AS "endTime"
            FROM shop.delivery_time_slots WHERE laundry_id = %s ORDER BY id
        """, (laundryId,))
        slots = [{"day": r["day"], "startTime": str(r["startTime"])[:5], "endTime": str(r["endTime"])[:5]} for r in cur.fetchall()]

    return {
        "statusCode": 200,
        "body": {
            "status": "success",
            "deliveryTimeInterval": shop["delivery_time_interval"] if shop else 2,
            "deliveryTimeSlots": slots,
        }
    }
