import stripe
import boto3
from decimal import Decimal
import json
from datetime import datetime
from notifications import invoke_notification_lambda

dynamodb = boto3.resource('dynamodb')
customer_table = dynamodb.Table('Customer')
orders_table = dynamodb.Table('LaundryOrders')
laundry_shop_info_table = dynamodb.Table('LaundryShopInfo')
lambda_client = boto3.client('lambda')


# Get the Stripe key from the database
def get_stripe_key(laundry_id):
    """
    Retrieve the Stripe private key for a given laundry_id.
    """
    try:
        response = laundry_shop_info_table.get_item(Key={'laundryId': laundry_id})
        item = response.get('Item')
        if not item or 'stripePrivateKey' not in item:
            raise ValueError(f"No stripePrivateKey found for laundryId {laundry_id}")
        return item['stripePrivateKey']
    except Exception as e:
        raise ValueError(f"Error retrieving stripePrivateKey for laundryId {laundry_id}: {str(e)}")


def lambda_handler(event, context):
    try:
        # Extract the query string parameters
        params = event.get('queryStringParameters', {})
        order_payment_operation = event.get('orderPaymentOperation')
        operation = params.get('operation')
        customer_id = params.get('customerId')
        laundry_id = params.get('laundryId')
        customer_payment_id = params.get('customerPaymentId')
        customer_payment_method = params.get('customerPaymentMethod')
        # check if order_payment_operation is set (for createHold, capturePayment and cancelHold)
        # Triggered from orderService Lambda function
        if order_payment_operation:
            print(f"Handling order_payment_operation: {order_payment_operation} and event is {event}")
            # Fetch the Stripe key dynamically based on laundryId
            laundry_id = event.get('laundryId')
            if not laundry_id:
                return {'status': 'error', 'message': 'Missing laundryId to process payment'}

            try:
                stripe.api_key = get_stripe_key(laundry_id)
            except ValueError as e:
                return {'status': 'error', 'message': str(e)}
            # Operation to Place a 1 dollar hold on card for online customers
            if order_payment_operation == 'createHold':
                order_price = event.get('amount')
                order_description = event.get('description')
                stripe_customer_payment_id = event.get('customerPaymentId')
                # If parameters are not present, then throw the error
                if not order_price or not order_description or not stripe_customer_payment_id:
                    return {'status': 'error', 'message': 'Missing required parameters to create payment hold'}
                return create_hold(customer_payment_id=stripe_customer_payment_id, amount=order_price,
                                   description=order_description)
            # Operation that will remove the hold on the card and then charge the customer based on the default card
            elif order_payment_operation == 'capturePayment':
                order_id = event.get('orderId')
                order_price = event.get('amount')
                order_description = event.get('description')
                stripe_customer_payment_id = event.get('customerPaymentId')
                customer_id = event.get('customerId',None)
                # If parameters are not present, then throw the error
                # if not order_price or not order_description or not stripe_customer_payment_id or not order_id:
                if not all([order_id, order_price, order_description, stripe_customer_payment_id]):
                    return {'status': 'error', 'message': 'Missing required parameters to charge customer'}
                # If the order_id is not valid, then throw the error
                response = orders_table.get_item(Key={'orderId': order_id})
                order_data = response.get('Item')
                if not order_data:
                    print(f"Order {order_id} not found in the database.")
                    return {'status': 'error', 'message': f"Order {order_id} not found"}
                return capture_payment(customer_payment_id=stripe_customer_payment_id, price=order_price,
                                       order_id=order_id, description=order_description, customer_id=customer_id,
                                       laundry_id=laundry_id)
            # Operation for InStore orders to place hold on the order total in ReceivedAtFacility Status
            elif order_payment_operation == 'captureStorePayment':
                stripe_card_payment_id = event.get('cardPaymentId')
                order_price = event.get('amount')
                order_id = event.get('orderId',None)
                customer_id = event.get('customerId',None)
                # If parameters are not present, then throw the error
                # if not order_price or not stripe_card_payment_id :
                if not all([order_price, stripe_card_payment_id]):
                    return {'status': 'error', 'message': 'Missing required parameters to charge Store customer'}

                return capture_store_payment(card_payment_id=stripe_card_payment_id, price=order_price,
                                             order_id=order_id, customer_id=customer_id, laundry_id=laundry_id)
            # For InStore Orders that will finalize the amount after the state is ProcessingCompleted
            elif order_payment_operation == 'captureFinalStorePayment':
                final_payment_id = event.get('stripePaymentIntentId')
                order_final_price = event.get('amount')
                # If parameters are not present, then throw the error
                # if not order_price or not stripe_card_payment_id :
                if not all([order_final_price, final_payment_id]):
                    return {'status': 'error', 'message': 'Missing required parameters to charge Final Store customer'}
                return capture_store_final_payment(intent_id=final_payment_id, price=order_final_price)
            # Operation that will either finalize, or remove partial amount
            # and finalize the amount placed on the hold for InStore Orders
            elif order_payment_operation == 'holdStorePayment':
                stripe_card_payment_id = event.get('cardPaymentId')
                order_price = event.get('amount')
                order_description = event.get('description')
                # If parameters are not present, then throw the error
                # if not order_price or not stripe_card_payment_id :
                if not all([order_price, stripe_card_payment_id]):
                    return {'status': 'error', 'message': 'Missing required parameters to charge Store customer'}
                return create_inStore_hold(stripe_card_payment_id, order_price, order_description)
            elif order_payment_operation == 'cancelHold':
                stripe_customer_payment_intent_id = event.get('paymentIntentId')
                if not stripe_customer_payment_intent_id:
                    return {'status': 'error', 'message': 'Missing required parameters to cancel customer hold'}
                return cancel_intent(intent_id=stripe_customer_payment_intent_id)
            elif order_payment_operation == 'refundPayment':
                payment_intent_id = event.get('paymentIntentId')
                order_refund_amount = event.get('amount')  # Amount in dollars
                refund_description = event.get('description')
                if not payment_intent_id:
                    return {'status': 'error', 'message': 'Missing required parameters to initiate a refund'}

                # Call the refund function
                return refund_payment(payment_intent_id=payment_intent_id, amount=order_refund_amount,
                                      description=refund_description)
            elif order_payment_operation == 'test':
                capture_terminal_content()
                return None

            else:
                return {'status': 'error', 'message': 'Unsupported order payment operation'}

        if not operation:
            return {'status': 'error', 'message': 'Missing operation'}
        print(f"Handling operation: {operation}")

        # Fetch the Stripe key dynamically based on laundryId
        if not laundry_id:
            return {'status': 'error', 'message': 'Missing laundryId to process payment'}

        try:
            stripe.api_key = get_stripe_key(laundry_id)
        except ValueError as e:
            return {'status': 'error', 'message': str(e)}

        if operation == 'saveCardDetails':
            if not customer_id:
                return {'status': 'error', 'message': 'Missing customerId'}
            return save_card_details(customer_id, customer_payment_id, customer_payment_method, laundry_id)

        elif operation == 'getCardDetails':
            if not customer_payment_id:
                return {'status': 'error', 'message': 'Missing customerPaymentId'}
            return get_card_details(customer_payment_id)
        elif operation == 'deleteCardDetails':
            if not customer_payment_method:
                return {'status': 'error', 'message': 'Missing customerPaymentMethod'}
            return delete_card_details(customer_payment_method)
        else:
            return {'status': 'error', 'message': 'Unsupported operation'}

    except Exception as e:
        return {'status': 'error', 'message': f"An unexpected error occurred: {str(e)}"}


