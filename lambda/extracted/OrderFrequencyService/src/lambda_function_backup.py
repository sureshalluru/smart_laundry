import boto3
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
import json
from enum import Enum
import traceback
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
frequency_table = dynamodb.Table('LaundryFrequency')
orders_table = dynamodb.Table('LaundryOrders')

lambda_client = boto3.client('lambda')
UBER_LAMBDA_NAME = "UberIntegration" 

# Order Status Enum class
class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"  # Laundry Order submitted by the customer
    ORDER_PICKED_UP = "OrderPickedUp"  # Laundry Order has been picked up from the customer’s location
    READY_FOR_INTAKE = "ReadyForIntake"  # Laundry Order is ready to be processed at the facility
    RECEIVED = "ReceivedAtFacility"  # Laundry Order has been received at the processing facility
    PROCESSING_STARTED = "ProcessingStarted"  # Laundry Order Processing has started
    PROCESSING_COMPLETED = "ProcessingCompleted"  # Laundry Order Processing done
    EN_ROUTE_TO_DELIVERY = 'EnRouteToDelivery'  # Laundry on its way to Customer
    DELIVERED = "Delivered"  # Laundry Delivered to Customer
    ORDER_CANCELED = "OrderCanceled"  # Laundry Order Canceled by the Customer


# Payment Status Enum class
class PaymentStatus(Enum):
    PAYMENT_INITIATED = 'Unpaid'
    PAYMENT_SUCCESS = 'Paid'
    PAYMENT_HOLD_PLACED = 'HoldPlaced'
    PAYMENT_CANCELED = 'Canceled'
    PAYMENT_FAILED = 'Failed'


# Order Type Enum class
class OrderType(Enum):
    INSTORE = 'InStore'
    ONLINE = 'Online'


# Enum for the Laundry Order Status
class OrderStatusCategory(Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


# Generate the Random Order Id
def generate_order_id(prefix):
    """
    Generate a six-character alphanumeric order ID with a given prefix,
    using a truncated UUID for uniqueness.
    Example: IS-ABC123 or O-XYZ789
    """
    # Generate a UUID and take the first 6 alphanumeric characters
    unique_id = uuid.uuid4().hex[:6].upper()
    return f"{prefix}{unique_id}"


# UTC TimeStamp and JavaScript ISO Format
def get_current_timestamp():
    # Get the current UTC time
    utc_now = datetime.now(timezone.utc)
    # Format it as ISO 8601 with 'Z'
    return utc_now.isoformat().replace("+00:00", "Z")


def lambda_handler(event, context):
    try:
        print("=== LAMBDA FUNCTION START ===")
        print(f"Lambda function invoked at: {datetime.now().isoformat()}")
        current_time = get_current_timestamp()  # Current time as ISO 8601 string
        current_datetime = datetime.fromisoformat(current_time.replace("Z", "+00:00"))  # Parse to datetime object
        current_date = current_datetime.date()
        print(f"Current time: {current_time}, Current Date: {current_date}")
        count = 0

        # Fetch all frequency records with pagination
        print("Starting scan of LaundryFrequency table...")
        frequency_items = []
        response = frequency_table.scan()
        frequency_items.extend(response.get('Items', []))
        print(f"Initial scan returned {len(response.get('Items', []))} items")

        # Handle pagination to fetch all items
        while 'LastEvaluatedKey' in response:
            print("Found LastEvaluatedKey, continuing scan...")
            response = frequency_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            frequency_items.extend(response.get('Items', []))
            print(f"Additional scan returned {len(response.get('Items', []))}")
            print(f"Total items fetched so far: {len(frequency_items)}")

        print(f"Total records fetched from LaundryFrequency table: {len(frequency_items)}")
        if not frequency_items:
            print("No Records to process in the Frequency Table...")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'No frequency records found to process'})
            }

        print("Processing frequency records...")
        for item in frequency_items:
            try:
                customer_id = item['customerId']
                laundry_id = item['laundryId']
                print(f"\nProcessing record for customer: {customer_id}, laundry: {laundry_id}")

                services = item['services']
                frequency = item['frequency']
                pickup_time_interval = item.get('pickupTimeInterval', 'N/A')
                dropoff_time_interval = item.get('dropoffTimeInterval', 'N/A')
                special_instructions = item.get('specialInstructions', 'None')
                laundry_bags = item.get('laundryBags', 1)
                start_date = datetime.fromisoformat(
                    item['frequencyStartDate'].replace("Z", "+00:00")).date()  # Parse to datetime
                address_id = item['addressId']
                tip_data = item.get('tip', {})
                coupon = item.get('coupon', None)
                uber_pickup_frequency = item.get('uberPickupFrequency')
                uber_dropoff_frequency = item.get('uberDropoffFrequency')


                # Check if a new order needs to be created based on frequency and current timestamp
                days_since_start = (current_date - start_date).days
                print(f"Frequency: {frequency}, Start date: {start_date}, Days since start: {days_since_start}")

                if frequency.lower() == 'weekly' and days_since_start == 6:
                    print(f"Creating weekly order for customer: {customer_id}")
                    create_order_with_payment_hold(customer_id, laundry_id, address_id, pickup_time_interval,
                                                   dropoff_time_interval, special_instructions, services, frequency,
                                                   laundry_bags, tip_data, coupon, uber_pickup_frequency, uber_dropoff_frequency)
                    update_frequency(item, 7)
                    count += 1  # Increment count when an order is created
                elif frequency.lower() == 'biweekly' and days_since_start == 13:
                    print(f"Creating biweekly order for customer: {customer_id}")
                    create_order_with_payment_hold(customer_id, laundry_id, address_id, pickup_time_interval,
                                                   dropoff_time_interval, special_instructions, services, frequency,
                                                   laundry_bags, tip_data, coupon, uber_pickup_frequency, uber_dropoff_frequency)
                    update_frequency(item, 14)
                    count += 1  # Increment count when an order is created
                else:
                    print(f"No order created for customer {customer_id}. Conditions not met.")

            except Exception as e:
                print(f"Error processing item for customer {item['customerId']}: {str(e)}")
                continue  # Continue with next item even if one fails

        if count == 0:
            print("No Orders satisfied the frequency conditions")
        else:
            print(f"Successfully created {count} orders.")

        print("=== LAMBDA FUNCTION COMPLETE ===")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully processed {count} orders',
                'ordersCreated': count
            })
        }

    except Exception as e:
        print(f"CRITICAL ERROR in lambda_handler: {str(e)}")
        print(f"Stack trace: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Error in auto-order generation',
                'error': str(e)
            })
        }


