"""
Notification service — sends emails via Brevo (formerly Sendinblue) and SMS via Twilio.
No AWS dependency.
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str, sender: str = None):
    """Send HTML email via Brevo API."""
    api_key = settings.brevo_api_key
    from_email = sender or settings.source_email

    if not api_key or not from_email:
        logger.warning("Email not configured (missing BREVO_API_KEY or SOURCE_EMAIL). Skipping.")
        return False

    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "sender": {"email": from_email},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_body,
            },
            timeout=10,
        )
        if response.status_code in (200, 201):
            logger.info("Email sent to %s via Brevo", to_email)
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
                      customer_email: str, customer_phone: str, shop_email: str = None):
    """Send notification based on customer preferences."""
    if notification_preference.get('email', False) and customer_email:
        send_email(customer_email, "Your Laundry Order Update", email_body, sender=shop_email)
    if notification_preference.get('phone', False) and customer_phone:
        send_sms(customer_phone, sms_body)
