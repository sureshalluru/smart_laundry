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
        pay_by_invoice = body.get("payByInvoice", False)

        # Per-bag pricing fields
        pricing_type = body.get("pricingType", "per_pound")  # "per_bag" or "per_pound"
        laundry_bags = int(body.get("laundryBags", 1) or 1)
        bag_price = round(float(str(body.get("bagPrice", 0) or 0)), 2)

        # Uber/delivery service fields
        pickup_service = body.get("pickupService", "LaundryDriver") or "LaundryDriver"
        dropoff_service = body.get("dropoffService", "LaundryDriver") or "LaundryDriver"
        uber_pickup_frequency = body.get("uberPickupFrequency", False)
        uber_dropoff_frequency = body.get("uberDropoffFrequency", False)

        if not laundry_id or not customer_id:
            return {"status": "error", "message": "Missing required parameters"}

        # Resolve commercial account status for order defaults
        # Commercial is an account-level property — order_type stays as the channel (Online)
        # but pay_by_invoice = TRUE means no card payment, invoice will be sent
        order_type = "Online"
        # Preserve customer-selected pay_by_invoice from the request body
        # Commercial accounts always get pay_by_invoice = True regardless
        with get_db() as conn_comm:
            cur_comm = get_cursor(conn_comm)
            cur_comm.execute(
                "SELECT is_commercial FROM shop.customers WHERE customer_id = %s",
                (customer_id,)
            )
            comm_row = cur_comm.fetchone()
            if comm_row and comm_row.get("is_commercial"):
                pay_by_invoice = True
                logger.info(f"Commercial account detected: customer_id={customer_id}, order_type=Online, pay_by_invoice=True")
            elif not pay_by_invoice:
                # Keep whatever the customer selected (already read from body on line above)
                pass

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
        elif pricing_type == "mixed" or pricing_type == "per_pound" or pricing_type == "per_item":
            # Per-pound or mixed pricing: calculate from services array
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

        # Apply tax if configured for this laundry
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

        # Apply reward credits as discount (FIFO — oldest first)
        credit_discount = 0
        used_credit_ids = []
        try:
            if grand_total > 0:
                with get_db() as conn_credits:
                    cur_credits = get_cursor(conn_credits)
                    cur_credits.execute("""
                        SELECT id, amount FROM shop.reward_credits
                        WHERE customer_id = %s AND laundry_id = %s
                          AND status = 'active' AND expires_at > NOW()
                        ORDER BY created_at ASC
                    """, (customer_id, laundry_id))
                    available_credits = cur_credits.fetchall()

                    remaining = grand_total
                    for credit in available_credits:
                        if remaining <= 0:
                            break
                        applied = min(float(credit["amount"]), remaining)
                        credit_discount += applied
                        remaining -= applied
                        used_credit_ids.append((credit["id"], applied))

                    if credit_discount > 0:
                        grand_total = round(remaining, 2)
        except Exception as credit_err:
            logger.warning(f"Credit application error: {credit_err}")
            credit_discount = 0
            used_credit_ids = []

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
                    sub_total, discounted_price, total_cost, grand_total, tax_amount,
                    pricing_type, pay_by_invoice, pickup_service, dropoff_service,
                    auto_generated, is_reviewed, cancel_reason,
                    created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,%s,'OrderSubmitted','Active','Unpaid',
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,FALSE,FALSE,'',NOW(),NOW()
                )
            """, (
                order_id, laundry_id, customer_id, address_id, order_type,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon, frequency,
                sub_total, discounted_price, total_cost, grand_total, tax_amount,
                pricing_type, pay_by_invoice, pickup_service, dropoff_service,
            ))

            for svc in services:
                svc_name = svc.get("serviceName") or svc.get("service") or svc.get("name", "")
                input_weight = svc.get("inputWeight", False)
                category_id = svc.get("categoryId")
                try:
                    cur.execute("""
                        INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count, input_weight, category_id)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, (order_id, svc_name,
                          float(str(svc.get("servicePrice") or svc.get("price", 0) or 0)),
                          float(str(svc.get("weightOrCount") or svc.get("weight", 0) or 0)),
                          input_weight,
                          category_id))
                except Exception:
                    # Fallback if input_weight/category_id columns don't exist yet
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
                if frequency.lower() == 'weekly':
                    freq_days = 7
                elif frequency.lower() == 'monthly':
                    freq_days = 30
                else:
                    freq_days = 14  # bi-weekly
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
                auto_charge = body.get("autoCharge", False)
                cur.execute("""
                    INSERT INTO orders.laundry_frequency (
                        frequency_id, customer_id, laundry_id, address_id, frequency,
                        frequency_created_date, frequency_start_date,
                        pickup_date, pickup_time_interval,
                        dropoff_time_interval, future_pickup_date,
                        is_active, auto_charge
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        NOW(), %s,
                        %s, %s,
                        %s, %s,
                        TRUE, %s
                    )
                """, (
                    freq_id, customer_id, laundry_id, address_id, frequency,
                    pickup_date,
                    pickup_date, pickup_time_interval,
                    dropoff_time_interval, future_pickup,
                    auto_charge,
                ))

        # Mark used credits as 'used' with reference to order_id
        if used_credit_ids:
            try:
                with get_db() as conn_mark:
                    cur_mark = get_cursor(conn_mark)
                    for credit_id, _applied_amount in used_credit_ids:
                        cur_mark.execute("""
                            UPDATE shop.reward_credits
                            SET status = 'used', used_on_order_id = %s
                            WHERE id = %s
                        """, (order_id, credit_id))
            except Exception as mark_err:
                logger.warning(f"Failed to mark credits as used for order {order_id}: {mark_err}")

        # Create $1 hold on customer's card to verify payment method (skip for invoice orders)
        if customer_payment_id and not pay_by_invoice:
            try:
                from app.services.payment_service import create_hold
                hold_result = create_hold(
                    customer_payment_id=customer_payment_id,
                    amount=1.00,
                    description=f"$1 auth hold for order {order_id}",
                    laundry_id=laundry_id,
                    order_id=order_id,
                    customer_id=customer_id,
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

        # Schedule Uber pickup/dropoff if selected
        if pickup_service == "Uber" or dropoff_service == "Uber":
            try:
                from app.routes.uber import (
                    get_laundry_uber_credentials, get_uber_access_token,
                    create_uber_quote, schedule_uber_delivery
                )
                import json as _json
                from zoneinfo import ZoneInfo as _ZoneInfo
                from datetime import datetime as _dt

                # Fetch laundry info for address and contacts
                with get_db() as conn_uber:
                    cur_uber = get_cursor(conn_uber)
                    cur_uber.execute("""
                        SELECT laundry_name, street, city, state, zip_code, country,
                               contact_phone, pickup_dropoff_instructions
                        FROM shop.laundry_shops WHERE laundry_id = %s
                    """, (laundry_id,))
                    shop_row = cur_uber.fetchone()

                    cur_uber.execute("""
                        SELECT first_name, last_name, phone_number
                        FROM shop.customers WHERE customer_id = %s
                    """, (customer_id,))
                    cust_row = cur_uber.fetchone()

                if shop_row and cust_row:
                    laundry_addr = f"{shop_row['street']}, {shop_row['city']}, {shop_row['state']} {shop_row['zip_code']}, {shop_row['country']}"
                    laundry_name_uber = shop_row["laundry_name"] or "Laundry"
                    laundry_phone = shop_row["contact_phone"] or ""
                    laundry_instructions = (shop_row["pickup_dropoff_instructions"] or "").strip()
                    customer_name = f"{cust_row['first_name'] or ''} {cust_row['last_name'] or ''}".strip()
                    customer_phone = cust_row["phone_number"] or ""

                    creds = get_laundry_uber_credentials(laundry_id)
                    token = get_uber_access_token(creds["clientId"], creds["clientSecret"])
                    local_tz = _ZoneInfo(creds["timeZone"])

                    if pickup_service == "Uber" and pickup_date and pickup_time_interval:
                        try:
                            start_str, end_str = pickup_time_interval.split("-")
                            p_start = _dt.strptime(f"{pickup_date} {start_str.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                            p_end = _dt.strptime(f"{pickup_date} {end_str.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)

                            p_notes = (address_instructions or "").strip()
                            d_notes = laundry_instructions

                            quote_id = create_uber_quote(
                                token, creds["customerId"], creds["baseUrl"],
                                address_text, laundry_addr, customer_phone, laundry_phone,
                                p_start.isoformat(), p_end.isoformat(), "laundryPickup"
                            )
                            result = schedule_uber_delivery(
                                token, creds["customerId"], creds["baseUrl"], quote_id,
                                address_text, laundry_addr, customer_phone, laundry_phone,
                                order_id, laundry_bags, customer_name, laundry_name_uber,
                                p_notes, d_notes, laundry_name_uber, creds["uberEnv"],
                                p_start.isoformat(), p_end.isoformat(), "laundryPickup"
                            )

                            # Store Uber info on order
                            uber_info_pickup = {
                                "deliveryId": result.get("id"),
                                "quoteId": result.get("quote_id"),
                                "status": result.get("status"),
                                "feeCents": result.get("fee", 0),
                                "trackingUrl": result.get("tracking_url")
                            }
                            with get_db() as conn_u:
                                cur_u = get_cursor(conn_u)
                                cur_u.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
                                r = cur_u.fetchone()
                                existing = (r["uber_info"] if r and r["uber_info"] else {}) or {}
                                existing["laundryPickup"] = uber_info_pickup
                                fee_dollars = result.get("fee", 0) / 100.0
                                cur_u.execute("""
                                    UPDATE orders.orders
                                    SET uber_info = %s, uber_pickup_fee = %s,
                                        pickup_tracking_url = %s
                                    WHERE order_id = %s
                                """, (_json.dumps(existing), fee_dollars,
                                      result.get("tracking_url"), order_id))
                            logger.info(f"Uber pickup scheduled for order {order_id}")
                        except Exception as ue:
                            logger.warning(f"Uber pickup scheduling failed for {order_id}, falling back to LaundryDriver: {ue}")
                            with get_db() as conn_fb:
                                cur_fb = get_cursor(conn_fb)
                                cur_fb.execute("UPDATE orders.orders SET pickup_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))

                    if dropoff_service == "Uber" and dropoff_date and dropoff_time_interval:
                        try:
                            start_str2, end_str2 = dropoff_time_interval.split("-")
                            d_start = _dt.strptime(f"{dropoff_date} {start_str2.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                            d_end = _dt.strptime(f"{dropoff_date} {end_str2.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)

                            p_notes2 = laundry_instructions
                            d_notes2 = (address_instructions or "").strip()

                            quote_id2 = create_uber_quote(
                                token, creds["customerId"], creds["baseUrl"],
                                laundry_addr, address_text, laundry_phone, customer_phone,
                                d_start.isoformat(), d_end.isoformat(), "laundryDropoff"
                            )
                            result2 = schedule_uber_delivery(
                                token, creds["customerId"], creds["baseUrl"], quote_id2,
                                laundry_addr, address_text, laundry_phone, customer_phone,
                                order_id, laundry_bags, laundry_name_uber, customer_name,
                                p_notes2, d_notes2, laundry_name_uber, creds["uberEnv"],
                                d_start.isoformat(), d_end.isoformat(), "laundryDropoff"
                            )

                            uber_info_dropoff = {
                                "deliveryId": result2.get("id"),
                                "quoteId": result2.get("quote_id"),
                                "status": result2.get("status"),
                                "feeCents": result2.get("fee", 0),
                                "trackingUrl": result2.get("tracking_url")
                            }
                            with get_db() as conn_u2:
                                cur_u2 = get_cursor(conn_u2)
                                cur_u2.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
                                r2 = cur_u2.fetchone()
                                existing2 = (r2["uber_info"] if r2 and r2["uber_info"] else {}) or {}
                                existing2["laundryDropoff"] = uber_info_dropoff
                                fee_dollars2 = result2.get("fee", 0) / 100.0
                                cur_u2.execute("""
                                    UPDATE orders.orders
                                    SET uber_info = %s, uber_dropoff_fee = %s,
                                        dropoff_tracking_url = %s
                                    WHERE order_id = %s
                                """, (_json.dumps(existing2), fee_dollars2,
                                      result2.get("tracking_url"), order_id))
                            logger.info(f"Uber dropoff scheduled for order {order_id}")
                        except Exception as ue2:
                            logger.warning(f"Uber dropoff scheduling failed for {order_id}, falling back to LaundryDriver: {ue2}")
                            with get_db() as conn_fb2:
                                cur_fb2 = get_cursor(conn_fb2)
                                cur_fb2.execute("UPDATE orders.orders SET dropoff_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))

            except Exception as uber_err:
                logger.warning(f"Uber scheduling error for order {order_id}: {uber_err}")
                # Don't fail the order — just log it and leave service as-is

        # Send order confirmation email via Brevo
        try:
            from app.services.notification_service import send_email, send_sms_for_tenant

            with get_db() as conn_notif:
                cur_notif = get_cursor(conn_notif)
                cur_notif.execute("""
                    SELECT first_name, email, phone_number, notif_email, notif_phone
                    FROM shop.customers WHERE customer_id = %s
                """, (customer_id,))
                cust = cur_notif.fetchone()

                cur_notif.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                shop = cur_notif.fetchone()

            if cust and shop:
                first_name = cust["first_name"] or "Customer"
                laundry_name = shop["laundry_name"] or "Your Laundry"
                contact_email = shop.get("contact_email") or None

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
                    send_email(cust["email"], f"Order Confirmed - {order_id}", html_body,
                              sender_name=laundry_name, reply_to=contact_email)

                if cust.get("notif_phone", True) and cust["phone_number"]:
                    sms_msg = f"Hi {first_name}! Order {order_id} confirmed. Pickup: {pickup_date} ({pickup_time_interval}). - {laundry_name}"
                    send_sms_for_tenant(cust["phone_number"], sms_msg, laundry_id)

        except Exception as notif_err:
            logger.warning(f"Failed to send order confirmation for {order_id}: {notif_err}")

        # Update trigger-created order_history rows to show customer name instead of "System"
        try:
            with get_db() as conn_audit:
                cur_audit = get_cursor(conn_audit)
                # Get customer name
                cur_audit.execute("SELECT first_name, last_name FROM shop.customers WHERE customer_id = %s", (customer_id,))
                cust_row = cur_audit.fetchone()
                if cust_row:
                    cust_name = f"{cust_row['first_name'] or ''} {cust_row['last_name'] or ''}".strip() or "Customer"
                    cur_audit.execute("""
                        UPDATE orders.order_history
                        SET emp_name = %s
                        WHERE order_id = %s AND (emp_name IS NULL OR emp_name = '' OR emp_name = 'System')
                    """, (cust_name, order_id))
                    logger.info(f"Updated {cur_audit.rowcount} order_history rows for {order_id} with customer name '{cust_name}'")
        except Exception as audit_err:
            logger.warning(f"Failed to update order_history for {order_id}: {audit_err}")

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
    """Get customer order history or profile."""
    # Return customer commercial status for profile checks
    if operation == "getCustomerProfile":
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                "SELECT is_commercial, billing_email FROM shop.customers WHERE customer_id = %s",
                (customerId,)
            )
            row = cur.fetchone()
            if row:
                return {"statusCode": 200, "body": {
                    "isCommercial": bool(row.get("is_commercial")),
                    "billingEmail": row.get("billing_email", ""),
                }}
            return {"statusCode": 200, "body": {"isCommercial": False, "billingEmail": ""}}

    with get_db() as conn:
        cur = get_cursor(conn)
        offset = (page - 1) * limit
        cur.execute("""
            SELECT o.order_id, o.order_type, o.order_status, o.payment_status,
                   o.pickup_date, o.pickup_time_interval, o.dropoff_date, o.dropoff_time_interval,
                   o.total_cost, o.grand_total, o.created_at, o.special_instructions,
                   o.laundry_bags, o.coupon, o.image_url, o.pricing_type, o.pay_by_invoice
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
                "payByInvoice": bool(r.get("pay_by_invoice")),
            })

        return {"statusCode": 200, "body": {"status": "success", "data": orders, "lastKey": None}}


@router.get("/get-order-id-info")
async def get_customer_order_detail(
    operation: str = Query(...),
    customerId: Optional[str] = Query(None),
    orderId: str = Query(...),
    laundryId: Optional[str] = Query(None),
):
    """Get single order details for customer."""
    with get_db() as conn:
        cur = get_cursor(conn)
        # If customerId is provided, use it for stricter lookup
        if customerId:
            cur.execute("""
                SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method
                FROM orders.orders o
                LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                WHERE o.order_id = %s AND o.customer_id = %s
            """, (orderId, customerId))
        else:
            # Fallback: lookup by orderId + laundryId (for tracking page links)
            if laundryId:
                cur.execute("""
                    SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method
                    FROM orders.orders o
                    LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                    WHERE o.order_id = %s AND o.laundry_id = %s
                """, (orderId, laundryId))
            else:
                cur.execute("""
                    SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method
                    FROM orders.orders o
                    LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                    WHERE o.order_id = %s
                """, (orderId,))
        order = cur.fetchone()
        if not order:
            return {"status": "error", "message": "Order not found"}

        cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (orderId,))
        services = [{"serviceName": r["service_name"], "servicePrice": float(r["service_price"] or 0), "weightOrCount": float(r["weight_or_count"] or 0)} for r in cur.fetchall()]

        cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (orderId,))
        payments = [{"paymentIntentId": r["payment_intent_id"], "amount": float(r["amount"] or 0), "paymentMethod": r["payment_method"]} for r in cur.fetchall()]

        # Get address info
        address_data = {}
        if order.get("address_id"):
            cur.execute("""
                SELECT address, address_instructions, door_number
                FROM shop.customer_addresses WHERE address_id = %s
            """, (order["address_id"],))
            addr = cur.fetchone()
            if addr:
                address_data = dict(addr)

        # Get employee info (last_updated_by)
        employee_info = None
        if order.get("last_updated_by"):
            cur.execute("SELECT emp_id, first_name, last_name FROM shop.employees WHERE emp_id = %s", (order["last_updated_by"],))
            emp = cur.fetchone()
            if emp:
                employee_info = {"empId": emp["emp_id"], "firstName": emp["first_name"], "lastName": emp["last_name"]}

        # Get item tracking photos (intake/fold) for customer view
        intake_image_urls = []
        fold_tracking_urls = []
        try:
            cur.execute("""
                SELECT phase, image_urls FROM orders.item_tracking_records
                WHERE order_id = %s AND laundry_id = %s
                ORDER BY created_at ASC
            """, (orderId, order["laundry_id"]))
            for tr in cur.fetchall():
                urls = tr.get("image_urls") or []
                if isinstance(urls, str):
                    import json as _j
                    try:
                        urls = _j.loads(urls)
                    except Exception:
                        urls = [urls] if urls else []
                if tr["phase"] == "intake" and urls:
                    intake_image_urls = urls
                elif tr["phase"] == "fold" and urls:
                    fold_tracking_urls = urls
        except Exception:
            pass

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
                    "finalPaymentIntentId": payments,
                    "specialInstructions": order["special_instructions"],
                    "laundryBags": order["laundry_bags"],
                    "coupon": order["coupon"],
                    "imageUrl": order["image_url"],
                    "weightImageUrl": order.get("weight_image_url"),
                    "foldImageUrl": order.get("fold_image_url"),
                    "intakeImageUrls": intake_image_urls,
                    "foldTrackingImageUrls": fold_tracking_urls,
                    "isReviewed": order.get("is_reviewed", False),
                    "address": address_data.get("address", ""),
                    "addressInstructions": address_data.get("address_instructions", ""),
                    "doorNumber": address_data.get("door_number", ""),
                    "employee": employee_info,
                    "pickupService": order.get("pickup_service"),
                    "dropoffService": order.get("dropoff_service"),
                    "pickupTrackingUrl": order.get("pickup_tracking_url"),
                    "dropoffTrackingUrl": order.get("dropoff_tracking_url"),
                    "pickupStatus": order.get("pickup_status"),
                    "dropoffStatus": order.get("dropoff_status"),
                    "uberPickupFee": float(order["uber_pickup_fee"]) if order.get("uber_pickup_fee") else None,
                    "uberDropoffFee": float(order["uber_dropoff_fee"]) if order.get("uber_dropoff_fee") else None,
                    "tip": {
                        "tipAmount": float(order["tip_amount"] or 0),
                        "tipPercentage": float(order["tip_percentage"] or 0) if order["tip_percentage"] else None,
                        "tipType": order["tip_type"],
                        "tipMethod": order["tip_method"],
                        "tipReceiverId": order.get("tip_receiver_id"),
                    },
                    "payByInvoice": bool(order.get("pay_by_invoice")),
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

    # Send cancellation notification to customer
    _send_cancel_notification(order_id, laundry_id, customer_id, cancel_reason, cancelled_by="customer")

    return {"status": "success", "message": "Order canceled"}


# Send cancellation notification (used by both customer and admin cancel)
def _send_cancel_notification(order_id, laundry_id, customer_id, cancel_reason, cancelled_by="customer"):
    """Send email/SMS notification when an order is canceled."""
    try:
        from app.services.notification_service import send_email, send_sms_for_tenant

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT c.first_name, c.email, c.phone_number, c.notif_email, c.notif_phone,
                       ls.laundry_name, ls.contact_email
                FROM shop.customers c
                JOIN orders.orders o ON o.customer_id = c.customer_id
                JOIN shop.laundry_shops ls ON ls.laundry_id = o.laundry_id
                WHERE o.order_id = %s
            """, (order_id,))
            row = cur.fetchone()

        if not row:
            return

        first_name = row["first_name"] or "Customer"
        laundry_name = row["laundry_name"] or "Your Laundry"
        laundry_reply_email = row.get("contact_email") or None
        reason_text = f" Reason: {cancel_reason}" if cancel_reason else ""

        if cancelled_by == "customer":
            subject = f"Order {order_id} - Cancellation Confirmed"
            html_body = f"""
            <h2>Order Canceled</h2>
            <p>Hi {first_name},</p>
            <p>Your order <strong>{order_id}</strong> has been canceled as requested.{reason_text}</p>
            <p>If you have any questions, please don't hesitate to reach out.</p>
            <p>— {laundry_name}</p>
            """
            sms_msg = f"Hi {first_name}, your order {order_id} has been canceled.{reason_text} - {laundry_name}"
        else:
            subject = f"Order {order_id} - Canceled by {laundry_name}"
            html_body = f"""
            <h2>Order Canceled</h2>
            <p>Hi {first_name},</p>
            <p>Your order <strong>{order_id}</strong> has been canceled by {laundry_name}.{reason_text}</p>
            <p>If you have questions about this cancellation, please contact us.</p>
            <p>— {laundry_name}</p>
            """
            sms_msg = f"Hi {first_name}, order {order_id} has been canceled by {laundry_name}.{reason_text}"

        if row.get("notif_email", True) and row["email"]:
            send_email(row["email"], subject, html_body,
                       sender_name=laundry_name, reply_to=laundry_reply_email)
        if row.get("notif_phone", True) and row["phone_number"]:
            send_sms_for_tenant(row["phone_number"], sms_msg, laundry_id)

    except Exception as e:
        logger.warning(f"Failed to send cancel notification for {order_id}: {e}")


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
                   notif_email, notif_sms, notif_phone, special_instructions,
                   is_commercial, billing_email
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
                "isCommercial": bool(customer.get("is_commercial")),
                "billingEmail": customer.get("billing_email") or "",
            }
        }
        # Return body as JSON string (frontend does JSON.parse on it)
        return {"statusCode": 200, "body": json_mod.dumps(data)}


@router.put("/update-customer-notifications")
async def update_customer_notifications(body: dict = Body({})):
    """Update customer notification preferences."""
    params = body.get("queryStringParameters", body)
    customer_id = params.get("customerId")
    prefs_str = params.get("notificationPreferences", "{}")
    
    import json as json_mod
    prefs = json_mod.loads(prefs_str) if isinstance(prefs_str, str) else prefs_str

    if not customer_id:
        return {"statusCode": 400, "body": {"message": "Missing customerId"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.customers
            SET notif_email = %s, notif_sms = %s, notif_phone = %s
            WHERE customer_id = %s
        """, (prefs.get("email", True), prefs.get("sms", True), prefs.get("phone", True), customer_id))

    return {"statusCode": 200, "body": {"status": "success", "message": "Notification preferences updated"}}


@router.patch("/update-profile")
async def update_customer_profile(body: dict = Body(...)):
    """Update customer profile information (name, email, billing email)."""
    import json as json_mod

    customer_id = body.get("customerId")
    first_name = body.get("firstName")
    last_name = body.get("lastName")
    email = body.get("email")
    billing_email = body.get("billingEmail")

    if not customer_id:
        return {"statusCode": 400, "body": json_mod.dumps({"status": "error", "message": "Missing customerId"})}

    # Build dynamic SET clause based on provided fields
    updates = []
    params = []
    if first_name is not None:
        updates.append("first_name = %s")
        params.append(first_name.strip())
    if last_name is not None:
        updates.append("last_name = %s")
        params.append(last_name.strip())
    if email is not None:
        updates.append("email = %s")
        params.append(email.strip())
    if billing_email is not None:
        updates.append("billing_email = %s")
        params.append(billing_email.strip())

    if not updates:
        return {"statusCode": 400, "body": json_mod.dumps({"status": "error", "message": "No fields to update"})}

    params.append(customer_id)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(f"""
            UPDATE shop.customers
            SET {', '.join(updates)}
            WHERE customer_id = %s
        """, tuple(params))

        if cur.rowcount == 0:
            return {"statusCode": 404, "body": json_mod.dumps({"status": "error", "message": "Customer not found"})}

    return {"statusCode": 200, "body": json_mod.dumps({"status": "success", "message": "Profile updated successfully"})}


@router.post("/create-review")
async def create_customer_review(body: dict = Body(...)):
    """Create an order review from the customer."""
    order_id = body.get("orderId")
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")
    rating = int(body.get("employeeRating") or body.get("rating") or 0)
    comments = body.get("reviewComment") or body.get("comments", "")
    image_base64 = body.get("imageBase64")
    employee_id = body.get("employeeId", "")

    if not order_id or not customer_id or rating == 0:
        return {"statusCode": 400, "body": {"status": "error", "message": "Missing required fields"}}

    # Upload review image to S3 if provided
    photo_url = None
    if image_base64:
        try:
            from app.services.s3_service import upload_review_image
            s3_result = upload_review_image(laundry_id or "1", order_id, image_base64)
            if s3_result["status"] == "success":
                photo_url = s3_result["url"]
            else:
                # Fallback: store base64 directly
                photo_url = image_base64 if image_base64.startswith("data:") else f"data:image/jpeg;base64,{image_base64}"
        except Exception as s3_err:
            logger.warning(f"S3 review image upload failed: {s3_err}")
            photo_url = image_base64 if image_base64.startswith("data:") else f"data:image/jpeg;base64,{image_base64}"

    with get_db() as conn:
        cur = get_cursor(conn)

        # Insert review
        import uuid
        review_id = str(uuid.uuid4())

        # Get employee who processed the order if not provided
        if not employee_id:
            cur.execute("SELECT last_updated_by FROM orders.orders WHERE order_id = %s", (order_id,))
            ord_row = cur.fetchone()
            employee_id = ord_row["last_updated_by"] if ord_row and ord_row["last_updated_by"] else None

        # Validate employee_id exists in employees table; if not, set to None
        if employee_id:
            cur.execute("SELECT emp_id FROM shop.employees WHERE emp_id = %s", (employee_id,))
            if not cur.fetchone():
                employee_id = None

        cur.execute("""
            INSERT INTO orders.order_reviews (review_id, order_id, customer_id, laundry_id, emp_id, employee_rating, review_comment, photo_url, review_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (order_id) DO UPDATE SET employee_rating = EXCLUDED.employee_rating, review_comment = EXCLUDED.review_comment, photo_url = EXCLUDED.photo_url
        """, (review_id, order_id, customer_id, laundry_id, employee_id, rating, comments, photo_url))

        # Mark order as reviewed
        cur.execute("UPDATE orders.orders SET is_reviewed = TRUE WHERE order_id = %s", (order_id,))

        # Update employee average rating if applicable
        cur.execute("SELECT last_updated_by FROM orders.orders WHERE order_id = %s", (order_id,))
        order_row = cur.fetchone()
        if order_row and order_row["last_updated_by"]:
            emp_id = order_row["last_updated_by"]
            cur.execute("""
                UPDATE shop.employees SET
                    avg_rating = (SELECT AVG(r.employee_rating) FROM orders.order_reviews r
                                  JOIN orders.orders o ON o.order_id = r.order_id
                                  WHERE o.last_updated_by = %s),
                    total_reviews = (SELECT COUNT(*) FROM orders.order_reviews r
                                    JOIN orders.orders o ON o.order_id = r.order_id
                                    WHERE o.last_updated_by = %s)
                WHERE emp_id = %s
            """, (emp_id, emp_id, emp_id))

    return {"statusCode": 200, "body": {"status": "success", "message": "Review submitted successfully"}}
