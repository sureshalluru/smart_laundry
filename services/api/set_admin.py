"""
Quick script to set an employee's role to 'Admin' for a given laundry.
Usage: python set_admin.py [laundry_id] [emp_id]

If emp_id is not provided, it will set the first employee found to Admin.
"""
import sys
from app.database import get_db, get_cursor

laundry_id = sys.argv[1] if len(sys.argv) > 1 else '1'
emp_id = sys.argv[2] if len(sys.argv) > 2 else None

with get_db() as conn:
    cur = get_cursor(conn)

    if not emp_id:
        # Find the first active employee for this laundry
        cur.execute("""
            SELECT emp_id, first_name, last_name, role
            FROM shop.employees
            WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY created_at ASC LIMIT 1
        """, (laundry_id,))
        row = cur.fetchone()
        if not row:
            print(f"No active employees found for laundry_id = '{laundry_id}'")
            sys.exit(1)
        emp_id = row["emp_id"]
        print(f"Found: {emp_id} ({row['first_name']} {row['last_name']}) - current role: {row['role']}")

    # Update role to Admin
    cur.execute("""
        UPDATE shop.employees SET role = 'Admin' WHERE emp_id = %s AND laundry_id = %s
    """, (emp_id, laundry_id))

    if cur.rowcount > 0:
        print(f"✓ Updated {emp_id} to role 'Admin' for laundry {laundry_id}")
    else:
        print(f"✗ Employee {emp_id} not found in laundry {laundry_id}")

# Verify
with get_db() as conn:
    cur = get_cursor(conn)
    cur.execute("SELECT emp_id, first_name, last_name, role, passcode FROM shop.employees WHERE emp_id = %s", (emp_id,))
    row = cur.fetchone()
    if row:
        print(f"\nCredentials: emp_id={row['emp_id']}, passcode={row['passcode']}, role={row['role']}")
