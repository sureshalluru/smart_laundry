"""
order_updates.py — order update logic.
Migrated from DynamoDB to PostgreSQL.
"""
import json
import logging
import boto3
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from enum import Enum
import db
from utils import (get_single_order_details, generate_response, calculate_total_cost,
                   get_current_timestamp, round_decimal, execute_order_update,
                   get_promotion_data, convert_decimals, is_promo_active,
                   get_status_category, capture_hold_store_payment)
from notifications import invoke_notification_lambda, generate_email_body, generate_sms_body
from order_history import log_order_update
from promo_validation import apply_promo_code

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


def update_order_info(laundry_id, order_id, emp_id, update_payload):
    try:
        _, existing_order = get_single_order_details("internal", laundry_id, order_id)
        if not isinstance(existing_order, dict):
            return {"statusCode": 404, "message": f"Order {order_id} not found"}

        update_details = {}
        for key, value in update_payload.items():
            old_value = existing_order.get(key)
            if old_value != value:
                update_details[key] = {"old": old_value, "new": value}

        if not update_details:
            return {"statusCode": 200, "message": "No changes detected"}

        # Build update expression
        set_parts = [f"{k} = :{k}" for k in update_details]
        set_parts.append("updatedAt = :updatedAt")
        expr_vals = {f":{k}": v["new"] for k, v in update_details.items()}
        expr_vals[":updatedAt"] = get_current_timestamp()

        # Set emp_id so DB triggers record who made this change
        db.set_emp_id(emp_id)
        execute_order_update(order_id, "SET " + ", ".join(set_parts), expr_vals)
        log_order_update(laundry_id, order_id, emp_id, update_details)

        return {"statusCode": 200, "message": "Order updated successfully", "updatedFields": update_details}
    except Exception as e:
        logger.exception("update_order_info error")
        return {"statusCode": 500, "message": "Error updating order", "error": str(e)}


