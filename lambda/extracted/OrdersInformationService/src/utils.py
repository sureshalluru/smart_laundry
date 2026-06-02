"""
utils.py — shared helpers for OrdersInformationService.
Migrated from DynamoDB to PostgreSQL.
"""
import json
import logging
import boto3
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')


class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"
    ORDER_PICKED_UP = "OrderPickedUp"
    READY_FOR_INTAKE = "ReadyForIntake"
    RECEIVED = "ReceivedAtFacility"
    PROCESSING_STARTED = "ProcessingStarted"
    PROCESSING_COMPLETED = "ProcessingCompleted"
    EN_ROUTE_TO_DELIVERY = 'EnRouteToDelivery'
    DELIVERED = "Delivered"
    ORDER_CANCELED = "OrderCanceled"


class StatusCategory(Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


def get_current_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_response(status_code, body):
    return {'statusCode': status_code, 'body': body}


def convert_decimals(item):
    if isinstance(item, list):
        return [convert_decimals(i) for i in item]
    elif isinstance(item, dict):
        return {k: convert_decimals(v) for k, v in item.items()}
    elif isinstance(item, Decimal):
        return float(item)
    return item


def round_decimal(value):
    if isinstance(value, Decimal):
        return value.quantize(Decimal('1.00'), rounding=ROUND_HALF_UP)
    return value


def recalc_tip_if_percentage(cost, tip_info):
    if tip_info.get('tipType') == 'percentage':
        pct = tip_info.get('tipPercentage', 0)
        return round(float(cost) * (float(pct) / 100), 2)
    return tip_info.get('tipAmount', 0)


def get_status_category(order_status):
    active = {OrderStatus.ORDER_SUBMITTED.value, OrderStatus.READY_FOR_INTAKE.value,
              OrderStatus.RECEIVED.value, OrderStatus.PROCESSING_STARTED.value,
              OrderStatus.PROCESSING_COMPLETED.value, OrderStatus.EN_ROUTE_TO_DELIVERY.value}
    completed = {OrderStatus.DELIVERED.value, OrderStatus.ORDER_PICKED_UP.value}
    cancelled = {OrderStatus.ORDER_CANCELED.value, "Cancelled", "OrderCanceled"}

    if order_status in active:
        return StatusCategory.ACTIVE.value
    elif order_status in completed:
        return StatusCategory.COMPLETED.value
    elif order_status in cancelled:
        return StatusCategory.CANCELLED.value
    return StatusCategory.ACTIVE.value


def calculate_total_cost(services, products):
    total = Decimal(0)
    for s in services:
        try:
            total += Decimal(str(s.get('servicePrice', 0))) * Decimal(str(s.get('weightOrCount', 0)))
        except Exception:
            continue
    for p in products:
        try:
            total += Decimal(str(p.get('productPrice', 0))) * Decimal(str(p.get('productCount', 0)))
        except Exception:
            continue
    return total


def get_promotion_data(laundry_id, promo_code):
    """Fetch promotion from PostgreSQL."""
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT promotion_id, promo_code, promo_name, description,
                   discount_type, discount_value, apply_on_whole_order,
                   customer_type, minimum_order_value, usage_limit_per_customer,
                   is_online_frequency_promo, linked_frequency,
                   start_date, end_date, is_active
            FROM shop.promotions
            WHERE laundry_id = %s AND promo_code = %s
        """, (laundry_id, promo_code))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        # Normalize keys to match old DynamoDB field names used in promo logic
        return {
            'promotionId': d['promotion_id'],
            'promoCode': d['promo_code'],
            'promoName': d['promo_name'],
            'description': d['description'],
            'discountType': d['discount_type'],
            'discountValue': d['discount_value'],
            'applyOnWholeOrder': d['apply_on_whole_order'],
            'customerType': d['customer_type'],
            'minimumOrderValue': d['minimum_order_value'] or 0,
            'usageLimitPerCustomer': d['usage_limit_per_customer'] or 1,
            'isOnlineFrequencyPromo': d['is_online_frequency_promo'],
            'linkedFrequency': d['linked_frequency'],
            'startDate': str(d['start_date']) if d['start_date'] else None,
            'endDate': str(d['end_date']) if d['end_date'] else None,
            'isActive': d['is_active'],
            'specificServices': [],
        }
    except Exception as e:
        logger.exception("get_promotion_data error")
        return None


def is_promo_active(promo):
    if not promo or not promo.get('isActive'):
        return False
    today = datetime.now(timezone.utc).date()
    start = promo.get('startDate')
    end = promo.get('endDate')
    if start:
        try:
            if today < datetime.strptime(str(start), "%Y-%m-%d").date():
                return False
        except ValueError:
            return False
    if end:
        try:
            if today > datetime.strptime(str(end), "%Y-%m-%d").date():
                return False
        except ValueError:
            return False
    return True


def get_single_order_details(operation, laundry_id, order_id):
    """Fetch a single order with customer details from PostgreSQL."""
    logger.info("get_single_order_details: op=%s laundry=%s order=%s", operation, laundry_id, order_id)
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT o.*,
                   ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
            FROM orders.orders o
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.order_id = %s
        """, (order_id,))
        order = cur.fetchone()
        if not order:
            return 404, {'message': 'Order not found', 'data': None}

        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (order_id,))
        services = [db.serialize_row(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_products WHERE order_id = %s", (order_id,))
        products = [db.serialize_row(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (order_id,))
        payments = [db.serialize_row(r) for r in cur.fetchall()]

        # Laundry name
        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        laundry_name = shop["laundry_name"] if shop else "N/A"

        # Customer details via CustomerService Lambda
        customer_name = "N/A"
        customer_phone = "N/A"
        customer_email = "N/A"
        customer_address = "N/A"
        customer_notification_preference = {}
        customer_payment_id = ""

        if operation in ('active', 'completed', 'getSingleOrder', 'updateOrder', 'internal'):
            customer_id = order["customer_id"]
            try:
                resp = lambda_client.invoke(
                    FunctionName='CustomerService',
                    InvocationType='RequestResponse',
                    Payload=json.dumps({"queryStringParameters": {
                        "operation": "getCustomerDetailsForAdmin", "customerId": customer_id}})
                )
                payload = json.loads(resp['Payload'].read())
                body = payload.get('body', {})
                if isinstance(body, str):
                    body = json.loads(body)
                if payload.get('statusCode') == 200 and body.get('status') == 'success':
                    data = body.get('data', {})
                    customer_name = f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
                    customer_phone = data.get('phoneNumber', 'N/A')
                    customer_email = data.get('email', 'N/A')
                    customer_notification_preference = data.get('notificationPreferences', {})
                    customer_payment_id = data.get('customerPaymentId', {}).get(laundry_id, '')
                    if order["address_id"]:
                        # CustomerService returns camelCase keys (addressId, not address_id)
                        addr = next((a for a in data.get('addresses', [])
                                     if a.get('addressId') == order["address_id"]), None)
                        if addr:
                            customer_address = {
                                'address':             addr.get('address', ''),
                                'doorNumber':          addr.get('doorNumber', ''),
                                'addressInstructions': addr.get('addressInstructions', ''),
                            }
            except Exception as e:
                logger.warning("CustomerService invoke failed: %s", e)

        tip = {
            "tipAmount": float(order["tip_amount"] or 0),
            "tipPercentage": float(order["tip_percentage"]) if order["tip_percentage"] else None,
            "tipType": order["tip_type"],
            "tipMethod": order["tip_method"],
            "tipReceiverId": order["tip_receiver_id"],
        }

        total_paid = sum(float(p.get("amount", 0)) for p in payments)
        grand_total = float(order["grand_total"] or 0)
        balance_due = round(max(0, grand_total - total_paid), 2)

        result = {
            "orderId": order["order_id"],
            "customerId": order["customer_id"],
            "laundryId": order["laundry_id"],
            "addressId": order["address_id"],
            "orderStatus": order["order_status"],
            "statusCategory": order["status_category"],
            "orderType": order["order_type"],
            "paymentStatus": order["payment_status"],
            "services": services,
            "products": products,
            "specialInstructions": order["special_instructions"],
            "laundryBags": order["laundry_bags"],
            "pickupDate": str(order["pickup_date"]) if order["pickup_date"] else None,
            "pickupTimeInterval": order["pickup_time_interval"],
            "dropoffDate": str(order["dropoff_date"]) if order["dropoff_date"] else None,
            "dropoffTimeInterval": order["dropoff_time_interval"],
            "coupon": order["coupon"],
            "finalPaymentIntentId": payments,
            "discountedPrice": float(order["discounted_price"]),
            "subTotal": float(order["sub_total"]),
            "totalCost": float(order["total_cost"]),
            "grandTotal": grand_total,
            "tip": tip,
            "autoGenerated": order["auto_generated"],
            "frequency": order["frequency"],
            "isReviewed": order["is_reviewed"],
            "imageUrl": order["image_url"],
            "holdPaymentIntentId": order["hold_payment_intent_id"],
            "lastUpdatedBy": order["last_updated_by"],
            "createdAt": str(order["created_at"]),
            "updatedAt": str(order["updated_at"]),
            "laundryName": laundry_name,
            "customerName": customer_name,
            "customerPhone": customer_phone,
            "customerEmail": customer_email,
            "customerAddress": customer_address,
            "customerNotification": customer_notification_preference,
            "customer Notification": customer_notification_preference,
            "customerPaymentId": customer_payment_id,
            "balanceDue": balance_due,
            "cancelReason": order["cancel_reason"],
        }
        return 200, result

    except Exception as e:
        logger.exception("get_single_order_details error")
        return 500, {'message': 'Error retrieving order details', 'error': str(e)}


def execute_order_update(order_id, update_expression, expression_values):
    """
    Translates a DynamoDB-style update into a PostgreSQL UPDATE.
    Parses 'SET field = :val' expressions and maps them to SQL.
    """
    cur = db.get_cursor()

    # Map DynamoDB field names → PostgreSQL column names
    field_map = {
        'orderStatus': 'order_status',
        'paymentStatus': 'payment_status',
        'statusCategory': 'status_category',
        'services': None,       # handled via order_services table
        'products': None,       # handled via order_products table
        'totalCost': 'total_cost',
        'subTotal': 'sub_total',
        'grandTotal': 'grand_total',
        'discountedPrice': 'discounted_price',
        'laundryBags': 'laundry_bags',
        'lastUpdatedBy': 'last_updated_by',
        'updatedAt': 'updated_at',
        'coupon': 'coupon',
        'cancelReason': 'cancel_reason',
        'imageUrl': 'image_url',
        'finalPaymentIntentId': None,  # handled via order_payments table
        'tip': None,                   # handled via order_tips table
        'holdPaymentIntentId': 'hold_payment_intent_id',
        'paymentInstructions': None,   # not in schema, skip
        'photoUploadTimestamp': None,
        'deliveryPhotoUploadTimestamp': None,
    }

    sets, vals = [], []

    # Parse "SET field = :val, ..." expression
    set_part = update_expression.replace('SET ', '').strip()
    for clause in set_part.split(','):
        clause = clause.strip()
        if ' = ' not in clause:
            continue
        ddb_field, placeholder = [x.strip() for x in clause.split(' = ', 1)]
        col = field_map.get(ddb_field)
        value = expression_values.get(placeholder)
        logger.debug("[execute_order_update] field=%s col=%s placeholder=%s value_type=%s",
                     ddb_field, col, placeholder, type(value).__name__)

        if col is None:
            # Handle special cases
            if ddb_field == 'tip' and value is not None:
                tip_amount   = float(value.get('tipAmount', 0)) if isinstance(value, dict) else 0
                tip_pct      = value.get('tipPercentage') if isinstance(value, dict) else None
                tip_type     = value.get('tipType') or 'noTip'          # '' → NULL
                tip_method   = value.get('tipMethod') or None        # '' → NULL (enum can't be empty string)
                tip_receiver = value.get('tipReceiverId') or None    # '' → NULL
                cur.execute("""
                    INSERT INTO orders.order_tips
                        (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        tip_amount=EXCLUDED.tip_amount,
                        tip_percentage=EXCLUDED.tip_percentage,
                        tip_type=EXCLUDED.tip_type,
                        tip_method=EXCLUDED.tip_method,
                        tip_receiver_id=EXCLUDED.tip_receiver_id
                """, (order_id, tip_amount, tip_pct, tip_type, tip_method, tip_receiver))

            elif ddb_field == 'services' and value is not None:
                # Collect ids to keep
                ids_to_keep = [svc['id'] for svc in value if 'id' in svc]
                if ids_to_keep:
                    cur.execute("DELETE FROM orders.order_services WHERE order_id = %s AND id NOT IN %s", (order_id, tuple(ids_to_keep)))
                else:
                    cur.execute("DELETE FROM orders.order_services WHERE order_id = %s", (order_id,))
                for svc in value:
                    if 'id' in svc:
                        # Update existing
                        cur.execute("""
                            UPDATE orders.order_services
                            SET service_name = %s, service_price = %s, weight_or_count = %s
                            WHERE id = %s
                        """, (svc.get('serviceName'), float(svc.get('servicePrice', 0)),
                              float(svc.get('weightOrCount', 0)), svc['id']))
                        logger.info("[execute_order_update] Updated service id=%s", svc['id'])
                    else:
                        # Insert new
                        cur.execute("""
                            INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                            VALUES (%s,%s,%s,%s)
                        """, (order_id, svc.get('serviceName'), float(svc.get('servicePrice', 0)),
                              float(svc.get('weightOrCount', 0))))
                        logger.info("[execute_order_update] Inserted new service %s", svc.get('serviceName'))
                # Log count
                cur.execute("SELECT COUNT(*) FROM orders.order_services WHERE order_id = %s", (order_id,))
                count_row = cur.fetchone()
                count = count_row['count'] if count_row else 0
                logger.info("[execute_order_update] After services update, %s services for order_id=%s", count, order_id)

            elif ddb_field == 'products' and value is not None:
                # Collect ids to keep
                ids_to_keep = [prod['id'] for prod in value if 'id' in prod]
                if ids_to_keep:
                    cur.execute("DELETE FROM orders.order_products WHERE order_id = %s AND id NOT IN %s", (order_id, tuple(ids_to_keep)))
                else:
                    cur.execute("DELETE FROM orders.order_products WHERE order_id = %s", (order_id,))
                for prod in value:
                    if 'id' in prod:
                        # Update existing
                        cur.execute("""
                            UPDATE orders.order_products
                            SET product_name = %s, product_price = %s, product_count = %s
                            WHERE id = %s
                        """, (prod.get('productName'), float(prod.get('productPrice', 0)),
                              int(prod.get('productCount', 1)), prod['id']))
                    else:
                        # Insert new
                        cur.execute("""
                            INSERT INTO orders.order_products (order_id, product_name, product_price, product_count)
                            VALUES (%s,%s,%s,%s)
                        """, (order_id, prod.get('productName'), float(prod.get('productPrice', 0)),
                              int(prod.get('productCount', 1))))

            elif ddb_field == 'finalPaymentIntentId' and value is not None:
                payments = value if isinstance(value, list) else [value]
                for p in payments:
                    if isinstance(p, dict) and p.get('paymentIntentId'):
                        cur.execute("""
                            INSERT INTO orders.order_payments
                                (order_id, payment_intent_id, amount, payment_method)
                            VALUES (%s,%s,%s,%s)
                            ON CONFLICT (payment_intent_id) DO NOTHING
                        """, (order_id, p['paymentIntentId'],
                              float(p.get('amount', 0)), p.get('paymentMethod')))
            continue

        if value is not None:
            sets.append(f"{col} = %s")
            vals.append(float(value) if isinstance(value, Decimal) else value)

    if sets:
        # Only add updated_at if the caller didn't already include it
        if not any('updated_at' in s for s in sets):
            sets.append("updated_at = NOW()")
        vals.append(order_id)
        sql = f"UPDATE orders.orders SET {', '.join(sets)} WHERE order_id = %s"
        logger.info("[execute_order_update] SQL: %s | vals=%s", sql, vals)
        cur.execute(sql, vals)
        logger.info("[execute_order_update] UPDATE affected %s rows", cur.rowcount)
        # Check status after update
        cur.execute("SELECT order_status FROM orders.orders WHERE order_id = %s", (order_id,))
        temp = cur.fetchone()
        logger.info("[execute_order_update] After UPDATE, status=%s", temp["order_status"] if temp else "NOT FOUND")
    else:
        logger.warning("[execute_order_update] No columns to update for order_id=%s — sets is empty", order_id)

    db.commit()

    # Verify the update landed — read directly without going through get_single_order_details
    cur2 = db.get_cursor()
    cur2.execute("SELECT order_status, total_cost, laundry_bags FROM orders.orders WHERE order_id = %s", (order_id,))
    verify = cur2.fetchone()
    logger.info("[execute_order_update] POST-COMMIT verify: order_id=%s status=%s total_cost=%s bags=%s",
                order_id,
                verify["order_status"] if verify else "NOT FOUND",
                verify["total_cost"] if verify else None,
                verify["laundry_bags"] if verify else None)

    # Return updated order
    _, result = get_single_order_details("internal", None, order_id)
    logger.info("[execute_order_update] get_single_order_details returned orderStatus=%s",
                result.get("orderStatus") if isinstance(result, dict) else "error")
    return result


def capture_hold_store_payment(payment_intent_id, order_amount, laundry_id):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'captureFinalStorePayment',
                'stripePaymentIntentId': payment_intent_id,
                'laundryId': laundry_id,
                'amount': float(order_amount)
            })
        )
        return json.loads(resp['Payload'].read())
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def capture_store_payment(card_payment_id, order_amount, laundry_id, customer_id, order_id):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'captureStorePayment',
                'cardPaymentId': card_payment_id,
                'laundryId': laundry_id,
                'amount': float(order_amount),
                'customerId': customer_id,
                'orderId': order_id
            })
        )
        return json.loads(resp['Payload'].read())
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


# GSI key generation — kept for compatibility but not used in PostgreSQL
def generate_order_gsi_keys(**kwargs):
    return {}
