"""
Payment service — replaces PaymentService Lambda.
All Stripe operations consolidated here.
"""
import logging
import stripe
from decimal import Decimal
from app.config import settings
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def get_stripe_key(laundry_id: str):
    """Fetch Stripe secret key and terminal ID for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT stripe_private_key, stripe_terminal_id
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        row = cur.fetchone()
        if not row or not row["stripe_private_key"]:
            raise ValueError(f"No Stripe key found for laundry {laundry_id}")
        return row["stripe_private_key"], row.get("stripe_terminal_id")


def _init_stripe(laundry_id: str):
    """Set stripe.api_key for a laundry and return terminal_id."""
    key, terminal_id = get_stripe_key(laundry_id)
    stripe.api_key = key
    return terminal_id


def save_card_details(customer_id, customer_payment_id, payment_method_id, laundry_id):
    """Save/attach a payment method to a Stripe customer."""
    _init_stripe(laundry_id)
    try:
        if customer_payment_id:
            customer = stripe.Customer.retrieve(customer_payment_id)
            if customer.get('deleted', False):
                customer_payment_id = None
            else:
                stripe.PaymentMethod.attach(payment_method_id, customer=customer_payment_id)
                stripe.Customer.modify(customer_payment_id,
                                       invoice_settings={'default_payment_method': payment_method_id})
                return {"status": "success", "customerPaymentId": customer_payment_id}

        if not customer_payment_id:
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("SELECT first_name, last_name, email, phone_number FROM shop.customers WHERE customer_id = %s", (customer_id,))
                cust = cur.fetchone()
            if not cust:
                return {"status": "error", "message": "Customer not found"}
            full_name = f"{cust['first_name']} {cust['last_name']}"
            customer = stripe.Customer.create(name=full_name, email=cust['email'], phone=cust['phone_number'])
            new_id = customer.id
            stripe.PaymentMethod.attach(payment_method_id, customer=new_id)
            stripe.Customer.modify(new_id, invoice_settings={'default_payment_method': payment_method_id})
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    INSERT INTO shop.customer_payment_profiles (customer_id, laundry_id, stripe_customer_id)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (customer_id, laundry_id) DO UPDATE SET stripe_customer_id = %s
                """, (customer_id, laundry_id, new_id, new_id))
            return {"status": "success", "customerPaymentId": new_id}
    except Exception as e:
        logger.exception("save_card_details error")
        return {"status": "error", "error": str(e)}


def get_card_details(stripe_customer_id, laundry_id):
    """Get saved cards for a customer."""
    _init_stripe(laundry_id)
    try:
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_pm = customer.get('invoice_settings', {}).get('default_payment_method')
        methods = stripe.PaymentMethod.list(customer=stripe_customer_id, type='card')['data']
        for m in methods:
            m['is_default'] = (m['id'] == default_pm)
        return {"status": "success", "paymentMethods": methods}
    except Exception as e:
        logger.exception("get_card_details error")
        return {"status": "error", "message": str(e)}


