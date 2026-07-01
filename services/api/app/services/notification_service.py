"""
Notification service — sends emails via Brevo (formerly Sendinblue) and SMS via Twilio.
No AWS dependency.
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str, sender: str = None,
               sender_name: str = None, reply_to: str = None):
    """Send HTML email via Brevo API.
    
    For multi-tenant branding:
    - sender_name: Display name (e.g., "Spin & Shine Laundromat")
    - reply_to: Tenant's actual email for customer replies (e.g., "spinandshine@gmail.com")
    - sender: Override the from email (defaults to platform notifications address)
    """
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
    """Send SMS via Twilio."""
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
        logger.exception("Failed to send SMS to %s", to_phone)
        return False


def send_notification(notification_preference: dict, email_body: str, sms_body: str,
                      customer_email: str, customer_phone: str, shop_email: str = None,
                      sender_name: str = None):
    """Send notification based on customer preferences."""
    if notification_preference.get('email', False) and customer_email:
        send_email(customer_email, "Your Laundry Order Update", email_body,
                   sender_name=sender_name, reply_to=shop_email)
    if notification_preference.get('phone', False) and customer_phone:
        send_sms(customer_phone, sms_body)
