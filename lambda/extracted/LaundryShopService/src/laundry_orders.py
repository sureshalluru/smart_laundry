"""
laundry_orders.py — order queries for LaundryShopService.
Migrated from DynamoDB to PostgreSQL.
"""
import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def convert_decimal_to_float(data):
    if isinstance(data, list):
        return [convert_decimal_to_float(i) for i in data]
    if isinstance(data, dict):
        return {k: convert_decimal_to_float(v) for k, v in data.items()}
    if isinstance(data, Decimal):
        return float(data)
    return data


def get_driver_orders_by_date_range(event):
    try:
        params = event.get('queryStringParameters', {}) or {}
        laundry_id = params.get('laundryId')
        body = event.get('body', '{}')
        if isinstance(body, str):
            body = json.loads(body)

        start_date = datetime.strptime(body.get('startDate'), "%Y-%m-%d").date()
        end_date = datetime.strptime(body.get('endDate'), "%Y-%m-%d").date()

        cur = db.get_cursor()
        cur.execute("""
            SELECT o.order_id, o.customer_id, o.address_id, o.order_type, o.order_status,
                   o.payment_status, o.pickup_date, o.pickup_time_interval,
                   o.dropoff_date, o.dropoff_time_interval,
                   o.laundry_bags, o.special_instructions, o.total_cost, o.grand_total,
                   o.created_at, o.updated_at,
                   c.first_name, c.last_name, c.phone_number,
                   ca.address AS customer_address,
                   ca.address_instructions AS delivery_instructions,
                   ca.door_number
            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
            WHERE o.laundry_id = %s
              AND o.order_type = 'Online'
              AND (
                (o.order_status IN ('OrderSubmitted','ReadyForIntake') AND o.pickup_date BETWEEN %s AND %s)
                OR
                (o.order_status IN ('EnRouteToDelivery') AND o.dropoff_date BETWEEN %s AND %s)
              )
            ORDER BY COALESCE(o.pickup_date, o.dropoff_date) ASC
        """, (laundry_id, start_date, end_date, start_date, end_date))

        rows = cur.fetchall()
        orders = []
        for r in rows:
            d = db.serialize_row(r)
            # Merge first/last name into customerName
            d['customerName'] = f"{d.pop('firstName', '')} {d.pop('lastName', '')}".strip()
            d['customerPhone'] = d.pop('phoneNumber', '')
            d.setdefault('pickupService', 'LaundryDriver')
            d.setdefault('dropoffService', 'LaundryDriver')
            orders.append(d)

        return {"statusCode": 200, "body": {"orders": orders}}

    except ValueError as ve:
        return {"statusCode": 400, "body": json.dumps({"error": str(ve)})}
    except Exception as e:
        logger.exception("get_driver_orders_by_date_range error")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


def get_orders_by_laundry_id(laundry_id, start_date=None, end_date=None):
    try:
        cur = db.get_cursor()
        query = """
            SELECT order_id, customer_id, order_type, order_status, payment_status,
                   pickup_date, dropoff_date, total_cost, grand_total, created_at
            FROM orders.orders
            WHERE laundry_id = %s
        """
        params = [laundry_id]
        if start_date and end_date:
            query += " AND created_at BETWEEN %s AND %s"
            params += [start_date, end_date]
        query += " ORDER BY created_at DESC"

        cur.execute(query, params)
        rows = [db.serialize_row(r) for r in cur.fetchall()]
        return {"status": "success", "orders": rows}
    except Exception as e:
        logger.exception("get_orders_by_laundry_id error")
        raise RuntimeError(f"Unexpected error: {str(e)}")


def view_tips_by_laundry_id(params):
    try:
        laundry_id = params.get("laundryId")
        if not laundry_id:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing laundryId"})}

        today = datetime.utcnow()
        first_this = datetime(today.year, today.month, 1)
        first_last = (first_this - timedelta(days=1)).replace(day=1)

        start_date = params.get("startDate") or first_last.strftime("%Y-%m-%d")
        end_date = params.get("endDate") or today.strftime("%Y-%m-%d")

        cur = db.get_cursor()
        cur.execute("""
            SELECT o.order_id, o.created_at, o.total_cost, o.grand_total,
                   ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
            FROM orders.orders o
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.laundry_id = %s
              AND DATE(o.created_at) BETWEEN %s AND %s
            ORDER BY o.created_at DESC
        """, (laundry_id, start_date, end_date))

        rows = cur.fetchall()
        tip_data = [{
            "orderId": r["order_id"],
            "createdAt": str(r["created_at"]),
            "totalCost": float(r["total_cost"] or 0),
            "grandTotal": float(r["grand_total"] or 0),
            "tipReceiverId": r["tip_receiver_id"] or "",
            "tipPercentage": float(r["tip_percentage"]) if r["tip_percentage"] else None,
            "tipType": r["tip_type"] or "",
            "tipAmount": float(r["tip_amount"] or 0),
            "tipMethod": r["tip_method"] or "",
        } for r in rows]

        return {"statusCode": 200, "body": tip_data}

    except Exception as e:
        logger.exception("view_tips_by_laundry_id error")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
