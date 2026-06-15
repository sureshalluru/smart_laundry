"""Check all active frequency subscriptions that should have had orders created but didn't."""
import psycopg2, psycopg2.extras
from datetime import datetime, timedelta

conn = psycopg2.connect(
    host='smart-laundry.cpy626ke6rm6.us-east-1.rds.amazonaws.com',
    port=5432, dbname='smart_laundry', user='smart_laundry',
    password='tNxSN6rX6eB0LTHlSDff'
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

today = '2026-06-15'
tomorrow = '2026-06-16'

# Find all active subscriptions where future_pickup_date <= today
# (these should already have orders created)
cur.execute("""
    SELECT lf.frequency_id, lf.customer_id, lf.laundry_id, lf.frequency,
           lf.future_pickup_date, lf.pickup_time_interval, lf.dropoff_time_interval,
           lf.address_id,
           c.first_name, c.last_name, c.phone_number
    FROM orders.laundry_frequency lf
    JOIN shop.customers c ON c.customer_id = lf.customer_id
    WHERE lf.is_active = TRUE AND lf.future_pickup_date <= %s
    ORDER BY lf.future_pickup_date
""", (today,))

due_subs = cur.fetchall()
print(f"=== Active subscriptions with future_pickup_date <= {today} ===")
print(f"Found {len(due_subs)} subscriptions that may be missed\n")

missed = []
for sub in due_subs:
    # Check if an order already exists for this customer with this pickup date
    cur.execute("""
        SELECT order_id FROM orders.orders
        WHERE customer_id = %s AND pickup_date = %s AND auto_generated = TRUE
    """, (sub['customer_id'], sub['future_pickup_date']))
    existing = cur.fetchone()
    
    if existing:
        print(f"  ✅ {sub['first_name']} {sub['last_name']} | Due: {sub['future_pickup_date']} | Order exists: {existing['order_id']}")
    else:
        print(f"  ❌ {sub['first_name']} {sub['last_name']} | Due: {sub['future_pickup_date']} | NO ORDER CREATED | Phone: {sub['phone_number']}")
        missed.append(sub)

print(f"\n=== MISSED ORDERS (need to be created) ===")
print(f"Total missed: {len(missed)}")
for m in missed:
    print(f"  {m['first_name']} {m['last_name']} | Freq: {m['frequency']} | Pickup should be: {m['future_pickup_date']} | Time: {m['pickup_time_interval']}")

conn.close()
