import requests
import uuid
import json
import boto3
from datetime import datetime
import pytz
import logging
import os
import re

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# === CONSTANTS ===
# GOOGLE_MAPS_API_KEY = "AIzaSyAiZ-5YYfKIPhpIexNoHRfym1mc-uXXr_g"
DYNAMODB = boto3.resource("dynamodb")
laundry_shop_table  = DYNAMODB.Table("LaundryShopInfo")
orders_table = DYNAMODB.Table("LaundryOrders")
frequency_table = DYNAMODB.Table("LaundryFrequency")
customer_table = DYNAMODB.Table('Customer')   
lambda_client = boto3.client("lambda")
GOOGLE_MAPS_API_KEY = os.environ["GOOGLE_MAPS_API_KEY"]
UBER_AUTH_URL = os.environ.get("UBER_AUTH_URL", "https://auth.uber.com/oauth/v2/token")
GOOGLE_GEOCODE_URL = os.environ.get("GOOGLE_GEOCODE_URL", "https://maps.googleapis.com/maps/api/geocode/json")
UBER_SCOPE = os.environ.get("UBER_SCOPE", "eats.deliveries")

# === Uber Auth ===
def get_uber_access_token(client_id, client_secret):
    url = UBER_AUTH_URL
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": UBER_SCOPE
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    response = requests.post(url, headers=headers, data=payload)
    response.raise_for_status()
    return response.json()["access_token"]


# === Geo Helpers ===
def get_coordinates_from_address(address):
    url = GOOGLE_GEOCODE_URL
    params = {"address": address, "key": GOOGLE_MAPS_API_KEY}
    response = requests.get(url, params=params)
    response.raise_for_status()
    location = response.json()["results"][0]["geometry"]["location"]
    return location["lat"], location["lng"]


# def get_uber_formatted_address_components(address_text):
#     url = GOOGLE_GEOCODE_URL
#     params = {"address": address_text, "key": GOOGLE_MAPS_API_KEY}
#     response = requests.get(url, params=params)
#     result = response.json()["results"][0]
#     components = result["address_components"]

#     def get_component(component_type):
#         for comp in components:
#             if component_type in comp["types"]:
#                 return comp["long_name"]
#         return None

#     street_number = get_component("street_number")
#     route = get_component("route")
#     city = get_component("locality") or get_component("sublocality")
#     state = get_component("administrative_area_level_1")
#     zip_code = get_component("postal_code")
#     country = get_component("country")

#     if not all([street_number, route, city, state, zip_code, country]):
#         raise Exception("❌ Address is missing required components.")

#     return json.dumps({
#         "street_address": [f"{street_number} {route}"],
#         "city": city,
#         "state": state,
#         "zip_code": zip_code,
#         "country": country
#     })

SUITE_PREFIXES = re.compile(r'^(?:ste|suite|apt|apartment|unit|bldg|building|fl|floor|rm|room)[\s\-_.]*', re.I)
# Regex to capture things like "St # 1006 - 1007", "#1006-1007", etc.
SUITE_REGEX = re.compile(
    r"""
    (?:^|,)\s*                                    # begin or after a comma
    (?:
        # Labeled forms: Suite/Ste/St/Apt/Unit/Bldg/etc (optional '#')
        (?:(?:Ste?|Suite|St|Apt|Apartment|Unit|Bldg|Building|Fl|Floor|Rm|Room)\.?)
        \s*#?\s*
        (?P<label>[A-Za-z0-9]+(?:\s*[-–]\s*[A-Za-z0-9]+)?)     # 1006 or 1006-1007 or 5B
        |
        # Bare hash forms: #1006 or #1006-1007
        \#\s*(?P<hash>\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?)
    )
    """,
    re.IGNORECASE | re.VERBOSE
)
def _normalize_suite_token(token: str) -> str:
    # collapse spaces around hyphens
    token = re.sub(r"\s*[-–]\s*", "-", token.strip())
    # remove leading label prefixes like "ste", "apt", etc.
    token = SUITE_PREFIXES.sub("", token)
    # remove remaining spaces (e.g., "5 B" -> "5B")
    token = re.sub(r"\s+", "", token)
    return token
def get_uber_formatted_address_components(address_text):
    url = GOOGLE_GEOCODE_URL
    params = {"address": address_text, "key": GOOGLE_MAPS_API_KEY}
    response = requests.get(url, params=params)
    response.raise_for_status()
    result = response.json()["results"][0]
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
    subpremise = get_component("subpremise")  # Apt/Suite if Google provides it

    if not all([street_number, route, city, state, zip_code, country]):
        raise Exception("❌ Address is missing required components.")

    street_line = f"{street_number} {route}"

    # Prefer Google's structured subpremise
    if subpremise:
        street_line += f" #{_normalize_suite_token(subpremise)}"
    else:
        # Fallback: extract from the original input (handles "St # 1006 - 1007", etc.)
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

