"""
Company join routes — join code lookup and company join verification.
"""
from fastapi import APIRouter, Body
from app.database import get_db, get_cursor
from app.services.verification_store import verification_store
from app.services.notification_service import send_email
import logging
import random

logger = logging.getLogger(__name__)

router = APIRouter()


def mask_name(name: str) -> str:
    """Mask company name: first char + asterisks + last char."""
    if len(name) <= 2:
        return name[0] + '*' if len(name) == 2 else name
    return name[0] + '*' * (len(name) - 2) + name[-1]


def mask_email(email: str) -> str:
    """Mask email: first char + asterisks + last char before @, full domain."""
    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '*' if len(local) == 2 else local
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    return f"{masked_local}@{domain}"


@router.post("/lookup-join-code")
def lookup_join_code(body: dict = Body(...)):
    """Look up a company by its join code. Returns masked info on match, generic error on miss."""
    join_code = body.get("joinCode", "").strip()

    if not join_code:
        return {"status": "error", "message": "Invalid join code"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT company_id, company_name, contact_email FROM shop.companies WHERE join_code = %s",
            (join_code,),
        )
        row = cur.fetchone()

    if not row:
        return {"status": "error", "message": "Invalid join code"}

    masked_name = mask_name(row["company_name"])
    masked_email = mask_email(row["contact_email"]) if row["contact_email"] else None

    return {
        "status": "success",
        "companyId": str(row["company_id"]),
        "maskedName": masked_name,
        "maskedEmail": masked_email,
    }


@router.post("/company-verify")
def company_verify(body: dict = Body(...)):
    """Send a 6-digit verification code to the company's contact email."""
    company_id = body.get("companyId", "").strip()

    if not company_id:
        return {"status": "error", "message": "Company ID is required"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT contact_email FROM shop.companies WHERE company_id = %s",
            (company_id,),
        )
        row = cur.fetchone()

    if not row:
        return {"status": "error", "message": "Company not found"}

    contact_email = row["contact_email"]
    if not contact_email:
        return {
            "status": "error",
            "code": "NO_CONTACT_EMAIL",
            "message": "Company cannot be joined via self-service",
        }

    # Generate 6-digit verification code
    code = f"{random.randint(0, 999999):06d}"
    verification_store.store_code(f"company_join:{company_id}", code)

    # Send code to company's contact email
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #2D3748; margin: 0;">Smart Laundry</h2>
            <p style="color: #718096; margin-top: 4px;">Company Join Verification</p>
        </div>
        <div style="background: #F7FAFC; border-radius: 8px; padding: 24px; text-align: center;">
            <p style="color: #4A5568; margin: 0 0 16px 0;">A new location is requesting to join your company. Their verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2B6CB0; padding: 16px; background: white; border-radius: 8px; display: inline-block;">
                {code}
            </div>
            <p style="color: #718096; margin: 16px 0 0 0; font-size: 14px;">This code expires in 10 minutes.</p>
        </div>
        <p style="color: #A0AEC0; font-size: 12px; text-align: center; margin-top: 24px;">
            If you didn't expect this request, you can safely ignore this email.
        </p>
    </div>
    """
    email_sent = send_email(contact_email, "Company Join Verification Code - Smart Laundry", html_body)
    if not email_sent:
        logger.warning(f"Failed to send company verification email to {contact_email} for company {company_id}")

    return {"status": "success", "message": "Verification code sent"}


@router.post("/company-confirm")
def company_confirm(body: dict = Body(...)):
    """Verify a 6-digit code for company join and return a token on success."""
    company_id = body.get("companyId", "").strip()
    code = body.get("code", "").strip()

    if not company_id or not code:
        return {"status": "error", "message": "Company ID and code are required"}

    key = f"company_join:{company_id}"
    success, error_code, attempts_remaining = verification_store.verify_code(key, code)

    if success:
        token = verification_store.create_token(key)
        return {"status": "success", "token": token}

    # Handle specific error cases
    if error_code == "CODE_EXPIRED":
        return {
            "status": "error",
            "code": "CODE_EXPIRED",
            "message": "Code expired, please request a new one",
        }

    if error_code == "MAX_ATTEMPTS":
        return {
            "status": "error",
            "code": "MAX_ATTEMPTS",
            "message": "Too many attempts, please request a new code",
        }

    # INVALID_CODE
    return {
        "status": "error",
        "code": "INVALID_CODE",
        "message": "Invalid verification code",
        "attemptsRemaining": attempts_remaining,
    }
