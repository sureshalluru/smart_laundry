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
