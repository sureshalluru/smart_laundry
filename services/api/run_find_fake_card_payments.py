"""
Find orders recorded as paid by Card/Terminal but missing a Stripe transaction ID.
These are orders where an employee marked payment_method as Card/Terminal/Invoice
but no payment_intent_id was captured — meaning the charge was never actually processed.

This catches cases where employees clicked "Paid" without running the card.

Run: cd services/api && python run_find_fake_card_payments.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import get_db, get_cursor

def find_fake_card_payments():
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
                op.payment_method,
                op.payment_intent_id,
                op.created_at as payment_recorded_at,
                c.first_name,
                c.last_name,
                c.phone_number,
                c.email
            FROM orders.orders o
            JOIN orders.order_payments op ON op.order_id = o.order_id
            LEFT JOIN shop.customers c ON c.customer_id = o.customer_id
            WHERE o.payment_status = 'Paid'
              AND o.grand_total > 0
              AND o.created_at >= NOW() - INTERVAL '90 days'
              AND o.order_status != 'OrderCanceled'
              -- Payment method is Card/Terminal/Invoice (non-cash)
              AND op.payment_method IN ('Card', 'Terminal', 'Invoice')
              -- But NO valid transaction/payment_intent_id
              AND (op.payment_intent_id IS NULL OR op.payment_intent_id = '')
            ORDER BY o.created_at DESC
        """)
        rows = cur.fetchall()

    if not rows:
        print("\n✅ No fake card payments found in the last 90 days.")
        return

    total_lost = 0
    print(f"\n⚠️  Found {len(rows)} orders marked 'Paid' via Card/Terminal but NO transaction ID:\n")
    print(f"{'Order ID':<16} {'Laundry':<10} {'Method':<10} {'Status':<22} {'Total':>8} {'Customer':<25} {'Phone':<15} {'Date'}")
    print("-" * 145)

    for r in rows:
        name = f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or "Unknown"
        phone = r['phone_number'] or ''
        total_lost += float(r['grand_total'] or 0)
        print(f"{r['order_id']:<16} {r['laundry_id']:<10} {r['payment_method']:<10} {r['order_status']:<22} ${float(r['grand_total']):>7.2f} {name:<25} {phone:<15} {str(r['created_at'])[:10]}")

    print("-" * 145)
    print(f"\n💰 Total recorded as card-paid but never charged: ${total_lost:.2f}")
    print(f"📊 Orders affected: {len(rows)}")
    print(f"\nThese orders have a payment record with method=Card/Terminal/Invoice")
    print(f"but no Stripe payment_intent_id — the card was never actually charged.")
    print(f"Action: Charge these customers or mark as cash if they paid in person.")


if __name__ == "__main__":
    find_fake_card_payments()
