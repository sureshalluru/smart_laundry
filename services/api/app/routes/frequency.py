"""
Order Frequency routes — replaces OrderFrequencyService Lambda.
Processes recurring orders based on laundry_frequency subscriptions.
"""
from fastapi import APIRouter, Depends, Query, Body, HTTPException
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.subscription_service import SubscriptionService
from datetime import datetime, timedelta, date
import uuid
import logging
import re

logger = logging.getLogger(__name__)
router = APIRouter()


def _send_frequency_notification(customer_id, laundry_id, order_id, pickup_date, pickup_time):
    """Send email and SMS notification for auto-generated recurring order."""
    try:
        from app.services.notification_service import send_email, send_sms_for_tenant

        with get_db() as conn:
            cur = get_cursor(conn)
            # Get customer info
            cur.execute("""
                SELECT first_name, email, phone_number, notif_email, notif_sms, notif_phone
                FROM shop.customers WHERE customer_id = %s
            """, (customer_id,))
            customer = cur.fetchone()
            if not customer:
                return

            # Get laundry name
            cur.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            shop = cur.fetchone()
            laundry_name = shop["laundry_name"] if shop else "Your Laundry"
            contact_email = shop.get("contact_email") if shop else None

        first_name = customer["first_name"] or "Customer"
        email = customer["email"]
        phone = customer["phone_number"]

        # Email
        if customer.get("notif_email", True) and email:
            html_body = f"""
            <h2>Hi {first_name},</h2>
            <p>Your recurring laundry order has been scheduled!</p>
            <p><strong>Order ID:</strong> {order_id}</p>
            <p><strong>Pickup Date:</strong> {pickup_date}</p>
            <p><strong>Pickup Time:</strong> {pickup_time}</p>
            <p>We'll pick up your laundry at the scheduled time. If you need to make changes or cancel, please visit your account.</p>
            <p>Thank you for choosing {laundry_name}!</p>
            """
            send_email(email, f"Recurring Order Scheduled - {order_id}", html_body,
                       sender_name=laundry_name, reply_to=contact_email)

        # SMS
        if customer.get("notif_phone", True) and phone:
            sms_body = f"Hi {first_name}! Your recurring laundry pickup is scheduled for {pickup_date} ({pickup_time}). Order: {order_id}. - {laundry_name}"
            send_sms_for_tenant(phone, sms_body, laundry_id)

    except Exception as e:
        logger.warning(f"Failed to send frequency notification for {order_id}: {e}")


