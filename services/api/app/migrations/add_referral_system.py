"""
Migration: Add referral system tables for the per-tenant referral program.
Creates tables for referral codes, events, reward credits, program config,
and community board cache in the shop schema.
Safe to run multiple times (uses IF NOT EXISTS checks).
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Run the referral system migration."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Ensure shop schema exists
        cur.execute("CREATE SCHEMA IF NOT EXISTS shop")

        # Create referral_codes table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.referral_codes (
                id SERIAL PRIMARY KEY,
                customer_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                code VARCHAR(8) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Add unique constraint on (laundry_id, code)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_laundry_code
            ON shop.referral_codes (laundry_id, code)
        """)

        # Add composite index for fast lookup of active code
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_referral_codes_customer_laundry_active
            ON shop.referral_codes (customer_id, laundry_id, is_active)
        """)

        # Create referral_events table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.referral_events (
                id SERIAL PRIMARY KEY,
                laundry_id TEXT NOT NULL,
                referrer_id TEXT NOT NULL,
                referee_id TEXT NOT NULL,
                referral_code_id INTEGER REFERENCES shop.referral_codes(id),
                status TEXT NOT NULL DEFAULT 'signed_up',
                referrer_rewarded BOOLEAN DEFAULT FALSE,
                referee_rewarded BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Add unique constraint on (laundry_id, referee_id)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_events_laundry_referee
            ON shop.referral_events (laundry_id, referee_id)
        """)

        # Create reward_credits table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.reward_credits (
                id SERIAL PRIMARY KEY,
                customer_id TEXT NOT NULL,
                laundry_id TEXT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                source TEXT NOT NULL,
                referral_event_id INTEGER REFERENCES shop.referral_events(id),
                status TEXT NOT NULL DEFAULT 'active',
                used_on_order_id TEXT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Add composite index for balance queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_reward_credits_customer_laundry_status
            ON shop.reward_credits (customer_id, laundry_id, status)
        """)

        # Create referral_program_config table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.referral_program_config (
                laundry_id TEXT PRIMARY KEY,
                is_active BOOLEAN NOT NULL DEFAULT FALSE,
                referrer_reward_amount DECIMAL(10,2) NOT NULL DEFAULT 5.00,
                referee_reward_amount DECIMAL(10,2) NOT NULL DEFAULT 5.00,
                max_monthly_referrals INTEGER NOT NULL DEFAULT 10,
                credit_expiration_days INTEGER NOT NULL DEFAULT 90,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Create community_board_cache table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.community_board_cache (
                laundry_id TEXT PRIMARY KEY,
                recent_activity JSONB NOT NULL DEFAULT '[]',
                leaderboard JSONB NOT NULL DEFAULT '[]',
                milestones JSONB NOT NULL DEFAULT '[]',
                total_referrals INTEGER DEFAULT 0,
                refreshed_at TIMESTAMP DEFAULT NOW()
            )
        """)

        logger.info("Migration: referral system tables created successfully.")
