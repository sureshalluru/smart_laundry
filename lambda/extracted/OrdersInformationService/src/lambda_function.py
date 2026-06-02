"""
OrdersInformationService — order listing, updates, audit log, paginated admin view.
"""
import json
import logging
import boto3
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from base64 import b64decode, b64encode
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

from utils import get_single_order_details, generate_response, convert_decimals
from order_updates import update_order, update_order_info
from promo_validation import check_promo_valid_and_applicable
from order_history import get_order_history
from driver_operations import handle_upload_image
from instore_payments import inStoreOnlinePayment, payLaterInStorePayment, payLaterInStorePaymentTest


def lambda_handler(event, context):
    logger.info("OrdersInformationService event: %s", event)
    # Close any previous connection — fresh connection per invocation
    db.close()

    params = event.get('queryStringParameters', {}) or {}
    operation  = params.get('operation')
    laundry_id = params.get('laundryId')
    status_category = params.get('statusCategory', 'Active')
    order_type = params.get('orderType', 'All')
    last_key   = params.get('lastEvaluatedKey')
    order_id   = params.get('orderId')
    emp_id     = params.get('empId')

    body = event.get('body', '{}')
    if isinstance(body, str):
        body = json.loads(body)

    order_status              = body.get('orderStatus')
    services_to_add           = body.get('servicesToAdd', [])
    services_to_remove        = body.get('servicesToRemove', [])
    services_to_update        = body.get('servicesToUpdate', [])
    products_to_add           = body.get('productsToAdd', [])
    products_to_remove        = body.get('productsToRemove', [])
    products_to_update        = body.get('productsToUpdate', [])
    coupon                    = body.get('coupon')
    is_cash                   = body.get('isCash')
    stripe_payment_method_id  = body.get('cardPaymentMethodId')
    customer_id               = body.get('customerId')
    cash_refunded             = body.get('isCashRefund')
    extra_cash_received       = body.get('isExtraCashReceived')
    laundry_bags              = body.get('laundryBags', 1)
    excess_tip_amount         = body.get('excessTipAmount', 0)
    is_terminal_payment       = body.get('isTerminalPayment', False)
    terminal_amount           = body.get('terminalAmount', 0)
    terminal_payment_intent_id = body.get('terminalPaymentIntentId', '')
    payment_instructions      = body.get('paymentInstructions')
    tip_data                  = body.get('tip_payload', {})
    payment_update            = body.get('payment_updates', [])
    cash_refund               = body.get('is_cash_refunded', False)

    try:
        if operation == 'captureInStorePayment':
            status = payLaterInStorePayment(
                order_id=order_id, laundry_id=laundry_id, is_cash=is_cash,
                card_payment_method_id=stripe_payment_method_id, emp_id=emp_id,
                is_cash_refunded=cash_refunded, is_extra_cash_received=extra_cash_received,
                excess_tip_amount=excess_tip_amount, isTerminalPayment=is_terminal_payment,
                terminalAmount=terminal_amount, terminalPaymentIntentId=terminal_payment_intent_id)
            return generate_response(200, status)

        elif operation == 'captureInStorePaymentTest':
            status = payLaterInStorePaymentTest(
                order_id=order_id, laundry_id=laundry_id, employee_id=emp_id,
                tip_payload=tip_data, payment_updates=payment_update, is_cash_refunded=cash_refund)
            return generate_response(200, status)

        elif operation == 'captureInStoreOrderOnlinePayment':
            status = inStoreOnlinePayment(
                card_payment_method_id=stripe_payment_method_id,
                order_id=order_id, laundry_id=laundry_id, customer_id=customer_id)
            return generate_response(200, status)

        elif operation in ('active', 'completed', 'canceled'):
            page       = int(params.get('page', 1))
            limit      = int(params.get('limit', 30))
            order_type = params.get('orderType', 'All')  # All | Online | InStore | Commercial
            orders = get_orders_by_status(laundry_id, operation, page=page, limit=limit, order_type=order_type)
            return generate_response(200, orders)

        elif operation == 'getSingleOrder':
            status_code, order_body = get_single_order_details(operation, laundry_id, order_id)
            return generate_response(status_code, order_body)

        elif operation in ('fetchServices', 'fetchStatuses'):
            return fetch_laundry_shop_info(laundry_id, operation)

        elif operation == 'updateOrder':
            update_resp = update_order(
                operation, laundry_id, order_id, order_status, laundry_bags,
                services_to_add, services_to_remove, services_to_update, emp_id,
                products_to_add=products_to_add, products_to_remove=products_to_remove,
                products_to_update=products_to_update, coupon=coupon,
                paymentInstructions=payment_instructions)
            if update_resp['statusCode'] != 200:
                return update_resp
            updated_order = update_resp['body'].get('updatedOrder') if isinstance(update_resp.get('body'), dict) else None
            return generate_response(200, {'updatedOrder': updated_order, 'empId': emp_id})

        elif operation == 'orderHistory':
            return generate_response(200, get_order_history(laundry_id, order_id))

        elif operation == 'uploadImage':
            return handle_upload_image(body, laundry_id, order_id, emp_id)

        elif operation == 'validateStorePromoCode':
            result = check_promo_valid_and_applicable(
                services=body.get('services', []), products=body.get('products', []),
                customer_id=params.get('customerId'), laundry_id=params.get('laundryId'),
                coupon_code=params.get('promoCode'))
            return generate_response(200, result)

        elif operation == 'getOrdersPaginated':
            result = get_admin_orders_paginated(
                laundry_id=laundry_id, status_category=status_category,
                order_type=order_type, last_evaluated_key=last_key)
            return generate_response(200, result)

        elif operation == 'updateOrderInfo':
            update_resp = update_order_info(laundry_id, order_id, emp_id, body)
            if update_resp['statusCode'] != 200:
                return generate_response(update_resp['statusCode'], update_resp)
            if update_resp.get("message") == "No changes detected":
                return generate_response(200, {"message": "No changes detected."})
            _, order_body = get_single_order_details("getSingleOrder", laundry_id, order_id)
            return generate_response(200, {"message": "Order information updated successfully",
                                           "updatedOrder": convert_decimals(order_body)})

        else:
            return generate_response(200, 'Route not found')

    except Exception as e:
        logger.exception("OrdersInformationService error")
        return generate_response(500, f'Internal Server Error: {str(e)}')


