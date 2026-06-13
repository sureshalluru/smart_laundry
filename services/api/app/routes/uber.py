"""
Uber Integration routes — replaces UberIntegration Lambda.
Handles: delivery quotes, scheduling, cancellation, status, and webhooks.
"""
from fastapi import APIRouter, Depends, Query, Body, Request
from typing import Optional
from app.database import get_db, get_cursor
from app.config import settings
import httpx
import requests
import logging
import json
import uuid
import re
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
router = APIRouter()

GOOGLE_MAPS_API_KEY = settings.google_maps_api_key
UBER_AUTH_URL = "https://auth.uber.com/oauth/v2/token"
UBER_SCOPE = "eats.deliveries"

# ─── Helpers ───────────────────────────────────────────────────────────────────

SUITE_PREFIXES = re.compile(r'^(?:ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room)[\s\-_.]*', re.I)
SUITE_REGEX = re.compile(
    r"""
    (?:^|,)\s*
    (?:
        (?:(?:Ste?|Suite|St|Apt|Apartment|Unit|Bldg|Building|Fl|Floor|Rm|Room)\.?)
        \s*#?\s*
        (?P<label>[A-Za-z0-9]+(?:\s*[-–]\s*[A-Za-z0-9]+)?)
        |
        \#\s*(?P<hash>\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?)
    )
    """,
    re.IGNORECASE | re.VERBOSE
)


def _normalize_suite_token(token: str) -> str:
    token = re.sub(r"\s*[-–]\s*", "-", token.strip())
    token = SUITE_PREFIXES.sub("", token)
    token = re.sub(r"\s+", "", token)
    return token


def get_uber_access_token(client_id: str, client_secret: str) -> str:
    """Get OAuth2 token from Uber."""
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": UBER_SCOPE
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    response = requests.post(UBER_AUTH_URL, headers=headers, data=payload)
    response.raise_for_status()
    return response.json()["access_token"]


def get_coordinates_from_address(address: str):
    """Geocode an address using Google Maps."""
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": address, "key": GOOGLE_MAPS_API_KEY}
    response = requests.get(url, params=params)
    response.raise_for_status()
    results = response.json().get("results", [])
    if not results:
        raise ValueError(f"Could not geocode address: {address}")
    location = results[0]["geometry"]["location"]
    return location["lat"], location["lng"]


def get_uber_formatted_address_components(address_text: str) -> str:
    """Convert address text to Uber's structured address format via Google Geocoding."""
    if not GOOGLE_MAPS_API_KEY:
        raise ValueError("GOOGLE_MAPS_API_KEY not configured. Add it to .env file.")
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": address_text, "key": GOOGLE_MAPS_API_KEY}
    response = requests.get(url, params=params)
    response.raise_for_status()
    results = response.json().get("results", [])
    if not results:
        raise ValueError(f"Could not geocode address: {address_text}")
    result = results[0]
    components = result["address_components"]

    def get_component(component_type):
        for comp in components:
            if component_type in comp["types"]:
                return comp["long_name"]
        return None

    street_number = get_component("street_number")
    route = get_component("route")
    city = get_component("locality") or get_component("sublocality")
    state = get_component("administrative_area_level_1")
    zip_code = get_component("postal_code")
    country = get_component("country")
    subpremise = get_component("subpremise")

    if not all([street_number, route, city, state, zip_code, country]):
        raise ValueError(f"Address is missing required components: {address_text}")

    street_line = f"{street_number} {route}"

    if subpremise:
        street_line += f" #{_normalize_suite_token(subpremise)}"
    else:
        m = SUITE_REGEX.search(address_text or "")
        if m:
            raw = m.group("label") or m.group("hash")
            suite = _normalize_suite_token(raw)
            street_line += f", #{suite}"

    return json.dumps({
        "street_address": [street_line],
        "city": city,
        "state": state,
        "zip_code": zip_code,
        "country": country
    })


