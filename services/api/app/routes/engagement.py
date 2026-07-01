"""
Customer Engagement & Retention Engine.
Sends smart reminders to bring customers back based on their lifecycle stage.

Segments:
- ABANDONED: Registered but never placed an order
- DORMANT: Last order 30+ days ago
- WINBACK: Last order 90+ days ago
- HOLIDAY: Special day reminders (Thanksgiving, Christmas, etc.)

Schedule:
- Abandoned: Weekly for 4 weeks, then monthly for 6 months
- Dormant: Monthly for 6 months
- Win-back: Yearly on special days
"""
from fastapi import APIRouter, Depends, Query, Body
from app.database import get_db, get_cursor
from app.auth import get_current_user
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Holiday dates (month, day) — used for special reminders
HOLIDAYS = {
    (11, 27): "Thanksgiving",    # Approximate — 4th Thursday of November
    (11, 28): "Thanksgiving",
    (11, 29): "Thanksgiving",
    (12, 24): "Christmas Eve",
    (12, 25): "Christmas",
    (1, 1): "New Year",
    (7, 4): "Independence Day",
    (5, 12): "Mother's Day",     # Approximate
    (6, 16): "Father's Day",     # Approximate
}


def _get_promo_text(promo_code, laundry_id):
    """Get promo description for message interpolation."""
    if not promo_code:
        # No promo code configured — try to find any active promotion for this laundry
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT promo_code, description, discount_type, discount_value
                FROM shop.promotions WHERE laundry_id = %s AND is_active = TRUE
                ORDER BY created_at DESC LIMIT 1
            """, (laundry_id,))
            row = cur.fetchone()
            if row and row["promo_code"]:
                code = row["promo_code"]
                if row["discount_type"] == "percentage":
                    return f"{int(row['discount_value'])}% off (code: {code})"
                else:
                    return f"${row['discount_value']} off (code: {code})"
        return "a special discount"
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT description, discount_type, discount_value
            FROM shop.promotions WHERE laundry_id = %s AND promo_code = %s AND is_active = TRUE
        """, (laundry_id, promo_code))
        row = cur.fetchone()
        if row:
            if row["discount_type"] == "percentage":
                return f"{int(row['discount_value'])}% off (code: {promo_code})"
            else:
                return f"${row['discount_value']} off (code: {promo_code})"
    return f"code {promo_code}"


def _format_message(template, name, laundry_name, promo_text):
    """Replace placeholders in message template."""
    return (template
            .replace("{name}", name or "there")
            .replace("{laundry}", laundry_name or "us")
            .replace("{promo}", promo_text or "a special offer"))


def _was_reminded_recently(cur, customer_id, laundry_id, reminder_type, days):
    """Check if customer was already sent this type of reminder within X days."""
    cur.execute("""
        SELECT 1 FROM shop.customer_reminders
        WHERE customer_id = %s AND laundry_id = %s AND reminder_type = %s
          AND sent_at > NOW() - INTERVAL '%s days'
        LIMIT 1
    """, (customer_id, laundry_id, reminder_type, days))
    return cur.fetchone() is not None


def _count_reminders_sent(cur, customer_id, laundry_id, reminder_type):
    """Count total reminders of this type sent to customer."""
    cur.execute("""
        SELECT COUNT(*) as cnt FROM shop.customer_reminders
        WHERE customer_id = %s AND laundry_id = %s AND reminder_type = %s
    """, (customer_id, laundry_id, reminder_type))
    return cur.fetchone()["cnt"]


def _send_reminder(cur, customer_id, laundry_id, reminder_type, stage, message, promo_code, phone, email):
    """Send reminder via SMS/email and log it."""
    from app.services.notification_service import send_sms, send_email

    # Get laundry branding for tenant-branded emails
    laundry_name = None
    contact_email = None
    try:
        cur.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        if shop:
            laundry_name = shop.get("laundry_name")
            contact_email = shop.get("contact_email")
    except Exception:
        pass

    sent = False
    if phone:
        sent = send_sms(phone, message)
    if email:
        send_email(email, "We miss you! 🧺", f"<p>{message}</p>",
                   sender_name=laundry_name, reply_to=contact_email)
        sent = True

    # Log the reminder
    cur.execute("""
        INSERT INTO shop.customer_reminders (laundry_id, customer_id, reminder_type, reminder_stage, promo_code, message_channel)
        VALUES (%s, %s::uuid, %s, %s, %s, %s)
    """, (laundry_id, customer_id, reminder_type, stage,
          promo_code, 'sms' if phone else 'email'))

    return sent


