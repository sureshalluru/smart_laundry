"""
Database migrations module.
Migrations are safe to run multiple times (idempotent).
"""
import logging
from app.migrations import add_service_categories
from app.migrations import add_auto_charge
from app.migrations import add_subscription_discount
from app.migrations import add_customer_pricing
from app.migrations import add_order_services_columns
from app.migrations import add_item_tracking
from app.migrations import add_route_assignments
from app.migrations import add_performance_indexes
from app.migrations import add_address_verified

logger = logging.getLogger(__name__)


def run_all():
    """Run all pending migrations."""
    logger.info("Running database migrations...")
    add_service_categories.run()
    add_auto_charge.run()
    add_subscription_discount.run()
    add_customer_pricing.run()
    add_order_services_columns.run()
    add_item_tracking.run()
    add_route_assignments.run()
    add_performance_indexes.run()
    add_address_verified.run()
    logger.info("All migrations complete.")