def invoke_get_customer_details(customer_id):
    """Invoke the CustomerService Lambda to get customer details."""
    try:
        print(f"Invoking CustomerService for customer: {customer_id}")
        response = lambda_client.invoke(
            FunctionName="CustomerService",
            InvocationType="RequestResponse",
            Payload=json.dumps({
                "queryStringParameters": {
                    "operation": "getCustomerDetailsForAdmin",
                    "customerId": customer_id
                }
            })
        )

        response_payload = json.loads(response['Payload'].read().decode("utf-8"))
        print(f"CustomerService response: {json.dumps(response_payload, indent=2)}")

        if response_payload.get("statusCode") == 200:
            print(f"Successfully retrieved customer details for {customer_id}")
            return response_payload.get("body", {}).get("data", {})
        else:
            print(f"Error retrieving customer details: {response_payload}")
            return None
    except Exception as e:
        print(f"Error invoking CustomerServiceLambda: {str(e)}")
        return None


def fetch_laundry_info(laundry_id):
    """
    Fetch laundry details from the LaundryInfo table based on the provided laundry ID.
    """
    try:
        print(f"Fetching laundry info for laundryId: {laundry_id}")
        # Initialize the LaundryInfo table
        laundry_info_table = dynamodb.Table('LaundryShopInfo')

        # Fetch laundry info using laundryId
        response = laundry_info_table.get_item(Key={'laundryId': laundry_id})
        print(f"LaundryInfo response: {json.dumps(response, default=str)}")

        # Check if item exists
        if 'Item' not in response:
            raise ValueError(f"No laundry details found for laundryId: {laundry_id}")

        print(f"Successfully fetched laundry info for {laundry_id}")
        return response['Item']
    except Exception as e:
        print(f"Error fetching laundry info: {str(e)}")
        raise


