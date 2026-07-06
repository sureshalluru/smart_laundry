"""
Orders Information routes — replaces OrdersInformationService Lambda.
Handles order listing, updates, history, payments.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional, List
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize, serialize_row
from app.services.payment_service import check_payment_gate
from app.utils.invoice_helpers import resolve_invoice_emails
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
    searchQuery: Optional[str] = None,
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

        elif operation == 'searchOrders':
            return search_orders(cur, laundryId, searchQuery or orderId or '')


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


@router.get("/employee-order-info")
async def get_employee_order_info(
    laundryId: str = Query(...),
    orderId: str = Query(...),
):
    """Fetch single order details for employee mobile view — no admin auth required.
    Employee authentication is handled client-side via EmployeeAuthContext.
    Only returns order data if the order belongs to the specified laundry."""
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
        "Admin": ["validateEmployeeCredentials", "showAllEmployees", "createEmployee"],
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
            WHERE UPPER(emp_id) = UPPER(%s) AND laundry_id = %s AND is_active = TRUE
        """, (emp_id, laundry_id))
        emp = cur.fetchone()

        logger.info("validate-emp-credentials: emp_id=%s laundry_id=%s found=%s", emp_id, laundry_id, emp is not None)
        if emp:
            logger.info("validate-emp-credentials: db_passcode='%s' input_passcode='%s' match=%s", emp["passcode"], passcode, str(emp["passcode"]) == passcode)

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
                SELECT service_id, service_name, description, price, input_weight, customer_access, category_id
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

        elif operation == 'viewPromotions':
            cur.execute("""
                SELECT * FROM shop.promotions WHERE laundry_id = %s ORDER BY created_at DESC
            """, (laundryId,))
            # Frontend expects: { promotions: { "CODE1": {...}, "CODE2": {...} } }
            promos = {}
            for r in cur.fetchall():
                code = r["promo_code"]
                promos[code] = {
                    "promoName": r["promo_name"] or "",
                    "description": r["description"] or "",
                    "discountType": r["discount_type"] or "percentage",
                    "discountValue": float(r["discount_value"]) if r["discount_value"] else 0,
                    "minimumOrderValue": float(r["minimum_order_value"]) if r["minimum_order_value"] else 0,
                    "appliedOn": "wholeOrder" if r["apply_on_whole_order"] else "specificServices",
                    "isActive": r["is_active"],
                    "linkedFrequency": r["linked_frequency"],
                    "isOnlineFrequencyPromo": r["is_online_frequency_promo"],
                    "startDate": str(r["start_date"]) if r["start_date"] else "",
                    "endDate": str(r["end_date"]) if r["end_date"] else "",
                }
            return {"statusCode": 200, "body": {"message": "Promotions fetched", "promotions": promos}}

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
            # Update order delivery info (dropoff service, address, date, etc.)
            dropoff_service = body.get("dropoffService")
            dropoff_address = body.get("dropoffAddress")
            dropoff_date = body.get("dropoffDate")

            logger.info(f"updateOrderInfo: orderId={orderId}, dropoffService={dropoff_service}, dropoffAddress={dropoff_address}, dropoffDate={dropoff_date}")

            if not dropoff_service and not dropoff_address and not dropoff_date:
                return {"statusCode": 200, "body": {"message": "No changes detected."}}

            with get_db() as conn:
                cur = get_cursor(conn)

                update_parts = []
                params = []

                if dropoff_service:
                    update_parts.append("dropoff_service = %s")
                    params.append(dropoff_service)

                if dropoff_date:
                    update_parts.append("dropoff_date = %s")
                    params.append(dropoff_date)

                if dropoff_address:
                    # Save or update the delivery address
                    cur.execute("SELECT address_id, customer_id FROM orders.orders WHERE order_id = %s", (orderId,))
                    order_row = cur.fetchone()
                    customer_id = order_row["customer_id"] if order_row else None
                    existing_address_id = order_row["address_id"] if order_row else None

                    if existing_address_id:
                        # Update existing address
                        cur.execute("""
                            UPDATE shop.customer_addresses SET address = %s, updated_at = NOW()
                            WHERE address_id = %s
                        """, (dropoff_address, existing_address_id))
                    else:
                        # Create new address and link to order
                        import uuid
                        new_address_id = str(uuid.uuid4())[:12]
                        cur.execute("""
                            INSERT INTO shop.customer_addresses (address_id, customer_id, address)
                            VALUES (%s, %s, %s)
                        """, (new_address_id, customer_id, dropoff_address))
                        update_parts.append("address_id = %s")
                        params.append(new_address_id)

                if update_parts:
                    update_parts.append("updated_at = NOW()")
                    params.append(orderId)
                    cur.execute(f"""
                        UPDATE orders.orders SET {', '.join(update_parts)}
                        WHERE order_id = %s
                    """, params)

            return {"statusCode": 200, "body": {"message": "Order delivery info updated successfully."}}

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
        pickup_date = body.get("pickupDate") or None
        pickup_time_interval = body.get("pickupTimeInterval") or None
        dropoff_date = body.get("dropoffDate") or None
        dropoff_time_interval = body.get("dropoffTimeInterval") or None
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

            # Determine order type and pay_by_invoice based on account commercial status
        # order_type = channel (InStore), pay_by_invoice = TRUE if account is commercial
        order_type = "InStore"
        pay_by_invoice = body.get("payByInvoice", False)

        # Check if customer account is commercial
        if customer_id:
            with get_db() as conn_comm:
                cur_comm = get_cursor(conn_comm)
                cur_comm.execute(
                    "SELECT is_commercial FROM shop.customers WHERE customer_id = %s",
                    (customer_id,),
                )
                comm_row = cur_comm.fetchone()
                if comm_row and comm_row.get("is_commercial"):
                    pay_by_invoice = True
                    logger.info(f"Commercial account detected in instore order: customer_id={customer_id}, order_type=InStore, pay_by_invoice=True")

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

        # Apply tax if configured
        tax_amount = 0
        try:
            with get_db() as conn_tax:
                cur_tax = get_cursor(conn_tax)
                cur_tax.execute("SELECT tax_rate FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                tax_row = cur_tax.fetchone()
                tax_rate = float(tax_row["tax_rate"] or 0) if tax_row else 0
            if tax_rate > 0:
                tax_amount = round(total_cost * (tax_rate / 100), 2)
                grand_total = round(total_cost + tip_amount + tax_amount, 2)
        except Exception as tax_err:
            logger.warning(f"Tax calculation error: {tax_err}")

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
                    metadata={
                        "order_id": order_id,
                        "laundry_id": laundry_id,
                        "customer_id": customer_id or "",
                        "type": "instore",
                    },
                )
                final_payments = [{"amount": amount_to_collect, "paymentIntentId": payment_intent.id, "paymentMethod": "Card"}]
                payment_status = "Paid"
                logger.info(f"Card charged for in-store order {order_id}: {payment_intent.id}, ${amount_to_collect}")
            except Exception as card_err:
                logger.exception(f"Card charge failed for in-store order")
                return {"status": "error", "message": f"Card payment failed: {str(card_err)}"}
        elif is_pay_now:
            # Pay-now requested but no direct card_payment_method_id — try charging saved card on file
            try:
                from app.services.payment_service import capture_payment
                with get_db() as conn_pp:
                    cur_pp = get_cursor(conn_pp)
                    cur_pp.execute("""
                        SELECT stripe_customer_id FROM shop.customer_payment_profiles
                        WHERE customer_id = %s AND laundry_id = %s
                    """, (customer_id, laundry_id))
                    pp_row = cur_pp.fetchone()

                if pp_row and pp_row.get("stripe_customer_id"):
                    charge_result = capture_payment(
                        customer_payment_id=pp_row["stripe_customer_id"],
                        price=amount_to_collect,
                        order_id=order_id,
                        description=f"In-store pay-now order {order_id}",
                        customer_id=customer_id,
                        laundry_id=laundry_id,
                    )
                    if charge_result.get("status") == "success":
                        final_payments = [{"amount": amount_to_collect, "paymentIntentId": charge_result.get("paymentIntentId"), "paymentMethod": "Card"}]
                        payment_status = "Paid"
                        logger.info(f"Charged saved card for in-store order {order_id}: {charge_result.get('paymentIntentId')}")
                    else:
                        # Card charge failed — leave Unpaid, customer will need to pay via link
                        logger.warning(f"Saved card charge failed for order {order_id}: {charge_result.get('message')}")
                        payment_status = "Unpaid"
                else:
                    # No saved card on file — leave Unpaid
                    logger.warning(f"is_pay_now=True but no saved card for customer {customer_id}, order {order_id}")
                    payment_status = "Unpaid"
            except Exception as pay_now_err:
                logger.exception(f"Pay-now charge error for order {order_id}")
                payment_status = "Unpaid"

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                INSERT INTO orders.orders (
                    order_id, laundry_id, customer_id,
                    order_type, order_status, status_category, payment_status,
                    pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                    laundry_bags, special_instructions, coupon,
                    sub_total, discounted_price, total_cost, grand_total, tax_amount,
                    pay_by_invoice,
                    auto_generated, is_reviewed, cancel_reason,
                    created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,'Active',%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,FALSE,FALSE,'',NOW(),NOW()
                )
            """, (
                order_id, laundry_id, customer_id,
                order_type, order_status, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, discounted_price, total_cost, grand_total, tax_amount,
                pay_by_invoice,
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

        return {"status": "success", "orderId": order_id, "grandTotal": grand_total, "taxAmount": tax_amount}

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

            # Process service removals (by id or service name)
            remove_ids = [r for r in services_to_remove if isinstance(r, int)]
            remove_names = [r for r in services_to_remove if isinstance(r, str)]
            if remove_ids:
                for rid in remove_ids:
                    cur.execute("DELETE FROM orders.order_services WHERE id = %s AND order_id = %s", (rid, orderId))
            if remove_names:
                for rname in remove_names:
                    cur.execute("DELETE FROM orders.order_services WHERE service_name = %s AND order_id = %s", (rname, orderId))

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

            # Apply discount if coupon exists — always recalculate based on new subtotal
            discounted_price = 0
            coupon_code = coupon if coupon is not None else current_order.get("coupon")
            if coupon_code:
                # Recalculate discount from promo based on updated subtotal
                cur.execute("""
                    SELECT discount_type, discount_value, minimum_order_value
                    FROM shop.promotions WHERE laundry_id = %s AND promo_code = %s AND is_active = TRUE
                """, (laundryId, coupon_code))
                promo = cur.fetchone()
                if promo and sub_total >= float(promo["minimum_order_value"] or 0):
                    if promo["discount_type"] == "percentage":
                        discounted_price = round(sub_total * (float(promo["discount_value"] or 0) / 100), 2)
                    else:
                        discounted_price = min(float(promo["discount_value"] or 0), sub_total)

            if discounted_price > 0:
                total_cost = round(sub_total - discounted_price, 2)

            # Tip recalculation
            tip_type = current_order["tip_type"] or "noTip"
            tip_amount = float(current_order["tip_amount"] or 0)
            if tip_type == "percentage":
                pct = float(current_order["tip_percentage"] or 0)
                tip_amount = round(sub_total * (pct / 100), 2)
                tip_receiver = empId if empId else current_order.get("tip_receiver_id") or None
                cur.execute("""
                    INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET tip_amount = EXCLUDED.tip_amount, tip_receiver_id = COALESCE(EXCLUDED.tip_receiver_id, orders.order_tips.tip_receiver_id)
                """, (orderId, tip_amount, current_order["tip_percentage"], tip_type, current_order["tip_method"], tip_receiver))

            grand_total = round(total_cost + tip_amount, 2)

            # Update order record
            update_fields = {
                "total_cost": total_cost,
                "sub_total": sub_total,
                "grand_total": grand_total,
                "discounted_price": discounted_price,
                "laundry_bags": laundry_bags,
                "updated_at": datetime.now(),
            }
            # Save total_weight if provided (for per-bag orders to record weight for records)
            total_weight = body.get("totalWeight")
            if total_weight is not None:
                update_fields["total_weight"] = float(total_weight)
            if empId:
                update_fields["last_updated_by"] = empId
            if order_status:
                # Payment gate check — block gated status transitions for unpaid orders
                gate_result = check_payment_gate(current_order, order_status, laundryId)
                if not gate_result.get("allowed"):
                    return {"statusCode": 400, "body": {"message": gate_result["error"]}}
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

            # Handle delivery scheduling (dropoff service, address, date)
            dropoff_service = body.get("dropoffService")
            dropoff_address = body.get("dropoffAddress")
            dropoff_date = body.get("dropoffDate")

            if dropoff_service:
                update_fields["dropoff_service"] = dropoff_service
            if dropoff_date:
                update_fields["dropoff_date"] = dropoff_date

            # Save/create delivery address if provided
            if dropoff_address:
                existing_address_id = current_order.get("address_id")
                customer_id = current_order.get("customer_id")
                if existing_address_id:
                    cur.execute("""
                        UPDATE shop.customer_addresses SET address = %s, updated_at = NOW()
                        WHERE address_id = %s
                    """, (dropoff_address, existing_address_id))
                else:
                    import uuid
                    new_address_id = str(uuid.uuid4())[:12]
                    cur.execute("""
                        INSERT INTO shop.customer_addresses (address_id, customer_id, address)
                        VALUES (%s, %s, %s)
                    """, (new_address_id, customer_id, dropoff_address))
                    update_fields["address_id"] = new_address_id
                logger.info(f"Delivery scheduled for {orderId}: service={dropoff_service}, date={dropoff_date}, address={dropoff_address}")

            set_clause = ", ".join(f"{k} = %s" for k in update_fields.keys())
            values = list(update_fields.values()) + [orderId]
            cur.execute(f"UPDATE orders.orders SET {set_clause} WHERE order_id = %s", values)

            # Audit log for order updates
            try:
                from app.services.audit_service import log_action
                log_action(laundryId, "update_order", "order", orderId, {
                    "status": order_status,
                    "fields_updated": list(update_fields.keys()),
                }, performed_by=empId or "")
            except Exception: pass

            # Notify customer when order is canceled via status change
            if order_status in ("OrderCanceled", "Cancelled"):
                try:
                    from app.routes.customer_public import _send_cancel_notification
                    _send_cancel_notification(orderId, laundryId, current_order.get("customer_id"), "", cancelled_by="admin")
                except Exception as cancel_notif_err:
                    logger.warning(f"Cancel notification failed for {orderId}: {cancel_notif_err}")

            # Auto-notify customer when status changes to ProcessingCompleted
            if order_status == "ProcessingCompleted":
                try:
                    from app.services.notification_service import send_email, send_sms
                    customer_id_for_notif = current_order["customer_id"]
                    cur.execute("""
                        SELECT first_name, email, phone_number, notif_email, notif_phone
                        FROM shop.customers WHERE customer_id = %s
                    """, (customer_id_for_notif,))
                    cust = cur.fetchone()
                    cur.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
                    shop = cur.fetchone()

                    if cust and shop:
                        laundry_name = shop["laundry_name"]
                        first_name = cust["first_name"] or "Customer"
                        is_paid = current_order["payment_status"] == "Paid" or (order_status == "ProcessingCompleted" and current_order["order_type"] == "Online")

                        # Payment link (only if unpaid)
                        payment_link = ""
                        # Get user domain for this laundry
                        cur.execute("SELECT user_domain FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
                        domain_row = cur.fetchone()
                        base_url = domain_row["user_domain"] if domain_row and domain_row["user_domain"] else "https://www.smartlaundrybasket.ai"
                        if not is_paid:
                            payment_link = f"\n\nPay Now: {base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"

                        # Email
                        if cust.get("notif_email", True) and cust["email"]:
                            payment_html = ""
                            if not is_paid:
                                pay_url = f"{base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"
                                payment_html = f'<p><a href="{pay_url}" style="background:#4299E1;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;">Pay Now — ${grand_total:.2f}</a></p>'

                            html_body = f"""
                            <h2>Your laundry is ready! 🎉</h2>
                            <p>Hi {first_name},</p>
                            <p>Great news! Your laundry order <strong>{orderId}</strong> has been processed and is ready.</p>
                            <table style="border-collapse:collapse;width:100%;max-width:400px;">
                                <tr><td style="padding:8px;font-weight:bold;">Order</td><td>{orderId}</td></tr>
                                <tr><td style="padding:8px;font-weight:bold;">Total</td><td>${grand_total:.2f}</td></tr>
                                <tr><td style="padding:8px;font-weight:bold;">Status</td><td>{'Paid ✓' if is_paid else 'Payment Pending'}</td></tr>
                            </table>
                            {payment_html}
                            <p>Thank you for choosing {laundry_name}!</p>
                            """
                            send_email(cust["email"], f"Your Laundry is Ready - {orderId}", html_body,
                                      sender_name=laundry_name,
                                      reply_to=shop.get("contact_email") or None)

                        # SMS
                        if cust.get("notif_phone", True) and cust["phone_number"]:
                            sms = f"Hi {first_name}! Your laundry order {orderId} is ready. Total: ${grand_total:.2f}."
                            if not is_paid:
                                sms += f" Pay here: {base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"
                            sms += f" - {laundry_name}"
                            send_sms(cust["phone_number"], sms)

                        logger.info(f"Auto-notification sent for {orderId} (ProcessingCompleted, paid={is_paid})")
                except Exception as notif_err:
                    logger.warning(f"Auto-notification error for {orderId}: {notif_err}")

            # Auto-send Stripe Invoice for pay-by-invoice orders at ProcessingCompleted
            if order_status == "ProcessingCompleted" and current_order.get("pay_by_invoice"):
                try:
                    import stripe
                    from app.services.payment_service import _init_stripe
                    _init_stripe(laundryId)

                    # Get customer email and billing_email for dual-email resolution
                    cur.execute("SELECT email, billing_email, first_name, last_name, phone_number FROM shop.customers WHERE customer_id = %s", (current_order["customer_id"],))
                    inv_cust = cur.fetchone()
                    cur.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
                    inv_shop = cur.fetchone()

                    # Resolve invoice recipient list using dual-email logic
                    invoice_emails = resolve_invoice_emails(inv_cust) if inv_cust else []

                    if not invoice_emails:
                        logger.warning(f"Cannot auto-invoice {orderId}: no customer email resolved (both account_email and billing_email empty)")
                    else:
                        # First email in list is the primary Stripe invoice recipient
                        # (billing_email if set, otherwise account_email)
                        primary_email = invoice_emails[0]

                        # Find or create Stripe customer using primary email
                        existing = stripe.Customer.list(email=primary_email, limit=1)
                        stripe_cust = existing.data[0] if existing.data else stripe.Customer.create(
                            email=primary_email,
                            name=f"{inv_cust['first_name'] or ''} {inv_cust['last_name'] or ''}".strip(),
                            phone=inv_cust["phone_number"] or "",
                        )

                        # Create invoice
                        invoice = stripe.Invoice.create(
                            customer=stripe_cust.id,
                            collection_method="send_invoice",
                            days_until_due=30,
                            description=f"Invoice for order {orderId} - {inv_shop['laundry_name'] if inv_shop else 'Laundry'}",
                            metadata={"order_id": orderId, "laundry_id": laundryId},
                        )

                        # Add line items
                        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (orderId,))
                        for svc in cur.fetchall():
                            amt = int(round(float(svc["service_price"] or 0) * float(svc["weight_or_count"] or 0) * 100))
                            if amt > 0:
                                stripe.InvoiceItem.create(customer=stripe_cust.id, invoice=invoice.id, amount=amt, currency="usd",
                                    description=f"{svc['service_name']} ({svc['weight_or_count']} lbs)")

                        if not grand_total or grand_total == 0:
                            pass  # No items to invoice
                        elif not cur.rowcount:
                            stripe.InvoiceItem.create(customer=stripe_cust.id, invoice=invoice.id,
                                amount=int(round(grand_total * 100)), currency="usd",
                                description=f"Laundry service - Order {orderId}")

                        # Finalize and send
                        stripe.Invoice.finalize_invoice(invoice.id)
                        stripe.Invoice.send_invoice(invoice.id)

                        # Update order
                        cur.execute("UPDATE orders.orders SET payment_status = 'Invoice Sent', stripe_invoice_id = %s WHERE order_id = %s",
                                    (invoice.id, orderId))
                        logger.info(f"Auto-invoice sent for order {orderId} to {primary_email}")

                        # Send informational notification to second email (if exists)
                        # This notifies the account_email holder about the invoice when
                        # billing_email is the primary recipient, or vice versa.
                        if len(invoice_emails) > 1:
                            secondary_email = invoice_emails[1]
                            try:
                                from app.services.notification_service import send_email
                                laundry_name = inv_shop["laundry_name"] if inv_shop else "Laundry"
                                invoice_url = invoice.hosted_invoice_url or ""
                                html_body = f"""
                                <h2>Invoice Notification - {laundry_name}</h2>
                                <p>An invoice for order <strong>{orderId}</strong> has been sent.</p>
                                <p>Amount: ${grand_total:.2f}</p>
                                {f'<p><a href="{invoice_url}" style="background:#4299E1;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Invoice</a></p>' if invoice_url else ''}
                                <p style="color:#777;font-size:13px;">This is an informational copy. The invoice payment link was sent to {primary_email}.</p>
                                """
                                send_email(
                                    secondary_email,
                                    f"Invoice sent for order {orderId} - {laundry_name}",
                                    html_body,
                                    sender_name=laundry_name,
                                    reply_to=inv_shop.get("contact_email") if inv_shop else None,
                                )
                                logger.info(f"Invoice notification sent to secondary email {secondary_email} for order {orderId}")
                            except Exception as notif_err:
                                logger.warning(f"Failed to send invoice notification to {secondary_email} for {orderId}: {notif_err}")
                except Exception as inv_err:
                    logger.warning(f"Auto-invoice error for {orderId}: {inv_err}")

            # Auto-notify for review when order is picked up / delivered
            if order_status in ("OrderPickedUp", "Delivered"):
                try:
                    from app.services.notification_service import send_email, send_sms
                    customer_id_for_review = current_order["customer_id"]
                    cur.execute("""
                        SELECT first_name, email, phone_number, notif_email, notif_phone
                        FROM shop.customers WHERE customer_id = %s
                    """, (customer_id_for_review,))
                    cust = cur.fetchone()
                    cur.execute("SELECT laundry_name, user_domain, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
                    shop = cur.fetchone()

                    # Get who processed the laundry (employee who set status to ProcessingCompleted)
                    processed_by = ""
                    processor_name = ""
                    cur.execute("""
                        SELECT emp_id, emp_name FROM orders.order_history
                        WHERE order_id = %s AND new_value = 'ProcessingCompleted'
                        ORDER BY changed_at DESC LIMIT 1
                    """, (orderId,))
                    hist_row = cur.fetchone()
                    if hist_row:
                        processor_name = hist_row["emp_name"] or ""
                        processed_by = hist_row["emp_id"] or ""
                    
                    # Fallback: if no history, use last_updated_by
                    if not processor_name and (current_order.get("last_updated_by") or empId):
                        fallback_id = current_order.get("last_updated_by") or empId
                        cur.execute("SELECT first_name, last_name FROM shop.employees WHERE emp_id = %s", (fallback_id,))
                        emp_row = cur.fetchone()
                        if emp_row:
                            processor_name = f"{emp_row['first_name']} {emp_row['last_name'] or ''}".strip()

                    if cust and shop:
                        laundry_name = shop["laundry_name"]
                        base_url = shop["user_domain"] or "https://www.smartlaundrybasket.ai"
                        first_name = cust["first_name"] or "Customer"
                        review_url = f"{base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"

                        processed_msg = f" Your laundry was handled by <strong>{processor_name}</strong>." if processor_name else ""

                        if cust.get("notif_email", True) and cust["email"]:
                            html_body = f"""
                            <h2>Thank you for choosing {laundry_name}! 🙏</h2>
                            <p>Hi {first_name},</p>
                            <p>Your laundry order <strong>{orderId}</strong> is complete.{processed_msg}</p>
                            <p>We'd love to hear how we did! Your feedback helps us improve.</p>
                            <p><a href="{review_url}" style="background:#4299E1;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Leave a Review</a></p>
                            <p style="color:#777;font-size:13px;">Thank you for your business! — {laundry_name} Team</p>
                            """
                            send_email(cust["email"], f"How was your experience? - {laundry_name}", html_body,
                                      sender_name=laundry_name,
                                      reply_to=shop.get("contact_email") or None)

                        if cust.get("notif_phone", True) and cust["phone_number"]:
                            sms = f"Hi {first_name}! Your order {orderId} is complete."
                            if processor_name:
                                sms += f" Handled by {processor_name}."
                            sms += f" We'd love a review: {review_url} - {laundry_name}"
                            send_sms(cust["phone_number"], sms)

                        logger.info(f"Review notification sent for {orderId} (processed by: {processor_name})")
                except Exception as review_err:
                    logger.warning(f"Review notification error for {orderId}: {review_err}")

            # Fetch updated order to return (will be re-fetched after capture if needed)
            result = get_single_order(cur, laundryId, orderId)

            # Check if we need to auto-capture (collect vars before leaving DB block)
            # Skip auto-capture for pay-by-invoice / commercial orders (they get invoiced instead)
            should_auto_capture = (
                order_status in ("ProcessingCompleted", "EnRouteToDelivery")
                and current_order["order_type"] == "Online"
                and current_order["payment_status"] != "Paid"
                and not current_order.get("pay_by_invoice")
            )
            capture_customer_id = current_order["customer_id"] if should_auto_capture else None
            capture_grand_total = grand_total if should_auto_capture else 0

            # Get the existing $1 hold payment intent ID
            hold_intent_id = None
            if should_auto_capture:
                cur.execute("""
                    SELECT payment_intent_id FROM orders.order_payments
                    WHERE order_id = %s AND payment_method = 'hold'
                    LIMIT 1
                """, (orderId,))
                hold_row = cur.fetchone()
                if hold_row:
                    hold_intent_id = hold_row["payment_intent_id"]

                # Also check if already charged (prevent double charge)
                cur.execute("""
                    SELECT payment_intent_id FROM orders.order_payments
                    WHERE order_id = %s AND payment_method = 'Card'
                    LIMIT 1
                """, (orderId,))
                if cur.fetchone():
                    should_auto_capture = False  # Already charged, skip

        # Auto-capture payment OUTSIDE the DB block to avoid nested connection issues
        if should_auto_capture and capture_grand_total > 0:
            try:
                from app.services.payment_service import _init_stripe
                import stripe
                _init_stripe(laundryId)

                # Cancel the $1 hold (can't capture for more than hold amount)
                if hold_intent_id:
                    try:
                        stripe.PaymentIntent.cancel(hold_intent_id)
                        logger.info(f"Canceled $1 hold {hold_intent_id} for order {orderId}")
                    except Exception:
                        pass  # May already be expired/canceled

                # Get customer's payment info and charge the real amount
                captured_intent_id = None
                with get_db() as conn2:
                    cur2 = get_cursor(conn2)
                    cur2.execute("""
                        SELECT stripe_customer_id FROM shop.customer_payment_profiles
                        WHERE customer_id = %s AND laundry_id = %s
                    """, (capture_customer_id, laundryId))
                    payment_row = cur2.fetchone()

                if payment_row and payment_row["stripe_customer_id"]:
                    customer_obj = stripe.Customer.retrieve(payment_row["stripe_customer_id"])
                    default_pm = customer_obj.get('invoice_settings', {}).get('default_payment_method')
                    if default_pm:
                        amount_cents = int(round(capture_grand_total * 100))
                        intent = stripe.PaymentIntent.create(
                            amount=amount_cents,
                            currency='usd',
                            customer=payment_row["stripe_customer_id"],
                            payment_method=default_pm,
                            description=f"Payment for order {orderId}",
                            payment_method_types=["card"],
                            confirm=True,
                            metadata={
                                "order_id": orderId,
                                "laundry_id": laundryId,
                                "customer_id": capture_customer_id or "",
                                "type": "auto_capture",
                            },
                        )
                        if intent['status'] == 'succeeded':
                            captured_intent_id = intent.id
                            logger.info(f"Charged ${capture_grand_total} for order {orderId}: {intent.id}")

                # Update DB if payment succeeded
                if captured_intent_id:
                    with get_db() as conn3:
                        cur3 = get_cursor(conn3)
                        cur3.execute("""
                            UPDATE orders.orders SET payment_status = 'Paid', updated_at = NOW()
                            WHERE order_id = %s
                        """, (orderId,))
                        # Replace the hold record with the real payment
                        if hold_intent_id:
                            cur3.execute("""
                                UPDATE orders.order_payments
                                SET payment_intent_id = %s, amount = %s, payment_method = 'Card'
                                WHERE order_id = %s AND payment_intent_id = %s
                            """, (captured_intent_id, capture_grand_total, orderId, hold_intent_id))
                        else:
                            cur3.execute("""
                                INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                                VALUES (%s, %s, %s, 'Card') ON CONFLICT DO NOTHING
                            """, (orderId, captured_intent_id, capture_grand_total))

                    # Re-fetch order with updated payment status
                    with get_db() as conn4:
                        cur4 = get_cursor(conn4)
                        result = get_single_order(cur4, laundryId, orderId)

            except Exception as capture_err:
                logger.warning(f"Payment auto-capture error for {orderId}: {capture_err}")

        response_body = result.get("body", {})
        if should_auto_capture and capture_grand_total > 0:
            # Check if payment actually went through
            if not response_body.get("paymentStatus") == "Paid":
                response_body["paymentWarning"] = "Payment capture failed. Card may have been declined. Please collect payment manually."
        return {"statusCode": 200, "body": response_body}

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
        where = "o.laundry_id = %s AND o.status_category IN ('Completed','Cancelled') AND o.created_at >= %s"
        where_params = [laundry_id, ninety_days_ago]
    elif operation == 'canceled':
        where = "o.laundry_id = %s AND o.status_category = 'Cancelled' AND o.created_at >= %s"
        where_params = [laundry_id, ninety_days_ago]
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
            "weightImageUrl": r.get("weight_image_url"),
            "processingImageUrl": r.get("processing_image_url"),
            "foldImageUrl": r.get("fold_image_url"),
            "washingImageUrl": r.get("washing_image_url"),
            "dryingImageUrl": r.get("drying_image_url"),
            "payByInvoice": r.get("pay_by_invoice", False),
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


def search_orders(cur, laundry_id, query):
    """Search orders by order ID, customer phone, or customer name — no time limit.
    Returns up to 20 matching orders across all statuses."""
    if not query or len(query.strip()) < 2:
        return {"statusCode": 200, "body": []}

    query = query.strip()
    search_pattern = f"%{query}%"

    cur.execute("""
        SELECT
            o.*,
            c.first_name, c.last_name, c.phone_number, c.email,
            ca.address AS customer_address,
            COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                    'orderId', os.order_id, 'serviceName', os.service_name,
                    'servicePrice', os.service_price, 'weightOrCount', os.weight_or_count
                )) FILTER (WHERE os.id IS NOT NULL), '[]'
            ) AS services,
            jsonb_build_object(
                'tipAmount', ot.tip_amount, 'tipPercentage', ot.tip_percentage,
                'tipType', ot.tip_type, 'tipMethod', ot.tip_method,
                'tipReceiverId', ot.tip_receiver_id
            ) AS tip
        FROM orders.orders o
        JOIN shop.customers c ON c.customer_id = o.customer_id
        LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
        LEFT JOIN orders.order_services os ON os.order_id = o.order_id
        LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
        WHERE o.laundry_id = %s
          AND (
            UPPER(o.order_id) LIKE UPPER(%s)
            OR c.phone_number LIKE %s
            OR UPPER(CONCAT(c.first_name, ' ', c.last_name)) LIKE UPPER(%s)
          )
        GROUP BY o.order_id, c.customer_id, ca.address,
                 ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
        ORDER BY o.created_at DESC
        LIMIT 20
    """, (laundry_id, search_pattern, search_pattern, search_pattern))

    rows = cur.fetchall()

    results = []
    for r in rows:
        services = [serialize(s) for s in (r["services"] or [])]
        tip = serialize(r["tip"] or {})
        grand_total = Decimal(str(r["grand_total"] or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        results.append({
            "orderId": r["order_id"],
            "customerName": f"{r['first_name']} {r['last_name']}".strip(),
            "customerPhone": r["phone_number"],
            "customerEmail": r["email"],
            "customerAddress": r["customer_address"] or "",
            "orderStatus": r["order_status"],
            "paymentStatus": r["payment_status"],
            "orderType": r.get("order_type", ""),
            "createdAt": serialize(r["created_at"]),
            "dropoffDate": serialize(r["dropoff_date"]),
            "dropoffTimeInterval": r["dropoff_time_interval"],
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
            "coupon": r["coupon"],
            "balanceDue": float(max(Decimal('0'), grand_total - Decimal(str(r.get("paid_amount") or 0)))),
        })

    return {"statusCode": 200, "body": results}


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
        services_rows = cur.fetchall()

        # Look up input_weight from service catalog to determine weight vs count display
        cur.execute("SELECT service_name, input_weight FROM shop.laundry_services WHERE laundry_id = %s", (laundry_id or order["laundry_id"],))
        catalog_map = {r["service_name"]: r["input_weight"] for r in cur.fetchall()}

        services = []
        for r in services_rows:
            services.append({
                "id": r["id"],
                "orderId": r["order_id"],
                "service": r["service_name"],
                "serviceName": r["service_name"],
                "servicePrice": float(r["service_price"]) if r["service_price"] else 0,
                "weightOrCount": float(r["weight_or_count"]) if r["weight_or_count"] else 0,
                "inputWeight": catalog_map.get(r["service_name"], False),
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
            "pricingType": order.get("pricing_type", "per_pound"),
            "payByInvoice": order.get("pay_by_invoice", False),
            "totalWeight": float(order["total_weight"]) if order.get("total_weight") else None,
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
            "weightImageUrl": order.get("weight_image_url"),
            "processingImageUrl": order.get("processing_image_url"),
            "foldImageUrl": order.get("fold_image_url"),
            "washingImageUrl": order.get("washing_image_url"),
            "dryingImageUrl": order.get("drying_image_url"),
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
                    'ProcessingCompleted', 'ReadyForDelivery', 'EnRouteToDelivery', 'Delivered', 'OrderPickedUp', 'Cancelled']
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
