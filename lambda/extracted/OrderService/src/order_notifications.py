import json
import boto3
import logging
from utils import fetch_laundry_info

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# DynamoDB table references removed — all data fetched via fetch_laundry_info (PostgreSQL)
# and customer data passed in directly from callers.


def get_customer_address(customer, address_id):
    # Find the address from the customer's address list based on addressId
    logger.info(f"Retrieving address for address_id: {address_id}")
    for address in customer.get('addresses', []):
        if address.get('addressId') == address_id:
            logger.info("Address found in customer record")
            return address.get('address', 'Address not found')
    logger.warning("Address not found in customer record")
    return 'Address not found'


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
    logger.info(f"Invoking notification lambda for {notification_type} to recipient: {recipient}")
    try:
        lambda_client = boto3.client('lambda')
        notification_lambda_name = "customerNotificationService"
        payload = {
            "type": notification_type,
            "recipient": recipient,
            "message": message
        }
        if notification_type == "email" and subject:
            payload["subject"] = subject
            payload["sender"] = sender

        response = lambda_client.invoke(
            FunctionName=notification_lambda_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload)
        )
        logger.info(f"{notification_type.capitalize()} notification sent successfully: {response}")
    except Exception as e:
        logger.exception(f"Failed to send {notification_type} notification: {str(e)}")


def send_notification(customer, order_details, laundry_id):
    logger.info("Preparing to send notification")
    try:
        laundry_info = fetch_laundry_info(laundry_id)
        order_id = order_details['orderId']
        pickup_date = order_details['pickupDate']
        pickup_time_interval = order_details['pickupTimeInterval']
        dropoff_date = order_details['dropoffDate']
        dropoff_time_interval = order_details['dropoffTimeInterval']

        laundry_name = laundry_info.get('laundryName', 'Our Laundry')
        contact_details = laundry_info.get('contactDetails', {})
        support_email = contact_details.get('email', 'N/A')
        support_phone = contact_details.get('phoneNumber', 'N/A')
        customer_address = get_customer_address(customer, order_details['addressId'])

        logger.info(f"Order details for notification: {order_details}")

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
                        <td>{', '.join([service['serviceName'] for service in order_details['services']])}</td>
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
        if customer.get('notification_preferences', {}).get('email', False) and customer.get('email'):
            invoke_notification_lambda(
                notification_type="email",
                recipient=customer['email'],
                message=notification_message,
                subject=f"Order {order_id} Confirmation",
                sender=support_email
            )
        # Send SMS notification if enabled
        if customer.get('notification_preferences', {}).get('phone', False) and customer.get('phoneNumber'):
            sms_message = (
                f"Order Confirmed! ID: {order_id}, Pickup: {pickup_date} {pickup_time_interval}, "
                f"Delivery: {dropoff_date} {dropoff_time_interval}. Contact us at {support_phone}."
            )
            invoke_notification_lambda(
                notification_type="sms",
                recipient=customer['phoneNumber'],
                message=sms_message
            )
        # Construct the notification email content for the laundry team
        logger.info("Preparing notification for laundry team")
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
                        <td>{', '.join([service['serviceName'] for service in order_details['services']])}</td>
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
        logger.info("Laundry team notification email content prepared.")
        invoke_notification_lambda(
            notification_type="email",
            recipient=support_email,
            message=laundry_notification_message,
            subject=f"New Order {order_id} Received Details",
            sender=support_email
        )
    except Exception as e:
        logger.exception(f"Error in send_notification: {str(e)}")
        raise


