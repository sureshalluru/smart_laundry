"""
Seed script for Demo Mode — clones real data from Round Rock laundry (id=1)
into demo laundry (id=999) with masked phone numbers and names.

Usage:
    python -m scripts.seed_demo_data

Idempotent: deletes existing demo data (laundry_id=999) then re-seeds.
Safe: only READS from laundry 1, WRITES to laundry 999. Never modifies source.
"""
import sys
import os
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
import random

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db, get_cursor

DEMO_LAUNDRY_ID = "999"
DEMO_CUSTOMER_ID = "demo-customer-001"
DEMO_EMPLOYEE_ID = "DEMO01"
SOURCE_LAUNDRY_ID = "1"

# ── Fake name pools for masking ───────────────────────────────────────────────

FIRST_NAMES = [
    "Sarah", "James", "Maria", "David", "Lisa", "Robert", "Emily", "Michael",
    "Jessica", "Andrew", "Amanda", "Daniel", "Rachel", "Kevin", "Nicole",
    "Brian", "Laura", "Steven", "Ashley", "Jason", "Megan", "Chris", "Katie",
    "Ryan", "Samantha", "Tyler", "Heather", "Brandon", "Amber", "Patrick",
]

LAST_NAMES = [
    "Johnson", "Williams", "Garcia", "Chen", "Mitchell", "Davis", "Rodriguez",
    "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White",
    "Harris", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright",
    "Green", "Baker", "Adams", "Nelson", "Carter", "Phillips", "Evans", "Turner",
]