@router.post("/process")
async def process_engagement():
    """
    Daily engagement processor. Called by cron job.
    Identifies customers needing reminders and sends appropriate messages.
    """
    today = datetime.now()
    results = {"abandoned": 0, "dormant": 0, "winback": 0, "holiday": 0, "errors": []}

    try:
        # Get all active engagement configs
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("SELECT * FROM shop.engagement_config WHERE is_active = TRUE")
            configs = cur.fetchall()

        if not configs:
            return {"status": "success", "message": "No active engagement configs", "results": results}

        for config in configs:
            laundry_id = config["laundry_id"]
            try:
                _process_laundry_engagement(laundry_id, config, today, results)
            except Exception as e:
                logger.exception(f"Engagement error for laundry {laundry_id}")
                results["errors"].append({"laundryId": laundry_id, "error": str(e)})

    except Exception as e:
        logger.exception("Engagement processor failed")
        return {"status": "error", "message": str(e)}

    total = results["abandoned"] + results["dormant"] + results["winback"] + results["holiday"]
    logger.info(f"Engagement processor complete: {total} reminders sent")
    return {"status": "success", "results": results}


def _process_laundry_engagement(laundry_id, config, today, results):
    """Process engagement for a single laundry."""
    from app.services.notification_service import send_sms, send_email

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get laundry name
        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop_row = cur.fetchone()
        laundry_name = shop_row["laundry_name"] if shop_row else "Your Laundry"

        max_weekly = config["weekly_reminder_weeks"] or 4
        max_monthly = config["monthly_reminder_months"] or 6

        # === 1. ABANDONED: Registered but never ordered ===
        if config["abandoned_enabled"]:
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.phone_number, c.email, c.created_at
                FROM shop.customer_payment_profiles cpp
                JOIN shop.customers c ON c.customer_id = cpp.customer_id
                WHERE cpp.laundry_id = %s
                  AND NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.customer_id = c.customer_id AND o.laundry_id = %s)
                  AND c.created_at < NOW() - INTERVAL '1 day'
                  AND c.created_at > NOW() - INTERVAL '7 months'
            """, (laundry_id, laundry_id))
            abandoned = cur.fetchall()

            promo_text = _get_promo_text(config["abandoned_promo_code"], laundry_id)

            for cust in abandoned:
                days_since_reg = (today - cust["created_at"].replace(tzinfo=None)).days
                total_sent = _count_reminders_sent(cur, cust["customer_id"], laundry_id, "abandoned")

                # Weekly for first N weeks, then monthly
                should_send = False
                if days_since_reg <= (max_weekly * 7):
                    # Weekly phase
                    should_send = not _was_reminded_recently(cur, cust["customer_id"], laundry_id, "abandoned", 6)
                elif days_since_reg <= (max_weekly * 7 + max_monthly * 30):
                    # Monthly phase
                    should_send = not _was_reminded_recently(cur, cust["customer_id"], laundry_id, "abandoned", 28)

                if should_send and total_sent < (max_weekly + max_monthly):
                    stage = "weekly" if days_since_reg <= (max_weekly * 7) else "monthly"
                    msg = _format_message(config["abandoned_message"], cust["first_name"], laundry_name, promo_text)
                    _send_reminder(cur, cust["customer_id"], laundry_id, "abandoned", stage, msg,
                                   config["abandoned_promo_code"], cust["phone_number"], cust.get("email"))
                    results["abandoned"] += 1

        # === 2. DORMANT: Last order 30-90 days ago ===
        if config["dormant_enabled"]:
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.phone_number, c.email,
                       MAX(o.created_at) as last_order_date
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s
                GROUP BY c.customer_id, c.first_name, c.phone_number, c.email
                HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
                   AND MAX(o.created_at) > NOW() - INTERVAL '90 days'
            """, (laundry_id,))
            dormant = cur.fetchall()

            promo_text = _get_promo_text(config["dormant_promo_code"], laundry_id)

            for cust in dormant:
                total_sent = _count_reminders_sent(cur, cust["customer_id"], laundry_id, "dormant")
                if total_sent < max_monthly and not _was_reminded_recently(cur, cust["customer_id"], laundry_id, "dormant", 28):
                    msg = _format_message(config["dormant_message"], cust["first_name"], laundry_name, promo_text)
                    _send_reminder(cur, cust["customer_id"], laundry_id, "dormant", "monthly", msg,
                                   config["dormant_promo_code"], cust["phone_number"], cust.get("email"))
                    results["dormant"] += 1

        # === 3. WINBACK: Last order 90+ days ago ===
        if config["winback_enabled"]:
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.phone_number, c.email,
                       MAX(o.created_at) as last_order_date
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s
                GROUP BY c.customer_id, c.first_name, c.phone_number, c.email
                HAVING MAX(o.created_at) < NOW() - INTERVAL '90 days'
            """, (laundry_id,))
            winback = cur.fetchall()

            promo_text = _get_promo_text(config["winback_promo_code"], laundry_id)

            for cust in winback:
                # Only send every 60 days for win-back
                if not _was_reminded_recently(cur, cust["customer_id"], laundry_id, "winback", 60):
                    msg = _format_message(config["winback_message"], cust["first_name"], laundry_name, promo_text)
                    _send_reminder(cur, cust["customer_id"], laundry_id, "winback", "quarterly", msg,
                                   config["winback_promo_code"], cust["phone_number"], cust.get("email"))
                    results["winback"] += 1

        # === 4. HOLIDAY: Special day reminders ===
        if config["holiday_enabled"]:
            today_key = (today.month, today.day)
            if today_key in HOLIDAYS:
                holiday_name = HOLIDAYS[today_key]
                # Get all customers who have ordered from this laundry
                cur.execute("""
                    SELECT DISTINCT c.customer_id, c.first_name, c.phone_number, c.email
                    FROM orders.orders o
                    JOIN shop.customers c ON c.customer_id = o.customer_id
                    WHERE o.laundry_id = %s
                """, (laundry_id,))
                all_customers = cur.fetchall()

                promo_text = _get_promo_text(config["holiday_promo_code"], laundry_id)

                for cust in all_customers:
                    if not _was_reminded_recently(cur, cust["customer_id"], laundry_id, "holiday", 14):
                        msg = _format_message(config["holiday_message"], cust["first_name"], laundry_name, promo_text)
                        msg = msg.replace("Holidays", holiday_name)
                        _send_reminder(cur, cust["customer_id"], laundry_id, "holiday", holiday_name, msg,
                                       config["holiday_promo_code"], cust["phone_number"], cust.get("email"))
                        results["holiday"] += 1


# === Admin Endpoints ===

@router.get("/config")
async def get_engagement_config(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get engagement config for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT * FROM shop.engagement_config WHERE laundry_id = %s", (laundryId,))
        config = cur.fetchone()
        if not config:
            return {"statusCode": 200, "body": {"status": "success", "config": None}}
        return {"statusCode": 200, "body": {"status": "success", "config": dict(config)}}


@router.put("/config")
async def update_engagement_config(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create or update engagement config for a laundry."""
    laundry_id = body.get("laundryId")
    if not laundry_id:
        return {"statusCode": 400, "body": {"status": "error", "message": "Missing laundryId"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO shop.engagement_config (laundry_id, is_active,
                abandoned_enabled, abandoned_promo_code, abandoned_message,
                dormant_enabled, dormant_promo_code, dormant_message,
                winback_enabled, winback_promo_code, winback_message,
                holiday_enabled, holiday_promo_code, holiday_message,
                weekly_reminder_weeks, monthly_reminder_months, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (laundry_id) DO UPDATE SET
                is_active = EXCLUDED.is_active,
                abandoned_enabled = EXCLUDED.abandoned_enabled,
                abandoned_promo_code = EXCLUDED.abandoned_promo_code,
                abandoned_message = EXCLUDED.abandoned_message,
                dormant_enabled = EXCLUDED.dormant_enabled,
                dormant_promo_code = EXCLUDED.dormant_promo_code,
                dormant_message = EXCLUDED.dormant_message,
                winback_enabled = EXCLUDED.winback_enabled,
                winback_promo_code = EXCLUDED.winback_promo_code,
                winback_message = EXCLUDED.winback_message,
                holiday_enabled = EXCLUDED.holiday_enabled,
                holiday_promo_code = EXCLUDED.holiday_promo_code,
                holiday_message = EXCLUDED.holiday_message,
                weekly_reminder_weeks = EXCLUDED.weekly_reminder_weeks,
                monthly_reminder_months = EXCLUDED.monthly_reminder_months,
                updated_at = NOW()
        """, (
            laundry_id,
            body.get("isActive", True),
            body.get("abandonedEnabled", True),
            body.get("abandonedPromoCode", ""),
            body.get("abandonedMessage", ""),
            body.get("dormantEnabled", True),
            body.get("dormantPromoCode", ""),
            body.get("dormantMessage", ""),
            body.get("winbackEnabled", True),
            body.get("winbackPromoCode", ""),
            body.get("winbackMessage", ""),
            body.get("holidayEnabled", True),
            body.get("holidayPromoCode", ""),
            body.get("holidayMessage", ""),
            body.get("weeklyReminderWeeks", 4),
            body.get("monthlyReminderMonths", 6),
        ))

    return {"statusCode": 200, "body": {"status": "success", "message": "Engagement config saved"}}


@router.get("/stats")
async def get_engagement_stats(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get engagement statistics — how many customers in each segment."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Abandoned: registered, never ordered for this laundry
        # We identify customers through customer_payment_profiles (they registered with this laundry)
        cur.execute("""
            SELECT COUNT(*) as cnt FROM shop.customer_payment_profiles cpp
            JOIN shop.customers c ON c.customer_id = cpp.customer_id
            WHERE cpp.laundry_id = %s
              AND NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.customer_id = cpp.customer_id AND o.laundry_id = %s)
              AND c.created_at > NOW() - INTERVAL '7 months'
        """, (laundryId, laundryId))
        abandoned = cur.fetchone()["cnt"]

        # Dormant: 30-90 days inactive
        cur.execute("""
            SELECT COUNT(*) as cnt FROM (
                SELECT o.customer_id
                FROM orders.orders o
                WHERE o.laundry_id = %s
                GROUP BY o.customer_id
                HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
                   AND MAX(o.created_at) > NOW() - INTERVAL '90 days'
            ) sub
        """, (laundryId,))
        dormant = cur.fetchone()["cnt"]

        # Win-back: 90+ days inactive
        cur.execute("""
            SELECT COUNT(*) as cnt FROM (
                SELECT o.customer_id
                FROM orders.orders o
                WHERE o.laundry_id = %s
                GROUP BY o.customer_id
                HAVING MAX(o.created_at) < NOW() - INTERVAL '90 days'
            ) sub
        """, (laundryId,))
        winback = cur.fetchone()["cnt"]

        # Active: ordered in last 30 days
        cur.execute("""
            SELECT COUNT(DISTINCT customer_id) as cnt FROM orders.orders
            WHERE laundry_id = %s AND created_at > NOW() - INTERVAL '30 days'
        """, (laundryId,))
        active = cur.fetchone()["cnt"]

        # Reminders sent this month
        cur.execute("""
            SELECT reminder_type, COUNT(*) as cnt FROM shop.customer_reminders
            WHERE laundry_id = %s AND sent_at > DATE_TRUNC('month', NOW())
            GROUP BY reminder_type
        """, (laundryId,))
        sent_this_month = {r["reminder_type"]: r["cnt"] for r in cur.fetchall()}

    return {
        "statusCode": 200,
        "body": {
            "status": "success",
            "stats": {
                "active": active,
                "abandoned": abandoned,
                "dormant": dormant,
                "winback": winback,
                "sentThisMonth": sent_this_month,
            }
        }
    }


@router.get("/customers")
async def get_engagement_customers(
    laundryId: str = Query(...),
    bucket: str = Query(...),  # 'abandoned', 'dormant', 'winback', 'active'
    current_user: dict = Depends(get_current_user),
):
    """
    Get customers in a specific engagement bucket with notification history.
    Returns: name, phone, last order date, last notification sent, total notifications sent.
    """
    if bucket not in ("abandoned", "dormant", "winback", "active"):
        return {"statusCode": 400, "body": {"status": "error", "message": "Invalid bucket"}}

    with get_db() as conn:
        cur = get_cursor(conn)

        if bucket == "abandoned":
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.last_name, c.phone_number, c.email, c.created_at,
                       (SELECT MAX(cr.sent_at) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'abandoned') as last_notified,
                       (SELECT COUNT(*) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'abandoned') as times_notified
                FROM shop.customer_payment_profiles cpp
                JOIN shop.customers c ON c.customer_id = cpp.customer_id
                WHERE cpp.laundry_id = %s
                  AND NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.customer_id = c.customer_id AND o.laundry_id = %s)
                  AND c.created_at > NOW() - INTERVAL '7 months'
                ORDER BY c.created_at DESC
                LIMIT 100
            """, (laundryId, laundryId, laundryId, laundryId))

        elif bucket == "dormant":
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.last_name, c.phone_number, c.email,
                       MAX(o.created_at) as last_order_date,
                       (SELECT MAX(cr.sent_at) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'dormant') as last_notified,
                       (SELECT COUNT(*) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'dormant') as times_notified
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s
                GROUP BY c.customer_id, c.first_name, c.last_name, c.phone_number, c.email
                HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
                   AND MAX(o.created_at) > NOW() - INTERVAL '90 days'
                ORDER BY MAX(o.created_at) DESC
                LIMIT 100
            """, (laundryId, laundryId, laundryId))

        elif bucket == "winback":
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.last_name, c.phone_number, c.email,
                       MAX(o.created_at) as last_order_date,
                       (SELECT MAX(cr.sent_at) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'winback') as last_notified,
                       (SELECT COUNT(*) FROM shop.customer_reminders cr
                        WHERE cr.customer_id::text = c.customer_id AND cr.laundry_id = %s AND cr.reminder_type = 'winback') as times_notified
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s
                GROUP BY c.customer_id, c.first_name, c.last_name, c.phone_number, c.email
                HAVING MAX(o.created_at) < NOW() - INTERVAL '90 days'
                ORDER BY MAX(o.created_at) DESC
                LIMIT 100
            """, (laundryId, laundryId, laundryId))

        elif bucket == "active":
            cur.execute("""
                SELECT c.customer_id, c.first_name, c.last_name, c.phone_number, c.email,
                       MAX(o.created_at) as last_order_date,
                       COUNT(o.order_id) as total_orders
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s AND o.created_at > NOW() - INTERVAL '30 days'
                GROUP BY c.customer_id, c.first_name, c.last_name, c.phone_number, c.email
                ORDER BY MAX(o.created_at) DESC
                LIMIT 100
            """, (laundryId,))

        rows = cur.fetchall()

    customers = []
    for r in rows:
        cust = {
            "customerId": r["customer_id"],
            "name": f"{r.get('first_name', '') or ''} {r.get('last_name', '') or ''}".strip() or "Unknown",
            "phone": r.get("phone_number", ""),
            "email": r.get("email", ""),
        }
        if "last_order_date" in r and r["last_order_date"]:
            cust["lastOrderDate"] = r["last_order_date"].strftime("%Y-%m-%d")
        elif "created_at" in r and r["created_at"]:
            cust["registeredDate"] = r["created_at"].strftime("%Y-%m-%d")
        if "last_notified" in r and r["last_notified"]:
            cust["lastNotified"] = r["last_notified"].strftime("%Y-%m-%d %H:%M")
        if "times_notified" in r:
            cust["timesNotified"] = r["times_notified"]
        if "total_orders" in r:
            cust["totalOrders"] = r["total_orders"]
        customers.append(cust)

    return {"statusCode": 200, "body": {"status": "success", "customers": customers}}