# === Dynamo Lookup ===
def get_laundry_credentials(laundry_id, uber_env=None):
    # Fetch only the fields we need
    response = laundry_shop_table.get_item(
        Key={"laundryId": laundry_id},
        ProjectionExpression="uberCredentials, laundryTimeZone, uberEnv, pickupDropoffInstructions"
    )
    logger.info(f"DynamoDB get_item response: {response}")

    item = response.get("Item")
    if not item:
        raise KeyError(f"LaundryShopInfo record not found for laundryId: {laundry_id}")

    # If uber_env was not passed, use the one from DB
    if not uber_env:
        uber_env = item.get("uberEnv")
        if not uber_env:
            raise KeyError(f"'uberEnv' not found in LaundryShopInfo for {laundry_id}")

    uber_creds = item.get("uberCredentials", {}).get(uber_env)
    if not uber_creds:
        raise KeyError(f"Uber credentials for environment '{uber_env}' not found in LaundryShopInfo for {laundry_id}")

    return {
        "clientId": uber_creds.get("clientId"),
        "clientSecret": uber_creds.get("clientSecret"),
        "customerId": uber_creds.get("customerId"),
        "baseUrl": uber_creds.get("baseUrl"),
        "timeZone": item.get("laundryTimeZone", ""),
        "uberEnv": uber_env,
        "pickupDropoffInstructions": (item.get("pickupDropoffInstructions") or "").strip()

    }

def geocode_address(address_text):
    r = requests.get(GOOGLE_GEOCODE_URL, params={"address": address_text, "key": GOOGLE_MAPS_API_KEY})
    r.raise_for_status()
    res = r.json()["results"][0]
    loc = res["geometry"]["location"]
    comps = res["address_components"]

    def pick(kind):
        for c in comps:
            if kind in c["types"]:
                return c["long_name"]
        return None

    street_number = pick("street_number")
    route = pick("route")
    city = pick("locality") or pick("postal_town") or pick("sublocality")
    state = pick("administrative_area_level_1")
    zip_code = pick("postal_code")
    country = pick("country")

    structured = {
        "street_address": [f"{street_number} {route}"] if street_number and route else [address_text],
        "city": city or "",
        "state": state or "",
        "zip_code": zip_code or "",
        "country": country or ""
    }
    return (loc["lat"], loc["lng"], structured)

# === Uber API ===
def create_quote(token, customer_id, base_url, pickup_address, dropoff_address, pickup_phone, dropoff_phone, external_store_id, pickup_ready_dt, pickup_deadline_dt, type_order, return_full_quote=False):
    pickup_lat, pickup_lng = get_coordinates_from_address(pickup_address)
    dropoff_lat, dropoff_lng = get_coordinates_from_address(dropoff_address)
    # p_lat, p_lng, p_struct = geocode_address(pickup_address)
    # d_lat, d_lng, d_struct = geocode_address(dropoff_address)
    include_store_id = (type_order == "laundryDropoff")
    url = f"{base_url}/customers/{customer_id}/delivery_quotes"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    print("uber converted pickup_address", pickup_address)
    print("uber converted dropoff_address", dropoff_address)

    data = {
        "pickup_address": get_uber_formatted_address_components(pickup_address),
        "dropoff_address": get_uber_formatted_address_components(dropoff_address),
        # "pickup_latitude": pickup_lat,
        # "pickup_longitude": pickup_lng,
        # "dropoff_latitude": dropoff_lat,
        # "dropoff_longitude": dropoff_lng,
        # "pickup_latitude":  p_lat,
        # "pickup_longitude": p_lng,
        # "dropoff_latitude": d_lat,
        # "dropoff_longitude": d_lng,
        "pickup_phone_number": pickup_phone,
        "dropoff_phone_number": dropoff_phone,
        "pickup_ready_dt": pickup_ready_dt,
        "pickup_deadline_dt": pickup_deadline_dt,
        # "manifest_total_value": 1000,
        # "external_store_id": external_store_id
    }
    # if include_store_id:
    #     data["external_store_id"] = external_store_id
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    result = response.json()
    # return response.json()["id"]
    return result if return_full_quote else result["id"]