# Save the card details in the stripe and the database
def save_card_details(customer_id, customer_payment_id, payment_method_id, laundry_id):
    try:
        print(
            f"Starting save_card_details for customer_id: {customer_id}, customer_payment_id: {customer_payment_id}, payment_method_id: {payment_method_id}")

        # Check if customer_payment_id exists
        if customer_payment_id:
            try:
                print(f"Attempting to retrieve customer with customer_payment_id: {customer_payment_id}")

                # Try retrieving the customer to check if valid
                customer = stripe.Customer.retrieve(customer_payment_id)
                print(f"Customer retrieved: {customer}")

                # If the customer is deleted, handle this as a null customer_payment_id
                if customer.get('deleted', False):
                    print(f"Customer with id {customer_payment_id} is deleted.")
                    customer_payment_id = None

            except stripe.error.StripeError as e:
                print(f"Error retrieving customer with customer_payment_id: {customer_payment_id}, Error: {e}")
                return {
                    "status": 'error', "error": "Invalid customer payment ID"
                }

            # If customer_payment_id is still valid (not deleted), proceed with attaching the payment method
            if customer_payment_id:
                print(f"Attaching payment method {payment_method_id} to customer {customer_payment_id}")

                # Attach the payment method to the existing customer
                stripe.PaymentMethod.attach(
                    payment_method_id,
                    customer=customer_payment_id  # Attach the payment method to this customer
                )

                # Update default payment method in customer invoice settings
                print(f"Setting default payment method {payment_method_id} for customer {customer_payment_id}")
                stripe.Customer.modify(customer_payment_id,
                                       invoice_settings={'default_payment_method': payment_method_id})

                print(
                    f"Successfully updated customer {customer_payment_id} with new payment method {payment_method_id}")
                return {
                    "status": 'success', "customerPaymentId": customer_payment_id
                }

        # If customer_payment_id is null or the customer was deleted, create a new customer
        if not customer_payment_id:
            print(
                f"Customer payment ID is null or customer was deleted. Creating a new customer for customer_id: {customer_id}")
            # Retrieve customer details from DynamoDB
            customer_data = customer_table.get_item(Key={'customerId': customer_id}).get('Item')
            if not customer_data:
                print(f"No customer data found for customer_id {customer_id}")
                return {"status": "error", "message": "Customer not found in database"}

            # Extract phone, email, and name details
            phone = customer_data.get('phone')
            email = customer_data.get('email')
            first_name = customer_data.get('firstName')
            last_name = customer_data.get('lastName')
            full_name = f"{first_name} {last_name}"
            # Create a new customer if no valid customer_payment_id exists
            customer = stripe.Customer.create(
                name=full_name,
                email=email,
                phone=phone
            )

            print(f"New customer created with id: {customer.id}")
            new_customer_payment_id = customer.id
            # Attach the new payment method to the new customer
            print(f"Attaching new payment method {payment_method_id} to new customer {new_customer_payment_id}")
            stripe.PaymentMethod.attach(
                payment_method_id,
                customer=new_customer_payment_id  # Attach the payment method to this customer
            )
            # Set the payment method as the default payment method for invoices
            print(f"Setting default payment method {payment_method_id} for new customer {new_customer_payment_id}")
            stripe.Customer.modify(new_customer_payment_id,
                                   invoice_settings={
                                       'default_payment_method': payment_method_id,
                                   },
                                   )

            # Save new_customer_payment_id in the 'Customer' DynamoDB table
            print(
                f"Saving new_customer_payment_id {new_customer_payment_id} for laundry_id {laundry_id} in DynamoDB for customer_id {customer_id}")
            customer_table.update_item(
                Key={
                    'customerId': customer_id
                },
                # UpdateExpression='SET customerPaymentId = :payment_id',
                UpdateExpression='SET customerPaymentId.#laundry_id = :payment_id',
                ExpressionAttributeNames={'#laundry_id': laundry_id},  # Allows using dynamic attribute name
                ExpressionAttributeValues={
                    ':payment_id': new_customer_payment_id
                }
            )

            # Return the created new_customer_payment_id
            print(
                f"Successfully created and saved new customer_payment_id {new_customer_payment_id} for customer_id {customer_id}")
            return {
                "status": 'success', "customerPaymentId": new_customer_payment_id
            }

    except Exception as e:
        print(f"An error occurred while saving card details for customer_id: {customer_id}. Error: {str(e)}")
        return {
            "status": 'error', "error": str(e)
        }