def invoke_notification_lambda(notification_type, recipient, message, subject=None, sender=None):
    """
    Invokes the notification Lambda to send an email or SMS notification.

    Args:
        notification_type (str): Type of notification ("email" or "sms").
        recipient (str): Recipient's email address or phone number.
        message (str): Message to be sent.
        subject (str, optional): Subject for email notifications.

    Returns:
        None
    """
    try:
        print(f"Preparing to send {notification_type} notification to {recipient}")
        lambda_client = boto3.client('lambda')
        notification_lambda_name = "customerNotificationService"

        # Prepare payload
        payload = {
            "type": notification_type,
            "recipient": recipient,
            "message": message
        }
        if notification_type == "email" and subject:
            payload["subject"] = subject
            payload["sender"] = sender

        print(f"Notification payload: {json.dumps(payload, indent=2)}")

        # Invoke Lambda
        response = lambda_client.invoke(
            FunctionName=notification_lambda_name,
            InvocationType="Event",  # Asynchronous invocation
            Payload=json.dumps(payload)
        )
        print(f"{notification_type.capitalize()} notification sent successfully: {response}")
    except Exception as e:
        print(f"Failed to send {notification_type} notification: {str(e)}")


def get_customer_address(customer, address_id):
    # Find the address from the customer's address list based on addressId
    print(f"Looking up address {address_id} for customer")
    for address in customer.get('addresses', []):
        if address.get('addressId') == address_id:
            return address.get('address', 'Address not found')
    return 'Address not found'