def schedule_delivery(token, customer_id, base_url, quote_id, pickup_address, dropoff_address,
                      pickup_phone, dropoff_phone, external_store_id, external_id, delivery_date,
                      time_interval, time_zone, laundry_bags_qty, pickup_name,
                      dropoff_name, pickup_notes, laundry_name, uber_env, pickup_ready_dt, pickup_deadline_dt, type_order, dropoff_notes="hello"):
    pickup_lat, pickup_lng = get_coordinates_from_address(pickup_address)
    dropoff_lat, dropoff_lng = get_coordinates_from_address(dropoff_address)
    pickup_address_json = get_uber_formatted_address_components(pickup_address)
    dropoff_address_json = get_uber_formatted_address_components(dropoff_address)

    print("uber converted pickup_address schedule delivery", pickup_address_json)
    print("uber converted dropoff_address schedule delivery", dropoff_address_json)

    # p_lat, p_lng, p_struct = geocode_address(pickup_address)
    # d_lat, d_lng, d_struct = geocode_address(dropoff_address)
    include_store_id = (type_order == "laundryDropoff")

    if type_order == "laundryPickup":
        pickup_business_name  = "Customer"
        dropoff_business_name = laundry_name or "Pickup Store"
    else:  # laundryDropoff (Store → Customer)
        pickup_business_name  = laundry_name or "Pickup Store"
        dropoff_business_name = "Customer"


    # start_str, end_str = time_interval.split("-")
    # start_str = start_str.strip()
    # end_str = end_str.strip()
    # local_tz = pytz.timezone(time_zone)
    # pickup_start = local_tz.localize(datetime.strptime(f"{delivery_date} {start_str}", "%Y-%m-%d %H:%M"))
    # pickup_end = local_tz.localize(datetime.strptime(f"{delivery_date} {end_str}", "%Y-%m-%d %H:%M"))
    # pickup_ready_dt = pickup_start.astimezone(pytz.utc).isoformat()
    # pickup_deadline_dt = pickup_end.astimezone(pytz.utc).isoformat()

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
        # "pickup_latitude": pickup_lat,
        # "pickup_longitude": pickup_lng,
        # "dropoff_latitude": dropoff_lat,
        # "dropoff_longitude": dropoff_lng,
        # "pickup_latitude":  p_lat,
        # "pickup_longitude": p_lng,
        # "dropoff_latitude": d_lat,
        # "dropoff_longitude": d_lng,
        # "pickup_business_name": "Pickup Store",
        # "dropoff_business_name": "Customer Location",
        "pickup_business_name": pickup_business_name,
        "dropoff_business_name": dropoff_business_name,
        "pickup_notes": pickup_notes,
        "dropoff_notes": dropoff_notes,
        "manifest_items": [{
            "name": "Laundry Bag",
            "quantity": laundry_bags_qty
        }],
        "pickup_ready_dt": pickup_ready_dt,
        "pickup_deadline_dt": pickup_deadline_dt,
        "manifest_reference": external_id,
        # "manifest_total_value": 1000,
        # "external_store_id": external_store_id,
        "external_id": external_id,
        "idempotency_key": str(uuid.uuid4()),
        # "test_specifications": {"robo_courier_specification": {"mode": "auto"}}
    }
    # if include_store_id:
    #     data["external_store_id"] = external_store_id
    if uber_env == "test":
        data["test_specifications"] = {"robo_courier_specification": {"mode": "auto"}}
    
    print("UBER PAYLOAD:", json.dumps(data, indent=2))
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        print("UBER ERROR RESPONSE:", response.text)
        raise

    return response.json()

def handle_uber_webhook(event):
    try:
        logger.info("Raw webhook event: %s", json.dumps(event))

        if "body" not in event or not event["body"]:
            raise ValueError("Missing 'body' in webhook event.")

        body = json.loads(event["body"])

        # Extract fields
        external_id = body.get("data", {}).get("external_id")
        delivery_id = body.get("delivery_id")
        status = body.get("data", {}).get("status")
        pickup_status = body.get("data", {}).get("pickup", {}).get("status")
        pickup_time = body.get("data", {}).get("pickup", {}).get("status_timestamp")
        dropoff_status = body.get("data", {}).get("dropoff", {}).get("status")
        dropoff_time = body.get("data", {}).get("dropoff", {}).get("status_timestamp")

        logger.info(f"🟢 Uber Status Update:")
        logger.info(f"  External Order ID : {external_id}")
        logger.info(f"  Delivery ID       : {delivery_id}")
        logger.info(f"  Overall Status    : {status}")
        logger.info(f"  Pickup Status     : {pickup_status}")
        logger.info(f"  Dropoff Status    : {dropoff_status}")

        # Fetch the order
        response = orders_table.get_item(Key={"orderId": external_id})
        order_item = response.get("Item")

        if not order_item:
            logger.warning(f"No order found for orderId: {external_id}")
            return {"statusCode": 404, "body": json.dumps({"message": "Order not found"})}

        uber_info = order_item.get("uberInfo", {})
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

        # Initialize section if missing
        if update_target not in uber_info:
            logger.info(f"'uberInfo.{update_target}' missing — initializing for orderId: {external_id}")
            orders_table.update_item(
                Key={"orderId": external_id},
                UpdateExpression=f"SET uberInfo.{update_target} = :init_map",
                ExpressionAttributeValues={
                    ":init_map": {
                        "deliveryId": delivery_id
                    }
                }
            )
            response = orders_table.get_item(Key={"orderId": external_id})
            order_item = response.get("Item")
            uber_info = order_item.get("uberInfo", {})

        # Re-fetch nested section to verify submaps
        target_info = uber_info.get(update_target, {})
        init_exprs = []
        expr_values = {}

        if "pickup" not in target_info:
            init_exprs.append(f"uberInfo.{update_target}.pickup = :pickup_init")
            expr_values[":pickup_init"] = {}

        if "dropoff" not in target_info:
            init_exprs.append(f"uberInfo.{update_target}.dropoff = :dropoff_init")
            expr_values[":dropoff_init"] = {}

        if init_exprs:
            logger.info(f"🛠 Creating missing pickup/dropoff maps for orderId: {external_id}")
            orders_table.update_item(
                Key={"orderId": external_id},
                UpdateExpression="SET " + ", ".join(init_exprs),
                ExpressionAttributeValues=expr_values
            )

        # Final update
        update_expr = (
            f"SET uberInfo.{update_target}.#overallStatus = :overall_status, "
            f"uberInfo.{update_target}.pickup.#status = :pickup_status, "
            f"uberInfo.{update_target}.pickup.#timestamp = :pickup_time, "
            f"uberInfo.{update_target}.dropoff.#status = :dropoff_status, "
            f"uberInfo.{update_target}.dropoff.#timestamp = :dropoff_time"
        )
        expr_attr_names = {
            "#overallStatus": "status",
            "#status": "status",
            "#timestamp": "statusTimestamp"
        }
        expr_attr_values = {
            ":overall_status": status,
            ":pickup_status": pickup_status,
            ":pickup_time": pickup_time,
            ":dropoff_status": dropoff_status,
            ":dropoff_time": dropoff_time
        }

        logger.info(f"✅ Updating Uber delivery statuses in '{update_target}' for orderId: {external_id}")
        orders_table.update_item(
            Key={"orderId": external_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values
        )

        # 🔁 Re-fetch that specific updated section only
        updated_section = orders_table.get_item(Key={"orderId": external_id}).get("Item", {}).get("uberInfo", {}).get(update_target, {})
        delivery_status = updated_section.get("status")

        logger.info(f"🔎 Status after update for {update_target}: {delivery_status}")

        # Conditionally update order status and notify only once
        if update_target == "laundryPickup" and delivery_status == "delivered":
            if order_item.get("orderStatus") == "OrderSubmitted" and order_item.get("orderStatus") != "ReceivedAtFacility":
                logger.info(f"🧺 Updating orderStatus → 'ReceivedAtFacility' for orderId: {external_id}")
                orders_table.update_item(
                    Key={"orderId": external_id},
                    UpdateExpression="SET orderStatus = :received",
                    ExpressionAttributeValues={":received": "ReceivedAtFacility"}
                )
                send_order_status_notification(external_id, "ReceivedAtFacility")

        elif update_target == "laundryDropoff" and delivery_status == "delivered":
            if order_item.get("orderStatus") == "EnRouteToDelivery" and order_item.get("orderStatus") != "Delivered":
                logger.info(f"📦 Updating orderStatus → 'Delivered' for orderId: {external_id}")
                orders_table.update_item(
                    Key={"orderId": external_id},
                    UpdateExpression="SET orderStatus = :delivered",
                    ExpressionAttributeValues={":delivered": "Delivered"}
                )
                send_order_status_notification(external_id, "Delivered")

        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Delivery status updated in {update_target}"})
        }

    except Exception as e:
        logger.exception("Webhook processing failed:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Webhook processing failed: {str(e)}"})
        }