def delete_card_details(payment_method_id, laundry_id):
    """Detach a payment method."""
    _init_stripe(laundry_id)
    try:
        stripe.PaymentMethod.detach(payment_method_id)
        return {"status": "success", "message": f"Payment method {payment_method_id} deleted"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_hold(customer_payment_id, amount, description, laundry_id, order_id=None, customer_id=None):
    """Create a payment hold (manual capture)."""
    _init_stripe(laundry_id)
    payment_intent = None
    try:
        customer = stripe.Customer.retrieve(customer_payment_id)
        default_pm = customer.get('invoice_settings', {}).get('default_payment_method')
        if not default_pm:
            return {"status": "error", "message": "No default payment method found"}
        amount_cents = int(round(Decimal(amount) * 100))
        create_args = {
            "amount": amount_cents, "currency": "usd", "customer": customer_payment_id,
            "description": description, "payment_method": default_pm,
            "payment_method_types": ["card"], "capture_method": "manual", "confirmation_method": "manual",
        }
        if order_id:
            create_args["metadata"] = {"order_id": order_id, "laundry_id": laundry_id, "customer_id": customer_id or "", "type": "hold"}
        payment_intent = stripe.PaymentIntent.create(**create_args)
        confirmed = stripe.PaymentIntent.confirm(payment_intent.id, payment_method=default_pm)
        if confirmed['status'] == 'requires_capture':
            return {"status": "success", "paymentIntentId": confirmed.id}
        elif confirmed['status'] == 'requires_action':
            stripe.PaymentIntent.cancel(payment_intent.id)
            return {"status": "error", "message": "Requires additional confirmation"}
        else:
            stripe.PaymentIntent.cancel(payment_intent.id)
            return {"status": "error", "message": f"Unexpected status: {confirmed['status']}"}
    except Exception as e:
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
        return {"status": "error", "message": str(e)}


def capture_payment(customer_payment_id, price, order_id, description, customer_id, laundry_id):
    """Charge customer card (immediate capture)."""
    _init_stripe(laundry_id)
    try:
        customer = stripe.Customer.retrieve(customer_payment_id)
        default_pm = customer.get('invoice_settings', {}).get('default_payment_method')
        if not default_pm:
            return {"status": "error", "message": "No default payment method found"}
        amount_cents = int(round(Decimal(price) * 100))
        intent = stripe.PaymentIntent.create(
            amount=amount_cents, currency='usd', customer=customer_payment_id,
            description=description, payment_method=default_pm,
            payment_method_types=["card"], confirm=True,
            metadata={"order_id": order_id, "laundry_id": laundry_id, "customer_id": customer_id or ""},
        )
        if intent['status'] == 'succeeded':
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("SELECT hold_payment_intent_id FROM orders.orders WHERE order_id = %s", (order_id,))
                row = cur.fetchone()
                if row and row["hold_payment_intent_id"]:
                    cancel_intent(row["hold_payment_intent_id"], laundry_id)
                cur.execute("""
                    INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                    VALUES (%s, %s, %s, 'Card')
                """, (order_id, intent.id, price))
                cur.execute("UPDATE orders.orders SET payment_status = 'Paid' WHERE order_id = %s", (order_id,))
            return {"status": "success", "paymentIntentId": intent.id}
        else:
            return {"status": "error", "message": f"Payment failed. Status: {intent['status']}"}
    except Exception as e:
        logger.exception("capture_payment error")
        return {"status": "error", "message": str(e)}


def capture_store_payment(card_payment_id, price, order_id, customer_id, laundry_id):
    """In-store card payment (immediate charge)."""
    _init_stripe(laundry_id)
    try:
        amount_cents = int(round(Decimal(price) * 100))
        desc = f"In-store | Order: {order_id} | Customer: {customer_id} | Laundry: {laundry_id}"
        intent = stripe.PaymentIntent.create(
            amount=amount_cents, currency='usd', payment_method=card_payment_id,
            payment_method_types=["card"], confirm=True, description=desc,
            metadata={"order_id": order_id, "laundry_id": laundry_id, "customer_id": customer_id or "", "type": "instore"},
        )
        if intent['status'] == 'succeeded':
            return {"status": "success", "paymentIntentId": intent.id}
        else:
            return {"status": "error", "message": f"Failed. Status: {intent['status']}"}
    except stripe.error.CardError as e:
        return {"status": "error", "message": f"Card declined: {e.user_message}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def capture_hold_store_payment(intent_id, price, laundry_id):
    """Capture a previously held payment intent."""
    _init_stripe(laundry_id)
    try:
        amount_cents = int(round(Decimal(price) * 100))
        intent = stripe.PaymentIntent.retrieve(intent_id)
        if intent.status == 'succeeded':
            return {"status": "success", "paymentIntentId": intent.id}
        elif intent.status == 'requires_capture':
            captured = stripe.PaymentIntent.capture(intent_id, amount_to_capture=amount_cents)
            if captured.status == 'succeeded':
                return {"status": "success", "paymentIntentId": captured.id}
            return {"status": "error", "message": f"Capture failed: {captured.status}"}
        elif intent.status == 'canceled':
            return {"status": "error", "message": "Payment intent already canceled"}
        else:
            return {"status": "error", "message": f"Cannot capture. Status: {intent.status}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def cancel_intent(intent_id, laundry_id):
    """Cancel a payment intent."""
    _init_stripe(laundry_id)
    try:
        stripe.PaymentIntent.cancel(intent_id)
        return {"status": "success", "message": f"Intent {intent_id} canceled"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def refund_payment(payment_intent_id, amount, description, laundry_id):
    """Process a refund."""
    _init_stripe(laundry_id)
    try:
        refund_args = {"payment_intent": payment_intent_id, "description": description}
        if amount:
            refund_args["amount"] = int(round(Decimal(amount) * 100))
        refund = stripe.Refund.create(**refund_args)
        if refund['status'] == 'succeeded':
            return {"status": "success", "refundId": refund.id}
        return {"status": "error", "message": f"Refund failed: {refund['status']}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Payment Gate — blocks post-processing status transitions for unpaid orders
# ---------------------------------------------------------------------------

GATED_STATUSES = {'ReadyForDelivery', 'EnRouteToDelivery', 'Delivered', 'OrderPickedUp'}


def check_payment_gate(order, target_status, laundry_id):
    """
    Enforce payment requirements before allowing status transitions past
    ProcessingCompleted. Returns a dict indicating whether the transition
    is allowed.

    - Non-gated statuses or already-paid orders → {"allowed": True}
    - Online unpaid → auto-charge card on file, return {"allowed": True, "charged": True, "paymentIntentId": "..."}
    - Online charge failure → {"allowed": False, "error": "Payment charge failed: <reason>..."}
    - Non-Online unpaid → {"allowed": False, "error": "Payment required..."}
    """
    if target_status not in GATED_STATUSES:
        return {"allowed": True}

    if order.get('payment_status') == 'Paid':
        return {"allowed": True}

    # Commercial / pay-by-invoice orders bypass the payment gate
    # (they'll be invoiced after ProcessingCompleted)
    if order.get('pay_by_invoice'):
        logger.info(
            f"Payment gate BYPASS for order {order.get('order_id', '?')}: "
            f"order_type={order.get('order_type')}, pay_by_invoice={order.get('pay_by_invoice')}, "
            f"target_status={target_status}"
        )
        return {"allowed": True}

    # Unpaid order targeting a gated status — enforce payment gate
    if order.get('order_type') == 'Online':
        # Look up stripe_customer_id for this customer/laundry pair
        try:
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    SELECT stripe_customer_id FROM shop.customer_payment_profiles
                    WHERE customer_id = %s AND laundry_id = %s
                """, (order['customer_id'], laundry_id))
                row = cur.fetchone()

            if not row or not row.get('stripe_customer_id'):
                return {
                    "allowed": False,
                    "error": "Payment charge failed: No payment profile found. Please resolve payment manually."
                }

            stripe_customer_id = row['stripe_customer_id']
            order_id = order.get('order_id', '')
            grand_total = order.get('grand_total', 0)
            customer_id = order.get('customer_id', '')
            description = f"Auto-charge for order {order_id} on status transition to {target_status}"

            result = capture_payment(
                customer_payment_id=stripe_customer_id,
                price=grand_total,
                order_id=order_id,
                description=description,
                customer_id=customer_id,
                laundry_id=laundry_id,
            )

            if result.get('status') == 'success':
                return {
                    "allowed": True,
                    "charged": True,
                    "paymentIntentId": result.get('paymentIntentId', ''),
                }
            else:
                reason = result.get('message', 'Unknown error')
                return {
                    "allowed": False,
                    "error": f"Payment charge failed: {reason}. Please resolve payment manually."
                }

        except Exception as e:
            logger.exception("check_payment_gate error during auto-charge")
            return {
                "allowed": False,
                "error": f"Payment charge failed: {str(e)}. Please resolve payment manually."
            }

    # Non-Online order (e.g. InStore) without payment
    return {
        "allowed": False,
        "error": "Payment required before order can proceed past processing. Please collect payment manually."
    }


def create_instore_hold(card_payment_id, amount, description, laundry_id,
                        save_card=False, customer_id=None, customer_payment_id=None):
    """Create a hold for in-store payment."""
    _init_stripe(laundry_id)
    payment_intent = None
    try:
        amount_cents = int(round(Decimal(amount) * 100))

        if save_card and customer_id:
            if customer_payment_id:
                methods = stripe.PaymentMethod.list(customer=customer_payment_id, type="card")['data']
                new_method = stripe.PaymentMethod.retrieve(card_payment_id)
                existing_fps = {pm.card.fingerprint for pm in methods}
                if new_method.card.fingerprint not in existing_fps:
                    stripe.PaymentMethod.attach(card_payment_id, customer=customer_payment_id)
                    stripe.Customer.modify(customer_payment_id, invoice_settings={'default_payment_method': card_payment_id})
            else:
                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("SELECT first_name, last_name, email, phone_number FROM shop.customers WHERE customer_id = %s", (customer_id,))
                    cust = cur.fetchone()
                if cust:
                    full_name = f"{cust['first_name']} {cust['last_name']}"
                    sc = stripe.Customer.create(name=full_name, email=cust['email'], phone=cust['phone_number'])
                    customer_payment_id = sc.id
                    stripe.PaymentMethod.attach(card_payment_id, customer=customer_payment_id)
                    stripe.Customer.modify(customer_payment_id, invoice_settings={'default_payment_method': card_payment_id})
                    with get_db() as conn:
                        cur = get_cursor(conn)
                        cur.execute("""
                            INSERT INTO shop.customer_payment_profiles (customer_id, laundry_id, stripe_customer_id)
                            VALUES (%s, %s, %s) ON CONFLICT (customer_id, laundry_id) DO UPDATE SET stripe_customer_id = %s
                        """, (customer_id, laundry_id, customer_payment_id, customer_payment_id))

        intent_args = {
            "amount": amount_cents, "currency": "usd", "description": description,
            "payment_method": card_payment_id, "payment_method_types": ["card"],
            "capture_method": "manual", "setup_future_usage": "off_session", "confirmation_method": "manual"
        }
        if save_card and customer_payment_id:
            intent_args["customer"] = customer_payment_id

        payment_intent = stripe.PaymentIntent.create(**intent_args)
        confirmed = stripe.PaymentIntent.confirm(payment_intent.id, payment_method=card_payment_id)

        if confirmed['status'] == 'requires_capture':
            return {"status": "success", "paymentIntentId": confirmed.id}
        elif confirmed['status'] == 'requires_action':
            stripe.PaymentIntent.cancel(payment_intent.id)
            return {"status": "error", "message": "Requires additional confirmation"}
        else:
            stripe.PaymentIntent.cancel(payment_intent.id)
            return {"status": "error", "message": f"Unexpected status: {confirmed['status']}"}
    except Exception as e:
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
        return {"status": "error", "message": str(e)}
