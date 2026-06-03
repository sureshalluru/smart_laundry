"""
Orders Information routes — replaces OrdersInformationService Lambda.
Handles order listing, updates, history, payments.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional, List
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize, serialize_row
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from base64 import b64decode, b64encode
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/orders-info")
async def get_orders_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    orderType: str = Query("All"),
    statusCategory: str = Query("Active"),
    lastEvaluatedKey: Optional[str] = None,
    orderId: Optional[str] = None,
    empId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Handles all GET operations from OrdersInformationService."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation in ('active', 'completed', 'canceled'):
            return get_orders_by_status(cur, laundryId, operation, page, limit, orderType)

        elif operation == 'getSingleOrder':
            return get_single_order(cur, laundryId, orderId)

        elif operation in ('fetchServices', 'fetchStatuses'):
            return fetch_laundry_shop_info(cur, laundryId, operation)

        elif operation == 'getOrdersPaginated':
            return get_orders_paginated(cur, laundryId, statusCategory, orderType, lastEvaluatedKey)

        elif operation == 'orderHistory':
            return get_order_history(cur, laundryId, orderId)

        elif operation == 'validateStorePromoCode':
            # TODO: implement promo validation
            return {"body": {"valid": False, "message": "Not implemented yet"}}


@router.get("/single-order-info")
async def get_single_order_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    orderId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Fetch single order details — separate endpoint used by the frontend."""
    with get_db() as conn:
        cur = get_cursor(conn)
        return get_single_order(cur, laundryId, orderId)


@router.post("/validate-emp-credentials")
async def validate_emp_credentials(
    operation: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Validate employee credentials — ported from validateEmployeeCredentials Lambda."""
    ROLE_PERMISSIONS = {
        "Attendant": ["validateEmployeeCredentials"],
        "LaundryCare Specialist": ["validateEmployeeCredentials"],
        "Manager": ["validateEmployeeCredentials", "showAllEmployees", "createEmployee"],
        "Employee": ["validateEmployeeCredentials"],
        "Admin": ["validateEmployeeCredentials"],
        "Delivery Driver": ["validateEmployeeCredentials"],
        "DeliveryDriver": ["validateEmployeeCredentials"],
        "FrontDesk": ["validateEmployeeCredentials"],
    }

    laundry_id = str(body.get("laundryId", ""))
    emp_id = str(body.get("empId", ""))
    passcode = str(body.get("passcode", ""))
    op = operation or "validateEmployeeCredentials"

    logger.info("validate-emp-credentials: laundry=%s emp=%s op=%s", laundry_id, emp_id, op)

    if not laundry_id or not emp_id or not passcode:
        return {"statusCode": 200, "body": {"isValidated": False, "empId": emp_id, "role": None, "error": "Missing required fields"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, role, passcode
            FROM shop.employees
            WHERE emp_id = %s AND laundry_id = %s AND is_active = TRUE
        """, (emp_id, laundry_id))
        emp = cur.fetchone()

        logger.info("validate-emp-credentials: found=%s", emp is not None)

        if not emp:
            return {"statusCode": 200, "body": {"isValidated": False, "empId": emp_id, "role": None, "error": "Invalid credentials"}}

        if str(emp["passcode"]) != passcode:
            return {"statusCode": 200, "body": {"isValidated": False, "empId": emp_id, "role": None, "error": "Invalid credentials"}}

        role = emp["role"]
        # Map DB role names to frontend display names
        role_display_map = {
            "DeliveryDriver": "Delivery Driver",
            "FrontDesk": "FrontDesk",
            "Manager": "Manager",
            "Admin": "Admin",
            "Attendant": "Attendant",
            "LaundryCare Specialist": "LaundryCare Specialist",
        }
        display_role = role_display_map.get(role, role)

        if op in ROLE_PERMISSIONS.get(role, []):
            return {"statusCode": 200, "body": {"isValidated": True, "empId": emp["emp_id"], "role": display_role}}
        else:
            return {"statusCode": 200, "body": {"isValidated": False, "empId": emp_id, "role": display_role, "error": "Unauthorized action for this role"}}


