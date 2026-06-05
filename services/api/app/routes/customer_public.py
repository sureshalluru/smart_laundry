"""
Customer-facing public routes — no auth required.
These are called before the customer logs in.
"""
from fastapi import APIRouter, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/check-phone")
async def check_phone(
    operation: str = Query(...),
    phoneNumber: str = Query(...),
    laundryId: str = Query(...),
):
    """Check if phone number exists — no auth required (pre-login)."""
    normalized = phoneNumber.replace("+1", "").strip()
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.special_instructions,
                   cpp.stripe_customer_id
            FROM shop.customers c
            LEFT JOIN shop.customer_payment_profiles cpp
              ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
            WHERE c.phone_number LIKE %s
            LIMIT 1
        """, (laundryId, f"%{normalized}%"))
        row = cur.fetchone()

        if not row:
            return {"exists": False}

        # Ensure customer_laundry_stats record exists
        cur.execute("""
            INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
            VALUES (%s, %s) ON CONFLICT (customer_id, laundry_id) DO NOTHING
        """, (row["customer_id"], laundryId))

        return {
            "exists": True,
            "customerId": row["customer_id"],
            "customerPaymentId": row["stripe_customer_id"] or "",
            "firstName": row["first_name"],
            "specialInstructions": row["special_instructions"] or "",
        }


@router.post("/place-order")
async def customer_place_order(
    body: dict = Body(...),
):
    """Place an online order from the customer app."""
    from app.auth import get_current_user, security
    from fastapi import Depends
    import uuid
    from datetime import datetime

    # Validate auth token manually (since this needs to be protected)
    token = None
    auth_header = body.get("_auth_token") or ""
    # The token is sent in headers, not body — handled by FastAPI dependencies
    # For now we'll get it from localStorage on the frontend via Authorization header

    try:
        customer_id = body.get("customerId")
        laundry_id = body.get("laundryId")
        services = body.get("services", [])
        address_id = body.get("addressId")
        address_text = body.get("address", "")
        door_number = body.get("doorNumber", "")
        address_instructions = body.get("addressInstructions", "")
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
        frequency = body.get("frequency")
        customer_payment_id = body.get("customerPaymentId")

        # Per-bag pricing fields
        pricing_type = body.get("pricingType", "per_pound")  # "per_bag" or "per_pound"
        laundry_bags = int(body.get("laundryBags", 1) or 1)
        bag_price = round(float(str(body.get("bagPrice", 0) or 0)), 2)

        if not laundry_id or not customer_id:
            return {"status": "error", "message": "Missing required parameters"}

        tip_amount = round(float(str(tip_data.get("tipAmount", 0) or 0)), 2)

        # Calculate totals based on pricing type
        if pricing_type == "per_bag":
            # Per-bag pricing: bags × bag_price
            if sub_total == 0:
                sub_total = round(laundry_bags * bag_price, 2)
            if total_cost == 0:
                total_cost = sub_total
            if grand_total == 0:
                grand_total = round(total_cost + tip_amount, 2)
            # Create a single service entry for bag pricing
            services = [{"serviceName": "Per Bag Service", "servicePrice": bag_price, "weightOrCount": laundry_bags}]
        else:
            # Per-pound pricing: existing logic
            if sub_total == 0 and services:
                for svc in services:
                    price = float(str(svc.get("servicePrice") or svc.get("price", 0) or 0))
                    weight = float(str(svc.get("weightOrCount") or svc.get("weight", 0) or 0))
                    sub_total += price * weight
                sub_total = round(sub_total, 2)
            if total_cost == 0:
                total_cost = sub_total
            if grand_total == 0:
                grand_total = round(total_cost + tip_amount, 2)

        # Apply coupon discount if provided
        if coupon and sub_total > 0:
            try:
                with get_db() as conn_promo:
                    cur_promo = get_cursor(conn_promo)
                    cur_promo.execute("""
                        SELECT discount_type, discount_value, minimum_order_value
                        FROM shop.promotions
                        WHERE laundry_id = %s AND promo_code = %s AND is_active = TRUE
                    """, (laundry_id, coupon))
                    promo = cur_promo.fetchone()

                if promo and sub_total >= float(promo["minimum_order_value"] or 0):
                    discount_type = promo["discount_type"]
                    discount_value = float(promo["discount_value"] or 0)

                    if discount_type == "percentage":
                        discounted_price = round(sub_total * (discount_value / 100), 2)
                    else:  # fixed amount
                        discounted_price = min(discount_value, sub_total)

                    total_cost = round(sub_total - discounted_price, 2)
                    grand_total = round(total_cost + tip_amount, 2)
            except Exception as promo_err:
                logger.warning(f"Promo application error: {promo_err}")

        order_id = f"O-{uuid.uuid4().hex[:8].upper()}"

        with get_db() as conn:
            cur = get_cursor(conn)

            # Resolve address_id: look up or create customer_addresses record
            if not address_id and address_text and customer_id:
                cur.execute("""
                    SELECT address_id FROM shop.customer_addresses
                    WHERE customer_id = %s AND address = %s AND is_active = TRUE
                    LIMIT 1
                """, (customer_id, address_text))
                addr_row = cur.fetchone()
                if addr_row:
                    address_id = addr_row["address_id"]
                else:
                    # Create new address record
                    new_addr_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO shop.customer_addresses (address_id, customer_id, address, door_number, address_instructions, is_active)
                        VALUES (%s, %s, %s, %s, %s, TRUE)
                    """, (new_addr_id, customer_id, address_text, door_number, address_instructions))
                    address_id = new_addr_id

            cur.execute("""
                INSERT INTO orders.orders (
                    order_id, laundry_id, customer_id, address_id,
                    order_type, order_status, status_category, payment_status,
                    pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                    laundry_bags, special_instructions, coupon, frequency,
                    sub_total, discounted_price, total_cost, grand_total,
                    pricing_type, auto_generated, is_reviewed, cancel_reason,
                    created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,'Online','OrderSubmitted','Active','Unpaid',
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,FALSE,FALSE,'',NOW(),NOW()
                )
            """, (
                order_id, laundry_id, customer_id, address_id,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon, frequency,
                sub_total, discounted_price, total_cost, grand_total,
                pricing_type,
            ))

            for svc in services:
                svc_name = svc.get("serviceName") or svc.get("service") or svc.get("name", "")
                cur.execute("""
                    INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                    VALUES (%s,%s,%s,%s)
                """, (order_id, svc_name,
                      float(str(svc.get("servicePrice") or svc.get("price", 0) or 0)),
                      float(str(svc.get("weightOrCount") or svc.get("weight", 0) or 0))))

            if tip_data.get("tipType") or tip_amount > 0:
                cur.execute("""
                    INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                    VALUES (%s,%s,%s,%s,%s)
                    ON CONFLICT (order_id) DO UPDATE SET tip_amount = EXCLUDED.tip_amount
                """, (order_id, tip_amount, tip_data.get("tipPercentage"),
                      tip_data.get("tipType"), tip_data.get("tipMethod")))

            # Create frequency subscription if customer selected recurring
            if frequency and frequency.strip():
                from datetime import datetime, timedelta

                # Calculate future pickup date based on frequency
                freq_days = 7 if frequency.lower() == 'weekly' else 14  # biweekly = 14 days
                pickup_dt = datetime.strptime(pickup_date, '%Y-%m-%d') if pickup_date else datetime.now()
                future_pickup = (pickup_dt + timedelta(days=freq_days)).strftime('%Y-%m-%d')

                # Deactivate any existing frequency for this customer+laundry+address
                cur.execute("""
                    UPDATE orders.laundry_frequency
                    SET is_active = FALSE
                    WHERE customer_id = %s AND laundry_id = %s AND address_id = %s AND is_active = TRUE
                """, (customer_id, laundry_id, address_id))

                # Create new frequency subscription
                import uuid as uuid_mod
                freq_id = str(uuid_mod.uuid4())
                cur.execute("""
                    INSERT INTO orders.laundry_frequency (
                        frequency_id, customer_id, laundry_id, address_id, frequency,
                        frequency_created_date, frequency_start_date,
                        pickup_date, pickup_time_interval,
                        dropoff_time_interval, future_pickup_date,
                        is_active
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        NOW(), %s,
                        %s, %s,
                        %s, %s,
                        TRUE
                    )
                """, (
                    freq_id, customer_id, laundry_id, address_id, frequency,
                    pickup_date,
                    pickup_date, pickup_time_interval,
                    dropoff_time_interval, future_pickup,
                ))

        # Create $1 hold on customer's card to verify payment method
        if customer_payment_id:
            try:
                from app.services.payment_service import create_hold
                hold_result = create_hold(
                    customer_payment_id=customer_payment_id,
                    amount=1.00,
                    description=f"$1 auth hold for order {order_id}",
                    laundry_id=laundry_id,
                )
                if hold_result.get("status") == "success":
                    # Store the hold payment intent ID on the order
                    with get_db() as conn2:
                        cur2 = get_cursor(conn2)
                        cur2.execute("""
                            INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                            VALUES (%s, %s, %s, 'hold')
                            ON CONFLICT DO NOTHING
                        """, (order_id, hold_result["paymentIntentId"], 1.00))
                else:
                    logger.warning(f"$1 hold failed for order {order_id}: {hold_result.get('message')}")
            except Exception as hold_err:
                logger.warning(f"$1 hold error for order {order_id}: {hold_err}")
                # Don't fail the order if hold fails — just log it

        # Send order confirmation email via Brevo
        try:
            from app.services.notification_service import send_email, send_sms

            with get_db() as conn_notif:
                cur_notif = get_cursor(conn_notif)
                cur_notif.execute("""
                    SELECT first_name, email, phone_number, notif_email, notif_phone
                    FROM shop.customers WHERE customer_id = %s
                """, (customer_id,))
                cust = cur_notif.fetchone()

                cur_notif.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                shop = cur_notif.fetchone()

            if cust and shop:
                first_name = cust["first_name"] or "Customer"
                laundry_name = shop["laundry_name"] or "Your Laundry"

                # Build service summary
                if pricing_type == "per_bag":
                    service_summary = f"{laundry_bags} bag(s) × ${bag_price:.2f} = ${sub_total:.2f}"
                else:
                    service_lines = [f"{s.get('serviceName', 'Service')} ({s.get('weightOrCount', '')})" for s in services[:5]]
                    service_summary = ", ".join(service_lines) if service_lines else "Per-pound services"

                html_body = f"""
                <h2>Order Confirmed! 🎉</h2>
                <p>Hi {first_name},</p>
                <p>Your laundry order has been placed successfully.</p>
                <table style="border-collapse:collapse;width:100%;max-width:500px;">
                    <tr><td style="padding:8px;font-weight:bold;">Order ID</td><td style="padding:8px;">{order_id}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;">Services</td><td style="padding:8px;">{service_summary}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;">Pickup</td><td style="padding:8px;">{pickup_date} ({pickup_time_interval})</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;">Dropoff</td><td style="padding:8px;">{dropoff_date} ({dropoff_time_interval})</td></tr>
                    {f'<tr><td style="padding:8px;font-weight:bold;">Frequency</td><td style="padding:8px;">{frequency}</td></tr>' if frequency else ''}
                </table>
                <p>We'll pick up your laundry at the scheduled time. Thank you for choosing {laundry_name}!</p>
                """

                if cust.get("notif_email", True) and cust["email"]:
                    send_email(cust["email"], f"Order Confirmed - {order_id}", html_body)

                if cust.get("notif_phone", True) and cust["phone_number"]:
                    sms_msg = f"Hi {first_name}! Order {order_id} confirmed. Pickup: {pickup_date} ({pickup_time_interval}). - {laundry_name}"
                    send_sms(cust["phone_number"], sms_msg)

        except Exception as notif_err:
            logger.warning(f"Failed to send order confirmation for {order_id}: {notif_err}")

        return {"status": "success", "orderId": order_id}

    except Exception as e:
        logger.exception("customer place_order error")
        return {"status": "error", "message": str(e)}


