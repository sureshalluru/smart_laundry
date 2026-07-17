import requests
import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# All customer/laundry data is fetched via Lambda invocations (CustomerService, LaundryShopService)
# No direct DynamoDB access needed here.
lambda_client = boto3.client('lambda')

# URL shortening REMOVED — TinyURL shows ad interstitial pages to recipients.
# Use path-based URLs directly instead.
def shorten_url(long_url):
    """No-op: returns the URL as-is. TinyURL was removed because carriers show ad pages."""
    return long_url

# Function to send the notifications to the Customer
def invoke_notification_lambda(customer_id, laundry_id, order_id):
    logger.info(f"Invoking notification lambda for customer_id: {customer_id}, laundry_id: {laundry_id}, order_id: {order_id}")
    
    # Fetch customer and laundry details
    customer = get_customer_details_from_lambda(customer_id)
    laundry = get_laundry_details_from_lambda(laundry_id)

    if not customer:
        logger.error(f"Customer details not found for ID: {customer_id}")
        return
    if not laundry:
        logger.error(f"Laundry details not found for ID: {laundry_id}")
        return

    full_name = f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip()

    # Get notification preferences
    notification_preference = customer.get("notificationPreferences", {})

    # Conditionally get email and phone based on preferences
    customer_email = customer.get("email") if notification_preference.get("email") else None
    customer_phone = customer.get("phoneNumber") if notification_preference.get("phone") else None

    shop_email = laundry.get("email")

    laundry_domains = laundry.get("domain", {})
    user_domain = laundry_domains.get("userDomain", "N/A")
    logger.info(f"User domain is: {user_domain}")
    
    order_details_url = f"{user_domain}/1/user/my-orders/?order_id={order_id}&is_open=true"
    short_order_url = shorten_url(order_details_url)

    # Construct message content
    email_subject = f"Payment Failed for Laundry Order {order_id}"
    email_body = f"""
    <html>
        <body>
            <p>Dear <strong>{full_name}</strong>,</p>
            <p>
            We were unable to process the payment for your laundry order 
            with <strong>Order ID: {order_id}</strong>.
            </p>
            <p>
            Please update your payment method or contact the laundry shop for further assistance.
            </p>
            <div style="margin: 30px 0;">
            <a href="{order_details_url}" style="
                background-color: #007BFF;
                color: white;
                padding: 12px 20px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                display: inline-block;
            ">
                View Order Details
            </a>
            </div>
            <p>
            Thank you for choosing <strong>{laundry.get('name', 'Laundry service')}</strong>!
            </p>
            <p style="margin-top: 20px;">
            Sincerely,<br>
            <em>{laundry.get('name', 'Your Laundry Service')}</em><br>
            <em>{laundry.get('phone', 'phone')}</em><br>
            <em>{laundry.get('email', 'email')}</em>
            </p>
        </body>
    </html>
    """

    sms_body = (
        f"Hi {full_name}\n, We couldn't process payment for your laundry order "
        f"(Order ID: {order_id}) from {laundry.get('name', 'Laundry Service')}.\n"
        f"Please update your payment method or contact the shop for further assistance.\n"
        f"View order: {short_order_url}\n\n"
        f"Sincerely,\n"
        f"{laundry.get('name', 'Your Laundry Service')}\n"
        f"{laundry.get('phone', 'phone')}\n"
        f"{laundry.get('email', 'email')}\n"
    )

    logger.info(f"Notification Preferences: {notification_preference}")

    # Email to shop notifying about payment failure
    shop_email_subject = f"[Payment Failure Alert] Order {order_id} for Customer {full_name}"
    shop_email_body = f"""
    <html>
        <body>
            <p>Dear {laundry.get('name', 'Laundry Service')} team,</p>
            <p>
                A payment failure has occurred for the following order:
            </p>
            <ul>
                <li><strong>Order ID:</strong> {order_id}</li>
                <li><strong>Customer Name:</strong> {full_name}</li>
                <li><strong>Customer Email:</strong> {customer.get('email', 'N/A')}</li>
                <li><strong>Customer Phone:</strong> {customer.get('phoneNumber', 'N/A')}</li>
            </ul>
            <p>
                You may want to follow up with the customer or check the order status here:
            </p>
            <div style="margin: 30px 0;">
            <a href="{order_details_url}" style="
                background-color: #28a745;
                color: white;
                padding: 12px 20px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                display: inline-block;
            ">
                View Order Details
            </a>
            </div>
            <p>
                This is an automated alert to assist in customer service follow-up.
            </p>
            <p style="margin-top: 20px;">
                Regards,<br>
                <em>Payment Notification System</em>
            </p>
        </body>
    </html>
    """
    
    try:
        if customer_email:
            logger.info(f"Invoking email notification with recipient: {customer_email}")
            email_response = lambda_client.invoke(
                FunctionName="customerNotificationService",
                InvocationType="Event",
                Payload=json.dumps({
                    "type": "email",
                    "recipient": customer_email,
                    "sender": shop_email,
                    "subject": email_subject,
                    "message": email_body
                })
            )
            logger.info(f"Email notification response: {email_response}")

        if customer_phone:
            logger.info(f"Invoking SMS notification with recipient: {customer_phone}")
            sms_response = lambda_client.invoke(
                FunctionName="customerNotificationService",
                InvocationType="Event",
                Payload=json.dumps({
                    "type": "sms",
                    "recipient": customer_phone,
                    "message": sms_body
                })
            )
            logger.info(f"SMS notification response: {sms_response}")

        if shop_email:
            logger.info(f"Sending payment failure alert to shop email: {shop_email}")
            shop_email_response = lambda_client.invoke(
                FunctionName="customerNotificationService",
                InvocationType="Event",
                Payload=json.dumps({
                    "type": "email",
                    "recipient": shop_email,
                    "sender": shop_email,
                    "subject": shop_email_subject,
                    "message": shop_email_body
                })
            )
            logger.info(f"Shop notification email response: {shop_email_response}")

    except Exception as e:
        logger.exception("Failed to invoke notification Lambda")

