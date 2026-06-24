"""
Migration: Create shop.service_catalog table and seed platform defaults.

Provides a shared catalog of services that tenants can toggle on/off
for their public landing pages.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)

PLATFORM_DEFAULTS = [
    {
        "title": "Wash & Fold",
        "description": "Professional wash and fold service with care for all fabric types",
        "icon_key": "package",
        "color": "blue",
    },
    {
        "title": "Self-Service Laundromat",
        "description": "Coin-operated washers and dryers available 24/7",
        "icon_key": "droplet",
        "color": "cyan",
    },
    {
        "title": "Free Pickup & Delivery",
        "description": "We pick up your laundry and deliver it back fresh and clean",
        "icon_key": "truck",
        "color": "green",
    },
    {
        "title": "Per Bag Service",
        "description": "Simple per-bag pricing — fill a bag, pay one flat rate",
        "icon_key": "bag",
        "color": "purple",
    },
    {
        "title": "Drive-Through Drop Off",
        "description": "Quick and convenient drive-through laundry drop off",
        "icon_key": "truck",
        "color": "orange",
    },
    {
        "title": "Dry Cleaning",
        "description": "Expert dry cleaning for delicates, suits, and formal wear",
        "icon_key": "sun",
        "color": "teal",
    },
    {
        "title": "Commercial Laundry",
        "description": "High-volume laundry service for businesses and institutions",
        "icon_key": "package",
        "color": "red",
    },
    {
        "title": "Express Service",
        "description": "Same-day turnaround for urgent laundry needs",
        "icon_key": "sun",
        "color": "orange",
    },
    {
        "title": "Alterations & Repairs",
        "description": "Professional tailoring, alterations, and garment repair",
        "icon_key": "package",
        "color": "pink",
    },
    {
        "title": "Starch & Press",
        "description": "Crisp starching and professional pressing for dress shirts",
        "icon_key": "droplet",
        "color": "yellow",
    },
]


def run():
    """Create shop.service_catalog table and seed platform defaults (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Create table if it doesn't exist
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.service_catalog (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    icon_key TEXT NOT NULL DEFAULT 'package',
                    color TEXT NOT NULL DEFAULT 'blue',
                    source_type TEXT NOT NULL DEFAULT 'platform',
                    source_id TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE (title)
                )
            """)

            # Seed platform defaults (skip if already present)
            for svc in PLATFORM_DEFAULTS:
                cur.execute("""
                    INSERT INTO shop.service_catalog (title, description, icon_key, color, source_type)
                    VALUES (%s, %s, %s, %s, 'platform')
                    ON CONFLICT (title) DO NOTHING
                """, (svc["title"], svc["description"], svc["icon_key"], svc["color"]))

            logger.info("Migration add_service_catalog complete — table created and seeded.")

    except Exception as e:
        logger.error(f"Migration add_service_catalog failed: {e}")
