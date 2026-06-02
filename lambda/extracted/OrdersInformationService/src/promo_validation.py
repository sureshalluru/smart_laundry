"""
promo_validation.py — promo code validation and application.
Migrated from DynamoDB to PostgreSQL.
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
import db
from utils import (get_single_order_details, get_promotion_data, is_promo_active,
                   calculate_total_cost, get_current_timestamp)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_promo_usage_count(customer_id, laundry_id, promo_code):
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT cpu.usage_count
            FROM orders.customer_promo_usage cpu
            JOIN shop.promotions p ON p.promotion_id = cpu.promotion_id
            WHERE cpu.customer_id = %s AND cpu.laundry_id = %s AND p.promo_code = %s
        """, (customer_id, laundry_id, promo_code))
        row = cur.fetchone()
        return row['usage_count'] if row else 0
    except Exception as e:
        logger.exception("get_promo_usage_count error")
        return 0


def increment_promo_usage(customer_id, laundry_id, promo_code, order_id):
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT promotion_id FROM shop.promotions
            WHERE laundry_id = %s AND promo_code = %s
        """, (laundry_id, promo_code))
        row = cur.fetchone()
        if not row:
            return
        promotion_id = row['promotion_id']

        cur.execute("""
            INSERT INTO orders.customer_promo_usage
                (customer_id, laundry_id, promotion_id, promo_code, usage_count, last_used_at)
            VALUES (%s,%s,%s,%s,1,NOW())
            ON CONFLICT (customer_id, laundry_id, promotion_id) DO UPDATE SET
                usage_count = orders.customer_promo_usage.usage_count + 1,
                last_used_at = NOW()
        """, (customer_id, laundry_id, promotion_id, promo_code))

        cur.execute("""
            INSERT INTO orders.customer_promo_usage_history (customer_id, promotion_id, order_id, used_at)
            VALUES (%s,%s,%s,NOW())
        """, (customer_id, promotion_id, order_id))

        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("increment_promo_usage error")


def update_order_in_db(order_id, updates):
    """Apply promo-related updates to the orders table."""
    from utils import execute_order_update
    updates['updatedAt'] = get_current_timestamp()
    updates['orderStatus'] = 'ProcessingCompleted'

    # Build a DynamoDB-style expression for execute_order_update
    set_parts = []
    expr_vals = {}
    for k, v in updates.items():
        set_parts.append(f"{k} = :{k}")
        expr_vals[f":{k}"] = v

    update_expr = "SET " + ", ".join(set_parts)
    return execute_order_update(order_id, update_expr, expr_vals)


def apply_promo_code(order_id, laundry_id):
    logger.info("apply_promo_code: order=%s laundry=%s", order_id, laundry_id)
    _, order = get_single_order_details("internal", laundry_id, order_id)
    if not order or order.get('laundryId') != laundry_id:
        return {"status": "error", "message": "Order not found or invalid laundryId"}

    promo_code = order.get('coupon')
    customer_id = order.get('customerId')

    if not promo_code:
        return remove_promo_and_recalculate(order)

    promo_data = get_promotion_data(laundry_id, promo_code)
    if not promo_data or not is_promo_active(promo_data):
        return remove_promo_and_recalculate(order)

    usage_count = get_promo_usage_count(customer_id, laundry_id, promo_code)
    if usage_count > promo_data.get('usageLimitPerCustomer', 0):
        return remove_promo_and_recalculate(order)

    updated_order = apply_discount(order, promo_data)
    if not updated_order:
        return remove_promo_and_recalculate(order)

    updated_item = update_order_in_db(order_id, updated_order)
    increment_promo_usage(customer_id, laundry_id, promo_code, order_id)

    total_cost = updated_item.get('totalCost', 0)
    return {
        "status": "ok",
        "message": "Promo code applied successfully",
        "updatedOrder": updated_item,
        "totalCost": float(total_cost),
        "coupon": promo_code
    }


def remove_promo_and_recalculate(order):
    services = order.get('services', [])
    products = order.get('products', [])
    total_cost = calculate_total_cost(services, products).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    updates = {"coupon": None, "discountedPrice": Decimal('0.00'), "totalCost": total_cost}
    updated_item = update_order_in_db(order['orderId'], updates)
    return {
        "status": "ok",
        "message": "Promo code removed and cost recalculated",
        "updatedOrder": updated_item,
        "totalCost": float(updated_item.get('totalCost', 0)),
        "coupon": None
    }


def apply_discount(order, promo):
    apply_on_whole = promo.get('applyOnWholeOrder', False)
    discount_type = promo.get('discountType', 'percentage')
    discount_value = Decimal(str(promo.get('discountValue', 0)))
    minimum_order_value = Decimal(str(promo.get('minimumOrderValue', 0)))
    specific_services = promo.get('specificServices', [])

    services = order.get('services', [])
    products = order.get('products', [])

    def svc_cost(svcs):
        total = Decimal(0)
        for s in svcs:
            total += Decimal(str(s.get('servicePrice', 0))) * Decimal(str(s.get('weightOrCount', 0)))
        return total

    def prod_cost(prods):
        total = Decimal(0)
        for p in prods:
            total += Decimal(str(p.get('productPrice', 0))) * Decimal(str(p.get('productCount', 0)))
        return total

    orig_svc = svc_cost(services)
    orig_prod = prod_cost(products)

    if orig_svc < minimum_order_value:
        return None

    new_svc = Decimal(orig_svc)
    discounted = Decimal('0.00')

    if apply_on_whole:
        if discount_type == 'percentage':
            discounted = ((new_svc * discount_value) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            new_svc = (new_svc - discounted).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        else:
            discounted = Decimal(discount_value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            new_svc = max(new_svc - discounted, Decimal('0.00')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        new_total = (new_svc + orig_prod).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    else:
        applicable = Decimal('0.00')
        for svc in services:
            svc_lower = svc.get('serviceName', '').strip().lower()
            match = next((s for s in specific_services if s.get('serviceName', '').strip().lower() == svc_lower), None)
            if match:
                applicable += Decimal(str(svc.get('servicePrice', 0))) * Decimal(str(svc.get('weightOrCount', 0)))
        if applicable <= 0:
            return None
        if discount_type == 'percentage':
            discounted = ((applicable * discount_value) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        else:
            discounted = Decimal(discount_value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        new_svc = max(new_svc - discounted, Decimal('0.00')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        new_total = (new_svc + orig_prod).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return {
        "coupon": order.get('coupon'),
        "discountedPrice": float(discounted),
        "totalCost": float(new_total)
    }


def check_promo_valid_and_applicable(services, products, customer_id, laundry_id, coupon_code):
    base_total = calculate_total_cost(services, products).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if not coupon_code:
        return {"valid": False, "discountedPrice": 0.0, "totalCost": float(base_total), "coupon": None,
                "message": "No promo code provided."}

    promo_data = get_promotion_data(laundry_id, coupon_code)
    if not promo_data:
        return {"valid": False, "discountedPrice": 0.0, "totalCost": float(base_total), "coupon": None,
                "message": "Promo code not found."}

    if not is_promo_active(promo_data):
        return {"valid": False, "discountedPrice": 0.0, "totalCost": float(base_total), "coupon": None,
                "message": "Promo code is not active."}

    usage_count = get_promo_usage_count(customer_id, laundry_id, coupon_code)
    if usage_count > promo_data.get('usageLimitPerCustomer', 0):
        return {"valid": False, "discountedPrice": 0.0, "totalCost": float(base_total), "coupon": None,
                "message": "Usage limit exceeded."}

    # Build a fake order dict for apply_discount
    fake_order = {'orderId': None, 'coupon': coupon_code, 'services': services, 'products': products}
    result = apply_discount(fake_order, promo_data)
    if not result:
        return {"valid": False, "discountedPrice": 0.0, "totalCost": float(base_total), "coupon": None,
                "message": "Promo does not meet criteria."}

    return {
        "valid": True,
        "discountedPrice": result["discountedPrice"],
        "totalCost": result["totalCost"],
        "coupon": coupon_code,
        "message": f"Promo applied."
    }
