"""
Chat routes — multi-tenant real-time messaging between customers and admin.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ── AI-powered chat (no auth — works for logged-out users) ────────────────────

@router.post("/ai")
async def ai_chat(body: dict = Body(...)):
    """AI-powered chat for tenant customers. No auth required."""
    laundry_id = body.get("laundryId")
    message = body.get("message", "").strip()
    history = body.get("history", [])  # [{role: 'user'|'assistant', content: '...'}]

    if not laundry_id or not message:
        return {"status": "error", "message": "Missing laundryId or message"}

    try:
        from app.services.chat_ai_service import get_ai_response
        result = get_ai_response(laundry_id, message, history)
        return {
            "status": "success",
            "reply": result["reply"],
            "escalate": result["escalate"],
            "noAi": result.get("no_ai", False),
        }
    except Exception as e:
        logger.error(f"AI chat error for laundry {laundry_id}: {e}")
        return {"status": "success", "reply": "", "escalate": True, "noAi": True}


# ── Customer-facing endpoints (no auth for now, uses customer_id) ─────────────

@router.post("/send")
async def customer_send_message(body: dict = Body(...)):
    """Customer sends a message."""
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")
    message = body.get("message", "").strip()
    customer_name = body.get("customerName", "")
    customer_phone = body.get("customerPhone", "")

    if not customer_id or not laundry_id or not message:
        return {"status": "error", "message": "Missing required fields"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Look up customer name/phone from DB if not provided
        if (not customer_name or customer_name == '') and not customer_id.startswith('visitor-'):
            cur.execute("""
                SELECT first_name, last_name, phone_number
                FROM shop.customers WHERE customer_id = %s
            """, (customer_id,))
            cust_row = cur.fetchone()
            if cust_row:
                customer_name = f"{cust_row['first_name']} {cust_row['last_name'] or ''}".strip()
                customer_phone = cust_row['phone_number'] or customer_phone

        if not customer_name:
            customer_name = "Website Visitor"

        # Get or create conversation
        cur.execute("""
            INSERT INTO chat.conversations (laundry_id, customer_id, customer_name, customer_phone, last_message_at, unread_admin)
            VALUES (%s, %s, %s, %s, NOW(), 1)
            ON CONFLICT (laundry_id, customer_id) DO UPDATE SET
                last_message_at = NOW(),
                unread_admin = chat.conversations.unread_admin + 1,
                customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), chat.conversations.customer_name),
                customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), chat.conversations.customer_phone),
                status = 'active',
                updated_at = NOW()
            RETURNING conversation_id
        """, (laundry_id, customer_id, customer_name, customer_phone))
        conversation_id = cur.fetchone()["conversation_id"]

        # Insert message
        cur.execute("""
            INSERT INTO chat.messages (conversation_id, sender_type, sender_id, sender_name, message)
            VALUES (%s, 'customer', %s, %s, %s)
            RETURNING message_id, created_at
        """, (conversation_id, customer_id, customer_name, message))
        msg = cur.fetchone()

        # Send email notification to platform admin if this is a laundry-to-platform chat
        if laundry_id == 'platform' and customer_id.startswith('laundry-'):
            try:
                from app.services.notification_service import send_email
                tenant_laundry_id = customer_id.replace('laundry-', '')
                cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (tenant_laundry_id,))
                shop_row = cur.fetchone()
                laundry_name = shop_row["laundry_name"] if shop_row else f"Laundry {tenant_laundry_id}"

                from datetime import datetime
                timestamp = datetime.now().strftime("%b %d, %Y at %I:%M %p")

                email_html = f"""
                <h2>💬 New Support Message</h2>
                <p>You have a new chat message from a laundry operator:</p>
                <table style="border-collapse:collapse; margin:16px 0; width:100%; max-width:500px;">
                    <tr><td style="padding:8px 12px; font-weight:bold; background:#f7f7f7; border:1px solid #ddd;">From</td>
                        <td style="padding:8px 12px; border:1px solid #ddd;">{customer_name} ({laundry_name})</td></tr>
                    <tr><td style="padding:8px 12px; font-weight:bold; background:#f7f7f7; border:1px solid #ddd;">Time</td>
                        <td style="padding:8px 12px; border:1px solid #ddd;">{timestamp}</td></tr>
                    <tr><td style="padding:8px 12px; font-weight:bold; background:#f7f7f7; border:1px solid #ddd;">Message</td>
                        <td style="padding:8px 12px; border:1px solid #ddd; font-style:italic;">{message}</td></tr>
                </table>
                <p><a href="https://smartlaundrybasket.ai/platform-admin" style="color:#2B6CB0; font-weight:bold;">Open Platform Admin to reply →</a></p>
                <p style="font-size:12px; color:#999;">This is an automated notification from Smart Laundry Basket support chat.</p>
                """
                send_email("roundrocklaundry@gmail.com", f"💬 Chat from {laundry_name}: {message[:50]}", email_html)
                logger.info(f"Platform admin notified about chat from {laundry_name}")
            except Exception as notify_err:
                logger.warning(f"Failed to send chat notification email: {notify_err}")

    return {
        "status": "success",
        "messageId": str(msg["message_id"]),
        "conversationId": str(conversation_id),
        "createdAt": str(msg["created_at"]),
    }


@router.get("/messages")
async def get_messages(
    customerId: str = Query(...),
    laundryId: str = Query(...),
    limit: int = Query(50),
):
    """Get chat messages for a customer."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Find conversation
        cur.execute("""
            SELECT conversation_id FROM chat.conversations
            WHERE laundry_id = %s AND customer_id = %s
        """, (laundryId, customerId))
        conv = cur.fetchone()
        if not conv:
            return {"status": "success", "messages": [], "conversationId": None}

        conversation_id = conv["conversation_id"]

        # Get messages
        cur.execute("""
            SELECT message_id, sender_type, sender_name, message, created_at
            FROM chat.messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
            LIMIT %s
        """, (conversation_id, limit))
        messages = [{
            "messageId": str(r["message_id"]),
            "senderType": r["sender_type"],
            "senderName": r["sender_name"],
            "message": r["message"],
            "createdAt": str(r["created_at"]),
        } for r in cur.fetchall()]

        # Mark as read by customer
        cur.execute("""
            UPDATE chat.conversations SET unread_customer = 0, updated_at = NOW()
            WHERE conversation_id = %s
        """, (conversation_id,))

    return {"status": "success", "messages": messages, "conversationId": str(conversation_id)}