@router.post("/process")
async def process_frequencies():
    """
    Process all active frequency subscriptions.
    Called daily by Render Cron Job (no auth needed for cron).
    Creates orders for subscriptions where future_pickup_date <= today.
    """
    today = datetime.now().strftime('%Y-%m-%d')
    today_date = datetime.now().date()
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    orders_created = 0
    errors = []

    try:
        # Auto-resume: unpause subscriptions where pause_resume_date has passed
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT frequency_id, future_pickup_date, frequency
                FROM orders.laundry_frequency
                WHERE is_active = TRUE
                  AND is_paused = TRUE
                  AND pause_resume_date <= %s
            """, (today,))
            to_resume = cur.fetchall()

            for paused_sub in to_resume:
                freq_id = paused_sub["frequency_id"]
                freq = paused_sub["frequency"]
                base_date = paused_sub["future_pickup_date"]
                # Calculate next cadence-aligned date on or after today
                if freq.lower() == 'weekly':
                    fd = 7
                elif freq.lower() == 'monthly':
                    fd = 30
                else:
                    fd = 14
                next_date = base_date
                while next_date <= today_date:
                    next_date = next_date + timedelta(days=fd)
                cur.execute("""
                    UPDATE orders.laundry_frequency
                    SET is_paused = FALSE,
                        future_pickup_date = %s,
                        pause_resume_date = NULL,
                        pause_started_at = NULL,
                        updated_at = NOW()
                    WHERE frequency_id = %s
                """, (next_date, freq_id))
                logger.info(f"Auto-resumed subscription {freq_id}, next pickup: {next_date}")

        with get_db() as conn:
            cur = get_cursor(conn)
            # Find subscriptions where pickup is tomorrow (create order day before)
            # Exclude paused subscriptions
            cur.execute("""
                SELECT lf.*, ca.address, ca.door_number, ca.address_instructions,
                       cpp.stripe_customer_id,
                       lf.is_commercial AS freq_is_commercial,
                       lf.tip_amount AS freq_tip_amount,
                       lf.tip_percentage AS freq_tip_percentage,
                       lf.tip_type AS freq_tip_type,
                       lf.tip_method AS freq_tip_method,
                       c.is_commercial AS customer_is_commercial
                FROM orders.laundry_frequency lf
                JOIN shop.customer_addresses ca ON ca.address_id = lf.address_id
                JOIN shop.customers c ON c.customer_id = lf.customer_id
                LEFT JOIN shop.customer_payment_profiles cpp
                    ON cpp.customer_id = lf.customer_id AND cpp.laundry_id = lf.laundry_id
                WHERE lf.is_active = TRUE
                  AND (lf.is_paused = FALSE OR lf.is_paused IS NULL)
                  AND lf.future_pickup_date <= %s
            """, (tomorrow,))
            due_subscriptions = cur.fetchall()

        logger.info(f"Frequency processor: found {len(due_subscriptions)} due subscriptions")

        for sub in due_subscriptions:
            try:
                freq_id = sub["frequency_id"]
                customer_id = sub["customer_id"]
                laundry_id = sub["laundry_id"]
                address_id = sub["address_id"]
                frequency = sub["frequency"]
                pickup_time_interval = sub["pickup_time_interval"]
                dropoff_time_interval = sub["dropoff_time_interval"]
                future_pickup_date = str(sub["future_pickup_date"])
                customer_payment_id = sub.get("stripe_customer_id")

                # Calculate dropoff date (pickup + 1 day)
                pickup_dt = datetime.strptime(future_pickup_date, '%Y-%m-%d')
                dropoff_dt = pickup_dt + timedelta(days=1)
                dropoff_date = dropoff_dt.strftime('%Y-%m-%d')

                # Calculate next future pickup date
                # If rescheduled (original_pickup_date is set), advance from original date
                # Otherwise advance from current future_pickup_date
                original_pickup_date = sub.get("original_pickup_date")
                if frequency.lower() == 'weekly':
                    freq_days = 7
                elif frequency.lower() == 'monthly':
                    freq_days = 30
                else:
                    freq_days = 14  # bi-weekly

                if original_pickup_date:
                    # Advance from original date to maintain cadence
                    base_dt = datetime.combine(original_pickup_date, datetime.min.time())
                    next_future_pickup = (base_dt + timedelta(days=freq_days)).strftime('%Y-%m-%d')
                else:
                    next_future_pickup = (pickup_dt + timedelta(days=freq_days)).strftime('%Y-%m-%d')

                # Determine Uber pickup/dropoff from frequency flags
                uber_pickup_freq = sub.get("uber_pickup_frequency", False)
                uber_dropoff_freq = sub.get("uber_dropoff_frequency", False)
                pickup_service = "Uber" if uber_pickup_freq else "LaundryDriver"
                dropoff_service = "Uber" if uber_dropoff_freq else "LaundryDriver"

                # Generate order ID
                order_id = f"O-{uuid.uuid4().hex[:8].upper()}"

                # FIRST: Advance the future_pickup_date (prevents stuck subscriptions if order INSERT fails)
                # Also clear reschedule metadata and reset consecutive_skips on successful processing
                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("""
                        UPDATE orders.laundry_frequency
                        SET future_pickup_date = %s,
                            pickup_date = %s,
                            original_pickup_date = NULL,
                            reschedule_offset = NULL,
                            consecutive_skips = 0,
                            updated_at = NOW()
                        WHERE frequency_id = %s
                    """, (next_future_pickup, future_pickup_date, freq_id))

                # THEN: Create the order
                # For auto-charge per-bag subscriptions, calculate the discounted total
                auto_charge = sub.get("auto_charge", False)
                order_sub_total = 0
                order_discounted = 0
                order_total = 0
                order_grand_total = 0
                order_pricing_type = 'per_pound'

                if auto_charge:
                    # Look up bag price and subscription discount for this laundry
                    with get_db() as conn:
                        cur = get_cursor(conn)
                        cur.execute("SELECT bag_price, subscription_discount FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                        shop_info = cur.fetchone()
                    if shop_info:
                        bag_price = float(shop_info.get("bag_price") or 30)
                        sub_discount = float(shop_info.get("subscription_discount") or 0)
                        order_sub_total = bag_price  # 1 bag per recurring order
                        order_discounted = round(order_sub_total * sub_discount / 100, 2) if sub_discount > 0 else 0
                        order_total = round(order_sub_total - order_discounted, 2)
                        order_grand_total = order_total
                        order_pricing_type = 'per_bag'

                # Determine commercial status from frequency or customer flags
                is_commercial = bool(sub.get("freq_is_commercial")) or bool(sub.get("customer_is_commercial"))
                order_type = 'Commercial' if is_commercial else 'Online'
                pay_by_invoice = True if is_commercial else False

                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("""
                        INSERT INTO orders.orders (
                            order_id, laundry_id, customer_id, address_id,
                            order_type, order_status, status_category, payment_status,
                            pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                            laundry_bags, special_instructions, coupon, frequency,
                            sub_total, discounted_price, total_cost, grand_total,
                            pricing_type, pickup_service, dropoff_service,
                            auto_generated, is_reviewed, cancel_reason,
                            pay_by_invoice,
                            created_at, updated_at
                        ) VALUES (
                            %s,%s,%s,%s,%s,'OrderSubmitted','Active','Unpaid',
                            %s,%s,%s,%s,1,'',%s,%s,%s,%s,%s,%s,
                            %s,%s,%s,TRUE,FALSE,'',
                            %s,
                            NOW(),NOW()
                        )
                    """, (
                        order_id, laundry_id, customer_id, address_id, order_type,
                        future_pickup_date, pickup_time_interval,
                        dropoff_date, dropoff_time_interval,
                        None, frequency,
                        order_sub_total, order_discounted, order_total, order_grand_total,
                        order_pricing_type, pickup_service, dropoff_service,
                        pay_by_invoice,
                    ))

                # Insert tip data from frequency subscription
                tip_amount = float(sub.get("freq_tip_amount") or 0)
                tip_percentage = float(sub.get("freq_tip_percentage") or 0)
                tip_type = sub.get("freq_tip_type") or ""
                tip_method = sub.get("freq_tip_method") or ""

                if tip_amount > 0 or tip_percentage > 0:
                    with get_db() as conn:
                        cur = get_cursor(conn)
                        cur.execute("""
                            INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (order_id) DO UPDATE SET
                                tip_amount = EXCLUDED.tip_amount,
                                tip_percentage = EXCLUDED.tip_percentage,
                                tip_type = EXCLUDED.tip_type
                        """, (order_id, tip_amount, tip_percentage, tip_type, tip_method))
                    logger.info(f"Tip applied to recurring order {order_id}: amount={tip_amount}, pct={tip_percentage}%")

                # Create $1 hold if payment info exists
                auto_charge = sub.get("auto_charge", False)
                if auto_charge and customer_payment_id:
                    # Auto-charge: charge the full subscription amount immediately
                    try:
                        from app.services.payment_service import charge_saved_card
                        # For auto-charge subscriptions, we charge a base amount
                        # The actual amount will be adjusted when order is weighed
                        charge_result = charge_saved_card(
                            customer_payment_id=customer_payment_id,
                            amount=0,  # Will be charged when order is processed with actual weight
                            description=f"Subscription order {order_id} - will be charged on completion",
                            laundry_id=laundry_id,
                        )
                        # Mark order as auto-charge subscription
                        with get_db() as conn:
                            cur = get_cursor(conn)
                            cur.execute("""
                                UPDATE orders.orders SET payment_status = 'AutoCharge'
                                WHERE order_id = %s
                            """, (order_id,))
                        logger.info(f"Auto-charge subscription order {order_id} marked for auto-charge on completion")
                        # Audit: auto-charge setup success
                        try:
                            from app.services.audit_service import log_action
                            log_action(laundry_id, "frequency_auto_charge_setup", "order", order_id, {
                                "customer_payment_id": customer_payment_id,
                                "frequency": frequency,
                            }, performed_by="system")
                        except Exception:
                            pass
                    except Exception as charge_err:
                        logger.warning(f"Auto-charge setup failed for order {order_id}: {charge_err}")
                        # Still create order but mark payment as pending
                        with get_db() as conn:
                            cur = get_cursor(conn)
                            cur.execute("""
                                UPDATE orders.orders SET payment_status = 'PaymentFailed'
                                WHERE order_id = %s
                            """, (order_id,))
                        # Audit: auto-charge setup FAILED
                        try:
                            from app.services.audit_service import log_action
                            log_action(laundry_id, "frequency_auto_charge_failed", "order", order_id, {
                                "error": str(charge_err),
                                "customer_payment_id": customer_payment_id,
                                "frequency": frequency,
                            }, performed_by="system")
                        except Exception:
                            pass
                elif customer_payment_id:
                    try:
                        from app.services.payment_service import create_hold
                        hold_result = create_hold(
                            customer_payment_id=customer_payment_id,
                            amount=1.00,
                            description=f"$1 auth hold for recurring order {order_id}",
                            laundry_id=laundry_id,
                        )
                        if hold_result.get("status") == "success":
                            with get_db() as conn:
                                cur = get_cursor(conn)
                                cur.execute("""
                                    INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                                    VALUES (%s, %s, %s, 'hold')
                                    ON CONFLICT DO NOTHING
                                """, (order_id, hold_result["paymentIntentId"], 1.00))
                        else:
                            logger.warning(f"Hold failed for recurring order {order_id}: {hold_result.get('message')}")
                    except Exception as hold_err:
                        logger.warning(f"Hold error for recurring order {order_id}: {hold_err}")

                # Send notification to customer
                _send_frequency_notification(customer_id, laundry_id, order_id, future_pickup_date, pickup_time_interval)

                # Schedule Uber if applicable
                if pickup_service == "Uber" or dropoff_service == "Uber":
                    try:
                        from app.routes.uber import (
                            get_laundry_uber_credentials, get_uber_access_token,
                            create_uber_quote, schedule_uber_delivery
                        )
                        import json as _json
                        from zoneinfo import ZoneInfo as _ZoneInfo

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
                            customer_name_uber = f"{cust_row['first_name'] or ''} {cust_row['last_name'] or ''}".strip()
                            customer_phone = cust_row["phone_number"] or ""
                            customer_addr = sub.get("address", "")
                            addr_instructions = (sub.get("address_instructions") or "").strip()

                            creds = get_laundry_uber_credentials(laundry_id)
                            token = get_uber_access_token(creds["clientId"], creds["clientSecret"])
                            local_tz = _ZoneInfo(creds["timeZone"])

                            if pickup_service == "Uber" and pickup_time_interval:
                                try:
                                    s1, e1 = pickup_time_interval.split("-")
                                    p_s = datetime.strptime(f"{future_pickup_date} {s1.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                                    p_e = datetime.strptime(f"{future_pickup_date} {e1.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                                    qid = create_uber_quote(token, creds["customerId"], creds["baseUrl"],
                                                            customer_addr, laundry_addr, customer_phone, laundry_phone,
                                                            p_s.isoformat(), p_e.isoformat(), "laundryPickup")
                                    res = schedule_uber_delivery(token, creds["customerId"], creds["baseUrl"], qid,
                                                                customer_addr, laundry_addr, customer_phone, laundry_phone,
                                                                order_id, 1, customer_name_uber, laundry_name_uber,
                                                                addr_instructions, laundry_instructions, laundry_name_uber,
                                                                creds["uberEnv"], p_s.isoformat(), p_e.isoformat(), "laundryPickup")
                                    with get_db() as cu:
                                        c = get_cursor(cu)
                                        c.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
                                        r = c.fetchone()
                                        ui = (r["uber_info"] if r and r["uber_info"] else {}) or {}
                                        ui["laundryPickup"] = {"deliveryId": res.get("id"), "feeCents": res.get("fee", 0), "trackingUrl": res.get("tracking_url")}
                                        c.execute("UPDATE orders.orders SET uber_info = %s, uber_pickup_fee = %s, pickup_tracking_url = %s WHERE order_id = %s",
                                                  (_json.dumps(ui), res.get("fee", 0) / 100.0, res.get("tracking_url"), order_id))
                                    logger.info(f"Uber pickup scheduled for recurring order {order_id}")
                                except Exception as ue:
                                    logger.warning(f"Uber pickup failed for recurring {order_id}: {ue}")
                                    with get_db() as fb:
                                        get_cursor(fb).execute("UPDATE orders.orders SET pickup_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))

                            if dropoff_service == "Uber" and dropoff_time_interval:
                                try:
                                    s2, e2 = dropoff_time_interval.split("-")
                                    d_s = datetime.strptime(f"{dropoff_date} {s2.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                                    d_e = datetime.strptime(f"{dropoff_date} {e2.strip()}", "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
                                    qid2 = create_uber_quote(token, creds["customerId"], creds["baseUrl"],
                                                             laundry_addr, customer_addr, laundry_phone, customer_phone,
                                                             d_s.isoformat(), d_e.isoformat(), "laundryDropoff")
                                    res2 = schedule_uber_delivery(token, creds["customerId"], creds["baseUrl"], qid2,
                                                                  laundry_addr, customer_addr, laundry_phone, customer_phone,
                                                                  order_id, 1, laundry_name_uber, customer_name_uber,
                                                                  laundry_instructions, addr_instructions, laundry_name_uber,
                                                                  creds["uberEnv"], d_s.isoformat(), d_e.isoformat(), "laundryDropoff")
                                    with get_db() as cu2:
                                        c2 = get_cursor(cu2)
                                        c2.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
                                        r2 = c2.fetchone()
                                        ui2 = (r2["uber_info"] if r2 and r2["uber_info"] else {}) or {}
                                        ui2["laundryDropoff"] = {"deliveryId": res2.get("id"), "feeCents": res2.get("fee", 0), "trackingUrl": res2.get("tracking_url")}
                                        c2.execute("UPDATE orders.orders SET uber_info = %s, uber_dropoff_fee = %s, dropoff_tracking_url = %s WHERE order_id = %s",
                                                   (_json.dumps(ui2), res2.get("fee", 0) / 100.0, res2.get("tracking_url"), order_id))
                                    logger.info(f"Uber dropoff scheduled for recurring order {order_id}")
                                except Exception as ue2:
                                    logger.warning(f"Uber dropoff failed for recurring {order_id}: {ue2}")
                                    with get_db() as fb2:
                                        get_cursor(fb2).execute("UPDATE orders.orders SET dropoff_service = 'LaundryDriver' WHERE order_id = %s", (order_id,))
                    except Exception as uber_err:
                        logger.warning(f"Uber scheduling error for recurring order {order_id}: {uber_err}")

                orders_created += 1
                logger.info(f"Created recurring order {order_id} for customer {customer_id} (freq: {frequency})")

            except Exception as sub_err:
                errors.append({"frequencyId": sub.get("frequency_id"), "error": str(sub_err)})
                logger.exception(f"Error processing frequency {sub.get('frequency_id')}")

    except Exception as e:
        logger.exception("Frequency processor failed")
        return {"status": "error", "message": str(e)}

    return {
        "status": "success",
        "ordersCreated": orders_created,
        "errors": errors,
        "processedDate": today,
    }


@router.post("/test-process")
async def test_frequency_process(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """
    Test frequency processing by temporarily setting a subscription's
    future_pickup_date to today, then running the processor.
    
    Body: { "customerId": "...", "laundryId": "..." }
    """
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")

    if not customer_id or not laundry_id:
        return {"status": "error", "message": "Missing customerId or laundryId"}

    today = datetime.now().strftime('%Y-%m-%d')

    with get_db() as conn:
        cur = get_cursor(conn)
        # Set future_pickup_date to today for this customer's subscription
        cur.execute("""
            UPDATE orders.laundry_frequency
            SET future_pickup_date = %s, updated_at = NOW()
            WHERE customer_id = %s AND laundry_id = %s AND is_active = TRUE
            RETURNING frequency_id, frequency
        """, (today, customer_id, laundry_id))
        updated = cur.fetchone()
        if not updated:
            return {"status": "error", "message": "No active frequency subscription found for this customer"}

    logger.info(f"Test: Set future_pickup_date to {today} for customer {customer_id}")

    # Now run the processor
    result = await process_frequencies()
    return {
        "status": "success",
        "message": f"Test triggered for frequency {updated['frequency_id']} ({updated['frequency']})",
        "processResult": result,
    }


@router.get("/active")
async def get_active_frequencies(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List active frequency subscriptions for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT lf.*, c.first_name, c.last_name, c.phone_number,
                   lf.is_commercial AS frequency_is_commercial,
                   c.is_commercial AS customer_is_commercial
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            WHERE lf.laundry_id = %s AND lf.is_active = TRUE
            ORDER BY lf.future_pickup_date ASC
        """, (laundryId,))
        frequencies = []
        for r in cur.fetchall():
            freq_commercial = bool(r["frequency_is_commercial"])
            cust_commercial = bool(r["customer_is_commercial"])
            frequencies.append({
                "frequencyId": str(r["frequency_id"]),
                "customerId": r["customer_id"],
                "firstName": r["first_name"],
                "lastName": r["last_name"],
                "phoneNumber": r["phone_number"],
                "frequency": r["frequency"],
                "pickupDate": str(r["pickup_date"]) if r["pickup_date"] else None,
                "pickupTimeInterval": r["pickup_time_interval"],
                "dropoffTimeInterval": r["dropoff_time_interval"],
                "futurePickupDate": str(r["future_pickup_date"]) if r["future_pickup_date"] else None,
                "frequencyStartDate": str(r["frequency_start_date"]) if r["frequency_start_date"] else None,
                "isActive": r["is_active"],
                "isCommercial": freq_commercial,
                "customerIsCommercial": cust_commercial,
                "effectiveCommercial": freq_commercial or cust_commercial,
            })
    return {"body": {"status": "success", "data": frequencies}}


