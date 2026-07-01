"""
One-off script to remove orphaned email references after a laundry deletion.
Run from the services/api directory: python cleanup_email.py

Usage: python cleanup_email.py <email>
Example: python cleanup_email.py gam2q45@gmail.com
"""
import sys
import os

# Add the app to path so we can reuse the database module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db, get_cursor


def cleanup_email(email: str):
    email = email.strip().lower()
    print(f"\nCleaning up email: {email}")
    print("=" * 50)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check employees table
        cur.execute(
            "SELECT emp_id, laundry_id, role FROM shop.employees WHERE LOWER(TRIM(email)) = %s",
            (email,)
        )
        employees = cur.fetchall()
        if employees:
            print(f"\nFound {len(employees)} employee(s) with this email:")
            for emp in employees:
                print(f"  - emp_id={emp['emp_id']}, laundry_id={emp['laundry_id']}, role={emp['role']}")
            cur.execute("DELETE FROM shop.employees WHERE LOWER(TRIM(email)) = %s", (email,))
            print(f"  -> Deleted {len(employees)} employee record(s)")
        else:
            print("\nNo employees found with this email.")

        # Check laundry_shops table
        cur.execute(
            "SELECT laundry_id, laundry_name FROM shop.laundry_shops WHERE LOWER(TRIM(contact_email)) = %s",
            (email,)
        )
        shops = cur.fetchall()
        if shops:
            print(f"\nFound {len(shops)} laundry shop(s) with this contact_email:")
            for shop in shops:
                print(f"  - laundry_id={shop['laundry_id']}, name={shop['laundry_name']}")
            # Don't auto-delete shops — just clear the email
            cur.execute(
                "UPDATE shop.laundry_shops SET contact_email = NULL WHERE LOWER(TRIM(contact_email)) = %s",
                (email,)
            )
            print(f"  -> Cleared contact_email for {len(shops)} shop(s)")
        else:
            print("\nNo laundry shops found with this contact_email.")

    print(f"\nDone! Email '{email}' is now free to use.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cleanup_email.py <email>")
        print("Example: python cleanup_email.py gam2q45@gmail.com")
        sys.exit(1)

    cleanup_email(sys.argv[1])
