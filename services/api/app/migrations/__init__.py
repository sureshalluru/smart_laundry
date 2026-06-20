"""
Database migrations module.
Migrations are safe to run multiple times (idempotent).
"""
import logging
from app.migrations import add_service_categories
from app.migrations import add_auto_charge
from app.migrations import add_subscription_discount

logger = logging.getLogger(__name__)


def run_all():
    """Run all pending migrations."""
    logger.info("Running database migrations...")
    add_service_categories.run()
    add_auto_charge.run()
    add_subscription_discount.run()
    logger.info("All migrations complete.")
