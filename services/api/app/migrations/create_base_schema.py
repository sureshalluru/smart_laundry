"""
Migration: Create the base/foundation database schema.

This is the FIRST migration that must run against a fresh database. It
creates the core schemas, enum types, and foundation tables that every
other `add_*` migration builds on via ALTER TABLE / ADD COLUMN / FK.

Historically these tables lived in a pre-existing production database and
were never committed to the repo, so a clone could not bootstrap a fresh
Postgres. This migration reconstructs that foundation from the columns the
application code actually reads and writes.

Design notes:
  * Fully idempotent — safe to run repeatedly (CREATE ... IF NOT EXISTS,
    guarded CREATE TYPE). Coexists with the later add_* migrations, which
    only ADD columns/values that are missing.
  * Column sets cover what the application INSERTs at runtime. Additional
    columns that later migrations attach via ALTER (uber fields, image
    URLs, pause/reschedule fields, etc.) are intentionally left to those
    migrations so this file stays aligned with their `ADD COLUMN IF NOT
    EXISTS` guards.
  * Enum types are created empty-guarded here with the values referenced in
    code. Later ALTER TYPE migrations add any newer values idempotently.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def _create_enum(cur, type_name: str, values: list[str]):
    """Create an enum type if it does not already exist (idempotent)."""
    labels = ", ".join(f"'{v}'" for v in values)
    cur.execute(f"""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type t
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE t.typname = '{type_name.split('.')[-1]}'
                  AND n.nspname = '{type_name.split('.')[0]}'
            ) THEN
                CREATE TYPE {type_name} AS ENUM ({labels});
            END IF;
        END $$;
    """)


def run():
    """Create base schemas, enums, and foundation tables (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # ── Schemas ───────────────────────────────────────────────────
            cur.execute("CREATE SCHEMA IF NOT EXISTS shop")
            cur.execute("CREATE SCHEMA IF NOT EXISTS orders")

            # gen_random_uuid() lives in pgcrypto on older Postgres; it is
            # built-in from PG13+. Ensure it exists for UUID defaults.
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

            # ── Enum types ────────────────────────────────────────────────
            _create_enum(cur, "orders.order_status_enum", [
                "OrderSubmitted", "ReadyForIntake", "ReceivedAtFacility",
                "Processing", "ProcessingStarted", "ProcessingCompleted",
                "EnRouteToDelivery", "Delivered", "OrderPickedUp",
                "OrderCanceled", "Cancelled",
            ])
            _create_enum(cur, "orders.frequency_enum", [
                "Weekly", "BiWeekly", "Monthly",
            ])
            _create_enum(cur, "orders.employee_role_enum", [
                "Admin", "Manager", "Employee", "Driver",
            ])

            # ── shop.laundry_shops (tenant root) ──────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_shops (
                    laundry_id              TEXT PRIMARY KEY,
                    laundry_name            TEXT NOT NULL,
                    laundry_timezone        TEXT DEFAULT 'America/Chicago',
                    street                  TEXT,
                    city                    TEXT,
                    state                   TEXT,
                    zip_code                TEXT,
                    country                 TEXT,
                    contact_phone           TEXT,
                    contact_email           TEXT,
                    owner_email             TEXT,
                    laundry_logo            TEXT,
                    device_registration_code TEXT DEFAULT 'SETUP2024',
                    delivery_time_interval  INTEGER DEFAULT 120,
                    emp_prefix              TEXT,
                    tax_rate                NUMERIC(6,4) DEFAULT 0,
                    stripe_public_key       TEXT,
                    stripe_private_key      TEXT,
                    stripe_terminal_id      TEXT,
                    serviceable_zip_codes   JSON,
                    user_domain             TEXT,
                    pickup_dropoff_instructions TEXT,
                    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.customers ────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customers (
                    customer_id          TEXT PRIMARY KEY,
                    phone_number         TEXT NOT NULL,
                    email                TEXT,
                    first_name           TEXT,
                    last_name            TEXT,
                    special_instructions TEXT,
                    notif_email          BOOLEAN DEFAULT TRUE,
                    notif_sms            BOOLEAN DEFAULT TRUE,
                    notif_phone          BOOLEAN DEFAULT TRUE,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.customer_addresses ───────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_addresses (
                    address_id           TEXT PRIMARY KEY,
                    customer_id          TEXT NOT NULL
                                          REFERENCES shop.customers(customer_id)
                                          ON DELETE CASCADE,
                    address              TEXT,
                    door_number          TEXT,
                    address_instructions TEXT,
                    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
                ON shop.customer_addresses(customer_id)
            """)

            # ── shop.employees ────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.employees (
                    emp_id        TEXT PRIMARY KEY,
                    laundry_id    TEXT NOT NULL,
                    first_name    TEXT,
                    last_name     TEXT,
                    email         TEXT,
                    phone         TEXT,
                    role          orders.employee_role_enum DEFAULT 'Employee',
                    passcode      TEXT,
                    avg_rating    NUMERIC(3,2) DEFAULT 0,
                    joining_date  DATE,
                    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_employees_laundry
                ON shop.employees(laundry_id)
            """)

            # ── shop.laundry_services ─────────────────────────────────────
            # NOTE: category_id is added later by add_service_categories
            # (INT FK). Keep this base table minimal so that migration's
            # ALTER runs against an existing table.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_services (
                    service_id       SERIAL PRIMARY KEY,
                    laundry_id       TEXT NOT NULL,
                    service_name     TEXT NOT NULL,
                    price            NUMERIC(10,2) DEFAULT 0,
                    description      TEXT,
                    input_weight     BOOLEAN DEFAULT TRUE,
                    customer_access  BOOLEAN DEFAULT TRUE,
                    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_laundry_services_laundry
                ON shop.laundry_services(laundry_id)
            """)

            # ── shop.laundry_products ─────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_products (
                    product_id    SERIAL PRIMARY KEY,
                    laundry_id    TEXT NOT NULL,
                    product_name  TEXT NOT NULL,
                    price         NUMERIC(10,2) DEFAULT 0,
                    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.drivers ──────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.drivers (
                    driver_id   TEXT PRIMARY KEY,
                    laundry_id  TEXT NOT NULL,
                    first_name  TEXT,
                    last_name   TEXT,
                    phone       TEXT,
                    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.delivery_time_slots ──────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.delivery_time_slots (
                    slot_id      SERIAL PRIMARY KEY,
                    laundry_id   TEXT NOT NULL,
                    day_of_week  TEXT,
                    start_time   TEXT,
                    end_time     TEXT,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.instore_pickup_time_slots ────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.instore_pickup_time_slots (
                    slot_id      SERIAL PRIMARY KEY,
                    laundry_id   TEXT NOT NULL,
                    day_of_week  TEXT,
                    start_time   TEXT,
                    end_time     TEXT,
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── shop.customer_payment_profiles ────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_payment_profiles (
                    customer_id        TEXT NOT NULL
                                        REFERENCES shop.customers(customer_id)
                                        ON DELETE CASCADE,
                    laundry_id         TEXT NOT NULL,
                    stripe_customer_id TEXT,
                    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (customer_id, laundry_id)
                )
            """)

            # ── shop.customer_laundry_stats ───────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_laundry_stats (
                    customer_id             TEXT NOT NULL
                                             REFERENCES shop.customers(customer_id)
                                             ON DELETE CASCADE,
                    laundry_id              TEXT NOT NULL,
                    total_orders_placed     INTEGER NOT NULL DEFAULT 0,
                    total_order_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
                    last_completed_order_id TEXT,
                    last_completed_at       TIMESTAMPTZ,
                    PRIMARY KEY (customer_id, laundry_id)
                )
            """)

            # ── shop.frequency_intervals ──────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.frequency_intervals (
                    id                    SERIAL PRIMARY KEY,
                    laundry_id            TEXT NOT NULL,
                    interval              orders.frequency_enum NOT NULL,
                    auto_charge_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
                    subscription_discount NUMERIC(5,2) NOT NULL DEFAULT 0,
                    UNIQUE (laundry_id, interval)
                )
            """)

            # ── shop.promotions ───────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.promotions (
                    promo_id             SERIAL PRIMARY KEY,
                    laundry_id           TEXT NOT NULL,
                    promo_code           TEXT NOT NULL,
                    description          TEXT,
                    discount_type        TEXT,
                    discount_value       NUMERIC(10,2) DEFAULT 0,
                    minimum_order_value  NUMERIC(10,2) DEFAULT 0,
                    linked_frequency     orders.frequency_enum,
                    is_online_frequency_promo BOOLEAN NOT NULL DEFAULT FALSE,
                    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── orders.orders (order root) ────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.orders (
                    order_id             TEXT PRIMARY KEY,
                    laundry_id           TEXT NOT NULL,
                    customer_id          TEXT
                                          REFERENCES shop.customers(customer_id),
                    address_id           TEXT
                                          REFERENCES shop.customer_addresses(address_id),
                    order_type           TEXT,
                    order_status         orders.order_status_enum,
                    status_category      TEXT DEFAULT 'Active',
                    payment_status       TEXT DEFAULT 'Unpaid',
                    pickup_date          DATE,
                    pickup_time_interval TEXT,
                    dropoff_date         DATE,
                    dropoff_time_interval TEXT,
                    laundry_bags         INTEGER,
                    special_instructions TEXT,
                    coupon               TEXT,
                    frequency            TEXT,
                    sub_total            NUMERIC(12,2) DEFAULT 0,
                    discounted_price     NUMERIC(12,2) DEFAULT 0,
                    total_cost           NUMERIC(12,2) DEFAULT 0,
                    grand_total          NUMERIC(12,2) DEFAULT 0,
                    tax_amount           NUMERIC(12,2) DEFAULT 0,
                    pay_by_invoice       BOOLEAN DEFAULT FALSE,
                    pickup_service       VARCHAR(50) DEFAULT 'LaundryDriver',
                    dropoff_service      VARCHAR(50) DEFAULT 'LaundryDriver',
                    hold_payment_intent_id TEXT,
                    auto_generated       BOOLEAN NOT NULL DEFAULT FALSE,
                    is_reviewed          BOOLEAN NOT NULL DEFAULT FALSE,
                    cancel_reason        TEXT DEFAULT '',
                    last_updated_by      TEXT,
                    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_orders_laundry
                ON orders.orders(laundry_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_orders_customer
                ON orders.orders(customer_id)
            """)

            # ── orders.order_services (PK is `id`) ────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_services (
                    id             SERIAL PRIMARY KEY,
                    order_id       TEXT NOT NULL
                                    REFERENCES orders.orders(order_id)
                                    ON DELETE CASCADE,
                    service_name   VARCHAR(255),
                    service_price  NUMERIC(10,2) DEFAULT 0,
                    weight_or_count NUMERIC(10,2) DEFAULT 0
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_order_services_order
                ON orders.order_services(order_id)
            """)

            # ── orders.order_products ─────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_products (
                    id            SERIAL PRIMARY KEY,
                    order_id      TEXT NOT NULL
                                   REFERENCES orders.orders(order_id)
                                   ON DELETE CASCADE,
                    product_name  TEXT,
                    product_price NUMERIC(10,2) DEFAULT 0,
                    product_count INTEGER DEFAULT 1
                )
            """)

            # ── orders.order_tips (UNIQUE order_id for upsert) ────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_tips (
                    id              SERIAL PRIMARY KEY,
                    order_id        TEXT NOT NULL UNIQUE
                                     REFERENCES orders.orders(order_id)
                                     ON DELETE CASCADE,
                    tip_amount      NUMERIC(10,2) DEFAULT 0,
                    tip_percentage  NUMERIC(6,2),
                    tip_type        TEXT,
                    tip_method      TEXT,
                    tip_receiver_id TEXT
                )
            """)

            # ── orders.order_payments (PK is `id`) ────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_payments (
                    id                SERIAL PRIMARY KEY,
                    order_id          TEXT NOT NULL
                                       REFERENCES orders.orders(order_id)
                                       ON DELETE CASCADE,
                    payment_intent_id TEXT,
                    amount            NUMERIC(12,2) DEFAULT 0,
                    payment_method    TEXT,
                    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── orders.order_history ──────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_history (
                    id             SERIAL PRIMARY KEY,
                    order_id       TEXT NOT NULL,
                    laundry_id     TEXT,
                    emp_id         TEXT,
                    emp_name       TEXT,
                    action         TEXT,
                    field_changed  TEXT,
                    old_value      TEXT,
                    new_value      TEXT,
                    change_summary TEXT,
                    changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_order_history_order
                ON orders.order_history(order_id, changed_at DESC)
            """)

            # ── orders.order_reviews ──────────────────────────────────────
            # emp_id is made nullable by run_review_empid_migration; created
            # nullable here to match.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_reviews (
                    review_id   SERIAL PRIMARY KEY,
                    order_id    TEXT NOT NULL,
                    laundry_id  TEXT,
                    customer_id TEXT,
                    emp_id      TEXT,
                    rating      INTEGER,
                    comment     TEXT,
                    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            # ── orders.laundry_frequency (subscription root) ──────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.laundry_frequency (
                    frequency_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    customer_id            TEXT NOT NULL
                                            REFERENCES shop.customers(customer_id)
                                            ON DELETE CASCADE,
                    laundry_id             TEXT NOT NULL,
                    address_id             TEXT
                                            REFERENCES shop.customer_addresses(address_id),
                    frequency              TEXT NOT NULL,
                    frequency_created_date TIMESTAMPTZ DEFAULT NOW(),
                    frequency_start_date   DATE,
                    pickup_date            DATE,
                    pickup_time_interval   TEXT,
                    dropoff_time_interval  TEXT,
                    future_pickup_date     DATE,
                    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
                    auto_charge            BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_laundry_frequency_due
                ON orders.laundry_frequency(future_pickup_date, is_active)
            """)

            logger.info(
                "Migration create_base_schema complete — foundation schemas, "
                "enums, and core tables created."
            )

    except Exception as e:
        logger.error(f"Migration create_base_schema failed: {e}")
        raise
