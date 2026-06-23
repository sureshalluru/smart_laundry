"""
Seed test customers for engagement and feature testing.
Uses +1555 prefix phone numbers that bypass OTP (always use 123456).
Uses Stripe test card tokens.

Usage:
  cd services/api
  python -m scripts.seed_test_customers --laundry-id 1

Test login: Use any +1555xxxxxxx number with OTP 123456
Stripe test cards: https://docs.stripe.com/testing#cards
  - 4242424242424242 (Visa, always succeeds)
  - 4000000000000002 (always declines)
"""
import argparse
import sys
import os

# Add parent to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db, get_cursor


TEST_CUSTOMERS = [
    {
        "first_name": "Alice",
        "last_name": "Test",
        "phone": "+15551000001",
        "email": "alice.test@example.com",
        "address": "100 Test Lane, Round Rock, TX 78664",
    },
    {
        "first_name": "Bob",
        "last_name": "Test",
        "phone": "+15551000002",
        "email": "bob.test@example.com",
        "address": "200 Test Lane, Round Rock, TX 78664",
    },
    {
        "first_name": "Carol",
        "last_name": "Test",
        "phone": "+15551000003",
        "email": "carol.test@example.com",
        "address": "300 Test Lane, Round Rock, TX 78664",
    },
    {
        "first_name": "Dave",
        "last_name": "Test",
        "phone": "+15551000004",
        "email": "dave.test@example.com",
        "address": "400 Test Lane, Georgetown, TX 78626",
    },
    {
        "first_name": "Eve",
        "last_name": "Test",
        "phone": "+15551000005",
        "email": "eve.test@example.com",
        "address": "500 Test Lane, Hutto, TX 78634",
    },
]


def seed_customers(laundry_id: int):
    """Create test customers and link them to the given laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)

        created = 0
        for cust in TEST_CUSTOMERS:
            # Check if already exists
            cur.execute(
                "SELECT customer_id FROM shop.customers WHERE phone_number = %s",
                (cust["phone"],)
            )
            existing = cur.fetchone()

            if existing:
                print(f"  ⏭  {cust['first_name']} {cust['last_name']} ({cust['phone']}) already exists")
                customer_id = existing["customer_id"]
            else:
                # Create customer
                cur.execute("""
                    INSERT INTO shop.customers (first_name, last_name, phone_number, email)
                    VALUES (%s, %s, %s, %s)
                    RETURNING customer_id
                """, (cust["first_name"], cust["last_name"], cust["phone"], cust["email"]))
                customer_id = cur.fetchone()["customer_id"]
                print(f"  ✅ Created {cust['first_name']} {cust['last_name']} ({cust['phone']}) → ID {customer_id}")
                created += 1

            # Add address if not exists
            cur.execute("""
                SELECT address_id FROM shop.customer_addresses
                WHERE customer_id = %s AND address LIKE %s
            """, (customer_id, f"%Test Lane%"))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO shop.customer_addresses (customer_id, address, zip_code)
                    VALUES (%s, %s, %s)
                """, (customer_id, cust["address"], cust["address"].split()[-1]))

            # Link to laundry stats
            cur.execute("""
                INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (customer_id, laundry_id))

        print(f"\n✅ Done! Created {created} new test customers for laundry {laundry_id}")
        print(f"\n📋 Test Login Instructions:")
        print(f"   1. Go to customer site: /{laundry_id}/site")
        print(f"   2. Enter any +1555xxxxxxx phone number")
        print(f"   3. Use OTP: 123456")
        print(f"\n💳 Stripe Test Cards:")
        print(f"   - 4242 4242 4242 4242 (Visa, always succeeds)")
        print(f"   - Exp: any future date, CVC: any 3 digits")
        print(f"   - 4000 0000 0000 0002 (always declines)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed test customers")
    parser.add_argument("--laundry-id", type=int, default=1, help="Laundry ID to link customers to")
    args = parser.parse_args()

    print(f"🧪 Seeding test customers for laundry ID {args.laundry_id}...\n")
    seed_customers(args.laundry_id)
