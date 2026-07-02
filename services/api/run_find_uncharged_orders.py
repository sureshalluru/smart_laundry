"""
Find orders marked 'Paid' that have no actual Stripe charge (last 90 days).
These are orders where payment_status='Paid' but no payment_intent_id exists
in order_payments (excluding legitimate cash payments).

Run: cd services/api && python run_find_uncharged_orders.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db, get_cursor

def find_uncharged_orders():
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT 
                o.order_id,
                o.laundry_id,
                o.customer_id,
                o.grand_total,
                o.payment_status,
                o.order_type,
                o.order_status,
                o.created_at,
                c.first_name,
                c.last_name,
                c.phone_number,
                c.email
            FROM orders.orders o
            LEFT JOIN shop.customers c ON c.customer_id = o.customer_id
            WHERE o.payment_status = 'Paid'
              AND o.grand_total > 0
              AND o.created_at >= NOW() - INTERVAL '90 days'
              AND o.order_status != 'OrderCanceled'
              -- No non-cash payment record with a valid Stripe intent
              AND NOT EXISTS (
                  SELECT 1 FROM orders.order_payments op
                  WHERE op.order_id = o.order_id
                    AND op.payment_intent_id IS NOT NULL
                    AND op.payment_intent_id != ''
                    AND op.payment_method IN ('Card', 'Terminal', 'Invoice')
              )
              -- Also exclude orders that have a Cash payment record (legitimate cash)
              AND NOT EXISTS (
                  SELECT 1 FROM orders.order_payments op
                  WHERE op.order_id = o.order_id
                    AND op.payment_method = 'Cash'
              )
            ORDER BY o.created_at DESC
        """)
        rows = cur.fetchall()

    if not rows:
        print("\n✅ No uncharged orders found in the last 90 days.")
        return

    total_lost = 0
    print(f"\n⚠️  Found {len(rows)} orders marked 'Paid' with NO Stripe charge:\n")
    print(f"{'Order ID':<16} {'Laundry':<10} {'Type':<10} {'Status':<22} {'Total':>8} {'Customer':<25} {'Phone':<15} {'Date'}")
    print("-" * 140)

    for r in rows:
        name = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or "Unknown"
        phone = r['phone_number'] or ''
        total_lost += float(r['grand_total'] or 0)
        print(f"{r['order_id']:<16} {r['laundry_id']:<10} {r['order_type']:<10} {r['order_status']:<22} ${float(r['grand_total']):>7.2f} {name:<25} {phone:<15} {str(r['created_at'])[:10]}")

    print("-" * 140)
    print(f"\n💰 Total potentially uncharged: ${total_lost:.2f}")
    print(f"📊 Orders affected: {len(rows)}")
    print(f"\nNote: Some of these may be legitimate (paid cash at counter but recorded")
    print(f"without a payment record). Cross-reference with your Stripe dashboard.")


if __name__ == "__main__":
    find_uncharged_orders()