# Get Customer Details to prepare the payload to send the notifications
def get_customer_details_from_lambda(customer_id):
    logger.info(f"Fetching customer details for customer_id: {customer_id}")
    payload = {
        "queryStringParameters": {
            "operation": "getCustomerDetailsForAdmin",
            "customerId": customer_id
        }
    }

    try:
        response = lambda_client.invoke(
            FunctionName='CustomerService',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        response_payload = response['Payload'].read()
        result = json.loads(response_payload)
        logger.info(f"Customer Lambda result: {result}")

        if result['statusCode'] == 200:
            body = result.get('body', {})
            if isinstance(body, str):
                body = json.loads(body)
            if body.get("status") == "success":
                logger.info("Customer details fetched successfully.")
                return body.get("data")
            else:
                logger.error(f"Error from Customer Lambda: {body.get('message')}")
                return None
        else:
            logger.error(f"Customer Lambda returned non-200 statusCode: {result['statusCode']}")
            return None

    except Exception as e:
        logger.exception("Error invoking CustomerService Lambda")
        return None

# Get laundry details from laundry id from LaundryShopService
def get_laundry_details_from_lambda(laundry_id):
    logger.info(f"Fetching laundry details for laundry_id: {laundry_id}")
    payload = {
        "queryStringParameters": {
            "operation": "viewShopInfo",
            "laundryId": laundry_id
        }
    }

    try:
        response = lambda_client.invoke(
            FunctionName='LaundryShopService',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        response_payload = response['Payload'].read()
        result = json.loads(response_payload)
        logger.info(f"Laundry Lambda result: {result}")

        if result['statusCode'] == 200:
            body = result.get('body', {})
            if isinstance(body, str):
                body = json.loads(body)
            logger.info("Laundry details fetched successfully.")
            return body
        else:
            logger.error(f"Laundry Lambda returned non-200 statusCode: {result['statusCode']}")
            return None

    except Exception as e:
        logger.exception("Error invoking LaundryShopService Lambda")
        return None