@router.put("/cancel")
async def cancel_frequency(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Cancel a customer's frequency subscription."""
    frequency_id = body.get("frequencyId")

    if not frequency_id:
        return {"status": "error", "message": "Missing frequencyId"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE orders.laundry_frequency
            SET is_active = FALSE, updated_at = NOW()
            WHERE frequency_id = %s
        """, (frequency_id,))
        if cur.rowcount == 0:
            return {"status": "error", "message": "Frequency not found"}

    return {"status": "success", "message": "Frequency subscription canceled"}


@router.get("/upcoming")
async def get_upcoming_orders(
    laundryId: str = Query(...),
    days: int = Query(90),
    current_user: dict = Depends(get_current_user),
):
    """
    Project upcoming recurring orders for the next N days (default 90).
    Based on active frequency subscriptions, calculates all future pickup dates.
    """
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT lf.frequency_id, lf.customer_id, lf.frequency,
                   lf.future_pickup_date, lf.pickup_time_interval, lf.dropoff_time_interval,
                   lf.auto_charge,
                   lf.is_commercial AS frequency_is_commercial,
                   c.first_name, c.last_name, c.phone_number,
                   c.is_commercial AS customer_is_commercial,
                   ca.address
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            LEFT JOIN shop.customer_addresses ca ON ca.address_id = lf.address_id
            WHERE lf.laundry_id = %s AND lf.is_active = TRUE
            ORDER BY lf.future_pickup_date ASC
        """, (laundryId,))
        subscriptions = cur.fetchall()

    # Project future dates for each subscription
    today = datetime.now().date()
    end_date = today + timedelta(days=days)
    upcoming = []

    for sub in subscriptions:
        frequency = sub["frequency"]
        freq_commercial = bool(sub.get("frequency_is_commercial"))
        cust_commercial = bool(sub.get("customer_is_commercial"))
        effective_commercial = freq_commercial or cust_commercial
        if frequency.lower() == 'weekly':
            freq_days = 7
        elif frequency.lower() == 'monthly':
            freq_days = 30
        else:
            freq_days = 14  # bi-weekly

        # Start from future_pickup_date and project forward
        next_date = sub["future_pickup_date"]
        if next_date is None:
            continue

        # Convert to date if it's a datetime
        if hasattr(next_date, 'date'):
            next_date = next_date.date()
        elif isinstance(next_date, str):
            next_date = datetime.strptime(str(next_date), '%Y-%m-%d').date()

        while next_date <= end_date:
            if next_date >= today:
                upcoming.append({
                    "frequencyId": str(sub["frequency_id"]),
                    "customerId": sub["customer_id"],
                    "customerName": f"{sub['first_name']} {sub['last_name']}".strip(),
                    "customerPhone": sub["phone_number"] or "",
                    "address": sub["address"] or "",
                    "frequency": frequency,
                    "pickupDate": str(next_date),
                    "pickupTimeInterval": sub["pickup_time_interval"] or "",
                    "dropoffTimeInterval": sub["dropoff_time_interval"] or "",
                    "autoCharge": sub["auto_charge"] or False,
                    "pickupService": "LaundryDriver",
                    "dropoffService": "LaundryDriver",
                    "isCommercial": freq_commercial,
                    "customerIsCommercial": cust_commercial,
                    "effectiveCommercial": effective_commercial,
                })
            next_date = next_date + timedelta(days=freq_days)

    # Sort by pickup date
    upcoming.sort(key=lambda x: x["pickupDate"])

    return {
        "status": "success",
        "upcoming": upcoming,
        "totalCount": len(upcoming),
        "daysProjected": days,
    }


# ─── Customer Subscription Management Endpoints ───

@router.get("/subscription/details")
async def get_subscription_details(
    frequencyId: str = Query(...),
    customerId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get subscription details including upcoming dates and status."""
    result = SubscriptionService.get_details(frequencyId, customerId)
    if result is None:
        raise HTTPException(status_code=404, detail={
            "status": "error",
            "code": "SUBSCRIPTION_NOT_FOUND",
            "message": "Subscription not found or inactive."
        })
    return {"status": "success", "data": result}


@router.post("/subscription/reschedule")
async def reschedule_subscription(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Reschedule the next occurrence to a target date within ±3 days."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")
    target_date = body.get("targetDate")

    if not frequency_id or not customer_id or not target_date:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId, customerId, and targetDate are required."
        })

    result = SubscriptionService.reschedule(frequency_id, customer_id, target_date)

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.post("/subscription/undo-reschedule")
async def undo_reschedule_subscription(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Revert a reschedule back to the original date."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")

    if not frequency_id or not customer_id:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId and customerId are required."
        })

    result = SubscriptionService.undo_reschedule(frequency_id, customer_id)

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.post("/subscription/skip")
async def skip_subscription(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Skip the next occurrence and advance to the following cadence date."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")
    reason = body.get("reason")

    if not frequency_id or not customer_id:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId and customerId are required."
        })

    result = SubscriptionService.skip(frequency_id, customer_id, reason=reason)

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.post("/subscription/pause")
async def pause_subscription(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Pause subscription for 1-4 weeks."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")
    weeks = body.get("weeks")

    if not frequency_id or not customer_id or weeks is None:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId, customerId, and weeks are required."
        })

    result = SubscriptionService.pause(frequency_id, customer_id, int(weeks))

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.post("/subscription/resume")
async def resume_subscription(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Resume a paused subscription."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")

    if not frequency_id or not customer_id:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId and customerId are required."
        })

    result = SubscriptionService.resume(frequency_id, customer_id)

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


# ─── SMS Webhook ───

def _parse_sms_command(body_text: str) -> dict:
    """
    Parse an inbound SMS command. Returns dict with 'command' and optional 'argument'.
    Supported commands: SKIP, MOVE ±1-3, PAUSE 1-4, RESUME (case-insensitive).
    """
    text = (body_text or "").strip().upper()

    if not text:
        return {"command": None, "error": "Empty message"}

    # SKIP
    if re.match(r'^SKIP\b', text):
        return {"command": "skip"}

    # MOVE ±1-3
    move_match = re.match(r'^MOVE\s*([+-]?\d+)?$', text)
    if move_match:
        offset_str = move_match.group(1)
        offset = int(offset_str) if offset_str else 1
        if abs(offset) < 1 or abs(offset) > 3:
            return {"command": None, "error": f"MOVE offset must be ±1-3, got {offset}"}
        return {"command": "move", "argument": offset}

    # PAUSE 1-4
    pause_match = re.match(r'^PAUSE\s*(\d+)?$', text)
    if pause_match:
        weeks_str = pause_match.group(1)
        weeks = int(weeks_str) if weeks_str else 1
        if weeks < 1 or weeks > 4:
            return {"command": None, "error": f"PAUSE weeks must be 1-4, got {weeks}"}
        return {"command": "pause", "argument": weeks}

    # RESUME
    if re.match(r'^RESUME\b', text):
        return {"command": "resume"}

    return {"command": None, "error": f"Unrecognized command: {text}"}


@router.post("/sms-webhook")
async def sms_webhook(body: dict = Body(...)):
    """
    Inbound SMS webhook (Twilio-style).
    Parses SMS commands and delegates to SubscriptionService.
    No JWT auth — relies on Twilio signature validation in production.
    """
    # Twilio sends From and Body fields
    from_number = body.get("From", "") or body.get("from", "")
    sms_body = body.get("Body", "") or body.get("body", "")

    if not from_number:
        return {"status": "error", "message": "Missing phone number."}

    # Normalize phone number (strip +1 prefix for lookup)
    normalized_phone = from_number.replace("+1", "").replace("-", "").replace(" ", "").strip()
    if normalized_phone.startswith("1") and len(normalized_phone) == 11:
        normalized_phone = normalized_phone[1:]

    # Resolve customer by phone
    customer = None
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT customer_id, first_name FROM shop.customers
            WHERE REPLACE(REPLACE(phone_number, '+1', ''), '-', '') = %s
            LIMIT 1
        """, (normalized_phone,))
        customer = cur.fetchone()

    if not customer:
        return {
            "status": "error",
            "message": "We couldn't find a subscription for this number. Text HELP for assistance."
        }

    customer_id = customer["customer_id"]

    # Find active frequency for this customer
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT frequency_id FROM orders.laundry_frequency
            WHERE customer_id = %s AND is_active = TRUE
            ORDER BY future_pickup_date ASC
            LIMIT 1
        """, (customer_id,))
        freq_row = cur.fetchone()

    if not freq_row:
        return {
            "status": "error",
            "message": "No active subscription found. Text HELP for assistance."
        }

    frequency_id = str(freq_row["frequency_id"])

    # Parse command
    parsed = _parse_sms_command(sms_body)
    if parsed["command"] is None:
        error_msg = parsed.get("error", "Unrecognized command")
        return {
            "status": "error",
            "message": f"{error_msg}. Reply SKIP, MOVE ±1-3, PAUSE 1-4, or RESUME."
        }

    # Execute command
    command = parsed["command"]

    if command == "skip":
        result = SubscriptionService.skip(frequency_id, customer_id, reason="SMS", actor="customer")
    elif command == "move":
        # Calculate target date from offset
        details = SubscriptionService.get_details(frequency_id, customer_id)
        if not details:
            return {"status": "error", "message": "Subscription not found."}
        current_date = date.fromisoformat(details["nextPickupDate"])
        target_date = current_date + timedelta(days=parsed["argument"])
        result = SubscriptionService.reschedule(frequency_id, customer_id, str(target_date))
    elif command == "pause":
        weeks = parsed.get("argument", 1)
        result = SubscriptionService.pause(frequency_id, customer_id, weeks)
    elif command == "resume":
        result = SubscriptionService.resume(frequency_id, customer_id)
    else:
        return {"status": "error", "message": "Unknown command."}

    # Return result message
    return {
        "status": result.get("status", "error"),
        "message": result.get("message", "Action completed.")
    }


# ─── Admin Subscription Endpoints ───

@router.get("/admin/subscription-status")
async def admin_subscription_status(
    frequencyId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get full subscription details for admin view."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT lf.frequency_id, lf.customer_id, lf.frequency, lf.future_pickup_date,
                   lf.pickup_time_interval, lf.is_active, lf.is_paused,
                   lf.pause_resume_date, lf.pause_started_at,
                   lf.original_pickup_date, lf.reschedule_offset,
                   lf.consecutive_skips, lf.total_skips_30d, lf.last_skip_date,
                   c.first_name, c.last_name, c.phone_number
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            WHERE lf.frequency_id = %s
        """, (frequencyId,))
        sub = cur.fetchone()

    if not sub:
        raise HTTPException(status_code=404, detail={
            "status": "error",
            "code": "SUBSCRIPTION_NOT_FOUND",
            "message": "Subscription not found."
        })

    return {
        "status": "success",
        "data": {
            "frequencyId": str(sub["frequency_id"]),
            "customerId": sub["customer_id"],
            "customerName": f"{sub['first_name']} {sub['last_name']}".strip(),
            "customerPhone": sub["phone_number"],
            "frequency": sub["frequency"],
            "futurePickupDate": str(sub["future_pickup_date"]) if sub["future_pickup_date"] else None,
            "pickupTimeInterval": sub["pickup_time_interval"],
            "isActive": sub["is_active"],
            "isPaused": sub["is_paused"] or False,
            "pauseResumeDate": str(sub["pause_resume_date"]) if sub["pause_resume_date"] else None,
            "pauseStartedAt": str(sub["pause_started_at"]) if sub["pause_started_at"] else None,
            "originalPickupDate": str(sub["original_pickup_date"]) if sub["original_pickup_date"] else None,
            "rescheduleOffset": sub["reschedule_offset"],
            "consecutiveSkips": sub["consecutive_skips"] or 0,
            "totalSkips30d": sub["total_skips_30d"] or 0,
            "lastSkipDate": str(sub["last_skip_date"]) if sub["last_skip_date"] else None,
        }
    }