def send_order_status_notification(order_id, order_status):
    try:
        # Fetch order
        order_response = orders_table.get_item(Key={"orderId": order_id})
        order = order_response.get("Item")
        if not order:
            logger.warning(f"Order not found: {order_id}")
            return {"status": "error", "message": "Order not found"}

        customer_id = order.get("customerId")
        laundry_id = order.get("laundryId")

        if not customer_id or not laundry_id:
            logger.warning(f"Missing customerId or laundryId in order {order_id}")
            return {"status": "error", "message": "Missing customerId or laundryId"}

        # Fetch customer
        customer_response = customer_table.get_item(
            Key={"customerId": customer_id},
            ProjectionExpression="notification_preferences, email, phoneNumber, firstName, lastName, addresses, contactDetails"
        )

        customer = customer_response.get("Item")
        if not customer:
            logger.warning(f"Customer not found: {customer_id}")
            return {"status": "error", "message": "Customer not found"}

        # Fetch laundry shop info
        laundry_response = laundry_shop_table.get_item(Key={"laundryId": laundry_id})
        laundry_info = laundry_response.get("Item")
        sender_email = laundry_info.get("contactDetails", {}).get("email", "no-reply@laundryapp.com")

        # Notification preferences
        preferences = customer.get("notification_preferences", {})
        send_email = preferences.get("email", False)
        send_sms = preferences.get("phone", False)

        recipient_email = customer.get("email")
        recipient_phone = customer.get("phoneNumber")
        customer_name = f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip()

        # Notification message
        message = f"Hi {customer_name}, your laundry order ({order_id}) status has been updated to: {order_status}."

        if send_email and recipient_email:
            invoke_notification_lambda(
                notification_type="email",
                recipient=recipient_email,
                message=message,
                subject="Order Status Update",
                sender=sender_email
            )

        if send_sms and recipient_phone:
            invoke_notification_lambda(
                notification_type="sms",
                recipient=recipient_phone,
                message=message
            )

        return {"status": "success", "message": "Notification sent"}

    except Exception as e:
        logger.exception("Error sending order status notification")
        return {"status": "error", "message": str(e)}


def invoke_notification_lambda(notification_type, recipient, message, subject=None, sender=None):
    logger.info(f"Invoking notification lambda for {notification_type} to recipient: {recipient}")
    try:
        payload = {
            "type": notification_type,
            "recipient": recipient,
            "message": message
        }
        if notification_type == "email":
            payload["subject"] = subject or "Order Notification"
            if sender:
                payload["sender"] = sender

        response = lambda_client.invoke(
            FunctionName="customerNotificationService",
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode()
        )
        logger.info(f"{notification_type.capitalize()} notification sent: {response}")
    except Exception as e:
        logger.exception(f"Failed to send {notification_type} notification")


