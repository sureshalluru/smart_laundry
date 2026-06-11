"""
Auth routes — self-hosted authentication replacing Cognito.
Handles: login, register, token refresh, password reset.
"""
from fastapi import APIRouter, Body, HTTPException, status
from app.database import get_db, get_cursor
from app.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/login")
async def login(body: dict = Body(...)):
    """
    Login with phone number + password (customers)
    or employee ID + passcode (admin employees).
    """
    login_type = body.get("type", "customer")  # "customer" or "employee"

    if login_type == "employee":
        return _employee_login(body)
    else:
        return _customer_login(body)


@router.post("/register")
async def register(body: dict = Body(...)):
    """Register a new customer."""
    phone = body.get("phoneNumber")
    email = body.get("email")
    first_name = body.get("firstName")
    last_name = body.get("lastName")
    laundry_id = body.get("laundryId")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check if customer already exists
        normalized = phone.replace("+1", "").strip()
        cur.execute("SELECT customer_id FROM shop.customers WHERE phone_number LIKE %s", (f"%{normalized}%",))
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Phone number already registered")

        # Create customer (no password — uses OTP auth)
        import uuid
        customer_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO shop.customers (customer_id, phone_number, email, first_name, last_name, notif_email, notif_sms, notif_phone)
            VALUES (%s, %s, %s, %s, %s, TRUE, TRUE, TRUE)
            RETURNING customer_id
        """, (customer_id, phone, email, first_name, last_name))
        row = cur.fetchone()
        customer_id = row["customer_id"]

        # Create laundry stats record if laundryId provided
        if laundry_id:
            cur.execute("""
                INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (customer_id, laundry_id))

    # Issue tokens
    token_data = {
        "sub": customer_id,
        "phone": phone,
        "role": "customer",
        "name": f"{first_name} {last_name}".strip(),
    }
    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }


@router.post("/refresh")
async def refresh_token(body: dict = Body(...)):
    """Refresh an expired access token."""
    refresh = body.get("refreshToken")
    if not refresh:
        raise HTTPException(status_code=400, detail="Refresh token required")

    payload = decode_token(refresh)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Issue new access token with same claims
    token_data = {k: v for k, v in payload.items() if k not in ("exp", "type")}
    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
    }


@router.post("/change-password")
async def change_password(body: dict = Body(...)):
    """Change password for a customer."""
    phone = body.get("phoneNumber")
    old_password = body.get("oldPassword")
    new_password = body.get("newPassword")

    if not all([phone, old_password, new_password]):
        raise HTTPException(status_code=400, detail="All fields required")

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT customer_id, password_hash FROM shop.customers WHERE phone_number = %s", (phone,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        if not verify_password(old_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid current password")

        cur.execute("UPDATE shop.customers SET password_hash = %s WHERE customer_id = %s",
                    (hash_password(new_password), row["customer_id"]))

    return {"status": "success", "message": "Password updated"}