@router.get("/get-orders-info")
async def get_customer_orders(
    operation: str = Query(...),
    customerId: str = Query(...),
    laundryId: str = Query(...),
    page: int = Query(1),
    limit: int = Query(10),
):
    """Get customer order history."""
    with get_db() as conn:
        cur = get_cursor(conn)
        offset = (page - 1) * limit
        cur.execute("""
            SELECT o.order_id, o.order_type, o.order_status, o.payment_status,
                   o.pickup_date, o.pickup_time_interval, o.dropoff_date, o.dropoff_time_interval,
                   o.total_cost, o.grand_total, o.created_at, o.special_instructions,
                   o.laundry_bags, o.coupon, o.image_url, o.pricing_type
            FROM orders.orders o
            WHERE o.customer_id = %s AND o.laundry_id = %s
            ORDER BY o.created_at DESC
            LIMIT %s OFFSET %s
        """, (customerId, laundryId, limit, offset))
        orders = []
        for r in cur.fetchall():
            # Get services for each order
            cur.execute("SELECT service_name, service_price, weight_or_count FROM orders.order_services WHERE order_id = %s", (r["order_id"],))
            services = [{"serviceName": s["service_name"], "servicePrice": float(s["service_price"] or 0), "weightOrCount": float(s["weight_or_count"] or 0)} for s in cur.fetchall()]

            orders.append({
                "orderId": r["order_id"],
                "orderType": r["order_type"],
                "orderStatus": r["order_status"],
                "paymentStatus": r["payment_status"],
                "pickupDate": str(r["pickup_date"]) if r["pickup_date"] else None,
                "pickupTimeInterval": r["pickup_time_interval"],
                "dropoffDate": str(r["dropoff_date"]) if r["dropoff_date"] else None,
                "dropoffTimeInterval": r["dropoff_time_interval"],
                "totalCost": float(r["total_cost"] or 0),
                "grandTotal": float(r["grand_total"] or 0),
                "createdAt": str(r["created_at"]),
                "services": services,
                "specialInstructions": r["special_instructions"],
                "laundryBags": r["laundry_bags"],
                "coupon": r["coupon"],
                "imageUrl": r["image_url"],
                "pricingType": r.get("pricing_type", "per_pound"),
            })

        return {"statusCode": 200, "body": {"status": "success", "data": orders, "lastKey": None}}