# Get the Card Details from the stripe
def get_card_details(stripe_customer_id):
    try:
        # Retrieve the Stripe customer to get the default payment method ID
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')

        # Retrieve the list of payment methods for the customer
        payment_methods = stripe.PaymentMethod.list(
            customer=stripe_customer_id,
            type='card'
        )['data']

        # Mark each payment method with 'is_default' flag
        for method in payment_methods:
            method['is_default'] = (method['id'] == default_payment_method_id)

        return {
            'status': 'success',
            'paymentMethods': payment_methods
        }

    except Exception as e:
        print(f"Error fetching card details: {e}")
        return {
            'status': 'error',
            'message': f"An error occurred: {str(e)}"
        }


# Update the Existing card details in the stripe
def delete_card_details(payment_method_id):
    try:
        print(f"Attempting to delete payment method {payment_method_id}")

        # Detach the payment method
        stripe.PaymentMethod.detach(payment_method_id)

        print(f"Successfully detached payment method {payment_method_id}")
        return {
            'status': 'success',
            'message': f'Payment method {payment_method_id} has been deleted'
        }

    except stripe.error.StripeError as e:
        print(f"Stripe error occurred: {e}")
        return {
            'status': 'error',
            'message': f"Stripe error occurred: {str(e)}"
        }

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return {
            'status': 'error',
            'message': f"An error occurred: {str(e)}"
        }