def _customer_login(body: dict):
    """Login a customer with phone + password."""
    phone = body.get("phoneNumber")
    password = body.get("password")

    if not phone or not password:
        raise HTTPException(status_code=400, detail="Phone and password required")

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT customer_id, first_name, last_name, phone_number, email, password_hash
            FROM shop.customers WHERE phone_number = %s
        """, (phone,))
        customer = cur.fetchone()

    if not customer or not verify_password(password, customer["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")

    token_data = {
        "sub": customer["customer_id"],
        "phone": customer["phone_number"],
        "email": customer["email"],
        "role": "customer",
        "name": f"{customer['first_name']} {customer['last_name']}".strip(),
    }
    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }


def _employee_login(body: dict):
    """Login an employee with employee ID + passcode. Requires device registration."""
    emp_id = body.get("employeeId")
    passcode = body.get("passcode")
    device_fingerprint = body.get("deviceFingerprint", "")
    laundry_id = body.get("laundryId")

    if not emp_id or not passcode:
        raise HTTPException(status_code=400, detail="Employee ID and passcode required")

    if not device_fingerprint:
        raise HTTPException(status_code=400, detail="Device identification required")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Rate limiting: check failed attempts in last 15 minutes
        cur.execute("""
            SELECT COUNT(*) as fail_count FROM shop.login_attempts
            WHERE device_fingerprint = %s AND success = FALSE
              AND attempted_at > NOW() - INTERVAL '15 minutes'
        """, (device_fingerprint,))
        fails = cur.fetchone()
        if fails and fails["fail_count"] >= 5:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in 15 minutes.")

        # Check if device is registered for this laundry
        if laundry_id:
            cur.execute("""
                SELECT device_id FROM shop.registered_devices
                WHERE laundry_id = %s AND device_fingerprint = %s AND is_active = TRUE
            """, (laundry_id, device_fingerprint))
            device = cur.fetchone()
            if not device:
                raise HTTPException(status_code=403, detail="DEVICE_NOT_REGISTERED")

        # Validate employee credentials
        cur.execute("""
            SELECT emp_id, first_name, last_name, role, passcode, laundry_id, is_active
            FROM shop.employees WHERE UPPER(emp_id) = UPPER(%s)
        """, (emp_id,))
        emp = cur.fetchone()

        if not emp or not emp["is_active"] or emp["passcode"] != passcode:
            # Log failed attempt
            cur.execute("""
                INSERT INTO shop.login_attempts (laundry_id, device_fingerprint, emp_id, success)
                VALUES (%s, %s, %s, FALSE)
            """, (laundry_id or '', device_fingerprint, emp_id))
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Log successful attempt and update device last_login
        cur.execute("""
            INSERT INTO shop.login_attempts (laundry_id, device_fingerprint, emp_id, success)
            VALUES (%s, %s, %s, TRUE)
        """, (emp["laundry_id"], device_fingerprint, emp_id))

        cur.execute("""
            UPDATE shop.registered_devices SET last_login_at = NOW()
            WHERE laundry_id = %s AND device_fingerprint = %s
        """, (emp["laundry_id"], device_fingerprint))

    token_data = {
        "sub": emp["emp_id"],
        "role": emp["role"],
        "laundryId": emp["laundry_id"],
        "name": f"{emp['first_name']} {emp['last_name']}".strip(),
    }
    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }


# ── Device Registration (for admin security) ──────────────────────────────────

@router.post("/check-device")
async def check_device(body: dict = Body(...)):
    """Check if a device is registered for a laundry."""
    laundry_id = body.get("laundryId")
    device_fingerprint = body.get("deviceFingerprint")

    if not laundry_id or not device_fingerprint:
        return {"status": "error", "registered": False}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT device_id FROM shop.registered_devices
            WHERE laundry_id = %s AND device_fingerprint = %s AND is_active = TRUE
        """, (laundry_id, device_fingerprint))
        device = cur.fetchone()

    return {"status": "success", "registered": bool(device)}


@router.post("/register-device")
async def register_device(body: dict = Body(...)):
    """Register a new device using the laundry's registration code."""
    laundry_id = body.get("laundryId")
    device_fingerprint = body.get("deviceFingerprint")
    device_name = body.get("deviceName", "Unknown Device")
    registration_code = body.get("registrationCode")

    if not laundry_id or not device_fingerprint or not registration_code:
        raise HTTPException(status_code=400, detail="Missing required fields")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify registration code
        cur.execute("""
            SELECT device_registration_code FROM shop.laundry_shops
            WHERE laundry_id = %s
        """, (laundry_id,))
        shop = cur.fetchone()

        if not shop:
            raise HTTPException(status_code=404, detail="Laundry not found")

        if shop["device_registration_code"] != registration_code:
            raise HTTPException(status_code=401, detail="Invalid registration code")

        # Register the device
        cur.execute("""
            INSERT INTO shop.registered_devices (laundry_id, device_fingerprint, device_name, registered_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (laundry_id, device_fingerprint) DO UPDATE SET
                is_active = TRUE, device_name = EXCLUDED.device_name, registered_at = NOW()
            RETURNING device_id
        """, (laundry_id, device_fingerprint, device_name, "self-registration"))

    return {"status": "success", "message": "Device registered successfully"}


# ── OTP Authentication (for customers) ────────────────────────────────────────