def send_notification(customer, order_details, laundry_id):
    """
    Prepare and send a detailed notification using order details and laundry information.
    """
    try:
        print(f"Preparing notifications for order {order_details['orderId']}")

        # Fetch laundry info based on laundryId
        laundry_info = fetch_laundry_info(laundry_id)

        # Order details
        order_id = order_details['orderId']
        pickup_date = order_details['pickupDate']
        pickup_time_interval = order_details['pickupTimeInterval']
        dropoff_date = order_details['dropoffDate']
        dropoff_time_interval = order_details['dropoffTimeInterval']

        # Laundry information
        laundry_name = laundry_info.get('laundryName', 'Our Laundry')
        contact_details = laundry_info.get('contactDetails', {})
        support_email = contact_details.get('email', 'N/A')
        support_phone = contact_details.get('phoneNumber', 'N/A')
        customer_address = get_customer_address(customer, order_details['addressId'])

        print(
            f"Notification details - Order: {order_id}, Laundry: {laundry_name}, Customer: {customer.get('firstName', 'Customer')}")

        # Construct notification message
        notification_message = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    background-color: #f9f9f9;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    background-color: #fff;
                }}
                th, td {{
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }}
                th {{
                    background-color: #f2f2f2;
                    font-weight: bold;
                }}
                td {{
                    background-color: #fafafa;
                }}
                p {{
                    margin: 0 0 10px;
                }}
                .section-title {{
                    font-size: 16px;
                    font-weight: bold;
                    margin-top: 15px;
                }}
            </style>
        </head>
        <body>
            <p>Dear {customer.get('firstName', 'Customer')},</p>
            <p>Thank you for placing your order with <strong>{laundry_name}</strong>. We are delighted to inform you that your order has been placed successfully.</p>

            <p class="section-title">Order Details:</p>
            <table>
                <tbody>
                    <tr>
                        <th>Order ID</th>
                        <td>{order_id}</td>
                    </tr>
                    <tr>
                        <th>Services</th>
                        <td>
                            {', '.join([service['service'] for service in order_details['services']])}
                        </td>
                    </tr>
                    <tr>
                        <th>Pickup Date</th>
                        <td>{pickup_date}</td>
                    </tr>
                    <tr>
                        <th>Pickup Time</th>
                        <td>{pickup_time_interval}</td>
                    </tr>
                    <tr>
                        <th>Delivery Date</th>
                        <td>{dropoff_date}</td>
                    </tr>
                    <tr>
                        <th>Delivery Time</th>
                        <td>{dropoff_time_interval}</td>
                    </tr>
                </tbody>
            </table>

            <p>We look forward to serving you with the highest quality care. Should you have any questions or need to make changes to your order, feel free to reach out to us at:</p>
            <ul>
                <li>Email: {support_email}</li>
                <li>Phone: {support_phone}</li>
            </ul>

            <p>Thank you for choosing <strong>{laundry_name}</strong>!</p>
            <p>Warm regards,</p>
            <p><strong>{laundry_name} Team</strong></p>

        </body>
        </html>
        """

        # Send email notification if enabled
        if customer.get('notificationPreferences', {}).get('email', False) and customer.get('email'):
            print(f"Sending email notification to {customer['email']}")
            invoke_notification_lambda(
                notification_type="email",
                recipient=customer['email'],
                message=notification_message,
                subject=f"{order_details['frequency']} Order Confirmation",
                sender=support_email
            )
        else:
            print("Email notifications not enabled or no email address provided")

        # Send SMS notification if enabled
        if customer.get('notificationPreferences', {}).get('phone', False) and customer.get('phoneNumber'):
            print(f"Sending SMS notification to {customer['phoneNumber']}")
            sms_message = (
                f"{order_details['frequency']} Order Confirmed at {laundry_name}! ID: {order_id}, services: {', '.join([service['service'] for service in order_details['services']])}, Pickup: {pickup_date} {pickup_time_interval}, "
                f"Delivery: {dropoff_date} {dropoff_time_interval}. Contact us at {support_phone}."
            )
            invoke_notification_lambda(
                notification_type="sms",
                recipient=customer['phoneNumber'],
                message=sms_message
            )
        else:
            print("SMS notifications not enabled or no phone number provided")

        # Construct the notification email content for the laundry team
        laundry_notification_message = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    background-color: #f9f9f9;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                    background-color: #fff;
                }}
                th, td {{
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }}
                th {{
                    background-color: #f2f2f2;
                    font-weight: bold;
                }}
                td {{
                    background-color: #fafafa;
                }}
                p {{
                    margin: 0 0 10px;
                }}
                .section-title {{
                    font-size: 16px;
                    font-weight: bold;
                    margin-top: 15px;
                }}
            </style>
        </head>
        <body>
            <p>Dear {laundry_name} Team,</p>
            <p>We have a new laundry order placed with the following details:</p>

            <p class="section-title">Order Details:</p>
            <table>
                <tbody>
                    <tr>
                        <th>Order ID</th>
                        <td>{order_details['orderId']}</td>
                    </tr>
                    <tr>
                        <th>Customer Name</th>
                        <td>{customer.get('firstName', 'Customer')} {customer.get('lastName', '')}</td>
                    </tr>
                    <tr>
                        <th>Customer Address</th>
                        <td>{customer_address}</td>
                    </tr>
                    <tr>
                        <th>Services</th>
                        <td>
                            {', '.join([service['service'] for service in order_details['services']])}
                        </td>
                    </tr>
                    <tr>
                        <th>Pickup Window</th>
                        <td>{pickup_date} - {pickup_time_interval}</td>
                    </tr>
                    <tr>
                        <th>Delivery Window</th>
                        <td>{dropoff_date} - {dropoff_time_interval}</td>
                    </tr>
                </tbody>
            </table>

            <p>Kindly ensure timely processing and delivery of this order.</p>
            <p>Thank you!</p>
        </body>
        </html>
        """

        print(f"Sending laundry team notification to {support_email}")
        invoke_notification_lambda(
            notification_type="email",
            recipient=support_email,
            message=laundry_notification_message,
            subject="New Order Received Details Test",
            sender=support_email
        )

        print("All notifications sent successfully")
    except Exception as e:
        print(f"Error in send_notification: {str(e)}")
        raise

def get_address_instructions(customer_details, address_id):
    addresses = customer_details.get("addresses", [])
    for addr in addresses:
        if addr.get("addressId") == address_id:
            return addr.get("addressInstructions", "")
    return ""

