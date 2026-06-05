"""
Validation routes — ported directly from ValidationService Lambda.
Handles: laundry validation, address check, phone lookup, referrals.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging
import json
import time
import hmac
import hashlib
import base64
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/get-info-api")
async def get_info_api(
    operation: str = Query(...),
    laundryId: str = Query(...),
    isCustomer: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Laundry info endpoint used by AdminCreateOrder."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if operation == 'getLaundryInfo':
            is_cust = str(isCustomer).lower() == 'true' if isCustomer else None
            return _get_laundry_info(cur, laundryId, is_cust)
    return {"status": "error", "message": "Unknown operation"}


@router.get("/validate-test-laundry")
async def validate_laundry(
    operation: str = Query(...),
    laundryId: str = Query(None),
    address: Optional[str] = None,
    phoneNumber: Optional[str] = None,
    phoneQuery: Optional[str] = None,
    isCustomer: Optional[str] = None,
    customerId: Optional[str] = None,
    laundryUserDomain: Optional[str] = None,
    ref: Optional[str] = None,
    token: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """All ValidationService operations."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'checkLaundryId':
            return _check_laundry_id(cur, laundryId)

        elif operation == 'getLaundryInfo':
            is_cust = str(isCustomer).lower() == 'true' if isCustomer else None
            return _get_laundry_info(cur, laundryId, is_cust)

        elif operation == 'validateAddress':
            return _validate_address(cur, laundryId, address)

        elif operation == 'checkPhoneNumber':
            return _check_phone_number(cur, phoneNumber, laundryId)

        elif operation == 'searchPhone':
            return _search_phone(cur, phoneQuery, laundryId)

    return {"status": "error", "message": "Unknown operation"}


def _check_laundry_id(cur, laundry_id):
    """Verify laundry exists — exact port from Lambda."""
    cur.execute("""
        SELECT laundry_name, stripe_public_key, stripe_terminal_id,
               laundry_timezone, user_domain, bag_price, site_content
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"status": "success", "exists": False}
    site_content = row.get("site_content") or {}
    return {
        "status": "success",
        "exists": True,
        "laundryName": row["laundry_name"],
        "laundryTimeZone": row["laundry_timezone"],
        "stripePublicKey": row["stripe_public_key"] or "",
        "laundryUserDomain": row["user_domain"],
        "stripeTerminalExists": bool(row["stripe_terminal_id"]),
        "bagPrice": float(row["bag_price"]) if row.get("bag_price") else 30.00,
        "themeColor": site_content.get("themeColor", "blue"),
    }


def _get_laundry_info(cur, laundry_id, is_customer=None):
    """Full laundry info — exact port from Lambda."""
    cur.execute("""
        SELECT laundry_name, laundry_timezone, stripe_public_key, stripe_terminal_id,
               delivery_time_interval, user_domain,
               street, city, state, zip_code, country, serviceable_zip_codes, bag_price, site_content
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    shop = cur.fetchone()
    if not shop:
        return {"status": "error", "message": "Laundry ID not found"}

    # Services
    cur.execute("""
        SELECT service_name, price, description, input_weight, customer_access
        FROM shop.laundry_services
        WHERE laundry_id = %s AND is_active = TRUE ORDER BY service_id
    """, (laundry_id,))
    all_services = [{
        "serviceName": r["service_name"],
        "price": str(r["price"]),
        "description": r["description"] or "",
        "inputWeight": r["input_weight"],
        "customerAccess": r["customer_access"],
    } for r in cur.fetchall()]

    laundry_services = [s for s in all_services if s["customerAccess"]] if is_customer else all_services

    # Delivery time slots
    cur.execute("""
        SELECT day_of_week AS day, start_time, end_time
        FROM shop.delivery_time_slots WHERE laundry_id = %s ORDER BY id
    """, (laundry_id,))
    delivery_time_slots = [{"day": r["day"], "startTime": str(r["start_time"]), "endTime": str(r["end_time"])} for r in cur.fetchall()]

    # In-store pickup time slots
    cur.execute("""
        SELECT day_of_week AS day, start_time, end_time
        FROM shop.instore_pickup_time_slots WHERE laundry_id = %s ORDER BY id
    """, (laundry_id,))
    instore_slots = [{"day": r["day"], "startTime": str(r["start_time"]), "endTime": str(r["end_time"])} for r in cur.fetchall()]

    # Frequency intervals
    cur.execute("SELECT interval FROM shop.frequency_intervals WHERE laundry_id = %s", (laundry_id,))
    frequency_interval = [r["interval"] for r in cur.fetchall()]

    # Uber credentials
    cur.execute("SELECT env FROM shop.laundry_uber_credentials WHERE laundry_id = %s LIMIT 1", (laundry_id,))
    uber_row = cur.fetchone()

    # Frequency promotions
    frequency_promotions = []
    if is_customer and frequency_interval:
        cur.execute("""
            SELECT promo_code, linked_frequency, description
            FROM shop.promotions
            WHERE laundry_id = %s AND is_active = TRUE
              AND is_online_frequency_promo = TRUE AND linked_frequency IS NOT NULL
        """, (laundry_id,))
        covered = set()
        for r in cur.fetchall():
            freq = r["linked_frequency"]
            if freq in frequency_interval and freq not in covered:
                frequency_promotions.append({"frequency": freq, "promoCode": r["promo_code"], "description": r["description"] or ""})
                covered.add(freq)

    addr = f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}"

    return {
        "status": "success",
        "laundryName": shop["laundry_name"],
        "laundryTimeZone": shop["laundry_timezone"],
        "stripePublicKey": shop["stripe_public_key"] or "",
        "stripeTerminalExists": bool(shop["stripe_terminal_id"]),
        "deliveryTimeInterval": str(shop["delivery_time_interval"] or ""),
        "laundryAddress": addr,
        "laundryServices": laundry_services,
        "deliveryTimeSlots": delivery_time_slots,
        "inStorePickupTimeSlots": instore_slots,
        "frequencyInterval": frequency_interval,
        "frequencyPromotions": frequency_promotions,
        "uberEnv": uber_row["env"] if uber_row else "",
        "uberCredentialsExist": bool(uber_row),
        "bagPrice": float(shop["bag_price"]) if shop.get("bag_price") else 30.00,
        "siteContent": shop.get("site_content") or {},
    }


