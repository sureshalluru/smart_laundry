import stripe
import boto3
from decimal import Decimal
import json
from datetime import datetime
from notifications import invoke_notification_lambda
import logging
import db

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

lambda_client = boto3.client('lambda')


def _get_customer(customer_id):
    """Fetch customer name, email, phone from PostgreSQL."""
    cur = db.get_cursor()
    cur.execute("""
        SELECT first_name, last_name, email, phone_number
        FROM shop.customers WHERE customer_id = %s
    """, (customer_id,))
    return cur.fetchone()


def _save_stripe_customer(customer_id, laundry_id, stripe_customer_id):
    """Upsert Stripe customer ID into customer_payment_profiles."""
    cur = db.get_cursor()
    cur.execute("""
        INSERT INTO shop.customer_payment_profiles (customer_id, laundry_id, stripe_customer_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (customer_id, laundry_id)
        DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
    """, (customer_id, laundry_id, stripe_customer_id))
    db.commit()


def get_stripe_key(laundry_id):
    """Retrieve the Stripe private key from PostgreSQL."""
    logger.debug(f"get_stripe_key: laundry_id={laundry_id}")
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT stripe_private_key, stripe_terminal_id
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        row = cur.fetchone()
        if not row or not row["stripe_private_key"]:
            raise ValueError(f"No stripePrivateKey found for laundryId {laundry_id}")
        return row["stripe_private_key"], row["stripe_terminal_id"]
    except Exception as e:
        raise ValueError(f"Error retrieving stripePrivateKey for laundryId {laundry_id}: {str(e)}")


def lambda_handler(event, context):
    logger.info(f"lambda_handler started with event: {event}")
    try:
        # Extract the query string parameters
        params = event.get('queryStringParameters', {})
        order_payment_operation = event.get('orderPaymentOperation')
        operation = params.get('operation')
        customer_id = params.get('customerId')
        laundry_id = params.get('laundryId')
        customer_payment_id = params.get('customerPaymentId')
        customer_payment_method = params.get('customerPaymentMethod')
        terminal_payment_intent_id = params.get('terminalPaymentIntentId', '')
        last_run = params.get('lastRun', False)
        save_terminal_card = params.get('saveCard', False)

        # Check if order_payment_operation is set (for createHold, capturePayment and cancelHold)
        if order_payment_operation:
            logger.info(f"Handling order_payment_operation: {order_payment_operation} with event: {event}")
            # Fetch the Stripe key dynamically based on laundryId
            laundry_id = event.get('laundryId')
            if not laundry_id:
                error_msg = "Missing laundryId to process payment"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}

            try:
                stripe_api_key, stripe_terminal_id = get_stripe_key(laundry_id)
                stripe.api_key = stripe_api_key
            except ValueError as e:
                logger.error(str(e))
                return {'status': 'error', 'message': str(e)}

            if order_payment_operation == 'createHold':
                order_price = event.get('amount')
                order_description = event.get('description')
                stripe_customer_payment_id = event.get('customerPaymentId')
                logger.debug("createHold operation parameters received")
                if not order_price or not order_description or not stripe_customer_payment_id:
                    error_msg = "Missing required parameters to create payment hold"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return create_hold(customer_payment_id=stripe_customer_payment_id, amount=order_price,
                                   description=order_description)

            elif order_payment_operation == 'capturePayment':
                order_id = event.get('orderId')
                order_price = event.get('amount')
                order_description = event.get('description')
                stripe_customer_payment_id = event.get('customerPaymentId')
                customer_id = event.get('customerId', None)
                logger.debug("capturePayment operation parameters received")
                if not all([order_id, order_price, order_description, stripe_customer_payment_id]):
                    error_msg = "Missing required parameters to charge customer"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                cur = db.get_cursor()
                cur.execute("SELECT order_id FROM orders.orders WHERE order_id = %s", (order_id,))
                if not cur.fetchone():
                    return {'status': 'error', 'message': f'Order {order_id} not found'}
                return capture_payment(customer_payment_id=stripe_customer_payment_id, price=order_price,
                                       order_id=order_id, description=order_description, customer_id=customer_id,
                                       laundry_id=laundry_id)

            elif order_payment_operation == 'captureStorePayment':
                stripe_card_payment_id = event.get('cardPaymentId')
                order_price = event.get('amount')
                order_id = event.get('orderId', None)
                customer_id = event.get('customerId', None)
                payment_intent_description = event.get('intentDescription', '')
                logger.debug("captureStorePayment operation parameters received")
                if not all([order_price, stripe_card_payment_id]):
                    error_msg = "Missing required parameters to charge Store customer"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return capture_store_payment(card_payment_id=stripe_card_payment_id, price=order_price,
                                             order_id=order_id, customer_id=customer_id, laundry_id=laundry_id,
                                             intent_description=payment_intent_description)

            elif order_payment_operation == 'captureFinalStorePayment':
                final_payment_id = event.get('stripePaymentIntentId')
                order_final_price = event.get('amount')
                logger.debug("captureFinalStorePayment operation parameters received")
                if not all([order_final_price, final_payment_id]):
                    error_msg = "Missing required parameters to charge Final Store customer"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return capture_store_final_payment(intent_id=final_payment_id, price=order_final_price)

            elif order_payment_operation == 'holdStorePayment':
                stripe_card_payment_id = event.get('cardPaymentId')
                order_price = event.get('amount')
                order_description = event.get('description')
                save_card = event.get('saveCard', False)
                customer_id = event.get('customerId')
                customer_payment_id = event.get('customerPaymentId')
                laundry_id = event.get('laundryId')
                logger.debug("holdStorePayment operation parameters received")
                if not all([order_price, stripe_card_payment_id]):
                    error_msg = "Missing required parameters to charge Store customer"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return create_inStore_hold(
                    card_payment_id=stripe_card_payment_id,
                    amount=order_price,
                    description=order_description,
                    save_card=save_card,
                    customer_id=customer_id,
                    customer_payment_id=customer_payment_id,
                    laundry_id=laundry_id
                )

            elif order_payment_operation == 'cancelHold':
                stripe_customer_payment_intent_id = event.get('paymentIntentId')
                logger.debug("cancelHold operation parameters received")
                if not stripe_customer_payment_intent_id:
                    error_msg = "Missing required parameters to cancel customer hold"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return cancel_intent(intent_id=stripe_customer_payment_intent_id)

            elif order_payment_operation == 'refundPayment':
                payment_intent_id = event.get('paymentIntentId')
                order_refund_amount = event.get('amount')
                refund_description = event.get('description')
                logger.debug("refundPayment operation parameters received")
                if not payment_intent_id:
                    error_msg = "Missing required parameters to initiate a refund"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return refund_payment(payment_intent_id=payment_intent_id, amount=order_refund_amount,
                                      description=refund_description)

            elif order_payment_operation == 'initiateTerminalPayment':
                order_price = event.get('amount')
                customer_id = event.get('customerId')
                customer_payment_id = event.get('customerPaymentId')
                save_card = event.get('saveCard')
                existing_terminal_payment_intent_id = event.get('terminalPaymentIntentId')
                logger.debug("initiateTerminalPayment operation parameters received")
                if not order_price:
                    error_msg = "Missing Order Price to initiate payment"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                if isinstance(save_card, str):
                    save_card = save_card.lower() == 'true'
                return capture_hold_terminal_payment(terminal_id=stripe_terminal_id, amount=order_price,
                                                     payment_intent_id=existing_terminal_payment_intent_id,customer_id=customer_id,
                                                     customer_payment_id=customer_payment_id,save_card=save_card,laundry_id=laundry_id)
            elif order_payment_operation == 'initiateImmediateTerminalPayment':
                order_price = event.get('amount')
                existing_terminal_payment_intent_id = event.get('terminalPaymentIntentId')
                logger.debug("initiateTerminalPayment operation parameters received")
                if not order_price:
                    error_msg = "Missing Order Price to initiate payment"
                    logger.error(error_msg)
                    return {'status': 'error', 'message': error_msg}
                return capture_direct_terminal_payment(terminal_id=stripe_terminal_id, amount=order_price,
                                                       payment_intent_id=existing_terminal_payment_intent_id)
            elif order_payment_operation == "saveStoreCustomerCard":
                customer_id = event.get("customerId")
                customer_payment_id = event.get("customerPaymentId")  # Stripe customer ID
                laundry_id = event.get("laundryId")
                card_payment_id = event.get("cardPaymentId")
                payment_intent_id = event.get("paymentIntentId")

                try:
                    if customer_payment_id:
                        logger.info(
                            f"Checking if card {card_payment_id} is already attached to Stripe customer {customer_payment_id}")

                        # Get existing cards
                        methods = stripe.PaymentMethod.list(customer=customer_payment_id, type="card")['data']

                        # Retrieve the new card to get its fingerprint
                        new_method = stripe.PaymentMethod.retrieve(card_payment_id)
                        new_fingerprint = new_method.card.fingerprint

                        # Check for existing card with the same fingerprint
                        existing_fingerprints = {pm.card.fingerprint for pm in methods}

                        if new_fingerprint not in existing_fingerprints:
                            stripe.PaymentMethod.attach(card_payment_id, customer=customer_payment_id)
                            stripe.Customer.modify(customer_payment_id,
                                                   invoice_settings={'default_payment_method': card_payment_id})
                            logger.info("Card successfully attached to existing Stripe customer.")
                        else:
                            stripe.PaymentIntent.modify(
                                payment_intent_id,
                                customer=customer_payment_id
                            )

                            logger.info("Card with matching fingerprint already attached. Skipping.")

                        return {"status": "success", "message": "Card attached if not already."}

                    else:
                        cust = _get_customer(customer_id)
                        if not cust:
                            return {"status": "error", "message": f"No customer found with ID {customer_id}"}
                        full_name = f"{cust['first_name']} {cust['last_name']}"
                        new_customer = stripe.Customer.create(
                            name=full_name,
                            email=cust['email'],
                            phone=cust['phone_number']
                        )
                        new_customer_id = new_customer.id
                        stripe.PaymentMethod.attach(card_payment_id, customer=new_customer_id)
                        stripe.Customer.modify(new_customer_id,
                                               invoice_settings={'default_payment_method': card_payment_id})
                        _save_stripe_customer(customer_id, laundry_id, new_customer_id)
                        return {"status": "success", "customerPaymentId": new_customer_id}

                except Exception as e:
                    logger.exception("Error saving card if needed")
                    return {"status": "error", "message": str(e)}

            elif order_payment_operation == "test":
                logger.debug("test operation triggered")
                return test_terminal(terminal_id=stripe_terminal_id)

            elif order_payment_operation == "cancelTest":
                logger.debug("cancelTest operation triggered")
                return cancel_terminal_intent(terminal_id=stripe_terminal_id)
            else:
                error_msg = "Unsupported order payment operation"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}

        if not operation:
            error_msg = "Missing operation"
            logger.error(error_msg)
            return {'status': 'error', 'message': error_msg}
        logger.info(f"Handling operation: {operation}")

        # Fetch the Stripe key dynamically based on laundryId
        if not laundry_id:
            error_msg = "Missing laundryId to process payment"
            logger.error(error_msg)
            return {'status': 'error', 'message': error_msg}

        try:
            stripe_api_key, stripe_terminal_id = get_stripe_key(laundry_id)
            stripe.api_key = stripe_api_key
        except ValueError as e:
            logger.error(str(e))
            return {'status': 'error', 'message': str(e)}

        if operation == 'saveCardDetails':
            if not customer_id:
                error_msg = "Missing customerId"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}
            return save_card_details(customer_id, customer_payment_id, customer_payment_method, laundry_id)

        elif operation == 'getCardDetails':
            if not customer_payment_id:
                error_msg = "Missing customerPaymentId"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}
            return get_card_details(customer_payment_id)

        elif operation == 'deleteCardDetails':
            if not customer_payment_method:
                error_msg = "Missing customerPaymentMethod"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}
            return delete_card_details(customer_payment_method)

        elif operation == 'checkTerminalPaymentStatus':
            if not terminal_payment_intent_id:
                error_msg = "Missing Payment Intent Id to check the payment status"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}
            if isinstance(save_terminal_card, str):
                save_terminal_card = save_terminal_card.lower() == 'true'
            return get_hold_payment_status(payment_intent_id=terminal_payment_intent_id, last_run=last_run,
                                           terminal_id=stripe_terminal_id,customer_payment_id=customer_payment_id,
                                           save_card= save_terminal_card)
        elif operation == 'checkImmediateTerminalPaymentStatus':
            if not terminal_payment_intent_id:
                error_msg = "Missing Payment Intent Id to check the payment status"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}
            return get_direct_payment_status(payment_intent_id=terminal_payment_intent_id, last_run=last_run,
                                             terminal_id=stripe_terminal_id)
        else:
            error_msg = "Unsupported operation"
            logger.error(error_msg)
            return {'status': 'error', 'message': error_msg}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': error_msg}


