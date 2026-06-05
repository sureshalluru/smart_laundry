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
            cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            shop = cur.fetchone()
            laundry_name = shop["laundry_name"] if shop else "Your Laundry"

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
            send_email(email, f"Recurring Order Scheduled - {order_id}", html_body)

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
                freq_days = 7 if frequency.lower() == 'weekly' else 14
                next_future_pickup = (pickup_dt + timedelta(days=freq_days)).strftime('%Y-%m-%d')

                # Generate order ID
                order_id = f"O-{uuid.uuid4().hex[:8].upper()}"

                with get_db() as conn:
                    cur = get_cursor(conn)
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
                            %s,%s,%s,%s,1,'',%s,%s,0,0,0,0,
                            'per_pound',TRUE,FALSE,'',NOW(),NOW()
                        )
                    """, (
                        order_id, laundry_id, customer_id, address_id,
                        future_pickup_date, pickup_time_interval,
                        dropoff_date, dropoff_time_interval,
                        None, frequency,
                    ))

                    # Advance the future_pickup_date on the subscription
                    cur.execute("""
                        UPDATE orders.laundry_frequency
                        SET future_pickup_date = %s,
                            pickup_date = %s,
                            updated_at = NOW()
                        WHERE frequency_id = %s
                    """, (next_future_pickup, future_pickup_date, freq_id))

                # Create $1 hold if payment info exists
                if customer_payment_id:
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
