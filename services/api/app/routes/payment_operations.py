"""
Payment operation routes — handles in-store payment capture.
Endpoint: PUT /api/payment/instore-payment
"""
from fastapi import APIRouter, Depends, Query, Body, Request
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize
from app.utils.invoice_helpers import resolve_invoice_emails
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)
router = APIRouter()


@router.put("/instore-payment")
@router.put("/instore-online-payment")
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
            card_payment_method_id = body.get("cardPaymentMethodId") or body.get("cardPaymentId")

            # If frontend sent a cardPaymentMethodId directly (customer paying via payment link),
            # create a payment_update entry so it gets charged below
            if card_payment_method_id and not payment_updates:
                order_grand_total = float(order["grand_total"] or 0)
                if order_grand_total > 0:
                    payment_updates = [{"amount": order_grand_total, "paymentIntentId": card_payment_method_id, "paymentMethod": "Card"}]

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
                                metadata={
                                    "order_id": orderId,
                                    "laundry_id": laundryId,
                                    "type": "instore_online_payment",
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

            # Determine if any payment was actually collected
            cur.execute("SELECT COALESCE(SUM(amount), 0) as total_paid FROM orders.order_payments WHERE order_id = %s", (orderId,))
            total_paid_row = cur.fetchone()
            total_paid = float(total_paid_row["total_paid"]) if total_paid_row else 0

            # Only mark as Paid if payment was actually collected
            if total_paid >= grand_total or payment_updates:
                new_status = "EnRouteToDelivery" if order["order_type"] != "Commercial" else order["order_status"]
                cur.execute("""
                    UPDATE orders.orders
                    SET payment_status = 'Paid', order_status = %s, grand_total = %s,
                        sub_total = %s, last_updated_by = %s, updated_at = NOW()
                    WHERE order_id = %s
                """, (new_status, grand_total, sub_total, empId, orderId))
            else:
                # No payment collected — update totals but NOT payment_status
                cur.execute("""
                    UPDATE orders.orders
                    SET grand_total = %s, sub_total = %s, last_updated_by = %s, updated_at = NOW()
                    WHERE order_id = %s
                """, (grand_total, sub_total, empId, orderId))

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


# ── Stripe Invoice for Commercial Customers ───────────────────────────────────

@router.post("/create-invoice")
async def create_invoice(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Create and send a Stripe Invoice for a commercial order."""
    from app.services.payment_service import _init_stripe
    import stripe as stripe_lib

    order_id = body.get("orderId")
    laundry_id = body.get("laundryId")
    customer_email = body.get("customerEmail")
    customer_name = body.get("customerName", "")
    due_days = int(body.get("dueDays", 30))

    if not order_id or not laundry_id:
        return {"status": "error", "message": "Missing orderId or laundryId"}

    try:
        _init_stripe(laundry_id)

        # Get order details (include billing_email for dual-email resolution)
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT o.*, c.email, c.billing_email, c.first_name, c.last_name, c.phone_number
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.order_id = %s AND o.laundry_id = %s
            """, (order_id, laundry_id))
            order = cur.fetchone()
            if not order:
                return {"status": "error", "message": "Order not found"}

            # Get services
            cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (order_id,))
            services = cur.fetchall()

            # Get products
            cur.execute("SELECT * FROM orders.order_products WHERE order_id = %s", (order_id,))
            products = cur.fetchall()

            # Get laundry name
            cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            shop = cur.fetchone()
            laundry_name = shop["laundry_name"] if shop else "Laundry"

        # Resolve invoice recipient list using dual-email logic
        # If frontend explicitly provided a customerEmail, use it directly (backwards compat)
        # Otherwise use resolve_invoice_emails for dual-email support
        if customer_email:
            invoice_email = customer_email
            secondary_email = None
        else:
            invoice_emails = resolve_invoice_emails(order)
            if not invoice_emails:
                return {"status": "error", "message": "Customer has no email. Please provide an email address."}
            # First email is billing_email if set (primary Stripe recipient)
            invoice_email = invoice_emails[0]
            secondary_email = invoice_emails[1] if len(invoice_emails) > 1 else None

        invoice_name = customer_name or f"{order['first_name'] or ''} {order['last_name'] or ''}".strip()

        # Find or create Stripe customer for invoicing
        existing_customers = stripe_lib.Customer.list(email=invoice_email, limit=1)
        if existing_customers.data:
            stripe_customer = existing_customers.data[0]
        else:
            stripe_customer = stripe_lib.Customer.create(
                email=invoice_email,
                name=invoice_name,
                phone=order["phone_number"] or "",
                metadata={"order_id": order_id, "laundry_id": laundry_id},
            )

        # Create invoice
        invoice = stripe_lib.Invoice.create(
            customer=stripe_customer.id,
            collection_method="send_invoice",
            days_until_due=due_days,
            metadata={"order_id": order_id, "laundry_id": laundry_id},
            description=f"Invoice for order {order_id} - {laundry_name}",
        )

        # Add line items from services
        for svc in services:
            amount_cents = int(round(float(svc["service_price"] or 0) * float(svc["weight_or_count"] or 0) * 100))
            if amount_cents > 0:
                stripe_lib.InvoiceItem.create(
                    customer=stripe_customer.id,
                    invoice=invoice.id,
                    amount=amount_cents,
                    currency="usd",
                    description=f"{svc['service_name']} ({svc['weight_or_count']} lbs)",
                )

        # Add line items from products
        for prod in products:
            amount_cents = int(round(float(prod["product_price"] or 0) * int(prod["product_count"] or 1) * 100))
            if amount_cents > 0:
                stripe_lib.InvoiceItem.create(
                    customer=stripe_customer.id,
                    invoice=invoice.id,
                    amount=amount_cents,
                    currency="usd",
                    description=f"{prod['product_name']} (x{prod['product_count']})",
                )

        # If no line items from services/products, use grand_total
        if not services and not products:
            amount_cents = int(round(float(order["grand_total"] or 0) * 100))
            stripe_lib.InvoiceItem.create(
                customer=stripe_customer.id,
                invoice=invoice.id,
                amount=amount_cents,
                currency="usd",
                description=f"Laundry service - Order {order_id}",
            )

        # Finalize and send the invoice
        finalized = stripe_lib.Invoice.finalize_invoice(invoice.id)
        stripe_lib.Invoice.send_invoice(invoice.id)

        # Update order with invoice ID
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                UPDATE orders.orders SET payment_status = 'Invoice Sent', updated_at = NOW()
                WHERE order_id = %s
            """, (order_id,))

        logger.info(f"Manual invoice sent for order {order_id} to {invoice_email}")

        # Send informational notification to secondary email (if exists)
        # This notifies the account_email holder when billing_email is primary, or vice versa.
        if secondary_email:
            try:
                from app.services.notification_service import send_email
                invoice_url = finalized.hosted_invoice_url or ""
                amount_due = finalized.amount_due / 100
                html_body = f"""
                <h2>Invoice Notification - {laundry_name}</h2>
                <p>An invoice for order <strong>{order_id}</strong> has been sent.</p>
                <p>Amount: ${amount_due:.2f}</p>
                {f'<p><a href="{invoice_url}" style="background:#4299E1;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Invoice</a></p>' if invoice_url else ''}
                <p style="color:#777;font-size:13px;">This is an informational copy. The invoice payment link was sent to {invoice_email}.</p>
                """
                send_email(
                    secondary_email,
                    f"Invoice sent for order {order_id} - {laundry_name}",
                    html_body,
                    sender_name=laundry_name,
                )
                logger.info(f"Invoice notification sent to secondary email {secondary_email} for order {order_id}")
            except Exception as notif_err:
                logger.warning(f"Failed to send invoice notification to {secondary_email} for order {order_id}: {notif_err}")

        return {
            "status": "success",
            "message": f"Invoice sent to {invoice_email}",
            "invoiceId": invoice.id,
            "invoiceUrl": finalized.hosted_invoice_url,
            "invoicePdf": finalized.invoice_pdf,
            "amountDue": finalized.amount_due / 100,
            "dueDate": finalized.due_date,
            "notifiedEmail": secondary_email,
        }

    except Exception as e:
        logger.exception("create_invoice error")
        return {"status": "error", "message": str(e)}


# ── Stripe Webhook for Invoice Payment ────────────────────────────────────────

@router.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (invoice paid, etc.)."""
    from fastapi import Request
    import stripe as stripe_lib

    body = await request.body()
    
    try:
        event = stripe_lib.Event.construct_from(
            json.loads(body), stripe_lib.api_key
        )
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error"}

    if event.type == "invoice.paid":
        invoice = event.data.object
        order_id = invoice.metadata.get("order_id")
        laundry_id = invoice.metadata.get("laundry_id")

        if order_id:
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    UPDATE orders.orders SET payment_status = 'Paid', updated_at = NOW()
                    WHERE order_id = %s
                """, (order_id,))
                # Record the payment
                cur.execute("""
                    INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                    VALUES (%s, %s, %s, 'Invoice')
                    ON CONFLICT DO NOTHING
                """, (order_id, invoice.payment_intent or invoice.id, float(invoice.amount_paid or 0) / 100))
            logger.info(f"Invoice paid for order {order_id} (${invoice.amount_paid/100})")

    return {"status": "success"}
