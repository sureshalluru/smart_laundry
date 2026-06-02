"""
Customer routes — replaces CustomerService Lambda.
Handles: customer info, addresses, order history, reviews.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize_row
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/info")
async def get_customer_info(
    operation: str = Query(...),
    customerId: Optional[str] = None,
    laundryId: Optional[str] = None,
    phoneNumber: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get customer information. Replaces CustomerService operations."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'getCustomerInformation':
            return _get_customer_information(cur, customerId, laundryId)
        elif operation == 'getCustomerDetails':
            return _get_customer_details(cur, customerId, laundryId)
        elif operation == 'getCustomerDetailsForAdmin':
            return _get_customer_details_for_admin(cur, customerId)
        elif operation == 'showAllCustomers':
            return _show_all_customers(cur, laundryId)
        elif operation == 'checkPhoneNumber':
            return _check_phone_number(cur, phoneNumber, laundryId)

    return {"body": "Operation not found"}


@router.get("/orders")
async def get_customer_orders(
    customerId: str = Query(...),
    laundryId: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Get paginated order history for a customer."""
    # TODO: Port from CustomerService getOrderDetails
    return {"body": {"orders": [], "page": page}}


@router.post("/review")
async def create_review(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create an order review."""
    # TODO: Port from CustomerService createReview
    return {"body": {"message": "TODO: implement createReview"}}


@router.put("/notifications")
async def update_notification_preferences(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Update customer notification preferences."""
    # TODO: Port from CustomerService updateNotificationPreferences
    return {"body": {"message": "TODO: implement updateNotificationPreferences"}}


def _get_customer_information(cur, customer_id, laundry_id):
    """Full customer profile with addresses & frequency."""
    cur.execute("""
        SELECT c.customer_id, c.email, c.first_name, c.last_name,
               c.phone_number, c.notif_email, c.notif_sms, c.notif_phone,
               c.special_instructions
        FROM shop.customers c
        WHERE c.customer_id = %s
    """, (customer_id,))
    customer = cur.fetchone()
    if not customer:
        return {"body": {"status": "error", "message": "Customer not found"}}

    cur.execute("""
        SELECT address_id, address, door_number, address_instructions
        FROM shop.customer_addresses
        WHERE customer_id = %s AND is_active = TRUE
    """, (customer_id,))
    addresses = [serialize_row(r) for r in cur.fetchall()]

    # frequency details via laundry_frequency
    cur.execute("""
        SELECT lf.frequency_id, ca.address, lf.frequency,
               lf.frequency_created_date, lf.frequency_start_date,
               lf.future_pickup_date, lf.dropoff_time_interval,
               lf.pickup_date, lf.pickup_time_interval
        FROM orders.laundry_frequency lf
        JOIN shop.customer_addresses ca ON ca.address_id = lf.address_id
        WHERE lf.customer_id = %s AND lf.is_active = TRUE
    """, (customer_id,))
    frequency_details = [serialize_row(r) for r in cur.fetchall()]

    return {"body": {
        "status": "success",
        "data": {
            "email": customer["email"],
            "firstName": customer["first_name"],
            "lastName": customer["last_name"],
            "phoneNumber": customer["phone_number"],
            "addresses": addresses,
            "notificationPreferences": {
                "email": customer["notif_email"],
                "sms": customer["notif_sms"],
                "phone": customer["notif_phone"],
            },
            "frequencyDetails": frequency_details,
        }
    }}


def _get_customer_details(cur, customer_id, laundry_id):
    """Customer info with payment profiles."""
    cur.execute("""
        SELECT customer_id, email, first_name, last_name, phone_number,
               special_instructions, notif_email, notif_sms, notif_phone
        FROM shop.customers WHERE customer_id = %s
    """, (customer_id,))
    customer = cur.fetchone()
    if not customer:
        return {"body": {"status": "error", "message": "Customer not found"}}

    cur.execute("""
        SELECT address_id, address, door_number, address_instructions
        FROM shop.customer_addresses WHERE customer_id = %s AND is_active = TRUE
    """, (customer_id,))
    addresses = [serialize_row(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT laundry_id, stripe_customer_id
        FROM shop.customer_payment_profiles WHERE customer_id = %s
    """, (customer_id,))
    payment_ids = {r["laundry_id"]: r["stripe_customer_id"] for r in cur.fetchall()}

    return {"body": {
        "status": "success",
        "data": {
            "email": customer["email"],
            "firstName": customer["first_name"],
            "lastName": customer["last_name"],
            "phoneNumber": customer["phone_number"],
            "addresses": addresses,
            "notificationPreferences": {
                "email": customer["notif_email"],
                "sms": customer["notif_sms"],
                "phone": customer["notif_phone"],
            },
            "customerPaymentId": payment_ids,
        }
    }}


def _get_customer_details_for_admin(cur, customer_id):
    """Admin view of customer — same as getCustomerDetails."""
    return _get_customer_details(cur, customer_id, None)


def _show_all_customers(cur, laundry_id, last_evaluated_key=None, batch_size=20):
    """List all customers for a laundry using customer_laundry_stats."""
    offset = int(last_evaluated_key) if last_evaluated_key else 0

    cur.execute("""
        SELECT c.customer_id, c.first_name, c.last_name, c.email, c.phone_number,
               c.notif_email, c.notif_sms, c.notif_phone,
               cls.total_orders_placed, cls.total_order_value,
               cls.last_completed_order_id, cls.last_completed_at
        FROM shop.customers c
        JOIN shop.customer_laundry_stats cls
          ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
        ORDER BY c.created_at DESC
        LIMIT %s OFFSET %s
    """, (laundry_id, batch_size, offset))
    rows = cur.fetchall()

    customers = []
    for r in rows:
        cur.execute("""
            SELECT address_id, address, door_number, address_instructions
            FROM shop.customer_addresses WHERE customer_id = %s AND is_active = TRUE
        """, (r["customer_id"],))
        addresses = [serialize_row(a) for a in cur.fetchall()]

        customers.append({
            "customerId": r["customer_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "email": r["email"],
            "phoneNumber": r["phone_number"],
            "notification_preferences": {
                "email": r["notif_email"],
                "sms": r["notif_sms"],
                "phone": r["notif_phone"],
            },
            "addresses": addresses,
            "totalOrdersPlaced": r["total_orders_placed"],
            "totalOrderValue": float(r["total_order_value"] or 0),
            "currentOrders": [],
            "lastCompletedOrder": {"orderId": r["last_completed_order_id"]} if r["last_completed_order_id"] else {},
        })

    next_offset = offset + batch_size if len(rows) == batch_size else None
    return {"body": {
        "status": "success",
        "customers": customers,
        "pagination": {
            "batchSize": batch_size,
            "lastEvaluatedKey": next_offset,
            "hasMore": next_offset is not None,
        }
    }}


def _check_phone_number(cur, phone_number, laundry_id):
    """Find customer by phone — ported from ValidationService Lambda."""
    if not phone_number:
        return {"exists": False}
    normalized = phone_number.replace("+1", "").strip()
    cur.execute("""
        SELECT c.customer_id, c.first_name, c.special_instructions,
               cpp.stripe_customer_id
        FROM shop.customers c
        LEFT JOIN shop.customer_payment_profiles cpp
          ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
        WHERE c.phone_number LIKE %s
        LIMIT 1
    """, (laundry_id, f"%{normalized}%"))
    row = cur.fetchone()
    if not row:
        return {"exists": False}

    # Ensure customer_laundry_stats record exists
    cur.execute("""
        INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
        VALUES (%s, %s) ON CONFLICT (customer_id, laundry_id) DO NOTHING
    """, (row["customer_id"], laundry_id))

    return {
        "exists": True,
        "customerId": row["customer_id"],
        "customerPaymentId": row["stripe_customer_id"] or "",
        "firstName": row["first_name"],
        "specialInstructions": row["special_instructions"] or "",
    }


@router.get("/check-partial-phonenumbers")
async def check_partial_phonenumbers(
    phoneQuery: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Search customers by partial phone number."""
    with get_db() as conn:
        cur = get_cursor(conn)
        normalized = phoneQuery.replace("+1", "").strip()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.phone_number LIKE %s
            LIMIT 10
        """, (laundryId, f"%{normalized}%"))
        suggestions = [{
            "customerId": r["customer_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "phoneNumber": r["phone_number"],
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"suggestions": suggestions}}
