"""
PostgreSQL helpers for UberIntegration.
Replaces DynamoDB reads/writes for orders and shop credentials.
"""
import json
import db


def get_laundry_credentials(laundry_id, uber_env=None):
    cur = db.get_cursor()
    cur.execute("""
        SELECT ls.laundry_timezone, ls.pickup_dropoff_instructions, ls.laundry_name,
               ls.contact_phone, luc.env, luc.base_url, luc.client_id,
               luc.client_secret, luc.customer_id, luc.webhook_secret,
               (SELECT env FROM shop.laundry_shops WHERE laundry_id = %s) AS uber_env
        FROM shop.laundry_shops ls
        JOIN shop.laundry_uber_credentials luc ON luc.laundry_id = ls.laundry_id
        WHERE ls.laundry_id = %s
          AND luc.env = COALESCE(%s, (SELECT uber_env FROM shop.laundry_shops WHERE laundry_id = %s LIMIT 1))
        LIMIT 1
    """, (laundry_id, laundry_id, uber_env, laundry_id))
    # Fallback: just get the uber_env from laundry_shops and then credentials
    cur.execute("""
        SELECT ls.laundry_timezone, ls.pickup_dropoff_instructions,
               luc.env, luc.base_url, luc.client_id, luc.client_secret,
               luc.customer_id, luc.webhook_secret
        FROM shop.laundry_shops ls
        JOIN shop.laundry_uber_credentials luc ON luc.laundry_id = ls.laundry_id
        WHERE ls.laundry_id = %s
        ORDER BY CASE WHEN luc.env = %s THEN 0 ELSE 1 END
        LIMIT 1
    """, (laundry_id, uber_env or 'test'))
    row = cur.fetchone()
    if not row:
        raise KeyError(f"Uber credentials not found for laundryId: {laundry_id}")
    return {
        "clientId": row["client_id"],
        "clientSecret": row["client_secret"],
        "customerId": row["customer_id"],
        "baseUrl": row["base_url"],
        "timeZone": row["laundry_timezone"] or "America/Chicago",
        "uberEnv": row["env"],
        "pickupDropoffInstructions": (row["pickup_dropoff_instructions"] or "").strip(),
    }


def get_order(order_id):
    cur = db.get_cursor()
    cur.execute("SELECT * FROM orders.orders WHERE order_id = %s", (order_id,))
    return cur.fetchone()


def update_order_status(order_id, new_status):
    cur = db.get_cursor()
    cur.execute("""
        UPDATE orders.orders SET order_status = %s, updated_at = NOW()
        WHERE order_id = %s
    """, (new_status, order_id))
    db.commit()


def update_order_service_field(order_id, field, value):
    """Update pickupService or dropoffService on an order."""
    allowed = {"pickup_service", "dropoff_service"}
    if field not in allowed:
        raise ValueError(f"Field {field} not allowed")
    cur = db.get_cursor()
    cur.execute(f"UPDATE orders.orders SET {field} = %s WHERE order_id = %s", (value, order_id))
    db.commit()


def get_customer(customer_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT customer_id, first_name, last_name, phone_number, email,
               notif_email, notif_sms, notif_phone
        FROM shop.customers WHERE customer_id = %s
    """, (customer_id,))
    return cur.fetchone()


def get_laundry_shop(laundry_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT laundry_name, contact_email, contact_phone, pickup_dropoff_instructions,
               street, city, state, zip_code, country
        FROM shop.laundry_shops WHERE laundry_id = %s
    """, (laundry_id,))
    return cur.fetchone()


def get_frequency_by_address(customer_id, address_id):
    cur = db.get_cursor()
    cur.execute("""
        SELECT frequency_id FROM orders.laundry_frequency
        WHERE customer_id = %s AND address_id = %s AND is_active = TRUE
        LIMIT 1
    """, (customer_id, address_id))
    return cur.fetchone()


def update_frequency_uber_flags(frequency_id, pickup_service=None, dropoff_service=None):
    sets, vals = [], []
    if pickup_service is not None:
        sets.append("uber_pickup_frequency = %s")
        vals.append(pickup_service == "Uber")
    if dropoff_service is not None:
        sets.append("uber_dropoff_frequency = %s")
        vals.append(dropoff_service == "Uber")
    if not sets:
        return
    vals.append(frequency_id)
    cur = db.get_cursor()
    cur.execute(f"UPDATE orders.laundry_frequency SET {', '.join(sets)} WHERE frequency_id = %s", vals)
    db.commit()