def update_order(operation, laundry_id, order_id, order_status, laundry_bags,
                 services_to_add, services_to_remove, services_to_update, emp_id,
                 products_to_add=None, products_to_remove=None, products_to_update=None,
                 coupon=None, paymentInstructions=None):
    apply_promo_total_price = False
    try:
        capture_instore_order = False
        current_order_status, current_order = get_single_order_details(operation, laundry_id, order_id)
        if not isinstance(current_order, dict):
            return generate_response(404, {'message': 'Order not found'})

        current_laundry_bags = current_order.get('laundryBags', 0)
        tip_data = current_order.get('tip', {}) or {}
        customer_id = current_order.get("customerId")
        order_type = current_order.get("orderType")
        old_order_status = current_order.get('orderStatus')

        # ── EnRouteToDelivery: capture payment ───────────────────────────────
        if order_status == OrderStatus.EN_ROUTE_TO_DELIVERY.value:
            if current_order.get("orderType") == "Online":
                tip_data['tipReceiverId'] = emp_id
                grand_total = Decimal(str(current_order.get("grandTotal", "0.00")))
                payment_payload = {
                    "orderId": order_id,
                    "amount": float(grand_total),
                    "description": f"Payment for order {order_id}",
                    "customerPaymentId": current_order.get("customerPaymentId"),
                    "laundryId": laundry_id,
                    "orderPaymentOperation": "capturePayment",
                    "customerId": customer_id
                }
                resp = lambda_client.invoke(
                    FunctionName='PaymentService', InvocationType='RequestResponse',
                    Payload=json.dumps(payment_payload, default=str))
                payment_response = json.loads(resp['Payload'].read())
                if payment_response.get('status') != 'success':
                    return generate_response(400, {'message': f"Payment capture failed: {payment_response.get('message')}"})
                # Re-fetch to confirm payment status
                _, current_order = get_single_order_details(operation, laundry_id, order_id)
                if current_order.get("paymentStatus") != "Paid":
                    return generate_response(400, {'message': 'Payment status still not Paid.'})
            elif current_order.get("orderType") == "InStore":
                return generate_response(400, {'message': 'Please take payment from the InStore customer.'})

        # ── ProcessingCompleted: apply promo ─────────────────────────────────
        elif order_status == OrderStatus.PROCESSING_COMPLETED.value:
            promo_result = apply_promo_code(order_id, laundry_id)
            payments = current_order.get("finalPaymentIntentId", [])
            if payments and isinstance(payments[0], dict):
                existing = payments[0]
                capture_pending_amount = Decimal(str(existing.get("amount", 0)))
                method = existing.get("paymentMethod")
                capture_pending_intent_id = existing.get("paymentIntentId")
                if method in ('Card', 'Terminal'):
                    capture_instore_order = True
            if promo_result.get('status') == 'ok':
                apply_promo_total_price = True
                promo_total_price = promo_result.get('totalCost')
                updated_coupon = promo_result.get('coupon')
            else:
                return generate_response(500, {'message': promo_result.get('message')})

        notification_preference = current_order.get("customer Notification", {})

        # Fetch service prices from PostgreSQL
        cur = db.get_cursor()
        cur.execute("""
            SELECT service_name, price FROM shop.laundry_services
            WHERE laundry_id = %s AND is_active = TRUE
        """, (laundry_id,))
        service_prices = {r['service_name'].strip().lower(): Decimal(str(r['price'])) for r in cur.fetchall()}

        cur.execute("""
            SELECT product_name, price FROM shop.laundry_products
            WHERE laundry_id = %s AND is_active = TRUE
        """, (laundry_id,))
        product_catalog = {r['product_name'].strip().lower(): {'productName': r['product_name'], 'price': r['price']}
                           for r in cur.fetchall()}

        original_services = current_order.get('services', [])
        original_products = current_order.get('products', [])
        existing_coupon = current_order.get('coupon')

        updated_services = update_services_logic(original_services, services_to_add, services_to_remove,
                                                  services_to_update, service_prices)
        updated_products = update_products_logic(original_products, products_to_add, products_to_remove,
                                                  products_to_update, product_catalog)

        # Compare by normalising weightOrCount/productCount to float to avoid Decimal vs float mismatch
        def _svc_key(s):
            return (s.get('serviceName', '').strip().lower(), float(str(s.get('weightOrCount', 0))))
        def _prod_key(p):
            return (p.get('productName', '').strip().lower(), int(str(p.get('productCount', 1))))

        services_changed = {_svc_key(s) for s in updated_services} != {_svc_key(s) for s in original_services}
        products_changed = {_prod_key(p) for p in updated_products} != {_prod_key(p) for p in original_products}

        if coupon and coupon != existing_coupon:
            promo_data = get_promotion_data(laundry_id, coupon)
            if not is_promo_active(promo_data):
                return generate_response(400, {'message': f'Invalid/Inactive coupon: {coupon}'})

        total_cost = Decimal(str(current_order.get("totalCost", 0)))
        if services_changed or products_changed or (coupon and coupon != existing_coupon):
            total_cost = calculate_total_cost(updated_services, updated_products)
            if coupon and coupon != existing_coupon:
                promo_data = get_promotion_data(laundry_id, coupon)
                if not is_promo_active(promo_data):
                    return generate_response(400, {'message': f"Invalid/Inactive coupon: {coupon}"})

        if apply_promo_total_price:
            total_cost = Decimal(str(promo_total_price))

        coupon = coupon if coupon is not None else existing_coupon
        if apply_promo_total_price:
            coupon = updated_coupon

        sub_total = calculate_total_cost(updated_services, updated_products)

        # Tip calculation
        tip_type = tip_data.get('tipType', 'noTip')
        tip_data['tipReceiverId'] = emp_id
        if tip_type == "percentage":
            pct = Decimal(str(tip_data.get("tipPercentage", 0)))
            tip_amount = (sub_total * (pct / Decimal(100))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        elif tip_type == "custom":
            tip_amount = Decimal(str(tip_data.get("tipAmount", 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            tip_amount = Decimal("0.00")
        tip_data["tipAmount"] = tip_amount
        grand_total = Decimal(str(total_cost)) + tip_amount

        if capture_instore_order:
            capture_amount = min(grand_total, capture_pending_amount)
            capture_hold_store_payment(capture_pending_intent_id, capture_amount, laundry_id)

        # Build update expression
        update_expression = (
            "SET services = :services, products = :products, totalCost = :totalCost, "
            "subTotal = :subTotal, grandTotal = :grandTotal, "
            "laundryBags = :laundryBags, lastUpdatedBy = :lastUpdatedBy, updatedAt = :updatedAt, tip = :tip"
        )
        expression_values = {
            ':laundryBags': laundry_bags,
            ':services': [{**s, 'servicePrice': round_decimal(s['servicePrice']),
                           'weightOrCount': round_decimal(s['weightOrCount'])} for s in updated_services],
            ':products': [{**p, 'productPrice': round_decimal(p['productPrice']),
                           'productCount': round_decimal(p['productCount'])} for p in updated_products],
            ':totalCost': round_decimal(total_cost),
            ':subTotal': round_decimal(sub_total),
            ':grandTotal': round_decimal(grand_total),
            ':lastUpdatedBy': emp_id,
            ':updatedAt': get_current_timestamp(),
            ':tip': tip_data
        }

        if order_status:
            expression_values[':orderStatus'] = order_status
            update_expression += ", orderStatus = :orderStatus"
            new_cat = get_status_category(order_status)
            old_cat = get_status_category(old_order_status)
            if new_cat != old_cat:
                expression_values[':statusCategory'] = new_cat
                update_expression += ", statusCategory = :statusCategory"

        if coupon is not None:
            update_expression += ", coupon = :coupon"
            expression_values[':coupon'] = coupon

        # Set emp_id so DB triggers (order_history, order_audit_log) record who made this change
        db.set_emp_id(emp_id)
        updated_order = execute_order_update(order_id, update_expression, expression_values)

        # Update customer stats on completion
        if ((order_type == "Online" and order_status == OrderStatus.DELIVERED.value) or
                (order_type == "InStore" and order_status == OrderStatus.ORDER_PICKED_UP.value)):
            try:
                cur.execute("""
                    UPDATE shop.customer_laundry_stats
                    SET total_order_value = total_order_value + %s,
                        total_orders_placed = total_orders_placed + 1,
                        last_completed_order_id = %s,
                        last_completed_at = NOW()
                    WHERE customer_id = %s AND laundry_id = %s
                """, (float(total_cost), order_id, customer_id, laundry_id))
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning("Customer stats update failed: %s", e)

        # Audit log
        update_details = {
            'orderStatus': {'old': old_order_status, 'new': order_status} if order_status else None,
            'services': {'old': original_services, 'new': updated_services} if services_changed else None,
            'products': {'old': original_products, 'new': updated_products} if products_changed else None,
            'coupon': {'old': existing_coupon, 'new': coupon} if coupon else None,
            'laundryBags': {'old': current_laundry_bags, 'new': laundry_bags}
        }
        # Remove None entries so log_order_update doesn't process unchanged fields
        update_details = {k: v for k, v in update_details.items() if v is not None}
        log_order_update(laundry_id, order_id, emp_id, update_details)

        # Notifications
        should_notify = (
            (order_type == "Online" and order_status in [OrderStatus.EN_ROUTE_TO_DELIVERY.value, OrderStatus.DELIVERED.value]) or
            (order_type == "InStore" and order_status in [OrderStatus.ORDER_PICKED_UP.value, OrderStatus.PROCESSING_COMPLETED.value])
        )

        changes_detected, email_body = generate_email_body(
            current_order, updated_services, updated_products, order_id, order_status, float(total_cost), laundry_id)
        sms_body = generate_sms_body(
            current_order=current_order, orderId=order_id, new_status=order_status,
            updated_services=updated_services, updated_products=updated_products,
            total_cost=float(total_cost), laundryId=laundry_id)

        # Get shop email
        cur.execute("SELECT contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop_row = cur.fetchone()
        shop_email = shop_row['contact_email'] if shop_row else None

        if changes_detected and should_notify:
            invoke_notification_lambda(
                notification_preference, email_body, sms_body,
                current_order.get("customerEmail"), current_order.get("customerPhone"), shop_email)

        return generate_response(200, {
            'status': 'success',
            'updatedOrder': convert_decimals(updated_order),
            'totalPrice': float(total_cost),
            'subTotal': float(sub_total),
            'grandTotal': float(grand_total)
        })

    except Exception as e:
        logger.exception("update_order error")
        return generate_response(500, {'message': f"An error occurred: {str(e)}"})


def update_services_logic(original, to_add, to_remove, to_update, service_prices):
    updated = [{**s} for s in original]

    # Remove services by integer id (sent from UI)
    remove_ids = {r for r in (to_remove or []) if isinstance(r, int)}
    updated = [s for s in updated if s.get('id') not in remove_ids]

    # Update existing services matched by id
    for new_svc in to_update or []:
        svc_id = new_svc.get('id')
        if svc_id:
            existing = next((s for s in updated if s.get('id') == svc_id), None)
            if existing:
                name = new_svc.get('serviceName', '').strip().lower()
                woc = Decimal(str(new_svc.get('weightOrCount', 0)))
                if name in service_prices:
                    price = service_prices[name]
                elif new_svc.get('servicePrice') is not None:
                    price = Decimal(str(new_svc.get('servicePrice', 0)))
                else:
                    raise ValueError(f"Service '{new_svc.get('serviceName')}' not found in catalog and no price provided.")
                existing['serviceName'] = new_svc.get('serviceName')
                existing['weightOrCount'] = woc
                existing['servicePrice'] = price

    # Add new services (no id — never been saved)
    for new_svc in (to_add or []) + [s for s in (to_update or []) if not s.get('id')]:
        name = new_svc.get('serviceName', '').strip().lower()
        if not name:
            continue
        woc = Decimal(str(new_svc.get('weightOrCount', 0)))
        if name in service_prices:
            price = service_prices[name]
        elif new_svc.get('servicePrice') is not None:
            price = Decimal(str(new_svc.get('servicePrice', 0)))
        else:
            raise ValueError(f"Service '{new_svc.get('serviceName')}' not found in catalog and no price provided.")

        existing = next((s for s in updated if s.get('serviceName', '').strip().lower() == name), None)
        if existing:
            existing['weightOrCount'] = woc
            existing['servicePrice'] = price
        else:
            updated.append({'serviceName': new_svc.get('serviceName'), 'servicePrice': price, 'weightOrCount': woc})

    seen, deduped = set(), []
    for s in updated:
        n = s.get('serviceName', '').strip().lower()
        if n not in seen:
            seen.add(n)
            deduped.append(s)
    return deduped


def update_products_logic(original, to_add, to_remove, to_update, product_catalog):
    to_remove = to_remove or []
    to_add = to_add or []
    to_update = to_update or []

    # Remove products by integer id (sent from UI)
    remove_ids = {r for r in to_remove if isinstance(r, int)}
    # Don't remove a product if it's also being re-added by name
    to_add_names = {a.get('productName', '').strip().lower() for a in to_add}
    updated = [{**p} for p in original
               if p.get('id') not in remove_ids or
               p.get('productName', '').strip().lower() in to_add_names]

    for prod in to_add:
        name = prod.get('productName', '').strip().lower()
        if name not in product_catalog:
            raise ValueError(f"Product {prod.get('productName')} not found in catalog.")
        count = Decimal(str(prod.get('productCount', 1)))
        existing = next((p for p in updated if p['productName'].strip().lower() == name), None)
        if existing:
            existing['productCount'] = count
        else:
            updated.append({'productName': product_catalog[name]['productName'],
                             'productPrice': Decimal(str(product_catalog[name]['price'])),
                             'productCount': count})

    for prod in to_update:
        name = prod.get('productName', '').strip().lower()
        if name not in product_catalog:
            raise ValueError(f"Product {prod.get('productName')} not found in catalog.")
        count = Decimal(str(prod.get('productCount', 1)))
        existing = next((p for p in updated if p['productName'].strip().lower() == name), None)
        if existing:
            existing['productCount'] = count

    return updated
