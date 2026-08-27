"""
Notification service — sends emails via Brevo (formerly Sendinblue) and SMS via Twilio.
No AWS dependency.

Quiet hours: Messages are not sent between 9 PM and 7 AM in the laundry's
timezone.  Instead they are queued in shop.notification_queue and flushed at
7 AM by the scheduler.
"""
import logging
from datetime import datetime, timedelta

import httpx
from pytz import timezone as pytz_timezone

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEZONE = "America/Chicago"

# Quiet hours boundaries (inclusive of start, exclusive of end)
QUIET_START_HOUR = 21  # 9 PM
QUIET_END_HOUR = 7     # 7 AM


def is_quiet_hours(timezone_str: str = DEFAULT_TIMEZONE) -> bool:
    """Return True if the current local time is during quiet hours (9 PM – 7 AM)."""
    try:
        tz = pytz_timezone(timezone_str)
    except Exception:
        tz = pytz_timezone(DEFAULT_TIMEZONE)
    now = datetime.now(tz)
    return now.hour >= QUIET_START_HOUR or now.hour < QUIET_END_HOUR


def _next_delivery_time(timezone_str: str = DEFAULT_TIMEZONE) -> datetime:
    """Compute the next 7 AM delivery timestamp in the given timezone (UTC result)."""
    try:
        tz = pytz_timezone(timezone_str)
    except Exception:
        tz = pytz_timezone(DEFAULT_TIMEZONE)
    now = datetime.now(tz)
    # If it's before 7 AM today, deliver at 7 AM today; otherwise next day 7 AM
    if now.hour < QUIET_END_HOUR:
        delivery = now.replace(hour=QUIET_END_HOUR, minute=0, second=0, microsecond=0)
    else:
        delivery = (now + timedelta(days=1)).replace(hour=QUIET_END_HOUR, minute=0, second=0, microsecond=0)
    return delivery


def _get_laundry_timezone(laundry_id: str) -> str:
    """Look up the laundry's timezone from shop.laundry_shops. Falls back to default."""
    if not laundry_id:
        return DEFAULT_TIMEZONE
    try:
        from app.database import get_db, get_cursor
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                "SELECT laundry_timezone FROM shop.laundry_shops WHERE laundry_id = %s",
                (laundry_id,),
            )
            row = cur.fetchone()
            if row and row.get("laundry_timezone"):
                return row["laundry_timezone"]
    except Exception as e:
        logger.warning(f"Could not fetch timezone for laundry {laundry_id}: {e}")
    return DEFAULT_TIMEZONE