def handle_get_uber_quote(event):
    try:
        laundry_id = event.get("laundry_id")
        uber_env = event.get("uberEnv", "")
        pickup_address = event.get("pickup_address")
        dropoff_address = event.get("dropoff_address")
        delivery_date = event.get("delivery_date")
        time_interval = event.get("time_interval")
        pickup_phone = event.get("pickup_phone", "")
        dropoff_phone = event.get("dropoff_phone", "")
        type_order = event.get("type_order", "")

        if not all([pickup_address, dropoff_address, delivery_date, time_interval]):
            raise ValueError("Missing one or more required fields for quote.")

        creds = get_laundry_credentials(laundry_id, uber_env)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        start_str, end_str = time_interval.split("-")
        start_str = start_str.strip()
        end_str = end_str.strip()
        local_tz = pytz.timezone(creds["timeZone"])
        pickup_start = local_tz.localize(datetime.strptime(f"{delivery_date} {start_str}", "%Y-%m-%d %H:%M"))
        pickup_end = local_tz.localize(datetime.strptime(f"{delivery_date} {end_str}", "%Y-%m-%d %H:%M"))
        pickup_ready_dt = pickup_start.astimezone(pytz.utc).isoformat()
        pickup_deadline_dt = pickup_end.astimezone(pytz.utc).isoformat()

        quote_data = create_quote(
            token, creds["customerId"], creds["baseUrl"],
            pickup_address, dropoff_address, pickup_phone, dropoff_phone,
            laundry_id, pickup_ready_dt, pickup_deadline_dt,
            type_order,
            return_full_quote=True  # 👈 Key change
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

    except Exception as e:
        logger.exception("Failed to fetch Uber quote:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Failed to fetch Uber quote: {str(e)}"})
        }

def _update_frequency_flags(customer_id: str, address_id: str,
                            pickup_service: str | None,
                            dropoff_service: str | None) -> dict:
    """
    Assumes LaundryFrequency has PK: frequencyId (S), SK: customerId (S).

    Steps:
    1) Look up frequencyId on the given customer's addresses[] by addressId.
    2) Get LaundryFrequency item by (frequencyId, customerId).
    3) Update uberPickupFrequency / uberDropoffFrequency to True when the corresponding
       service equals "Uber" (else False) — only if that param is provided.
    """
    try:
        # 1) Resolve frequencyId from the Customer record
        cust_resp = customer_table.get_item(
            Key={"customerId": customer_id},
            ProjectionExpression="customerId, addresses"
        )
        cust_item = cust_resp.get("Item") or {}
        addresses = cust_item.get("addresses", []) or []

        freq_id = None
        for addr in addresses:
            if addr.get("addressId") == address_id:
                freq_id = addr.get("frequencyId")
                break

        if not freq_id:
            logger.info(
                f"No frequencyId on customer {customer_id} for addressId {address_id}"
            )
            return {"status": "skipped_no_frequencyId", "customerId": customer_id, "addressId": address_id}

        # 2) Read LaundryFrequency (must use BOTH keys)
        try:
            freq_resp = frequency_table.get_item(
                Key={"frequencyId": str(freq_id), "customerId": str(customer_id)},
                ProjectionExpression="frequencyId, customerId, uberPickupFrequency, uberDropoffFrequency"
            )
        except ClientError as e:
            logger.exception("Error fetching LaundryFrequency record")
            return {"status": "error_get", "message": str(e)}

        freq_item = freq_resp.get("Item")
        if not freq_item:
            logger.info(
                f"LaundryFrequency not found for (frequencyId={freq_id}, customerId={customer_id})"
            )
            return {"status": "not_found", "frequencyId": str(freq_id), "customerId": str(customer_id)}

        # 3) Compute flags from provided services
        # Only update a flag if the corresponding param was provided.
        updates = []
        expr_vals = {}

        if pickup_service is not None:
            set_pickup = (pickup_service == "Uber")
            updates.append("uberPickupFrequency = :upf")
            expr_vals[":upf"] = set_pickup

        if dropoff_service is not None:
            set_drop = (dropoff_service == "Uber")
            updates.append("uberDropoffFrequency = :udf")
            expr_vals[":udf"] = set_drop

        if not updates:
            return {
                "status": "skipped_no_service_params",
                "frequencyId": str(freq_id),
                "customerId": str(customer_id),
            }

        frequency_table.update_item(
            Key={"frequencyId": str(freq_id), "customerId": str(customer_id)},
            UpdateExpression="SET " + ", ".join(updates),
            ExpressionAttributeValues=expr_vals
        )

        return {
            "status": "updated",
            "frequencyId": str(freq_id),
            "customerId": str(customer_id),
            "set": {
                "uberPickupFrequency": expr_vals.get(":upf"),
                "uberDropoffFrequency": expr_vals.get(":udf"),
            }
        }

    except Exception as e:
        logger.exception("Error updating frequency flags")
        return {"status": "error", "message": str(e)}

