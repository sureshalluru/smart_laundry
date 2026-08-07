"""
Admin Integrations API — manage per-tenant API keys.
Allows tenant admins to view (masked) and update their integration keys.
"""
from fastapi import APIRouter, Depends, Query, Body, HTTPException
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.key_resolver import (
    get_all_tenant_keys, upsert_tenant_key, VALID_KEYS
)
from app.services.masking import mask_key
from app.services.encryption_service import get_encryption_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Allowed providers
ALLOWED_PROVIDERS = {"twilio", "brevo", "anthropic", "google_maps", "s3"}

# Provider -> allowed key_names
PROVIDER_KEY_NAMES = {
    "twilio": {"account_sid", "auth_token", "phone_number", "verify_service_sid"},
    "brevo": {"api_key"},
    "anthropic": {"api_key"},
    "google_maps": {"api_key"},
    "s3": {"access_key_id", "secret_access_key", "region", "logo_bucket", "review_bucket", "tracking_bucket"},
}

MAX_KEY_VALUE_LENGTH = 10 * 1024  # 10KB


# ── Pydantic Models ───────────────────────────────────────────────────────────

class KeyEntry(BaseModel):
    provider: str
    key_name: str
    value: str

    @validator("provider")
    def validate_provider(cls, v):
        if v not in ALLOWED_PROVIDERS:
            raise ValueError(f"Invalid provider '{v}'. Allowed: {sorted(ALLOWED_PROVIDERS)}")
        return v

    @validator("key_name")
    def validate_key_name(cls, v, values):
        provider = values.get("provider")
        if provider and provider in PROVIDER_KEY_NAMES:
            allowed = PROVIDER_KEY_NAMES[provider]
            if v not in allowed:
                raise ValueError(f"Invalid key_name '{v}' for provider '{provider}'. Allowed: {sorted(allowed)}")
        return v

    @validator("value")
    def validate_value_length(cls, v):
        if len(v) > MAX_KEY_VALUE_LENGTH:
            raise ValueError(f"Key value too large (max {MAX_KEY_VALUE_LENGTH} bytes)")
        return v


class KeyUpdateRequest(BaseModel):
    laundryId: str
    keys: List[KeyEntry]


class MaskedKeyResponse(BaseModel):
    provider: str
    key_name: str
    masked_value: str
    is_platform_managed: bool
    updated_at: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/integrations")
async def get_integrations(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Return all integration keys for a tenant (masked values)."""
    with get_db() as conn:
        keys = get_all_tenant_keys(conn, laundryId)

    return {
        "statusCode": 200,
        "body": {
            "keys": keys
        }
    }


@router.put("/integrations")
async def update_integrations(
    body: KeyUpdateRequest = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create or update one or more integration keys for a tenant."""
    laundry_id = body.laundryId
    enc_service = get_encryption_service()
    if not enc_service:
        raise HTTPException(status_code=500, detail="Encryption service not available")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check for platform-managed keys that cannot be updated by tenants
        for key_entry in body.keys:
            cur.execute("""
                SELECT is_platform_managed FROM tenant_api_keys
                WHERE laundry_id = %s AND provider = %s AND key_name = %s
            """, (laundry_id, key_entry.provider, key_entry.key_name))
            row = cur.fetchone()
            if row and row["is_platform_managed"]:
                raise HTTPException(
                    status_code=403,
                    detail=f"Cannot modify platform-managed key: {key_entry.provider}/{key_entry.key_name}"
                )

        # Upsert all keys
        for key_entry in body.keys:
            upsert_tenant_key(
                conn,
                laundry_id,
                key_entry.provider,
                key_entry.key_name,
                key_entry.value,
                is_platform_managed=False,
            )
            logger.info(
                f"[integrations] Tenant key updated: tenant={laundry_id}, "
                f"provider={key_entry.provider}, key_name={key_entry.key_name}"
            )

        # Return newly masked values
        updated_keys = get_all_tenant_keys(conn, laundry_id)

    return {
        "statusCode": 200,
        "body": {
            "message": "Keys updated successfully",
            "keys": updated_keys
        }
    }
