"""
notifications.py — email/SMS body generation and dispatch.
The employee lookup is migrated to PostgreSQL; notification dispatch is unchanged.
"""
import json
import logging
import os
import boto3
import requests
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
base_url = os.getenv("BASE_URL", "https://main.d2th8pw9g4ufxz.amplifyapp.com")


# URL shortening REMOVED — TinyURL shows ad interstitial pages to recipients.
def shorten_url(long_url):
    """No-op: returns the URL as-is. TinyURL removed because carriers show ad pages."""
    return long_url


def _get_employee_name(tip_receiver_id, laundry_id):
    if not tip_receiver_id:
        return ""
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT first_name, last_name FROM shop.employees
            WHERE emp_id = %s AND laundry_id = %s
        """, (tip_receiver_id, laundry_id))
        row = cur.fetchone()
        if row:
            return f"{row['first_name']} {row['last_name']}".strip()
    except Exception as e:
        logger.error("_get_employee_name error: %s", e)
    return ""


def invoke_notification_lambda(notification_preference, email_body, sms_body,
                                customer_email, customer_phone, shop_email):
    try:
        if notification_preference.get('email', False) and customer_email:
            lambda_client.invoke(
                FunctionName="customerNotificationService",
                InvocationType="Event",
                Payload=json.dumps({
                    "type": "email", "recipient": customer_email, "sender": shop_email,
                    "subject": "Your Laundry Order Update", "message": email_body
                })
            )
        if notification_preference.get('phone', False) and customer_phone:
            lambda_client.invoke(
                FunctionName="customerNotificationService",
                InvocationType="Event",
                Payload=json.dumps({"type": "sms", "recipient": customer_phone, "message": sms_body})
            )
    except Exception as e:
        logger.error("invoke_notification_lambda error: %s", e)


def generate_sms_body(current_order, orderId, new_status, updated_services, updated_products, total_cost, laundryId):
    final_status = new_status or current_order.get('orderStatus', 'Unknown')
    order_url = f"{base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"
    short_url = shorten_url(order_url)

    if final_status in ["OrderPickedUp", "Delivered"]:
        tip_receiver_id = current_order.get('tip', {}).get('tipReceiverId')
        emp_name = _get_employee_name(tip_receiver_id, laundryId) or "our team member"
        first = emp_name.split()[0] if emp_name != "our team member" else "we"
        body = (f"Hi {current_order.get('customerName', 'there')},\n\n"
                f"Your laundry has been delivered, folded with care by {emp_name}.\n\n"
                f"How did {first} do? Leave a Review:\n🔗 {short_url}\n")
        return body

    body = f"Order #{orderId} Update:\nOrder Status: {final_status}\n\n"
    if final_status == "ProcessingCompleted" and current_order.get("orderType") == "InStore":
        body += f"\nYour order is ready for pickup.\n🔗 Pay Now: {short_url}\n"
    else:
        body += f"\n🔗 View Order Details: {short_url}\n"
    if final_status == "EnRouteToDelivery":
        body += f"\nTotal Cost: ${total_cost:.2f}\n"
    body += f"\nThank you for choosing {current_order.get('laundryName', '')}!"
    return body


def generate_email_body(current_order, updated_services, updated_products, orderId, new_status, total_cost, laundryId):
    final_status = new_status or current_order.get('orderStatus')
    order_url = f"{base_url}/{laundryId}/user/my-orders/?order_id={orderId}&is_open=true"

    if final_status in ["OrderPickedUp", "Delivered"]:
        tip_receiver_id = current_order.get('tip', {}).get('tipReceiverId')
        emp_name = _get_employee_name(tip_receiver_id, laundryId) or "our team member"
        first = emp_name.split()[0] if emp_name != "our team member" else "we"
        body = f"""<html><body>
            <h2>Your Laundry Has Been Delivered</h2>
            <p>Hi {current_order.get('customerName', 'there')},</p>
            <p>Your laundry was delivered, folded with care by <strong>{emp_name}</strong>.</p>
            <p>How did {first} do? <a href="{order_url}">Leave a Review</a></p>
            <p>Thank you for choosing {current_order.get('laundryName', '')}!</p>
        </body></html>"""
        return True, body

    services_rows = "".join(
        f"<tr><td>{s.get('serviceName')}</td><td>{s.get('weightOrCount')}</td></tr>"
        for s in updated_services)
    products_rows = "".join(
        f"<tr><td>{p.get('productName')}</td><td>{p.get('productCount', 1)}</td></tr>"
        for p in updated_products)

    pay_now_btn = ""
    if final_status == "ProcessingCompleted" and current_order.get("orderType") == "InStore":
        pay_now_btn = f'<p><a href="{order_url}" style="background:#28a745;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">Pay Now</a></p>'

    body = f"""<html><body style="font-family:Arial,sans-serif;">
        <p>Dear {current_order.get('customerName', 'Customer')},</p>
        <p>Your order <strong>#{orderId}</strong> has been updated.</p>
        <p><strong>Order Status: {final_status}</strong></p>
        {pay_now_btn}
        <p><a href="{order_url}">View Order Details</a></p>
        <table border="1" cellpadding="6"><thead><tr><th>Service</th><th>Weight/Count</th></tr></thead>
        <tbody>{services_rows}</tbody></table>
        <table border="1" cellpadding="6"><thead><tr><th>Product</th><th>Count</th></tr></thead>
        <tbody>{products_rows}</tbody></table>
        {"<p><strong>Total Cost: $" + f"{total_cost:.2f}" + "</strong></p>" if final_status == "EnRouteToDelivery" else ""}
        <p>Thank you for choosing {current_order.get('laundryName', '')}!</p>
    </body></html>"""
    return True, body