def create_order_with_payment_hold(customer_id, laundry_id, address_id, pickup_time_interval, dropoff_time_interval,
                                   special_instructions, services, frequency, laundry_bags, tip_data, coupon, uber_pickup_frequency, uber_dropoff_frequency):
    try:
        print(f"Starting order creation for customer {customer_id}")
        current_time = datetime.now().isoformat()

        # Initialize the default values
        total_cost = Decimal(1.00)
        order_status = OrderStatus.ORDER_SUBMITTED.value
        order_type = OrderType.ONLINE.value
        payment_intent_id = None
        order_status_type = OrderStatusCategory.ACTIVE.value

        # Set today's date as the pickup date and tomorrow's date as the dropoff date
        pickup_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')  # Tomorrow's date
        dropoff_date = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')  # Morrow's date
        print(f"Pickup date: {pickup_date}, Dropoff date: {dropoff_date}")

        # Attempt to place a payment hold
        # send payment intent Id from customer table based on the customerId and laundryId
        customer_details = invoke_get_customer_details(customer_id)
        if customer_details:
            print(f"Customer details retrieved: {json.dumps(customer_details, default=str)}")
            customer_payment_ids = customer_details.get('customerPaymentId', {})
            payment_intent_id = customer_payment_ids.get(str(laundry_id))
            print(f"Payment intent ID found: {payment_intent_id}")

        payment_status = PaymentStatus.PAYMENT_FAILED.value
        if payment_intent_id:
            print(f"Attempting payment hold with intent: {payment_intent_id}")
            payment_hold_response = create_payment_hold(customer_id, payment_intent_id, laundry_id)
            if payment_hold_response['status'] == 'success':
                payment_status = PaymentStatus.PAYMENT_INITIATED.value
                payment_intent_id = payment_hold_response.get('paymentIntentId', '')
                print(f"Payment hold successful for customer {customer_id}, paymentIntentId: {payment_intent_id}")
            else:
                # TODO: Send Payment Hold Failed notification to the customer
                print(f"Payment hold failed for customer {customer_id}: {payment_hold_response.get('message')}")
                payment_status = PaymentStatus.PAYMENT_FAILED.value
        else:
            print(f"No payment intent found for customer {customer_id}")

        order_id = generate_order_id("O-")
        print(f"Generated order ID: {order_id}")
        category_type_created_at = f"{order_status_type}#{order_type}#{current_time}"
        # Set pickup and dropoff services based on Uber frequency flags
        pickup_service = "Uber" if uber_pickup_frequency else "LaundryDriver"
        dropoff_service = "Uber" if uber_dropoff_frequency else "LaundryDriver"
        address_instructions = get_address_instructions(customer_details, address_id)

        order = {
            'orderId': order_id,
            'customerId': customer_id,
            'laundryId': laundry_id,
            'addressId': address_id,
            'services': services,
            'pickupDate': pickup_date,
            'pickupTimeInterval': pickup_time_interval,
            'dropoffDate': dropoff_date,
            'dropoffTimeInterval': dropoff_time_interval,
            'specialInstructions': special_instructions,
            'frequency': frequency,
            'totalCost': total_cost,
            'orderStatus': order_status,
            'paymentStatus': payment_status,
            'holdPaymentIntentId': payment_intent_id,
            'createdAt': current_time,
            'updatedAt': current_time,
            'coupon': coupon,
            'categoryTypeCreatedAt': category_type_created_at,
            'orderType': order_type,
            'laundryBags': laundry_bags,
            'tip': tip_data,
            'isReviewed': False,
            'autoGenerated': True,  # Mark order as auto-generated
            'pickupService': pickup_service,
            'dropoffService': dropoff_service
        }

        # Insert the order into the LaundryOrders table
        try:
            print(f"Attempting to put item in Orders table: {json.dumps(order, default=str)}")
            orders_table.put_item(Item=order)
            print(f"Order created successfully for customer {customer_id}, orderId: {order_id}")
            print("Order details:", json.dumps(order, default=str))

            send_notification(customer_details, order, laundry_id)

            customer_address_uber  = get_customer_address(customer_details, address_id)
            laundry_info = fetch_laundry_info(laundry_id)
            laundry_address_map = laundry_info.get('laundryAddress', {})
            laundry_name = laundry_info.get('laundryName', {})
            laundry_address = f"{laundry_address_map.get('street', '')}, " \
                                f"{laundry_address_map.get('city', '')}, " \
                                f"{laundry_address_map.get('state', '')} " \
                                f"{laundry_address_map.get('zipCode', '')}, " \
                                f"{laundry_address_map.get('country', '')}"
            customer_full_name = f"{customer_details.get('firstName','')} {customer_details.get('lastName','')}".strip()
            customer_phone = customer_details.get("phoneNumber")
            laundry_contact_details = laundry_info.get('contactDetails', {})
            laundry_email = laundry_contact_details.get('email', 'N/A')
            laundry_phone = laundry_contact_details.get('phoneNumber', 'N/A')
            laundry_instructions = laundry_info.get('pickupDropoffInstructions', 'N/A')
            print("laundry_instructions is:", laundry_instructions)
            if pickup_service == "Uber":
                # Format delivery_date and time_interval
                pickup_date_str = str(pickup_date)  # ensure string
                pickup_time_interval = str(pickup_time_interval)
                logger.info("[UBER] Pickup leg using: pickup_address=%s | dropoff_address=%s", customer_address_uber, laundry_address)
                # Construct payload
                uber_lambda_payload = {
                    "operation": "schedule-uber-order",
                    "laundry_id": laundry_id,
                    "uberEnv": laundry_info.get('uberEnv', {}),  
                    "pickup_address": customer_address_uber,
                    "dropoff_address": laundry_address,
                    "pickup_phone": customer_phone,
                    "dropoff_phone": laundry_phone,
                    "order_id": order_id,
                    "delivery_date": pickup_date_str,
                    "time_interval": pickup_time_interval,
                    "laundry_bags_qty": int(laundry_bags),
                    "type": "laundryPickup",
                    "pickup_name": customer_full_name,
                    "dropoff_name": laundry_name, 
                    "pickup_notes": address_instructions, 
                    "dropoff_notes": laundry_instructions, 
                    "laundry_name":laundry_name
                }

                logger.info("[UBER] Invoking UberIntegration Lambda for laundryPickup with: %s", json.dumps(uber_lambda_payload))

                try:
                    response = lambda_client.invoke(
                        FunctionName=UBER_LAMBDA_NAME,
                        InvocationType='RequestResponse',
                        Payload=json.dumps(uber_lambda_payload).encode()
                    )

                    raw_payload = json.load(response['Payload'])
                    logger.info("[UBER] UberIntegration raw response: %s", json.dumps(raw_payload))

                    status_code = raw_payload.get("statusCode", 500)
                    body_str = raw_payload.get("body", "{}")
                    body = json.loads(body_str)

                    if status_code != 200 or body.get("message") != "Uber delivery scheduled and order updated.":
                        logger.warning("[UBER] Pickup Uber order not processed. Defaulting to LaundryDriver.")
                        orders_table.update_item(
                            Key={'orderId': order_id},
                            UpdateExpression="SET pickupService = :default_service",
                            ExpressionAttributeValues={":default_service": "LaundryDriver"}
                        )


                except Exception as e:
                    logger.exception("[UBER] Failed to invoke UberIntegration Lambda for laundryPickup")
            
            if dropoff_service == "Uber":
                # Format delivery_date and time_interval
                dropoff_date_str = str(dropoff_date)  # ensure string
                dropoff_time_interval = str(dropoff_time_interval)
                logger.info("[UBER] Dropoff leg using: pickup_address=%s | dropoff_address=%s",
                laundry_address, customer_address_uber)
                # Construct payload
                uber_lambda_payload = {
                    "operation": "schedule-uber-order",
                    "laundry_id": laundry_id,
                    "uberEnv": laundry_info.get('uberEnv', {}),  
                    "pickup_address": laundry_address,
                    "dropoff_address": customer_address_uber,
                    "pickup_phone": laundry_phone,
                    "dropoff_phone": customer_phone,
                    "order_id": order_id,
                    "delivery_date": dropoff_date_str,
                    "time_interval": dropoff_time_interval,
                    "laundry_bags_qty": int(laundry_bags),
                    "type": "laundryDropoff",
                    "pickup_name":laundry_name,
                    "dropoff_name":customer_full_name, 
                    "pickup_notes": laundry_instructions, 
                    "dropoff_notes":address_instructions,
                    "laundry_name":laundry_name
                }

                logger.info("[UBER] Invoking UberIntegration Lambda for laundryDropoff with: %s", json.dumps(uber_lambda_payload))

                try:
                    response = lambda_client.invoke(
                        FunctionName=UBER_LAMBDA_NAME,
                        InvocationType='RequestResponse',
                        Payload=json.dumps(uber_lambda_payload).encode()
                    )

                    raw_payload = json.load(response['Payload'])
                    logger.info("[UBER] UberIntegration raw response: %s", json.dumps(raw_payload))

                    status_code = raw_payload.get("statusCode", 500)
                    body_str = raw_payload.get("body", "{}")
                    body = json.loads(body_str)

                    if status_code != 200 or body.get("message") != "Uber delivery scheduled and order updated.":
                        logger.warning("[UBER] Dropoff Uber order not processed. Defaulting to LaundryDriver.")
                        orders_table.update_item(
                            Key={'orderId': order_id},
                            UpdateExpression="SET dropoffService = :default_service",
                            ExpressionAttributeValues={":default_service": "LaundryDriver"}
                        )
                except Exception as e:
                    logger.exception("[UBER] Failed to invoke UberIntegration Lambda for laundryDropoff")



        except Exception as e:
            print(f"Failed to create order in Orders table: {str(e)}")
            if payment_intent_id:
                print(f"Attempting to cancel payment intent due to order creation failure: {payment_intent_id}")
                cancel_payment_intent(payment_intent_id)
                print(f"Rolled back payment hold for paymentIntentId: {payment_intent_id}")

    except Exception as e:
        print(f"Error in creating order for customer {customer_id}: {str(e)}")