@router.get("/get-order-id-info")
async def get_customer_order_detail(
    operation: str = Query(...),
    customerId: str = Query(...),
    orderId: str = Query(...),
    laundryId: Optional[str] = Query(None),
):
    """Get single order details for customer."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method
            FROM orders.orders o
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.order_id = %s AND o.customer_id = %s
        """, (orderId, customerId))
        order = cur.fetchone()
        if not order:
            return {"status": "error", "message": "Order not found"}

        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (orderId,))
        services = [{"serviceName": r["service_name"], "servicePrice": float(r["service_price"] or 0), "weightOrCount": float(r["weight_or_count"] or 0)} for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (orderId,))
        payments = [{"paymentIntentId": r["payment_intent_id"], "amount": float(r["amount"] or 0), "paymentMethod": r["payment_method"]} for r in cur.fetchall()]

        return {
            "statusCode": 200,
            "body": {
                "status": "success",
                "data": {
                    "orderId": order["order_id"],
                    "orderType": order["order_type"],
                    "orderStatus": order["order_status"],
                    "paymentStatus": order["payment_status"],
                    "pickupDate": str(order["pickup_date"]) if order["pickup_date"] else None,
                    "pickupTimeInterval": order["pickup_time_interval"],
                    "dropoffDate": str(order["dropoff_date"]) if order["dropoff_date"] else None,
                    "dropoffTimeInterval": order["dropoff_time_interval"],
                    "totalCost": float(order["total_cost"] or 0),
                    "grandTotal": float(order["grand_total"] or 0),
                    "subTotal": float(order["sub_total"] or 0),
                    "discountedPrice": float(order["discounted_price"] or 0),
                    "createdAt": str(order["created_at"]),
                    "services": services,
                    "payments": payments,
                    "specialInstructions": order["special_instructions"],
                    "laundryBags": order["laundry_bags"],
                    "coupon": order["coupon"],
                    "imageUrl": order["image_url"],
                    "tip": {
                        "tipAmount": float(order["tip_amount"] or 0),
                        "tipPercentage": float(order["tip_percentage"] or 0) if order["tip_percentage"] else None,
                        "tipType": order["tip_type"],
                        "tipMethod": order["tip_method"],
                    },
                }
            }
        }


