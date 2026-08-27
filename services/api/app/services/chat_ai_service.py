"""
Chat AI service — uses Claude to answer customer questions with tenant-specific data.
Escalates to human admin chat when customer requests a real person.
"""
import logging
from typing import Optional

import anthropic
from app.config import settings
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def _get_tenant_context(laundry_id: str) -> dict:
    """
    Load tenant data (shop info + all active services with prices)
    for building the AI system prompt.

    Returns:
        Dict with keys: tenant_data (from faq_token_resolver), services (list of dicts)
    """
    from app.services.faq_token_resolver import get_tenant_data

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get shop info via existing token resolver
        tenant_data = get_tenant_data(laundry_id, conn)

        # Get all active services with prices
        cur.execute("""
            SELECT service_name, price, input_weight
            FROM shop.laundry_services
            WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY service_name
        """, (laundry_id,))
        services = cur.fetchall()

    return {"tenant_data": tenant_data, "services": services}


def _format_services(services: list) -> str:
    """Format services list into readable text for the system prompt."""
    if not services:
        return "No services currently listed."

    lines = []
    for svc in services:
        name = svc.get("service_name", "Unknown")
        price = svc.get("price")
        input_weight = svc.get("input_weight")

        if price is not None:
            price_str = f"${float(price):.2f}"
            if input_weight and input_weight.lower() in ("per_pound", "per pound", "lb"):
                price_str += "/lb"
            elif input_weight and input_weight.lower() in ("per_piece", "per piece", "piece"):
                price_str += "/piece"
            lines.append(f"- {name}: {price_str}")
        else:
            lines.append(f"- {name}: Contact us for pricing")

    return "\n".join(lines)


def _build_system_prompt(tenant_data: dict, services: list) -> str:
    """Build the Claude system prompt with tenant-specific information."""
    shop_name = tenant_data.get("shop_name", "our laundry service")
    address = tenant_data.get("address", "Contact us for our location")
    phone = tenant_data.get("phone", "Contact us for our phone number")
    hours = tenant_data.get("hours", "Contact us for our current hours")
    delivery_areas = tenant_data.get("delivery_areas", "Contact us for delivery area info")

    services_text = _format_services(services)

    return f"""You are a helpful assistant for {shop_name}, a laundry service business.
Answer customer questions using ONLY the information below. Be concise and friendly.
If you don't know the answer, say so honestly and suggest they contact the business.

Business Information:
- Name: {shop_name}
- Address: {address}
- Phone: {phone}
- Hours: {hours}
- Delivery Areas: {delivery_areas}

Services & Pricing:
{services_text}

Important rules:
1. Only answer questions related to this laundry business. For unrelated questions, politely redirect.
2. If the customer asks to speak to a human, agent, representative, or real person, respond with exactly: [ESCALATE]
3. Keep answers brief — 2-3 sentences max unless more detail is needed.
4. Never make up information that isn't provided above."""


def get_ai_response(
    laundry_id: str,
    message: str,
    conversation_history: Optional[list] = None,
) -> dict:
    """
    Get an AI response for a customer message using tenant-specific data.

    Args:
        laundry_id: The tenant's laundry_id
        message: The customer's message
        conversation_history: Optional list of prior messages [{role, content}, ...]

    Returns:
        {"reply": str, "escalate": bool}
    """
    if not settings.anthropic_api_key:
        logger.warning(f"AI chat called but ANTHROPIC_API_KEY not configured")
        return {
            "reply": "",
            "escalate": True,
            "no_ai": True,
        }

    # Load tenant context
    context = _get_tenant_context(laundry_id)
    system_prompt = _build_system_prompt(context["tenant_data"], context["services"])

    # Build messages array for Claude
    messages = []
    if conversation_history:
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # Add the current user message
    messages.append({"role": "user", "content": message})

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=300,
            system=system_prompt,
            messages=messages,
        )

        reply = response.content[0].text.strip()

        # Check for escalation signal
        escalate = "[ESCALATE]" in reply
        if escalate:
            # Clean the escalation marker from the reply
            reply = reply.replace("[ESCALATE]", "").strip()
            if not reply:
                reply = "Let me connect you with a team member who can help you directly."

        logger.info(f"AI chat response for laundry {laundry_id}: escalate={escalate}, len={len(reply)}")
        return {"reply": reply, "escalate": escalate}

    except anthropic.APIConnectionError as e:
        logger.error(f"AI chat connection error for laundry {laundry_id}: {e}")
        return {
            "reply": "I'm having trouble connecting right now. Please try again in a moment.",
            "escalate": False,
        }
    except anthropic.RateLimitError as e:
        logger.error(f"AI chat rate limit for laundry {laundry_id}: {e}")
        return {
            "reply": "We're experiencing high demand. Please try again in a moment.",
            "escalate": False,
        }
    except anthropic.APIStatusError as e:
        logger.error(f"AI chat API error for laundry {laundry_id}: {e}")
        return {
            "reply": "I'm having trouble right now. Please try again or contact us directly.",
            "escalate": False,
        }
    except Exception as e:
        logger.error(f"AI chat unexpected error for laundry {laundry_id}: {type(e).__name__}: {e}")
        return {
            "reply": "",
            "escalate": True,
            "no_ai": True,
            "debug": f"{type(e).__name__}: {e}",
        }