def queue_notification(laundry_id: str, recipient: str, channel: str, body: str,
                       subject: str = None, timezone_str: str = DEFAULT_TIMEZONE):
    """Insert a message into the notification queue for later delivery."""
    scheduled_for = _next_delivery_time(timezone_str)
    try:
        from app.database import get_db, get_cursor
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                INSERT INTO shop.notification_queue
                    (laundry_id, recipient, channel, subject, body, status, scheduled_for)
                VALUES (%s, %s, %s, %s, %s, 'pending', %s)
            """, (laundry_id, recipient, channel, subject, body, scheduled_for))
        logger.info(f"Notification queued ({channel}) for {recipient}, scheduled_for={scheduled_for}")
    except Exception as e:
        logger.exception(f"Failed to queue notification for {recipient}: {e}")


def send_email(to_email: str, subject: str, html_body: str, sender: str = None,
               sender_name: str = None, reply_to: str = None, laundry_id: str = None):
    """Send HTML email via Brevo API.
    
    For multi-tenant branding:
    - sender_name: Display name (e.g., "Spin & Shine Laundromat")
    - reply_to: Tenant's actual email for customer replies (e.g., "spinandshine@gmail.com")
    - sender: Override the from email (defaults to platform notifications address)
    - laundry_id: If provided, quiet hours are enforced using the laundry's timezone.
                  If None, email is sent immediately (system/platform email).
    """
    # Quiet hours check — only when tied to a specific laundry
    if laundry_id:
        tz_str = _get_laundry_timezone(laundry_id)
        if is_quiet_hours(tz_str):
            queue_notification(laundry_id, to_email, "email", html_body,
                               subject=subject, timezone_str=tz_str)
            logger.info("Email queued for morning delivery (quiet hours) to %s", to_email)
            return True

    api_key = settings.brevo_api_key
    from_email = sender or settings.source_email

    if not api_key or not from_email:
        logger.warning("Email not configured (missing BREVO_API_KEY or SOURCE_EMAIL). Skipping.")
        return False

    try:
        # Build sender with display name for tenant branding
        sender_payload = {"email": from_email}
        if sender_name:
            sender_payload["name"] = sender_name

        email_payload = {
            "sender": sender_payload,
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html_body,
        }

        # Set Reply-To so customer replies go to the tenant's email
        if reply_to:
            email_payload["replyTo"] = {"email": reply_to}
            if sender_name:
                email_payload["replyTo"]["name"] = sender_name

        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json=email_payload,
            timeout=10,
        )
        if response.status_code in (200, 201):
            logger.info("Email sent to %s via Brevo (from: %s)", to_email, sender_name or from_email)
            return True
        else:
            logger.error("Brevo email failed: %s %s", response.status_code, response.text)
            return False
    except Exception as e:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_sms(to_phone: str, message: str):
    """Send SMS via Twilio. Used for system/auth messages (always sent)."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        logger.warning("Twilio not configured. Skipping SMS.")
        return False

    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=message,
            from_=settings.twilio_phone_number,
            to=to_phone,
        )
        logger.info("SMS sent to %s", to_phone)
        return True
    except Exception as e:
        error_str = str(e).lower()
        # Twilio returns 400 "unsubscribed recipient" when customer texted STOP.
        # This is normal opt-out behavior — log quietly and skip, don't crash.
        if "unsubscribed" in error_str or "21610" in str(e):
            logger.info(f"SMS skipped (recipient opted out): {to_phone}")
            return False
        logger.exception("Failed to send SMS to %s", to_phone)
        return False


def send_sms_for_tenant(to_phone: str, message: str, laundry_id: str):
    """
    Send SMS only if tenant has opted into SMS notifications.
    Checks shop.laundry_shops.sms_enabled flag.
    Falls back to NOT sending if flag is missing or False.
    Tracks SMS count for billing.
    Respects quiet hours (9 PM – 7 AM in the laundry's timezone).
    """
    try:
        from app.database import get_db, get_cursor
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("SELECT sms_enabled, laundry_timezone FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            row = cur.fetchone()
            if not row or not row.get("sms_enabled"):
                logger.info(f"SMS disabled for tenant {laundry_id}. Skipping SMS to {to_phone}.")
                return False
            tz_str = row.get("laundry_timezone") or DEFAULT_TIMEZONE
    except Exception as e:
        # If column doesn't exist yet (migration not run), skip SMS
        logger.warning(f"SMS check failed for tenant {laundry_id}: {e}. Skipping SMS.")
        return False

    # Quiet hours check
    if is_quiet_hours(tz_str):
        queue_notification(laundry_id, to_phone, "sms", message, timezone_str=tz_str)
        logger.info(f"SMS queued for morning delivery (quiet hours) to {to_phone}")
        return True

    # Tenant has SMS enabled — send it
    result = send_sms(to_phone, message)

    # Track SMS usage for billing + record outbound context for reply routing
    if result:
        try:
            from app.routes.sms_webhook import record_outbound_sms
            record_outbound_sms(to_phone, laundry_id)
        except Exception:
            pass  # Non-critical — don't break SMS flow if tracking fails
        try:
            from app.database import get_db, get_cursor
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    UPDATE shop.laundry_shops
                    SET sms_count = COALESCE(sms_count, 0) + 1
                    WHERE laundry_id = %s
                """, (laundry_id,))
        except Exception:
            pass

    return result


def send_notification(notification_preference: dict, email_body: str, sms_body: str,
                      customer_email: str, customer_phone: str, shop_email: str = None,
                      sender_name: str = None, laundry_id: str = None):
    """Send notification based on customer preferences. SMS requires tenant opt-in."""
    if notification_preference.get('email', False) and customer_email:
        send_email(customer_email, "Your Laundry Order Update", email_body,
                   sender_name=sender_name, reply_to=shop_email)
    if notification_preference.get('phone', False) and customer_phone:
        if laundry_id:
            send_sms_for_tenant(customer_phone, sms_body, laundry_id)
        else:
            send_sms(customer_phone, sms_body)