@router.get("/laundry-products-info")
async def get_laundry_products_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Laundry shop info, services, products — used by LaundryInfoManagement."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'viewShopInfo':
            cur.execute("""
                SELECT laundry_id, laundry_name, laundry_logo, laundry_timezone,
                       delivery_time_interval, emp_prefix, admin_domain, user_domain,
                       street, city, state, zip_code, country,
                       contact_email, contact_phone, pickup_dropoff_instructions,
                       stripe_public_key, stripe_terminal_id, serviceable_zip_codes
                FROM shop.laundry_shops WHERE laundry_id = %s
            """, (laundryId,))
            row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "body": {"error": "Shop not found"}}
            addr = f"{row['street']}, {row['city']}, {row['state']}, {row['zip_code']}".strip(", ")
            return {"statusCode": 200, "body": {
                "laundryName": row["laundry_name"],
                "name": row["laundry_name"],
                "email": row["contact_email"],
                "phone": row["contact_phone"],
                "address": addr,
                "domain": {"adminDomain": row["admin_domain"], "userDomain": row["user_domain"]},
                "logo": row["laundry_logo"],
                "stripeTerminalExists": bool(row["stripe_terminal_id"]),
                "empPrefix": row["emp_prefix"],
                "laundryTimezone": row["laundry_timezone"],
                "serviceableZipCodes": row["serviceable_zip_codes"] or [],
                "pickupDropoffInstructions": row["pickup_dropoff_instructions"],
            }}

        elif operation == 'viewLaundryInfoById':
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
            """, (laundryId,))
            row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "body": {"message": "Laundry not found"}}
            result = serialize_row(row)
            # Ensure serviceableZipCodes is always an array
            szc = result.get("serviceableZipCodes")
            if not isinstance(szc, list):
                result["serviceableZipCodes"] = list(szc.keys()) if isinstance(szc, dict) else []
            return {"statusCode": 200, "body": {"message": "Success", "laundryInfo": [result]}}

        elif operation == 'viewServices':
            cur.execute("""
                SELECT service_id, service_name, description, price, input_weight, customer_access
                FROM shop.laundry_services WHERE laundry_id = %s AND is_active = TRUE ORDER BY service_id
            """, (laundryId,))
            services = [serialize_row(r) for r in cur.fetchall()]
            return {"statusCode": 200, "body": {"message": "Services fetched", "services": services}}

        elif operation == 'viewAllProducts':
            cur.execute("""
                SELECT product_id, product_name, description, price, is_active
                FROM shop.laundry_products WHERE laundry_id = %s AND is_active = TRUE ORDER BY product_id
            """, (laundryId,))
            products = [serialize_row(r) for r in cur.fetchall()]
            return {"statusCode": 200, "body": {"message": "Products fetched", "products": products}}

    return {"statusCode": 400, "body": {"message": "Unknown operation"}}


@router.post("/orders-info")
async def post_orders_info(
    operation: str = Query(...),
    laundryId: str = Query(...),
    orderId: Optional[str] = Query(None),
    empId: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Handles all POST operations (order updates, payments)."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == 'updateOrder':
            # TODO: port update_order logic from order_updates.py
            return {"statusCode": 200, "body": {"message": "updateOrder not yet implemented"}}

        elif operation == 'updateOrderInfo':
            # TODO: port update_order_info logic
            return {"statusCode": 200, "body": {"message": "updateOrderInfo not yet implemented"}}

        elif operation == 'captureInStorePayment':
            # TODO: port instore payment logic
            return {"statusCode": 200, "body": {"message": "captureInStorePayment not yet implemented"}}

        elif operation == 'captureInStorePaymentTest':
            # TODO: port test payment logic
            return {"statusCode": 200, "body": {"message": "captureInStorePaymentTest not yet implemented"}}

        elif operation == 'uploadImage':
            # TODO: port image upload logic
            return {"statusCode": 200, "body": {"message": "uploadImage not yet implemented"}}

    return {"statusCode": 400, "body": {"message": "Unknown operation"}}


@router.post("/instore-place-order")
async def instore_place_order(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Place an in-store order — ported from OrderService Lambda."""
    import uuid
    try:
        logger.info("instore-place-order body: %s", json.dumps(body, default=str))
        customer_id = body.get("customerId")
        laundry_id = body.get("laundryId")
        services = body.get("services", [])
        products = body.get("products", [])
        special_instructions = body.get("specialInstructions", "")
        pickup_date = body.get("pickupDate")
        pickup_time_interval = body.get("pickupTimeInterval")
        dropoff_date = body.get("dropoffDate")
        dropoff_time_interval = body.get("dropoffTimeInterval")
        coupon = body.get("coupon")
        total_cost = round(float(str(body.get("totalCost", 0) or 0)), 2)
        sub_total = round(float(str(body.get("subTotal", 0) or 0)), 2)
        grand_total = round(float(str(body.get("grandTotal", 0) or 0)), 2)
        discounted_price = round(float(str(body.get("discountedPrice", 0) or 0)), 2)
        tip_data = body.get("tip", {}) or {}
        laundry_bags = int(body.get("laundryBags", 1) or 1)
        is_pay_now = body.get("isPayNow", False)
        is_cash = body.get("isCash", False)
        card_payment_method_id = body.get("cardPaymentMethodId")
        is_terminal_payment = body.get("isTerminalPayment", False)
        terminal_intent_id = body.get("terminalPaymentIntentId", "")

        if not laundry_id:
            logger.error("Missing params: laundryId=%s", laundry_id)
            return {"status": "error", "message": "Missing required parameter: laundryId"}

        # For instant/walk-in orders without a customer, use a walk-in placeholder
        if not customer_id:
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    SELECT customer_id FROM shop.customers
                    WHERE phone_number = %s LIMIT 1
                """, (f"walkin-{laundry_id}",))
                row = cur.fetchone()
                if row:
                    customer_id = row["customer_id"]
                else:
                    # Create a walk-in customer for this laundry
                    import uuid
                    customer_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO shop.customers (customer_id, phone_number, first_name, last_name, email)
                        VALUES (%s, %s, 'Walk-in', 'Customer', '')
                    """, (customer_id, f"walkin-{laundry_id}"))
            logger.info("Using walk-in customer: %s", customer_id)

        tip_amount = round(float(str(tip_data.get("tipAmount", 0) or 0)), 2)
        order_id = f"IS-{uuid.uuid4().hex[:8].upper()}"
        order_status = "ReceivedAtFacility"
        payment_status = "Unpaid"
        final_payments = []

        # Calculate totals from services/products if not provided
        if sub_total == 0 and (services or products):
            for svc in services:
                price = float(str(svc.get("servicePrice") or svc.get("price", 0) or 0))
                weight = float(str(svc.get("weightOrCount") or svc.get("weight", 0) or 0))
                sub_total += price * weight
            for prod in products:
                price = float(str(prod.get("productPrice") or prod.get("price", 0) or 0))
                count = float(str(prod.get("productCount") or prod.get("count", 1) or 1))
                sub_total += price * count
            sub_total = round(sub_total, 2)

        if total_cost == 0:
            total_cost = sub_total
        if grand_total == 0:
            grand_total = round(total_cost + tip_amount, 2)

        amount_to_collect = grand_total

        # Handle payment
        if is_cash or (is_pay_now and not card_payment_method_id and not is_terminal_payment):
            final_payments = [{"amount": amount_to_collect, "paymentIntentId": None, "paymentMethod": "Cash"}]
            payment_status = "Paid"
        elif is_terminal_payment and terminal_intent_id:
            final_payments = [{"amount": amount_to_collect, "paymentIntentId": terminal_intent_id, "paymentMethod": "Terminal"}]
            payment_status = "Paid"
        elif card_payment_method_id:
            # Charge the card via Stripe
            try:
                from app.services.payment_service import _init_stripe
                import stripe as stripe_lib
                _init_stripe(laundry_id)
                amount_cents = int(round(amount_to_collect * 100))
                payment_intent = stripe_lib.PaymentIntent.create(
                    amount=amount_cents,
                    currency='usd',
                    payment_method=card_payment_method_id,
                    description=f"In-store order {order_id}",
                    confirm=True,
                    automatic_payment_methods={
                        "enabled": True,
                        "allow_redirects": "never",
                    },
                )
                final_payments = [{"amount": amount_to_collect, "paymentIntentId": payment_intent.id, "paymentMethod": "Card"}]
                payment_status = "Paid"
                logger.info(f"Card charged for in-store order {order_id}: {payment_intent.id}, ${amount_to_collect}")
            except Exception as card_err:
                logger.exception(f"Card charge failed for in-store order")
                return {"status": "error", "message": f"Card payment failed: {str(card_err)}"}
        elif is_pay_now:
            final_payments = [{"amount": amount_to_collect, "paymentIntentId": None, "paymentMethod": "Cash"}]
            payment_status = "Paid"

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                INSERT INTO orders.orders (
                    order_id, laundry_id, customer_id,
                    order_type, order_status, status_category, payment_status,
                    pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                    laundry_bags, special_instructions, coupon,
                    sub_total, discounted_price, total_cost, grand_total,
                    auto_generated, is_reviewed, cancel_reason,
                    created_at, updated_at
                ) VALUES (
                    %s,%s,%s,'InStore',%s,'Active',%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    FALSE,FALSE,'',NOW(),NOW()
                )
            """, (
                order_id, laundry_id, customer_id,
                order_status, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, discounted_price, total_cost, grand_total,
            ))

            for svc in services:
                svc_name = svc.get("serviceName") or svc.get("service") or svc.get("name", "")
                cur.execute("""
                    INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                    VALUES (%s,%s,%s,%s)
                """, (order_id, svc_name, float(str(svc.get("servicePrice") or svc.get("price", 0))),
                      float(str(svc.get("weightOrCount") or svc.get("weight", 0)))))

            for prod in products:
                cur.execute("""
                    INSERT INTO orders.order_products (order_id, product_name, product_price, product_count)
                    VALUES (%s,%s,%s,%s)
                """, (order_id, prod.get("productName"), float(str(prod.get("productPrice", 0))),
                      int(prod.get("productCount", 1))))

            if tip_data.get("tipType") or tip_amount > 0:
                cur.execute("""
                    INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (order_id) DO UPDATE SET
                        tip_amount = EXCLUDED.tip_amount, tip_type = EXCLUDED.tip_type
                """, (order_id, tip_amount, tip_data.get("tipPercentage"),
                      tip_data.get("tipType"), tip_data.get("tipMethod")))

            for p in final_payments:
                cur.execute("""
                    INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                    VALUES (%s,%s,%s,%s)
                """, (order_id, p.get("paymentIntentId"), p["amount"], p.get("paymentMethod")))

        return {"status": "success", "orderId": order_id}

    except Exception as e:
        logger.exception("instore_place_order error")
        return {"status": "error", "message": str(e)}


@router.put("/update-order")
async def update_order_endpoint(
    operation: str = Query("updateOrder"),
    orderId: str = Query(...),
    laundryId: str = Query(...),
    empId: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update order — ported from order_updates.py Lambda."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Get current order
            cur.execute("""
                SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
                FROM orders.orders o
                LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                WHERE o.order_id = %s
            """, (orderId,))
            current_order = cur.fetchone()
            if not current_order:
                return {"statusCode": 404, "body": {"message": "Order not found"}}

            # Extract update payload
            order_status = body.get("orderStatus")
            services_to_add = body.get("servicesToAdd", [])
            services_to_remove = body.get("servicesToRemove", [])
            services_to_update = body.get("servicesToUpdate", [])
            products_to_add = body.get("productsToAdd", [])
            products_to_remove = body.get("productsToRemove", [])
            products_to_update = body.get("productsToUpdate", [])
            coupon = body.get("coupon")
            laundry_bags = body.get("laundryBags", current_order["laundry_bags"])

            # Get current services
            cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (orderId,))
            current_services = [dict(r) for r in cur.fetchall()]

            # Get service prices from catalog
            cur.execute("""
                SELECT service_name, price, input_weight FROM shop.laundry_services
                WHERE laundry_id = %s AND is_active = TRUE
            """, (laundryId,))
            service_catalog = {r["service_name"].strip().lower(): r for r in cur.fetchall()}

            # Process service removals (by id)
            remove_ids = [r for r in services_to_remove if isinstance(r, int)]
            if remove_ids:
                for rid in remove_ids:
                    cur.execute("DELETE FROM orders.order_services WHERE id = %s AND order_id = %s", (rid, orderId))

            # Process service updates (by id)
            for svc in services_to_update:
                svc_id = svc.get("id")
                if svc_id:
                    name = svc.get("serviceName") or svc.get("service", "")
                    woc = float(svc.get("weightOrCount", 0))
                    catalog_entry = service_catalog.get(name.strip().lower())
                    price = float(catalog_entry["price"]) if catalog_entry else float(svc.get("servicePrice", 0))
                    cur.execute("""
                        UPDATE orders.order_services
                        SET service_name = %s, service_price = %s, weight_or_count = %s
                        WHERE id = %s AND order_id = %s
                    """, (name, price, woc, svc_id, orderId))

            # Process service additions
            for svc in services_to_add:
                name = svc.get("serviceName") or svc.get("service", "")
                if not name:
                    continue
                woc = float(svc.get("weightOrCount", 0))
                catalog_entry = service_catalog.get(name.strip().lower())
                price = float(catalog_entry["price"]) if catalog_entry else float(svc.get("servicePrice", 0))
                cur.execute("""
                    INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                    VALUES (%s, %s, %s, %s)
                """, (orderId, name, price, woc))

            # Process product changes
            for pid in products_to_remove:
                if isinstance(pid, int):
                    cur.execute("DELETE FROM orders.order_products WHERE id = %s AND order_id = %s", (pid, orderId))
            for prod in products_to_add:
                name = prod.get("productName", "")
                price = float(prod.get("productPrice", 0))
                count = int(prod.get("productCount", 1))
                if name:
                    cur.execute("""
                        INSERT INTO orders.order_products (order_id, product_name, product_price, product_count)
                        VALUES (%s, %s, %s, %s)
                    """, (orderId, name, price, count))
            for prod in products_to_update:
                prod_id = prod.get("id")
                if prod_id:
                    cur.execute("""
                        UPDATE orders.order_products SET product_count = %s WHERE id = %s AND order_id = %s
                    """, (int(prod.get("productCount", 1)), prod_id, orderId))

            # Recalculate totals
            cur.execute("SELECT service_price, weight_or_count FROM orders.order_services WHERE order_id = %s", (orderId,))
            svc_total = sum(float(r["service_price"] or 0) * float(r["weight_or_count"] or 0) for r in cur.fetchall())

            cur.execute("SELECT product_price, product_count FROM orders.order_products WHERE order_id = %s", (orderId,))
            prod_total = sum(float(r["product_price"] or 0) * float(r["product_count"] or 0) for r in cur.fetchall())

            sub_total = round(svc_total + prod_total, 2)
            total_cost = sub_total  # Before discount

            # Tip recalculation
            tip_type = current_order["tip_type"] or "noTip"
            tip_amount = float(current_order["tip_amount"] or 0)
            if tip_type == "percentage":
                pct = float(current_order["tip_percentage"] or 0)
                tip_amount = round(sub_total * (pct / 100), 2)
                cur.execute("""
                    INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET tip_amount = EXCLUDED.tip_amount, tip_receiver_id = EXCLUDED.tip_receiver_id
                """, (orderId, tip_amount, current_order["tip_percentage"], tip_type, current_order["tip_method"], empId))

            grand_total = round(total_cost + tip_amount, 2)

            # Update order record
            update_fields = {
                "total_cost": total_cost,
                "sub_total": sub_total,
                "grand_total": grand_total,
                "laundry_bags": laundry_bags,
                "last_updated_by": empId,
                "updated_at": datetime.now(),
            }
            if order_status:
                update_fields["order_status"] = order_status
                # Update status category
                active_statuses = {"OrderSubmitted", "ReadyForIntake", "ReceivedAtFacility", "ProcessingStarted", "ProcessingCompleted", "EnRouteToDelivery"}
                completed_statuses = {"Delivered", "OrderPickedUp"}
                cancelled_statuses = {"OrderCanceled", "Cancelled"}
                if order_status in active_statuses:
                    update_fields["status_category"] = "Active"
                elif order_status in completed_statuses:
                    update_fields["status_category"] = "Completed"
                elif order_status in cancelled_statuses:
                    update_fields["status_category"] = "Cancelled"

            if coupon is not None:
                update_fields["coupon"] = coupon

            set_clause = ", ".join(f"{k} = %s" for k in update_fields.keys())
            values = list(update_fields.values()) + [orderId]
            cur.execute(f"UPDATE orders.orders SET {set_clause} WHERE order_id = %s", values)

            # Auto-capture payment when order moves to ProcessingCompleted or EnRouteToDelivery (online orders)
            if order_status in ("ProcessingCompleted", "EnRouteToDelivery") and current_order["order_type"] == "Online" and current_order["payment_status"] != "Paid":
                try:
                    customer_id = current_order["customer_id"]
                    # Get customer's Stripe payment ID
                    cur.execute("""
                        SELECT stripe_customer_id FROM shop.customer_payment_profiles
                        WHERE customer_id = %s AND laundry_id = %s
                    """, (customer_id, laundryId))
                    payment_row = cur.fetchone()

                    if payment_row and payment_row["stripe_customer_id"] and grand_total > 0:
                        from app.services.payment_service import capture_payment
                        capture_result = capture_payment(
                            customer_payment_id=payment_row["stripe_customer_id"],
                            price=grand_total,
                            order_id=orderId,
                            description=f"Payment for order {orderId}",
                            customer_id=customer_id,
                            laundry_id=laundryId,
                        )
                        if capture_result.get("status") == "success":
                            # Update payment status to Paid
                            cur.execute("""
                                UPDATE orders.orders SET payment_status = 'Paid', updated_at = NOW()
                                WHERE order_id = %s
                            """, (orderId,))
                            # Record the payment
                            cur.execute("""
                                INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                                VALUES (%s, %s, %s, 'card')
                                ON CONFLICT DO NOTHING
                            """, (orderId, capture_result.get("paymentIntentId"), grand_total))

                            # Cancel the $1 hold since we've now charged the full amount
                            cur.execute("""
                                SELECT payment_intent_id FROM orders.order_payments
                                WHERE order_id = %s AND payment_method = 'hold'
                            """, (orderId,))
                            holds = cur.fetchall()
                            if holds:
                                import stripe
                                from app.services.payment_service import get_stripe_key
                                key, _ = get_stripe_key(laundryId)
                                stripe.api_key = key
                                for hold in holds:
                                    try:
                                        stripe.PaymentIntent.cancel(hold["payment_intent_id"])
                                    except Exception:
                                        pass  # Hold may already be expired

                            logger.info(f"Auto-captured ${grand_total} for order {orderId}")
                        else:
                            logger.warning(f"Auto-capture failed for {orderId}: {capture_result.get('message')}")
                except Exception as capture_err:
                    logger.warning(f"Payment capture error for {orderId}: {capture_err}")

            # Fetch updated order to return
            result = get_single_order(cur, laundryId, orderId)
            return {"statusCode": 200, "body": result.get("body", {})}

    except Exception as e:
        logger.exception("update_order error")
        return {"statusCode": 500, "body": {"message": f"Error updating order: {str(e)}"}}


def get_orders_by_status(cur, laundry_id, operation, page=1, limit=30, order_type='All'):
    """Fetch paginated orders by status — ported from Lambda."""
    ninety_days_ago = (datetime.now() - timedelta(days=90)).isoformat()
    offset = (page - 1) * limit

    # WHERE clause based on operation
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
        return {"body": {"orders": [], "pageInfo": {"page": page, "limit": limit, "totalRecords": 0, "totalPages": 0}}}

    # Order type filter
    if order_type and order_type != 'All':
        where += " AND o.order_type = %s"
        where_params.append(order_type)

    # Sort order
    sort_map = {
        'Online': "o.pickup_date DESC NULLS LAST, CAST(SPLIT_PART(o.pickup_time_interval, ' - ', 1) AS TIME) DESC NULLS LAST",
        'InStore': "o.dropoff_date DESC NULLS LAST, CAST(o.dropoff_time_interval AS TIME) DESC NULLS LAST",
        'Commercial': "o.dropoff_date DESC NULLS LAST, CAST(o.dropoff_time_interval AS TIME) DESC NULLS LAST",
    }
    order_by = sort_map.get(order_type, "o.created_at DESC")

    # Total count
    cur.execute(f"SELECT COUNT(*) AS total FROM orders.orders o WHERE {where}", where_params)
    total_records = cur.fetchone()["total"]
    total_pages = max(1, -(-total_records // limit))

    # Main query with joins
    cur.execute(f"""
        SELECT
            o.*,
            c.first_name, c.last_name, c.phone_number, c.email,
            c.notif_email, c.notif_sms, c.notif_phone,
            cpp.stripe_customer_id AS customer_payment_id,
            ca.address AS customer_address,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                    'orderId', os.order_id, 'serviceName', os.service_name,
                    'servicePrice', os.service_price, 'weightOrCount', os.weight_or_count
                )) FILTER (WHERE os.id IS NOT NULL), '[]'
            ) AS services,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                    'orderId', op.order_id, 'paymentIntentId', op.payment_intent_id,
                    'amount', op.amount, 'paymentMethod', op.payment_method,
                    'createdAt', op.created_at
                )) FILTER (WHERE op.id IS NOT NULL), '[]'
            ) AS payments,
            jsonb_build_object(
                'tipAmount', ot.tip_amount, 'tipPercentage', ot.tip_percentage,
                'tipType', ot.tip_type, 'tipMethod', ot.tip_method,
                'tipReceiverId', ot.tip_receiver_id
            ) AS tip
        FROM orders.orders o
        JOIN shop.customers c ON c.customer_id = o.customer_id
        LEFT JOIN shop.customer_payment_profiles cpp
          ON cpp.customer_id = o.customer_id AND cpp.laundry_id = o.laundry_id
        LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
        LEFT JOIN orders.order_services os ON os.order_id = o.order_id
        LEFT JOIN orders.order_payments op ON op.order_id = o.order_id
        LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
        WHERE {where}
        GROUP BY o.order_id, c.customer_id, cpp.stripe_customer_id,
                 ca.address, ot.tip_amount, ot.tip_percentage,
                 ot.tip_type, ot.tip_method, ot.tip_receiver_id
        ORDER BY {order_by}
        LIMIT %s OFFSET %s
    """, where_params + [limit, offset])

    rows = cur.fetchall()

    # Get laundry name
    cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
    shop = cur.fetchone()
    laundry_name = shop["laundry_name"] if shop else "N/A"

    # Format results
    detailed_orders = []
    for r in rows:
        services = [serialize(s) for s in (r["services"] or [])]
        payments = [serialize(p) for p in (r["payments"] or [])]
        tip = serialize(r["tip"] or {})

        grand_total = Decimal(str(r["grand_total"] or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        paid_amount = sum(Decimal(str(p.get("amount", 0))).quantize(Decimal('0.01')) for p in payments)
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
            "createdAt": serialize(r["created_at"]),
            "dropoffDate": serialize(r["dropoff_date"]),
            "dropoffTimeInterval": r["dropoff_time_interval"],
            "frequency": r["frequency"],
            "laundryName": laundry_name,
            "orderStatus": r["order_status"],
            "cancelReason": r["cancel_reason"],
            "paymentStatus": r["payment_status"],
            "pickupDate": serialize(r["pickup_date"]),
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
            "updatedAt": serialize(r["updated_at"]),
            "lastUpdatedBy": r["last_updated_by"],
            "customerPaymentId": r["customer_payment_id"] or "",
            "imageUrl": r["image_url"],
            "balanceDue": float(balance_due),
            "paidAmount": float(paid_amount),
        })

    return {
        "statusCode": 200,
        "body": detailed_orders,
        "pageInfo": {
            "page": page, "limit": limit,
            "totalRecords": total_records, "totalPages": total_pages,
            "orderType": order_type,
            "sortedBy": {'Online': 'pickupDate + pickupTime', 'InStore': 'dropoffDate + dropoffTime', 'Commercial': 'dropoffDate + dropoffTime'}.get(order_type, 'createdAt'),
        }
    }


def get_single_order(cur, laundry_id, order_id):
    """Fetch single order with full details — ported from Lambda utils.py."""
    try:
        cur.execute("""
            SELECT o.*,
                   ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
            FROM orders.orders o
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.order_id = %s
        """, (order_id,))
        order = cur.fetchone()
        if not order:
            return {"statusCode": 404, "body": {"message": "Order not found"}}

        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (order_id,))
        services = []
        for r in cur.fetchall():
            services.append({
                "id": r["id"],
                "orderId": r["order_id"],
                "service": r["service_name"],
                "serviceName": r["service_name"],
                "servicePrice": float(r["service_price"]) if r["service_price"] else 0,
                "weightOrCount": float(r["weight_or_count"]) if r["weight_or_count"] else 0,
            })

        cur.execute("SELECT * FROM orders.order_products WHERE order_id = %s", (order_id,))
        products = [serialize_row(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (order_id,))
        payments = [serialize_row(r) for r in cur.fetchall()]

        # Laundry name
        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id or order["laundry_id"],))
        shop = cur.fetchone()
        laundry_name = shop["laundry_name"] if shop else "N/A"

        # Customer details
        customer_name = "N/A"
        customer_phone = "N/A"
        customer_email = "N/A"
        customer_address = "N/A"
        customer_notification = {}
        customer_payment_id = ""

        customer_id = order["customer_id"]
        cur.execute("""
            SELECT first_name, last_name, phone_number, email,
                   notif_email, notif_sms, notif_phone
            FROM shop.customers WHERE customer_id = %s
        """, (customer_id,))
        cust = cur.fetchone()
        if cust:
            customer_name = f"{cust['first_name']} {cust['last_name']}".strip()
            customer_phone = cust["phone_number"]
            customer_email = cust["email"]
            customer_notification = {
                "email": cust["notif_email"],
                "sms": cust["notif_sms"],
                "phone": cust["notif_phone"],
            }

        # Payment profile
        cur.execute("""
            SELECT stripe_customer_id FROM shop.customer_payment_profiles
            WHERE customer_id = %s AND laundry_id = %s
        """, (customer_id, order["laundry_id"]))
        pp = cur.fetchone()
        if pp:
            customer_payment_id = pp["stripe_customer_id"] or ""

        # Address
        if order["address_id"]:
            cur.execute("""
                SELECT address, door_number, address_instructions
                FROM shop.customer_addresses WHERE address_id = %s
            """, (order["address_id"],))
            addr = cur.fetchone()
            if addr:
                customer_address = {
                    "address": addr["address"] or "",
                    "doorNumber": addr["door_number"] or "",
                    "addressInstructions": addr["address_instructions"] or "",
                }

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
            "customerNotification": customer_notification,
            "customerPaymentId": customer_payment_id,
            "balanceDue": balance_due,
            "cancelReason": order["cancel_reason"],
        }
        return {"statusCode": 200, "body": result}

    except Exception as e:
        logger.exception("get_single_order error")
        return {"statusCode": 500, "body": {"message": str(e)}}


def get_orders_paginated(cur, laundry_id, status_category, order_type, last_key):
    """Admin paginated view with cursor."""
    offset = 0
    limit = 50
    if last_key:
        try:
            decoded = b64decode(last_key)
            offset = int(json.loads(decoded))
        except Exception:
            offset = 0

    query = """
        SELECT o.order_id, o.order_type, o.order_status, o.payment_status,
               o.pickup_date, o.pickup_time_interval, o.dropoff_date, o.dropoff_time_interval,
               o.created_at, o.grand_total, o.customer_id,
               c.first_name, c.last_name, c.phone_number
        FROM orders.orders o
        JOIN shop.customers c ON c.customer_id = o.customer_id
        WHERE o.laundry_id = %s AND o.status_category = %s
    """
    params = [laundry_id, status_category]

    if order_type != 'All':
        query += " AND o.order_type = %s"
        params.append(order_type)

    query += " ORDER BY o.created_at DESC LIMIT %s OFFSET %s"
    params += [limit, offset]

    cur.execute(query, params)
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

    return {"body": {
        "status": "success",
        "orders": formatted,
        "lastEvaluatedKey": encoded_key,
        "count": len(formatted),
        "hasMore": next_offset is not None,
    }}


def fetch_laundry_shop_info(cur, laundry_id, operation):
    """Fetch services or statuses."""
    if operation == 'fetchServices':
        cur.execute("""
            SELECT service_name, price, description, input_weight, customer_access
            FROM shop.laundry_services WHERE laundry_id = %s AND is_active = TRUE
        """, (laundry_id,))
        services = [serialize_row(r) for r in cur.fetchall()]
        return {"statusCode": 200, "body": {"message": "Services fetched successfully", "data": services}}
    elif operation == 'fetchStatuses':
        statuses = ['OrderSubmitted', 'ReadyForIntake', 'ReceivedAtFacility', 'ProcessingStarted',
                    'ProcessingCompleted', 'EnRouteToDelivery', 'Delivered', 'OrderPickedUp', 'Cancelled']
        return {"statusCode": 200, "body": {"message": "Statuses fetched successfully", "data": statuses}}


def get_order_history(cur, laundry_id, order_id):
    """Fetch order audit history from DB triggers."""
    try:
        cur.execute("""
            SELECT history_id, emp_id, emp_name, action,
                   field_changed, old_value, new_value,
                   change_summary, changed_at
            FROM orders.order_history
            WHERE order_id = %s AND laundry_id = %s
            ORDER BY changed_at ASC
        """, (order_id, laundry_id))
        rows = cur.fetchall()
        if not rows:
            return {"body": {"message": "No history found for the given order."}}
        return {"body": {
            "orderId": order_id,
            "history": [{
                "historyId": str(r['history_id']),
                "employeeId": r['emp_id'],
                "employeeName": r['emp_name'] or 'System',
                "action": r['action'],
                "fieldChanged": r['field_changed'],
                "oldValue": r['old_value'],
                "newValue": r['new_value'],
                "changeSummary": r['change_summary'],
                "changedAt": str(r['changed_at']),
            } for r in rows]
        }}
    except Exception as e:
        logger.exception("get_order_history error")
        return {"body": {"message": f"Error: {str(e)}"}}