# Create a temporary hold on the customer's card and amount in dollars
def create_hold(customer_payment_id, amount, description):
    # Initialize payment_intent to None
    payment_intent = None
    try:
        print(f"Starting to create a hold for customer_payment_id: {customer_payment_id}, amount: {amount}, "
              f"description: {description}")

        # Retrieve the Stripe customer to get the default payment method ID
        customer = stripe.Customer.retrieve(customer_payment_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')

        if not default_payment_method_id:
            print(f"No default payment method found for customer {customer_payment_id}")
            return {'status': 'error', 'message': 'No default payment method found'}

        print(f"Default payment method for customer {customer_payment_id}: {default_payment_method_id}")
        print(int(round(Decimal(amount) * 100)))
        # Create a payment intent with a manual capture
        payment_intent = stripe.PaymentIntent.create(
            amount=int(round(Decimal(amount) * 100)),  # Convert dollars to cents
            currency='usd',
            customer=customer_payment_id,
            description=description,
            payment_method=default_payment_method_id,
            payment_method_types=["card"],
            capture_method='manual',  # Set capture method to manual for holding
            confirmation_method='manual'  # Manually confirm the intent
        )

        # Now confirm the PaymentIntent with the provided payment method
        confirmed_intent = stripe.PaymentIntent.confirm(
            payment_intent.id,
            payment_method=default_payment_method_id
        )

        # Check the status of the confirmed PaymentIntent
        if confirmed_intent['status'] == 'requires_capture':
            print(
                f"Payment intent created successfully for customer {customer_payment_id}, paymentIntentId: {confirmed_intent.id}")
            return {'status': 'success', 'paymentIntentId': confirmed_intent.id}
        elif confirmed_intent['status'] == 'requires_action':
            print("Payment requires additional authentication")
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': "Requires additional confirmation"}
        else:
            # If the status is unexpected, cancel the PaymentIntent
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': f"Unexpected payment intent status: {confirmed_intent['status']}"}

    except Exception as e:
        # Cancel the PaymentIntent in case of an error if it was created
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to error.")
        print(f"Error in creating hold for customer {customer_payment_id}: {str(e)}")
        return {'status': 'error', 'message': str(e)}

# Capture payment and cancel the hold intent after the order is EnRouteToDelivery
def capture_payment(customer_payment_id, price, order_id, description, customer_id, laundry_id):
    try:
        # Retrieve the Stripe customer to get the default payment method ID
        print(f"entered the capture payment method, customer payment id:", customer_payment_id)
        print(f"price:", price)
        print(f"order_id:", order_id)
        print(f"description:", description)

        customer = stripe.Customer.retrieve(customer_payment_id)
        default_payment_method_id = customer.get('invoice_settings', {}).get('default_payment_method')

        if not default_payment_method_id:
            print(f"No default payment method found for customer {customer_payment_id}")
            return {'status': 'error', 'message': 'No default payment method found'}

        print(f"Default payment method for customer {customer_payment_id}: {default_payment_method_id}")

        # Create a new payment intent to charge the full amount directly
        print(f"Creating a new payment intent for customer {customer_payment_id}, amount {price}")
        print(f"Amount Type: {type(price)}, Value: {price}")
        print(int(round(Decimal(price) * 100)))
        new_payment_intent = stripe.PaymentIntent.create(
            amount=int(round(Decimal(price) * 100)),  # Convert dollars to cents
            currency='usd',
            customer=customer_payment_id,
            description=description,
            payment_method=default_payment_method_id,
            payment_method_types=["card"],
            confirm=True  # Directly charge the card
        )

        if new_payment_intent['status'] == 'succeeded':
            print(f"Payment succeeded for customer {customer_payment_id}. Now updating the Orders table.")

            # Fetch the previous holdPaymentIntentId from the Orders table
            response = orders_table.get_item(Key={'orderId': order_id})
            order_data = response.get('Item')

            if not order_data:
                print(f"Order {order_id} not found in the Orders table.")
                return {'status': 'error', 'message': f"Order {order_id} not found"}

            hold_payment_intent_id = order_data.get('holdPaymentIntentId')

            # Cancel the previous hold, if any
            if hold_payment_intent_id:
                cancel_intent(hold_payment_intent_id)

            # Prepare the finalPaymentIntentId structure
            final_payment_intent_entry = {
                "amount": price,
                "paymentIntentId": new_payment_intent.id,
                "paymentMethod": "Card"
            }

            # Update the Orders table with finalPaymentIntentId and paymentStatus
            print(f"Updating Orders table for orderId {order_id}.")
            orders_table.update_item(
                Key={'orderId': order_id},
                UpdateExpression="SET finalPaymentIntentId = list_append(if_not_exists(finalPaymentIntentId, :empty_list), :new_entry), paymentStatus = :status",
                ExpressionAttributeValues={
                    ":empty_list": [],
                    ":new_entry": [final_payment_intent_entry],
                    ":status": "Paid"
                }
            )

            print(f"Successfully updated order {order_id} with final payment intent and status.")

            return {
                'status': 'success',
                'paymentIntentId': new_payment_intent.id
            }

        else:
            invoke_notification_lambda(customer_id, laundry_id, order_id)

            print(
                f"Failed to charge card for customer {customer_payment_id}. Payment status: {new_payment_intent['status']}")
            return {
                'status': 'error',
                'message': f"Failed to charge card. Status: {new_payment_intent['status']}"
            }

    except Exception as e:
        print(f"Error during capture payment for customer {customer_payment_id}: {str(e)}")
        invoke_notification_lambda(customer_id, laundry_id, order_id)
        return {
            'status': 'error',
            'message': f"Error capturing payment: {str(e)}"
        }


# Capture the InStore payment for the PayNow Card option
def capture_store_payment(card_payment_id, price, order_id, customer_id, laundry_id):
    try:

        print(f"entered the inStore capture payment method")
        print(f"price:", price)
        print(int(round(Decimal(price) * 100)))

        # Create a new payment intent to charge the full amount directly
        print(f"Creating a new payment intent for inStore Card Customer, amount {price}")
        print(f"Amount Type: {type(price)}, Value: {price}")
        new_payment_intent = stripe.PaymentIntent.create(
            amount=int(round(Decimal(price) * 100)),  # Convert dollars to cents
            currency='usd',
            payment_method=card_payment_id,
            payment_method_types=["card"],
            confirm=True  # Directly charge the card
        )

        if new_payment_intent['status'] == 'succeeded':
            print(f"Payment succeeded for inStore customer.")

            return {
                'status': 'success',
                'paymentIntentId': new_payment_intent.id
            }

        else:
            invoke_notification_lambda(customer_id, laundry_id, order_id)
            print(
                f"Failed to charge card for customer. Payment status: {new_payment_intent['status']}")

            return {
                'status': 'error',
                'message': f"Failed to charge card. Status: {new_payment_intent['status']}"
            }

    except Exception as e:
        invoke_notification_lambda(customer_id, laundry_id, order_id)
        print(f"Error during inStore capture payment for customer: {str(e)}")
        return {
            'status': 'error',
            'message': f"Error capturing payment: {str(e)}"
        }


# Capture InStore Hold payment
def create_inStore_hold(card_payment_id, amount, description):
    # Initialize payment_intent to None
    payment_intent = None
    try:
        print(f"Starting to create a hold for card_payment_id: {card_payment_id}, amount: {amount}, "
              f"description: {description}")
        print(int(round(Decimal(amount) * 100)))

        # Create a payment intent with a manual capture
        payment_intent = stripe.PaymentIntent.create(
            amount=int(round(Decimal(amount) * 100)),  # Convert dollars to cents
            currency='usd',
            description=description,
            payment_method=card_payment_id,
            payment_method_types=["card"],
            capture_method='manual',  # Set capture method to manual for holding
            confirmation_method='manual'  # Manually confirm the intent
        )

        # Now confirm the PaymentIntent with the provided payment method
        confirmed_intent = stripe.PaymentIntent.confirm(
            payment_intent.id,
            payment_method=card_payment_id
        )

        # Check the status of the confirmed PaymentIntent
        if confirmed_intent['status'] == 'requires_capture':
            print(
                f"Payment intent created successfully for customer {card_payment_id}, paymentIntentId: {confirmed_intent.id}")
            return {'status': 'success', 'paymentIntentId': confirmed_intent.id}
        elif confirmed_intent['status'] == 'requires_action':
            print("Payment requires additional authentication")
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': "Requires additional confirmation"}
        else:
            # If the status is unexpected, cancel the PaymentIntent
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to unexpected status.")
            return {'status': 'error', 'message': f"Unexpected payment intent status: {confirmed_intent['status']}"}

    except Exception as e:
        # Cancel the PaymentIntent in case of an error if it was created
        if payment_intent:
            stripe.PaymentIntent.cancel(payment_intent.id)
            print(f"PaymentIntent {payment_intent.id} canceled due to error.")
        print(f"Error in creating hold for customer {card_payment_id}: {str(e)}")
        return {'status': 'error', 'message': str(e)}


# Cancel a hold payment intent
def cancel_intent(intent_id):
    try:
        print(f"Cancelling payment intent {intent_id}")
        stripe.PaymentIntent.cancel(intent_id)
        print(f"Payment intent {intent_id} canceled successfully.")
        return {'status': 'success', 'message': f"Payment intent {intent_id} canceled successfully"}
    except Exception as e:
        print(f"Error cancelling payment intent {intent_id}: {str(e)}")
        return {'status': 'error', 'message': f"Error cancelling payment intent: {str(e)}"}


# Refund money to the customer
def refund_payment(payment_intent_id, description, amount):
    # Create a refund for the specified payment intent
    try:
        refund = stripe.Refund.create(
            payment_intent=payment_intent_id,
            amount=int(round(Decimal(amount) * 100)) if amount else None,
            description=description
        )
        # Check the status of the refund
        if refund['status'] == 'succeeded':
            print(f"Refund succeeded for payment_intent_id: {payment_intent_id}")
            return {'status': 'success', 'refundId': refund.id}
        else:
            print(f"Refund failed for payment_intent_id: {payment_intent_id}, status: {refund['status']}")
            return {'status': 'error', 'message': f"Refund failed. Status: {refund['status']}"}
    except Exception as e:
        print(f"Error initiating refund for payment_intent_id {int}: {str(e)}")
        return {'status': 'error', 'message': f"Error initiating refund: {str(e)}"}


# Capture the Hold Payment for the Instore
def capture_store_final_payment(intent_id, price):
    try:

        print(f"entered the inStore final capture payment method")
        print(f"price:", price)

        # Create a new payment intent to charge the full amount directly
        print(f"Finalizing the  inStore Card Customer, amount {price}")
        print(f"Amount Type: {type(price)}, Value: {price}")
        print(int(round(Decimal(price) * 100)))
        new_payment_intent = stripe.PaymentIntent.capture(
            intent_id,
            amount_to_capture=int(round(Decimal(price) * 100))  # Convert dollars to cents

        )

        if new_payment_intent['status'] == 'succeeded':
            print(f"Payment succeeded for inStore customer.")

            return {
                'status': 'success',
                'paymentIntentId': new_payment_intent.id
            }

        else:
            print(
                f"Failed to finalize card for customer. Payment status: {new_payment_intent['status']}")
            return {
                'status': 'error',
                'message': f"Failed to finalize the amount on card. Status: {new_payment_intent['status']}"
            }

    except Exception as e:
        print(f"Error during inStore final capture payment for customer: {str(e)}")
        return {
            'status': 'error',
            'message': f"Error capturing payment: {str(e)}"
        }

def capture_terminal_content():
    transcation = stripe.PaymentIntent.create(
        currency="usd",
        payment_method_types=["card_present"],
        capture_method="manual",
        amount=4200,
    )
    print(transcation)
    # result = stripe.terminal.Reader.process_payment_intent(
    #     "tmr_FVSSg0oLraAvKP",
    #     payment_intent = transcation.id
    # )
    # print(result)
    # presented_result = stripe.terminal.Reader.TestHelpers.present_payment_method(
    #     "",
    #     type = "card_present",
    #     card_present={"number":"4242424242424242"}
    # )
    # terminal = stripe.terminal.Reader.retrieve("tmr_FVSSg0oLraAvKP")
    # print(terminal)
    # pay = stripe.PaymentIntent.retrieve('pi_3R8l1XAqKyMhuO630z9m6p25')
    # print(pay)