# ── order listing ─────────────────────────────────────────────────────────────

def get_orders_by_status(laundry_id, operation, page=1, limit=30, order_type='All'):
    try:
        cur = db.get_cursor()
        ninety_days_ago = (datetime.now() - timedelta(days=90)).isoformat()
        offset = (page - 1) * limit

        # ── WHERE clause: main tab (status) ──────────────────────────────────
        if operation == 'active':
            where = """
                o.laundry_id = %s
                AND o.status_category = 'Active'
                AND o.order_status NOT IN ('Delivered','OrderPickedUp','OrderCanceled','Cancelled')
                AND o.created_at >= %s
            """
            where_params = [laundry_id, ninety_days_ago]
        elif operation == 'completed':
            where = "o.laundry_id = %s AND o.status_category IN ('Completed','Cancelled')"
            where_params = [laundry_id]
        elif operation == 'canceled':
            where = "o.laundry_id = %s AND o.status_category = 'Cancelled'"
            where_params = [laundry_id]
        else:
            return {"orders": [], "pageInfo": {"page": page, "limit": limit, "totalRecords": 0, "totalPages": 0}}

        # ── Sub-tab filter: order type ────────────────────────────────────────
        if order_type and order_type != 'All':
            where += " AND o.order_type = %s"
            where_params.append(order_type)

        # ── Sort order: depends on order type ─────────────────────────────────
        # All       → created_at DESC
        # Online    → pickup_date DESC, then start of pickup_time_interval (e.g. "10:00 - 12:00" → "10:00")
        # InStore   → dropoff_date DESC, then dropoff_time_interval as-is (e.g. "12:25")
        # Commercial→ dropoff_date DESC, then dropoff_time_interval as-is
        sort_map = {
            'Online': """
                o.pickup_date DESC NULLS LAST,
                CAST(SPLIT_PART(o.pickup_time_interval, ' - ', 1) AS TIME) DESC NULLS LAST
            """,
            'InStore': """
                o.dropoff_date DESC NULLS LAST,
                CAST(o.dropoff_time_interval AS TIME) DESC NULLS LAST
            """,
            'Commercial': """
                o.dropoff_date DESC NULLS LAST,
                CAST(o.dropoff_time_interval AS TIME) DESC NULLS LAST
            """,
        }
        order_by = sort_map.get(order_type, "o.created_at DESC")

        # ── Total count ───────────────────────────────────────────────────────
        cur.execute(f"SELECT COUNT(*) AS total FROM orders.orders o WHERE {where}", where_params)
        total_records = cur.fetchone()["total"]
        total_pages   = max(1, -(-total_records // limit))

        # ── Single query with all joins ───────────────────────────────────────
        cur.execute(f"""
            SELECT
                o.*,
                c.first_name, c.last_name, c.phone_number, c.email,
                c.notif_email, c.notif_sms, c.notif_phone,
                cpp.stripe_customer_id AS customer_payment_id,
                ca.address AS customer_address,

                COALESCE(
                    json_agg(DISTINCT jsonb_build_object(
                        'orderId',       os.order_id,
                        'serviceName',   os.service_name,
                        'servicePrice',  os.service_price,
                        'weightOrCount', os.weight_or_count
                    )) FILTER (WHERE os.id IS NOT NULL),
                    '[]'
                ) AS services,

                COALESCE(
                    json_agg(DISTINCT jsonb_build_object(
                        'orderId',         op.order_id,
                        'paymentIntentId', op.payment_intent_id,
                        'amount',          op.amount,
                        'paymentMethod',   op.payment_method,
                        'createdAt',       op.created_at
                    )) FILTER (WHERE op.id IS NOT NULL),
                    '[]'
                ) AS payments,

                jsonb_build_object(
                    'tipAmount',     ot.tip_amount,
                    'tipPercentage', ot.tip_percentage,
                    'tipType',       ot.tip_type,
                    'tipMethod',     ot.tip_method,
                    'tipReceiverId', ot.tip_receiver_id
                ) AS tip

            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            LEFT JOIN shop.customer_payment_profiles cpp
              ON cpp.customer_id = o.customer_id AND cpp.laundry_id = o.laundry_id
            LEFT JOIN shop.customer_addresses ca
              ON ca.address_id = o.address_id
            LEFT JOIN orders.order_services os ON os.order_id = o.order_id
            LEFT JOIN orders.order_payments op ON op.order_id = o.order_id
            LEFT JOIN orders.order_tips ot     ON ot.order_id = o.order_id
            WHERE {where}
            GROUP BY
                o.order_id, c.customer_id, cpp.stripe_customer_id,
                ca.address, ot.tip_amount, ot.tip_percentage,
                ot.tip_type, ot.tip_method, ot.tip_receiver_id
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """, where_params + [limit, offset])

        rows = cur.fetchall()

        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        laundry_name = shop["laundry_name"] if shop else "N/A"

        detailed_orders = []
        for r in rows:
            services = r["services"] or []
            payments = r["payments"] or []
            tip      = r["tip"] or {}

            # Serialize datetime/Decimal inside the JSON-aggregated lists
            services = [db.serialize(s) for s in services]
            payments = [db.serialize(p) for p in payments]
            tip      = db.serialize(tip)

            grand_total = Decimal(str(r["grand_total"] or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            paid_amount = sum(
                Decimal(str(p.get("amount", 0))).quantize(Decimal('0.01'))
                for p in payments
            )
            balance_due = max(Decimal('0.00'), grand_total - paid_amount)

            detailed_orders.append({
                "orderId": r["order_id"],
                "customerName": f"{r['first_name']} {r['last_name']}".strip(),
                "customerPhone": r["phone_number"],
                "customerEmail": r["email"],
                "customerNotification": {"email": r["notif_email"], "sms": r["notif_sms"], "phone": r["notif_phone"]},
                "customerAddress": r["customer_address"] or "No address available",
                "autoGenerated": r["auto_generated"],
                "coupon": r["coupon"],
                "createdAt": db.serialize(r["created_at"]),
                "dropoffDate": db.serialize(r["dropoff_date"]),
                "dropoffTimeInterval": r["dropoff_time_interval"],
                "frequency": r["frequency"],
                "laundryName": laundry_name,
                "orderStatus": r["order_status"],
                "cancelReason": r["cancel_reason"],
                "paymentStatus": r["payment_status"],
                "pickupDate": db.serialize(r["pickup_date"]),
                "pickupTimeInterval": r["pickup_time_interval"],
                "laundryBags": r["laundry_bags"],
                "services": services,
                "products": [],
                "specialInstructions": r["special_instructions"],
                "totalCost": float(r["total_cost"]),
                "discountedPrice": float(r["discounted_price"]),
                "tip": tip,
                "grandTotal": float(grand_total),
                "subTotal": float(r["sub_total"]),
                "updatedAt": db.serialize(r["updated_at"]),
                "lastUpdatedBy": r["last_updated_by"],
                "customerPaymentId": r["customer_payment_id"] or "",
                "imageUrl": r["image_url"],
                "balanceDue": float(balance_due),
                "paidAmount": float(paid_amount),
            })

        sort_label_map = {
            'Online':     'pickupDate + pickupTime',
            'InStore':    'dropoffDate + dropoffTime',
            'Commercial': 'dropoffDate + dropoffTime',
        }
        return {
            "orders": detailed_orders,
            "pageInfo": {
                "page":         page,
                "limit":        limit,
                "totalRecords": total_records,
                "totalPages":   total_pages,
                "orderType":    order_type,
                "sortedBy":     sort_label_map.get(order_type, 'createdAt'),
            }
        }

    except Exception as e:
        db.rollback()
        logger.exception("get_orders_by_status error")
        raise


def get_admin_orders_paginated(laundry_id, status_category='Active', order_type='All', limit=50, last_evaluated_key=None):
    try:
        cur = db.get_cursor()
        offset = 0
        if last_evaluated_key:
            try:
                if isinstance(last_evaluated_key, str):
                    decoded = b64decode(last_evaluated_key)
                    offset = int(json.loads(decoded))
            except Exception:
                offset = 0

        base_query = """
            SELECT o.order_id, o.order_type, o.order_status, o.payment_status,
                   o.pickup_date, o.pickup_time_interval, o.dropoff_date, o.dropoff_time_interval,
                   o.created_at, o.grand_total, o.customer_id,
                   c.first_name, c.last_name, c.phone_number
            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            WHERE o.laundry_id = %s AND o.status_category = %s
        """
        qparams = [laundry_id, status_category]

        if order_type != 'All':
            base_query += " AND o.order_type = %s"
            qparams.append(order_type)

        base_query += " ORDER BY o.created_at DESC LIMIT %s OFFSET %s"
        qparams += [limit, offset]

        cur.execute(base_query, qparams)
        rows = cur.fetchall()

        formatted = [{
            "orderId": r["order_id"],
            "orderType": r["order_type"],
            "orderStatus": r["order_status"],
            "paymentStatus": r["payment_status"],
            "pickupDate": str(r["pickup_date"]) if r["pickup_date"] else None,
            "pickupTimeInterval": r["pickup_time_interval"],
            "dropoffDate": str(r["dropoff_date"]) if r["dropoff_date"] else None,
            "dropoffTimeInterval": r["dropoff_time_interval"],
            "createdAt": str(r["created_at"]),
            "grandTotal": float(r["grand_total"] or 0),
            "customerName": f"{r['first_name']} {r['last_name']}".strip(),
            "customerPhone": r["phone_number"],
            "customerId": r["customer_id"],
        } for r in rows]

        next_offset = offset + limit if len(rows) == limit else None
        encoded_key = b64encode(json.dumps(next_offset).encode()).decode() if next_offset else None

        return {
            "status": "success",
            "orders": formatted,
            "lastEvaluatedKey": encoded_key,
            "count": len(formatted),
            "hasMore": next_offset is not None,
            "query": {"statusCategory": status_category, "orderType": order_type, "laundryId": laundry_id},
        }
    except Exception as e:
        logger.exception("get_admin_orders_paginated error")
        return {"status": "error", "message": str(e), "orders": [], "lastEvaluatedKey": None, "count": 0, "hasMore": False}


def fetch_laundry_shop_info(laundry_id, operation):
    try:
        cur = db.get_cursor()
        if operation == 'fetchServices':
            cur.execute("""
                SELECT service_name, price, description, input_weight, customer_access
                FROM shop.laundry_services WHERE laundry_id = %s AND is_active = TRUE
            """, (laundry_id,))
            services = [db.serialize_row(r) for r in cur.fetchall()]
            return {'statusCode': 200, 'body': {'message': 'Services fetched successfully', 'data': services}}
        elif operation == 'fetchStatuses':
            statuses = ['OrderSubmitted', 'ReadyForIntake', 'ReceivedAtFacility', 'ProcessingStarted',
                        'ProcessingCompleted', 'EnRouteToDelivery', 'Delivered', 'OrderPickedUp', 'Cancelled']
            return {'statusCode': 200, 'body': {'message': 'Statuses fetched successfully', 'data': statuses}}
    except Exception as e:
        return {'statusCode': 500, 'body': {'message': str(e)}}
