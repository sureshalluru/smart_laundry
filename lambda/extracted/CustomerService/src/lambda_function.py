import json
import logging
import boto3
import base64
import datetime
import urllib.parse
from decimal import Decimal
from botocore.exceptions import ClientError
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')


# ── helpers ───────────────────────────────────────────────────────────────────

def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj


# ── customer queries ──────────────────────────────────────────────────────────

def get_customer_information(customer_id):
    logger.info("get_customer_information: customer_id=%s", customer_id)
    try:
        cur = db.get_cursor()

        cur.execute("""
            SELECT c.customer_id, c.email, c.first_name, c.last_name,
                   c.phone_number, c.notif_email, c.notif_sms, c.notif_phone,
                   c.special_instructions
            FROM shop.customers c
            WHERE c.customer_id = %s
        """, (customer_id,))
        customer = cur.fetchone()
        if not customer:
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Customer not found"})}

        cur.execute("""
            SELECT address_id, address, door_number, address_instructions
            FROM shop.customer_addresses
            WHERE customer_id = %s AND is_active = TRUE
        """, (customer_id,))
        addresses = [db.serialize_row(r) for r in cur.fetchall()]

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
        frequency_details = [db.serialize_row(r) for r in cur.fetchall()]

        return {
            "statusCode": 200,
            "body": json.dumps({
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
            }, default=str)
        }
    except Exception as e:
        logger.exception("get_customer_information error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def get_customer_details(customer_id):
    logger.info("get_customer_details: customer_id=%s", customer_id)
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT customer_id, email, first_name, last_name, phone_number,
                   special_instructions, notif_email, notif_sms, notif_phone
            FROM shop.customers WHERE customer_id = %s
        """, (customer_id,))
        customer = cur.fetchone()
        if not customer:
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Customer not found"})}

        cur.execute("""
            SELECT address_id, address, door_number, address_instructions
            FROM shop.customer_addresses WHERE customer_id = %s AND is_active = TRUE
        """, (customer_id,))
        addresses = [db.serialize_row(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT laundry_id, stripe_customer_id
            FROM shop.customer_payment_profiles WHERE customer_id = %s
        """, (customer_id,))
        payment_ids = {r["laundry_id"]: r["stripe_customer_id"] for r in cur.fetchall()}

        return {
            "statusCode": 200,
            "body": {
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
            }
        }
    except Exception as e:
        logger.exception("get_customer_details error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def show_all_customers(laundry_id, last_evaluated_key=None, batch_size=20):
    try:
        cur = db.get_cursor()
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
            addresses = [db.serialize_row(a) for a in cur.fetchall()]

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
        return {
            "statusCode": 200,
            "body": convert_decimal({
                "status": "success",
                "customers": customers,
                "pagination": {
                    "batchSize": batch_size,
                    "lastEvaluatedKey": next_offset,
                    "hasMore": next_offset is not None,
                }
            })
        }
    except Exception as e:
        logger.exception("show_all_customers error")
        return {"statusCode": 500, "body": {"status": "error", "message": str(e)}}


def update_notification_preferences(customer_id, notification_preferences):
    try:
        cur = db.get_cursor()
        cur.execute("SELECT customer_id FROM shop.customers WHERE customer_id = %s", (customer_id,))
        if not cur.fetchone():
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Customer not found"})}

        cur.execute("""
            UPDATE shop.customers
            SET notif_email = %s, notif_sms = %s, notif_phone = %s, updated_at = NOW()
            WHERE customer_id = %s
        """, (
            notification_preferences.get("email", True),
            notification_preferences.get("sms", True),
            notification_preferences.get("phone", False),
            customer_id,
        ))
        db.commit()
        return {"statusCode": 200, "body": json.dumps({"status": "success", "message": "Notification preferences updated"})}
    except Exception as e:
        db.rollback()
        logger.exception("update_notification_preferences error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def get_order_details(customer_id, laundry_id, limit, last_evaluated_key):
    try:
        cur = db.get_cursor()
        offset = 0
        if last_evaluated_key:
            try:
                offset = int(json.loads(last_evaluated_key) or 0)
            except Exception:
                offset = 0

        cur.execute("""
            SELECT order_id, order_type, created_at, total_cost, order_status, payment_status
            FROM orders.orders
            WHERE customer_id = %s AND laundry_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """, (customer_id, laundry_id, limit, offset))
        rows = [db.serialize_row(r) for r in cur.fetchall()]

        next_key = json.dumps(offset + limit) if len(rows) == limit else None
        return {
            "statusCode": 200,
            "body": {"status": "success", "data": rows, "lastKey": next_key}
        }
    except Exception as e:
        logger.exception("get_order_details error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def get_order_by_id(order_id, customer_id):
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
            FROM orders.orders o
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.order_id = %s
        """, (order_id,))
        order = cur.fetchone()
        if not order:
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Order not found"})}

        if order["customer_id"] != customer_id:
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Order does not exist for this customer"})}

        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (order_id,))
        services = [db.serialize_row(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (order_id,))
        payments = [db.serialize_row(r) for r in cur.fetchall()]

        # address
        address_data = {}
        if order["address_id"]:
            cur.execute("""
                SELECT address, address_instructions, door_number
                FROM shop.customer_addresses WHERE address_id = %s
            """, (order["address_id"],))
            addr = cur.fetchone()
            if addr:
                address_data = dict(addr)

        tip = {
            "tipAmount": float(order["tip_amount"] or 0),
            "tipPercentage": float(order["tip_percentage"]) if order["tip_percentage"] else None,
            "tipType": order["tip_type"],
            "tipMethod": order["tip_method"],
            "tipReceiverId": order["tip_receiver_id"],
        }

        result = {
            "orderId": order["order_id"],
            "customerId": order["customer_id"],
            "autoGenerated": order["auto_generated"],
            "coupon": order["coupon"],
            "pickupDate": db.serialize(order["pickup_date"]),
            "dropoffDate": db.serialize(order["dropoff_date"]),
            "addressId": order["address_id"],
            "dropoffTimeInterval": order["dropoff_time_interval"],
            "pickupTimeInterval": order["pickup_time_interval"],
            "services": services,
            "createdAt": db.serialize(order["created_at"]),
            "specialInstructions": order["special_instructions"],
            "totalCost": float(order["total_cost"]),
            "paymentStatus": order["payment_status"],
            "orderStatus": order["order_status"],
            "laundryBags": order["laundry_bags"],
            "finalPaymentIntentId": payments,
            "tip": tip,
            "orderType": order["order_type"],
            "discountedPrice": float(order["discounted_price"]),
            "isReviewed": order["is_reviewed"],
            "address": address_data.get("address", ""),
            "addressInstructions": address_data.get("address_instructions", ""),
            "doorNumber": address_data.get("door_number", ""),
        }
        return {"statusCode": 200, "body": {"status": "success", "data": result}}
    except Exception as e:
        logger.exception("get_order_by_id error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def delete_address(customer_id, address_id):
    try:
        cur = db.get_cursor()
        # Check if address has an active frequency
        cur.execute("""
            SELECT frequency_id FROM orders.laundry_frequency
            WHERE address_id = %s AND is_active = TRUE LIMIT 1
        """, (address_id,))
        if cur.fetchone():
            return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "This address cannot be deleted because recurring order exists."})}

        cur.execute("""
            UPDATE shop.customer_addresses SET is_active = FALSE
            WHERE address_id = %s AND customer_id = %s
        """, (address_id, customer_id))
        if cur.rowcount == 0:
            return {"statusCode": 404, "body": json.dumps({"status": "error", "message": "Address not found"})}

        db.commit()
        return {"statusCode": 200, "body": json.dumps({"status": "success", "message": "Address deleted successfully"})}
    except Exception as e:
        db.rollback()
        logger.exception("delete_address error")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}


def create_review(order_id, customer_id, laundry_id, employee_id, employee_rating, order_date, review_comment, image):
    try:
        image_url = None
        if image:
            image_bytes = base64.b64decode(image)
            image_key = f"laundry-review-images/{laundry_id}/images/{order_id}.jpg"
            s3.put_object(Bucket='laundry-review-images', Key=image_key, Body=image_bytes, ContentType='image/jpeg')
            image_url = f"https://laundry-review-images.s3.amazonaws.com/{image_key}"

        cur = db.get_cursor()

        # Insert review into orders.order_reviews
        cur.execute("""
            INSERT INTO orders.order_reviews
                (laundry_id, emp_id, order_id, customer_id,
                 order_date, employee_rating, review_comment, photo_url, review_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (order_id) DO UPDATE SET
                employee_rating = EXCLUDED.employee_rating,
                review_comment  = EXCLUDED.review_comment,
                photo_url       = EXCLUDED.photo_url,
                review_date     = NOW()
        """, (
            laundry_id, employee_id, order_id, customer_id,
            order_date, float(employee_rating), review_comment, image_url,
        ))

        # Mark order as reviewed
        cur.execute("UPDATE orders.orders SET is_reviewed = TRUE WHERE order_id = %s", (order_id,))

        # Update employee avg rating
        cur.execute("""
            SELECT avg_rating, total_reviews FROM shop.employees
            WHERE emp_id = %s AND laundry_id = %s
        """, (employee_id, laundry_id))
        emp = cur.fetchone()
        if emp:
            total       = int(emp["total_reviews"] or 0) + 1
            current_avg = float(emp["avg_rating"] or 0)
            new_rating  = float(employee_rating)
            new_avg     = round(((current_avg * (total - 1)) + new_rating) / total, 1)
            cur.execute("""
                UPDATE shop.employees
                SET avg_rating = %s, total_reviews = %s, updated_at = NOW()
                WHERE emp_id = %s AND laundry_id = %s
            """, (new_avg, total, employee_id, laundry_id))

        db.commit()
        return {"status": "success", "message": "Review submitted successfully", "imageUrl": image_url}
    except Exception as e:
        db.rollback()
        logger.exception("create_review error")
        return {"status": "error", "message": str(e)}


# ── lambda handler ────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info("lambda_handler invoked: %s", event)
    params = event.get('queryStringParameters', {}) or {}
    body = event.get('body', '{}')
    if isinstance(body, str):
        body = json.loads(body)

    try:
        operation = params.get('operation')

        if operation == 'getCustomerInformation':
            customer_id = params.get('customerId')
            if not customer_id:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing customerId"})}
            return get_customer_information(customer_id)

        elif operation == 'getOrderDetails':
            customer_id = params.get('customerId')
            laundry_id = params.get('laundryId')
            if not customer_id or not laundry_id:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing customerId or laundryId"})}
            return get_order_details(customer_id, laundry_id, 30, params.get('lastKey'))

        elif operation == 'getCustomerOrderInfo':
            order_id = params.get('orderId')
            customer_id = params.get('customerId')
            if not order_id or not customer_id:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing orderId or customerId"})}
            return get_order_by_id(order_id, customer_id)

        elif operation == 'updateNotificationPreferences':
            customer_id = params.get('customerId')
            try:
                notif_prefs = json.loads(params.get('notificationPreferences', '{}'))
            except json.JSONDecodeError:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Invalid notificationPreferences format"})}
            if not customer_id or not notif_prefs:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing customerId or notificationPreferences"})}
            return update_notification_preferences(customer_id, notif_prefs)

        elif operation == 'deleteCustomerAddress':
            customer_id = params.get('customerId')
            address_id = params.get('addressId')
            if not customer_id or not address_id:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing customerId or addressId"})}
            return delete_address(customer_id, address_id)

        elif operation == 'showAllCustomers':
            batch_size = min(int(params.get('batchSize', 50)), 100)
            last_key = None
            if params.get('lastEvaluatedKey'):
                try:
                    last_key = json.loads(urllib.parse.unquote(params['lastEvaluatedKey']))
                except Exception:
                    last_key = None
            laundry_id = params.get('laundryId')
            return show_all_customers(laundry_id, last_key, batch_size)

        elif operation == 'getCustomerDetailsForAdmin':
            customer_id = params.get('customerId')
            if not customer_id:
                return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Missing customerId"})}
            return get_customer_details(customer_id)

        elif operation == 'createReview':
            result = create_review(
                body.get('orderId'), body.get('customerId'), body.get('laundryId'),
                body.get('employeeId'), body.get('employeeRating'), body.get('orderDate'),
                body.get('reviewComment'), body.get('imageBase64')
            )
            return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps(result)}

        else:
            return {"statusCode": 400, "body": json.dumps({"status": "error", "message": "Unsupported operation"})}

    except Exception as e:
        logger.exception("Unhandled exception")
        return {"statusCode": 500, "body": json.dumps({"status": "error", "message": str(e)})}
