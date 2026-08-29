"""
Migration: Create the complete base/foundation database schema.

Reconstructed from a production database dump to serve as the single source
of truth for bootstrapping a fresh Postgres instance. Every table, column,
type, and default matches production exactly.

Design notes:
  * Fully idempotent — safe to run repeatedly on production (all statements
    use CREATE ... IF NOT EXISTS or guarded DO/EXCEPTION blocks).
  * On a live DB where tables already exist, every statement is a no-op.
  * Enum types are created with DO $$ ... EXCEPTION blocks so re-runs skip.
  * Subsequent add_* migrations (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF
    NOT EXISTS) become no-ops on this complete schema.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def _create_enum(cur, schema: str, type_name: str, values: list[str]):
    """Create an enum type if it does not already exist (idempotent)."""
    labels = ", ".join(f"'{v}'" for v in values)
    cur.execute(f"""
        DO $$ BEGIN
            CREATE TYPE {schema}.{type_name} AS ENUM ({labels});
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)


def run():
    """Create all schemas, enums, and tables to match production (idempotent)."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # ══════════════════════════════════════════════════════════════
            # SCHEMAS
            # ══════════════════════════════════════════════════════════════
            cur.execute("CREATE SCHEMA IF NOT EXISTS chat")
            cur.execute("CREATE SCHEMA IF NOT EXISTS orders")
            cur.execute("CREATE SCHEMA IF NOT EXISTS public")
            cur.execute("CREATE SCHEMA IF NOT EXISTS routes")
            cur.execute("CREATE SCHEMA IF NOT EXISTS shop")
            cur.execute("CREATE SCHEMA IF NOT EXISTS tracking")

            # gen_random_uuid() — built-in from PG13+, pgcrypto for older
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

            # ══════════════════════════════════════════════════════════════
            # ENUM TYPES (orders schema)
            # ══════════════════════════════════════════════════════════════
            _create_enum(cur, "orders", "audit_action_enum", [
                "CREATE", "UPDATE", "CANCEL",
            ])

            _create_enum(cur, "orders", "customer_type_enum", [
                "online", "instore", "both",
            ])

            _create_enum(cur, "orders", "discount_type_enum", [
                "percentage", "fixedPrice",
            ])

            _create_enum(cur, "orders", "employee_role_enum", [
                "DeliveryDriver", "LaundryTechnician", "FrontDesk",
                "Supervisor", "Manager", "Admin", "owner",
                "LaundryCare Specialist", "Attendant", "Delivery Driver",
                "Employee", "Driver",
            ])

            _create_enum(cur, "orders", "frequency_enum", [
                "Weekly", "BiWeekly", "Monthly",
            ])

            _create_enum(cur, "orders", "order_status_enum", [
                "OrderSubmitted", "ReadyForIntake", "ReceivedAtFacility",
                "ProcessingStarted", "ProcessingCompleted",
                "EnRouteToDelivery", "Delivered", "OrderPickedUp",
                "Cancelled", "OrderCanceled", "ReadyForDelivery",
            ])

            _create_enum(cur, "orders", "order_type_enum", [
                "Online", "Commercial", "InStore",
            ])

            _create_enum(cur, "orders", "payment_method_enum", [
                "Card", "Terminal", "Cash", "hold",
                "card", "cash", "terminal", "Invoice",
            ])

            _create_enum(cur, "orders", "payment_status_enum", [
                "Unpaid", "Pending", "Paid", "PartiallyPaid",
                "Refunded", "Failed", "Invoice Sent",
            ])

            _create_enum(cur, "orders", "status_category_enum", [
                "Active", "Completed", "Cancelled",
            ])

            _create_enum(cur, "orders", "tip_type_enum", [
                "percentage", "fixed", "noTip", "custom",
            ])

            # ══════════════════════════════════════════════════════════════
            # TABLES — chat schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat.conversations (
                    conversation_id   UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id        VARCHAR(50) NOT NULL,
                    customer_id       VARCHAR(100) NOT NULL,
                    customer_name     VARCHAR(200),
                    customer_phone    VARCHAR(50),
                    status            VARCHAR(20) DEFAULT 'active',
                    last_message_at   TIMESTAMP DEFAULT now(),
                    unread_admin      INT DEFAULT 0,
                    unread_customer   INT DEFAULT 0,
                    created_at        TIMESTAMP DEFAULT now(),
                    updated_at        TIMESTAMP DEFAULT now(),
                    UNIQUE (laundry_id, customer_id)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat.messages (
                    message_id        UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    conversation_id   UUID NOT NULL,
                    sender_type       VARCHAR(20) NOT NULL,
                    sender_id         VARCHAR(100),
                    sender_name       VARCHAR(200),
                    message           TEXT NOT NULL,
                    read_at           TIMESTAMP,
                    created_at        TIMESTAMP DEFAULT now()
                )
            """)

            # ══════════════════════════════════════════════════════════════
            # TABLES — orders schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.customer_promo_usage (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    customer_id      VARCHAR(100) NOT NULL,
                    laundry_id       VARCHAR(50) NOT NULL,
                    promotion_id     INT NOT NULL,
                    promo_code       VARCHAR(50) NOT NULL,
                    usage_count      INT DEFAULT 0 NOT NULL,
                    last_used_at     TIMESTAMPTZ
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.customer_promo_usage_history (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    customer_id      VARCHAR(100) NOT NULL,
                    promotion_id     INT NOT NULL,
                    order_id         VARCHAR(50),
                    used_at          TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.instore_product_orders (
                    product_order_id   VARCHAR(50) NOT NULL PRIMARY KEY,
                    laundry_id         VARCHAR(50) NOT NULL,
                    payment_intent_id  VARCHAR(255),
                    payment_method     orders.payment_method_enum,
                    total_price        NUMERIC NOT NULL,
                    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.instore_product_order_items (
                    id                 SERIAL NOT NULL PRIMARY KEY,
                    product_order_id   VARCHAR(50) NOT NULL,
                    product_id         INT,
                    product_name       VARCHAR(255) NOT NULL,
                    quantity           INT DEFAULT 1 NOT NULL,
                    unit_price         NUMERIC NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.laundry_frequency (
                    frequency_id             VARCHAR(100) NOT NULL PRIMARY KEY,
                    customer_id              VARCHAR(100) NOT NULL,
                    laundry_id               VARCHAR(50) NOT NULL,
                    address_id               VARCHAR(100),
                    frequency                orders.frequency_enum NOT NULL,
                    pickup_date              DATE NOT NULL,
                    pickup_time_interval     VARCHAR(50),
                    dropoff_time_interval    VARCHAR(50),
                    future_pickup_date       DATE,
                    laundry_bags             INT DEFAULT 1 NOT NULL,
                    coupon                   VARCHAR(50),
                    special_instructions     TEXT,
                    tip_amount               NUMERIC DEFAULT 0 NOT NULL,
                    tip_percentage           NUMERIC,
                    tip_type                 orders.tip_type_enum,
                    tip_method               orders.payment_method_enum,
                    is_active                BOOLEAN DEFAULT true NOT NULL,
                    frequency_created_date   TIMESTAMPTZ DEFAULT now() NOT NULL,
                    frequency_start_date     TIMESTAMPTZ,
                    updated_at               TIMESTAMP,
                    auto_charge              BOOLEAN DEFAULT false,
                    is_commercial            BOOLEAN DEFAULT false NOT NULL,
                    is_paused                BOOLEAN DEFAULT false,
                    pause_resume_date        DATE,
                    pause_started_at         TIMESTAMPTZ,
                    original_pickup_date     DATE,
                    reschedule_offset        INT,
                    consecutive_skips        INT DEFAULT 0,
                    total_skips_30d          INT DEFAULT 0,
                    last_skip_date           DATE
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.laundry_frequency_services (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    frequency_id     VARCHAR(100) NOT NULL,
                    service_id       INT,
                    service_name     VARCHAR(255) NOT NULL,
                    service_price    NUMERIC NOT NULL,
                    weight_or_count  NUMERIC
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.orders (
                    order_id               VARCHAR(50) NOT NULL PRIMARY KEY,
                    laundry_id             VARCHAR(50) NOT NULL,
                    customer_id            VARCHAR(100) NOT NULL,
                    address_id             VARCHAR(100),
                    order_type             orders.order_type_enum NOT NULL,
                    order_status           orders.order_status_enum DEFAULT 'OrderSubmitted'::orders.order_status_enum NOT NULL,
                    status_category        orders.status_category_enum DEFAULT 'Active'::orders.status_category_enum NOT NULL,
                    payment_status         orders.payment_status_enum DEFAULT 'Unpaid'::orders.payment_status_enum NOT NULL,
                    pickup_date            DATE,
                    pickup_time_interval   VARCHAR(50),
                    dropoff_date           DATE,
                    dropoff_time_interval  VARCHAR(50),
                    laundry_bags           INT DEFAULT 1 NOT NULL,
                    special_instructions   TEXT,
                    coupon                 VARCHAR(50),
                    sub_total              NUMERIC DEFAULT 0 NOT NULL,
                    discounted_price       NUMERIC DEFAULT 0 NOT NULL,
                    total_cost             NUMERIC DEFAULT 0 NOT NULL,
                    grand_total            NUMERIC DEFAULT 0 NOT NULL,
                    cancel_reason          TEXT,
                    auto_generated         BOOLEAN DEFAULT false NOT NULL,
                    image_url              TEXT,
                    is_reviewed            BOOLEAN DEFAULT false NOT NULL,
                    last_updated_by        VARCHAR(20),
                    hold_payment_intent_id VARCHAR(255),
                    created_at             TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at             TIMESTAMPTZ DEFAULT now() NOT NULL,
                    frequency              orders.frequency_enum,
                    pricing_type           VARCHAR(20) DEFAULT 'per_pound',
                    weight_image_url       TEXT,
                    pay_by_invoice         BOOLEAN DEFAULT false,
                    stripe_invoice_id      VARCHAR(100),
                    total_weight           NUMERIC DEFAULT NULL::numeric,
                    pickup_service         VARCHAR(50) DEFAULT 'LaundryDriver',
                    dropoff_service        VARCHAR(50) DEFAULT 'LaundryDriver',
                    uber_pickup_fee        NUMERIC DEFAULT NULL::numeric,
                    uber_dropoff_fee       NUMERIC DEFAULT NULL::numeric,
                    pickup_tracking_url    TEXT,
                    dropoff_tracking_url   TEXT,
                    pickup_status          VARCHAR(50) DEFAULT NULL::character varying,
                    dropoff_status         VARCHAR(50) DEFAULT NULL::character varying,
                    uber_info              JSONB,
                    tax_amount             NUMERIC DEFAULT 0
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_audit_log (
                    audit_record_id    VARCHAR(100) NOT NULL PRIMARY KEY,
                    order_id           VARCHAR(50) NOT NULL,
                    laundry_id         VARCHAR(50) NOT NULL,
                    emp_id             VARCHAR(20),
                    action_performed   orders.audit_action_enum NOT NULL,
                    status_old         orders.order_status_enum,
                    status_new         orders.order_status_enum,
                    coupon_old         VARCHAR(50),
                    coupon_new         VARCHAR(50),
                    laundry_bags_old   INT,
                    laundry_bags_new   INT,
                    added_services     JSONB,
                    deleted_services   JSONB,
                    updated_services   JSONB,
                    added_products     JSONB,
                    deleted_products   JSONB,
                    updated_products   JSONB,
                    timestamp          TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_history (
                    history_id       UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id         VARCHAR(50) NOT NULL,
                    laundry_id       VARCHAR(50) NOT NULL,
                    emp_id           VARCHAR(20),
                    emp_name         VARCHAR(255),
                    action           VARCHAR(100) NOT NULL,
                    field_changed    VARCHAR(100),
                    old_value        TEXT,
                    new_value        TEXT,
                    change_summary   TEXT NOT NULL,
                    changed_at       TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_payments (
                    id                 SERIAL NOT NULL PRIMARY KEY,
                    order_id           VARCHAR(50) NOT NULL,
                    payment_intent_id  VARCHAR(255),
                    amount             NUMERIC NOT NULL,
                    payment_method     orders.payment_method_enum,
                    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_products (
                    id              SERIAL NOT NULL PRIMARY KEY,
                    order_id        VARCHAR(50) NOT NULL,
                    product_id      INT,
                    product_name    VARCHAR(255) NOT NULL,
                    product_price   NUMERIC NOT NULL,
                    product_count   INT DEFAULT 1 NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_reviews (
                    review_id         UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id        VARCHAR(50) NOT NULL,
                    emp_id            VARCHAR(20),
                    order_id          VARCHAR(50) NOT NULL,
                    customer_id       VARCHAR(100) NOT NULL,
                    order_date        TIMESTAMPTZ,
                    employee_rating   NUMERIC NOT NULL,
                    review_comment    TEXT,
                    photo_url         TEXT,
                    review_date       TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_services (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    order_id         VARCHAR(50) NOT NULL,
                    service_id       INT,
                    service_name     VARCHAR(255) NOT NULL,
                    service_price    NUMERIC NOT NULL,
                    weight_or_count  NUMERIC,
                    input_weight     BOOLEAN DEFAULT false,
                    category_id      VARCHAR(50)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.order_tips (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    order_id         VARCHAR(50) NOT NULL,
                    tip_amount       NUMERIC DEFAULT 0 NOT NULL,
                    tip_percentage   NUMERIC,
                    tip_type         orders.tip_type_enum,
                    tip_method       orders.payment_method_enum,
                    tip_receiver_id  VARCHAR(20)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS orders.subscription_actions (
                    action_id      UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    frequency_id   UUID NOT NULL,
                    action_type    VARCHAR(20) NOT NULL,
                    actor          VARCHAR(20) DEFAULT 'customer' NOT NULL,
                    original_date  DATE,
                    new_date       DATE,
                    reason         VARCHAR(100),
                    metadata       JSONB DEFAULT '{}'::jsonb,
                    created_at     TIMESTAMPTZ DEFAULT now()
                )
            """)

            # ══════════════════════════════════════════════════════════════
            # TABLES — public schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
                    id                    TEXT DEFAULT (gen_random_uuid())::text NOT NULL PRIMARY KEY,
                    laundry_id            TEXT NOT NULL,
                    provider              TEXT NOT NULL,
                    key_name              TEXT NOT NULL,
                    encrypted_value       TEXT NOT NULL,
                    is_platform_managed   BOOLEAN DEFAULT false NOT NULL,
                    created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            # ══════════════════════════════════════════════════════════════
            # TABLES — routes schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS routes.driver_locations (
                    driver_id              VARCHAR(50) NOT NULL PRIMARY KEY,
                    laundry_id             VARCHAR(50) NOT NULL,
                    latitude               FLOAT8 NOT NULL,
                    longitude              FLOAT8 NOT NULL,
                    heading                FLOAT8 DEFAULT 0,
                    speed                  FLOAT8 DEFAULT 0,
                    current_stop_position  INT DEFAULT 1,
                    is_active              BOOLEAN DEFAULT true,
                    updated_at             TIMESTAMPTZ DEFAULT now(),
                    created_at             TIMESTAMPTZ DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS routes.geocode_cache (
                    address_hash   VARCHAR(64) NOT NULL PRIMARY KEY,
                    address        TEXT NOT NULL,
                    latitude       FLOAT8 NOT NULL,
                    longitude      FLOAT8 NOT NULL,
                    cached_at      TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS routes.route_assignments (
                    id                  SERIAL NOT NULL PRIMARY KEY,
                    laundry_id          VARCHAR(50) NOT NULL,
                    route_date          DATE NOT NULL,
                    driver_id           VARCHAR(50) NOT NULL,
                    order_id            VARCHAR(50) NOT NULL,
                    sequence_position   INT NOT NULL,
                    cluster_index       INT,
                    status              VARCHAR(20) DEFAULT 'pending' NOT NULL,
                    created_at          TIMESTAMP DEFAULT now(),
                    updated_at          TIMESTAMP DEFAULT now()
                )
            """)

            # ══════════════════════════════════════════════════════════════
            # TABLES — shop schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.audit_log (
                    id             SERIAL NOT NULL PRIMARY KEY,
                    laundry_id     VARCHAR(10),
                    action         VARCHAR(100) NOT NULL,
                    entity_type    VARCHAR(50),
                    entity_id      VARCHAR(255),
                    changes        JSONB,
                    performed_by   VARCHAR(100),
                    ip_address     VARCHAR(50),
                    created_at     TIMESTAMPTZ DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.community_board_cache (
                    laundry_id       TEXT NOT NULL PRIMARY KEY,
                    recent_activity  JSONB DEFAULT '[]'::jsonb NOT NULL,
                    leaderboard      JSONB DEFAULT '[]'::jsonb NOT NULL,
                    milestones       JSONB DEFAULT '[]'::jsonb NOT NULL,
                    total_referrals  INT DEFAULT 0,
                    refreshed_at    TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.companies (
                    company_id      UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    company_name    VARCHAR(255) NOT NULL,
                    contact_email   VARCHAR(255),
                    contact_phone   VARCHAR(50),
                    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
                    join_code       VARCHAR(20)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.company_admins (
                    admin_id       UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    company_id     UUID NOT NULL,
                    email          VARCHAR(255) NOT NULL,
                    password_hash  VARCHAR(255) NOT NULL,
                    first_name     VARCHAR(100),
                    last_name      VARCHAR(100),
                    is_active      BOOLEAN DEFAULT true NOT NULL,
                    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at     TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_addresses (
                    address_id            VARCHAR(100) NOT NULL PRIMARY KEY,
                    customer_id           VARCHAR(100) NOT NULL,
                    address               TEXT NOT NULL,
                    door_number           VARCHAR(50),
                    address_instructions  TEXT,
                    is_active             BOOLEAN DEFAULT true NOT NULL,
                    created_at            TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_laundry_stats (
                    id                       SERIAL NOT NULL PRIMARY KEY,
                    customer_id              VARCHAR(100) NOT NULL,
                    laundry_id               VARCHAR(50) NOT NULL,
                    total_orders_placed      INT DEFAULT 0 NOT NULL,
                    total_order_value        NUMERIC DEFAULT 0 NOT NULL,
                    last_completed_order_id  VARCHAR(50),
                    last_completed_at        TIMESTAMPTZ
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_payment_profiles (
                    id                   SERIAL NOT NULL PRIMARY KEY,
                    customer_id          VARCHAR(100) NOT NULL,
                    laundry_id           VARCHAR(50) NOT NULL,
                    stripe_customer_id   VARCHAR(100) NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_pricing (
                    id             SERIAL NOT NULL PRIMARY KEY,
                    customer_id    TEXT NOT NULL,
                    laundry_id     TEXT NOT NULL,
                    pricing_type   TEXT DEFAULT 'discount' NOT NULL,
                    service_name   TEXT,
                    value          NUMERIC DEFAULT 0 NOT NULL,
                    created_at     TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customer_reminders (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    laundry_id       VARCHAR(10) NOT NULL,
                    customer_id      UUID NOT NULL,
                    reminder_type    VARCHAR(50) NOT NULL,
                    reminder_stage   VARCHAR(50) NOT NULL,
                    message_channel  VARCHAR(20) DEFAULT 'sms',
                    promo_code       VARCHAR(100),
                    sent_at          TIMESTAMPTZ DEFAULT now(),
                    opened           BOOLEAN DEFAULT false,
                    converted        BOOLEAN DEFAULT false
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.customers (
                    customer_id           VARCHAR(100) NOT NULL PRIMARY KEY,
                    first_name            VARCHAR(100) NOT NULL,
                    last_name             VARCHAR(100),
                    email                 VARCHAR(255),
                    phone_number          VARCHAR(30),
                    special_instructions  TEXT,
                    notif_email           BOOLEAN DEFAULT true NOT NULL,
                    notif_sms             BOOLEAN DEFAULT true NOT NULL,
                    notif_phone           BOOLEAN DEFAULT false NOT NULL,
                    created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
                    engagement_stage      VARCHAR(50) DEFAULT 'new',
                    last_order_date       TIMESTAMPTZ,
                    total_orders          INT DEFAULT 0,
                    billing_email         VARCHAR(255) DEFAULT NULL::character varying,
                    is_commercial         BOOLEAN DEFAULT false NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.delivery_time_slots (
                    id            SERIAL NOT NULL PRIMARY KEY,
                    laundry_id    VARCHAR(50) NOT NULL,
                    day_of_week   VARCHAR(10) NOT NULL,
                    start_time    TIME NOT NULL,
                    end_time      TIME NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.drivers (
                    driver_id    TEXT NOT NULL PRIMARY KEY,
                    laundry_id   TEXT NOT NULL,
                    first_name   TEXT,
                    last_name    TEXT,
                    phone        TEXT,
                    is_active    BOOLEAN DEFAULT true NOT NULL,
                    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.employees (
                    emp_id         VARCHAR(20) NOT NULL PRIMARY KEY,
                    laundry_id     VARCHAR(50) NOT NULL,
                    first_name     VARCHAR(100) NOT NULL,
                    last_name      VARCHAR(100),
                    email          VARCHAR(255),
                    phone          VARCHAR(30),
                    role           orders.employee_role_enum NOT NULL,
                    passcode       VARCHAR(255),
                    street         VARCHAR(255),
                    city           VARCHAR(100),
                    state          VARCHAR(50),
                    zip_code       VARCHAR(20),
                    country        VARCHAR(100),
                    joining_date   DATE,
                    is_active      BOOLEAN DEFAULT true NOT NULL,
                    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
                    total_reviews  INT DEFAULT 0 NOT NULL,
                    avg_rating     NUMERIC
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.engagement_config (
                    id                      SERIAL NOT NULL PRIMARY KEY,
                    laundry_id              VARCHAR(10) NOT NULL,
                    is_active               BOOLEAN DEFAULT true,
                    abandoned_enabled       BOOLEAN DEFAULT true,
                    abandoned_promo_code    VARCHAR(100),
                    abandoned_message       TEXT DEFAULT 'Hi {name}! You started scheduling your laundry with {laundry}. Complete your first order and get {promo}! 🧺',
                    dormant_enabled         BOOLEAN DEFAULT true,
                    dormant_promo_code      VARCHAR(100),
                    dormant_message         TEXT DEFAULT 'Hi {name}, we miss you at {laundry}! Come back and enjoy {promo} on your next order. 👋',
                    winback_enabled         BOOLEAN DEFAULT true,
                    winback_promo_code      VARCHAR(100),
                    winback_message         TEXT DEFAULT 'Hi {name}! It''s been a while. {laundry} has a special deal for you: {promo}. We''d love to see you again! 🎉',
                    holiday_enabled         BOOLEAN DEFAULT true,
                    holiday_promo_code      VARCHAR(100),
                    holiday_message         TEXT DEFAULT 'Happy Holidays from {laundry}! 🎄 Treat yourself to clean laundry with {promo}. Limited time!',
                    weekly_reminder_weeks   INT DEFAULT 4,
                    monthly_reminder_months INT DEFAULT 6,
                    created_at              TIMESTAMPTZ DEFAULT now(),
                    updated_at              TIMESTAMPTZ DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.expenses (
                    expense_id    UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id    TEXT NOT NULL,
                    category      TEXT NOT NULL,
                    amount        NUMERIC DEFAULT 0 NOT NULL,
                    expense_date  DATE DEFAULT CURRENT_DATE NOT NULL,
                    description   TEXT,
                    created_by    TEXT,
                    created_at    TIMESTAMPTZ DEFAULT now(),
                    updated_at    TIMESTAMPTZ DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.faq_templates (
                    template_id    SERIAL NOT NULL PRIMARY KEY,
                    question       TEXT NOT NULL,
                    answer_template TEXT NOT NULL,
                    slug           VARCHAR(200) NOT NULL UNIQUE,
                    category       VARCHAR(100) NOT NULL,
                    display_order  INT DEFAULT 0 NOT NULL,
                    is_active      BOOLEAN DEFAULT true NOT NULL,
                    created_at     TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.frequency_intervals (
                    id                      SERIAL NOT NULL PRIMARY KEY,
                    laundry_id              VARCHAR(50) NOT NULL,
                    interval                orders.frequency_enum NOT NULL,
                    subscription_discount   NUMERIC DEFAULT 0,
                    auto_charge_enabled     BOOLEAN DEFAULT false
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.instore_pickup_time_slots (
                    id            SERIAL NOT NULL PRIMARY KEY,
                    laundry_id    VARCHAR(50) NOT NULL,
                    day_of_week   VARCHAR(10) NOT NULL,
                    start_time    TIME NOT NULL,
                    end_time      TIME NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_products (
                    product_id       SERIAL NOT NULL PRIMARY KEY,
                    laundry_id       VARCHAR(50) NOT NULL,
                    product_name     VARCHAR(255) NOT NULL,
                    description      TEXT,
                    price            NUMERIC NOT NULL,
                    quantity         INT DEFAULT 0 NOT NULL,
                    unit             VARCHAR(50),
                    customer_access  BOOLEAN DEFAULT false NOT NULL,
                    is_active        BOOLEAN DEFAULT true NOT NULL,
                    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_services (
                    service_id       SERIAL NOT NULL PRIMARY KEY,
                    laundry_id       VARCHAR(50) NOT NULL,
                    service_name     VARCHAR(255) NOT NULL,
                    description      TEXT,
                    price            NUMERIC NOT NULL,
                    input_weight     BOOLEAN DEFAULT false NOT NULL,
                    customer_access  BOOLEAN DEFAULT false NOT NULL,
                    is_active        BOOLEAN DEFAULT true NOT NULL,
                    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
                    category_id      INT
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_shops (
                    laundry_id                  VARCHAR(50) NOT NULL PRIMARY KEY,
                    laundry_name                VARCHAR(255) NOT NULL,
                    laundry_logo                TEXT,
                    laundry_timezone            VARCHAR(100) DEFAULT 'America/Chicago' NOT NULL,
                    delivery_time_interval      INT,
                    emp_prefix                  VARCHAR(10),
                    admin_domain                TEXT,
                    user_domain                 TEXT,
                    street                      VARCHAR(255),
                    city                        VARCHAR(100),
                    state                       VARCHAR(50),
                    zip_code                    VARCHAR(20),
                    country                     VARCHAR(100),
                    contact_email               VARCHAR(255),
                    contact_phone               VARCHAR(30),
                    pickup_dropoff_instructions TEXT,
                    stripe_public_key           TEXT,
                    stripe_private_key          TEXT,
                    stripe_terminal_id          VARCHAR(100),
                    serviceable_zip_codes       JSONB DEFAULT '[]'::jsonb NOT NULL,
                    created_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,
                    bag_price                   NUMERIC DEFAULT 30.00,
                    device_registration_code    VARCHAR(50) DEFAULT 'SETUP2024',
                    site_content                JSONB DEFAULT '{}'::jsonb,
                    tax_rate                    NUMERIC DEFAULT 0,
                    subscription_discount       NUMERIC DEFAULT 5,
                    address_verified            BOOLEAN DEFAULT false,
                    address_verified_at         TIMESTAMP,
                    referred_by_name            VARCHAR(255),
                    referred_by_email           VARCHAR(255),
                    company_id                  UUID,
                    sms_enabled                 BOOLEAN DEFAULT false,
                    sms_count                   INT DEFAULT 0,
                    google_review_url           TEXT,
                    hide_home_address           BOOLEAN DEFAULT false
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.laundry_uber_credentials (
                    id               SERIAL NOT NULL PRIMARY KEY,
                    laundry_id       VARCHAR(50) NOT NULL,
                    env              VARCHAR(10) NOT NULL,
                    base_url         TEXT,
                    client_id        VARCHAR(255),
                    client_secret    TEXT,
                    customer_id      VARCHAR(255),
                    webhook_secret   TEXT
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.login_attempts (
                    attempt_id          UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id          VARCHAR(50) NOT NULL,
                    device_fingerprint  VARCHAR(200),
                    ip_address          VARCHAR(50),
                    emp_id              VARCHAR(100),
                    success             BOOLEAN DEFAULT false,
                    attempted_at        TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.notification_queue (
                    id              SERIAL NOT NULL PRIMARY KEY,
                    laundry_id      TEXT,
                    recipient       TEXT NOT NULL,
                    channel         TEXT NOT NULL,
                    subject         TEXT,
                    body            TEXT NOT NULL,
                    status          TEXT DEFAULT 'pending' NOT NULL,
                    created_at      TIMESTAMP DEFAULT now() NOT NULL,
                    scheduled_for   TIMESTAMP NOT NULL,
                    sent_at         TIMESTAMP
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.promotions (
                    promotion_id                SERIAL NOT NULL PRIMARY KEY,
                    laundry_id                  VARCHAR(50) NOT NULL,
                    promo_code                  VARCHAR(50) NOT NULL,
                    promo_name                  VARCHAR(255),
                    description                 TEXT,
                    discount_type               orders.discount_type_enum NOT NULL,
                    discount_value              NUMERIC NOT NULL,
                    apply_on_whole_order        BOOLEAN DEFAULT true NOT NULL,
                    customer_type               orders.customer_type_enum,
                    minimum_order_value         NUMERIC,
                    usage_limit_per_customer    INT,
                    is_online_frequency_promo   BOOLEAN DEFAULT false NOT NULL,
                    linked_frequency            orders.frequency_enum,
                    start_date                  DATE,
                    end_date                    DATE,
                    is_active                   BOOLEAN DEFAULT true NOT NULL,
                    created_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,
                    updated_at                  TIMESTAMPTZ DEFAULT now() NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.promotion_specific_services (
                    id              SERIAL NOT NULL PRIMARY KEY,
                    promotion_id    INT NOT NULL,
                    service_id      INT NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.referral_codes (
                    id            SERIAL NOT NULL PRIMARY KEY,
                    customer_id   TEXT NOT NULL,
                    laundry_id    TEXT NOT NULL,
                    code          VARCHAR(8) NOT NULL,
                    is_active     BOOLEAN DEFAULT true NOT NULL,
                    created_at    TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.referral_events (
                    id                 SERIAL NOT NULL PRIMARY KEY,
                    laundry_id         TEXT NOT NULL,
                    referrer_id        TEXT NOT NULL,
                    referee_id         TEXT NOT NULL,
                    referral_code_id   INT,
                    status             TEXT DEFAULT 'signed_up' NOT NULL,
                    referrer_rewarded  BOOLEAN DEFAULT false,
                    referee_rewarded   BOOLEAN DEFAULT false,
                    created_at         TIMESTAMP DEFAULT now(),
                    updated_at         TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.referral_program_config (
                    laundry_id               TEXT NOT NULL PRIMARY KEY,
                    is_active                BOOLEAN DEFAULT false NOT NULL,
                    referrer_reward_amount   NUMERIC DEFAULT 5.00 NOT NULL,
                    referee_reward_amount    NUMERIC DEFAULT 5.00 NOT NULL,
                    max_monthly_referrals    INT DEFAULT 10 NOT NULL,
                    credit_expiration_days   INT DEFAULT 90 NOT NULL,
                    created_at               TIMESTAMP DEFAULT now(),
                    updated_at               TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.registered_devices (
                    device_id           UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id          VARCHAR(50) NOT NULL,
                    device_fingerprint  VARCHAR(200) NOT NULL,
                    device_name         VARCHAR(200),
                    registered_by       VARCHAR(100),
                    registered_at       TIMESTAMP DEFAULT now(),
                    last_login_at       TIMESTAMP,
                    is_active           BOOLEAN DEFAULT true
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.reward_credits (
                    id                  SERIAL NOT NULL PRIMARY KEY,
                    customer_id         TEXT NOT NULL,
                    laundry_id          TEXT NOT NULL,
                    amount              NUMERIC NOT NULL,
                    source              TEXT NOT NULL,
                    referral_event_id   INT,
                    status              TEXT DEFAULT 'active' NOT NULL,
                    used_on_order_id    TEXT,
                    expires_at          TIMESTAMP NOT NULL,
                    created_at          TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.service_catalog (
                    id            SERIAL NOT NULL PRIMARY KEY,
                    title         TEXT NOT NULL UNIQUE,
                    description   TEXT DEFAULT '' NOT NULL,
                    icon_key      TEXT DEFAULT 'package' NOT NULL,
                    color         TEXT DEFAULT 'blue' NOT NULL,
                    source_type   TEXT DEFAULT 'platform' NOT NULL,
                    source_id     TEXT,
                    is_active     BOOLEAN DEFAULT true NOT NULL,
                    created_at    TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.service_categories (
                    category_id     SERIAL NOT NULL PRIMARY KEY,
                    laundry_id      TEXT NOT NULL,
                    category_name   TEXT NOT NULL,
                    display_order   INT DEFAULT 0 NOT NULL,
                    is_active       BOOLEAN DEFAULT true NOT NULL,
                    created_at      TIMESTAMP DEFAULT now(),
                    UNIQUE (laundry_id, category_name)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.tenant_faqs (
                    faq_id           SERIAL NOT NULL PRIMARY KEY,
                    laundry_id       VARCHAR NOT NULL,
                    question         TEXT NOT NULL,
                    answer_template  TEXT NOT NULL,
                    slug             VARCHAR(200) NOT NULL,
                    category         VARCHAR(100) NOT NULL,
                    display_order    INT DEFAULT 0 NOT NULL,
                    is_enabled       BOOLEAN DEFAULT true NOT NULL,
                    created_at       TIMESTAMP DEFAULT now(),
                    updated_at       TIMESTAMP DEFAULT now(),
                    UNIQUE (laundry_id, slug)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shop.zip_code_interest (
                    id           UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id   VARCHAR(50) NOT NULL,
                    zip_code     VARCHAR(10) NOT NULL,
                    address      TEXT,
                    email        VARCHAR(200),
                    phone        VARCHAR(50),
                    created_at   TIMESTAMP DEFAULT now()
                )
            """)

            # ══════════════════════════════════════════════════════════════
            # TABLES — tracking schema
            # ══════════════════════════════════════════════════════════════

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.customer_feedback (
                    feedback_id      UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id         TEXT NOT NULL,
                    laundry_id       TEXT NOT NULL,
                    phase            TEXT NOT NULL,
                    customer_counts  JSONB NOT NULL,
                    ai_counts        JSONB NOT NULL,
                    photo_urls       JSONB,
                    comment          TEXT,
                    status           TEXT DEFAULT 'pending' NOT NULL,
                    created_at       TIMESTAMP DEFAULT now()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.fold_records (
                    record_id         UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id          TEXT NOT NULL,
                    laundry_id        TEXT NOT NULL,
                    employee_id       TEXT NOT NULL,
                    items             JSONB NOT NULL,
                    photo_urls        JSONB NOT NULL,
                    vision_results    JSONB,
                    discrepancies     JSONB,
                    acknowledgements  JSONB,
                    status            TEXT DEFAULT 'confirmed' NOT NULL,
                    confirmed_at      TIMESTAMP,
                    created_at        TIMESTAMP DEFAULT now(),
                    UNIQUE (order_id, laundry_id)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.intake_records (
                    record_id        UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id         TEXT NOT NULL,
                    laundry_id       TEXT NOT NULL,
                    employee_id      TEXT NOT NULL,
                    items            JSONB NOT NULL,
                    photo_urls       JSONB NOT NULL,
                    vision_results   JSONB,
                    status           TEXT DEFAULT 'confirmed' NOT NULL,
                    confirmed_at     TIMESTAMP,
                    created_at       TIMESTAMP DEFAULT now(),
                    UNIQUE (order_id, laundry_id)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.item_categories (
                    category_id    UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    laundry_id     TEXT NOT NULL,
                    name           TEXT NOT NULL,
                    display_order  INT DEFAULT 0 NOT NULL,
                    is_active      BOOLEAN DEFAULT true NOT NULL,
                    created_at     TIMESTAMP DEFAULT now(),
                    updated_at     TIMESTAMP DEFAULT now(),
                    UNIQUE (laundry_id, name)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.tracking_sessions (
                    session_id     UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id       TEXT NOT NULL,
                    laundry_id     TEXT NOT NULL,
                    employee_id    TEXT NOT NULL,
                    phase          TEXT NOT NULL,
                    token_hash     TEXT NOT NULL,
                    status         TEXT DEFAULT 'waiting' NOT NULL,
                    result_data    JSONB,
                    expires_at     TIMESTAMP NOT NULL,
                    confirmed_at   TIMESTAMP,
                    created_at     TIMESTAMP DEFAULT now(),
                    UNIQUE (order_id, laundry_id, phase)
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tracking.vision_tasks (
                    task_id              UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id             TEXT NOT NULL,
                    laundry_id           TEXT NOT NULL,
                    employee_id          TEXT NOT NULL,
                    phase                TEXT NOT NULL,
                    vision_status        TEXT DEFAULT 'pending' NOT NULL,
                    photo_urls           JSONB NOT NULL,
                    items                JSONB,
                    token_hash           TEXT NOT NULL,
                    error_message        TEXT,
                    processing_time_ms   INT,
                    created_at           TIMESTAMP DEFAULT now(),
                    updated_at           TIMESTAMP DEFAULT now()
                )
            """)

            logger.info(
                "Migration create_base_schema complete — all schemas, enums, "
                "and tables created to match production."
            )

    except Exception as e:
        logger.error(f"Migration create_base_schema failed: {e}")
        raise
