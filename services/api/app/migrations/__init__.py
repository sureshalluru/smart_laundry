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

logger = logging.getLogger(__name__)


def run_all():
    """Run all pending migrations."""
    logger.info("Running database migrations...")
    add_service_categories.run()
    add_auto_charge.run()
    add_subscription_discount.run()
    add_customer_pricing.run()
    add_order_services_columns.run()
    logger.info("All migrations complete.")