@router.post("/notify")
async def notify_customer(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Manually send a reminder to a specific customer.
    Uses the configured message template for the given bucket.
    """
    laundry_id = body.get("laundryId")
    customer_id = body.get("customerId")
    bucket = body.get("bucket")  # 'abandoned', 'dormant', 'winback'

    if not all([laundry_id, customer_id, bucket]):
        return {"statusCode": 400, "body": {"status": "error", "message": "Missing laundryId, customerId, or bucket"}}

    if bucket not in ("abandoned", "dormant", "winback", "active"):
        return {"statusCode": 400, "body": {"status": "error", "message": "Invalid bucket for notification"}}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get engagement config
        cur.execute("SELECT * FROM shop.engagement_config WHERE laundry_id = %s", (laundry_id,))
        config = cur.fetchone()
        if not config:
            return {"statusCode": 400, "body": {"status": "error", "message": "Engagement not configured for this laundry"}}

        # Get customer info
        cur.execute("SELECT first_name, phone_number, email FROM shop.customers WHERE customer_id = %s", (customer_id,))
        cust = cur.fetchone()
        if not cust:
            return {"statusCode": 404, "body": {"status": "error", "message": "Customer not found"}}

        # Get laundry name
        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        laundry_name = shop["laundry_name"] if shop else "Your Laundry"

        # Get the message template and promo for this bucket
        message_key = f"{bucket}_message"
        promo_key = f"{bucket}_promo_code"
        template = config.get(message_key, "Hi {name}, we'd love to see you again at {laundry}!")
        promo_code = config.get(promo_key, "")

        promo_text = _get_promo_text(promo_code, laundry_id)
        message = _format_message(template, cust["first_name"], laundry_name, promo_text)

        # Send the notification
        sent = _send_reminder(cur, customer_id, laundry_id, bucket, "manual", message,
                              promo_code, cust["phone_number"], cust.get("email"))

    if sent:
        return {"statusCode": 200, "body": {"status": "success", "message": "Reminder sent successfully"}}
    else:
        # Check if it's a config issue vs no contact info
        if not cust.get("phone_number") and not cust.get("email"):
            return {"statusCode": 200, "body": {"status": "error", "message": "No phone or email on file for this customer"}}
        return {"statusCode": 200, "body": {"status": "error", "message": "SMS/Email service not configured. Check Twilio settings."}}
