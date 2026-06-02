"""
Notification service — replaces customerNotificationService Lambda.
Sends emails via SES and SMS via Twilio.
Instead of invoking a Lambda, other services call these functions directly.
"""
import logging
import boto3
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str, sender: str = None):
    """Send HTML email via AWS SES."""
    try:
        ses = boto3.client("ses", region_name=settings.aws_region)
        ses.send_email(
            Source=sender or settings.source_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Html": {"Data": html_body}},
            },
        )
        logger.info("Email sent to %s", to_email)
        return True
    except Exception as e:
        logger.exception("Failed to send email to %s", to_email)
        return False


def send_sms(to_phone: str, message: str):
    """Send SMS via Twilio."""
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
    """
    Send notification based on customer preferences.
    Replaces invoke_notification_lambda from the Lambda code.
    """
    if notification_preference.get('email', False) and customer_email:
        send_email(customer_email, "Your Laundry Order Update", email_body, sender=shop_email)
    if notification_preference.get('phone', False) and customer_phone:
        send_sms(customer_phone, sms_body)