# Save the card details in Stripe and the database
def save_card_details(customer_id, customer_payment_id, payment_method_id, laundry_id):
    logger.debug(
        f"save_card_details called with customer_id: {customer_id}, customer_payment_id: {customer_payment_id}, payment_method_id: {payment_method_id}")
    try:
        if customer_payment_id:
            try:
                logger.debug(f"Attempting to retrieve customer with customer_payment_id: {customer_payment_id}")
                customer = stripe.Customer.retrieve(customer_payment_id)
                logger.debug(f"Customer retrieved: {customer}")
                if customer.get('deleted', False):
                    logger.debug(f"Customer with id {customer_payment_id} is deleted.")
                    customer_payment_id = None
            except stripe.error.StripeError as e:
                error_msg = f"Error retrieving customer with customer_payment_id: {customer_payment_id}, Error: {e}"
                logger.error(error_msg)
                return {"status": 'error', "error": "Invalid customer payment ID"}

            if customer_payment_id:
                logger.debug(f"Attaching payment method {payment_method_id} to customer {customer_payment_id}")
                stripe.PaymentMethod.attach(
                    payment_method_id,
                    customer=customer_payment_id
                )
                logger.debug(f"Setting default payment method {payment_method_id} for customer {customer_payment_id}")
                stripe.Customer.modify(customer_payment_id,
                                       invoice_settings={'default_payment_method': payment_method_id})
                logger.debug(
                    f"Successfully updated customer {customer_payment_id} with new payment method {payment_method_id}")
                return {"status": 'success', "customerPaymentId": customer_payment_id}

        if not customer_payment_id:
            logger.debug(f"Creating new Stripe customer for customer_id: {customer_id}")
            cust = _get_customer(customer_id)
            if not cust:
                return {"status": "error", "message": "Customer not found in database"}
            full_name = f"{cust['first_name']} {cust['last_name']}"
            customer = stripe.Customer.create(name=full_name, email=cust['email'], phone=cust['phone_number'])
            new_customer_payment_id = customer.id
            stripe.PaymentMethod.attach(payment_method_id, customer=new_customer_payment_id)
            stripe.Customer.modify(new_customer_payment_id,
                                   invoice_settings={'default_payment_method': payment_method_id})
            _save_stripe_customer(customer_id, laundry_id, new_customer_payment_id)
            return {"status": 'success', "customerPaymentId": new_customer_payment_id}

    except Exception as e:
        error_msg = f"An error occurred while saving card details for customer_id: {customer_id}. Error: {str(e)}"
        logger.exception(error_msg)
        return {"status": 'error', "error": str(e)}


# Get the Card Details from Stripe
def get_card_details(stripe_customer_id):
    logger.debug(f"get_card_details called with stripe_customer_id: {stripe_customer_id}")
    try:
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')
        logger.debug(f"Default payment method for customer {stripe_customer_id}: {default_payment_method_id}")
        payment_methods = stripe.PaymentMethod.list(
            customer=stripe_customer_id,
            type='card'
        )['data']
        for method in payment_methods:
            method['is_default'] = (method['id'] == default_payment_method_id)
        logger.debug(f"Retrieved payment methods: {payment_methods}")
        return {
            'status': 'success',
            'paymentMethods': payment_methods
        }
    except Exception as e:
        error_msg = f"Error fetching card details: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': error_msg}