# def send_cancellation_notification(customer, order_details, laundry_id):
#     """
#     Prepare and send a detailed notification for a canceled order.
#     """
#     logger.info("Preparing cancellation notification")
#     try:
#         # Order details
#         laundry_info = fetch_laundry_info(laundry_id)
#         order_id = order_details['orderId']
#         pickup_date = order_details['pickupDate']
#         pickup_time_interval = order_details['pickupTimeInterval']
#         dropoff_date = order_details['dropoffDate']
#         dropoff_time_interval = order_details['dropoffTimeInterval']
#         # Laundry information
#         laundry_name = laundry_info.get('laundryName', 'Our Laundry')
#         contact_details = laundry_info.get('contactDetails', {})
#         support_email = contact_details.get('email', 'support@example.com')
#         support_phone = contact_details.get('phoneNumber', 'N/A')
#         # Construct notification message
#         notification_message = f"""
#         <!DOCTYPE html>
#         <html>
#         <head>
#             <style>
#                 body {{
#                     font-family: Arial, sans-serif;
#                     line-height: 1.6;
#                     color: #333;
#                     margin: 0;
#                     padding: 20px;
#                     background-color: #f9f9f9;
#                 }}
#                 table {{
#                     width: 100%;
#                     border-collapse: collapse;
#                     margin: 20px 0;
#                     background-color: #fff;
#                 }}
#                 th, td {{
#                     border: 1px solid #ddd;
#                     padding: 8px;
#                     text-align: left;
#                 }}
#                 th {{
#                     background-color: #f2f2f2;
#                     font-weight: bold;
#                 }}
#                 td {{
#                     background-color: #fafafa;
#                 }}
#                 p {{
#                     margin: 0 0 10px;
#                 }}
#                 .section-title {{
#                     font-size: 16px;
#                     font-weight: bold;
#                     margin-top: 15px;
#                 }}
#             </style>
#         </head>
#         <body>
#             <p>Dear {customer.get('firstName', 'Customer')},</p>
#             <p>Your order with Order Id: <strong>{order_id}</strong> from <strong>{laundry_name}</strong> has been successfully canceled.</p>
#             <p>If you have any questions or need further assistance, feel free to reach out to us at:`</p>
#             <ul>
#                 <li>Email: {support_email}</li>
#                 <li>Phone: {support_phone}</li>
#             </ul>
#             <p>Warm regards,</p>
#             <p><strong>{laundry_name} Team</strong></p>
#         </body>
#         </html>
#         """

#         laundry_notification_message = f"""
#         <!DOCTYPE html>
#         <html>
#         <head>
#         <style>
#         body {{
#             font-family: Arial, sans-serif;
#             line-height: 1.6;
#             color: #333;
#             margin: 0;
#             padding: 20px;
#             background-color: #f9f9f9;
#         }}
#         table {{
#             width: 100%;
#             border-collapse: collapse;
#             margin: 20px 0;
#             background-color: #fff;
#         }}
#         th, td {{
#             border: 1px solid #ddd;
#             padding: 8px;
#             text-align: left;
#         }}
#         th {{
#             background-color: #f2f2f2;
#             font-weight: bold;
#         }}
#         td {{
#             background-color: #fafafa;
#         }}
#         p {{
#             margin: 0 0 10px;
#         }}
#         .section-title {{
#             font-size: 16px;
#             font-weight: bold;
#             margin-top: 15px;
#         }}
#         </style>
#         </head>
#         <body>
#         <p>Dear Laundry Team,</p>
#         <p>An order has been canceled with the following details:</p>
#         <p class="section-title">Order Details:</p>
#         <table>
#         <tbody>
#             <tr>
#                 <th>Order ID</th>
#                 <td>{order_id}</td>
#             </tr>
#             <tr>
#                 <th>Customer Name</th>
#                 <td>{customer.get('firstName', 'Customer')} {customer.get('lastName', '')}</td>
#             </tr>
#             <tr>
#                 <th>Services</th>
#                 <td>{', '.join([service['serviceName'] for service in order_details['services']])}</td>
#             </tr>
#             <tr>
#                 <th>Pickup Date</th>
#                 <td>{order_details['pickupDate']}</td>
#             </tr>
#             <tr>
#                 <th>Pickup Time</th>
#                 <td>{order_details['pickupTimeInterval']}</td>
#             </tr>
#             <tr>
#                 <th>Delivery Date</th>
#                 <td>{order_details['dropoffDate']}</td>
#             </tr>
#             <tr>
#                 <th>Delivery Time</th>
#                 <td>{order_details['dropoffTimeInterval']}</td>
#             </tr>
#         </tbody>
#         </table>
#         <p>Please make sure the cancellation is processed promptly and the necessary updates are made in the system.</p>
#         <p>If you have any questions, please feel free to contact us.</p>

