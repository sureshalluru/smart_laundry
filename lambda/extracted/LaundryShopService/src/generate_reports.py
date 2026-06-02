"""
generate_reports.py — order report generation and email delivery.
Migrated from DynamoDB to PostgreSQL.
"""
import json
import csv
import boto3
from io import StringIO
from datetime import datetime
from decimal import Decimal
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import db

ses_client = boto3.client('ses', region_name='us-east-1')


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def get_order_data(laundry_id, start_date, end_date):
    cur = db.get_cursor()
    cur.execute("""
        SELECT o.order_id, o.customer_id, o.order_type, o.order_status,
               o.address_id, o.laundry_id, o.created_at, o.dropoff_date,
               o.coupon, o.total_cost,
               ot.tip_amount,
               json_agg(json_build_object(
                   'serviceName', os.service_name,
                   'servicePrice', os.service_price,
                   'weightOrCount', os.weight_or_count
               )) AS services
        FROM orders.orders o
        LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
        LEFT JOIN orders.order_services os ON os.order_id = o.order_id
        WHERE o.laundry_id = %s
          AND o.created_at BETWEEN %s AND %s
        GROUP BY o.order_id, ot.tip_amount
        ORDER BY o.created_at DESC
    """, (laundry_id, start_date, end_date))

    rows = cur.fetchall()
    return [{
        "OrderId": r["order_id"],
        "CustomerId": r["customer_id"],
        "OrderType": r["order_type"],
        "Services": json.dumps(r["services"] or [], default=decimal_default),
        "OrderStatus": r["order_status"],
        "AddressId": r["address_id"],
        "laundryId": r["laundry_id"],
        "CreatedAt": str(r["created_at"]),
        "DropOffDate": str(r["dropoff_date"]) if r["dropoff_date"] else "",
        "Coupon": r["coupon"] or "",
        "OrderTotal": float(r["total_cost"] or 0),
        "Tip": float(r["tip_amount"] or 0),
    } for r in rows]


def get_customer_data():
    cur = db.get_cursor()
    cur.execute("""
        SELECT c.customer_id, c.first_name, c.last_name,
               json_agg(json_build_object(
                   'addressId', ca.address_id,
                   'address', ca.address,
                   'addressInstructions', ca.address_instructions,
                   'doorNumber', ca.door_number
               )) AS addresses
        FROM shop.customers c
        LEFT JOIN shop.customer_addresses ca ON ca.customer_id = c.customer_id AND ca.is_active = TRUE
        GROUP BY c.customer_id
    """)
    return {r["customer_id"]: dict(r) for r in cur.fetchall()}


def get_laundry_data(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT laundry_id, laundry_name, street, city, state, zip_code, country
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        return {}
    return {
        "laundryId": row["laundry_id"],
        "laundryName": row["laundry_name"],
        "laundryAddress": {
            "street": row["street"], "city": row["city"],
            "state": row["state"], "zipCode": row["zip_code"], "country": row["country"]
        }
    }


def generate_csv(order_data, customer_data, laundry_data):
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "OrderId", "OrderType", "CreatedAt", "Services", "OrderStatus",
        "CustomerId", "First Name", "Last Name", "AddressId", "Addresses",
        "DropOffDate", "Coupon", "OrderTotal", "Tip",
        "LaundryId", "LaundryName", "LaundryAddress"
    ])

    for order in order_data:
        customer = customer_data.get(order["CustomerId"], {})
        sub_address = ""
        for addr in (customer.get("addresses") or []):
            if addr and addr.get("addressId") == order["AddressId"]:
                sub_address = addr.get("address", "")
                break

        la = laundry_data.get("laundryAddress", {})
        laundry_addr_str = f"{la.get('street','')} {la.get('city','')} {la.get('state','')} {la.get('zipCode','')} {la.get('country','')}".strip()

        writer.writerow([
            order["OrderId"], order["OrderType"], order["CreatedAt"],
            order["Services"], order["OrderStatus"],
            customer.get("customer_id", ""),
            customer.get("first_name", ""), customer.get("last_name", ""),
            order["AddressId"], sub_address,
            order["DropOffDate"], order["Coupon"],
            order["OrderTotal"], order["Tip"],
            order["laundryId"], laundry_data.get("laundryName", ""), laundry_addr_str
        ])

    return output.getvalue()


def send_email_with_attachment(sender, recipient, subject, csv_data, laundry_id, laundry_name):
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    msg.attach(MIMEText(f"Hello,\n\nPlease find attached the Sales report for {laundry_name}.\n\nThank you.", "plain"))

    attachment = MIMEBase("text", "csv")
    attachment.set_payload(csv_data.encode("utf-8"))
    encoders.encode_base64(attachment)
    attachment.add_header("Content-Disposition", "attachment", filename="report.csv")
    msg.attach(attachment)

    response = ses_client.send_raw_email(
        Source=sender, Destinations=[recipient],
        RawMessage={"Data": msg.as_string()}
    )
    return {"statusCode": 200, "body": f"Email sent! Message ID: {response['MessageId']}"}


def generate_order_reports(start_date, end_date, laundry_id):
    try:
        order_data = get_order_data(laundry_id, start_date, end_date)
        customer_data = get_customer_data()
        laundry_data = get_laundry_data(laundry_id)
        csv_data = generate_csv(order_data, customer_data, laundry_data)
        return send_email_with_attachment(
            sender="roundrocklaundry@gmail.com",
            recipient="hdwarakacharla@gmail.com",
            subject="Laundry Sales Report",
            csv_data=csv_data,
            laundry_id=laundry_id,
            laundry_name=laundry_data.get("laundryName", "")
        )
    except Exception as e:
        return {"statusCode": 400, "body": json.dumps({"error": str(e)})}
