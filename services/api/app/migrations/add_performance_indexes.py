"""
Migration: Add performance indexes for frequently queried tables.
Targets the orders listing which joins orders + customers + services + payments.
Safe to run multiple times (uses IF NOT EXISTS).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Add performance indexes."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Orders table — most queried table
        cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_laundry_status ON orders.orders (laundry_id, order_status)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_laundry_created ON orders.orders (laundry_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders.orders (customer_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders.orders (pickup_date)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_dropoff_date ON orders.orders (dropoff_date)")

        # Order services
        cur.execute("CREATE INDEX IF NOT EXISTS idx_order_services_order_id ON orders.order_services (order_id)")

        # Order payments
        cur.execute("CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON orders.order_payments (order_id)")

        # Order tips
        cur.execute("CREATE INDEX IF NOT EXISTS idx_order_tips_order_id ON orders.order_tips (order_id)")

        # Customers
        cur.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON shop.customers (phone_number)")

        # Customer addresses
        cur.execute("CREATE INDEX IF NOT EXISTS idx_customer_addresses_id ON shop.customer_addresses (address_id)")

        # Employees
        cur.execute("CREATE INDEX IF NOT EXISTS idx_employees_laundry_active ON shop.employees (laundry_id, is_active)")

        logger.info("Migration: performance indexes added successfully.")