@router.put("/cancel-order")
async def cancel_customer_order(
    body: dict = Body({}),
):
    """Cancel a customer order and reverse any payment hold."""
    order_id = body.get("orderId")
    customer_id = body.get("customerId")
    cancel_reason = body.get("cancelReason", "")
    is_recurring = body.get("isRecurring", "false")  # "true" = cancel future orders too

    if not order_id:
        return {"status": "error", "message": "Missing orderId"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get the laundry_id and address_id for Stripe key lookup
        cur.execute("""
            SELECT laundry_id, address_id FROM orders.orders
            WHERE order_id = %s AND customer_id = %s
        """, (order_id, customer_id))
        order_row = cur.fetchone()
        if not order_row:
            return {"status": "error", "message": "Order not found or not yours"}

        laundry_id = order_row["laundry_id"]
        address_id = order_row["address_id"]

        # Cancel the order
        cur.execute("""
            UPDATE orders.orders
            SET order_status = 'OrderCanceled', status_category = 'Cancelled',
                cancel_reason = %s, updated_at = NOW()
            WHERE order_id = %s AND customer_id = %s
        """, (cancel_reason, order_id, customer_id))

        # If customer chose to cancel all future recurring orders, deactivate the frequency
        if str(is_recurring).lower() == 'true':
            cur.execute("""
                UPDATE orders.laundry_frequency
                SET is_active = FALSE, updated_at = NOW()
                WHERE customer_id = %s AND laundry_id = %s AND is_active = TRUE
            """, (customer_id, laundry_id))
            deactivated = cur.rowcount
            if deactivated:
                logger.info(f"Deactivated {deactivated} frequency subscription(s) for customer {customer_id}")

        # Reverse any uncaptured payment holds
        cur.execute("""
            SELECT payment_intent_id FROM orders.order_payments
            WHERE order_id = %s AND payment_method = 'hold'
        """, (order_id,))
        holds = cur.fetchall()

    # Cancel Stripe holds outside the DB transaction
    if holds:
        try:
            import stripe
            from app.services.payment_service import get_stripe_key
            key, _ = get_stripe_key(laundry_id)
            stripe.api_key = key
            for hold in holds:
                pi_id = hold["payment_intent_id"]
                try:
                    stripe.PaymentIntent.cancel(pi_id)
                    logger.info(f"Reversed hold {pi_id} for canceled order {order_id}")
                except Exception as e:
                    # Hold may have already expired or been captured
                    logger.warning(f"Could not cancel hold {pi_id}: {e}")
        except Exception as e:
            logger.warning(f"Error reversing holds for order {order_id}: {e}")

    return {"status": "success", "message": "Order canceled"}


@router.get("/validate-promo-code")
async def validate_promo_code(
    operation: str = Query(...),
    laundryId: str = Query(...),
    promoCode: str = Query(...),
):
    """Validate a promo code for the customer."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT promo_code, description, discount_type, discount_value,
                   minimum_order_value, apply_on_whole_order, linked_frequency
            FROM shop.promotions
            WHERE laundry_id = %s AND promo_code = %s AND is_active = TRUE
        """, (laundryId, promoCode))
        promo = cur.fetchone()

        if not promo:
            return {"statusCode": 200, "body": {"isValid": False, "message": "Invalid or expired promo code"}}

        return {"statusCode": 200, "body": {
            "isValid": True,
            "promoCode": promo["promo_code"],
            "description": promo["description"],
            "discountType": promo["discount_type"],
            "discountValue": float(promo["discount_value"]) if promo["discount_value"] else 0,
            "minimumOrderValue": float(promo["minimum_order_value"]) if promo["minimum_order_value"] else 0,
            "appliedOn": "wholeOrder" if promo["apply_on_whole_order"] else "specificServices",
            "linkedFrequency": promo["linked_frequency"],
        }}