#         <p>Thank you for your prompt attention to this cancellation request!</p>
#         <p>Warm regards,</p>
#         <p><strong>{laundry_name} Team</strong></p>
#         </body>
#         </html>
#         """
#         # Send email notification if enabled
#         if customer.get('notification_preferences', {}).get('email', False) and customer.get('email'):
#             invoke_notification_lambda(
#                 notification_type="email",
#                 recipient=customer['email'],
#                 message=notification_message,
#                 subject="Order Cancellation Notice",
#                 sender=support_email
#             )

#         # Send SMS notification if enabled
#         if customer.get('notification_preferences', {}).get('phone', False) and customer.get('phoneNumber'):
#             sms_message = (
#                 f"Your order (ID: {order_id}) scheduled for pickup on {pickup_date} at {pickup_time_interval} "
#                 f"has been canceled. For assistance, contact us at {support_phone}."
#             )
#             invoke_notification_lambda(
#                 notification_type="sms",
#                 recipient=customer['phoneNumber'],
#                 message=sms_message
#             )

#         invoke_notification_lambda(
#             notification_type="email",
#             recipient=support_email,
#             message=laundry_notification_message,
#             subject=f"Order Cancelled at {laundry_name}",
#             sender=support_email
#         )
#         logger.info("Cancellation notifications sent successfully.")
#     except Exception as e:
#         logger.exception(f"Error in send_cancellation_notification: {str(e)}")
#         raise


