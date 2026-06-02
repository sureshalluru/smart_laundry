"""
Notification routes — replaces customerNotificationService Lambda.
Also exposes internal functions for other services to call directly.
"""
from fastapi import APIRouter, Body
from app.services.notification_service import send_email, send_sms
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/email")
async def email_endpoint(body: dict = Body(...)):
    """Send an HTML email via AWS SES."""
    to_email = body.get("recipient") or body.get("toEmail")
    subject = body.get("subject", "Notification")
    html_body = body.get("message") or body.get("htmlBody", "")
    sender = body.get("sender")

    if not to_email:
        return {"status": "error", "message": "Missing recipient email"}

    success = send_email(to_email, subject, html_body, sender)
    return {"status": "success" if success else "error"}


@router.post("/sms")
async def sms_endpoint(body: dict = Body(...)):
    """Send SMS via Twilio."""
    to_phone = body.get("recipient") or body.get("toPhone")
    message = body.get("message", "")

    if not to_phone or not message:
        return {"status": "error", "message": "Missing recipient or message"}

    success = send_sms(to_phone, message)
    return {"status": "success" if success else "error"}


@router.post("/send")
async def send_notification_endpoint(body: dict = Body(...)):
    """Send notification based on type (email or sms)."""
    notif_type = body.get("type")
    if notif_type == "email":
        return await email_endpoint(body)
    elif notif_type == "sms":
        return await sms_endpoint(body)
    return {"status": "error", "message": f"Unknown notification type: {notif_type}"}