@router.get("/get-customer-info")
async def get_customer_info(
    operation: str = Query(...),
    customerId: str = Query(...),
):
    """Get customer information for account page."""
    import json as json_mod
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT customer_id, first_name, last_name, phone_number, email,
                   notif_email, notif_sms, notif_phone, special_instructions
            FROM shop.customers WHERE customer_id = %s
        """, (customerId,))
        customer = cur.fetchone()
        if not customer:
            return {"statusCode": 200, "body": json_mod.dumps({"status": "error", "message": "Customer not found"})}

        cur.execute("""
            SELECT address_id, address, door_number, address_instructions
            FROM shop.customer_addresses WHERE customer_id = %s AND is_active = TRUE
        """, (customerId,))
        addresses = [{"addressId": r["address_id"], "address": r["address"], "doorNumber": r["door_number"] or "", "addressInstructions": r["address_instructions"] or ""} for r in cur.fetchall()]

        # Frequency details
        cur.execute("""
            SELECT lf.frequency_id, ca.address, lf.frequency,
                   lf.frequency_created_date, lf.frequency_start_date,
                   lf.future_pickup_date, lf.dropoff_time_interval,
                   lf.pickup_date, lf.pickup_time_interval
            FROM orders.laundry_frequency lf
            JOIN shop.customer_addresses ca ON ca.address_id = lf.address_id
            WHERE lf.customer_id = %s AND lf.is_active = TRUE
        """, (customerId,))
        frequency_details = [{
            "frequencyId": r["frequency_id"],
            "address": r["address"],
            "frequency": r["frequency"],
            "frequencyCreatedDate": str(r["frequency_created_date"]) if r["frequency_created_date"] else None,
            "frequencyStartDate": str(r["frequency_start_date"]) if r["frequency_start_date"] else None,
            "futurePickupDate": str(r["future_pickup_date"]) if r["future_pickup_date"] else None,
            "dropoffTimeInterval": r["dropoff_time_interval"],
            "pickupDate": str(r["pickup_date"]) if r["pickup_date"] else None,
            "pickupTimeInterval": r["pickup_time_interval"],
        } for r in cur.fetchall()]

        data = {
            "status": "success",
            "data": {
                "firstName": customer["first_name"],
                "lastName": customer["last_name"],
                "phoneNumber": customer["phone_number"],
                "email": customer["email"] or "",
                "specialInstructions": customer["special_instructions"] or "",
                "addresses": addresses,
                "notificationPreferences": {
                    "email": customer["notif_email"],
                    "sms": customer["notif_sms"],
                    "phone": customer["notif_phone"],
                },
                "frequencyDetails": frequency_details,
            }
        }
        # Return body as JSON string (frontend does JSON.parse on it)
        return {"statusCode": 200, "body": json_mod.dumps(data)}
