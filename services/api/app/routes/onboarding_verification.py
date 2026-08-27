"""
Onboarding verification routes — email verification and address duplicate check.
"""
from fastapi import APIRouter, HTTPException, Body
from app.database import get_db, get_cursor
from app.services.verification_store import verification_store, normalize_address
from app.services.notification_service import send_email
import logging
import random

logger = logging.getLogger(__name__)

router = APIRouter()


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
            "SELECT emp_id FROM shop.employees WHERE LOWER(TRIM(email)) = %s AND role = 'Admin' LIMIT 1",
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

    # Log code to console for local development (when email service isn't configured)
    logger.info(f"📧 Email verification code for {email}: {code} (use this if email delivery is not configured)")
    print(f"\n📧 EMAIL VERIFICATION CODE for {email}: {code}\n")

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
