"""
LaundryShopService — shop info, services, products, promotions, zip codes.
Migrated to PostgreSQL.
"""
import json
import logging
import uuid
import re
import base64
import boto3
from decimal import Decimal
from datetime import datetime
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
UPLOAD_BUCKET = "laundrylogos"

from generate_reports import generate_order_reports
from laundry_orders import get_driver_orders_by_date_range, get_orders_by_laundry_id, view_tips_by_laundry_id


def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    if isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


def create_response(status_code, body):
    return {"statusCode": status_code, "body": body}


# ── shop info ─────────────────────────────────────────────────────────────────

def get_laundry_shop_details(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT laundry_id, laundry_name, laundry_logo, laundry_timezone,
               delivery_time_interval, emp_prefix, admin_domain, user_domain,
               street, city, state, zip_code, country,
               contact_email, contact_phone, pickup_dropoff_instructions,
               stripe_public_key, stripe_terminal_id, serviceable_zip_codes
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"error": f"No shop found for laundryId: {laundry_id}"}

    addr = f"{row['street']}, {row['city']}, {row['state']}, {row['zip_code']}".strip(", ")
    return {
        "name": row["laundry_name"],
        "email": row["contact_email"],
        "phone": row["contact_phone"],
        "address": addr,
        "domain": {"adminDomain": row["admin_domain"], "userDomain": row["user_domain"]},
        "logo": row["laundry_logo"],
        "stripeTerminalExists": bool(row["stripe_terminal_id"]),
    }


def get_laundry_info_by_id(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT ls.*, 
               COALESCE(json_agg(DISTINCT jsonb_build_object(
                   'day', dts.day_of_week, 'startTime', dts.start_time, 'endTime', dts.end_time
               )) FILTER (WHERE dts.id IS NOT NULL), '[]') AS delivery_slots,
               COALESCE(json_agg(DISTINCT jsonb_build_object(
                   'day', ipts.day_of_week, 'startTime', ipts.start_time, 'endTime', ipts.end_time
               )) FILTER (WHERE ipts.id IS NOT NULL), '[]') AS instore_slots
        FROM shop.laundry_shops ls
        LEFT JOIN shop.delivery_time_slots dts ON dts.laundry_id = ls.laundry_id
        LEFT JOIN shop.instore_pickup_time_slots ipts ON ipts.laundry_id = ls.laundry_id
        WHERE ls.laundry_id = %s
        GROUP BY ls.laundry_id
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"message": f"No information found for laundryId: {laundry_id}", "laundryInfo": []}
    return {"message": "Laundry information retrieved successfully", "laundryInfo": [db.serialize_row(row)]}


# ── services ──────────────────────────────────────────────────────────────────

def view_all_services(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT service_id, service_name, description, price, input_weight, customer_access, is_active
        FROM shop.laundry_services WHERE laundry_id = %s AND is_active = TRUE
        ORDER BY service_id
    """, (laundry_id,))
    services = [db.serialize_row(r) for r in cur.fetchall()]
    return {"message": "Services fetched successfully", "services": services}


def update_services(laundry_id, to_add, to_update, to_remove):
    cur = db.get_cursor()
    try:
        for name in to_remove:
            cur.execute("""
                UPDATE shop.laundry_services SET is_active = FALSE
                WHERE laundry_id = %s AND service_name = %s
            """, (laundry_id, name))

        for svc in to_update:
            sets, vals = [], []
            if "price" in svc:
                sets.append("price = %s"); vals.append(svc["price"])
            if "description" in svc:
                sets.append("description = %s"); vals.append(svc["description"])
            if "customerAccess" in svc:
                sets.append("customer_access = %s"); vals.append(svc["customerAccess"])
            if "inputWeight" in svc:
                sets.append("input_weight = %s"); vals.append(svc["inputWeight"])
            if sets:
                sets.append("updated_at = NOW()")
                vals += [laundry_id, svc["serviceName"]]
                cur.execute(f"UPDATE shop.laundry_services SET {', '.join(sets)} WHERE laundry_id = %s AND service_name = %s", vals)

        for svc in to_add:
            cur.execute("""
                INSERT INTO shop.laundry_services
                    (laundry_id, service_name, description, price, input_weight, customer_access)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (laundry_id, service_name) DO UPDATE SET
                    price=EXCLUDED.price, updated_at=NOW()
            """, (laundry_id, svc["serviceName"], svc.get("description"), svc["price"],
                  svc.get("inputWeight", False), svc.get("customerAccess", False)))

        db.commit()
        return {"message": "Services updated successfully"}
    except Exception as e:
        db.rollback()
        raise


# ── products ──────────────────────────────────────────────────────────────────

def view_all_products(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT product_id, product_name, description, price, quantity, unit, customer_access
        FROM shop.laundry_products WHERE laundry_id = %s AND is_active = TRUE
        ORDER BY product_id
    """, (laundry_id,))
    products = [db.serialize_row(r) for r in cur.fetchall()]
    return {"message": "Products fetched successfully", "products": products}