def cancel_uber_delivery(
    token, customer_id, base_url, delivery_id, order_id=None,
    pickup_service=None, dropoff_service=None
):
    # 1) Cancel via Uber API
    url = f"{base_url}/customers/{customer_id}/deliveries/{delivery_id}/cancel"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    resp = requests.post(url, headers=headers)
    if resp.status_code not in [200, 202]:
        logger.error(f"Uber cancel error: {resp.text}")
        resp.raise_for_status()
    uber_result = resp.json()

    if not order_id:
        # If you ever call this without an orderId, just return Uber result.
        return {"uberResult": uber_result, "orderUpdate": "skipped_no_orderId"}

    # 2) Read order (ProjectionExpression)
    order_resp = orders_table.get_item(
        Key={"orderId": order_id},
        ProjectionExpression=(
            "autoGenerated, pickupService, dropoffService, "
            "customerId, addressId, #freq"
        ),
        ExpressionAttributeNames={"#freq": "frequency"}
    )
    order_item = order_resp.get("Item")
    if not order_item:
        logger.warning(f"No order found for orderId: {order_id}")
        return {"uberResult": uber_result, "orderUpdate": "Order not found"}

    auto_generated  = order_item.get("autoGenerated")
    ord_customer_id = order_item.get("customerId")
    ord_address_id  = order_item.get("addressId")
    ord_frequency   = order_item.get("frequency")  # "Weekly", "BiWeekly", or None

    # 3) Update pickup/dropoff service if provided (irrespective of order type)
    update_parts = []
    expr_vals = {}
    if pickup_service:
        update_parts.append("pickupService = :p")
        expr_vals[":p"] = pickup_service
    if dropoff_service:
        update_parts.append("dropoffService = :d")
        expr_vals[":d"] = dropoff_service

    if update_parts:
        orders_table.update_item(
            Key={"orderId": order_id},
            UpdateExpression="SET " + ", ".join(update_parts),
            ExpressionAttributeValues=expr_vals
        )
        logger.info(f"Updated order {order_id} -> {expr_vals}")
    else:
        logger.info(f"No pickupService/dropoffService overrides provided for order {order_id}")

    # 4) If auto-generated AND Weekly/BiWeekly, update LaundryFrequency flags
    freq_update = {"status": "skipped"}
    if auto_generated or ord_frequency in ("Weekly", "BiWeekly"):
        if ord_customer_id and ord_address_id:
            freq_update = _update_frequency_flags(
                ord_customer_id, ord_address_id,
                pickup_service, dropoff_service
            )
        else:
            logger.info(
                f"Skipping frequency update; missing customerId/addressId on order {order_id}"
            )

    # 5) Note for auto-generated orders (frequency follow-up)
    if auto_generated:
        logger.info(f"⚠️ Order {order_id} is auto-generated. TODO: implement handling for frequency orders.")

    return {
        "uberResult": uber_result,
        "orderUpdate": "Success",
        "frequencyUpdate": freq_update
    }

def handle_cancel_uber_delivery(event):
    print("event to cancel delivery: ", event)
    try:
        laundry_id      = event.get("laundry_id")
        delivery_id     = event.get("delivery_id")
        order_id        = event.get("order_id") # optional string
        pickup_service  = event.get("pickupService")    # optional string
        dropoff_service = event.get("dropoffService")   # optional string

        if not laundry_id or not delivery_id:
            raise ValueError("Missing 'laundry_id' or 'delivery_id'.")

        creds = get_laundry_credentials(laundry_id)
        print(creds)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        # result = cancel_uber_delivery(token, creds["customerId"], creds["baseUrl"], delivery_id, order_id, in_store_dropoff, online_pickup, online_dropoff)
        result = cancel_uber_delivery(
            token, creds["customerId"], creds["baseUrl"], delivery_id, order_id=order_id,
            pickup_service=pickup_service, dropoff_service=dropoff_service
        )
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Uber delivery cancelled successfully.",
                "result": result
            })
        }

    except Exception as e:
        logger.exception("Failed to cancel Uber delivery:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Failed to cancel delivery: {str(e)}"})
        }

# === Uber API (details) ===
def get_uber_delivery_details(token, customer_id, base_url, delivery_id):
    url = f"{base_url}/customers/{customer_id}/deliveries/{delivery_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers)
    if resp.status_code == 404:
        # Bubble a clearer message up the stack
        raise requests.exceptions.HTTPError(
            f"404 delivery_not_found for {delivery_id}. "
            f"Likely wrong uberEnv/customerId or sandbox record expired.",
            response=resp
        )
    resp.raise_for_status()
    return resp.json()

