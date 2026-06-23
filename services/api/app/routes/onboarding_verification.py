"""
Onboarding verification routes — email verification, address duplicate check,
proof upload with Claude Vision validation.
"""
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form, BackgroundTasks
from app.database import get_db, get_cursor
from app.services.verification_store import verification_store, normalize_address
from app.services.notification_service import send_email
from app.config import settings
import boto3
import uuid
import logging
import anthropic
import base64
import re
import asyncio
import random

logger = logging.getLogger(__name__)

router = APIRouter()

# Allowed file types for proof upload
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# S3 bucket for proof documents
S3_BUCKET = "laundry-item-tracking"
S3_PREFIX = "proof-docs"

# Claude prompt for address extraction
PROOF_EXTRACTION_PROMPT = """You are verifying a business address from an uploaded document.
Extract the full address (street, city, state, zip) from this document.
The document may be a utility bill, bank statement, or government ID.

Return ONLY this JSON:
{
  "found": true/false,
  "street": "extracted street",
  "city": "extracted city",
  "state": "extracted state",
  "zip": "extracted zip"
}

If you cannot find a clear address, set "found" to false."""


@router.post("/verify-email")
async def verify_email(body: dict = Body(...)):
    """
    Check for email duplicates then send a 6-digit verification code.
    """
    email = body.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Check for duplicates in shop.employees (Admin role) and shop.laundry_shops
    with get_db() as conn:
        cur = get_cursor(conn)

        # Check employees table for Admin with same email
        cur.execute(
            "SELECT employee_id FROM shop.employees WHERE LOWER(TRIM(email)) = %s AND role = 'Admin' LIMIT 1",
            (email,)
        )
        if cur.fetchone():
            return {"status": "error", "code": "EMAIL_DUPLICATE",
                    "message": "An account with this email already exists"}

        # Check laundry_shops for contact_email match
        cur.execute(
            "SELECT laundry_id FROM shop.laundry_shops WHERE LOWER(TRIM(contact_email)) = %s LIMIT 1",
            (email,)
        )
        if cur.fetchone():
            return {"status": "error", "code": "EMAIL_DUPLICATE",
                    "message": "An account with this email already exists"}

    # Generate 6-digit code
    code = f"{random.randint(0, 999999):06d}"
    verification_store.store_code(email, code)

    # Send code via email
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #2D3748; margin: 0;">Smart Laundry</h2>
            <p style="color: #718096; margin-top: 4px;">Business Onboarding</p>
        </div>
        <div style="background: #F7FAFC; border-radius: 8px; padding: 24px; text-align: center;">
            <p style="color: #4A5568; margin: 0 0 16px 0;">Your verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2B6CB0; padding: 16px; background: white; border-radius: 8px; display: inline-block;">
                {code}
            </div>
            <p style="color: #718096; margin: 16px 0 0 0; font-size: 14px;">This code expires in 10 minutes.</p>
        </div>
        <p style="color: #A0AEC0; font-size: 12px; text-align: center; margin-top: 24px;">
            If you didn't request this code, you can safely ignore this email.
        </p>
    </div>
    """
    email_sent = send_email(email, "Your Smart Laundry Verification Code", html_body)
    if not email_sent:
        logger.warning(f"Failed to send verification email to {email}")

    return {"status": "success", "message": "Verification code sent"}


@router.post("/confirm-code")
async def confirm_code(body: dict = Body(...)):
    """
    Validate the entered code against the stored code.
    """
    email = body.get("email", "").strip().lower()
    code = body.get("code", "").strip()

    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code are required")

    success, error_code, attempts_remaining = verification_store.verify_code(email, code)

    if success:
        token = verification_store.create_token(email)
        return {"status": "success", "token": token}

    # Handle specific error codes
    if error_code == "CODE_EXPIRED":
        return {"status": "error", "code": "CODE_EXPIRED",
                "message": "Verification code has expired. Please request a new code."}
    elif error_code == "MAX_ATTEMPTS":
        return {"status": "error", "code": "MAX_ATTEMPTS",
                "message": "Too many failed attempts. Please request a new code."}
    elif error_code == "INVALID_CODE":
        return {"status": "error", "code": "INVALID_CODE",
                "message": f"Incorrect code. {attempts_remaining} attempt{'s' if attempts_remaining != 1 else ''} remaining.",
                "attemptsRemaining": attempts_remaining}

    return {"status": "error", "code": "UNKNOWN_ERROR", "message": "Verification failed"}


@router.post("/check-address")
async def check_address(body: dict = Body(...)):
    """
    Check for address duplicates with normalization.
    """
    street = body.get("street", "")
    city = body.get("city", "")
    state = body.get("state", "")
    zip_code = body.get("zipCode", "")

    if not street or not city or not state or not zip_code:
        raise HTTPException(status_code=400, detail="All address fields are required")

    normalized = normalize_address(street, city, state, zip_code)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT laundry_id FROM shop.laundry_shops
               WHERE LOWER(TRIM(street)) = %s
               AND LOWER(TRIM(city)) = %s
               AND LOWER(TRIM(state)) = %s
               AND TRIM(zip_code) = %s
               LIMIT 1""",
            (normalized["street"], normalized["city"], normalized["state"], normalized["zip_code"])
        )
        result = cur.fetchone()

    if result:
        return {"status": "error", "code": "ADDRESS_DUPLICATE",
                "message": "A laundry is already registered at this address"}

    return {"status": "success", "duplicate": False}


