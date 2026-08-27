"""Abandoned cart / missed pickup SMS recovery."""
import logging
from datetime import datetime, timedelta
from app.database import get_db, get_cursor
from app.services.notification_service import send_sms_for_tenant

logger = logging.getLogger(__name__)


def process_abandoned_carts():
    """Find and notify customers who missed pickups or never ordered."""
    logger.info("Running abandoned cart SMS processor...")
    total_sent = 0

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get all laundries with SMS enabled
        cur.execute("""
            SELECT laundry_id, laundry_name, user_domain
            FROM shop.laundry_shops WHERE sms_enabled = TRUE
        """)
        laundries = cur.fetchall()

        for laundry in laundries:
            lid = laundry["laundry_id"]
            name = laundry["laundry_name"]
            domain = laundry.get("user_domain") or "smartlaundrybasket.ai"

            # Segment 1: Customers who registered but never ordered (2+ days ago)
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.phone_number
                FROM shop.customers c
                JOIN shop.customer_laundry_stats cls ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
                WHERE cls.total_orders_placed = 0
                  AND c.created_at < NOW() - INTERVAL '2 days'
                  AND c.phone_number IS NOT NULL AND c.phone_number != ''
                  AND NOT EXISTS (
                    SELECT 1 FROM shop.customer_reminders cr
                    WHERE cr.customer_id = c.customer_id AND cr.laundry_id = %s
                      AND cr.reminder_type = 'abandoned_cart'
                      AND cr.created_at > NOW() - INTERVAL '7 days'
                  )
                LIMIT 50
            """, (lid, lid))
            never_ordered = cur.fetchall()

            for cust in never_ordered:
                msg = (
                    f"Hi {cust['first_name'] or 'there'}! Your laundry is waiting "
                    f"\U0001f9fa Schedule your first pickup now: "
                    f"https://{domain}/{lid}/site \u2014 {name}"
                )
                try:
                    send_sms_for_tenant(cust["phone_number"], msg, lid)
                    cur.execute("""
                        INSERT INTO shop.customer_reminders (customer_id, laundry_id, reminder_type)
                        VALUES (%s, %s, 'abandoned_cart')
                    """, (cust["customer_id"], lid))
                    total_sent += 1
                except Exception as e:
                    logger.warning(f"Abandoned cart SMS failed for {cust['customer_id']}: {e}")

            # Segment 2: Active subscribers who missed their pickup (future_pickup_date passed 7+ days)
            cur.execute("""
                SELECT lf.customer_id::text AS customer_id, c.first_name, c.phone_number
                FROM orders.laundry_frequency lf
                JOIN shop.customers c ON c.customer_id = lf.customer_id::text
                WHERE lf.laundry_id = %s AND lf.is_active = TRUE
                  AND lf.future_pickup_date < NOW()::date - INTERVAL '7 days'
                  AND c.phone_number IS NOT NULL AND c.phone_number != ''
                  AND NOT EXISTS (
                    SELECT 1 FROM shop.customer_reminders cr
                    WHERE cr.customer_id = lf.customer_id::text AND cr.laundry_id = %s
                      AND cr.reminder_type = 'missed_pickup'
                      AND cr.created_at > NOW() - INTERVAL '7 days'
                  )
                LIMIT 50
            """, (lid, lid))
            missed = cur.fetchall()

            for cust in missed:
                msg = (
                    f"Hi {cust['first_name'] or 'there'}! We noticed you missed your "
                    f"last laundry pickup. Ready to reschedule? Book now: "
                    f"https://{domain}/{lid}/site \u2014 {name}"
                )
                try:
                    send_sms_for_tenant(cust["phone_number"], msg, lid)
                    cur.execute("""
                        INSERT INTO shop.customer_reminders (customer_id, laundry_id, reminder_type)
                        VALUES (%s, %s, 'missed_pickup')
                    """, (cust["customer_id"], lid))
                    total_sent += 1
                except Exception as e:
                    logger.warning(f"Missed pickup SMS failed for {cust['customer_id']}: {e}")

            # Segment 3: Customers who started the order flow 2+ hours ago but have no order since then
            cur.execute("""
                SELECT cr.customer_id, c.first_name, c.phone_number
                FROM shop.customer_reminders cr
                JOIN shop.customers c ON c.customer_id = cr.customer_id
                WHERE cr.laundry_id = %s
                  AND cr.reminder_type = 'cart_started'
                  AND cr.created_at < NOW() - INTERVAL '2 hours'
                  AND cr.created_at > NOW() - INTERVAL '24 hours'
                  AND c.phone_number IS NOT NULL AND c.phone_number != ''
                  AND NOT EXISTS (
                    SELECT 1 FROM orders.orders o
                    WHERE o.customer_id = cr.customer_id AND o.laundry_id = %s
                      AND o.created_at > cr.created_at
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM shop.customer_reminders cr2
                    WHERE cr2.customer_id = cr.customer_id AND cr2.laundry_id = %s
                      AND cr2.reminder_type = 'abandoned_cart_realtime'
                      AND cr2.created_at > NOW() - INTERVAL '24 hours'
                  )
                LIMIT 50
            """, (lid, lid, lid))
            cart_abandoned = cur.fetchall()

            for cust in cart_abandoned:
                msg = f"Hi {cust['first_name'] or 'there'}! Looks like you didn't finish your order. We saved your spot \u2014 complete it now: https://{domain}/{lid}/site \u2014 {name}"
                try:
                    send_sms_for_tenant(cust["phone_number"], msg, lid)
                    cur.execute("""
                        INSERT INTO shop.customer_reminders (customer_id, laundry_id, reminder_type)
                        VALUES (%s, %s, 'abandoned_cart_realtime')
                    """, (cust["customer_id"], lid))
                    # Clean up the cart_started record
                    cur.execute("""
                        DELETE FROM shop.customer_reminders
                        WHERE customer_id = %s AND laundry_id = %s AND reminder_type = 'cart_started'
                    """, (cust["customer_id"], lid))
                    total_sent += 1
                except Exception as e:
                    logger.warning(f"Abandoned cart realtime SMS failed for {cust['customer_id']}: {e}")

    logger.info(f"Abandoned cart processor complete: {total_sent} SMS sent")
    return {"sent": total_sent}