def update_products(laundry_id, to_add, to_update, to_remove):
    cur = db.get_cursor()
    try:
        for name in to_remove:
            cur.execute("UPDATE shop.laundry_products SET is_active = FALSE WHERE laundry_id = %s AND product_name = %s", (laundry_id, name))

        for prod in to_update:
            sets, vals = [], []
            if "price" in prod:
                sets.append("price = %s"); vals.append(prod["price"])
            if "description" in prod:
                sets.append("description = %s"); vals.append(prod["description"])
            if "customerAccess" in prod:
                sets.append("customer_access = %s"); vals.append(prod["customerAccess"])
            if sets:
                sets.append("updated_at = NOW()")
                vals += [laundry_id, prod["productName"]]
                cur.execute(f"UPDATE shop.laundry_products SET {', '.join(sets)} WHERE laundry_id = %s AND product_name = %s", vals)

        for prod in to_add:
            cur.execute("""
                INSERT INTO shop.laundry_products
                    (laundry_id, product_name, description, price, quantity, unit, customer_access)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (laundry_id, product_name) DO UPDATE SET price=EXCLUDED.price, updated_at=NOW()
            """, (laundry_id, prod["productName"], prod.get("description"), prod["price"],
                  prod.get("quantity", 0), prod.get("unit"), prod.get("customerAccess", False)))

        db.commit()
        return {"message": "Products updated successfully"}
    except Exception as e:
        db.rollback()
        raise


# ── promotions ────────────────────────────────────────────────────────────────

