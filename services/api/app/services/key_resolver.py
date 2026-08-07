"""
Key resolver — resolves the correct API key for a tenant.
Checks tenant-specific DB storage first, falls back to global env vars.
"""
import logging
from app.config import settings
from app.services.encryption_service import get_encryption_service
from app.services.masking import mask_key

logger = logging.getLogger(__name__)


class KeyNotFoundError(Exception):
    """Raised when neither tenant key nor env var exists for a provider/key_name."""
    pass


# Mapping: (provider, key_name) → settings attribute name
FALLBACK_MAP = {
    ("twilio", "account_sid"): "twilio_account_sid",
    ("twilio", "auth_token"): "twilio_auth_token",
    ("twilio", "phone_number"): "twilio_phone_number",
    ("twilio", "verify_service_sid"): "twilio_verify_service_sid",
    ("brevo", "api_key"): "brevo_api_key",
    ("anthropic", "api_key"): "anthropic_api_key",
    ("google_maps", "api_key"): "google_maps_api_key",
    ("s3", "access_key_id"): None,  # Uses AWS env vars directly
    ("s3", "secret_access_key"): None,
    ("s3", "region"): "aws_region",
    ("s3", "logo_bucket"): "s3_logo_bucket",
    ("s3", "review_bucket"): "s3_review_bucket",
    ("s3", "tracking_bucket"): "s3_tracking_bucket",
}

# All valid (provider, key_name) combinations
VALID_KEYS = set(FALLBACK_MAP.keys())


def get_tenant_key(conn, laundry_id: str, provider: str, key_name: str) -> str:
    """
    Resolve the API key for a tenant.
    1. Check tenant_api_keys table
    2. Fall back to global env var
    3. Raise KeyNotFoundError if neither exists
    """
    # Try tenant-specific key from DB
    enc_service = get_encryption_service()
    if enc_service:
        try:
            from psycopg.rows import dict_row
            cur = conn.cursor(row_factory=dict_row)
            cur.execute("""
                SELECT encrypted_value FROM tenant_api_keys
                WHERE laundry_id = %s AND provider = %s AND key_name = %s
            """, (laundry_id, provider, key_name))
            row = cur.fetchone()
            if row and row["encrypted_value"]:
                return enc_service.decrypt(row["encrypted_value"])
        except Exception as e:
            logger.warning(f"[key-resolver] Error reading tenant key ({provider}/{key_name}): {e}")

    # Fall back to global env var
    fallback_attr = FALLBACK_MAP.get((provider, key_name))
    if fallback_attr:
        value = getattr(settings, fallback_attr, "")
        if value:
            return value

    # Special case: AWS credentials from env
    if provider == "s3" and key_name == "access_key_id":
        import os
        val = os.environ.get("AWS_ACCESS_KEY_ID", "")
        if val:
            return val
    if provider == "s3" and key_name == "secret_access_key":
        import os
        val = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
        if val:
            return val

    raise KeyNotFoundError(
        f"No key found for tenant={laundry_id}, provider={provider}, key_name={key_name}. "
        f"Configure it in admin settings or set the environment variable."
    )


def get_all_tenant_keys(conn, laundry_id: str) -> list:
    """
    Return all keys for a tenant (masked values) for admin display.
    Includes is_platform_managed flag and updated_at.
    """
    results = []
    enc_service = get_encryption_service()

    try:
        from psycopg.rows import dict_row
        cur = conn.cursor(row_factory=dict_row)
        cur.execute("""
            SELECT provider, key_name, encrypted_value, is_platform_managed, updated_at
            FROM tenant_api_keys
            WHERE laundry_id = %s
            ORDER BY provider, key_name
        """, (laundry_id,))
        rows = cur.fetchall()

        for row in rows:
            masked_value = ""
            if enc_service and row["encrypted_value"]:
                try:
                    plaintext = enc_service.decrypt(row["encrypted_value"])
                    masked_value = mask_key(plaintext)
                except Exception:
                    masked_value = "****[decrypt error]"

            results.append({
                "provider": row["provider"],
                "key_name": row["key_name"],
                "masked_value": masked_value,
                "is_platform_managed": row["is_platform_managed"],
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            })
    except Exception as e:
        logger.error(f"[key-resolver] Error fetching tenant keys: {e}")

    return results


def upsert_tenant_key(conn, laundry_id: str, provider: str, key_name: str, plaintext_value: str, is_platform_managed: bool = False) -> None:
    """
    Encrypt and store (or update) a tenant API key.
    """
    enc_service = get_encryption_service()
    if not enc_service:
        raise ValueError("Encryption service not available — MASTER_ENCRYPTION_KEY not configured")

    encrypted = enc_service.encrypt(plaintext_value)

    from psycopg.rows import dict_row
    cur = conn.cursor(row_factory=dict_row)
    cur.execute("""
        INSERT INTO tenant_api_keys (laundry_id, provider, key_name, encrypted_value, is_platform_managed)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (laundry_id, provider, key_name)
        DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value,
                      is_platform_managed = EXCLUDED.is_platform_managed
    """, (laundry_id, provider, key_name, encrypted, is_platform_managed))

    logger.info(f"[key-resolver] Upserted key: tenant={laundry_id}, provider={provider}, key_name={key_name}, managed={is_platform_managed}")