@router.post("/upload-proof")
async def upload_proof(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    street: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    zipCode: str = Form(...),
):
    """
    Accept proof document, upload to S3, and kick off async Claude Vision validation.
    """
    # Validate file type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: JPEG, PNG, PDF"
        )

    # Read file content and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB")

    # Generate unique key
    ext = ALLOWED_CONTENT_TYPES[file.content_type]
    proof_id = str(uuid.uuid4())
    s3_key = f"{S3_PREFIX}/{proof_id}.{ext}"

    # Upload to S3
    try:
        s3_client = boto3.client("s3", region_name=settings.aws_region)
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=content,
            ContentType=file.content_type,
        )
    except Exception as e:
        logger.exception(f"S3 upload failed for proof {proof_id}")
        raise HTTPException(status_code=500, detail="Upload failed. Please try again.")

    # Store proof in verification store
    entered_address = normalize_address(street, city, state, zipCode)
    verification_store.store_proof(proof_id, s3_key, entered_address)

    # Enqueue background task for Claude Vision validation
    background_tasks.add_task(_validate_proof_with_claude, proof_id, s3_key, entered_address)

    return {"status": "success", "proofId": proof_id, "message": "Document uploaded. Verification in progress."}


@router.get("/proof-status/{proof_id}")
async def get_proof_status(proof_id: str):
    """
    Poll the status of async address proof validation.
    """
    proof = verification_store.get_proof_status(proof_id)
    if proof is None:
        raise HTTPException(status_code=404, detail="Proof not found")

    response = {"status": proof["status"]}
    if proof["status"] == "verified":
        response["addressVerified"] = True
    elif proof["status"] == "review_required":
        response["addressVerified"] = False
        response["message"] = "Could not confirm address match. Your application will be reviewed manually."

    return response