# Delete the card details from Stripe
def delete_card_details(payment_method_id):
    logger.debug(f"delete_card_details called with payment_method_id: {payment_method_id}")
    try:
        logger.debug(f"Attempting to detach payment method {payment_method_id}")
        stripe.PaymentMethod.detach(payment_method_id)
        logger.debug(f"Successfully detached payment method {payment_method_id}")
        return {'status': 'success', 'message': f'Payment method {payment_method_id} has been deleted'}
    except stripe.error.StripeError as e:
        error_msg = f"Stripe error occurred: {str(e)}"
        logger.error(error_msg)
        return {'status': 'error', 'message': error_msg}
    except Exception as e:
        error_msg = f"An error occurred: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': error_msg}


# Create a temporary hold on the customer's card
def create_hold(customer_payment_id, amount, description):
    logger.debug(
        f"create_hold called with customer_payment_id: {customer_payment_id}, amount: {amount}, description: {description}")
    payment_intent = None
    try:
        customer = stripe.Customer.retrieve(customer_payment_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')
        if not default_payment_method_id:
            error_msg = f"No default payment method found for customer {customer_payment_id}"
            logger.error(error_msg)
            return {'status': 'error', 'message': 'No default payment method found'}
        logger.debug(f"Default payment method for customer {customer_payment_id}: {default_payment_method_id}")
        amount_cents = int(round(Decimal(amount) * 100))
        logger.debug(f"Amount in cents: {amount_cents}")
        payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency='usd',
            customer=customer_payment_id,
            description=description,
            payment_method=default_payment_method_id,
            payment_method_types=["card"],
            capture_method='manual',
            confirmation_method='manual'
        )
        confirmed_intent = stripe.PaymentIntent.confirm(
            payment_intent.id,
            payment_method=default_payment_method_id
        )
        logger.debug(f"Payment intent confirmed with status: {confirmed_intent['status']}")
        if confirmed_intent['status'] == 'requires_capture':
            logger.info(
                f"Payment intent created successfully for customer {customer_payment_id}, paymentIntentId: {confirmed_intent.id}")
            return {'status': 'success', 'paymentIntentId': confirmed_intent.id}
        elif confirmed_intent['status'] == 'requires_action':
            logger.warning("Payment requires additional authentication")
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.debug(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': "Requires additional confirmation"}
        else:
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.debug(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': f"Unexpected payment intent status: {confirmed_intent['status']}"}
    except Exception as e:
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.debug(f"PaymentIntent {payment_intent.id} canceled due to error.")
        error_msg = f"Error in creating hold for customer {customer_payment_id}: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': str(e)}


# Capture payment and cancel the hold intent
def capture_payment(customer_payment_id, price, order_id, description, customer_id, laundry_id):
    logger.debug(
        f"capture_payment called with customer_payment_id: {customer_payment_id}, price: {price}, order_id: {order_id}, description: {description}")
    try:
        customer = stripe.Customer.retrieve(customer_payment_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')
        if not default_payment_method_id:
            error_msg = f"No default payment method found for customer {customer_payment_id}"
            logger.error(error_msg)
            return {'status': 'error', 'message': 'No default payment method found'}
        logger.debug(f"Default payment method for customer {customer_payment_id}: {default_payment_method_id}")
        amount_cents = int(round(Decimal(price) * 100))
        logger.debug(f"Charging amount in cents: {amount_cents}")
        new_payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency='usd',
            customer=customer_payment_id,
            description=description,
            payment_method=default_payment_method_id,
            payment_method_types=["card"],
            confirm=True
        )
        logger.debug(f"New payment intent status: {new_payment_intent['status']}")
        if new_payment_intent['status'] == 'succeeded':
            logger.info(f"Payment succeeded for customer {customer_payment_id}. Updating orders table.")
            cur = db.get_cursor()
            cur.execute("SELECT hold_payment_intent_id FROM orders.orders WHERE order_id = %s", (order_id,))
            order_row = cur.fetchone()
            if not order_row:
                return {'status': 'error', 'message': f"Order {order_id} not found."}
            hold_payment_intent_id = order_row["hold_payment_intent_id"]
            if hold_payment_intent_id:
                cancel_intent(hold_payment_intent_id)
            cur.execute("""
                INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                VALUES (%s, %s, %s, 'Card')
            """, (order_id, new_payment_intent.id, price))
            cur.execute("UPDATE orders.orders SET payment_status = 'Paid' WHERE order_id = %s", (order_id,))
            db.commit()
            return {'status': 'success', 'paymentIntentId': new_payment_intent.id}
        else:
            logger.error(
                f"Failed to charge card for customer {customer_payment_id}. Payment status: {new_payment_intent['status']}")
            invoke_notification_lambda(customer_id, laundry_id, order_id)
            return {'status': 'error', 'message': f"Failed to charge card. Status: {new_payment_intent['status']}"}
    except Exception as e:
        error_msg = f"Error during capture payment for customer {customer_payment_id}: {str(e)}"
        logger.exception(error_msg)
        invoke_notification_lambda(customer_id, laundry_id, order_id)
        return {'status': 'error', 'message': f"Error capturing payment: {str(e)}"}


# Capture the InStore payment for the PayNow Card option
def capture_store_payment(card_payment_id, price, order_id, customer_id, laundry_id, intent_description=""):
    logger.debug(
        f"capture_store_payment called with card_payment_id: {card_payment_id}, price: {price}, "
        f"order_id: {order_id}, customer_id: {customer_id}, laundry_id: {laundry_id}"
    )

    if not intent_description:
        intent_description = f"In-store | Order ID: {order_id} | Customer ID: {customer_id} | Laundry ID: {laundry_id}"
    try:
        amount_cents = int(round(Decimal(price) * 100))
        logger.debug(f"[{order_id}] Amount in cents: {amount_cents}")

        new_payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency='usd',
            payment_method=card_payment_id,
            payment_method_types=["card"],
            confirm=True,
            description=intent_description
        )

        logger.debug(
            f"[{order_id}] New payment intent status for in-store payment: {new_payment_intent['status']}"
        )

        if new_payment_intent['status'] == 'succeeded':
            logger.info(f"[{order_id}] Payment succeeded for in-store customer.")

            # Optional: Include card metadata in success response
            try:
                charge = new_payment_intent.charges.data[0]
                card_details = charge.payment_method_details.card
                return {
                    'status': 'success',
                    'paymentIntentId': new_payment_intent.id,
                    'card_last4': card_details.last4,
                    'card_brand': card_details.brand
                }
            except Exception as card_info_error:
                logger.warning(
                    f"[{order_id}] Payment succeeded but card details could not be fetched: {card_info_error}")
                return {
                    'status': 'success',
                    'paymentIntentId': new_payment_intent.id
                }

        else:
            logger.error(
                f"[{order_id}] Failed to charge card for in-store customer. Payment status: "
                f"{new_payment_intent['status']}"
            )
            # invoke_notification_lambda(customer_id, laundry_id, order_id)  # if used
            return {
                'status': 'error',
                'message': f"Failed to charge card. Status: {new_payment_intent['status']}"
            }

    except stripe.error.CardError as e:
        logger.error(f"[{order_id}] Card declined: {e.user_message}")
        return {'status': 'error', 'message': f"Card declined: {e.user_message}"}

    except stripe.error.StripeError as e:
        logger.error(f"[{order_id}] Stripe error: {e.user_message}")
        return {'status': 'error', 'message': f"Stripe error: {e.user_message}"}

    except Exception as e:
        logger.exception(
            f"[{order_id} | Customer: {customer_id} | Laundry: {laundry_id}] "
            f"Unexpected error during in-store capture payment"
        )
        return {'status': 'error', 'message': f"Error capturing payment: {str(e)}"}


# Capture InStore Hold payment
def create_inStore_hold(card_payment_id, amount, description, save_card=False, customer_id=None, customer_payment_id=None, laundry_id=None):
    logger.debug(f"create_inStore_hold called with card_payment_id: {card_payment_id}, amount: {amount}, description: {description}")
    payment_intent = None

    try:
        amount_cents = int(round(Decimal(amount) * 100))
        logger.debug(f"Amount in cents: {amount_cents}")

        # Step 1: Attach card to customer if save_card is True
        if save_card and customer_id:
            if customer_payment_id:
                logger.info(f"Using existing Stripe customer ID: {customer_payment_id}")

                # Check for existing card via fingerprint
                methods = stripe.PaymentMethod.list(customer=customer_payment_id, type="card")['data']
                new_method = stripe.PaymentMethod.retrieve(card_payment_id)
                new_fingerprint = new_method.card.fingerprint
                existing_fingerprints = {pm.card.fingerprint for pm in methods}

                if new_fingerprint not in existing_fingerprints:
                    stripe.PaymentMethod.attach(card_payment_id, customer=customer_payment_id)
                    stripe.Customer.modify(customer_payment_id, invoice_settings={'default_payment_method': card_payment_id})
                    logger.info("Card attached to existing Stripe customer.")
                else:
                    logger.info("Card already exists on customer. Skipping attachment.")

            else:
                # Fetch user details to create Stripe customer
                cust = _get_customer(customer_id)
                if not cust:
                    return {'status': 'error', 'message': f"No customer found with ID {customer_id}"}
                full_name = f"{cust['first_name']} {cust['last_name']}"
                stripe_customer = stripe.Customer.create(
                    name=full_name, email=cust['email'], phone=cust['phone_number'])
                customer_payment_id = stripe_customer.id
                stripe.PaymentMethod.attach(card_payment_id, customer=customer_payment_id)
                stripe.Customer.modify(customer_payment_id,
                                       invoice_settings={'default_payment_method': card_payment_id})
                if laundry_id:
                    _save_stripe_customer(customer_id, laundry_id, customer_payment_id)
                logger.info("New Stripe customer created and card attached.")

        # Step 2: Create Payment Intent
        intent_args = {
            "amount": amount_cents,
            "currency": 'usd',
            "description": description,
            "payment_method": card_payment_id,
            "payment_method_types": ["card"],
            "capture_method": 'manual',
            "setup_future_usage": "off_session",
            "confirmation_method": 'manual'
        }

        if save_card and customer_payment_id:
            intent_args["customer"] = customer_payment_id

        payment_intent = stripe.PaymentIntent.create(**intent_args)

        confirmed_intent = stripe.PaymentIntent.confirm(
            payment_intent.id,
            payment_method=card_payment_id
        )

        logger.debug(f"Confirmed payment intent status: {confirmed_intent['status']}")

        if confirmed_intent['status'] == 'requires_capture':
            logger.info(f"Payment intent created successfully for inStore customer. paymentIntentId: {confirmed_intent.id}")
            return {'status': 'success', 'paymentIntentId': confirmed_intent.id}
        elif confirmed_intent['status'] == 'requires_action':
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.warning(f"PaymentIntent {payment_intent.id} canceled due to requires_action.")
            return {'status': 'error', 'message': "Requires additional confirmation"}
        else:
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.warning(f"PaymentIntent {payment_intent.id} canceled due to unexpected status: {confirmed_intent['status']}")
            return {'status': 'error', 'message': f"Unexpected payment intent status: {confirmed_intent['status']}"}

    except Exception as e:
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
            logger.debug(f"PaymentIntent {payment_intent.id} canceled due to error.")
        logger.exception("Error during in-store hold and card save")
        return {'status': 'error', 'message': str(e)}


# Cancel a hold payment intent
def cancel_intent(intent_id):
    logger.debug(f"cancel_intent called with intent_id: {intent_id}")
    try:
        logger.debug(f"Cancelling payment intent {intent_id}")
        stripe.PaymentIntent.cancel(intent_id)
        logger.info(f"Payment intent {intent_id} canceled successfully.")
        return {'status': 'success', 'message': f"Payment intent {intent_id} canceled successfully"}
    except Exception as e:
        error_msg = f"Error cancelling payment intent {intent_id}: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': f"Error cancelling payment intent: {str(e)}"}


# Refund money to the customer
def refund_payment(payment_intent_id, description, amount):
    logger.debug(
        f"refund_payment called with payment_intent_id: {payment_intent_id}, amount: {amount}, description: {description}")
    try:
        refund = stripe.Refund.create(
            payment_intent=payment_intent_id,
            amount=int(round(Decimal(amount) * 100)) if amount else None,
            description=description
        )
        logger.debug(f"Refund status: {refund['status']}")
        if refund['status'] == 'succeeded':
            logger.info(f"Refund succeeded for payment_intent_id: {payment_intent_id}")
            return {'status': 'success', 'refundId': refund.id}
        else:
            error_msg = f"Refund failed for payment_intent_id: {payment_intent_id}, status: {refund['status']}"
            logger.error(error_msg)
            return {'status': 'error', 'message': f"Refund failed. Status: {refund['status']}"}
    except Exception as e:
        error_msg = f"Error initiating refund for payment_intent_id {payment_intent_id}: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': f"Error initiating refund: {str(e)}"}


# Capture the Hold Payment for the InStore final payment
# def capture_store_final_payment(intent_id, price):
#     logger.debug(f"capture_store_final_payment called with intent_id: {intent_id}, price: {price}")
#     try:
#         amount_cents = int(round(Decimal(price) * 100))
#         logger.debug(f"Amount in cents: {amount_cents}")
#         new_payment_intent = stripe.PaymentIntent.capture(
#             intent_id,
#             amount_to_capture=amount_cents
#         )
#         logger.debug(f"Capture status: {new_payment_intent['status']}")
#         if new_payment_intent['status'] == 'succeeded':
#             logger.info("Final inStore payment succeeded.")
#             return {'status': 'success', 'paymentIntentId': new_payment_intent.id}
#         else:
#             error_msg = f"Failed to finalize payment for inStore customer. Status: {new_payment_intent['status']}"
#             logger.error(error_msg)
#             return {'status': 'error',
#                     'message': f"Failed to finalize the amount on card. Status: {new_payment_intent['status']}"}
#     except Exception as e:
#         error_msg = f"Error during inStore final capture payment for customer: {str(e)}"
#         logger.exception(error_msg)
#         return {'status': 'error', 'message': f"Error capturing payment: {str(e)}"}
def capture_store_final_payment(intent_id, price, customer_id=None, description=None):
    logger.debug(f"capture_store_final_payment called with intent_id: {intent_id}, price: {price}")

    try:
        amount_cents = int(round(Decimal(price) * 100))
        logger.debug(f"Amount in cents: {amount_cents}")

        # Retrieve the original PaymentIntent
        intent = stripe.PaymentIntent.retrieve(intent_id)
        logger.debug(f"Retrieved intent status: {intent.status}")

        if intent.status == 'succeeded':
            logger.info("Payment already captured.")
            return {'status': 'success', 'paymentIntentId': intent.id}

        elif intent.status == 'requires_capture':
            logger.info("Attempting to capture held funds.")
            captured_intent = stripe.PaymentIntent.capture(
                intent_id,
                amount_to_capture=amount_cents
            )

            if captured_intent.status == 'succeeded':
                logger.info("Successfully captured previously authorized funds.")
                return {
                    'status': 'success',
                    'paymentIntentId': captured_intent.id
                }
            else:
                logger.error(f"Capture failed. Status: {captured_intent.status}")
                return {
                    'status': 'error',
                    'message': f"Capture failed. Status: {captured_intent.status}",
                    'paymentIntentId': intent.id
                }

        else:
            # Handle expired authorization or unexpected statuses
            error_msg = (
                f"PaymentIntent status is '{intent.status}', capture not possible. "
                "This may be due to an expired authorization hold. Attempting to create new PaymentIntent."
            )
            logger.warning(error_msg)
            try:
                # the payment method ID from the original intent
                payment_method_id = intent.payment_method if hasattr(intent, 'payment_method') else None

                if not payment_method_id:
                    raise Exception("Original PaymentIntent doesn't have a payment method attached")
                new_payment_intent = stripe.PaymentIntent.create(
                    amount=amount_cents,
                    currency=intent.currency,
                    payment_method=payment_method_id,
                    idempotency_key=f"reauth-{intent.id}",
                    off_session=True,
                    confirm=True,
                    description=description or f"Reauthorization for customer {customer_id} (original intent {intent_id})",
                    metadata={
                        'original_payment_intent': intent.id,
                        'reason': 'reauthorization_due_to_expired_hold'
                    }
                )

                if new_payment_intent.status == 'succeeded':
                    logger.info("New payment succeeded after reauthorization.")
                    return {
                        'status': 'success',
                        'paymentIntentId': new_payment_intent.id,
                        'originalIntentId': intent.id
                    }
                else:
                    logger.error(f"New PaymentIntent failed. Status: {new_payment_intent.status}")
                    return {
                        'status': 'error',
                        'message': f"Reauthorization failed. Status: {new_payment_intent.status}",
                        'originalIntentId': intent.id
                    }
            except Exception as auth_error:
                error_msg = f"Failed to re-authorize payment: {str(auth_error)}"
                logger.exception(error_msg)
                return {
                    'status': 'error',
                    'message': f"Payment authorization expired and could not be re-authorized: {str(auth_error)}",
                    'originalPaymentIntentId': intent.id
                }

    except Exception as e:
        error_msg = f"Error during inStore final capture payment for customer: {str(e)}"
        logger.exception(error_msg)
        return {'status': 'error', 'message': f"Error capturing payment: {str(e)}"}


# Initiate InStore Hold Stripe Terminal Payment
# def capture_hold_terminal_payment(terminal_id, amount, payment_intent_id=None):
#     logger.debug(
#         f"capture_terminal_payment called with terminal_id: {terminal_id}, amount: {amount}, payment_intent_id: {payment_intent_id}")
#     try:
#         logger.debug("Retrieving terminal reader details...")
#         reader = stripe.terminal.Reader.retrieve(terminal_id)
#         logger.debug(f"Retrieved Reader: {reader}")
#         if reader.action and reader.action.status == 'in_progress':
#             warn_msg = f"Terminal is busy with another payment. Action status: {reader.action.status}"
#             logger.warning(warn_msg)
#             return {'status': 'error', 'message': "Terminal is currently processing another payment"}
#         if payment_intent_id is None:
#             amount_cents = int(round(Decimal(amount) * 100))
#             logger.debug(f"Converted amount in cents: {amount_cents}")
#             logger.debug("Creating new Payment Intent for terminal")
#             terminal_intent = stripe.PaymentIntent.create(
#                 currency="usd",
#                 payment_method_types=["card_present"],
#                 capture_method="manual",
#                 amount=amount_cents,
#             )
#             logger.debug(f"Payment Intent Created: {terminal_intent}")
#         else:
#             logger.debug(f"Retrieving existing Payment Intent with id: {payment_intent_id}")
#             terminal_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
#             logger.debug(f"Retrieved Payment Intent: {terminal_intent}")
#     except stripe.error.StripeError as e:
#         error_msg = f"Payment processing failed: {str(e)}"
#         logger.error(error_msg)
#         return {'status': 'error', 'message': error_msg}
#     except Exception as ex:
#         error_msg = f"Unexpected error during payment intent creation: {str(ex)}"
#         logger.error(error_msg)
#         return {'status': 'error', 'message': error_msg}
#
#     try:
#         logger.debug(f"Processing Payment Intent {terminal_intent.id} on terminal {terminal_id}...")
#         result = stripe.terminal.Reader.process_payment_intent(
#             reader=terminal_id,
#             payment_intent=terminal_intent.id
#         )
#         logger.debug(f"Reader Processing Result: {result}")
#     except stripe.error.StripeError as e:
#         error_msg = f"Reader Processing Failed: {str(e)}"
#         logger.error(error_msg)
#         try:
#             logger.debug(f"Attempting to cancel Payment Intent {terminal_intent.id} due to processing failure...")
#             stripe.PaymentIntent.cancel(terminal_intent.id)
#             logger.debug(f"Cancelled Payment Intent: {terminal_intent.id}")
#         except stripe.error.StripeError as cancel_error:
#             logger.error(f"Failed to cancel Payment Intent: {str(cancel_error)}")
#         return {'status': 'error', 'message': f"Terminal processing failed: {str(e)}"}
#     except Exception as ex:
#         error_msg = f"Unexpected error during reader processing: {str(ex)}"
#         logger.error(error_msg)
#         return {'status': 'error', 'message': error_msg}
#
#     logger.info("Terminal payment processing completed successfully.")
#     return {'status': 'success', 'paymentIntentId': terminal_intent.id}
def capture_hold_terminal_payment(terminal_id, amount, payment_intent_id=None, customer_id=None,
                                  customer_payment_id=None, save_card=False, laundry_id=None):
    logger.debug(
        f"capture_terminal_payment called with terminal_id: {terminal_id}, amount: {amount}, "
        f"payment_intent_id: {payment_intent_id}, customer_payment_id: {customer_payment_id}"
    )
    try:
        logger.debug("Retrieving terminal reader details...")
        reader = stripe.terminal.Reader.retrieve(terminal_id)
        logger.debug(f"Retrieved Reader: {reader}")
        intent_description = f"In-store | Customer ID: {customer_id} | Laundry ID: {laundry_id}"
        if reader.action and reader.action.status == 'in_progress':
            warn_msg = f"Terminal is busy with another payment. Action status: {reader.action.status}"
            logger.warning(warn_msg)
            return {'status': 'error', 'message': "Terminal is currently processing another payment"}

        if payment_intent_id is None:
            amount_cents = int(round(Decimal(amount) * 100))
            logger.debug(f"Converted amount in cents: {amount_cents}")
            logger.debug("Creating new Payment Intent for terminal")

            # Step 1: Create Stripe customer if required
            if save_card and not customer_payment_id and customer_id:
                cust = _get_customer(customer_id)
                if not cust:
                    return {'status': 'error', 'message': f"No customer found with ID {customer_id}"}
                full_name = f"{cust['first_name']} {cust['last_name']}"
                stripe_customer = stripe.Customer.create(
                    name=full_name, email=cust['email'], phone=cust['phone_number'])
                customer_payment_id = stripe_customer.id
                if laundry_id:
                    _save_stripe_customer(customer_id, laundry_id, customer_payment_id)
                logger.info("New Stripe customer created and saved to DB.")

            intent_params = {
                'currency': "usd",
                'payment_method_types': ["card_present"],
                'capture_method': "manual",
                'amount': amount_cents,
                'description': intent_description
            }
            if save_card and customer_payment_id:
                intent_params['customer'] = customer_payment_id

            terminal_intent = stripe.PaymentIntent.create(**intent_params)
            logger.debug(f"Payment Intent Created: {terminal_intent}")
        else:
            logger.debug(f"Retrieving existing Payment Intent with id: {payment_intent_id}")
            terminal_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            logger.debug(f"Retrieved Payment Intent: {terminal_intent}")
    except stripe.error.StripeError as e:
        logger.error(f"Payment processing failed: {str(e)}")
        return {'status': 'error', 'message': str(e)}
    except Exception as ex:
        logger.error(f"Unexpected error during payment intent creation: {str(ex)}")
        return {'status': 'error', 'message': str(ex)}

    try:
        logger.debug(f"Processing Payment Intent {terminal_intent.id} on terminal {terminal_id}...")
        result = stripe.terminal.Reader.process_payment_intent(
            reader=terminal_id,
            payment_intent=terminal_intent.id
        )
        logger.debug(f"Reader Processing Result: {result}")
    except stripe.error.StripeError as e:
        logger.error(f"Reader Processing Failed: {str(e)}")
        try:
            stripe.PaymentIntent.cancel(terminal_intent.id)
            logger.debug(f"Cancelled Payment Intent: {terminal_intent.id}")
        except stripe.error.StripeError as cancel_error:
            logger.error(f"Failed to cancel Payment Intent: {str(cancel_error)}")
        return {'status': 'error', 'message': f"Terminal processing failed: {str(e)}"}
    except Exception as ex:
        logger.error(f"Unexpected error during reader processing: {str(ex)}")
        return {'status': 'error', 'message': str(ex)}

    logger.info("Terminal payment processing completed successfully.")
    return {
        'status': 'success',
        'paymentIntentId': terminal_intent.id,
        'customerPaymentId': customer_payment_id
    }



# Get the InStore Hold Terminal Payment Status
def get_hold_payment_status(payment_intent_id, terminal_id, last_run=False, customer_payment_id=None, save_card=False):
    if isinstance(last_run, str):
        last_run = last_run.lower() == 'true'
    logger.debug(
        f"get_payment_status called with payment_intent_id: {payment_intent_id}, terminal_id: {terminal_id}, last_run: {last_run}"
    )
    try:
        if not payment_intent_id:
            error_msg = "paymentIntentId is required"
            logger.error(error_msg)
            return {'status': 'error', 'reInitiate': True, 'message': error_msg}
        logger.debug("Retrieving Payment Intent...")
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        logger.debug(f"Payment Intent retrieved with status: {payment_intent.status}")
        status = payment_intent.status

        if status == 'requires_capture':
            logger.info("Payment Intent requires capture. Payment successful.")
            return {'status': 'success', 'reInitiate': False, 'paymentIntentId': payment_intent.id}

        elif status == 'requires_action':
            logger.warning("Payment Intent requires additional authentication. Initiating cancellation...")
            try:
                stripe.PaymentIntent.cancel(payment_intent.id)
                logger.debug("Payment Intent cancelled due to requires_action.")
                stripe.terminal.Reader.cancel_action(terminal_id)
                logger.debug("Terminal reader action cancelled due to requires_action.")
                return {'status': 'error', 'reInitiate': True, 'message': "Payment requires additional authentication"}
            except stripe.error.StripeError as e:
                error_msg = f"Error during cancellation in requires_action: {str(e)}"
                logger.error(error_msg)
                return {'status': 'error', 'reInitiate': True, 'message': error_msg}

        elif status == 'succeeded':
            logger.info("Payment already succeeded.")
            return {'status': 'success', 'reInitiate': False, 'paymentIntentId': payment_intent.id}

        elif status == 'canceled':
            logger.info("Payment was canceled.")
            stripe.terminal.Reader.cancel_action(terminal_id)
            return {'status': 'error', 'reInitiate': True, 'paymentIntentId': payment_intent.id}

        # Handle card declined scenario
        elif status == 'requires_payment_method':
            if last_run:
                # Final run: if there's an error, reinitiate; if not, signal no reinitiation.
                if payment_intent.last_payment_error:
                    error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
                    logger.error(error_msg)
                    try:
                        stripe.PaymentIntent.cancel(payment_intent.id)
                        logger.debug("Payment Intent cancelled due to failed payment attempt.")
                        stripe.terminal.Reader.cancel_action(terminal_id)
                        logger.debug("Terminal reader action cancelled due to failed payment.")
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                    except stripe.error.StripeError as e:
                        error_msg = f"Error during cancellation after declined payment: {str(e)}"
                        logger.error(error_msg)
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                else:
                    # No error present at final run: instruct frontend not to reinitiate with existing intent.
                    error_msg = "Payment failed: Customer input required, please provide a new payment method."
                    logger.error(error_msg)
                    stripe.terminal.Reader.cancel_action(terminal_id)
                    logger.debug("Terminal reader action cancelled due to failed payment.")
                    return {'status': 'error', 'reInitiate': False, 'message': error_msg,
                            'paymentIntentId': payment_intent.id}
            else:
                # Not final run: if error exists, cancel and reinitiate; if not, simply wait.
                if payment_intent.last_payment_error:
                    error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
                    logger.error(error_msg)
                    try:
                        stripe.PaymentIntent.cancel(payment_intent.id)
                        logger.debug("Payment Intent cancelled due to failed payment attempt.")
                        stripe.terminal.Reader.cancel_action(terminal_id)
                        logger.debug("Terminal reader action cancelled due to failed payment.")
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                    except stripe.error.StripeError as e:
                        error_msg = f"Error during cancellation after declined payment: {str(e)}"
                        logger.error(error_msg)
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                else:
                    info_msg = "Waiting for Customer Input"
                    logger.info(info_msg)
                    return {
                        'status': 'pending',
                        'payment_status': payment_intent.status,
                        'paymentIntentId': payment_intent.id,
                        'reInitiate': False
                    }

        # Handle final cancellation on last polling attempt
        if last_run:
            logger.debug("Last run triggered. Attempting final cancellation of Payment Intent and reader action...")
            try:
                stripe.terminal.Reader.cancel_action(terminal_id)
                logger.debug(f"Final cancellation of Terminal reader action for {terminal_id} succeeded.")
                return {'status': 'cancelled', 'reInitiate': False, 'message': "Payment timed out - cancelled"}
            except stripe.error.StripeError as e:
                error_msg = f"Final cancellation failed: {str(e)}"
                logger.error(error_msg)
                return {'status': 'error', 'message': error_msg}

        # Default case for pending statuses
        logger.debug(f"Payment Intent status is pending: {payment_intent.status}. Continuing to poll...")
        return {
            'status': 'pending',
            'payment_status': payment_intent.status,
            'paymentIntentId': payment_intent.id
        }

    except Exception as e:
        error_msg = f"Exception in get_payment_status: {str(e)}"
        logger.exception(error_msg)
        try:
            stripe.terminal.Reader.cancel_action(terminal_id)
            logger.debug(f"Final cancellation of Terminal reader action for {terminal_id} succeeded.")
        except Exception as cancel_exception:
            logger.error(f"Exception during final cancellation: {cancel_exception}")
        return {'status': 'error', 'reInitiate': True, 'message': error_msg}


# Initiate InStore Immediate Stripe Terminal Payment Status
# Get the InStore Hold Terminal Payment Status
# def get_hold_payment_status(payment_intent_id, terminal_id, last_run=False, customer_payment_id=None, save_card=False):
#     if isinstance(last_run, str):
#         last_run = last_run.lower() == 'true'
#     logger.debug(
#         f"get_payment_status called with payment_intent_id: {payment_intent_id}, terminal_id: {terminal_id}, last_run: {last_run}, customer_payment_id: {customer_payment_id}"
#     )
#     try:
#         if not payment_intent_id:
#             logger.error("paymentIntentId is required")
#             return {'status': 'error', 'reInitiate': True, 'message': "paymentIntentId is required"}
#
#         payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
#         status = payment_intent.status
#         logger.debug(f"Payment Intent status: {status}")
#
#         if status in ['requires_capture', 'succeeded']:
#             card_details = None
#             if save_card and customer_payment_id:
#                 payment_method_id = payment_intent.payment_method or (
#                     payment_intent.charges.data[0].payment_method if payment_intent.charges.data else None
#                 )
#                 if payment_method_id:
#                     try:
#                         logger.info(f"Checking if card {payment_method_id} is already attached to customer {customer_payment_id}")
#                         methods = stripe.PaymentMethod.list(customer=customer_payment_id, type="card")['data']
#                         new_method = stripe.PaymentMethod.retrieve(payment_method_id)
#
#                         # Safely extract card_present details
#                         card_details = {}
#                         if hasattr(new_method, 'card_present') and new_method.card_present:
#                             card_details = {
#                                 'card_last4': getattr(new_method.card_present, 'last4', ''),
#                                 'card_brand': getattr(new_method.card_present, 'brand', '')
#                             }
#                         else:
#                             logger.warning(f"No card_present details found on payment method {payment_method_id}")
#
#                         new_fingerprint = getattr(getattr(new_method, 'card_present', None), 'fingerprint', None)
#                         if not new_fingerprint:
#                             logger.warning(f"Cannot find fingerprint on new card_present {payment_method_id}")
#                         else:
#                             existing_fingerprints = {
#                                 pm.card.fingerprint
#                                 for pm in methods
#                                 if hasattr(pm, 'card') and pm.card and hasattr(pm.card, 'fingerprint')
#                             }
#
#                             if new_fingerprint not in existing_fingerprints:
#                                 stripe.PaymentMethod.attach(payment_method_id, customer=customer_payment_id)
#                                 stripe.Customer.modify(
#                                     customer_payment_id,
#                                     invoice_settings={'default_payment_method': payment_method_id}
#                                 )
#                                 logger.info("Card successfully attached to existing Stripe customer.")
#                             else:
#                                 logger.info("Card already exists on customer. Skipping attachment.")
#                     except Exception as e:
#                         logger.exception(f"Error while checking/saving card to customer: {str(e)}")
#
#                     response = {
#                         'status': 'success',
#                         'reInitiate': False,
#                         'paymentIntentId': payment_intent.id
#                     }
#                     # if card_details:
#                     #     response.update(card_details)
#                     return response
#
#         elif status == 'requires_action':
#             logger.warning('Payment Intent requires additional authentication. Initiating cancellation...')
#             error_msg = 'Payment Cancelled, requires additional authentication.'
#             try:
#                 stripe.PaymentIntent.cancel(payment_intent.id)
#                 logger.debug("Payment Intent cancelled due to requires_action.")
#                 stripe.terminal.Reader.cancel_action(terminal_id)
#                 logger.debug("Terminal reader action cancelled due to requires_action.")
#             except stripe.error.StripeError as e:
#                 error_msg = f"Error during cancellation in requires_action: {str(e)}"
#                 logger.error(error_msg)
#             return {'status': 'error', 'reInitiate': True, 'message': error_msg}
#
#         elif status == 'canceled':
#             logger.info("Payment was canceled.")
#             stripe.terminal.Reader.cancel_action(terminal_id)
#             return {'status': 'error', 'reInitiate': True, 'paymentIntentId': payment_intent.id}
#
#         # Handle card declined scenario
#         elif status == 'requires_payment_method':
#             if last_run:
#                 # Final run: if there's an error, reinitiate; if not, signal no reinitiation.
#                 if payment_intent.last_payment_error:
#                     error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
#                     logger.error(error_msg)
#                     try:
#                         stripe.PaymentIntent.cancel(payment_intent.id)
#                         logger.debug("Payment Intent cancelled due to failed payment attempt.")
#                         stripe.terminal.Reader.cancel_action(terminal_id)
#                         logger.debug("Terminal reader action cancelled due to failed payment.")
#                         return {'status': 'error', 'reInitiate': True, 'message': error_msg,
#                                 'paymentIntentId': payment_intent.id}
#                     except stripe.error.StripeError as e:
#                         error_msg = f"Error during cancellation after declined payment: {str(e)}"
#                         logger.error(error_msg)
#                         return {'status': 'error', 'reInitiate': True, 'message': error_msg,
#                                 'paymentIntentId': payment_intent.id}
#                 else:
#                     # No error present at final run: instruct frontend not to reinitiate with existing intent.
#                     error_msg = "Payment failed: Customer input required, please provide a new payment method."
#                     logger.error(error_msg)
#                     stripe.terminal.Reader.cancel_action(terminal_id)
#                     logger.debug("Terminal reader action cancelled due to failed payment.")
#                     return {'status': 'error', 'reInitiate': False, 'message': error_msg,
#                             'paymentIntentId': payment_intent.id}
#             else:
#                 # Not final run: if error exists, cancel and reinitiate; if not, simply wait.
#                 if payment_intent.last_payment_error:
#                     error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
#                     logger.error(error_msg)
#                     try:
#                         stripe.PaymentIntent.cancel(payment_intent.id)
#                         logger.debug("Payment Intent cancelled due to failed payment attempt.")
#                         stripe.terminal.Reader.cancel_action(terminal_id)
#                         logger.debug("Terminal reader action cancelled due to failed payment.")
#                         return {'status': 'error', 'reInitiate': True, 'message': error_msg,
#                                 'paymentIntentId': payment_intent.id}
#                     except stripe.error.StripeError as e:
#                         error_msg = f"Error during cancellation after declined payment: {str(e)}"
#                         logger.error(error_msg)
#                         return {'status': 'error', 'reInitiate': True, 'message': error_msg,
#                                 'paymentIntentId': payment_intent.id}
#                 else:
#                     info_msg = "Waiting for Customer Input"
#                     logger.info(info_msg)
#                     return {
#                         'status': 'pending',
#                         'payment_status': payment_intent.status,
#                         'paymentIntentId': payment_intent.id,
#                         'reInitiate': False
#                     }
#
#         # Handle final cancellation on last polling attempt
#         if last_run:
#             logger.debug("Last run triggered. Attempting final cancellation of Payment Intent and reader action...")
#             try:
#                 stripe.terminal.Reader.cancel_action(terminal_id)
#                 logger.debug(f"Final cancellation of Terminal reader action for {terminal_id} succeeded.")
#                 return {'status': 'cancelled', 'reInitiate': False, 'message': "Payment timed out - cancelled"}
#             except stripe.error.StripeError as e:
#                 error_msg = f"Final cancellation failed: {str(e)}"
#                 logger.error(error_msg)
#                 return {'status': 'error', 'message': error_msg}
#
#         # Default case for pending statuses
#         logger.debug(f"Payment Intent status is pending: {payment_intent.status}. Continuing to poll...")
#         return {
#             'status': 'pending',
#             'payment_status': payment_intent.status,
#             'paymentIntentId': payment_intent.id
#         }
#
#     except Exception as e:
#         error_msg = f"Exception in get_payment_status: {str(e)}"
#         logger.exception(error_msg)
#         try:
#             stripe.terminal.Reader.cancel_action(terminal_id)
#             logger.debug(f"Final cancellation of Terminal reader action for {terminal_id} succeeded.")
#         except Exception as cancel_exception:
#             logger.error(f"Exception during final cancellation: {cancel_exception}")
#         return {'status': 'error', 'reInitiate': True, 'message': error_msg}


# Initiate InStore Immediate Stripe Terminal Payment Status
def capture_direct_terminal_payment(terminal_id, amount, payment_intent_id=None):
    """
    Initiates a direct capture payment on a Stripe Terminal (no hold, immediate capture)
    Args:
        terminal_id: ID of the Stripe Terminal reader
        amount: Payment amount in dollars
        payment_intent_id: Optional existing payment intent ID
    Returns:
        Dictionary with status and payment intent details
    """
    logger.debug(
        f"capture_direct_terminal_payment called with terminal_id: {terminal_id}, amount: {amount}, payment_intent_id: {payment_intent_id}")

    try:
        logger.debug("Retrieving terminal reader details...")
        reader = stripe.terminal.Reader.retrieve(terminal_id)
        logger.debug(f"Retrieved Reader: {reader}")

        if reader.action and reader.action.status == 'in_progress':
            warn_msg = f"Terminal is busy with another payment. Action status: {reader.action.status}"
            logger.warning(warn_msg)
            return {'status': 'error', 'message': "Terminal is currently processing another payment"}

        if payment_intent_id is None:
            amount_cents = int(round(Decimal(amount) * 100))
            logger.debug(f"Converted amount in cents: {amount_cents}")

            logger.debug("Creating new Payment Intent for direct capture")
            terminal_intent = stripe.PaymentIntent.create(
                currency="usd",
                payment_method_types=["card_present"],
                capture_method="automatic",  # This ensures direct capture
                amount=amount_cents,
            )
            logger.debug(f"Payment Intent Created: {terminal_intent}")
        else:
            logger.debug(f"Retrieving existing Payment Intent with id: {payment_intent_id}")
            terminal_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            logger.debug(f"Retrieved Payment Intent: {terminal_intent}")
            # If intent exists but wasn't captured, update to automatic capture
            if terminal_intent.capture_method == "manual":
                terminal_intent = stripe.PaymentIntent.modify(
                    terminal_intent.id,
                    capture_method="automatic"
                )
                logger.debug(f"Updated Payment Intent to automatic capture: {terminal_intent}")

    except stripe.error.StripeError as e:
        error_msg = f"Payment processing failed: {str(e)}"
        logger.error(error_msg)
        return {'status': 'error', 'message': error_msg}
    except Exception as ex:
        error_msg = f"Unexpected error during payment intent creation: {str(ex)}"
        logger.error(error_msg)
        return {'status': 'error', 'message': error_msg}

    try:
        logger.debug(f"Processing Payment Intent {terminal_intent.id} on terminal {terminal_id}...")
        result = stripe.terminal.Reader.process_payment_intent(
            reader=terminal_id,
            payment_intent=terminal_intent.id
        )
        logger.debug(f"Reader Processing Result: {result}")
    except stripe.error.StripeError as e:
        error_msg = f"Reader Processing Failed: {str(e)}"
        logger.error(error_msg)
        try:
            logger.debug(f"Attempting to cancel Payment Intent {terminal_intent.id} due to processing failure...")
            stripe.PaymentIntent.cancel(terminal_intent.id)
            logger.debug(f"Cancelled Payment Intent: {terminal_intent.id}")
        except stripe.error.StripeError as cancel_error:
            logger.error(f"Failed to cancel Payment Intent: {str(cancel_error)}")
        return {'status': 'error', 'message': f"Terminal processing failed: {str(e)}"}
    except Exception as ex:
        error_msg = f"Unexpected error during reader processing: {str(ex)}"
        logger.error(error_msg)
        return {'status': 'error', 'message': error_msg}

    logger.info("Terminal payment processing initiated for direct capture.")
    return {'status': 'success', 'paymentIntentId': terminal_intent.id}


# Get the InStore Immediate Terminal Payment Status
def get_direct_payment_status(payment_intent_id, terminal_id, last_run=False):
    """
    Checks the status of a direct capture payment
    Args:
        payment_intent_id: Stripe Payment Intent ID
        terminal_id: ID of the Stripe Terminal reader
        last_run: Boolean indicating if this is the final status check
    Returns:
        Dictionary with payment status and details
    """
    if isinstance(last_run, str):
        last_run = last_run.lower() == 'true'
    logger.debug(
        f"get_direct_payment_status called with payment_intent_id: {payment_intent_id}, terminal_id: {terminal_id}, last_run: {last_run}"
    )

    try:
        if not payment_intent_id:
            error_msg = "paymentIntentId is required"
            logger.error(error_msg)
            return {'status': 'error', 'reInitiate': True, 'message': error_msg}

        logger.debug("Retrieving Payment Intent...")
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        logger.debug(f"Payment Intent retrieved with status: {payment_intent.status}")
        status = payment_intent.status

        if status == 'succeeded':
            logger.info("Payment successfully captured.")
            return {'status': 'success', 'reInitiate': False, 'paymentIntentId': payment_intent.id}

        elif status == 'requires_action':
            logger.warning("Payment requires additional authentication. Cancelling...")
            try:
                stripe.PaymentIntent.cancel(payment_intent.id)
                logger.debug("Payment Intent cancelled due to requires_action.")
                stripe.terminal.Reader.cancel_action(terminal_id)
                logger.debug("Terminal reader action cancelled due to requires_action.")
                return {'status': 'error', 'reInitiate': True, 'message': "Payment requires additional authentication"}
            except stripe.error.StripeError as e:
                error_msg = f"Error during cancellation in requires_action: {str(e)}"
                logger.error(error_msg)
                return {'status': 'error', 'reInitiate': True, 'message': error_msg}

        elif status == 'canceled':
            logger.info("Payment was canceled.")
            stripe.terminal.Reader.cancel_action(terminal_id)
            return {'status': 'error', 'reInitiate': True, 'paymentIntentId': payment_intent.id}

        elif status == 'requires_payment_method':
            if last_run:
                # Final run: if there's an error, reinitiate; if not, signal no reinitiation.
                if payment_intent.last_payment_error:
                    error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
                    logger.error(error_msg)
                    try:
                        stripe.PaymentIntent.cancel(payment_intent.id)
                        logger.debug("Payment Intent cancelled due to failed payment attempt.")
                        stripe.terminal.Reader.cancel_action(terminal_id)
                        logger.debug("Terminal reader action cancelled due to failed payment.")
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                    except stripe.error.StripeError as e:
                        error_msg = f"Error during cancellation after declined payment: {str(e)}"
                        logger.error(error_msg)
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                else:
                    # No error present at final run: instruct frontend not to reinitiate with existing intent.
                    error_msg = "Payment failed: Customer input required, please provide a new payment method."
                    logger.error(error_msg)
                    stripe.terminal.Reader.cancel_action(terminal_id)
                    logger.debug("Terminal reader action cancelled due to failed payment.")
                    return {'status': 'error', 'reInitiate': False, 'message': error_msg,
                            'paymentIntentId': payment_intent.id}
            else:
                # Not final run: if error exists, cancel and reinitiate; if not, simply wait.
                if payment_intent.last_payment_error:
                    error_msg = f"Payment failed: {payment_intent.last_payment_error.message}"
                    logger.error(error_msg)
                    try:
                        stripe.PaymentIntent.cancel(payment_intent.id)
                        logger.debug("Payment Intent cancelled due to failed payment attempt.")
                        stripe.terminal.Reader.cancel_action(terminal_id)
                        logger.debug("Terminal reader action cancelled due to failed payment.")
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                    except stripe.error.StripeError as e:
                        error_msg = f"Error during cancellation after declined payment: {str(e)}"
                        logger.error(error_msg)
                        return {'status': 'error', 'reInitiate': True, 'message': error_msg,
                                'paymentIntentId': payment_intent.id}
                else:
                    info_msg = "Waiting for Customer Input"
                    logger.info(info_msg)
                    return {
                        'status': 'pending',
                        'payment_status': payment_intent.status,
                        'paymentIntentId': payment_intent.id,
                        'reInitiate': False
                    }

        # Handle processing status
        elif status in ['processing', 'requires_capture']:
            if last_run:
                logger.warning("Payment still processing on final check - waiting for webhook")
                stripe.PaymentIntent.cancel(payment_intent.id)
                stripe.terminal.Reader.cancel_action(terminal_id)
                return {
                    'status': 'error',
                    'payment_status': payment_intent.status,
                    'paymentIntentId': payment_intent.id,
                    'reInitiate': True
                }
            else:
                logger.info("Payment still processing - continuing to poll...")
                return {
                    'status': 'pending',
                    'payment_status': payment_intent.status,
                    'paymentIntentId': payment_intent.id,
                    'reInitiate': False
                }

        # Default case for unexpected statuses
        error_msg = f"Unexpected payment status: {status}"
        logger.error(error_msg)
        stripe.terminal.Reader.cancel_action(terminal_id)
        return {'status': 'error', 'reInitiate': True, 'message': error_msg}

    except Exception as e:
        error_msg = f"Exception in get_direct_payment_status: {str(e)}"
        logger.exception(error_msg)
        try:
            stripe.terminal.Reader.cancel_action(terminal_id)
            logger.debug(f"Final cancellation of Terminal reader action for {terminal_id} succeeded.")
        except Exception as cancel_exception:
            logger.error(f"Exception during final cancellation: {cancel_exception}")
        return {'status': 'error', 'reInitiate': True, 'message': error_msg}


def test_terminal(terminal_id):
    try:
        presented_result = stripe.terminal.Reader.TestHelpers.present_payment_method(
            terminal_id,
            type="card_present",
            card_present={
                "number": "5555555555554444"  # success test card
            }
        )
        return presented_result
    except Exception as e:
        print(str(e))


def cancel_terminal_intent(terminal_id):
    logger.debug(f"cancel_terminal_intent called with terminal_id: {terminal_id}")
    try:
        stripe.terminal.Reader.cancel_action(terminal_id)
        logger.info(f"Terminal intent cancellation succeeded for terminal_id: {terminal_id}")
    except Exception as e:
        error_msg = f"Error cancelling terminal intent for terminal_id {terminal_id}: {str(e)}"
        logger.exception(error_msg)