def send_cancellation_notification(customer, order_details, laundry_id, uber_context=None):
    """
    Prepare and send a detailed notification for a canceled order.
    If `uber_context` is provided (from your Uber cancel orchestration), it will show
    stage + whether a fee may apply for pickup/dropoff legs. Otherwise, it falls back
    to whatever is in `order_details.uberInfo`.
    """
    logger.info("Preparing cancellation notification")
    try:
        # --------- Core data ----------
        laundry_info = fetch_laundry_info(laundry_id)
        order_id = order_details.get('orderId')
        pickup_date = order_details.get('pickupDate', '')
        pickup_time_interval = order_details.get('pickupTimeInterval', '')
        dropoff_date = order_details.get('dropoffDate', '')
        dropoff_time_interval = order_details.get('dropoffTimeInterval', '')

        laundry_name = laundry_info.get('laundryName', 'Our Laundry')
        contact_details = laundry_info.get('contactDetails', {})
        support_email = contact_details.get('email', 'support@example.com')
        support_phone = contact_details.get('phoneNumber', 'N/A')

        # --------- Build Uber fragments (INLINE; no extra defs) ----------
        uses_uber = (order_details.get("pickupService") == "Uber") or (order_details.get("dropoffService") == "Uber")
        legs = []
        # Compose rows either from uber_context (preferred) or from order_details fallback:
        def _row(label, stage, attempted, success, fee_applies, delivery_id):
            # no nested def in final file? If you prefer, inline as dict literal each time.
            return {
                "Leg": label,
                "Stage": stage or "unknown",
                "Action": ("Cancellation requested" if (attempted and success)
                           else "Not scheduled" if stage == "not_scheduled"
                           else "Not cancellable" if not attempted and stage not in ("unknown","not_scheduled") 
                           else "Attempted (check status)" if attempted
                           else "Unknown"),
                "Fee": "Possible" if fee_applies else "No",
                "Delivery ID": delivery_id or "-"
            }

        if uber_context:
            if uber_context.get("pickup") is not None:
                p = uber_context["pickup"]
                legs.append(_row("Pickup", p.get("stage"), p.get("attempted", False),
                                 p.get("cancel_success", False), p.get("fee_applies", False),
                                 (p.get("integrationResponse") or {}).get("delivery_id") or p.get("deliveryId")))
            if uber_context.get("dropoff") is not None:
                d = uber_context["dropoff"]
                legs.append(_row("Dropoff", d.get("stage"), d.get("attempted", False),
                                 d.get("cancel_success", False), d.get("fee_applies", False),
                                 (d.get("integrationResponse") or {}).get("delivery_id") or d.get("deliveryId")))
            any_fee_possible = uber_context.get("any_fee_possible", any(r["Fee"] == "Possible" for r in legs))
        elif uses_uber:
            # Fallback based on stored order data (no knowledge of attempted cancel)
            ui = (order_details.get("uberInfo") or {})
            if order_details.get("pickupService") == "Uber":
                up = ui.get("laundryPickup") or {}
                st = (up.get("status") or "").lower()
                legs.append(_row("Pickup", st, False, False, st in {"courier_assigned","pickup_en_route","at_pickup"}, up.get("deliveryId")))
            if order_details.get("dropoffService") == "Uber":
                do = ui.get("laundryDropoff") or {}
                st = (do.get("status") or "").lower()
                legs.append(_row("Dropoff", st, False, False, st in {"courier_assigned","pickup_en_route","at_pickup"}, do.get("deliveryId")))
            any_fee_possible = any(r["Fee"] == "Possible" for r in legs)
        else:
            any_fee_possible = False

        if legs:
            rows_html = "\n".join(
                f"<tr><td>{r['Leg']}</td><td>{r['Stage']}</td><td>{r['Action']}</td><td>{r['Fee']}</td><td>{r['Delivery ID']}</td></tr>"
                for r in legs
            )
            fee_line = "<p><em>Note:</em> An Uber cancellation fee may apply depending on Uber’s final assessment.</p>" if any_fee_possible else ""
            uber_html = f"""
            <div class="section-title">Uber Update</div>
            <table>
              <thead>
                <tr>
                  <th>Leg</th><th>Stage</th><th>Action</th><th>Fee Impact</th><th>Delivery ID</th>
                </tr>
              </thead>
              <tbody>
                {rows_html}
              </tbody>
            </table>
            {fee_line}
            """
            # SMS-friendly short line
            def _short(r):  # if you'd like zero nested defs, inline this join directly
                s = f"{r['Leg']}—{r['Action']} at {r['Stage']}"
                if r["Fee"] == "Possible": s += " (fee may apply)"
                return s
            uber_sms = " Uber: " + " | ".join(_short(r) for r in legs)
        else:
            uber_html = ""
            uber_sms = ""

        # --------- Customer HTML ----------
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
            <p>Your order with Order ID <strong>{order_id}</strong> from <strong>{laundry_name}</strong> has been successfully canceled.</p>
            {"<div class='section-title'>Schedule Summary</div>" if (pickup_date or pickup_time_interval or dropoff_date or dropoff_time_interval) else ""}
            {"<table><tbody>" if (pickup_date or pickup_time_interval or dropoff_date or dropoff_time_interval) else ""}
            {"<tr><th>Pickup</th><td>" + pickup_date + " " + pickup_time_interval + "</td></tr>" if (pickup_date or pickup_time_interval) else ""}
            {"<tr><th>Delivery</th><td>" + dropoff_date + " " + dropoff_time_interval + "</td></tr>" if (dropoff_date or dropoff_time_interval) else ""}
            {"</tbody></table>" if (pickup_date or pickup_time_interval or dropoff_date or dropoff_time_interval) else ""}
            {uber_html}
            <p>If you have any questions or need further assistance, reach us at:</p>
            <ul>
                <li>Email: {support_email}</li>
                <li>Phone: {support_phone}</li>
            </ul>
            <p>Warm regards,</p>
            <p><strong>{laundry_name} Team</strong></p>
        </body>
        </html>
        """

        # --------- Admin HTML ----------
        services_str = ", ".join([s.get('serviceName','') for s in order_details.get('services', [])]) or "-"
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
        <p>Dear Laundry Team,</p>
        <p>An order has been canceled with the following details:</p>
        <p class="section-title">Order Details</p>
        <table>
          <tbody>
            <tr><th>Order ID</th><td>{order_id}</td></tr>
            <tr><th>Customer Name</th><td>{customer.get('firstName','Customer')} {customer.get('lastName','')}</td></tr>
            <tr><th>Services</th><td>{services_str}</td></tr>
            <tr><th>Pickup</th><td>{pickup_date} {pickup_time_interval}</td></tr>
            <tr><th>Delivery</th><td>{dropoff_date} {dropoff_time_interval}</td></tr>
          </tbody>
        </table>
        {uber_html}
        <p>Please ensure system updates are completed accordingly.</p>
        <p>Warm regards,</p>
        <p><strong>{laundry_name} Team</strong></p>
        </body>
        </html>
        """

        # --------- Send notifications ----------
        if customer.get('notification_preferences', {}).get('email', False) and customer.get('email'):
            invoke_notification_lambda(
                notification_type="email",
                recipient=customer['email'],
                message=notification_message,
                subject="Order Cancellation Notice",
                sender=support_email
            )

        if customer.get('notification_preferences', {}).get('phone', False) and customer.get('phoneNumber'):
            sms_message = (
                f"Your order {order_id} has been canceled."
                f"{(' Pickup: ' + pickup_date + ' ' + pickup_time_interval) if (pickup_date or pickup_time_interval) else ''}"
                f"{(' Delivery: ' + dropoff_date + ' ' + dropoff_time_interval) if (dropoff_date or dropoff_time_interval) else ''}"
                f"{(' ' + uber_sms) if legs else ''}"
                f" For help: {support_phone}."
            )
            invoke_notification_lambda(
                notification_type="sms",
                recipient=customer['phoneNumber'],
                message=sms_message
            )

        invoke_notification_lambda(
            notification_type="email",
            recipient=support_email,
            message=laundry_notification_message,
            subject=f"Order Cancelled at {laundry_name}",
            sender=support_email
        )

        logger.info("Cancellation notifications sent successfully.")
    except Exception as e:
        logger.exception(f"Error in send_cancellation_notification: {str(e)}")
        raise