@router.post("/send-otp")
async def send_otp(body: dict = Body(...)):
    """Send OTP to phone number via Twilio Verify."""
    phone = body.get("phoneNumber")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    from app.config import settings
    try:
        if settings.twilio_account_sid and settings.twilio_verify_service_sid:
            # Use Twilio Verify (production)
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            verification = client.verify.v2.services(
                settings.twilio_verify_service_sid
            ).verifications.create(to=phone, channel="sms")
            return {"status": "success", "message": "OTP sent", "sid": verification.sid}
        elif settings.twilio_account_sid and settings.twilio_auth_token:
            # Use regular Twilio SMS to send OTP
            import random
            from twilio.rest import Client
            otp = str(random.randint(100000, 999999))
            _otp_store[phone] = {"otp": otp, "attempts": 0}
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=f"Your Smart Laundry verification code is: {otp}",
                from_=settings.twilio_phone_number,
                to=phone,
            )
            return {"status": "success", "message": "OTP sent"}
        else:
            # Dev mode: generate OTP and log it (no SMS sent)
            import random
            otp = str(random.randint(100000, 999999))
            _otp_store[phone] = {"otp": otp, "attempts": 0}
            logger.info("🔑 DEV MODE OTP for %s: %s", phone, otp)
            print(f"\n🔑 DEV MODE OTP for {phone}: {otp}\n")
            return {"status": "success", "message": "OTP sent (dev mode - check server console)"}
    except Exception as e:
        logger.exception("send_otp error")
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {str(e)}")


@router.post("/verify-otp")
async def verify_otp(body: dict = Body(...)):
    """Verify OTP and issue JWT token."""
    phone = body.get("phoneNumber")
    otp_code = body.get("otpCode")
    laundry_id = body.get("laundryId")

    if not phone or not otp_code:
        raise HTTPException(status_code=400, detail="Phone number and OTP required")

    from app.config import settings
    verified = False

    try:
        if settings.twilio_account_sid and settings.twilio_verify_service_sid:
            # Production: Verify using Twilio Verify
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            verification_check = client.verify.v2.services(
                settings.twilio_verify_service_sid
            ).verification_checks.create(to=phone, code=otp_code)
            verified = verification_check.status == "approved"
        else:
            # Use in-memory store (both dev mode and regular SMS mode)
            stored = _otp_store.get(phone)
            if stored and stored["otp"] == otp_code and stored["attempts"] < 3:
                verified = True
                del _otp_store[phone]
            elif stored:
                stored["attempts"] += 1
                if stored["attempts"] >= 3:
                    del _otp_store[phone]
                    raise HTTPException(status_code=401, detail="Too many failed attempts")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("verify_otp error")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # OTP verified — find or create customer and issue JWT
    with get_db() as conn:
        cur = get_cursor(conn)
        normalized = phone.replace("+1", "").strip()
        cur.execute("""
            SELECT customer_id, first_name, last_name, phone_number, email
            FROM shop.customers WHERE phone_number LIKE %s
        """, (f"%{normalized}%",))
        customer = cur.fetchone()

        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found. Please sign up first.")

        token_data = {
            "sub": customer["customer_id"],
            "phone": customer["phone_number"],
            "email": customer["email"] or "",
            "role": "customer",
            "name": f"{customer['first_name']} {customer['last_name']}".strip(),
        }
        if laundry_id:
            token_data["laundryId"] = laundry_id

    return {
        "status": "success",
        "isSignedIn": True,
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }


@router.post("/customer-register")
async def customer_register(body: dict = Body(...)):
    """Register a new customer and send OTP for verification."""
    phone = body.get("phoneNumber")
    email = body.get("email", "")
    first_name = body.get("firstName", "")
    last_name = body.get("lastName", "")
    laundry_id = body.get("laundryId")
    receive_phone_notification = body.get("receivePhoneNotification", True)

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    with get_db() as conn:
        cur = get_cursor(conn)
        normalized = phone.replace("+1", "").strip()
        cur.execute("SELECT customer_id FROM shop.customers WHERE phone_number LIKE %s", (f"%{normalized}%",))
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="UsernameExistsException")

        # Create customer
        import uuid
        customer_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO shop.customers (customer_id, phone_number, email, first_name, last_name,
                                        notif_phone, notif_sms, notif_email)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (customer_id, phone, email, first_name, last_name,
              receive_phone_notification, True, bool(email)))

        # Create laundry stats record
        if laundry_id:
            cur.execute("""
                INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (customer_id, laundry_id))

    # Send OTP for verification
    try:
        otp_result = await send_otp({"phoneNumber": phone})
        return {
            "status": "success",
            "isSignUpComplete": False,
            "nextStep": "CONFIRM_SIGN_UP",
            "userId": customer_id,
            "error": None,
        }
    except Exception as e:
        return {
            "status": "success",
            "isSignUpComplete": False,
            "nextStep": "CONFIRM_SIGN_UP",
            "userId": customer_id,
            "error": None,
            "otpError": str(e),
        }


# In-memory OTP store (use Redis in production)
_otp_store = {}
