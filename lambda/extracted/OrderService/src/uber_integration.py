import json
import boto3
import uuid
import logging
from decimal import Decimal, InvalidOperation
from botocore.exceptions import ClientError
from enum import Enum
from utils import fetch_laundry_info, generate_order_id, get_current_timestamp
from order_payments import capture_product_store_payment, create_payment_hold, handle_rollback, cancel_payment_intent, capture_store_payment, invoke_refund_payment, store_save_card
from order_frequency import handle_frequency_logic, cancel_recurring_order
from order_notifications import send_notification, send_cancellation_notification, send_commercial_order_notification
from publish_metric import publish_order_metric
import os, requests, datetime, calendar
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
UBER_LAMBDA_NAME = "UberIntegration"

# Order Status Enum class
class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"  # Laundry Order submitted by the customer
    ORDER_PICKED_UP = "OrderPickedUp"  # Laundry Order has been picked up from the customer’s location
    READY_FOR_INTAKE = "ReadyForIntake"  # Laundry Order is ready to be processed at the facility
    RECEIVED = "ReceivedAtFacility"  # Laundry Order has been received at the processing facility
    PROCESSING_STARTED = "ProcessingStarted"  # Laundry Order Processing has started
    PROCESSING_COMPLETED = "ProcessingCompleted"  # Laundry Order Processing done
    EN_ROUTE_TO_DELIVERY = 'EnRouteToDelivery'  # Laundry on its way to Customer
    DELIVERED = "Delivered"  # Laundry Delivered to Customer
    ORDER_CANCELED = "OrderCanceled"  # Laundry Order Canceled by the Customer


# Payment Status Enum class
class PaymentStatus(Enum):
    PAYMENT_INITIATED = 'Unpaid'
    PAYMENT_SUCCESS = 'Paid'


# Order Type Enum class
class OrderType(Enum):
    INSTORE = 'InStore'
    ONLINE = 'Online'


# Enum for Laundry Products Order Attributes
class LaundryProductsOrderAttributes(Enum):
    ORDER_ID = "productOrderId"  # Maps to 'ProductsOrderId' in DynamoDB
    LAUNDRY_ID = "laundryId"
    ITEMS_SOLD = "itemsSold"
    TOTAL_PRICE = "totalPrice"
    CREATED_DATETIME = "createdAt"
    PAYMENT_METHOD = "paymentMethod"
    PAYMENT_INTENT_ID = "paymentIntentId"

