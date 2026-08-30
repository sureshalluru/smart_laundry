"""
Validation routes — ported directly from ValidationService Lambda.
Handles: laundry validation, address check, phone lookup, referrals.
"""
from fastapi import APIRouter, Depends, Query, Body
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
               laundry_timezone, user_domain, bag_price, tax_rate, site_content, laundry_logo, subscription_discount
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
        "taxRate": float(row["tax_rate"]) if row.get("tax_rate") else 0,
        "themeColor": site_content.get("themeColor", "blue"),
        "laundryLogo": row["laundry_logo"] or "",
        "subscriptionDiscount": float(row.get("subscription_discount") or 0),
    }


def _get_laundry_info(cur, laundry_id, is_customer=None):
    """Full laundry info — exact port from Lambda."""
    cur.execute("""
        SELECT laundry_name, laundry_timezone, stripe_public_key, stripe_terminal_id,
               delivery_time_interval, user_domain,
               street, city, state, zip_code, country, serviceable_zip_codes, bag_price, tax_rate, site_content, laundry_logo, subscription_discount,
               hide_home_address, min_weight_enabled, addons_enabled, min_weight_scope
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    shop = cur.fetchone()
    if not shop:
        return {"status": "error", "message": "Laundry ID not found"}

    # Services
    cur.execute("""
        SELECT service_id, service_name, price, description, input_weight, customer_access, category_id, min_billable_weight
        FROM shop.laundry_services
        WHERE laundry_id = %s AND is_active = TRUE ORDER BY service_id
    """, (laundry_id,))
    all_services = [{
        "serviceId": str(r["service_id"]),
        "serviceName": r["service_name"],
        "price": str(r["price"]),
        "description": r["description"] or "",
        "inputWeight": r["input_weight"],
        "customerAccess": r["customer_access"],
        "categoryId": r["category_id"],
        "minBillableWeight": float(r["min_billable_weight"]) if r["min_billable_weight"] is not None else None,
    } for r in cur.fetchall()]

    laundry_services = [s for s in all_services if s["customerAccess"]] if is_customer else all_services

    # Minimum billable weight. For the customer (online) client we surface the
    # EFFECTIVE online value (master flag AND scope includes online). For the
    # admin (is_customer False) we surface the RAW master flag + scope so the
    # admin create-order UI can decide instore applicability itself.
    _scope = (str(shop.get("min_weight_scope") or "all")).strip().lower()
    _min_weight_raw = bool(shop.get("min_weight_enabled"))
    _min_weight_online = _min_weight_raw and _scope in ("all", "online")
    _min_weight_out = _min_weight_online if is_customer else _min_weight_raw

    # Add-on / processing-extra catalog (Phase 2c). Only surfaced to customers
    # when the tenant enabled add-ons; admins always get the full active list.
    addons_enabled = bool(shop.get("addons_enabled"))
    laundry_addons = []
    if addons_enabled or not is_customer:
        cur.execute("""
            SELECT addon_id, addon_name, description, pricing_basis, unit_price, customer_access
            FROM shop.laundry_addons
            WHERE laundry_id = %s AND is_active = TRUE ORDER BY addon_id
        """, (laundry_id,))
        all_addons = [{
            "addonId": r["addon_id"],
            "addonName": r["addon_name"],
            "description": r["description"] or "",
            "pricingBasis": r["pricing_basis"],
            "unitPrice": float(r["unit_price"] or 0),
            "customerAccess": r["customer_access"],
        } for r in cur.fetchall()]
        laundry_addons = [a for a in all_addons if a["customerAccess"]] if is_customer else all_addons

    # Service categories
    cur.execute("""
        SELECT category_id, category_name, display_order
        FROM shop.service_categories
        WHERE laundry_id = %s AND is_active = TRUE
        ORDER BY display_order, category_id
    """, (laundry_id,))
    service_categories = [{
        "categoryId": r["category_id"],
        "categoryName": r["category_name"],
        "displayOrder": r["display_order"],
    } for r in cur.fetchall()]

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
    cur.execute("SELECT interval, auto_charge_enabled, subscription_discount FROM shop.frequency_intervals WHERE laundry_id = %s", (laundry_id,))
    freq_rows = cur.fetchall()
    frequency_interval = [r["interval"] for r in freq_rows]
    frequency_details = [{
        "interval": r["interval"],
        "autoChargeEnabled": r.get("auto_charge_enabled", False) or False,
        "subscriptionDiscount": float(r.get("subscription_discount") or 0),
    } for r in freq_rows]

    # Uber credentials
    cur.execute("SELECT env FROM shop.laundry_uber_credentials WHERE laundry_id = %s ORDER BY env DESC LIMIT 1", (laundry_id,))
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

    hide_address = bool(shop.get("hide_home_address"))

    # Public-facing address: for home-based operators (hide_home_address), expose
    # only city/state so the street is never shown on client-facing surfaces.
    if hide_address:
        addr = f"{shop['city']}, {shop['state']}".strip(", ")
    else:
        addr = f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}"

    # Sanitize site_content: strip the exact street address + maps query so the
    # public marketing site / footer / map pin never render the home address.
    site_content = dict(shop.get("site_content") or {})
    if hide_address:
        site_content.pop("address", None)
        site_content.pop("mapsQuery", None)
        # Keep city/state/zip's city+state only; the components fall back to city/state.

    return {
        "status": "success",
        "laundryName": shop["laundry_name"],
        "laundryTimeZone": shop["laundry_timezone"],
        "stripePublicKey": shop["stripe_public_key"] or "",
        "stripeTerminalExists": bool(shop["stripe_terminal_id"]),
        "deliveryTimeInterval": str(shop["delivery_time_interval"] or 2),
        "laundryAddress": addr,
        "hideHomeAddress": hide_address,
        "laundryServices": laundry_services,
        "serviceCategories": service_categories,
        "deliveryTimeSlots": delivery_time_slots,
        "inStorePickupTimeSlots": instore_slots,
        "frequencyInterval": frequency_interval,
        "frequencyDetails": frequency_details,
        "frequencyPromotions": frequency_promotions,
        "uberEnv": uber_row["env"] if uber_row else "",
        "uberCredentialsExist": bool(uber_row),
        "bagPrice": float(shop["bag_price"]) if shop.get("bag_price") else 30.00,
        "taxRate": float(shop["tax_rate"]) if shop.get("tax_rate") else 0,
        "siteContent": site_content,
        "laundryLogo": shop.get("laundry_logo") or "",
        "subscriptionDiscount": float(shop.get("subscription_discount") or 0),
        # min_weight_enabled surfaced to the customer client is the EFFECTIVE
        # online value: the master flag AND the scope including online. So a
        # tenant scoped to in-store only won't show/apply minimums on the
        # customer ordering screen. minWeightScope is included for reference.
        "minWeightEnabled": _min_weight_out,
        "minWeightScope": _scope,
        "addonsEnabled": addons_enabled,
        "laundryAddons": laundry_addons,
    }


def _validate_address(cur, laundry_id, address):
    """Check if address zip code is serviceable."""
    import re
    if not address:
        return {"status": "error", "message": "Missing address"}

    # Extract zip code — use the LAST 5-digit number in the address
    # (zip code is always at the end; street numbers also match \d{5} but come first)
    zip_matches = re.findall(r'\b(\d{5})\b', address)
    zip_code = zip_matches[-1] if zip_matches else ""

    if not zip_code:
        return {"status": "error", "message": "Could not determine zip code from address"}

    # Demo zip code: 78664 is always serviceable for all laundries (for demos/testing)
    # This is Round Rock's zip — use any real address in 78664 during demos
    if zip_code == "78664":
        return {"status": "success", "serviceable": True}

    cur.execute("SELECT serviceable_zip_codes FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"status": "error", "message": "Laundry not found"}

    serviceable = row["serviceable_zip_codes"] or []
    if isinstance(serviceable, dict):
        serviceable = list(serviceable.keys())

    if zip_code in serviceable:
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


@router.post("/zip-interest")
async def register_zip_interest(body: dict = Body(...)):
    """Record interest in an unserved zip code area."""
    laundry_id = body.get("laundryId")
    zip_code = body.get("zipCode", "")
    address = body.get("address", "")
    email = body.get("email", "")
    phone = body.get("phone", "")

    if not laundry_id or (not email and not phone):
        return {"status": "error", "message": "Please provide email or phone"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO shop.zip_code_interest (laundry_id, zip_code, address, email, phone)
            VALUES (%s, %s, %s, %s, %s)
        """, (laundry_id, zip_code, address, email, phone))

    return {"status": "success", "message": "We'll notify you when we expand to your area!"}


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