# Update the frequency after the order is placed successfully
def update_frequency(item, days_interval):
    try:
        print(f"Updating frequency record for customer {item['customerId']}")

        # Get current time and calculate tomorrow's date
        current_datetime = datetime.now(timezone.utc)
        tomorrow_datetime = current_datetime + timedelta(days=1)

        # Format tomorrow's date as ISO timestamp with Z timezone
        new_start_date = tomorrow_datetime.isoformat().replace("+00:00", "Z")

        # Calculate the new pickup dates
        pickup_dt = tomorrow_datetime  # Pickup is tomorrow
        future_pickup_dt = tomorrow_datetime + timedelta(days=days_interval)

        # Update frequency record with new dates
        item['frequencyStartDate'] = new_start_date  # Set to tomorrow's date
        item['pickupDate'] = pickup_dt.strftime('%Y-%m-%d')
        item['futurePickupDate'] = future_pickup_dt.strftime('%Y-%m-%d')

        # Save the updated record
        print(f"New frequency values: {json.dumps(item, default=str)}")
        frequency_table.put_item(Item=item)

        print(
            f"Updated frequency record for customer {item['customerId']}:\n"
            f"  frequencyStartDate = {item['frequencyStartDate']}\n"
            f"  pickupDate         = {item['pickupDate']}\n"
            f"  futurePickupDate   = {item['futurePickupDate']}"
        )


    except Exception as e:
        # TODO: Alert Admin that the order was created,
        # but failed to update the order placed date in the Frequency table
        print(f"Error in updating frequency for customer {item['customerId']}: {str(e)}")