def handle_get_uber_delivery(event):
    """
    Supports overriding env:
      - Query/body: uberEnv: "test" | "prod"
    """
    try:
        laundry_id = event.get("laundry_id")
        delivery_id = event.get("delivery_id")
        uber_env_override = event.get("uberEnv")  # optional

        if not laundry_id or not delivery_id:
            raise ValueError("Missing 'laundry_id' or 'delivery_id'.")

        creds = get_laundry_credentials(laundry_id, uber_env_override)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        delivery = get_uber_delivery_details(
            token, creds["customerId"], creds["baseUrl"], delivery_id
        )
        # logger.info("VERIFY pickup=%s", {
        #     "name": verify.get("pickup",{}).get("name"),
        #     "address": verify.get("pickup",{}).get("address"),
        #     "detailed_address": verify.get("pickup",{}).get("detailed_address"),
        #     "location": verify.get("pickup",{}).get("location"),
        # })
        # logger.info("VERIFY dropoff=%s", {
        #     "name": verify.get("dropoff",{}).get("name"),
        #     "address": verify.get("dropoff",{}).get("address"),
        #     "detailed_address": verify.get("dropoff",{}).get("detailed_address"),
        #     "location": verify.get("dropoff",{}).get("location"),
        # })
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Delivery fetched.", "delivery": delivery})
        }

    except requests.exceptions.HTTPError as e:
        logger.error("Uber GET delivery error: %s", getattr(e.response, "text", str(e)))
        code = e.response.status_code if getattr(e, "response", None) else 502
        return {
            "statusCode": code,
            "body": json.dumps({
                "error": "Failed to fetch delivery",
                "delivery_id": event.get("delivery_id"),
                "uberEnvUsed": event.get("uberEnv") or "from DB",
                "details": getattr(e.response, "text", str(e))
            })
        }
    except Exception as e:
        logger.exception("Failed to get Uber delivery:")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def lambda_handler(event, context):
    logger.info("Incoming event: %s", json.dumps(event))

    try:
        # === 1. Handle Uber Webhook ===
        if event.get("resource") == "/api/uber/webhook":
            logger.info("Handling Uber webhook.")
            return handle_uber_webhook(event)

        # === 2. Extract query string params ===
        query_params = event.get("queryStringParameters", {}) or {}
        operation = query_params.get("operation")
        laundry_id = query_params.get("laundryId")

        # === 3. Parse body ===
        if "body" in event:
            body = event["body"]
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except json.JSONDecodeError:
                    logger.warning("Body is not valid JSON string.")
                    body = {}
            elif isinstance(body, dict):
                pass  # already parsed
        else:
            body = event  # fallback for direct-invoke test events


        # === 4. Fallback to body for missing operation/laundry_id ===
        if not operation:
            operation = body.get("operation")
        if not laundry_id:
            laundry_id = body.get("laundry_id")

        # === 5. Check again ===
        if not operation:
            raise ValueError("Missing 'operation' in query string or body.")

        # === 6. Final event payload ===
        payload = {**body, "operation": operation}
        if laundry_id:
            payload["laundry_id"] = laundry_id  # unify key name

        # === 7. Route operation ===
        if operation == "schedule-uber-order":
            return handle_schedule_uber_order(payload)
        elif operation == "get-uber-quote":
            return handle_get_uber_quote(payload)
        elif operation == "cancel-delivery":
            return handle_cancel_uber_delivery(payload)
        elif operation == "get-delivery":
            return handle_get_uber_delivery(payload)


        else:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Unsupported operation: {operation}"})
            }

    except Exception as e:
        logger.exception("Unhandled exception:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }

def handle_schedule_uber_order(event):
    try:
        laundry_id = event.get("laundry_id")
        if not laundry_id:
            raise ValueError("Missing 'laundry_id' in event.")

        uber_env = event.get("uberEnv", "")
        pickup_address = event.get("pickup_address")
        dropoff_address = event.get("dropoff_address")
        delivery_date = event.get("delivery_date")
        time_interval = event.get("time_interval")

        if not all([pickup_address, dropoff_address, delivery_date, time_interval]):
            raise ValueError("One or more required fields are missing: 'pickup_address', 'dropoff_address', 'delivery_date', 'time_interval'.")

        creds = get_laundry_credentials(laundry_id, uber_env)
        token = get_uber_access_token(creds["clientId"], creds["clientSecret"])

        pickup_phone = event.get("pickup_phone", "")
        dropoff_phone = event.get("dropoff_phone", "")
        external_store_id = laundry_id
        external_id = event.get("order_id", "")
        timezone = creds.get("timeZone", "")
        laundry_bags_qty = event.get("laundry_bags_qty", "")
        type_order = event.get("type", "")
        pickup_name = event.get("pickup_name", "")
        dropoff_name = event.get("dropoff_name", "")
        pickup_notes  = (event.get("pickup_notes")  or "").strip()
        dropoff_notes = (event.get("dropoff_notes") or "").strip()
        laundry_name = event.get("laundry_name", "")
        start_str, end_str = time_interval.split("-")
        start_str = start_str.strip()
        end_str = end_str.strip()
        local_tz = pytz.timezone(timezone)
        pickup_start = local_tz.localize(datetime.strptime(f"{delivery_date} {start_str}", "%Y-%m-%d %H:%M"))
        pickup_end = local_tz.localize(datetime.strptime(f"{delivery_date} {end_str}", "%Y-%m-%d %H:%M"))
        pickup_ready_dt = pickup_start.astimezone(pytz.utc).isoformat()
        pickup_deadline_dt = pickup_end.astimezone(pytz.utc).isoformat()
        print("QUOTE ADDRESSES:")
        print("pickup_address:", pickup_address)
        print("dropoff_address:", dropoff_address)

        shop_pdi = (creds.get("pickupDropoffInstructions") or "").strip()

        if type_order == "laundryPickup":
            # Customer → Store; if dropoff notes empty, use shop instructions
            if not dropoff_notes and shop_pdi:
                dropoff_notes = shop_pdi
        elif type_order == "laundryDropoff":
            # Store → Customer; if pickup notes empty, use shop instructions
            if not pickup_notes and shop_pdi:
                pickup_notes = shop_pdi

        quote_id = create_quote(
            token, creds["customerId"], creds["baseUrl"],
            pickup_address, dropoff_address, pickup_phone, dropoff_phone, external_store_id, pickup_ready_dt, pickup_deadline_dt, type_order
        )
        print("SCHEDULE ADDRESSES:")
        print("pickup_address:", pickup_address)
        print("dropoff_address:", dropoff_address)

        result = schedule_delivery(
            token, creds["customerId"], creds["baseUrl"], quote_id,
            pickup_address, dropoff_address, pickup_phone, dropoff_phone,
            external_store_id, external_id, delivery_date, time_interval,
            timezone, laundry_bags_qty, pickup_name, dropoff_name, pickup_notes, 
            laundry_name, uber_env, pickup_ready_dt, pickup_deadline_dt, type_order, dropoff_notes
        )
        # update the details based on type_order in orders table
        # Build Uber delivery info to update
        uber_info = {
            "deliveryId": result.get("id"),
            "quoteId": result.get("quote_id"),
            "status": result.get("status"),
            "feeCents": result.get("fee", 0),
            "currency": result.get("currency", "usd"),
            # "pickupReady": result.get("pickup_ready"),
            # "pickupDeadline": result.get("pickup_deadline"),
            # "dropoffReady": result.get("dropoff_ready"),
            # "dropoffDeadline": result.get("dropoff_deadline"),
            # "pickupEta": result.get("pickup_eta"),
            # "dropoffEta": result.get("dropoff_eta"),
            "trackingUrl": result.get("tracking_url")
        }

        # Update the LaundryOrders record
        if type_order not in ["laundryPickup", "laundryDropoff"]:
            raise ValueError("Invalid 'type' in event. Must be either 'laundryPickup' or 'laundryDropoff'.")

        response = orders_table.get_item(Key={"orderId": external_id})
        order_item = response.get("Item", {})

        if "uberInfo" not in order_item:
            orders_table.update_item(
                Key={"orderId": external_id},
                UpdateExpression="SET uberInfo = :emptyMap",
                ExpressionAttributeValues={
                    ":emptyMap": {}
                }
            )
        
        orders_table.update_item(
            Key={"orderId": external_id},
            UpdateExpression="SET uberInfo.#type = :info",
            ExpressionAttributeNames={
                "#type": type_order  
            },
            ExpressionAttributeValues={
                ":info": uber_info
            }
        )
        # ✅ Conditionally update pickupService or dropoffService to "Uber"
        service_field = "pickupService" if type_order == "laundryPickup" else "dropoffService"
        current_service = order_item.get(service_field)

        if current_service is None or current_service != "Uber":
            logger.info(f"Updating {service_field} to 'Uber' for orderId: {external_id}")
            orders_table.update_item(
                Key={"orderId": external_id},
                UpdateExpression=f"SET {service_field} = :svc",
                ExpressionAttributeValues={":svc": "Uber"}
            )
        else:
            logger.info(f"{service_field} already set to '{current_service}' — no update needed.")

        # === Read order for frequency checks ===
        order_proj = orders_table.get_item(
            Key={"orderId": external_id},
            ProjectionExpression="autoGenerated, customerId, addressId, #freq, pickupService, dropoffService",
            ExpressionAttributeNames={"#freq": "frequency"}
        )
        ord_item = order_proj.get("Item") or {}
        auto_generated = ord_item.get("autoGenerated", False)
        ord_freq = ord_item.get("frequency")      # 'Weekly' | 'BiWeekly' | None
        ord_customer_id = ord_item.get("customerId")
        ord_address_id = ord_item.get("addressId")

        # Compute which flag to touch based on type_order
        # We pass only the side that was scheduled; the other side stays None (no change).
        if type_order == "laundryPickup":
            freq_pickup_service = "Uber"
            freq_dropoff_service = None
        else:  # "laundryDropoff"
            freq_pickup_service = None
            freq_dropoff_service = "Uber"

        # === Update LaundryFrequency flags when auto-generated or Weekly/BiWeekly
        freq_update = {"status": "skipped"}
        if (auto_generated or ord_freq in ("Weekly", "BiWeekly")) and ord_customer_id and ord_address_id:
            freq_update = _update_frequency_flags(
                ord_customer_id,
                ord_address_id,
                pickup_service=freq_pickup_service,
                dropoff_service=freq_dropoff_service
            )
            logger.info(f"Frequency flags updated: {freq_update}")
        else:
            logger.info(
                f"Skipping frequency flags: autoGenerated={auto_generated}, frequency={ord_freq}, "
                f"customerId={ord_customer_id}, addressId={ord_address_id}"
            )

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Uber delivery scheduled and order updated.", "result": result})
        }

    except KeyError as ke:
        logger.error("Missing credential key: %s", str(ke))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Missing key in credentials: {str(ke)}"})
        }

    except ValueError as ve:
        logger.warning("Invalid input: %s", str(ve))
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(ve)})
        }

    except Exception as e:
        logger.exception("Failed to schedule Uber delivery:")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Unexpected error while scheduling Uber order: {str(e)}"})
        }