@router.post("/admin/reschedule")
async def admin_reschedule(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin reschedule — bypasses cutoff window."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")
    target_date = body.get("targetDate")

    if not frequency_id or not customer_id or not target_date:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId, customerId, and targetDate are required."
        })

    result = SubscriptionService.reschedule(frequency_id, customer_id, target_date, actor="admin")

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.post("/admin/skip")
async def admin_skip(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin skip — bypasses cutoff window."""
    frequency_id = body.get("frequencyId")
    customer_id = body.get("customerId")
    reason = body.get("reason")

    if not frequency_id or not customer_id:
        raise HTTPException(status_code=422, detail={
            "status": "error",
            "code": "MISSING_FIELDS",
            "message": "frequencyId and customerId are required."
        })

    result = SubscriptionService.skip(frequency_id, customer_id, reason=reason, actor="admin")

    if result["status"] == "error":
        status_code = _error_code_to_http(result.get("code"))
        raise HTTPException(status_code=status_code, detail=result)

    return result


@router.get("/admin/action-log")
async def admin_action_log(
    frequencyId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get audit log for a subscription."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT action_id, frequency_id, action_type, actor,
                   original_date, new_date, reason, metadata, created_at
            FROM orders.subscription_actions
            WHERE frequency_id = %s
            ORDER BY created_at DESC
            LIMIT 50
        """, (frequencyId,))
        actions = cur.fetchall()

    log_entries = []
    for a in actions:
        log_entries.append({
            "actionId": str(a["action_id"]),
            "frequencyId": str(a["frequency_id"]),
            "actionType": a["action_type"],
            "actor": a["actor"],
            "originalDate": str(a["original_date"]) if a["original_date"] else None,
            "newDate": str(a["new_date"]) if a["new_date"] else None,
            "reason": a["reason"],
            "metadata": a["metadata"] or {},
            "createdAt": str(a["created_at"]) if a["created_at"] else None,
        })

    return {"status": "success", "data": log_entries}