async def _validate_proof_with_claude(proof_id: str, s3_key: str, entered_address: dict):
    """
    Background task: Download image from S3, send to Claude Vision for address extraction,
    compare extracted vs entered address, update status, and delete S3 object.
    """
    try:
        # Download from S3
        s3_client = boto3.client("s3", region_name=settings.aws_region)
        response = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_key)
        file_bytes = response["Body"].read()
        file_base64 = base64.standard_b64encode(file_bytes).decode("utf-8")

        # Determine media type from S3 key extension
        ext = s3_key.rsplit(".", 1)[-1].lower()
        media_type_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "pdf": "application/pdf"}
        media_type = media_type_map.get(ext, "image/jpeg")

        # Call Claude Vision with timeout
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": file_base64,
                },
            },
            {
                "type": "text",
                "text": "Please extract the address from this document.",
            },
        ]

        # Run Claude call with 60-second timeout
        claude_response = await asyncio.wait_for(
            asyncio.to_thread(
                client.messages.create,
                model="claude-sonnet-4-6",
                max_tokens=512,
                system=PROOF_EXTRACTION_PROMPT,
                messages=[{"role": "user", "content": content}],
            ),
            timeout=60,
        )

        # Parse Claude response
        response_text = claude_response.content[0].text
        extracted = _parse_claude_address_response(response_text)

        if extracted and extracted.get("found"):
            # Compare extracted vs entered address
            match = _compare_addresses(extracted, entered_address)
            if match:
                verification_store.update_proof_status(proof_id, "verified", True)
            else:
                verification_store.update_proof_status(proof_id, "review_required", False)
        else:
            verification_store.update_proof_status(proof_id, "review_required", False)

    except asyncio.TimeoutError:
        logger.warning(f"Claude Vision timeout for proof {proof_id}")
        verification_store.update_proof_status(proof_id, "review_required", False)
    except Exception as e:
        logger.exception(f"Claude Vision validation failed for proof {proof_id}")
        verification_store.update_proof_status(proof_id, "review_required", False)
    finally:
        # Delete S3 object
        try:
            s3_client = boto3.client("s3", region_name=settings.aws_region)
            s3_client.delete_object(Bucket=S3_BUCKET, Key=s3_key)
        except Exception as e:
            logger.warning(f"Failed to delete S3 object {s3_key}: {e}")


def _parse_claude_address_response(response_text: str) -> dict | None:
    """Parse Claude's JSON response for extracted address."""
    import json

    text = response_text.strip()
    # Strip markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3].strip()

    # Try to find JSON in response
    if not text.startswith("{"):
        json_match = re.search(r'\{[\s\S]*"found"[\s\S]*\}', text)
        if json_match:
            text = json_match.group()
        else:
            return None

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse Claude address response: {text[:200]}")
        return None


def _compare_addresses(extracted: dict, entered: dict) -> bool:
    """
    Compare extracted address from Claude with entered address.
    Uses fuzzy matching: street number + name, city, state, zip.
    """
    # Normalize extracted
    ext_street = extracted.get("street", "").strip().lower()
    ext_city = extracted.get("city", "").strip().lower()
    ext_state = extracted.get("state", "").strip().lower()
    ext_zip = extracted.get("zip", "").strip()

    # entered is already normalized via normalize_address
    ent_street = entered.get("street", "")
    ent_city = entered.get("city", "")
    ent_state = entered.get("state", "")
    ent_zip = entered.get("zip_code", "")

    # Zip must match exactly
    if ext_zip != ent_zip:
        return False

    # City must match (case-insensitive, already lowered)
    if ext_city != ent_city:
        return False

    # State must match (handle abbreviations)
    if ext_state != ent_state:
        return False

    # Street: extract number and name for fuzzy comparison
    ext_street_parts = _extract_street_parts(ext_street)
    ent_street_parts = _extract_street_parts(ent_street)

    if not ext_street_parts or not ent_street_parts:
        return False

    # Street number must match
    if ext_street_parts["number"] != ent_street_parts["number"]:
        return False

    # Street name must match (fuzzy: check if one contains the other)
    ext_name = ext_street_parts["name"]
    ent_name = ent_street_parts["name"]

    if ext_name == ent_name:
        return True

    # Fuzzy: one contains the other (handles "main st" vs "main street")
    if ext_name in ent_name or ent_name in ext_name:
        return True

    return False


def _extract_street_parts(street: str) -> dict | None:
    """Extract street number and name from a street address string."""
    match = re.match(r"^(\d+)\s+(.+)$", street.strip())
    if match:
        return {"number": match.group(1), "name": match.group(2).strip()}
    return None