# def send_commercial_order_notification(recipient_email, subject, order_details, laundry_info, is_customer=False):
#     try:
#         laundry_name = laundry_info.get('laundryName', 'Our Laundry')
#         support_email = laundry_info.get('contactDetails', {}).get('email', 'support@example.com')
#         support_phone = laundry_info.get('contactDetails', {}).get('phoneNumber', 'N/A')

#         customer_name = order_details.get('customerName')
#         company_name = order_details.get('companyName')
#         contact_phone = order_details.get('contactPhone')
#         pickup_date = order_details.get('pickupDate')
#         dropoff_date = order_details.get('dropoffDate')

#         services_html = "".join([
#             f"<tr><td>{item['serviceName']}</td><td>{item['weightOrCount']}</td><td>{item['unitPrice']}</td></tr>"
#             for item in order_details.get('services', [])
#         ])

#         products_html = "".join([
#             f"<tr><td>{item['productName']}</td><td>{item['quantity']}</td><td>{item['unitPrice']}</td></tr>"
#             for item in order_details.get('products', [])
#         ])

#         message_body = f"""
#         <!DOCTYPE html>
#         <html>
#         <head>
#             <style>
#                 body {{ font-family: Arial; line-height: 1.6; background: #f9f9f9; padding: 20px; }}
#                 table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
#                 th, td {{ border: 1px solid #ccc; padding: 8px; text-align: left; }}
#                 th {{ background-color: #eee; }}
#             </style>
#         </head>
#         <body>
#             <p>Dear {customer_name if is_customer else laundry_name + " Team"},</p>
#             <p>{'Thank you for your order. Here are the details:' if is_customer else 'A new commercial laundry order has been placed.'}</p>

#             <p><strong>Order ID:</strong> {order_details['commercialOrderId']}</p>
#             <p><strong>Company:</strong> {company_name}</p>
#             <p><strong>Phone:</strong> {contact_phone}</p>
#             <p><strong>Pickup Date:</strong> {pickup_date}</p>
#             <p><strong>Dropoff Date:</strong> {dropoff_date}</p>

#             <h4>Services:</h4>
#             <table><tr><th>Service</th><th>Qty</th><th>Unit Price</th></tr>{services_html}</table>

#             <h4>Products:</h4>
#             <table><tr><th>Product</th><th>Qty</th><th>Unit Price</th></tr>{products_html}</table>

#             <p><strong>Total Price:</strong> ${order_details['totalPrice']}</p>

#             <p>For questions, contact us at:</p>
#             <ul>
#                 <li>Email: {support_email}</li>
#                 <li>Phone: {support_phone}</li>
#             </ul>

#             <p>Regards,<br><strong>{laundry_name} Team</strong></p>
#         </body>
#         </html>
#         """

