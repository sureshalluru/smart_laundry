"""
Payment operation routes — handles in-store payment capture.
Endpoint: PUT /api/payment/instore-payment
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.put("/instore-payment")
async def instore_payment(
    operation: str = Query(...),
    orderId: str = Query(...),
    laundryId: str = Query(...),
    empId: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Capture in-store payment — ported from instore_payments.py Lambda."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Get current order
            cur.execute("""
                SELECT o.*, ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
                FROM orders.orders o
                LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                WHERE o.order_id = %s
            """, (orderId,))
            order = cur.fetchone()
            if not order:
                return {"statusCode": 200, "body": {"status": "error", "message": f"Order {orderId} not found"}}

            # Extract payment data from body
            tip_payload = body.get("tip_payload", {})
            payment_updates = body.get("payment_updates", [])
            is_cash_refunded = body.get("is_cash_refunded", False)

            # Get existing payments
            cur.execute("SELECT * FROM orders.order_payments WHERE order_id = %s", (orderId,))
            existing_payments = [dict(r) for r in cur.fetchall()]

            # Calculate totals
            sub_total = float(order["sub_total"] or 0)
            total_cost = float(order["total_cost"] or 0)

            # Tip
            tip_type = tip_payload.get("tipType", "noTip")
            tip_amount = float(tip_payload.get("tipAmount", 0) or 0)
            if tip_type == "percentage":
                pct = float(tip_payload.get("tipPercentage", 0) or 0)
                tip_amount = round(sub_total * (pct / 100), 2)

            grand_total = round(total_cost + tip_amount, 2)

            # Update tip
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (order_id) DO UPDATE SET
                    tip_amount = EXCLUDED.tip_amount, tip_percentage = EXCLUDED.tip_percentage,
                    tip_type = EXCLUDED.tip_type, tip_method = EXCLUDED.tip_method,
                    tip_receiver_id = EXCLUDED.tip_receiver_id
            """, (orderId, tip_amount, tip_payload.get("tipPercentage"),
                  tip_type, tip_payload.get("tipMethod"), empId))

            # Process payment updates (new payments to add)
            for p in payment_updates:
                amt = float(p.get("amount", 0))
                method = p.get("paymentMethod") or "Cash"
                intent_id = p.get("paymentIntentId")
                if amt > 0:
                    # For card payments where frontend sent a PaymentMethod ID (pm_*),
                    # we need to create and confirm a PaymentIntent server-side.
                    if method == "Card" and intent_id and str(intent_id).startswith("pm_"):
                        try:
                            from app.services.payment_service import _init_stripe
                            import stripe as stripe_lib
                            _init_stripe(laundryId)
                            amount_cents = int(round(Decimal(str(amt)) * 100))
                            payment_intent = stripe_lib.PaymentIntent.create(
                                amount=amount_cents,
                                currency='usd',
                                payment_method=intent_id,
                                description=f"In-store card payment for order {orderId}",
                                confirm=True,
                                automatic_payment_methods={
                                    "enabled": True,
                                    "allow_redirects": "never",
                                },
                            )
                            intent_id = payment_intent.id
                            logger.info(f"Card payment charged for order {orderId}: {intent_id}, amount: ${amt}")
                        except Exception as card_err:
                            logger.exception(f"Card payment failed for order {orderId}")
                            return {"statusCode": 200, "body": {"status": "error", "message": f"Card payment failed: {str(card_err)}"}}

                    cur.execute("""
                        INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                        VALUES (%s, %s, %s, %s)
                    """, (orderId, intent_id, amt, method))

            # Update order status
            new_status = "EnRouteToDelivery" if order["order_type"] != "Commercial" else order["order_status"]
            cur.execute("""
                UPDATE orders.orders
                SET payment_status = 'Paid', order_status = %s, grand_total = %s,
                    sub_total = %s, last_updated_by = %s, updated_at = NOW()
                WHERE order_id = %s
            """, (new_status, grand_total, sub_total, empId, orderId))

            # Fetch updated order to return
            from app.routes.orders_info import get_single_order
            result = get_single_order(cur, laundryId, orderId)
            updated_order = result.get("body", {})

            return {"statusCode": 200, "body": {
                "status": "success",
                "message": f"Payment processed for order {orderId}",
                "updatedOrder": updated_order,
            }}

    except Exception as e:
        logger.exception("instore_payment error")
        return {"statusCode": 200, "body": {"status": "error", "message": str(e)}}


@router.post("/save-card")
async def save_card(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Save card details — delegates to payment service."""
    from app.services.payment_service import save_card_details
    # Frontend sends Lambda-style event format with queryStringParameters
    params = body.get("queryStringParameters", body)
    logger.info("save-card params: %s", params)
    
    laundry_id = params.get("laundryId") or current_user.get("laundryId")
    customer_id = params.get("customerId") or current_user.get("sub")
    payment_method_id = (params.get("customerPaymentMethod") or params.get("paymentMethodId") 
                         or params.get("cardPaymentMethodId"))
    customer_payment_id = params.get("customerPaymentId")
    
    if not laundry_id:
        return {"status": "error", "message": "Missing laundryId"}
    if not payment_method_id:
        return {"status": "error", "message": "Missing payment method ID"}
    return save_card_details(
        customer_id=customer_id,
        customer_payment_id=customer_payment_id,
        payment_method_id=payment_method_id,
        laundry_id=laundry_id,
    )


@router.get("/cards")
@router.get("/get-card-details")
async def get_cards(
    operation: Optional[str] = Query(None),
    customerId: Optional[str] = Query(None),
    customerPaymentId: Optional[str] = Query(None),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get saved cards."""
    from app.services.payment_service import get_card_details
    if customerPaymentId:
        return get_card_details(customerPaymentId, laundryId)
    return {"status": "success", "paymentMethods": []}


@router.delete("/card")
@router.delete("/delete-card")
async def delete_card(
    operation: Optional[str] = Query(None),
    paymentMethodId: Optional[str] = Query(None),
    customerPaymentMethod: Optional[str] = Query(None),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Delete a saved card."""
    from app.services.payment_service import delete_card_details
    pm_id = paymentMethodId or customerPaymentMethod
    if not pm_id:
        return {"status": "error", "message": "Missing payment method ID"}
    return delete_card_details(pm_id, laundryId)