def _validate_address(cur, laundry_id, address):
    """Check if address zip code is serviceable."""
    if not address:
        return {"status": "error", "message": "Missing address"}
    parts = address.split(",")
    zip_code = parts[-2].split()[-1].strip() if len(parts) >= 2 else ""
    country = parts[-1].strip() if len(parts) >= 1 else ""

    cur.execute("SELECT serviceable_zip_codes, country FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"status": "error", "message": "Laundry not found"}

    serviceable = row["serviceable_zip_codes"] or []
    if zip_code in serviceable and country == (row["country"] or ""):
        return {"status": "success", "serviceable": True}
    return {"status": "success", "serviceable": False}


def _check_phone_number(cur, phone_number, laundry_id):
    """Find customer by phone number."""
    if not phone_number:
        return {"error": "Missing phoneNumber"}
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


def _search_phone(cur, query, laundry_id):
    """Search customers by phone substring."""
    if not query:
        return {"error": "Missing query"}
    normalized = query.replace("+1", "").strip()
    cur.execute("""
        SELECT c.customer_id, c.first_name, c.last_name, c.phone_number
        FROM shop.customers c
        JOIN shop.customer_laundry_stats cls
          ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
        WHERE c.phone_number LIKE %s
        LIMIT 10
    """, (laundry_id, f"%{normalized}%"))
    return {"suggestions": [{
        "customerId": r["customer_id"],
        "firstName": r["first_name"],
        "lastName": r["last_name"],
        "phoneNumber": r["phone_number"],
    } for r in cur.fetchall()]}


# ── Customer-facing endpoints (no auth required for some) ─────────────────────

@router.get("/get-info")
async def get_laundry_info_public(
    operation: str = Query(...),
    laundryId: str = Query(...),
    isCustomer: Optional[str] = Query(None),
):
    """Get laundry info — public endpoint for customer app (no auth required)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if operation == 'getLaundryInfo':
            is_cust = str(isCustomer).lower() == 'true' if isCustomer else True
            return _get_laundry_info(cur, laundryId, is_cust)
        elif operation == 'checkLaundryId':
            return _check_laundry_id(cur, laundryId)
    return {"status": "error", "message": "Unknown operation"}


@router.get("/validate-address")
async def validate_address_public(
    operation: str = Query("validateAddress"),
    laundryId: str = Query(...),
    address: str = Query(...),
):
    """Validate customer address — public endpoint (no auth required)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        return _validate_address(cur, laundryId, address)


@router.get("/validate-laundry")
async def validate_laundry_public(
    operation: str = Query(...),
    laundryId: str = Query(...),
):
    """Validate laundry — public endpoint for customer app (no auth required)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if operation == 'checkLaundryId':
            return _check_laundry_id(cur, laundryId)
    return {"status": "error", "message": "Unknown operation"}
