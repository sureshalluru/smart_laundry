"""Inbound SMS webhook — AI receptionist answers customer texts using tenant data."""
from fastapi import APIRouter, Form
from fastapi.responses import Response
from app.database import get_db, get_cursor
from app.services.chat_ai_service import get_ai_response
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _find_laundry_for_phone(from_phone: str):
    """Find which laundry a customer belongs to based on their phone number."""
    with get_db() as conn:
        cur = get_cursor(conn)
        normalized = from_phone.replace("+1", "").strip()
        cur.execute("""
            SELECT cls.laundry_id, c.customer_id, c.first_name
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls ON cls.customer_id = c.customer_id
            WHERE c.phone_number LIKE %s
            ORDER BY cls.last_completed_at DESC NULLS LAST
            LIMIT 1
        """, (f"%{normalized}%",))
        return cur.fetchone()


@router.post("/inbound")
async def handle_inbound_sms(
    From: str = Form(""),
    Body: str = Form(""),
    To: str = Form(""),
):
    """
    Twilio webhook for inbound SMS. Receives customer text, generates AI response,
    replies via SMS. Falls back to a helpful message if AI is unavailable.

    Configure in Twilio: set your phone number's "A message comes in" webhook to:
    https://yourdomain.com/api/sms/inbound (HTTP POST)
    """
    from_phone = From
    message = Body.strip()

    if not from_phone or not message:
        # Return empty TwiML (don't reply to empty messages)
        return Response(content="<Response></Response>", media_type="application/xml")

    logger.info(f"Inbound SMS from {from_phone}: {message[:50]}")

    # Find which laundry this customer belongs to
    customer_info = _find_laundry_for_phone(from_phone)

    if not customer_info:
        # Unknown number — reply with a generic helpful message
        reply = (
            "Thanks for texting! We couldn't find your account. "
            "Please visit our website to get started or call us directly."
        )
        twiml = f"<Response><Message>{reply}</Message></Response>"
        return Response(content=twiml, media_type="application/xml")

    laundry_id = customer_info["laundry_id"]
    first_name = customer_info.get("first_name") or ""

    # Check if customer is asking for a human
    escalation_words = [
        "agent", "human", "person", "representative",
        "help me", "speak to", "call me",
    ]
    if any(word in message.lower() for word in escalation_words):
        # Get laundry phone for escalation
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                "SELECT contact_phone, laundry_name FROM shop.laundry_shops WHERE laundry_id = %s",
                (laundry_id,),
            )
            shop = cur.fetchone()

        shop_name = shop["laundry_name"] if shop else "our team"
        shop_phone = shop.get("contact_phone") if shop else ""
        reply = f"No problem! A team member from {shop_name} will be in touch shortly."
        if shop_phone:
            reply += f" Or call us directly at {shop_phone}."

        reply_escaped = reply.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        twiml = f"<Response><Message>{reply_escaped}</Message></Response>"
        return Response(content=twiml, media_type="application/xml")

    # Get AI response using tenant-specific data
    try:
        result = get_ai_response(laundry_id, message, [])

        if result.get("no_ai"):
            # AI not available — send helpful fallback
            reply = (
                "Thanks for your message! We'll get back to you shortly. "
                "For immediate help, visit our website or give us a call."
            )
        elif result.get("escalate"):
            reply = result.get("reply") or "Let me connect you with our team. Someone will text you back shortly."
        else:
            reply = result["reply"]
            # Add a helpful prefix for SMS context
            if first_name:
                reply = f"Hi {first_name}! {reply}"
    except Exception as e:
        logger.error(f"AI SMS error for {from_phone}: {e}")
        reply = (
            "Thanks for texting! We're having a technical issue right now. "
            "Please try again shortly or visit our website."
        )

    # Truncate to SMS limit (160 chars per segment, but Twilio handles concatenation up to 1600)
    if len(reply) > 480:
        reply = reply[:477] + "..."

    # Reply via TwiML — escape XML special characters
    reply_escaped = reply.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    twiml = f"<Response><Message>{reply_escaped}</Message></Response>"
    return Response(content=twiml, media_type="application/xml")