# Enum for the Laundry Order Status
class OrderStatusCategory(Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


def _invoke_uber_delivery(quote_id, order_id, delivery_details, pickup_ts_iso):
    event = {
        "httpMethod": "POST",
        "requestContext": {"http": {"path": "/delivery"}},
        "body": json.dumps({
            "quote_id": quote_id,
            "orderId":  order_id,
            "pickup_time": pickup_ts_iso,
            "delivery_details": delivery_details
        }),
        "isBase64Encoded": False
    }
    logger.debug("Delivery Event => %s", event)

    resp = lambda_client.invoke(
        FunctionName="UberIntegration",
        InvocationType="RequestResponse",
        Payload=json.dumps(event)
    )

    raw = resp["Payload"].read()
    logger.debug("Raw delivery response => %s", raw)

    try:
        outer = json.loads(raw)
        body  = outer.get("body", outer)
        data  = json.loads(body) if isinstance(body, str) else body
    except Exception:
        # fallback: plain-text error from Integration
        data = {"error": raw.decode() if isinstance(raw, bytes) else raw}
    logger.info("Parsed delivery_response => %s", data)
    return data


def _invoke_uber_quote(pickup_address, dropoff_address, pickup_ts_iso):
    payload = {
        "pickup_address": pickup_address,
        "dropoff_address": dropoff_address,
        "pickup_time": pickup_ts_iso   # ✅ Send only this to schedule
    }
    logger.info("Sending Uber quote payload: %s", json.dumps(payload))
    
    event = {
        "httpMethod": "POST",
        "requestContext": {"http": {"path": "/quote"}},
        "body": json.dumps(payload),
        "isBase64Encoded": False
    }
    
    logger.debug("Quote Event => %s", event)
    
    resp = lambda_client.invoke(
        FunctionName="UberIntegration",
        InvocationType="RequestResponse",
        Payload=json.dumps(event)
    )
    
    logger.debug("quote resp  => %s", resp)
    
    raw = resp['Payload'].read()
    logger.debug("Raw quote response => %s", raw)
    
    result = json.loads(raw)
    data = json.loads(result['body']) if 'body' in result else result
    logger.info("Parsed quote_response => %s", data)
    
    return data

def format_address(address_dict):
    return f"{address_dict.get('street', '')}, {address_dict.get('city', '')}, " \
           f"{address_dict.get('state', '')} {address_dict.get('zipCode', '')}, {address_dict.get('country', '')}"

def interval_to_window(date_str: str, interval: str):
    # Extract start and end from interval
    start_str, end_str = [t.strip() for t in interval.split("-")]

    # Convert to datetime with CST zone (DST-aware)
    dt_start = datetime.strptime(f"{date_str} {start_str}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("America/Chicago"))
    dt_end = datetime.strptime(f"{date_str} {end_str}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("America/Chicago"))

    return dt_start.isoformat(), dt_end.isoformat()

def uber_place_order_new(event):
    logger.info("Processing online place_order")
    logger.info("received online payload", event)
    payment_intent_id = None
    frequency_id = None
    laundry_id = None
    try:
        # Extract parameters
        customer_id = event.get('customerId')
        new_address = event.get('address')
        address_instructions = event.get('addressInstructions')
        door_number = event.get('doorNumber')
        laundry_id = event.get('laundryId')
        special_instructions = event.get('specialInstructions')
        order_total_cost = event.get('totalCost')
        order_sub_total = event.get('subTotal', 0)
        order_grand_total = event.get('grandTotal', 0)
        save_special_instructions = event.get('saveSpecialInstructions', False)
        if isinstance(save_special_instructions, str):
            save_special_instructions = save_special_instructions.lower() == 'true'
        services = event.get('services')
        pickup_date = event.get('pickupDate')
        pickup_time_interval = event.get('pickupTimeInterval')
        dropoff_date = event.get('dropoffDate')
        dropoff_time_interval = event.get('dropoffTimeInterval')
        frequency = event.get('frequency') or None  # empty string → NULL for frequency_enum
        laundry_bags = event.get('laundryBags', 1)
        tip_data = event.get('tip', {})
        coupon = event.get('coupon')
        cancelReason = ""
        pickup_service = event.get('pickupService', '')
        delivery_service = event.get('dropoffService', '')
        uber_pickup_frequency = event.get('uberPickupFrequency')
        uber_dropoff_frequency = event.get('uberDropoffFrequency')

        if not customer_id or not new_address or not services or not laundry_id:
            logger.error("Missing required parameters in place_order")
            return {'status': 'error', 'message': 'Missing required parameters'}

        order_status = OrderStatus.ORDER_SUBMITTED.value
        payment_status = PaymentStatus.PAYMENT_INITIATED.value
        order_type = OrderType.ONLINE.value
        current_time = get_current_timestamp()
        laundry_bags = Decimal(str(laundry_bags))
        order_status_type = OrderStatusCategory.ACTIVE.value

        logger.info(f"Retrieving customer record for customerId: {customer_id}")
        cur = db.get_cursor()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number,
                   c.special_instructions,
                   cpp.stripe_customer_id AS payment_method_id,
                   json_agg(json_build_object(
                       'addressId', ca.address_id,
                       'address', ca.address,
                       'addressInstructions', ca.address_instructions,
                       'doorNumber', ca.door_number
                   )) FILTER (WHERE ca.address_id IS NOT NULL) AS addresses
            FROM shop.customers c
            LEFT JOIN shop.customer_payment_profiles cpp
              ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
            LEFT JOIN shop.customer_addresses ca
              ON ca.customer_id = c.customer_id AND ca.is_active = TRUE
            WHERE c.customer_id = %s
            GROUP BY c.customer_id, cpp.stripe_customer_id
        """, (laundry_id, customer_id))
        customer_row = cur.fetchone()
        if not customer_row:
            return {'status': 'error', 'message': 'Customer does not exist'}

        payment_method_id = customer_row["payment_method_id"] or ''
        addresses = customer_row["addresses"] or []
        # Build a customer dict compatible with send_notification
        customer = {
            'firstName': customer_row["first_name"],
            'lastName': customer_row["last_name"],
            'phoneNumber': customer_row["phone_number"],
            'specialInstructions': customer_row["special_instructions"],
            'addresses': addresses,
            'notification_preferences': {'email': True, 'phone': True},
        }

        if not payment_method_id:
            logger.error("Payment method not found for given laundry_id")
            return {'status': 'error', 'message': 'Please add a new card to place an order'}

        if save_special_instructions:
            cur.execute("UPDATE shop.customers SET special_instructions = %s WHERE customer_id = %s",
                        (special_instructions, customer_id))

        address_id = None
        actual_address = new_address
        for addr in addresses:
            if addr.get('address') == new_address:
                address_id = addr.get('addressId')
                if not address_instructions:
                    address_instructions = addr.get('addressInstructions', '')
                actual_address = addr['address']
                break

        if not address_id:
            address_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO shop.customer_addresses
                    (address_id, customer_id, address, door_number, address_instructions)
                VALUES (%s,%s,%s,%s,%s)
            """, (address_id, customer_id, new_address, door_number, address_instructions))
            actual_address = new_address

        for service in services:
            try:
                service['weightOrCount'] = Decimal(str(service['weightOrCount']))
                service['servicePrice'] = Decimal(str(service['servicePrice']))
                logger.info(f"Processed service: {service}")
            except Exception as e:
                logger.error(f"Error processing service: {service} - {str(e)}")
                return {'status': 'error', 'message': f"Invalid service data: {service}"}

        hold_response = create_payment_hold(payment_method_id, laundry_id,
                                            description=f'Online laundry:{laundry_id} customerId:{customer_id}')
        if hold_response['status'] != 'success':
            logger.error(f"Payment hold failed: {hold_response}")
            return {'status': 'error', 'message': 'Failed to create payment hold'}

        payment_intent_id = hold_response.get('paymentIntentId', '')
        if not payment_intent_id:
            logger.error("PaymentIntentId not retrieved")
            return {'status': 'error', 'message': 'Failed to retrieve paymentIntentId'}

        try:
            tip_amount = Decimal(str(tip_data.get('tipAmount', '0.00')))
        except (InvalidOperation, TypeError) as e:
            logger.error(f"Error converting tipAmount: {str(e)}")
            tip_amount = Decimal('0.00')
        tip_data_payload = {
            'tipAmount': tip_amount,
            'tipPercentage': tip_data.get('tipPercentage'),
            'tipType': tip_data.get('tipType'),
            'tipReceiverId': tip_data.get('tipReceiverId'),
            'tipMethod': 'Card',
        }

        try:
            total_cost = Decimal(str(order_total_cost)).quantize(Decimal('0.01'))
            sub_total = Decimal(str(order_sub_total)).quantize(Decimal('0.01'))
            grand_total = Decimal(str(order_grand_total)).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError) as e:
            logger.warning(f"Invalid totalCost : {e}")
            total_cost = Decimal(1.00)
            sub_total = Decimal(1.00)
            grand_total = Decimal(1.00)

        if frequency:
            updated_frequency_id = handle_frequency_logic(
                customer_id=customer_id, laundry_id=laundry_id, address_id=address_id,
                frequency_id=None, services=services,
                pickup_date=pickup_date, pickup_time_interval=pickup_time_interval,
                dropoff_time_interval=dropoff_time_interval,
                special_instructions=special_instructions,
                frequency=frequency, laundry_bags=laundry_bags, tip=tip_data_payload, coupon=coupon,
                uber_pickup_frequency=uber_pickup_frequency,
                uber_dropoff_frequency=uber_dropoff_frequency
            )

        order_id = generate_order_id("O-")

        # Insert order into PostgreSQL
        db.set_emp_id(None)
        cur.execute("""
            INSERT INTO orders.orders (
                order_id, laundry_id, customer_id, address_id,
                order_type, order_status, status_category, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, total_cost, grand_total,
                frequency, auto_generated, is_reviewed, cancel_reason,
                hold_payment_intent_id, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,'Online',%s,'Active',%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,FALSE,FALSE,'',%s,NOW(),NOW()
            )
        """, (
            order_id, laundry_id, customer_id, address_id,
            order_status, payment_status,
            pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
            int(laundry_bags), special_instructions, coupon,
            float(sub_total), float(total_cost), float(grand_total),
            frequency, payment_intent_id,
        ))

        for svc in services:
            cur.execute("""
                INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, svc.get('serviceName'), float(svc.get('servicePrice', 0)), float(svc.get('weightOrCount', 0))))

        if float(tip_data_payload.get('tipAmount', 0)) > 0:
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                VALUES (%s,%s,%s,%s,%s) ON CONFLICT (order_id) DO NOTHING
            """, (order_id, float(tip_data_payload['tipAmount']), tip_data_payload.get('tipPercentage'),
                  tip_data_payload.get('tipType'), tip_data_payload.get('tipMethod')))

        db.commit()
        logger.info(f"Order placed successfully. Order ID: {order_id}")
        customer_address_uber  = actual_address
        laundry_info = fetch_laundry_info(laundry_id)
        laundry_address_map = laundry_info.get('laundryAddress', {})
        laundry_name = laundry_info.get('laundryName', {})
        laundry_address = f"{laundry_address_map.get('street', '')}, " \
                            f"{laundry_address_map.get('city', '')}, " \
                            f"{laundry_address_map.get('state', '')} " \
                            f"{laundry_address_map.get('zipCode', '')}, " \
                            f"{laundry_address_map.get('country', '')}"
        customer_full_name = f"{customer.get('firstName','')} {customer.get('lastName','')}".strip()
        customer_phone = customer.get("phoneNumber")
        laundry_contact_details = laundry_info.get('contactDetails', {})
        laundry_email = laundry_contact_details.get('email', 'N/A')
        laundry_phone = laundry_contact_details.get('phoneNumber', 'N/A')
        laundry_instructions = laundry_info.get('pickupDropoffInstructions', 'N/A')
        print("laundry_instructions is:", laundry_instructions)
        if pickup_service == "Uber":
            # Format delivery_date and time_interval
            pickup_date_str = str(pickup_date)  # ensure string
            pickup_time_interval = str(pickup_time_interval)
            logger.info("[UBER] Pickup leg using: pickup_address=%s | dropoff_address=%s", customer_address_uber, laundry_address)
            # Construct payload
            uber_lambda_payload = {
                "operation": "schedule-uber-order",
                "laundry_id": laundry_id,
                "uberEnv": laundry_info.get('uberEnv', {}),  
                "pickup_address": customer_address_uber,
                "dropoff_address": laundry_address,
                "pickup_phone": customer_phone,
                "dropoff_phone": laundry_phone,
                "order_id": order_id,
                "delivery_date": pickup_date_str,
                "time_interval": pickup_time_interval,
                "laundry_bags_qty": int(laundry_bags),
                "type": "laundryPickup",
                "pickup_name": customer_full_name,
                "dropoff_name": laundry_name, 
                "pickup_notes": address_instructions, 
                "dropoff_notes": laundry_instructions, 
                "laundry_name":laundry_name
            }

            logger.info("[UBER] Invoking UberIntegration Lambda for laundryPickup with: %s", json.dumps(uber_lambda_payload))

            try:
                response = lambda_client.invoke(
                    FunctionName=UBER_LAMBDA_NAME,
                    InvocationType='RequestResponse',
                    Payload=json.dumps(uber_lambda_payload).encode()
                )

                raw_payload = json.load(response['Payload'])
                logger.info("[UBER] UberIntegration raw response: %s", json.dumps(raw_payload))

                status_code = raw_payload.get("statusCode", 500)
                body_str = raw_payload.get("body", "{}")
                body = json.loads(body_str)

                if status_code != 200 or body.get("message") != "Uber delivery scheduled and order updated.":
                    logger.warning("[UBER] Pickup Uber order not processed. Defaulting to LaundryDriver.")
                    cur2 = db.get_cursor()
                    cur2.execute("UPDATE orders.orders SET pickup_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))
                    db.commit()


            except Exception as e:
                logger.exception("[UBER] Failed to invoke UberIntegration Lambda for laundryPickup")
        
        if delivery_service == "Uber":
            # Format delivery_date and time_interval
            dropoff_date_str = str(dropoff_date)  # ensure string
            dropoff_time_interval = str(dropoff_time_interval)
            logger.info("[UBER] Dropoff leg using: pickup_address=%s | dropoff_address=%s",
            laundry_address, customer_address_uber)
            # Construct payload
            uber_lambda_payload = {
                "operation": "schedule-uber-order",
                "laundry_id": laundry_id,
                "uberEnv": laundry_info.get('uberEnv', {}),  
                "pickup_address": laundry_address,
                "dropoff_address": customer_address_uber,
                "pickup_phone": laundry_phone,
                "dropoff_phone": customer_phone,
                "order_id": order_id,
                "delivery_date": dropoff_date_str,
                "time_interval": dropoff_time_interval,
                "laundry_bags_qty": int(laundry_bags),
                "type": "laundryDropoff",
                "pickup_name":laundry_name,
                "dropoff_name":customer_full_name, 
                "pickup_notes": laundry_instructions, 
                "dropoff_notes":address_instructions,
                "laundry_name":laundry_name
            }

            logger.info("[UBER] Invoking UberIntegration Lambda for laundryDropoff with: %s", json.dumps(uber_lambda_payload))

            try:
                response = lambda_client.invoke(
                    FunctionName=UBER_LAMBDA_NAME,
                    InvocationType='RequestResponse',
                    Payload=json.dumps(uber_lambda_payload).encode()
                )

                raw_payload = json.load(response['Payload'])
                logger.info("[UBER] UberIntegration raw response: %s", json.dumps(raw_payload))

                status_code = raw_payload.get("statusCode", 500)
                body_str = raw_payload.get("body", "{}")
                body = json.loads(body_str)

                if status_code != 200 or body.get("message") != "Uber delivery scheduled and order updated.":
                    logger.warning("[UBER] Dropoff Uber order not processed. Defaulting to LaundryDriver.")
                    cur2 = db.get_cursor()
                    cur2.execute("UPDATE orders.orders SET dropoff_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))
                    db.commit()

            except Exception as e:
                logger.exception("[UBER] Failed to invoke UberIntegration Lambda for laundryDropoff")

        return {'status': 'success', 'orderId': order_id}

    except Exception as e:
        logger.exception(f"Error in place_order: {str(e)}")
        publish_order_metric("FailedOrders", order_type="Online", customer_id=customer_id, laundry_id=laundry_id,
                             status="failed")
        handle_rollback(frequency_id, payment_intent_id, laundry_id)
        return {'status': 'error', 'message': f"An error occurred while placing the order: {str(e)}"}