#         invoke_notification_lambda(
#             notification_type="email",
#             recipient=recipient_email,
#             message=message_body,
#             subject=subject,
#             sender=support_email
#         )
#     except Exception as e:
#         logger.exception(f"Error sending commercial order notification to {recipient_email}: {str(e)}")

def send_commercial_order_notification(recipient_email, subject, order_details, laundry_info, is_customer=False):
    try:
        logger.info("📧 Preparing to send commercial order notification.")
        logger.debug(f"Recipient: {recipient_email}")
        logger.debug(f"Subject: {subject}")
        logger.debug(f"Order Details: {order_details}")
        logger.debug(f"Laundry Info: {laundry_info}")
        logger.debug(f"Is Customer Email: {is_customer}")

        laundry_name = laundry_info.get('laundryName', 'Our Laundry')
        support_email = laundry_info.get('contactDetails', {}).get('email', 'support@example.com')
        support_phone = laundry_info.get('contactDetails', {}).get('phoneNumber', 'N/A')

        customer_name = order_details.get('customerName', 'Valued Customer')
        company_name = order_details.get('companyName', 'N/A')
        contact_phone = order_details.get('contactPhone', 'N/A')
        pickup_date = order_details.get('pickupDate', 'N/A')
        dropoff_date = order_details.get('dropoffDate', 'N/A')
        commercial_order_id = order_details.get('commercialOrderId', 'Unknown')
        total_price = order_details.get('totalPrice')

        if total_price is None:
            logger.warning("⚠️ 'totalPrice' is missing in order_details.")
            total_price_display = 'N/A'
        else:
            total_price_display = f"${total_price}"

        logger.debug("✅ Order fields extracted successfully.")

        services_html = "".join([
            f"<tr><td>{item.get('serviceName', '')}</td><td>{item.get('weightOrCount', '')}</td><td>{item.get('unitPrice', '')}</td></tr>"
            for item in order_details.get('services', [])
        ])
        logger.debug(f"🧺 Services HTML: {services_html}")

        products_html = "".join([
            f"<tr><td>{item.get('productName', '')}</td><td>{item.get('quantity', '')}</td><td>{item.get('unitPrice', '')}</td></tr>"
            for item in order_details.get('products', [])
        ])
        logger.debug(f"📦 Products HTML: {products_html}")

        message_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial; line-height: 1.6; background: #f9f9f9; padding: 20px; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
                th, td {{ border: 1px solid #ccc; padding: 8px; text-align: left; }}
                th {{ background-color: #eee; }}
            </style>
        </head>
        <body>
            <p>Dear {customer_name if is_customer else laundry_name + " Team"},</p>
            <p>{'Thank you for your order. Here are the details:' if is_customer else 'A new commercial laundry order has been placed.'}</p>

            <p><strong>Order ID:</strong> {commercial_order_id}</p>
            <p><strong>Company:</strong> {company_name}</p>
            <p><strong>Phone:</strong> {contact_phone}</p>
            <p><strong>Pickup Date:</strong> {pickup_date}</p>
            <p><strong>Dropoff Date:</strong> {dropoff_date}</p>

            <h4>Services:</h4>
            <table><tr><th>Service</th><th>Qty</th><th>Unit Price</th></tr>{services_html}</table>

            <h4>Products:</h4>
            <table><tr><th>Product</th><th>Qty</th><th>Unit Price</th></tr>{products_html}</table>

            <p><strong>Total Price:</strong> {total_price_display}</p>

            <p>For questions, contact us at:</p>
            <ul>
                <li>Email: {support_email}</li>
                <li>Phone: {support_phone}</li>
            </ul>

            <p>Regards,<br><strong>{laundry_name} Team</strong></p>
        </body>
        </html>
        """

        logger.info(f"📨 Sending email to {recipient_email} with subject '{subject}'")
        invoke_notification_lambda(
            notification_type="email",
            recipient=recipient_email,
            message=message_body,
            subject=subject,
            sender=support_email
        )
        logger.info("✅ Notification dispatched successfully.")
    except Exception as e:
        logger.exception(f"❌ Error sending commercial order notification to {recipient_email}: {str(e)}")