def get_laundry_uber_credentials(laundry_id: str, uber_env: str = None):
    """Fetch Uber credentials from PostgreSQL for a specific laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if uber_env:
            # Use exact env match when specified
            cur.execute("""
                SELECT luc.client_id, luc.client_secret, luc.customer_id, luc.base_url, luc.env,
                       ls.laundry_timezone, ls.pickup_dropoff_instructions
                FROM shop.laundry_uber_credentials luc
                JOIN shop.laundry_shops ls ON ls.laundry_id = luc.laundry_id
                WHERE luc.laundry_id = %s AND luc.env = %s
                LIMIT 1
            """, (laundry_id, uber_env))
        else:
            # Default: prefer test env
            cur.execute("""
                SELECT luc.client_id, luc.client_secret, luc.customer_id, luc.base_url, luc.env,
                       ls.laundry_timezone, ls.pickup_dropoff_instructions
                FROM shop.laundry_uber_credentials luc
                JOIN shop.laundry_shops ls ON ls.laundry_id = luc.laundry_id
                WHERE luc.laundry_id = %s
                ORDER BY CASE WHEN luc.env = 'test' THEN 0 ELSE 1 END
                LIMIT 1
            """, (laundry_id,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Uber credentials not found for laundryId: {laundry_id} env: {uber_env}")
        return {
            "clientId": row["client_id"],
            "clientSecret": row["client_secret"],
            "customerId": row["customer_id"],
            "baseUrl": row["base_url"],
            "timeZone": row["laundry_timezone"] or "America/Chicago",
            "uberEnv": row["env"],
            "pickupDropoffInstructions": (row["pickup_dropoff_instructions"] or "").strip(),
        }


def create_uber_quote(token, customer_id, base_url, pickup_address, dropoff_address,
                      pickup_phone, dropoff_phone, pickup_ready_dt, pickup_deadline_dt,
                      type_order, return_full_quote=False):
    """Create an Uber delivery quote."""
    url = f"{base_url}/customers/{customer_id}/delivery_quotes"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    data = {
        "pickup_address": get_uber_formatted_address_components(pickup_address),
        "dropoff_address": get_uber_formatted_address_components(dropoff_address),
        "pickup_phone_number": pickup_phone,
        "dropoff_phone_number": dropoff_phone,
        "pickup_ready_dt": pickup_ready_dt,
        "pickup_deadline_dt": pickup_deadline_dt,
    }
    logger.info("Uber quote request URL: %s", url)
    logger.info("Uber quote payload: %s", json.dumps({k: v[:80] if isinstance(v, str) and len(v) > 80 else v for k, v in data.items()}))
    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 200:
        logger.error("Uber quote error %d: %s", response.status_code, response.text[:500])
    response.raise_for_status()
    result = response.json()
    return result if return_full_quote else result["id"]


def schedule_uber_delivery(token, customer_id, base_url, quote_id, pickup_address, dropoff_address,
                           pickup_phone, dropoff_phone, external_id, laundry_bags_qty,
                           pickup_name, dropoff_name, pickup_notes, dropoff_notes,
                           laundry_name, uber_env, pickup_ready_dt, pickup_deadline_dt, type_order):
    """Schedule an Uber delivery using a quote."""
    pickup_address_json = get_uber_formatted_address_components(pickup_address)
    dropoff_address_json = get_uber_formatted_address_components(dropoff_address)

    if type_order == "laundryPickup":
        pickup_business_name = "Customer"
        dropoff_business_name = laundry_name or "Pickup Store"
    else:
        pickup_business_name = laundry_name or "Pickup Store"
        dropoff_business_name = "Customer"

    url = f"{base_url}/customers/{customer_id}/deliveries"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    data = {
        "quote_id": quote_id,
        "pickup_name": pickup_name,
        "pickup_address": pickup_address_json,
        "pickup_phone_number": pickup_phone,
        "dropoff_name": dropoff_name,
        "dropoff_address": dropoff_address_json,
        "dropoff_phone_number": dropoff_phone,
        "pickup_business_name": pickup_business_name,
        "dropoff_business_name": dropoff_business_name,
        "pickup_notes": pickup_notes,
        "dropoff_notes": dropoff_notes,
        "manifest_items": [{"name": "Laundry Bag", "quantity": laundry_bags_qty}],
        "pickup_ready_dt": pickup_ready_dt,
        "pickup_deadline_dt": pickup_deadline_dt,
        "manifest_reference": external_id,
        "external_id": external_id,
        "idempotency_key": str(uuid.uuid4()),
    }
    if uber_env == "test":
        data["test_specifications"] = {"robo_courier_specification": {"mode": "auto"}}

    logger.info("UBER SCHEDULE PAYLOAD: %s", json.dumps(data, indent=2))
    response = requests.post(url, headers=headers, json=data)
    if response.status_code not in [200, 201]:
        logger.error("UBER ERROR RESPONSE: %s", response.text)
        response.raise_for_status()
    return response.json()


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.post("/uberQuoteEstimate")
async def get_uber_quote_estimate(
    body: dict = Body(...),
    operation: str = Query(None),
    laundryId: str = Query(None),
):
    """Get an Uber delivery quote estimate. Called by frontend to show price before order."""
    try:
        laundry_id = laundryId or body.get("laundry_id")
        uber_env = body.get("uberEnv", "")
        pickup_address = body.get("pickup_address")
        dropoff_address = body.get("dropoff_address")
        delivery_date = body.get("delivery_date")
        time_interval = body.get("time_interval")
        pickup_phone = body.get("pickup_phone", "")
        dropoff_phone = body.get("dropoff_phone", "")
        type_order = body.get("type_order", "laundryPickup")

        if not all([pickup_address, dropoff_address, delivery_date, time_interval]):
            return {"statusCode": 400, "body": json.dumps({"error": "Missing required fields for quote."})}

        creds = get_laundry_uber_credentials(laundry_id, uber_env)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        # Parse time interval into ISO timestamps (convert to UTC as Uber requires)
        start_str, end_str = time_interval.split("-")
        start_str = start_str.strip()
        end_str = end_str.strip()
        local_tz = ZoneInfo(creds["timeZone"])
        from datetime import timezone
        pickup_start = datetime.strptime(f"{delivery_date} {start_str}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
        pickup_end = datetime.strptime(f"{delivery_date} {end_str}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
        pickup_ready_dt = pickup_start.astimezone(timezone.utc).isoformat()
        pickup_deadline_dt = pickup_end.astimezone(timezone.utc).isoformat()

        quote_data = create_uber_quote(
            token, creds["customerId"], creds["baseUrl"],
            pickup_address, dropoff_address, pickup_phone, dropoff_phone,
            pickup_ready_dt, pickup_deadline_dt, type_order,
            return_full_quote=True
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "quoteId": quote_data.get("id"),
                "estimatedFeeCents": quote_data.get("fee", 0),
                "currency": quote_data.get("currency", "USD"),
                "pickupEta": quote_data.get("pickup_eta"),
                "dropoffEta": quote_data.get("dropoff_eta")
            })
        }

    except KeyError as ke:
        logger.error("Missing credential key: %s", str(ke))
        return {"statusCode": 500, "body": json.dumps({"error": f"Uber credentials issue: {str(ke)}"})}
    except requests.exceptions.HTTPError as he:
        # Capture Uber's actual error response for debugging
        uber_error = ""
        if hasattr(he, 'response') and he.response is not None:
            try:
                uber_error = he.response.text[:500]
            except Exception:
                uber_error = str(he)
        logger.error("Uber API error: %s", uber_error)
        return {"statusCode": he.response.status_code if hasattr(he, 'response') and he.response is not None else 500,
                "body": json.dumps({"error": f"Uber API error: {uber_error}"})}
    except Exception as e:
        logger.exception("Failed to fetch Uber quote")
        return {"statusCode": 500, "body": json.dumps({"error": f"Failed to fetch Uber quote: {str(e)}"})}


@router.post("/schedule")
async def schedule_uber_order(body: dict = Body(...)):
    """Schedule an Uber delivery for pickup or dropoff leg of an order."""
    try:
        laundry_id = body.get("laundry_id")
        if not laundry_id:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing laundry_id"})}

        uber_env = body.get("uberEnv", "")
        pickup_address = body.get("pickup_address")
        dropoff_address = body.get("dropoff_address")
        delivery_date = body.get("delivery_date")
        time_interval = body.get("time_interval")
        order_id = body.get("order_id", "")
        laundry_bags_qty = body.get("laundry_bags_qty", 1)
        type_order = body.get("type", "laundryPickup")
        pickup_name = body.get("pickup_name", "")
        dropoff_name = body.get("dropoff_name", "")
        pickup_phone = body.get("pickup_phone", "")
        dropoff_phone = body.get("dropoff_phone", "")
        pickup_notes = (body.get("pickup_notes") or "").strip()
        dropoff_notes = (body.get("dropoff_notes") or "").strip()
        laundry_name = body.get("laundry_name", "")

        if not all([pickup_address, dropoff_address, delivery_date, time_interval]):
            return {"statusCode": 400, "body": json.dumps({"error": "Missing required fields."})}

        creds = get_laundry_uber_credentials(laundry_id, uber_env)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        # Convert time interval to ISO (UTC as Uber requires)
        start_str, end_str = time_interval.split("-")
        start_str = start_str.strip()
        end_str = end_str.strip()
        local_tz = ZoneInfo(creds["timeZone"])
        from datetime import timezone
        pickup_start = datetime.strptime(f"{delivery_date} {start_str}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
        pickup_end = datetime.strptime(f"{delivery_date} {end_str}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
        pickup_ready_dt = pickup_start.astimezone(timezone.utc).isoformat()
        pickup_deadline_dt = pickup_end.astimezone(timezone.utc).isoformat()

        # Apply shop instructions if missing
        shop_pdi = creds.get("pickupDropoffInstructions", "")
        if type_order == "laundryPickup" and not dropoff_notes and shop_pdi:
            dropoff_notes = shop_pdi
        elif type_order == "laundryDropoff" and not pickup_notes and shop_pdi:
            pickup_notes = shop_pdi

        # Get quote
        quote_id = create_uber_quote(
            token, creds["customerId"], creds["baseUrl"],
            pickup_address, dropoff_address, pickup_phone, dropoff_phone,
            pickup_ready_dt, pickup_deadline_dt, type_order
        )

        # Schedule delivery
        result = schedule_uber_delivery(
            token, creds["customerId"], creds["baseUrl"], quote_id,
            pickup_address, dropoff_address, pickup_phone, dropoff_phone,
            order_id, laundry_bags_qty, pickup_name, dropoff_name,
            pickup_notes, dropoff_notes, laundry_name, creds["uberEnv"],
            pickup_ready_dt, pickup_deadline_dt, type_order
        )

        # Update the order in DB with Uber info
        uber_info = {
            "deliveryId": result.get("id"),
            "quoteId": result.get("quote_id"),
            "status": result.get("status"),
            "feeCents": result.get("fee", 0),
            "currency": result.get("currency", "usd"),
            "trackingUrl": result.get("tracking_url")
        }

        with get_db() as conn:
            cur = get_cursor(conn)
            # Get existing uber_info
            cur.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
            row = cur.fetchone()
            existing_uber_info = (row["uber_info"] if row and row["uber_info"] else {}) or {}
            existing_uber_info[type_order] = uber_info
            cur.execute("""
                UPDATE orders.orders SET uber_info = %s, updated_at = NOW()
                WHERE order_id = %s
            """, (json.dumps(existing_uber_info), order_id))

            # Update pickup/dropoff service field
            service_field = "pickup_service" if type_order == "laundryPickup" else "dropoff_service"
            cur.execute(f"UPDATE orders.orders SET {service_field} = 'Uber' WHERE order_id = %s", (order_id,))

            # Update uber fee on the order
            fee_cents = result.get("fee", 0)
            if fee_cents:
                fee_field = "uber_pickup_fee" if type_order == "laundryPickup" else "uber_dropoff_fee"
                cur.execute(f"UPDATE orders.orders SET {fee_field} = %s WHERE order_id = %s",
                            (fee_cents / 100.0, order_id))

            # Update frequency flags if applicable
            cur.execute("SELECT auto_generated, frequency, customer_id, address_id FROM orders.orders WHERE order_id = %s", (order_id,))
            ord_row = cur.fetchone()
            if ord_row and (ord_row.get("auto_generated") or ord_row.get("frequency") in ("Weekly", "BiWeekly")):
                cust_id = ord_row["customer_id"]
                addr_id = ord_row["address_id"]
                if cust_id and addr_id:
                    if type_order == "laundryPickup":
                        cur.execute("""
                            UPDATE orders.laundry_frequency SET uber_pickup_frequency = TRUE
                            WHERE customer_id = %s AND address_id = %s AND is_active = TRUE
                        """, (cust_id, addr_id))
                    else:
                        cur.execute("""
                            UPDATE orders.laundry_frequency SET uber_dropoff_frequency = TRUE
                            WHERE customer_id = %s AND address_id = %s AND is_active = TRUE
                        """, (cust_id, addr_id))

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Uber delivery scheduled and order updated.", "result": result})
        }

    except KeyError as ke:
        logger.error("Missing credential key: %s", str(ke))
        return {"statusCode": 500, "body": json.dumps({"error": f"Missing key: {str(ke)}"})}
    except ValueError as ve:
        logger.warning("Invalid input: %s", str(ve))
        return {"statusCode": 400, "body": json.dumps({"error": str(ve)})}
    except Exception as e:
        logger.exception("Failed to schedule Uber delivery")
        return {"statusCode": 500, "body": json.dumps({"error": f"Failed to schedule Uber: {str(e)}"})}


@router.post("/cancel")
async def cancel_uber_delivery_route(body: dict = Body(...)):
    """Cancel an Uber delivery."""
    return await _cancel_uber_delivery(body)


@router.post("/cancel-uber-delivery")
async def cancel_uber_delivery_alias(body: dict = Body(...)):
    """Alias for cancel — admin frontend uses this path."""
    return await _cancel_uber_delivery(body)


async def _cancel_uber_delivery(body: dict):
    try:
        laundry_id = body.get("laundry_id")
        delivery_id = body.get("delivery_id")
        order_id = body.get("order_id")
        pickup_service = body.get("pickupService")
        dropoff_service = body.get("dropoffService")

        if not laundry_id or not delivery_id:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing laundry_id or delivery_id"})}

        creds = get_laundry_uber_credentials(laundry_id)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        # Cancel via Uber API
        url = f"{creds['baseUrl']}/customers/{creds['customerId']}/deliveries/{delivery_id}/cancel"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        resp = requests.post(url, headers=headers)
        if resp.status_code not in [200, 202]:
            logger.error(f"Uber cancel error: {resp.text}")
            resp.raise_for_status()
        uber_result = resp.json()

        # Update order service fields if provided
        if order_id:
            with get_db() as conn:
                cur = get_cursor(conn)
                if pickup_service:
                    cur.execute("UPDATE orders.orders SET pickup_service = %s WHERE order_id = %s", (pickup_service, order_id))
                if dropoff_service:
                    cur.execute("UPDATE orders.orders SET dropoff_service = %s WHERE order_id = %s", (dropoff_service, order_id))

                # Update frequency flags
                cur.execute("SELECT auto_generated, frequency, customer_id, address_id FROM orders.orders WHERE order_id = %s", (order_id,))
                ord_row = cur.fetchone()
                if ord_row and (ord_row.get("auto_generated") or ord_row.get("frequency") in ("Weekly", "BiWeekly")):
                    cust_id = ord_row["customer_id"]
                    addr_id = ord_row["address_id"]
                    if cust_id and addr_id:
                        if pickup_service:
                            cur.execute("""
                                UPDATE orders.laundry_frequency SET uber_pickup_frequency = %s
                                WHERE customer_id = %s AND address_id = %s AND is_active = TRUE
                            """, (pickup_service == "Uber", cust_id, addr_id))
                        if dropoff_service:
                            cur.execute("""
                                UPDATE orders.laundry_frequency SET uber_dropoff_frequency = %s
                                WHERE customer_id = %s AND address_id = %s AND is_active = TRUE
                            """, (dropoff_service == "Uber", cust_id, addr_id))

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Uber delivery cancelled successfully.", "result": uber_result})
        }

    except Exception as e:
        logger.exception("Failed to cancel Uber delivery")
        return {"statusCode": 500, "body": json.dumps({"error": f"Failed to cancel: {str(e)}"})}


@router.get("/delivery/{delivery_id}")
async def get_delivery_status(
    delivery_id: str,
    laundryId: str = Query(...),
    uberEnv: Optional[str] = Query(None),
):
    """Get Uber delivery details."""
    try:
        creds = get_laundry_uber_credentials(laundryId, uberEnv)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        url = f"{creds['baseUrl']}/customers/{creds['customerId']}/deliveries/{delivery_id}"
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(url, headers=headers)
        if resp.status_code == 404:
            return {"statusCode": 404, "body": json.dumps({"error": "Delivery not found"})}
        resp.raise_for_status()

        return {"statusCode": 200, "body": json.dumps({"message": "Delivery fetched.", "delivery": resp.json()})}

    except Exception as e:
        logger.exception("Failed to get Uber delivery details")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


@router.post("/webhook")
async def uber_webhook(request: Request):
    """Handle Uber delivery status webhooks. No auth (Uber calls this)."""
    try:
        body = await request.json()
        logger.info("Uber webhook received: %s", json.dumps(body))

        # Extract fields
        external_id = body.get("data", {}).get("external_id")
        delivery_id = body.get("delivery_id")
        status = body.get("data", {}).get("status")
        pickup_status = body.get("data", {}).get("pickup", {}).get("status")
        pickup_time = body.get("data", {}).get("pickup", {}).get("status_timestamp")
        dropoff_status = body.get("data", {}).get("dropoff", {}).get("status")
        dropoff_time = body.get("data", {}).get("dropoff", {}).get("status_timestamp")

        logger.info(f"Uber webhook: order={external_id}, delivery={delivery_id}, status={status}")

        if not external_id:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing external_id"})}

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT order_id, order_status, laundry_id, customer_id, uber_info
                FROM orders.orders WHERE order_id = %s
            """, (external_id,))
            order_item = cur.fetchone()

            if not order_item:
                logger.warning(f"No order found for orderId: {external_id}")
                return {"statusCode": 404, "body": json.dumps({"message": "Order not found"})}

            uber_info = order_item.get("uber_info") or {}
            laundry_pickup = uber_info.get("laundryPickup", {})
            laundry_dropoff = uber_info.get("laundryDropoff", {})

            # Determine which section to update
            update_target = None
            if laundry_pickup.get("deliveryId") == delivery_id:
                update_target = "laundryPickup"
            elif laundry_dropoff.get("deliveryId") == delivery_id:
                update_target = "laundryDropoff"
            else:
                logger.warning(f"Delivery ID mismatch for orderId {external_id}")
                return {"statusCode": 400, "body": json.dumps({"message": "Delivery ID mismatch"})}

            # Update uber_info
            if update_target not in uber_info:
                uber_info[update_target] = {"deliveryId": delivery_id}

            target_info = uber_info[update_target]
            if "pickup" not in target_info:
                target_info["pickup"] = {}
            if "dropoff" not in target_info:
                target_info["dropoff"] = {}

            target_info["status"] = status
            target_info["pickup"]["status"] = pickup_status
            target_info["pickup"]["statusTimestamp"] = pickup_time
            target_info["dropoff"]["status"] = dropoff_status
            target_info["dropoff"]["statusTimestamp"] = dropoff_time

            # Store tracking URL if present
            tracking_url = body.get("data", {}).get("tracking_url")
            if tracking_url:
                target_info["trackingUrl"] = tracking_url
                # Also update the order-level tracking fields
                if update_target == "laundryPickup":
                    cur.execute("UPDATE orders.orders SET pickup_tracking_url = %s WHERE order_id = %s",
                                (tracking_url, external_id))
                else:
                    cur.execute("UPDATE orders.orders SET dropoff_tracking_url = %s WHERE order_id = %s",
                                (tracking_url, external_id))

            uber_info[update_target] = target_info
            cur.execute("""
                UPDATE orders.orders SET uber_info = %s, updated_at = NOW()
                WHERE order_id = %s
            """, (json.dumps(uber_info), external_id))

            # Update pickup/dropoff status fields
            if update_target == "laundryPickup":
                cur.execute("UPDATE orders.orders SET pickup_status = %s WHERE order_id = %s", (status, external_id))
            else:
                cur.execute("UPDATE orders.orders SET dropoff_status = %s WHERE order_id = %s", (status, external_id))

            # Auto-update order status based on delivery events
            delivery_status = target_info.get("status")

            if update_target == "laundryPickup" and delivery_status == "delivered":
                if order_item["order_status"] == "OrderSubmitted":
                    logger.info(f"Updating orderStatus → 'ReceivedAtFacility' for orderId: {external_id}")
                    cur.execute("""
                        UPDATE orders.orders SET order_status = 'ReceivedAtFacility', updated_at = NOW()
                        WHERE order_id = %s
                    """, (external_id,))

            elif update_target == "laundryDropoff" and delivery_status == "delivered":
                if order_item["order_status"] == "EnRouteToDelivery":
                    logger.info(f"Updating orderStatus → 'Delivered' for orderId: {external_id}")
                    cur.execute("""
                        UPDATE orders.orders SET order_status = 'Delivered', updated_at = NOW()
                        WHERE order_id = %s
                    """, (external_id,))

        return {"statusCode": 200, "body": json.dumps({"message": f"Delivery status updated in {update_target}"})}

    except Exception as e:
        logger.exception("Webhook processing failed")
        return {"statusCode": 500, "body": json.dumps({"error": f"Webhook processing failed: {str(e)}"})}