# Create a Payment Intent on the Card
def create_payment_hold(customer_id, payment_intent_id, laundry_id):
    try:
        print(f"Creating payment hold for customer {customer_id}, intent: {payment_intent_id}")

        # Call the PaymentService Lambda to create a payment hold
        response = lambda_client.invoke(
            FunctionName='PaymentService',  # Payment Service Lambda function
            InvocationType='RequestResponse',  # Synchronous invocation
            Payload=json.dumps({
                'orderPaymentOperation': 'createHold',
                'customerPaymentId': payment_intent_id,
                'description': f'Auto-generated laundry Id {laundry_id} order',
                'laundryId': laundry_id,
                'amount': 1  # Temporary hold amount
            })
        )

        # Read and parse the response from the PaymentService
        response_payload = json.loads(response['Payload'].read())
        print(f"PaymentService response: {json.dumps(response_payload, indent=2)}")

        if 'status' not in response_payload or response_payload['status'] != 'success':
            print(f"Payment hold creation failed: {response_payload}")
            return {'status': 'error', 'message': 'Failed to create payment hold.'}

        return response_payload
    except Exception as e:
        print(f"Error creating payment hold: {str(e)}")
        return {'status': 'error', 'message': f"Error creating payment hold: {str(e)}"}


# Call PaymentService function to cancel the hold on the card
def cancel_payment_intent(payment_intent_id):
    try:
        print(f"Cancelling payment intent: {payment_intent_id}")
        # Call the PaymentService Lambda to cancel the hold
        response = lambda_client.invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'cancelHold',
                'paymentIntentId': payment_intent_id
            })
        )
        print(f"Payment intent {payment_intent_id} cancelled. Response: {response}")
    except Exception as e:
        print(f"Error cancelling payment intent: {str(e)}")
