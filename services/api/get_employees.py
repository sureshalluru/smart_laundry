"""
Quick script to list employees for a given laundry.
Usage: python get_employees.py [laundry_id]
Default laundry_id is '1'.
"""
import sys
from app.database import get_db, get_cursor

laundry_id = sys.argv[1] if len(sys.argv) > 1 else '1'

print(f"\nEmployees for laundry_id = '{laundry_id}':")
print("-" * 70)
print(f"{'EMP_ID':<12} {'NAME':<20} {'ROLE':<12} {'PASSCODE':<10} {'ACTIVE'}")
print("-" * 70)

with get_db() as conn:
    cur = get_cursor(conn)
    cur.execute("""
        SELECT emp_id, first_name, last_name, role, passcode, is_active
        FROM shop.employees
        WHERE laundry_id = %s
        ORDER BY role, emp_id
    """, (laundry_id,))

    for row in cur.fetchall():
        name = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
        print(f"{row['emp_id']:<12} {name:<20} {row['role']:<12} {row['passcode']:<10} {'✓' if row['is_active'] else '✗'}")

print("-" * 70)