def mask_name(original_id: str, index: int) -> tuple:
    """Generate a deterministic fake name from an ID + index."""
    seed = int(hashlib.md5(f"{original_id}-{index}".encode()).hexdigest()[:8], 16)
    first = FIRST_NAMES[seed % len(FIRST_NAMES)]
    last = LAST_NAMES[(seed // len(FIRST_NAMES)) % len(LAST_NAMES)]
    return first, last


def mask_phone(index: int) -> str:
    """Generate a +1555 test phone number (bypasses OTP in test mode)."""
    return f"+1555{index:07d}"


def mask_email(first: str, last: str) -> str:
    """Generate a fake email."""
    return f"{first.lower()}.{last.lower()[0]}@example.com"


# ── Clean existing demo data ─────────────────────────────────────────────────

def clean_demo_data(cur):
    """Delete all existing demo data for idempotency."""
    print("🗑️  Cleaning existing demo data (laundry_id=999)...")

    # Helper to safely execute DELETE (skip if table doesn't exist)
    def safe_delete(sql, params):
        try:
            cur.execute(sql, params)
        except Exception as e:
            if "does not exist" in str(e):
                cur.execute("ROLLBACK TO clean_savepoint")
            else:
                raise

    # Use savepoints so individual failures don't kill the transaction
    cur.execute("SAVEPOINT clean_savepoint")

    # Orders schema
    for table in ['orders.order_services', 'orders.order_tips', 'orders.order_payments', 'orders.order_history', 'orders.order_products']:
        try:
            cur.execute("SAVEPOINT clean_savepoint")
            cur.execute(f"DELETE FROM {table} WHERE order_id IN (SELECT order_id FROM orders.orders WHERE laundry_id = %s)", (DEMO_LAUNDRY_ID,))
            cur.execute("RELEASE SAVEPOINT clean_savepoint")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT clean_savepoint")
            cur.execute("RELEASE SAVEPOINT clean_savepoint")

    try:
        cur.execute("SAVEPOINT clean_savepoint")
        cur.execute("DELETE FROM orders.orders WHERE laundry_id = %s", (DEMO_LAUNDRY_ID,))
        cur.execute("RELEASE SAVEPOINT clean_savepoint")
    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT clean_savepoint")
        cur.execute("RELEASE SAVEPOINT clean_savepoint")

    # Shop schema
    for table in ['shop.customer_laundry_stats', 'shop.drivers', 'shop.employees', 'shop.laundry_services', 'shop.laundry_products', 'shop.delivery_time_slots', 'shop.instore_pickup_time_slots', 'shop.service_categories']:
        try:
            cur.execute("SAVEPOINT clean_savepoint")
            cur.execute(f"DELETE FROM {table} WHERE laundry_id = %s", (DEMO_LAUNDRY_ID,))
            cur.execute("RELEASE SAVEPOINT clean_savepoint")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT clean_savepoint")
            cur.execute("RELEASE SAVEPOINT clean_savepoint")

    # Delete demo customers
    try:
        cur.execute("SAVEPOINT clean_savepoint")
        cur.execute("DELETE FROM shop.customers WHERE customer_id LIKE 'demo-customer-%'")
        cur.execute("RELEASE SAVEPOINT clean_savepoint")
    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT clean_savepoint")
        cur.execute("RELEASE SAVEPOINT clean_savepoint")

    # Delete demo laundry
    try:
        cur.execute("SAVEPOINT clean_savepoint")
        cur.execute("DELETE FROM shop.laundry_shops WHERE laundry_id = %s", (DEMO_LAUNDRY_ID,))
        cur.execute("RELEASE SAVEPOINT clean_savepoint")
    except Exception:
        cur.execute("ROLLBACK TO SAVEPOINT clean_savepoint")
        cur.execute("RELEASE SAVEPOINT clean_savepoint")

    print("   ✅ Cleaned.")


# ── Clone laundry shop ────────────────────────────────────────────────────────

def clone_laundry(cur):
    """Clone the laundry_shops row from source, change name and ID."""
    print("🏪 Cloning laundry shop...")

    cur.execute("SELECT * FROM shop.laundry_shops WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
    source = cur.fetchone()

    if not source:
        print("   ❌ Source laundry (id=1) not found! Cannot clone.")
        sys.exit(1)

    # Get column names (skip laundry_id, we override it)
    columns = [k for k in source.keys() if k != 'laundry_id']

    # Build the insert — override identifying fields
    overrides = {
        'laundry_name': 'Demo Laundry - Austin',
        'laundry_phone': '+15550000000',
        'laundry_email': 'demo@smartlaundrybasket.ai',
        'stripe_public_key': None,       # No Stripe — forces Invoice-only checkout
        'stripe_secret_key': None,       # No Stripe — prevents real charges
        'stripe_terminal_id': None,      # No terminal
    }

    # Convert dict/list values to Json for JSONB columns
    from psycopg.types.json import Json

    col_names = ['laundry_id'] + columns
    raw_values = [DEMO_LAUNDRY_ID] + [overrides.get(c, source[c]) for c in columns]
    # Wrap dicts/lists in Json() adapter
    values = [Json(v) if isinstance(v, (dict, list)) else v for v in raw_values]
    placeholders = ', '.join(['%s'] * len(col_names))
    col_str = ', '.join(col_names)

    cur.execute(f"INSERT INTO shop.laundry_shops ({col_str}) VALUES ({placeholders}) ON CONFLICT (laundry_id) DO NOTHING", values)
    print(f"   ✅ Demo Laundry - Austin (ID: {DEMO_LAUNDRY_ID})")


# ── Clone employees ───────────────────────────────────────────────────────────

def clone_employees(cur):
    """Clone employees from source laundry, mask names."""
    print("👤 Cloning employees...")

    cur.execute("SELECT * FROM shop.employees WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
    employees = cur.fetchall()

    if not employees:
        # Create a default admin employee
        cur.execute("""
            INSERT INTO shop.employees (emp_id, first_name, last_name, role, passcode, laundry_id, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
        """, (DEMO_EMPLOYEE_ID, "Demo", "Admin", "Admin", "0000", DEMO_LAUNDRY_ID))
        print(f"   ✅ Created default DEMO01 admin")
        return

    for i, emp in enumerate(employees):
        first, last = mask_name(emp['emp_id'], i)
        new_emp_id = f"DEMO{i+1:02d}" if i > 0 else DEMO_EMPLOYEE_ID

        cur.execute("""
            INSERT INTO shop.employees (emp_id, first_name, last_name, role, passcode, laundry_id, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (emp_id) DO NOTHING
        """, (new_emp_id, first, last, emp.get('role', 'Employee'), '0000', DEMO_LAUNDRY_ID, True))
        print(f"   ✅ {new_emp_id}: {first} {last} ({emp.get('role', 'Employee')})")


# ── Clone customers ───────────────────────────────────────────────────────────

def clone_customers(cur):
    """Clone customers linked to source laundry, mask PII, return ID mapping."""
    print("👥 Cloning customers...")

    # Get customers who have orders or stats with source laundry
    cur.execute("""
        SELECT DISTINCT c.* FROM shop.customers c
        JOIN shop.customer_laundry_stats cls ON c.customer_id = cls.customer_id
        WHERE cls.laundry_id = %s
        LIMIT 30
    """, (SOURCE_LAUNDRY_ID,))
    customers = cur.fetchall()

    if not customers:
        print("   ⚠️  No customers found for source laundry. Creating defaults.")
        customers = []

    # Map: original_customer_id -> demo_customer_id
    id_map = {}

    for i, cust in enumerate(customers):
        demo_id = DEMO_CUSTOMER_ID if i == 0 else f"demo-customer-{i+1:03d}"
        first, last = mask_name(cust['customer_id'], i)
        phone = mask_phone(i + 1000)
        email = mask_email(first, last)

        id_map[cust['customer_id']] = demo_id

        cur.execute("""
            INSERT INTO shop.customers (customer_id, phone_number, email, first_name, last_name,
                                        notif_email, notif_sms, notif_phone)
            VALUES (%s, %s, %s, %s, %s, TRUE, TRUE, TRUE)
            ON CONFLICT (customer_id) DO NOTHING
        """, (demo_id, phone, email, first, last))

        # Clone the customer_laundry_stats (just create the link record)
        cur.execute("""
            INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
            VALUES (%s, %s)
            ON CONFLICT (customer_id, laundry_id) DO NOTHING
        """, (demo_id, DEMO_LAUNDRY_ID))

    print(f"   ✅ Cloned {len(id_map)} customers with masked PII")
    return id_map


# ── Clone drivers ─────────────────────────────────────────────────────────────

def clone_drivers(cur):
    """Clone drivers from source laundry, mask names, return ID mapping."""
    print("🚗 Cloning drivers...")

    cur.execute("SELECT * FROM shop.drivers WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
    drivers = cur.fetchall()

    driver_map = {}

    for i, drv in enumerate(drivers):
        demo_driver_id = f"demo-driver-{i+1:03d}"
        first, last = mask_name(drv['driver_id'], i + 100)
        phone = mask_phone(i + 2000)

        driver_map[drv['driver_id']] = demo_driver_id

        cur.execute("""
            INSERT INTO shop.drivers (driver_id, first_name, last_name, phone, laundry_id, is_active)
            VALUES (%s, %s, %s, %s, %s, TRUE)
            ON CONFLICT (driver_id) DO NOTHING
        """, (demo_driver_id, first, last, phone, DEMO_LAUNDRY_ID))
        print(f"   ✅ {first} {last}")

    if not drivers:
        # Create defaults
        for i in range(3):
            demo_driver_id = f"demo-driver-{i+1:03d}"
            first, last = mask_name(f"default-{i}", i + 100)
            phone = mask_phone(i + 2000)
            driver_map[f"default-{i}"] = demo_driver_id
            cur.execute("""
                INSERT INTO shop.drivers (driver_id, first_name, last_name, phone, laundry_id, is_active)
                VALUES (%s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (driver_id) DO NOTHING
            """, (demo_driver_id, first, last, phone, DEMO_LAUNDRY_ID))
        print("   ✅ Created 3 default drivers")

    return driver_map


# ── Clone orders ──────────────────────────────────────────────────────────────

def clone_orders(cur, customer_map: dict, driver_map: dict):
    """Clone orders from source laundry, remap customer/driver IDs. Uses dynamic columns."""
    print("📦 Cloning orders...")

    cur.execute("""
        SELECT * FROM orders.orders WHERE laundry_id = %s
        ORDER BY created_at DESC LIMIT 50
    """, (SOURCE_LAUNDRY_ID,))
    orders = cur.fetchall()

    if not orders:
        print("   ⚠️  No orders found for source laundry.")
        return {}

    cloned = 0
    order_id_map = {}

    # Get actual column names from the first row
    all_columns = list(orders[0].keys())

    # Columns we override or skip
    skip_columns = {'order_id'}
    override_columns = {'customer_id', 'laundry_id'}

    # Build list of columns to copy as-is
    copy_columns = [c for c in all_columns if c not in skip_columns and c not in override_columns]

    from psycopg.types.json import Json

    for i, order in enumerate(orders):
        original_customer = order.get('customer_id')
        demo_customer = customer_map.get(original_customer)
        if not demo_customer:
            continue

        original_driver = order.get('driver_id')
        demo_driver = driver_map.get(original_driver) if original_driver else None

        demo_order_id = f"DEMO-{i+1:04d}"
        order_id_map[order['order_id']] = demo_order_id

        # Build INSERT dynamically
        insert_columns = ['order_id', 'customer_id', 'laundry_id'] + copy_columns
        insert_values = [demo_order_id, demo_customer, DEMO_LAUNDRY_ID]

        for col in copy_columns:
            val = order.get(col)
            if isinstance(val, (dict, list)):
                insert_values.append(Json(val))
            else:
                insert_values.append(val)

        col_str = ', '.join(insert_columns)
        placeholders = ', '.join(['%s'] * len(insert_columns))

        try:
            cur.execute(f"SAVEPOINT order_save")
            cur.execute(f"INSERT INTO orders.orders ({col_str}) VALUES ({placeholders}) ON CONFLICT (order_id) DO NOTHING", insert_values)
            cur.execute(f"RELEASE SAVEPOINT order_save")
            cloned += 1
        except Exception as e:
            cur.execute(f"ROLLBACK TO SAVEPOINT order_save")
            cur.execute(f"RELEASE SAVEPOINT order_save")
            if cloned == 0:
                # Print first error for debugging
                print(f"   ⚠️  Order insert failed: {e}")
            continue

        # Clone order services
        try:
            cur.execute("SAVEPOINT svc_save")
            cur.execute("SELECT * FROM orders.order_services WHERE order_id = %s", (order['order_id'],))
            services = cur.fetchall()
            for svc in services:
                svc_cols = [c for c in svc.keys() if c != 'id']
                svc_vals = []
                for c in svc_cols:
                    v = svc[c]
                    if c == 'order_id':
                        v = demo_order_id
                    if isinstance(v, (dict, list)):
                        v = Json(v)
                    svc_vals.append(v)
                svc_col_str = ', '.join(svc_cols)
                svc_placeholders = ', '.join(['%s'] * len(svc_cols))
                cur.execute(f"INSERT INTO orders.order_services ({svc_col_str}) VALUES ({svc_placeholders})", svc_vals)
            cur.execute("RELEASE SAVEPOINT svc_save")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT svc_save")
            cur.execute("RELEASE SAVEPOINT svc_save")

    print(f"   ✅ Cloned {cloned} orders (from {len(orders)} source orders)")
    return order_id_map


# ── Clone laundry services & products ─────────────────────────────────────────

def clone_services(cur):
    """Clone laundry_services and laundry_products from source to demo laundry."""
    print("🛒 Cloning services & products...")

    from psycopg.types.json import Json

    # Clone laundry_services
    try:
        cur.execute("SAVEPOINT svc_clone")
        cur.execute("SELECT * FROM shop.laundry_services WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
        services = cur.fetchall()

        for svc in services:
            cols = [c for c in svc.keys() if c != 'service_id']  # skip auto-increment PK
            vals = []
            for c in cols:
                v = svc[c]
                if c == 'laundry_id':
                    v = DEMO_LAUNDRY_ID
                if isinstance(v, (dict, list)):
                    v = Json(v)
                vals.append(v)
            col_str = ', '.join(cols)
            placeholders = ', '.join(['%s'] * len(cols))
            cur.execute(f"INSERT INTO shop.laundry_services ({col_str}) VALUES ({placeholders})", vals)

        cur.execute("RELEASE SAVEPOINT svc_clone")
        print(f"   ✅ Cloned {len(services)} services")
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT svc_clone")
        cur.execute("RELEASE SAVEPOINT svc_clone")
        print(f"   ⚠️  Services clone failed: {e}")

    # Clone laundry_products
    try:
        cur.execute("SAVEPOINT prod_clone")
        cur.execute("SELECT * FROM shop.laundry_products WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
        products = cur.fetchall()

        for prod in products:
            cols = [c for c in prod.keys() if c != 'product_id']
            vals = []
            for c in cols:
                v = prod[c]
                if c == 'laundry_id':
                    v = DEMO_LAUNDRY_ID
                if isinstance(v, (dict, list)):
                    v = Json(v)
                vals.append(v)
            col_str = ', '.join(cols)
            placeholders = ', '.join(['%s'] * len(cols))
            cur.execute(f"INSERT INTO shop.laundry_products ({col_str}) VALUES ({placeholders})", vals)

        cur.execute("RELEASE SAVEPOINT prod_clone")
        print(f"   ✅ Cloned {len(products)} products")
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT prod_clone")
        cur.execute("RELEASE SAVEPOINT prod_clone")
        print(f"   ⚠️  Products clone failed: {e}")

    # Clone delivery_time_slots
    try:
        cur.execute("SAVEPOINT slots_clone")
        cur.execute("SELECT * FROM shop.delivery_time_slots WHERE laundry_id = %s", (SOURCE_LAUNDRY_ID,))
        slots = cur.fetchall()

        for slot in slots:
            cols = [c for c in slot.keys() if c != 'id']
            vals = []
            for c in cols:
                v = slot[c]
                if c == 'laundry_id':
                    v = DEMO_LAUNDRY_ID
                if isinstance(v, (dict, list)):
                    v = Json(v)
                vals.append(v)
            col_str = ', '.join(cols)
            placeholders = ', '.join(['%s'] * len(cols))
            cur.execute(f"INSERT INTO shop.delivery_time_slots ({col_str}) VALUES ({placeholders})", vals)

        cur.execute("RELEASE SAVEPOINT slots_clone")
        print(f"   ✅ Cloned {len(slots)} delivery time slots")
    except Exception as e:
        cur.execute("ROLLBACK TO SAVEPOINT slots_clone")
        cur.execute("RELEASE SAVEPOINT slots_clone")
        print(f"   ⚠️  Time slots clone failed: {e}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    print("\n🌱 Smart Laundry — Demo Data Seeder (Clone from Round Rock)")
    print("=" * 60)
    print(f"   Source: laundry_id = {SOURCE_LAUNDRY_ID} (Round Rock) — READ ONLY")
    print(f"   Target: laundry_id = {DEMO_LAUNDRY_ID} (Demo) — WRITE ONLY")
    print("=" * 60)

    # ⛔ SAFETY: Abort if DEMO_LAUNDRY_ID is accidentally set to a real laundry
    PROTECTED_IDS = ["1", "2", "11"]  # Round Rock, Spin and Shine, Clean-Rite
    if DEMO_LAUNDRY_ID in PROTECTED_IDS:
        print(f"\n❌ ABORT: DEMO_LAUNDRY_ID is set to '{DEMO_LAUNDRY_ID}' which is a LIVE laundry!")
        print("   This script ONLY writes to the demo tenant. Change DEMO_LAUNDRY_ID to a safe value (e.g., '999').")
        sys.exit(1)

    if SOURCE_LAUNDRY_ID == DEMO_LAUNDRY_ID:
        print(f"\n❌ ABORT: SOURCE and DEMO laundry IDs are the same ('{DEMO_LAUNDRY_ID}')!")
        print("   This would delete live data. Fix the configuration.")
        sys.exit(1)

    with get_db() as conn:
        cur = get_cursor(conn)

        clean_demo_data(cur)
        clone_laundry(cur)
        clone_services(cur)
        clone_employees(cur)
        customer_map = clone_customers(cur)
        driver_map = {}  # No separate drivers table
        clone_orders(cur, customer_map, driver_map)

    print("\n" + "=" * 60)
    print("✅ Demo data seeded successfully!")
    print("\n📋 Demo access:")
    print(f"   Customer app: /demo-customer → auto-logs in as {DEMO_CUSTOMER_ID}")
    print(f"   Admin app:    /demo-admin → auto-logs in as {DEMO_EMPLOYEE_ID}")
    print(f"   Laundry ID:   {DEMO_LAUNDRY_ID}")
    print(f"   Employee PIN: 0000")
    print(f"\n📝 All names/phones masked. Source data (laundry 1) is untouched.")
    print()


if __name__ == "__main__":
    main()