def view_promotions(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT promo_code, promo_name, description, discount_type, discount_value,
               apply_on_whole_order, customer_type, minimum_order_value,
               usage_limit_per_customer, is_online_frequency_promo, linked_frequency,
               start_date, end_date, is_active
        FROM shop.promotions WHERE laundry_id = %s
        ORDER BY promotion_id
    """, (laundry_id,))
    rows = cur.fetchall()
    promotions = {}
    today = datetime.now().strftime('%Y-%m-%d')
    for r in rows:
        d = db.serialize_row(r)
        # auto-update isActive based on dates
        if d.get("startDate") and d.get("endDate"):
            d["isActive"] = str(d["startDate"]) <= today <= str(d["endDate"])
        promotions[d.pop("promoCode")] = d
    return {"message": "Promotions retrieved successfully", "promotions": promotions}


def update_promotions(laundry_id, to_add, to_update, to_remove):
    cur = db.get_cursor()
    try:
        for promo_code in to_remove:
            cur.execute("DELETE FROM shop.promotions WHERE laundry_id = %s AND promo_code = %s", (laundry_id, promo_code))

        for promo in to_update:
            promo_code = promo.get("promoCode")
            sets, vals = [], []
            field_map = {
                "promoName": "promo_name", "description": "description",
                "startDate": "start_date", "endDate": "end_date",
                "discountType": "discount_type", "discountValue": "discount_value",
                "applyOnWholeOrder": "apply_on_whole_order", "isActive": "is_active",
                "minimumOrderValue": "minimum_order_value",
                "usageLimitPerCustomer": "usage_limit_per_customer",
            }
            for k, col in field_map.items():
                if k in promo:
                    sets.append(f"{col} = %s"); vals.append(promo[k])
            if sets:
                sets.append("updated_at = NOW()")
                vals += [laundry_id, promo_code]
                cur.execute(f"UPDATE shop.promotions SET {', '.join(sets)} WHERE laundry_id = %s AND promo_code = %s", vals)

        for promo in to_add:
            promo_code = _generate_promo_code(promo["promoName"])
            cur.execute("""
                INSERT INTO shop.promotions (
                    laundry_id, promo_code, promo_name, description,
                    discount_type, discount_value, apply_on_whole_order,
                    customer_type, minimum_order_value, usage_limit_per_customer,
                    is_online_frequency_promo, linked_frequency,
                    start_date, end_date, is_active
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (laundry_id, promo_code) DO NOTHING
            """, (
                laundry_id, promo_code, promo["promoName"], promo.get("description"),
                promo["discountType"], promo["discountValue"],
                promo.get("applyOnWholeOrder", True), promo.get("customerType"),
                promo.get("minimumOrderValue", 0), promo.get("usageLimitPerCustomer"),
                promo.get("isOnlineFrequencyPromo", False), promo.get("linkedFrequency"),
                promo.get("startDate"), promo.get("endDate"), promo.get("isActive", True),
            ))

        db.commit()
        return {"message": "Promotions updated successfully"}
    except Exception as e:
        db.rollback()
        raise


def _generate_promo_code(promo_name):
    cleaned = re.sub(r'[^a-zA-Z0-9]', '', promo_name)
    name_part = cleaned[:3].upper() if len(cleaned) >= 3 else cleaned.upper()
    return (name_part + uuid.uuid4().hex[:3].upper())[:6]


# ── zip codes ─────────────────────────────────────────────────────────────────

def modify_serviceable_zip_codes(laundry_id, to_add=None, to_remove=None):
    cur = db.get_cursor()
    cur.execute("SELECT serviceable_zip_codes FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {"message": f"No record found for laundryId: {laundry_id}"}

    current = list(row["serviceable_zip_codes"] or [])
    updated = list(set(current + (to_add or [])))
    if to_remove:
        updated = [z for z in updated if z not in to_remove]

    cur.execute("UPDATE shop.laundry_shops SET serviceable_zip_codes = %s WHERE laundry_id = %s",
                (json.dumps(updated), laundry_id))
    db.commit()
    return {"message": "Zip codes updated successfully", "updatedZipCodes": updated}


# ── logo / domain update ──────────────────────────────────────────────────────

def process_laundry_update(laundry_id, body):
    sets, vals = [], []
    if body.get("imageBase64"):
        filename = f"{uuid.uuid4().hex}.png"
        image_bytes = base64.b64decode(body["imageBase64"])
        s3_client.put_object(Bucket=UPLOAD_BUCKET, Key=f"{laundry_id}/{filename}",
                             Body=image_bytes, ContentType="image/png")
        image_url = f"https://{UPLOAD_BUCKET}.s3.amazonaws.com/{laundry_id}/{filename}"
        sets.append("laundry_logo = %s"); vals.append(image_url)

    domain = body.get("laundryDomain", {})
    if isinstance(domain, dict):
        if domain.get("adminDomain"):
            sets.append("admin_domain = %s"); vals.append(domain["adminDomain"])
        if domain.get("userDomain"):
            sets.append("user_domain = %s"); vals.append(domain["userDomain"])

    if not sets:
        raise ValueError("At least one of 'imageBase64' or 'laundryDomain' must be provided.")

    sets.append("updated_at = NOW()")
    vals.append(laundry_id)
    cur = db.get_cursor()
    cur.execute(f"UPDATE shop.laundry_shops SET {', '.join(sets)} WHERE laundry_id = %s", vals)
    db.commit()
    return {"message": "Laundry information updated successfully."}


# ── monthly summary ───────────────────────────────────────────────────────────

def get_monthly_summary(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT COUNT(*) AS total_orders, COALESCE(SUM(total_cost), 0) AS total_cost
        FROM orders.orders
        WHERE laundry_id = %s
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    """, (laundry_id,))
    row = cur.fetchone()
    total = int(row["total_orders"])
    cost = float(row["total_cost"])
    return {
        "totalOrders": total,
        "averageCost": round(cost / total, 2) if total else 0,
        "monthlySales": round(cost, 2),
    }


# ── commercial orders ─────────────────────────────────────────────────────────

def commercial_orders(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT order_id, customer_id, order_status, payment_status,
               pickup_date, dropoff_date, total_cost, created_at
        FROM orders.orders
        WHERE laundry_id = %s AND order_type = 'Commercial'
        ORDER BY created_at DESC
    """, (laundry_id,))
    return {"status": "success", "orders": [db.serialize_row(r) for r in cur.fetchall()]}


# ── handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    try:
        params = event.get('queryStringParameters', {}) or {}
        operation = params.get('operation')
        laundry_id = params.get('laundryId')
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)

        if not operation:
            raise ValueError("Missing 'operation' parameter.")
        if not laundry_id:
            raise ValueError("Missing 'laundryId' parameter.")

        if operation == 'viewServices':
            return create_response(200, view_all_services(laundry_id))
        elif operation == 'updateServices':
            result = update_services(laundry_id, body.get('servicesToAdd', []),
                                     body.get('servicesToUpdate', []), body.get('servicesToRemove', []))
            return create_response(200, result)
        elif operation == 'viewAllProducts':
            return create_response(200, view_all_products(laundry_id))
        elif operation == 'updateProducts':
            result = update_products(laundry_id, body.get('productsToAdd', []),
                                     body.get('productsToUpdate', []), body.get('productsToRemove', []))
            return create_response(200, result)
        elif operation == 'viewPromotions':
            return create_response(200, view_promotions(laundry_id))
        elif operation == 'updatePromotions':
            result = update_promotions(laundry_id, body.get('promotionsToAdd', []),
                                       body.get('promotionsToUpdate', []), body.get('promotionsToRemove', []))
            return create_response(200, result)
        elif operation == 'validatePromoCode':
            promo_code = params.get('promoCode')
            promos = view_promotions(laundry_id).get("promotions", {})
            is_valid = promo_code in promos and promos[promo_code].get("isActive")
            return create_response(200, {"isValid": is_valid})
        elif operation == 'viewShopInfo' or operation == 'fetchShopDetails':
            return create_response(200, get_laundry_shop_details(laundry_id))
        elif operation == 'viewLaundryInfoById':
            return create_response(200, get_laundry_info_by_id(laundry_id))
        elif operation == 'monthlySummary':
            return create_response(200, get_monthly_summary(laundry_id))
        elif operation == 'modifyServiceableZipCodes':
            result = modify_serviceable_zip_codes(laundry_id, body.get('zipCodesToAdd'), body.get('zipCodesToRemove'))
            return create_response(200, result)
        elif operation == 'updateLaundryInfo':
            result = process_laundry_update(laundry_id, body)
            return {"statusCode": 200, "body": json.dumps(result)}
        elif operation == 'viewCommercialOrders':
            return create_response(200, commercial_orders(laundry_id))
        elif operation == 'getDriverOrdersByDate':
            return get_driver_orders_by_date_range(event)
        elif operation == 'generateReports':
            start_date = body.get('start_date', '2000-03-12T00:00:00.000000Z')
            end_date   = body.get('end_date',   '2001-03-12T00:00:00.000000Z')
            reports = generate_order_reports(start_date, end_date, laundry_id)
            return create_response(200, reports)
        elif operation == 'viewOrdersByLaundryId':
            start_date = params.get('startDate')
            end_date   = params.get('endDate')
            result = get_orders_by_laundry_id(laundry_id, start_date, end_date)
            return create_response(200, result)
        elif operation == 'viewTipsByLaundryId':
            return view_tips_by_laundry_id(params)
        else:
            return create_response(400, {"error": f"Unsupported operation: {operation}"})

    except ValueError as ve:
        return create_response(400, {"error": str(ve)})
    except Exception as e:
        logger.exception("lambda_handler error")
        return create_response(500, {"error": str(e)})