# ── Admin-facing endpoints (requires auth) ────────────────────────────────────

@router.get("/admin/conversations")
async def get_admin_conversations(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get all conversations for a laundry (admin view)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT c.conversation_id, c.customer_id, c.customer_name, c.customer_phone,
                   c.status, c.last_message_at, c.unread_admin, c.created_at,
                   m.message AS last_message
            FROM chat.conversations c
            LEFT JOIN LATERAL (
                SELECT message FROM chat.messages
                WHERE conversation_id = c.conversation_id
                ORDER BY created_at DESC LIMIT 1
            ) m ON TRUE
            WHERE c.laundry_id = %s
            ORDER BY c.last_message_at DESC
        """, (laundryId,))
        conversations = [{
            "conversationId": str(r["conversation_id"]),
            "customerId": r["customer_id"],
            "customerName": r["customer_name"] or "Unknown",
            "customerPhone": r["customer_phone"] or "",
            "status": r["status"],
            "lastMessageAt": str(r["last_message_at"]),
            "unreadCount": r["unread_admin"],
            "lastMessage": r["last_message"] or "",
            "createdAt": str(r["created_at"]),
        } for r in cur.fetchall()]

    return {"status": "success", "conversations": conversations}


@router.get("/admin/messages")
async def get_admin_messages(
    conversationId: str = Query(...),
    laundryId: str = Query(...),
    limit: int = Query(100),
    current_user: dict = Depends(get_current_user),
):
    """Get messages for a conversation (admin view)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT message_id, sender_type, sender_name, message, created_at
            FROM chat.messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
            LIMIT %s
        """, (conversationId, limit))
        messages = [{
            "messageId": str(r["message_id"]),
            "senderType": r["sender_type"],
            "senderName": r["sender_name"],
            "message": r["message"],
            "createdAt": str(r["created_at"]),
        } for r in cur.fetchall()]

        # Mark as read by admin
        cur.execute("""
            UPDATE chat.conversations SET unread_admin = 0, updated_at = NOW()
            WHERE conversation_id = %s
        """, (conversationId,))

    return {"status": "success", "messages": messages}


@router.post("/admin/send")
async def admin_send_message(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin sends a message to a customer."""
    conversation_id = body.get("conversationId")
    message = body.get("message", "").strip()
    sender_name = body.get("senderName", "Admin")

    if not conversation_id or not message:
        return {"status": "error", "message": "Missing required fields"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Insert message
        cur.execute("""
            INSERT INTO chat.messages (conversation_id, sender_type, sender_id, sender_name, message)
            VALUES (%s, 'admin', %s, %s, %s)
            RETURNING message_id, created_at
        """, (conversation_id, current_user.get("sub", "admin"), sender_name, message))
        msg = cur.fetchone()

        # Update conversation
        cur.execute("""
            UPDATE chat.conversations
            SET last_message_at = NOW(), unread_customer = unread_customer + 1, updated_at = NOW()
            WHERE conversation_id = %s
        """, (conversation_id,))

    return {
        "status": "success",
        "messageId": str(msg["message_id"]),
        "createdAt": str(msg["created_at"]),
    }


@router.put("/admin/close")
async def close_conversation(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Close a conversation."""
    conversation_id = body.get("conversationId")
    if not conversation_id:
        return {"status": "error", "message": "Missing conversationId"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE chat.conversations SET status = 'closed', updated_at = NOW()
            WHERE conversation_id = %s
        """, (conversation_id,))

    return {"status": "success", "message": "Conversation closed"}
