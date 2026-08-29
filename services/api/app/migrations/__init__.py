"""
Database migrations module.
Migrations are safe to run multiple times (idempotent).
"""
import logging
from app.migrations import create_base_schema
from app.migrations import add_service_categories
from app.migrations import add_auto_charge
from app.migrations import add_subscription_discount
from app.migrations import add_customer_pricing
from app.migrations import add_order_services_columns
from app.migrations import add_item_tracking
from app.migrations import add_route_assignments
from app.migrations import add_performance_indexes
from app.migrations import add_referral_fields
from app.migrations import add_service_catalog
from app.migrations import add_driver_locations
from app.migrations import add_companies
from app.migrations import add_company_admins
from app.migrations import add_laundry_company_fk
from app.migrations import add_company_join_code
from app.migrations import add_vision_tasks
from app.migrations import add_faq_tables
from app.migrations import seed_faq_templates
from app.migrations import add_sms_settings
from app.migrations import add_tenant_api_keys
from app.migrations import add_referral_system
from app.migrations import add_google_review_url
from app.migrations import add_notification_queue
from app.migrations import add_hide_home_address
from app.migrations import add_order_bags
from app.migrations import fix_reminder_stage_nullable
from app.migrations import backfill_customer_stats

logger = logging.getLogger(__name__)


def run_all():
    """Run all pending migrations."""
    logger.info("Running database migrations...")
    # Base schema MUST run first — it creates the foundation schemas, enum
    # types, and core tables that every subsequent add_* migration ALTERs.
    create_base_schema.run()
    add_service_categories.run()
    add_auto_charge.run()
    add_subscription_discount.run()
    add_customer_pricing.run()
    add_order_services_columns.run()
    add_item_tracking.run()
    add_route_assignments.run()
    add_performance_indexes.run()
    add_referral_fields.run()
    add_service_catalog.run()
    add_driver_locations.run()
    add_companies.run()
    add_company_admins.run()
    add_laundry_company_fk.run()
    add_company_join_code.run()
    add_vision_tasks.run()
    add_faq_tables.run()
    seed_faq_templates.run()
    add_sms_settings.run()
    add_tenant_api_keys.run()
    add_referral_system.run()
    add_google_review_url.run()
    add_notification_queue.run()
    add_hide_home_address.run()
    add_order_bags.run()
    fix_reminder_stage_nullable.run()
    backfill_customer_stats.run()
    logger.info("All migrations complete.")
