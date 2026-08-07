"""
Migration: Add tenant_api_keys table for per-tenant encrypted API key storage.
Idempotent — safe to run multiple times.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def run():
    """Create the tenant_api_keys table if it doesn't exist."""
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Create the table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tenant_api_keys (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    laundry_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    key_name TEXT NOT NULL,
                    encrypted_value TEXT NOT NULL,
                    is_platform_managed BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_tenant_provider_key UNIQUE (laundry_id, provider, key_name)
                )
            """)

            # Index for efficient lookup by tenant
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_laundry
                ON tenant_api_keys(laundry_id)
            """)

            # Auto-update trigger for updated_at
            cur.execute("""
                CREATE OR REPLACE FUNCTION update_tenant_api_keys_timestamp()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
            """)

            cur.execute("""
                DROP TRIGGER IF EXISTS trg_tenant_api_keys_updated ON tenant_api_keys
            """)

            cur.execute("""
                CREATE TRIGGER trg_tenant_api_keys_updated
                    BEFORE UPDATE ON tenant_api_keys
                    FOR EACH ROW
                    EXECUTE FUNCTION update_tenant_api_keys_timestamp()
            """)

            conn.commit()
            logger.info("[migration] tenant_api_keys table ready")

    except Exception as e:
        logger.error(f"[migration] Failed to create tenant_api_keys: {e}")
        raise
