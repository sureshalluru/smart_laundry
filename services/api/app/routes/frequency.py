"""
Order Frequency routes — replaces OrderFrequencyService Lambda.
Processes recurring orders based on laundry_frequency subscriptions.
"""
from fastapi import APIRouter, Depends, Query, Body
from app.database import get_db, get_cursor
from app.auth import get_current_user
from datetime import datetime, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _send_frequency_notification(customer_id, laundry_id, order_id, pickup_date, pickup_time):
    """Send email and SMS notification for auto-generated recurring order."""
    try:
        from app.services.notification_service import send_email, send_sms

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
            cur.execute("SELECT laundry_name, laundry_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            shop = cur.fetchone()
            laundry_name = shop["laundry_name"] if shop else "Your Laundry"
            laundry_email = shop.get("laundry_email") if shop else None

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
                       sender_name=laundry_name, reply_to=laundry_email)

        # SMS
        if customer.get("notif_phone", True) and phone:
            sms_body = f"Hi {first_name}! Your recurring laundry pickup is scheduled for {pickup_date} ({pickup_time}). Order: {order_id}. - {laundry_name}"
            send_sms(phone, sms_body)

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
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    orders_created = 0
    errors = []

    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            # Find subscriptions where pickup is tomorrow (create order day before)
            cur.execute("""
                SELECT lf.*, ca.address, ca.door_number, ca.address_instructions,
                       cpp.stripe_customer_id
                FROM orders.laundry_frequency lf
                JOIN shop.customer_addresses ca ON ca.address_id = lf.address_id
                LEFT JOIN shop.customer_payment_profiles cpp
                    ON cpp.customer_id = lf.customer_id AND cpp.laundry_id = lf.laundry_id
                WHERE lf.is_active = TRUE
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
                if frequency.lower() == 'weekly':
                    freq_days = 7
                elif frequency.lower() == 'monthly':
                    freq_days = 30
                else:
                    freq_days = 14  # bi-weekly
                next_future_pickup = (pickup_dt + timedelta(days=freq_days)).strftime('%Y-%m-%d')

                # Determine Uber pickup/dropoff from frequency flags
                uber_pickup_freq = sub.get("uber_pickup_frequency", False)
                uber_dropoff_freq = sub.get("uber_dropoff_frequency", False)
                pickup_service = "Uber" if uber_pickup_freq else "LaundryDriver"
                dropoff_service = "Uber" if uber_dropoff_freq else "LaundryDriver"

                # Generate order ID
                order_id = f"O-{uuid.uuid4().hex[:8].upper()}"

                # FIRST: Advance the future_pickup_date (prevents stuck subscriptions if order INSERT fails)
                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("""
                        UPDATE orders.laundry_frequency
                        SET future_pickup_date = %s,
                            pickup_date = %s,
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
                            created_at, updated_at
                        ) VALUES (
                            %s,%s,%s,%s,'Online','OrderSubmitted','Active','Unpaid',
                            %s,%s,%s,%s,1,'',%s,%s,%s,%s,%s,%s,
                            %s,%s,%s,TRUE,FALSE,'',NOW(),NOW()
                        )
                    """, (
                        order_id, laundry_id, customer_id, address_id,
                        future_pickup_date, pickup_time_interval,
                        dropoff_date, dropoff_time_interval,
                        None, frequency,
                        order_sub_total, order_discounted, order_total, order_grand_total,
                        order_pricing_type, pickup_service, dropoff_service,
                    ))

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
                    except Exception as charge_err:
                        logger.warning(f"Auto-charge setup failed for order {order_id}: {charge_err}")
                        # Still create order but mark payment as pending
                        with get_db() as conn:
                            cur = get_cursor(conn)
                            cur.execute("""
                                UPDATE orders.orders SET payment_status = 'PaymentFailed'
                                WHERE order_id = %s
                            """, (order_id,))
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
            SELECT lf.*, c.first_name, c.last_name, c.phone_number
            FROM orders.laundry_frequency lf
            JOIN shop.customers c ON c.customer_id = lf.customer_id
            WHERE lf.laundry_id = %s AND lf.is_active = TRUE
            ORDER BY lf.future_pickup_date ASC
        """, (laundryId,))
        frequencies = []
        for r in cur.fetchall():
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
                   c.first_name, c.last_name, c.phone_number,
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
