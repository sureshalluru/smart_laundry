"""
Backfill tips for auto-generated recurring orders that are missing tip data.

Finds all auto_generated orders that have no entry in order_tips,
looks up the tip data from their laundry_frequency subscription,
and inserts the tip.

Usage: python backfill_frequency_tips.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env from same directory
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSLMODE", "require"),
    )


def backfill_tips(dry_run=True):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print(f"Connected. Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print("=" * 60)

    # Find auto-generated orders that have no tip record AND haven't been paid yet
    # (We can't retroactively charge customers who already paid)
    cur.execute("""
        SELECT o.order_id, o.customer_id, o.laundry_id, o.frequency, o.created_at,
               o.order_status, o.payment_status
        FROM orders.orders o
        LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
        WHERE o.auto_generated = TRUE
          AND ot.order_id IS NULL
          AND o.order_status != 'OrderCanceled'
          AND o.payment_status NOT IN ('Paid', 'Refunded')
        ORDER BY o.created_at DESC
    """)
    orders_without_tips = cur.fetchall()
    print(f"Found {len(orders_without_tips)} unpaid auto-generated orders without tips")

    if not orders_without_tips:
        print("Nothing to fix!")
        conn.close()
        return

    # For each order, look up the frequency subscription tip data
    fixed = 0
    skipped = 0

    for order in orders_without_tips:
        order_id = order["order_id"]
        customer_id = order["customer_id"]
        laundry_id = order["laundry_id"]

        # Find the frequency subscription for this customer/laundry
        cur.execute("""
            SELECT tip_amount, tip_percentage, tip_type, tip_method
            FROM orders.laundry_frequency
            WHERE customer_id = %s AND laundry_id = %s
            ORDER BY updated_at DESC
            LIMIT 1
        """, (customer_id, laundry_id))
        freq = cur.fetchone()

        if not freq:
            print(f"  SKIP {order_id}: No frequency subscription found for customer {customer_id}")
            skipped += 1
            continue

        tip_amount = float(freq["tip_amount"] or 0)
        tip_percentage = float(freq["tip_percentage"] or 0)
        tip_type = freq["tip_type"] or ""
        tip_method = freq["tip_method"] or ""

        if tip_amount == 0 and tip_percentage == 0:
            print(f"  SKIP {order_id}: Frequency has no tip configured (customer {customer_id})")
            skipped += 1
            continue

        print(f"  FIX  {order_id}: tip_amount={tip_amount}, tip_pct={tip_percentage}%, type={tip_type} (status={order['order_status']}, created={order['created_at']})")

        if not dry_run:
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (order_id) DO NOTHING
            """, (order_id, tip_amount, tip_percentage, tip_type, tip_method))
            fixed += 1

    if not dry_run:
        conn.commit()
        print(f"\n{'=' * 60}")
        print(f"DONE: Fixed {fixed} orders, skipped {skipped}")
    else:
        print(f"\n{'=' * 60}")
        print(f"DRY RUN: Would fix {len(orders_without_tips) - skipped} orders, skip {skipped}")
        print("Run with --live to apply changes")

    conn.close()


if __name__ == "__main__":
    live = "--live" in sys.argv
    backfill_tips(dry_run=not live)