@router.get("/admin/at-risk")
async def admin_at_risk(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get subscriptions with 3+ consecutive skips (at-risk for churn)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT lf.frequency_id, lf.customer_id, lf.frequency,
                   lf.future_pickup_date, lf.consecutive_skips,
                   lf.last_skip_date, lf.is_paused,
                   c.first_name, c.last_name, c.phone_number
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            WHERE lf.laundry_id = %s
              AND lf.is_active = TRUE
              AND lf.consecutive_skips >= 3
            ORDER BY lf.consecutive_skips DESC
        """, (laundryId,))
        at_risk = cur.fetchall()

    results = []
    for r in at_risk:
        results.append({
            "frequencyId": str(r["frequency_id"]),
            "customerId": r["customer_id"],
            "customerName": f"{r['first_name']} {r['last_name']}".strip(),
            "customerPhone": r["phone_number"],
            "frequency": r["frequency"],
            "futurePickupDate": str(r["future_pickup_date"]) if r["future_pickup_date"] else None,
            "consecutiveSkips": r["consecutive_skips"] or 0,
            "lastSkipDate": str(r["last_skip_date"]) if r["last_skip_date"] else None,
            "isPaused": r["is_paused"] or False,
        })

    return {"status": "success", "data": results, "count": len(results)}


# ─── Helper: Map error codes to HTTP status ───

def _error_code_to_http(code: str) -> int:
    """Map SubscriptionService error codes to HTTP status codes."""
    code_map = {
        "CUTOFF_EXCEEDED": 422,
        "INVALID_DATE_RANGE": 422,
        "DATE_IN_PAST": 422,
        "INVALID_PAUSE_DURATION": 422,
        "ALREADY_RESCHEDULED": 409,
        "NOT_RESCHEDULED": 409,
        "ALREADY_PAUSED": 409,
        "NOT_PAUSED": 409,
        "ORDER_IN_PROGRESS": 409,
        "SUBSCRIPTION_NOT_FOUND": 404,
        "INVALID_SMS_COMMAND": 422,
        "MISSING_FIELDS": 422,
    }
    return code_map.get(code, 400)
