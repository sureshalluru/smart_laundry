"""
Platform Admin routes — super-admin for onboarding laundries.
Protected by platform admin secret key.
"""
from fastapi import APIRouter, Body, Header, HTTPException, Query, Request
from app.database import get_db, get_cursor
from app.services.verification_store import verification_store, normalize_address
from app.services.join_code import generate_join_code_with_retry
from app.auth import hash_password
import logging
import uuid
import random
import string

logger = logging.getLogger(__name__)


def _get_base_url(request: Request) -> str:
    """Get the base URL from the incoming request (works for both local and production)."""
    # Use X-Forwarded-Proto/Host if behind a reverse proxy (Render, nginx, etc.)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"
router = APIRouter()

# Platform admin auth — simple secret key (set in env)
PLATFORM_ADMIN_KEY = "SLB-PLATFORM-2024"  # Change this in production


def verify_platform_admin(x_platform_key: str = Header(None)):
    """Verify platform admin access."""
    if x_platform_key != PLATFORM_ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized — invalid platform key")


@router.get("/laundries")
async def list_laundries(x_platform_key: str = Header(None)):
    """List all laundries on the platform."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT laundry_id, laundry_name, laundry_timezone, street, city, state, zip_code,
                   device_registration_code, bag_price, user_domain,
                   stripe_public_key, stripe_terminal_id,
                   created_at
            FROM shop.laundry_shops
            ORDER BY created_at DESC
        """)
        laundries = []
        for r in cur.fetchall():
            # Count employees
            cur.execute("SELECT COUNT(*) as cnt FROM shop.employees WHERE laundry_id = %s AND is_active = TRUE", (r["laundry_id"],))
            emp_count = cur.fetchone()["cnt"]

            # Count active orders
            cur.execute("SELECT COUNT(*) as cnt FROM orders.orders WHERE laundry_id = %s AND status_category = 'Active'", (r["laundry_id"],))
            order_count = cur.fetchone()["cnt"]

            # Monthly revenue (current month)
            cur.execute("""
                SELECT COALESCE(SUM(grand_total), 0) as revenue
                FROM orders.orders
                WHERE laundry_id = %s AND created_at >= date_trunc('month', CURRENT_DATE)
                  AND order_status != 'OrderCanceled'
            """, (r["laundry_id"],))
            monthly_revenue = float(cur.fetchone()["revenue"])

            # Owner contact info (first Admin or Manager employee)
            cur.execute("""
                SELECT email, phone, first_name, last_name
                FROM shop.employees
                WHERE laundry_id = %s AND role IN ('Admin', 'Manager') AND is_active = TRUE
                ORDER BY created_at ASC LIMIT 1
            """, (r["laundry_id"],))
            owner = cur.fetchone()

            laundries.append({
                "laundryId": r["laundry_id"],
                "laundryName": r["laundry_name"],
                "timezone": r["laundry_timezone"],
                "address": f"{r['street'] or ''}, {r['city'] or ''}, {r['state'] or ''} {r['zip_code'] or ''}".strip(', '),
                "deviceRegistrationCode": r["device_registration_code"],
                "bagPrice": float(r["bag_price"]) if r["bag_price"] else 30.0,
                "userDomain": r["user_domain"],
                "hasStripe": bool(r["stripe_public_key"]),
                "hasTerminal": bool(r["stripe_terminal_id"]),
                "employeeCount": emp_count,
                "activeOrders": order_count,
                "monthlyRevenue": monthly_revenue,
                "ownerName": f"{owner['first_name']} {owner['last_name']}".strip() if owner else "",
                "ownerEmail": owner["email"] if owner else "",
                "ownerPhone": owner["phone"] if owner else "",
                "createdAt": str(r["created_at"]) if r["created_at"] else None,
            })

    return {"status": "success", "laundries": laundries}


@router.delete("/laundries/{laundry_id}")
async def delete_laundry(laundry_id: str, x_platform_key: str = Header(None)):
    """
    Delete a laundry and ALL its associated data.
    This is destructive and irreversible. Used for cleaning up test tenants.
    Deletes from all known tables that reference laundry_id in a single transaction.
    """
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify laundry exists
        cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        row = cur.fetchone()
        if not row:
            return {"status": "error", "message": f"Laundry {laundry_id} not found"}

        laundry_name = row["laundry_name"]

        # --- Order child tables (FK to orders.orders, not directly to laundry_shops) ---
        order_child_tables = [
            "orders.order_tips",
            "orders.order_payments",
            "orders.order_services",
            "orders.order_products",
            "orders.order_history",
        ]
        for table in order_child_tables:
            try:
                cur.execute(f"DELETE FROM {table} WHERE order_id IN (SELECT order_id FROM orders.orders WHERE laundry_id = %s)", (laundry_id,))
            except Exception as e:
                logger.warning(f"[DELETE] Order child cleanup skipped {table}: {e}")

        # --- Orders ---
        try:
            cur.execute("DELETE FROM orders.orders WHERE laundry_id = %s", (laundry_id,))
        except Exception as e:
            logger.warning(f"[DELETE] orders.orders failed: {e}")

        # --- Frequency subscriptions ---
        try:
            cur.execute("DELETE FROM orders.laundry_frequency WHERE laundry_id = %s", (laundry_id,))
        except Exception as e:
            logger.warning(f"[DELETE] laundry_frequency failed: {e}")

        # --- Tracking tables ---
        for table in ["tracking.fold_records", "tracking.intake_records", "tracking.tracking_sessions", "tracking.vision_tasks", "tracking.item_categories"]:
            try:
                cur.execute(f"DELETE FROM {table} WHERE laundry_id = %s", (laundry_id,))
            except Exception as e:
                logger.warning(f"[DELETE] {table} failed: {e}")

        # --- Routes ---
        for table in ["routes.route_assignments", "routes.driver_locations"]:
            try:
                cur.execute(f"DELETE FROM {table} WHERE laundry_id = %s", (laundry_id,))
            except Exception as e:
                logger.warning(f"[DELETE] {table} failed: {e}")

        # --- Shop-level tables referencing laundry_id (no FK or soft FK) ---
        shop_tables = [
            "shop.service_categories",
            "shop.laundry_services",
            "shop.laundry_products",
            "shop.delivery_time_slots",
            "shop.instore_pickup_time_slots",
            "shop.frequency_intervals",
            "shop.employees",
            "shop.promotions",
            "shop.customer_payment_profiles",
            "shop.customer_laundry_stats",
            "shop.customer_reminders",
            "shop.engagement_config",
            "shop.tenant_faqs",
            "shop.audit_log",
        ]
        for table in shop_tables:
            try:
                cur.execute(f"DELETE FROM {table} WHERE laundry_id = %s", (laundry_id,))
            except Exception as e:
                logger.warning(f"[DELETE] {table} failed: {e}")

        # --- Dynamic FK cleanup (catch any tables we missed above) ---
        try:
            cur.execute("""
                SELECT
                    tc.table_schema || '.' || tc.table_name AS child_table,
                    kcu.column_name AS child_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND ccu.table_schema = 'shop'
                  AND ccu.table_name = 'laundry_shops'
                  AND ccu.column_name = 'laundry_id'
            """)
            fk_refs = cur.fetchall()
            for ref in fk_refs:
                table = ref["child_table"]
                column = ref["child_column"]
                try:
                    cur.execute(f'DELETE FROM {table} WHERE "{column}" = %s', (laundry_id,))
                except Exception:
                    pass
        except Exception:
            pass

        # --- Finally delete the laundry shop itself ---
        try:
            cur.execute("DELETE FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        except Exception as e:
            logger.error(f"FAILED to delete laundry_shops row for {laundry_id}: {e}")
            return {"status": "error", "message": f"Failed to delete laundry: {e}"}

    logger.info(f"Deleted laundry: {laundry_name} (ID: {laundry_id})")
    return {"status": "success", "message": f"Laundry '{laundry_name}' and all associated data deleted."}


@router.post("/laundries")
async def create_laundry(request: Request, body: dict = Body(...), x_platform_key: str = Header(None)):
    """Create a new laundry + owner employee."""
    verify_platform_admin(x_platform_key)

    laundry_name = body.get("laundryName")
    timezone = body.get("timezone", "America/Chicago")
    street = body.get("street", "")
    city = body.get("city", "")
    state = body.get("state", "")
    zip_code = body.get("zipCode", "")
    country = body.get("country", "USA")
    bag_price = float(body.get("bagPrice") or 30)

    # Owner details
    owner_first_name = body.get("ownerFirstName", "")
    owner_last_name = body.get("ownerLastName", "")
    owner_email = body.get("ownerEmail", "")
    owner_phone = body.get("ownerPhone", "")

    # Stripe (optional at creation)
    stripe_public_key = body.get("stripePublicKey", "")
    stripe_private_key = body.get("stripePrivateKey", "")

    if not laundry_name:
        return {"status": "error", "message": "Laundry name is required"}

    # Generate laundry ID (auto-increment style)
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT MAX(CAST(laundry_id AS INTEGER)) as max_id FROM shop.laundry_shops WHERE laundry_id ~ '^[0-9]+$'")
        row = cur.fetchone()
        next_id = str((row["max_id"] or 0) + 1)

    # Generate device registration code
    reg_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    # Generate employee prefix (first 3 chars of name + laundry_id)
    emp_prefix = ''.join(c for c in laundry_name[:3] if c.isalpha()).upper() + next_id

    # Create owner employee ID and passcode
    owner_emp_id = emp_prefix + "1"
    owner_passcode = ''.join(random.choices(string.digits, k=4))

    with get_db() as conn:
        cur = get_cursor(conn)

        # Create laundry shop
        cur.execute("""
            INSERT INTO shop.laundry_shops (
                laundry_id, laundry_name, laundry_timezone,
                street, city, state, zip_code, country,
                device_registration_code, bag_price,
                stripe_public_key, stripe_private_key,
                delivery_time_interval, emp_prefix
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 120, %s)
        """, (
            next_id, laundry_name, timezone,
            street, city, state, zip_code, country,
            reg_code, bag_price,
            stripe_public_key, stripe_private_key,
            emp_prefix,
        ))

        # Create owner employee (using 'Admin' role which exists in the enum)
        cur.execute("""
            INSERT INTO shop.employees (emp_id, first_name, last_name, role, passcode, laundry_id, is_active, email)
            VALUES (%s, %s, %s, 'Admin', %s, %s, TRUE, %s)
        """, (owner_emp_id, owner_first_name, owner_last_name, owner_passcode, next_id, owner_email))

        # Create default serviceable zip codes (owner can update later)
        if zip_code:
            import json as json_mod
            cur.execute("""
                UPDATE shop.laundry_shops SET serviceable_zip_codes = %s::json WHERE laundry_id = %s
            """, (json_mod.dumps([zip_code]), next_id))

    return {
        "status": "success",
        "laundry": {
            "laundryId": next_id,
            "laundryName": laundry_name,
            "deviceRegistrationCode": reg_code,
            "adminUrl": f"{_get_base_url(request)}/{next_id}/admin",
            "customerUrl": f"{_get_base_url(request)}/{next_id}/site",
        },
        "owner": {
            "employeeId": owner_emp_id,
            "passcode": owner_passcode,
            "name": f"{owner_first_name} {owner_last_name}".strip(),
        },
    }


@router.put("/laundries/{laundry_id}")
async def update_laundry(laundry_id: str, body: dict = Body(...), x_platform_key: str = Header(None)):
    """Update laundry settings."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        updates = {}
        if "laundryName" in body: updates["laundry_name"] = body["laundryName"]
        if "timezone" in body: updates["laundry_timezone"] = body["timezone"]
        if "street" in body: updates["street"] = body["street"]
        if "city" in body: updates["city"] = body["city"]
        if "state" in body: updates["state"] = body["state"]
        if "zipCode" in body: updates["zip_code"] = body["zipCode"]
        if "bagPrice" in body: updates["bag_price"] = float(body["bagPrice"])
        if "taxRate" in body: updates["tax_rate"] = float(body["taxRate"])
        if "deviceRegistrationCode" in body: updates["device_registration_code"] = body["deviceRegistrationCode"]
        if "stripePublicKey" in body: updates["stripe_public_key"] = body["stripePublicKey"]
        if "stripePrivateKey" in body: updates["stripe_private_key"] = body["stripePrivateKey"]
        if "stripeTerminalId" in body: updates["stripe_terminal_id"] = body["stripeTerminalId"]
        if "userDomain" in body: updates["user_domain"] = body["userDomain"]

        if not updates:
            return {"status": "error", "message": "No fields to update"}

        set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
        values = list(updates.values()) + [laundry_id]
        cur.execute(f"UPDATE shop.laundry_shops SET {set_clause} WHERE laundry_id = %s", values)

    return {"status": "success", "message": "Laundry updated"}


@router.get("/laundries/{laundry_id}/employees")
async def get_laundry_employees(laundry_id: str, x_platform_key: str = Header(None)):
    """Get employees for a laundry."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, first_name, last_name, role, is_active, email, phone_number
            FROM shop.employees WHERE laundry_id = %s ORDER BY emp_id
        """, (laundry_id,))
        employees = [{
            "empId": r["emp_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "role": r["role"],
            "isActive": r["is_active"],
            "email": r["email"],
            "phone": r["phone_number"],
        } for r in cur.fetchall()]

    return {"status": "success", "employees": employees}


@router.get("/laundries/{laundry_id}/devices")
async def get_registered_devices(laundry_id: str, x_platform_key: str = Header(None)):
    """Get registered devices for a laundry."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT device_id, device_fingerprint, device_name, registered_by,
                   registered_at, last_login_at, is_active
            FROM shop.registered_devices WHERE laundry_id = %s ORDER BY registered_at DESC
        """, (laundry_id,))
        devices = [{
            "deviceId": str(r["device_id"]),
            "fingerprint": r["device_fingerprint"],
            "name": r["device_name"],
            "registeredBy": r["registered_by"],
            "registeredAt": str(r["registered_at"]),
            "lastLoginAt": str(r["last_login_at"]) if r["last_login_at"] else None,
            "isActive": r["is_active"],
        } for r in cur.fetchall()]

    return {"status": "success", "devices": devices}


@router.delete("/laundries/{laundry_id}/devices/{device_id}")
async def revoke_device(laundry_id: str, device_id: str, x_platform_key: str = Header(None)):
    """Revoke a registered device."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.registered_devices SET is_active = FALSE
            WHERE device_id = %s AND laundry_id = %s
        """, (device_id, laundry_id))

    return {"status": "success", "message": "Device revoked"}


@router.post("/laundries/{laundry_id}/reset-registration-code")
async def reset_registration_code(laundry_id: str, x_platform_key: str = Header(None)):
    """Generate a new device registration code for a laundry."""
    verify_platform_admin(x_platform_key)

    new_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops SET device_registration_code = %s WHERE laundry_id = %s
        """, (new_code, laundry_id))

    return {"status": "success", "newCode": new_code}


@router.post("/laundries/{laundry_id}/hide-home-address")
async def set_hide_home_address(laundry_id: str, body: dict = Body(...), x_platform_key: str = Header(None)):
    """
    Toggle the hide_home_address privacy flag for a laundry.

    When enabled, the shop's street address is never shown on any client-facing
    surface (website, booking portal, SEO city pages, public API, AI chat) —
    only city/state and the service area are public. The street stays stored
    internally for driver routing and account verification. Intended for
    home-based wash & fold operators with no public drop-off location.
    """
    verify_platform_admin(x_platform_key)

    hide = bool(body.get("hide", True))

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "UPDATE shop.laundry_shops SET hide_home_address = %s WHERE laundry_id = %s RETURNING laundry_id",
            (hide, laundry_id),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Laundry not found")

    return {"status": "success", "laundryId": laundry_id, "hideHomeAddress": hide}


@router.post("/onboard")
async def self_service_onboard(request: Request, body: dict = Body(...)):
    """
    Self-service onboarding endpoint for new tenants.
    No auth required — creates a full laundry setup from the onboarding form.
    """
    laundry_name = body.get("laundryName", "").strip()
    timezone = body.get("timezone", "America/Chicago")
    street = body.get("street", "")
    city = body.get("city", "")
    state = body.get("state", "")
    zip_code = body.get("zipCode", "")
    country = body.get("country", "USA")
    contact_phone = body.get("contactPhone", "")
    contact_email = body.get("contactEmail", "")

    # Owner
    owner_first_name = body.get("ownerFirstName", "")
    owner_last_name = body.get("ownerLastName", "")
    owner_phone = body.get("ownerPhone", "")
    owner_email = body.get("ownerEmail", "")

    # Services
    services = body.get("services", [])

    # Schedule
    delivery_time_slots = body.get("deliveryTimeSlots", [])
    delivery_time_interval = int(body.get("deliveryTimeInterval", 2))

    # Payments
    stripe_public_key = body.get("stripePublicKey", "")
    stripe_private_key = body.get("stripePrivateKey", "")

    # Branding
    theme_color = body.get("themeColor", "blue")
    logo_base64 = body.get("logoBase64")
    custom_domain = body.get("customDomain", "")
    tagline = body.get("tagline", "")

    # Serviceable zip codes
    serviceable_zip_codes = body.get("serviceableZipCodes", [])

    # SMS Add-On
    sms_enabled = body.get("smsEnabled", False)

    # Verification fields
    email_verification_token = body.get("emailVerificationToken", "")

    # Referral fields
    referred_by_name = body.get("referredByName", "").strip()
    referred_by_email = body.get("referredByEmail", "").strip().lower()

    # Multi-location fields
    multi_location = body.get("multiLocation", "none") or "none"  # "none" | "create" | "join"
    company_name = body.get("companyName", "").strip()
    company_email = body.get("companyEmail", "").strip()
    company_join_token = body.get("companyJoinToken", "").strip()

    if not laundry_name:
        return {"status": "error", "message": "Laundry name is required"}
    if not owner_phone:
        return {"status": "error", "message": "Owner phone number is required"}

    # --- Verification enforcement (only when verification token is provided) ---
    # This allows the old /onboard flow to work without verification during testing
    if email_verification_token:
        # 1. Validate email verification token
        token_email = verification_store.validate_token(email_verification_token)
        if token_email is None:
            raise HTTPException(status_code=400, detail="Email verification expired. Please re-verify.")

        # 2. Re-check email duplicate (defense in depth)
        with get_db() as conn:
            cur = get_cursor(conn)
            check_email = owner_email.strip().lower() if owner_email else ""
            if check_email:
                cur.execute(
                    "SELECT emp_id FROM shop.employees WHERE LOWER(TRIM(email)) = %s AND role = 'Admin' LIMIT 1",
                    (check_email,)
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Email already registered")
                cur.execute(
                    "SELECT laundry_id FROM shop.laundry_shops WHERE LOWER(TRIM(contact_email)) = %s LIMIT 1",
                    (check_email,)
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Email already registered")

        # 3. Re-check address duplicate (defense in depth)
        if street and city and state and zip_code:
            normalized_addr = normalize_address(street, city, state, zip_code)
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute(
                    """SELECT laundry_id FROM shop.laundry_shops
                       WHERE LOWER(TRIM(street)) = %s
                       AND LOWER(TRIM(city)) = %s
                       AND LOWER(TRIM(state)) = %s
                       AND TRIM(zip_code) = %s
                       LIMIT 1""",
                    (normalized_addr["street"], normalized_addr["city"],
                     normalized_addr["state"], normalized_addr["zip_code"])
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Address already registered")

    # --- Multi-location "join" mode: validate company join token upfront ---
    join_company_id = None
    if multi_location == "join":
        if not company_join_token:
            return {"status": "error", "message": "Company join token is required for join mode"}
        token_key = verification_store.validate_token(company_join_token)
        if token_key is None:
            return {"status": "error", "message": "Company join token is expired or invalid"}
        # Extract company_id from the key (format: "company_join:{company_id}")
        if not token_key.startswith("company_join:"):
            return {"status": "error", "message": "Company join token is expired or invalid"}
        join_company_id = token_key.replace("company_join:", "")

    try:
        import json as json_mod

        # Generate laundry ID
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("SELECT MAX(CAST(laundry_id AS INTEGER)) as max_id FROM shop.laundry_shops WHERE laundry_id ~ '^[0-9]+$'")
            row = cur.fetchone()
            next_id = str((row["max_id"] or 0) + 1)

        # Generate codes
        reg_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        emp_prefix = ''.join(c for c in laundry_name[:3] if c.isalpha()).upper() + next_id
        owner_emp_id = emp_prefix + "1"
        owner_passcode = ''.join(random.choices(string.digits, k=4))

        with get_db() as conn:
            cur = get_cursor(conn)

            # 1. Create laundry shop
            # Build site_content JSONB for branding + location
            full_address = f"{street}, {city}, {state} {zip_code}"
            maps_query = f"{street}, {city}, {state} {zip_code}, {country}".replace(" ", "+")
            site_content = {
                "themeColor": theme_color,
                "tagline": tagline,
                "heroTitle": f"Welcome to {laundry_name}",
                "heroSubtitle": tagline or "Professional laundry service at your doorstep",
                "headline": f"Fresh, Clean Laundry <span>Delivered</span>",
                "subheadline": tagline or f"{laundry_name} — professional wash & fold with free pickup and delivery.",
                "heroVideoUrl": "https://laundry-images-store-prod.s3.us-east-1.amazonaws.com/15380072_3840_2160_30fps.mp4",
                "address": full_address,
                "city": city,
                "state": state,
                "zip": zip_code,
                "mapsQuery": maps_query,
                "phone": contact_phone,
                "email": contact_email,
                "hours": [
                    {"day": "Mon-Fri", "time": "8AM - 5PM"},
                    {"day": "Sat", "time": "9AM - 5PM"},
                ],
                "trustBadges": ["Free Pickup & Delivery", "Open 24/7", "Modern Facility"],
            }

            cur.execute("""
                INSERT INTO shop.laundry_shops (
                    laundry_id, laundry_name, laundry_timezone,
                    street, city, state, zip_code, country,
                    contact_phone, contact_email,
                    device_registration_code, bag_price,
                    stripe_public_key, stripe_private_key,
                    delivery_time_interval, emp_prefix,
                    serviceable_zip_codes, user_domain, site_content,
                    referred_by_name, referred_by_email, sms_enabled
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                next_id, laundry_name, timezone,
                street, city, state, zip_code, country,
                contact_phone, contact_email,
                reg_code, 30.00,
                stripe_public_key, stripe_private_key,
                delivery_time_interval, emp_prefix,
                json_mod.dumps(serviceable_zip_codes) if serviceable_zip_codes else json_mod.dumps([zip_code] if zip_code else []),
                custom_domain or None,
                json_mod.dumps(site_content),
                referred_by_name or None,
                referred_by_email or None,
                bool(sms_enabled),
            ))

            # Upload logo if provided
            if logo_base64:
                try:
                    from app.services.s3_service import get_s3_client
                    import base64
                    logo_bytes = base64.b64decode(logo_base64)
                    s3_key = f"logos/{next_id}/logo.png"
                    s3 = get_s3_client()
                    s3.put_object(Bucket="laundrylogos", Key=s3_key, Body=logo_bytes, ContentType="image/png")
                    logo_url = f"https://laundrylogos.s3.amazonaws.com/{s3_key}"
                    cur.execute("UPDATE shop.laundry_shops SET laundry_logo = %s WHERE laundry_id = %s", (logo_url, next_id))
                except Exception as logo_err:
                    logger.warning(f"Logo upload failed for {laundry_name}: {logo_err}")
                    # Store base64 as fallback
                    try:
                        cur.execute("UPDATE shop.laundry_shops SET laundry_logo = %s WHERE laundry_id = %s",
                                    (f"data:image/png;base64,{logo_base64}", next_id))
                    except Exception:
                        pass  # Don't let logo failure break onboarding

            # 2. Create owner employee
            cur.execute("""
                INSERT INTO shop.employees (emp_id, first_name, last_name, role, passcode, laundry_id, is_active, email)
                VALUES (%s, %s, %s, 'Admin', %s, %s, TRUE, %s)
            """, (owner_emp_id, owner_first_name, owner_last_name, owner_passcode, next_id, owner_email))

            # 3. Create service categories and services
            # Default categories (always created)
            default_categories = [
                {"name": "Wash & Fold (Per Pound)", "order": 1},
                {"name": "Wash & Fold (Per Bag)", "order": 2},
                {"name": "Comforters & Large Items", "order": 3},
            ]
            category_ids = {}
            for cat in default_categories:
                cur.execute("""
                    INSERT INTO shop.service_categories (laundry_id, category_name, display_order)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (laundry_id, category_name) DO UPDATE SET display_order = EXCLUDED.display_order
                    RETURNING category_id
                """, (next_id, cat["name"], cat["order"]))
                category_ids[cat["name"]] = cur.fetchone()["category_id"]

            # Default services (one per category, used if no services provided)
            default_services = [
                {"serviceName": "Wash and Fold", "price": 1.59, "inputWeight": True, "categoryName": "Wash & Fold (Per Pound)"},
                {"serviceName": "Wash & Fold Bag", "price": 30.00, "inputWeight": False, "categoryName": "Wash & Fold (Per Bag)"},
                {"serviceName": "Comforter (Any Size)", "price": 22.00, "inputWeight": False, "categoryName": "Comforters & Large Items"},
            ]

            # Use provided services if available, otherwise use defaults
            services_to_create = services if services else default_services

            for svc in services_to_create:
                svc_name = svc.get("serviceName", "").strip()
                if not svc_name:
                    continue
                price = float(svc.get("price", 0))
                input_weight = svc.get("inputWeight", True)
                customer_access = svc.get("customerAccess", True)
                # Match to category if specified
                cat_name = svc.get("categoryName", "")
                cat_id = category_ids.get(cat_name) if cat_name else None
                cur.execute("""
                    INSERT INTO shop.laundry_services (laundry_id, service_name, price, input_weight, customer_access, is_active, category_id)
                    VALUES (%s, %s, %s, %s, %s, TRUE, %s)
                """, (next_id, svc_name, price, input_weight, customer_access, cat_id))

            # 4. Create delivery time slots
            for slot in delivery_time_slots:
                day = slot.get("day")
                start_time = slot.get("startTime")
                end_time = slot.get("endTime")
                if day and start_time and end_time:
                    cur.execute("""
                        INSERT INTO shop.delivery_time_slots (laundry_id, day_of_week, start_time, end_time)
                        VALUES (%s, %s, %s, %s)
                    """, (next_id, day, start_time, end_time))

            # 5. Create default in-store pickup time slots (same as delivery)
            for slot in delivery_time_slots:
                day = slot.get("day")
                start_time = slot.get("startTime")
                end_time = slot.get("endTime")
                if day and start_time and end_time:
                    cur.execute("""
                        INSERT INTO shop.instore_pickup_time_slots (laundry_id, day_of_week, start_time, end_time)
                        VALUES (%s, %s, %s, %s)
                    """, (next_id, day, start_time, end_time))

            # 6. Multi-location handling
            company_info = None
            if multi_location == "create":
                # Create a new company
                cur.execute("""
                    INSERT INTO shop.companies (company_name, contact_email)
                    VALUES (%s, %s)
                    RETURNING company_id, company_name
                """, (company_name, company_email or None))
                new_company = cur.fetchone()
                new_company_id = str(new_company["company_id"])

                # Generate join code for the new company
                join_code = generate_join_code_with_retry(company_name, conn, new_company_id)

                # Assign the new laundry to the company
                cur.execute(
                    "UPDATE shop.laundry_shops SET company_id = %s WHERE laundry_id = %s",
                    (new_company_id, next_id)
                )

                company_info = {
                    "companyId": new_company_id,
                    "companyName": company_name,
                    "joinCode": join_code,
                }

            elif multi_location == "join":
                # Assign the new laundry to the existing company
                cur.execute(
                    "UPDATE shop.laundry_shops SET company_id = %s WHERE laundry_id = %s",
                    (join_company_id, next_id)
                )

                # Fetch company info for the response
                cur.execute(
                    "SELECT company_name, join_code FROM shop.companies WHERE company_id = %s",
                    (join_company_id,)
                )
                existing_company = cur.fetchone()
                if existing_company:
                    company_info = {
                        "companyId": join_company_id,
                        "companyName": existing_company["company_name"],
                        "joinCode": existing_company["join_code"],
                    }

        logger.info(f"New laundry onboarded: {laundry_name} (ID: {next_id})")

        # 6. Send signed agreement email to platform owner
        agreement = body.get("agreement", {})
        logger.info(f"Agreement data received: signed={agreement.get('signed')}, name={agreement.get('signatureName')}")
        if agreement.get("signed") or agreement.get("signatureName"):
            try:
                from app.services.notification_service import send_email
                agreement_html = f"""
                <h2>New Tenant Agreement Signed</h2>
                <hr/>
                <h3>Tenant Information</h3>
                <table style="border-collapse:collapse;width:100%;max-width:600px;">
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Laundry Name</td><td style="padding:6px;border:1px solid #ddd;">{laundry_name}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Laundry ID</td><td style="padding:6px;border:1px solid #ddd;">{next_id}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Owner</td><td style="padding:6px;border:1px solid #ddd;">{owner_first_name} {owner_last_name}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Phone</td><td style="padding:6px;border:1px solid #ddd;">{owner_phone}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Email</td><td style="padding:6px;border:1px solid #ddd;">{owner_email}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Address</td><td style="padding:6px;border:1px solid #ddd;">{street}, {city}, {state} {zip_code}</td></tr>
                </table>

                <h3 style="margin-top:20px;">Agreement Terms</h3>
                <p style="background:#f7f7f7;padding:12px;border-radius:6px;font-size:14px;">
                    {agreement.get('terms', 'Platform fee of $149/month when monthly revenue exceeds $2,999. Invoice sent end of month, due within 30 days.')}
                </p>

                <h3 style="margin-top:20px;">Electronic Signature</h3>
                <table style="border-collapse:collapse;width:100%;max-width:600px;">
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Signed By</td><td style="padding:6px;border:1px solid #ddd;font-style:italic;font-size:18px;">{agreement.get('signatureName', 'N/A')}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Date</td><td style="padding:6px;border:1px solid #ddd;">{agreement.get('signatureDate', 'N/A')}</td></tr>
                    <tr><td style="padding:6px;font-weight:bold;border:1px solid #ddd;">Agreement Status</td><td style="padding:6px;border:1px solid #ddd;color:green;font-weight:bold;">SIGNED</td></tr>
                </table>

                <hr style="margin-top:20px;"/>
                <p style="font-size:12px;color:#666;">This agreement was electronically signed during self-service onboarding.</p>
                """
                result_email = send_email("roundrocklaundry@gmail.com", f"New Tenant Agreement: {laundry_name}", agreement_html)
                logger.info(f"Agreement email result for {laundry_name}: {result_email}")
            except Exception as email_err:
                logger.warning(f"Failed to send agreement email for {laundry_name}: {email_err}")
        else:
            logger.warning(f"Agreement not signed for {laundry_name}, skipping email")

        # Derive base URL from request so it works in dev (localhost) and prod
        base_origin = str(request.base_url).rstrip("/")

        # Send welcome email to the new tenant owner
        if owner_email:
            try:
                from app.services.notification_service import send_email
                admin_url = f"{base_origin}/{next_id}/admin"
                customer_url = f"{base_origin}/{next_id}/site"
                schedule_pickup_url = f"{base_origin}/{next_id}"
                booking_url = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0VrdVjQuZ3xf_TFkqNK-C4oHkD0hgROG7ARrpInHo8ZB4q5X2lM5KTAfel88aCzzzpWbxtu1lR"
                welcome_html = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2B6CB0;">🎉 Welcome to Smart Laundry Basket!</h2>
                    <p>Hi {owner_first_name},</p>
                    <p>Congratulations! Your laundry <strong>{laundry_name}</strong> is now set up on our platform. Here's everything you need to get started:</p>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">🔑 Your Login Credentials</h3>
                    <table style="border-collapse: collapse; width: 100%; margin: 12px 0;">
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Employee ID</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0; font-size: 18px; font-family: monospace;">{owner_emp_id}</td></tr>
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Passcode</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0; font-size: 18px; font-weight: bold; color: #2B6CB0;">{owner_passcode}</td></tr>
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Device Registration Code</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0; font-size: 18px; color: #DD6B20;">{reg_code}</td></tr>
                    </table>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">🔗 Your Links</h3>
                    <table style="border-collapse: collapse; width: 100%; margin: 12px 0;">
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Admin Dashboard</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0;"><a href="{admin_url}" style="color: #2B6CB0;">{admin_url}</a></td></tr>
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Customer Portal</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0;"><a href="{customer_url}" style="color: #2B6CB0;">{customer_url}</a></td></tr>
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Schedule Pickup Page</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0;"><a href="{schedule_pickup_url}" style="color: #2B6CB0;">{schedule_pickup_url}</a></td></tr>
                    </table>

                    <h3 style="color: #E53E3E; border-bottom: 1px solid #FED7D7; padding-bottom: 8px;">🚨 Required: Connect Your Website</h3>
                    <div style="padding: 16px; background: #FFF5F5; border-radius: 8px; border: 1px solid #FED7D7; margin: 12px 0;">
                        <p style="margin: 0 0 12px 0; font-weight: bold;">To start receiving online orders from your customers, you need to do ONE of the following:</p>
                        <table style="border-collapse: collapse; width: 100%; margin: 8px 0;">
                            <tr>
                                <td style="padding: 12px 16px; background: #EBF8FF; border: 1px solid #BEE3F8; border-radius: 4px; vertical-align: top;">
                                    <strong>Option A: Point Your Domain</strong><br/>
                                    <span style="font-size: 13px; color: #4A5568;">Point your website's DNS (e.g. yourbusiness.com) to our platform to get a fully branded customer portal with scheduling, payments, and order tracking.<br/>
                                    Your landing page: <a href="{customer_url}" style="color: #2B6CB0; word-break: break-all;">{customer_url}</a></span>
                                </td>
                            </tr>
                            <tr><td style="padding: 6px; text-align: center; font-size: 12px; color: #999;">— OR —</td></tr>
                            <tr>
                                <td style="padding: 12px 16px; background: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 4px; vertical-align: top;">
                                    <strong>Option B: Add a Schedule Pickup Link</strong><br/>
                                    <span style="font-size: 13px; color: #4A5568;">Add a "Schedule Pickup" button on your existing website that links to:<br/>
                                    <a href="{schedule_pickup_url}" style="color: #2B6CB0; word-break: break-all;">{schedule_pickup_url}</a></span>
                                </td>
                            </tr>
                        </table>
                        <p style="margin: 12px 0 0 0; font-size: 13px; color: #4A5568;">Either option lets your customers schedule pickups, make payments, and track orders online.</p>
                    </div>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">✅ Complete Your Setup</h3>
                    <p>To start receiving orders, complete these steps in your Admin Dashboard:</p>
                    <ol style="line-height: 2;">
                        <li><strong>Connect Stripe</strong> — Accept online card payments</li>
                        <li><strong>Set Delivery Schedule</strong> — Configure your pickup/dropoff time slots</li>
                        <li><strong>Add Services & Pricing</strong> — Set up your service menu with prices</li>
                        <li><strong>Set Serviceable Area</strong> — Add zip codes you serve</li>
                        <li><strong>Connect Your Website</strong> — Point your domain or add a Schedule Pickup link (see above)</li>
                        <li><strong>Add Team Members</strong> — Create employee accounts for your staff</li>
                    </ol>

                    <div style="margin: 24px 0; padding: 20px; background: #EBF8FF; border-radius: 12px; border: 2px solid #2B6CB0; text-align: center;">
                        <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #2B6CB0;">📞 Need Help Getting Set Up?</p>
                        <p style="margin: 0 0 16px 0; font-size: 14px; color: #4A5568;">Book a free 15-minute setup call. We'll help you connect your domain, configure services, and get ready to take your first order.</p>
                        <a href="{booking_url}" style="display: inline-block; padding: 12px 32px; background: #2B6CB0; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">Schedule a Setup Call</a>
                    </div>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">📱 How to Login to Admin</h3>
                    <ol style="line-height: 2;">
                        <li>Go to <a href="{admin_url}" style="color: #2B6CB0;">{admin_url}</a></li>
                        <li>Enter your Employee ID and Passcode</li>
                        <li>When prompted, enter the Device Registration Code shown above</li>
                    </ol>

                    <div style="margin-top: 24px; padding: 16px; background: #F7FAFC; border-radius: 8px; border: 1px solid #E2E8F0;">
                        <p style="margin: 0; font-size: 14px;"><strong>Need help?</strong> Reply to this email, use the support chat in your admin dashboard, or <a href="{booking_url}" style="color: #2B6CB0;">schedule a call</a>.</p>
                    </div>

                    <p style="margin-top: 24px; font-size: 12px; color: #999;">Please keep your credentials secure. You can find them again in your admin settings or contact support.</p>
                </div>
                """
                send_email(owner_email, f"Welcome to Smart Laundry Basket - {laundry_name} Setup Guide", welcome_html)
                logger.info(f"Welcome email sent to {owner_email} for {laundry_name}")
            except Exception as welcome_err:
                logger.warning(f"Failed to send welcome email for {laundry_name}: {welcome_err}")

        # Send referral notification email to the referrer
        if referred_by_email:
            try:
                from app.services.notification_service import send_email
                referral_html = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #2B6CB0; margin: 0;">🎉 Great news!</h2>
                        <p style="color: #718096; margin-top: 8px;">Someone you referred just signed up</p>
                    </div>

                    <div style="background: #F0FFF4; border: 1px solid #C6F6D5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; font-size: 16px;">Hi {referred_by_name or 'there'},</p>
                        <p style="margin: 0; font-size: 15px;">
                            <strong>{laundry_name}</strong> just joined Smart Laundry Basket and listed you as their referrer!
                        </p>
                    </div>

                    <div style="background: #EBF8FF; border: 1px solid #BEE3F8; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="color: #2B6CB0; margin: 0 0 8px 0;">💰 Your 10% Reward</h3>
                        <p style="margin: 0; font-size: 14px; color: #4A5568;">
                            Once <strong>{laundry_name}</strong> starts paying their monthly subscription, you'll earn
                            <strong>10% of their monthly subscription fee</strong> — every month, for as long as they remain an active subscriber.
                        </p>
                        <p style="margin: 12px 0 0 0; font-size: 14px; color: #4A5568;">
                            We'll notify you when your first payout is ready.
                        </p>
                    </div>

                    <div style="background: #FFFAF0; border: 1px solid #FEEBC8; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="color: #DD6B20; margin: 0 0 8px 0;">🚀 Keep referring, keep earning</h3>
                        <p style="margin: 0; font-size: 14px; color: #4A5568;">
                            There's no limit to how many laundries you can refer. Each one earns you 10% of their subscription — every single month.
                            Know another laundry owner who could use a smarter platform? Send them to
                            <a href="https://smartlaundrybasket.ai/onboard" style="color: #2B6CB0; font-weight: bold;">smartlaundrybasket.ai/onboard</a>
                            and make sure they enter your name and email in the referral section.
                        </p>
                    </div>

                    <p style="font-size: 13px; color: #A0AEC0; text-align: center; margin-top: 24px;">
                        Thank you for spreading the word about Smart Laundry Basket!
                    </p>
                </div>
                """
                send_email(referred_by_email, f"You earned a referral! {laundry_name} just signed up", referral_html)
                logger.info(f"Referral notification email sent to {referred_by_email} for {laundry_name}")
            except Exception as ref_err:
                logger.warning(f"Failed to send referral email to {referred_by_email}: {ref_err}")

        response = {
            "status": "success",
            "laundry": {
                "laundryId": next_id,
                "laundryName": laundry_name,
                "deviceRegistrationCode": reg_code,
                "adminUrl": f"{base_origin}/{next_id}/admin",
                "customerUrl": f"{base_origin}/{next_id}/site",
            },
            "owner": {
                "employeeId": owner_emp_id,
                "passcode": owner_passcode,
                "name": f"{owner_first_name} {owner_last_name}".strip(),
            },
        }

        if company_info:
            response["company"] = company_info

        return response

    except Exception as e:
        logger.exception("Onboarding failed")
        return {"status": "error", "message": f"Onboarding failed: {str(e)}"}


@router.get("/laundries/{laundry_id}/owner-credentials")
async def get_owner_credentials(laundry_id: str, x_platform_key: str = Header(None)):
    """Retrieve owner/admin credentials for a laundry. Platform admin only."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, first_name, last_name, role, passcode, email, phone
            FROM shop.employees
            WHERE laundry_id = %s AND role IN ('Admin', 'Manager') AND is_active = TRUE
            ORDER BY role = 'Admin' DESC, created_at ASC
        """, (laundry_id,))
        employees = [{
            "empId": r["emp_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "role": r["role"],
            "passcode": r["passcode"],
            "email": r["email"],
            "phone": r["phone"],
        } for r in cur.fetchall()]

        cur.execute("SELECT device_registration_code FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        reg_code = shop["device_registration_code"] if shop else ""

    return {
        "status": "success",
        "employees": employees,
        "deviceRegistrationCode": reg_code,
    }


@router.post("/laundries/{laundry_id}/send-owner-credentials")
async def send_owner_credentials(laundry_id: str, body: dict = Body({}), x_platform_key: str = Header(None)):
    """Send owner credentials via email. Platform admin only."""
    verify_platform_admin(x_platform_key)

    emp_id = body.get("empId")  # Optional: send to specific employee. If omitted, sends to first Admin.

    with get_db() as conn:
        cur = get_cursor(conn)
        if emp_id:
            cur.execute("""
                SELECT emp_id, first_name, last_name, role, passcode, email
                FROM shop.employees
                WHERE emp_id = %s AND laundry_id = %s AND is_active = TRUE
            """, (emp_id, laundry_id))
        else:
            cur.execute("""
                SELECT emp_id, first_name, last_name, role, passcode, email
                FROM shop.employees
                WHERE laundry_id = %s AND role = 'Admin' AND is_active = TRUE
                ORDER BY created_at ASC LIMIT 1
            """, (laundry_id,))
        emp = cur.fetchone()

        if not emp:
            return {"status": "error", "message": "No admin employee found for this laundry"}
        if not emp["email"]:
            return {"status": "error", "message": f"Employee {emp['emp_id']} has no email address on file"}

        cur.execute("SELECT laundry_name, device_registration_code FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        shop = cur.fetchone()
        laundry_name = shop["laundry_name"] if shop else "Smart Laundry"
        reg_code = shop["device_registration_code"] if shop else ""

    # Send email
    try:
        from app.services.notification_service import send_email
        html_body = f"""
        <h2>Your Admin Credentials</h2>
        <p>Hi {emp['first_name']},</p>
        <p>Here are your login credentials for <strong>{laundry_name}</strong>:</p>
        <table style="border-collapse:collapse; margin: 16px 0;">
            <tr><td style="padding:10px 16px;font-weight:bold;background:#f7f7f7;border:1px solid #ddd;">Employee ID</td><td style="padding:10px 16px;border:1px solid #ddd;font-size:18px;">{emp['emp_id']}</td></tr>
            <tr><td style="padding:10px 16px;font-weight:bold;background:#f7f7f7;border:1px solid #ddd;">Passcode</td><td style="padding:10px 16px;border:1px solid #ddd;font-size:18px;font-weight:bold;color:#2B6CB0;">{emp['passcode']}</td></tr>
            <tr><td style="padding:10px 16px;font-weight:bold;background:#f7f7f7;border:1px solid #ddd;">Role</td><td style="padding:10px 16px;border:1px solid #ddd;">{emp['role']}</td></tr>
            <tr><td style="padding:10px 16px;font-weight:bold;background:#f7f7f7;border:1px solid #ddd;">Device Reg Code</td><td style="padding:10px 16px;border:1px solid #ddd;font-size:18px;color:#DD6B20;">{reg_code}</td></tr>
        </table>
        <p><strong>How to log in:</strong></p>
        <ol>
            <li>Go to your admin page</li>
            <li>Enter your Employee ID and Passcode</li>
            <li>If prompted for device registration, enter the Device Reg Code above</li>
        </ol>
        <p style="color:#666;font-size:12px;margin-top:20px;">Please keep these credentials secure and do not share them.</p>
        """
        send_email(emp["email"], f"Your Login Credentials - {laundry_name}", html_body)
        return {"status": "success", "message": f"Credentials sent to {emp['email']}"}
    except Exception as e:
        logger.exception("Failed to send credentials email")
        return {"status": "error", "message": f"Failed to send email: {str(e)}"}


@router.get("/audit-log")
async def get_audit_log(
    laundryId: str = Query(None),
    limit: int = Query(50),
    x_platform_key: str = Header(None),
):
    """Get audit log entries. Platform admin only."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        if laundryId:
            cur.execute("""
                SELECT * FROM shop.audit_log WHERE laundry_id = %s ORDER BY created_at DESC LIMIT %s
            """, (laundryId, limit))
        else:
            cur.execute("SELECT * FROM shop.audit_log ORDER BY created_at DESC LIMIT %s", (limit,))
        logs = [{
            "id": r["id"],
            "laundryId": r["laundry_id"],
            "action": r["action"],
            "entityType": r["entity_type"],
            "entityId": r["entity_id"],
            "changes": r["changes"],
            "performedBy": r["performed_by"],
            "createdAt": str(r["created_at"]),
        } for r in cur.fetchall()]

    return {"status": "success", "logs": logs}


# ── Company CRUD Endpoints ─────────────────────────────────────────────────────


@router.post("/companies")
async def create_company(body: dict = Body(...), x_platform_key: str = Header(None)):
    """Create a new company entity."""
    verify_platform_admin(x_platform_key)

    company_name = body.get("company_name", "").strip()
    contact_email = body.get("contact_email", "").strip() or None
    contact_phone = body.get("contact_phone", "").strip() or None

    if not company_name:
        return {"status": "error", "message": "Company name is required"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO shop.companies (company_name, contact_email, contact_phone)
            VALUES (%s, %s, %s)
            RETURNING company_id, company_name, contact_email, contact_phone, created_at, updated_at
        """, (company_name, contact_email, contact_phone))
        row = cur.fetchone()
        company_id = str(row["company_id"])

        # Generate and store join code with retry for uniqueness
        join_code = generate_join_code_with_retry(company_name, conn, company_id)

    return {
        "status": "success",
        "company": {
            "companyId": company_id,
            "companyName": row["company_name"],
            "contactEmail": row["contact_email"],
            "contactPhone": row["contact_phone"],
            "joinCode": join_code,
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
        },
    }


@router.get("/companies")
async def list_companies(x_platform_key: str = Header(None)):
    """List all companies."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT company_id, company_name, contact_email, contact_phone, join_code, created_at, updated_at
            FROM shop.companies
            ORDER BY created_at DESC
        """)
        companies = []
        for row in cur.fetchall():
            # Count assigned laundries
            cur.execute(
                "SELECT COUNT(*) as cnt FROM shop.laundry_shops WHERE company_id = %s",
                (row["company_id"],),
            )
            location_count = cur.fetchone()["cnt"]

            companies.append({
                "companyId": str(row["company_id"]),
                "companyName": row["company_name"],
                "contactEmail": row["contact_email"],
                "contactPhone": row["contact_phone"],
                "joinCode": row["join_code"],
                "locationCount": location_count,
                "createdAt": str(row["created_at"]),
                "updatedAt": str(row["updated_at"]),
            })

    return {"status": "success", "companies": companies}


@router.get("/companies/{company_id}")
async def get_company(company_id: str, x_platform_key: str = Header(None)):
    """Get a single company by ID."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT company_id, company_name, contact_email, contact_phone, join_code, created_at, updated_at
            FROM shop.companies
            WHERE company_id = %s
        """, (company_id,))
        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Company not found")

        # Get assigned laundries
        cur.execute("""
            SELECT laundry_id, laundry_name
            FROM shop.laundry_shops
            WHERE company_id = %s
            ORDER BY laundry_name
        """, (company_id,))
        locations = [{
            "laundryId": r["laundry_id"],
            "laundryName": r["laundry_name"],
        } for r in cur.fetchall()]

    return {
        "status": "success",
        "company": {
            "companyId": str(row["company_id"]),
            "companyName": row["company_name"],
            "contactEmail": row["contact_email"],
            "contactPhone": row["contact_phone"],
            "joinCode": row["join_code"],
            "locations": locations,
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
        },
    }


@router.put("/companies/{company_id}")
async def update_company(company_id: str, body: dict = Body(...), x_platform_key: str = Header(None)):
    """Update a company's details."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        updates = {}
        if "company_name" in body:
            name = body["company_name"].strip()
            if not name:
                return {"status": "error", "message": "Company name cannot be empty"}
            updates["company_name"] = name
        if "contact_email" in body:
            updates["contact_email"] = body["contact_email"].strip() or None
        if "contact_phone" in body:
            updates["contact_phone"] = body["contact_phone"].strip() or None

        if not updates:
            return {"status": "error", "message": "No fields to update"}

        updates["updated_at"] = "NOW()"

        # Build SET clause — handle NOW() specially
        set_parts = []
        values = []
        for k, v in updates.items():
            if v == "NOW()":
                set_parts.append(f"{k} = NOW()")
            else:
                set_parts.append(f"{k} = %s")
                values.append(v)
        set_clause = ", ".join(set_parts)
        values.append(company_id)

        cur.execute(
            f"UPDATE shop.companies SET {set_clause} WHERE company_id = %s RETURNING company_id, company_name, contact_email, contact_phone, created_at, updated_at",
            values,
        )
        row = cur.fetchone()

    return {
        "status": "success",
        "company": {
            "companyId": str(row["company_id"]),
            "companyName": row["company_name"],
            "contactEmail": row["contact_email"],
            "contactPhone": row["contact_phone"],
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
        },
    }


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, x_platform_key: str = Header(None)):
    """
    Delete a company.
    CASCADE on company_admins will remove all admins.
    SET NULL on laundry_shops.company_id will unlink laundries (preserving laundry data).
    """
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_name FROM shop.companies WHERE company_id = %s", (company_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Company not found")

        company_name = row["company_name"]

        # Delete the company — FK constraints handle the rest:
        # - company_admins: ON DELETE CASCADE (admins are deleted)
        # - laundry_shops.company_id: ON DELETE SET NULL (laundries are unlinked)
        cur.execute("DELETE FROM shop.companies WHERE company_id = %s", (company_id,))

    logger.info(f"Deleted company: {company_name} (ID: {company_id})")
    return {"status": "success", "message": f"Company '{company_name}' deleted successfully."}


@router.post("/companies/{company_id}/regenerate-code")
async def regenerate_company_code(company_id: str, x_platform_key: str = Header(None)):
    """Generate a new join code for a company."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists and get name for code generation
        cur.execute("SELECT company_name FROM shop.companies WHERE company_id = %s", (company_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Company not found")

        company_name = row["company_name"]

        # Generate new join code with retry for uniqueness
        new_code = generate_join_code_with_retry(company_name, conn, company_id)

    return {"status": "success", "joinCode": new_code}


# ── Company Admin CRUD Endpoints ───────────────────────────────────────────────


@router.post("/companies/{company_id}/admins")
async def create_company_admin(company_id: str, body: dict = Body(...), x_platform_key: str = Header(None)):
    """Create a new admin for a company."""
    verify_platform_admin(x_platform_key)

    email = (body.get("email") or "").strip().lower()
    password = body.get("password", "")
    first_name = (body.get("first_name") or "").strip() or None
    last_name = (body.get("last_name") or "").strip() or None

    if not email:
        return {"status": "error", "message": "Email is required"}
    if not password:
        return {"status": "error", "message": "Password is required"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        # Check email uniqueness
        cur.execute("SELECT admin_id FROM shop.company_admins WHERE email = %s", (email,))
        if cur.fetchone():
            return {"status": "error", "message": "Email already in use"}

        password_hash = hash_password(password)

        cur.execute("""
            INSERT INTO shop.company_admins (company_id, email, password_hash, first_name, last_name)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING admin_id, company_id, email, first_name, last_name, is_active, created_at, updated_at
        """, (company_id, email, password_hash, first_name, last_name))
        row = cur.fetchone()

    return {
        "status": "success",
        "admin": {
            "adminId": str(row["admin_id"]),
            "companyId": str(row["company_id"]),
            "email": row["email"],
            "firstName": row["first_name"],
            "lastName": row["last_name"],
            "isActive": row["is_active"],
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
        },
    }


@router.get("/companies/{company_id}/admins")
async def list_company_admins(company_id: str, x_platform_key: str = Header(None)):
    """List all active admins for a company."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        cur.execute("""
            SELECT admin_id, company_id, email, first_name, last_name, is_active, created_at, updated_at
            FROM shop.company_admins
            WHERE company_id = %s AND is_active = TRUE
            ORDER BY created_at ASC
        """, (company_id,))
        admins = [{
            "adminId": str(r["admin_id"]),
            "companyId": str(r["company_id"]),
            "email": r["email"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "isActive": r["is_active"],
            "createdAt": str(r["created_at"]),
            "updatedAt": str(r["updated_at"]),
        } for r in cur.fetchall()]

    return {"status": "success", "admins": admins}


@router.delete("/companies/{company_id}/admins/{admin_id}")
async def deactivate_company_admin(company_id: str, admin_id: str, x_platform_key: str = Header(None)):
    """Deactivate a company admin (soft delete — sets is_active=FALSE)."""
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        # Verify admin exists and belongs to this company
        cur.execute(
            "SELECT admin_id FROM shop.company_admins WHERE admin_id = %s AND company_id = %s",
            (admin_id, company_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Admin not found")

        cur.execute(
            "UPDATE shop.company_admins SET is_active = FALSE, updated_at = NOW() WHERE admin_id = %s",
            (admin_id,),
        )

    return {"status": "success", "message": "Admin deactivated successfully."}


@router.post("/companies/{company_id}/send-admin-credentials")
async def send_company_admin_credentials(company_id: str, body: dict = Body({}), x_platform_key: str = Header(None)):
    """Send company admin login credentials via email. Platform admin only."""
    verify_platform_admin(x_platform_key)

    admin_id = body.get("adminId")  # Optional: send to specific admin. If omitted, sends to first active admin.

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_name FROM shop.companies WHERE company_id = %s", (company_id,))
        company = cur.fetchone()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        # Get admin
        if admin_id:
            cur.execute("""
                SELECT admin_id, email, first_name, last_name
                FROM shop.company_admins
                WHERE admin_id = %s AND company_id = %s AND is_active = TRUE
            """, (admin_id, company_id))
        else:
            cur.execute("""
                SELECT admin_id, email, first_name, last_name
                FROM shop.company_admins
                WHERE company_id = %s AND is_active = TRUE
                ORDER BY created_at ASC LIMIT 1
            """, (company_id,))
        admin = cur.fetchone()

        if not admin:
            return {"status": "error", "message": "No active company admin found. Create one first."}

    company_name = company["company_name"]
    admin_email = admin["email"]
    first_name = admin["first_name"] or "Admin"
    login_url = "https://smartlaundrybasket.ai/company/login"

    try:
        from app.services.notification_service import send_email
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #553C9A; margin: 0;">Smart Laundry Basket</h2>
                <p style="color: #718096; margin-top: 4px;">Company Admin Portal</p>
            </div>
            <p>Hi {first_name},</p>
            <p>Here are your login credentials for the <strong>{company_name}</strong> company admin dashboard:</p>
            <table style="border-collapse:collapse; margin: 16px 0; width: 100%;">
                <tr><td style="padding:12px 16px;font-weight:bold;background:#F7FAFC;border:1px solid #E2E8F0;">Email</td><td style="padding:12px 16px;border:1px solid #E2E8F0;">{admin_email}</td></tr>
                <tr><td style="padding:12px 16px;font-weight:bold;background:#F7FAFC;border:1px solid #E2E8F0;">Password</td><td style="padding:12px 16px;border:1px solid #E2E8F0;color:#E53E3E;">Use the password you were given at setup</td></tr>
                <tr><td style="padding:12px 16px;font-weight:bold;background:#F7FAFC;border:1px solid #E2E8F0;">Login URL</td><td style="padding:12px 16px;border:1px solid #E2E8F0;"><a href="{login_url}" style="color:#3182CE;">{login_url}</a></td></tr>
            </table>
            <p><strong>What you can do:</strong></p>
            <ul>
                <li>View rollup dashboard across all your locations</li>
                <li>Access aggregated reports and revenue data</li>
                <li>Compare performance across locations</li>
                <li>Navigate into any individual location's admin panel</li>
            </ul>
            <p style="color:#718096;font-size:12px;margin-top:24px;">Please keep these credentials secure. If you need to reset your password, contact the platform administrator.</p>
        </div>
        """
        send_email(admin_email, f"Your Company Admin Login - {company_name}", html_body)
        return {"status": "success", "message": f"Credentials sent to {admin_email}"}
    except Exception as e:
        logger.exception("Failed to send company admin credentials email")
        return {"status": "error", "message": f"Failed to send email: {str(e)}"}


# ── Location Assignment Endpoints ──────────────────────────────────────────────


@router.put("/companies/{company_id}/locations")
async def assign_location_to_company(company_id: str, body: dict = Body(...), x_platform_key: str = Header(None)):
    """
    Assign a laundry to a company.
    Sets company_id on the laundry record without modifying any other laundry data.
    Returns 409 if the laundry already belongs to another company.
    """
    verify_platform_admin(x_platform_key)

    laundry_id = body.get("laundryId", "").strip()
    if not laundry_id:
        raise HTTPException(status_code=400, detail="laundryId is required")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        # Verify laundry exists and check current assignment
        cur.execute(
            "SELECT laundry_id, company_id FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        laundry = cur.fetchone()
        if not laundry:
            raise HTTPException(status_code=404, detail="Laundry not found")

        current_company_id = laundry["company_id"]

        # If already assigned to this company, no-op — return success
        if current_company_id is not None and str(current_company_id) == company_id:
            return {"status": "success", "message": "Laundry already assigned to this company"}

        # If assigned to a different company, return 409 conflict
        if current_company_id is not None and str(current_company_id) != company_id:
            raise HTTPException(
                status_code=409,
                detail="Laundry already belongs to another company",
            )

        # Assign the laundry to this company (only update company_id — Req 7.4)
        cur.execute(
            "UPDATE shop.laundry_shops SET company_id = %s WHERE laundry_id = %s",
            (company_id, laundry_id),
        )

    return {"status": "success", "message": "Laundry assigned to company"}


@router.delete("/companies/{company_id}/locations/{laundry_id}")
async def remove_location_from_company(company_id: str, laundry_id: str, x_platform_key: str = Header(None)):
    """
    Remove a laundry from a company (sets company_id = NULL).
    Does not delete or modify any other laundry data.
    """
    verify_platform_admin(x_platform_key)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify company exists
        cur.execute("SELECT company_id FROM shop.companies WHERE company_id = %s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Company not found")

        # Verify laundry exists and belongs to this company
        cur.execute(
            "SELECT laundry_id, company_id FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        laundry = cur.fetchone()
        if not laundry:
            raise HTTPException(status_code=404, detail="Laundry not found")

        if laundry["company_id"] is None or str(laundry["company_id"]) != company_id:
            raise HTTPException(status_code=404, detail="Laundry does not belong to this company")

        # Remove from company (only update company_id — preserves all other data)
        cur.execute(
            "UPDATE shop.laundry_shops SET company_id = NULL WHERE laundry_id = %s",
            (laundry_id,),
        )

    return {"status": "success", "message": "Laundry removed from company"}


# ── Tenant API Key Management ─────────────────────────────────────────────────

@router.put("/tenant-keys")
async def set_tenant_keys(body: dict = Body(...), x_platform_key: str = Header(None)):
    """
    Platform admin sets API keys for a tenant (marked as platform-managed).
    These keys cannot be modified by the tenant themselves.
    """
    verify_platform_admin(x_platform_key)

    from app.services.key_resolver import upsert_tenant_key, VALID_KEYS

    laundry_id = body.get("laundryId")
    keys = body.get("keys", [])

    if not laundry_id:
        raise HTTPException(status_code=400, detail="laundryId is required")
    if not keys:
        raise HTTPException(status_code=400, detail="keys array is required")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify laundry exists
        cur.execute("SELECT laundry_id FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail=f"Laundry {laundry_id} not found")

        for key_entry in keys:
            provider = key_entry.get("provider")
            key_name = key_entry.get("key_name")
            value = key_entry.get("value", "")

            if not provider or not key_name:
                raise HTTPException(status_code=400, detail="Each key must have provider and key_name")
            if (provider, key_name) not in VALID_KEYS:
                raise HTTPException(status_code=400, detail=f"Invalid provider/key_name: {provider}/{key_name}")
            if len(value) > 10 * 1024:
                raise HTTPException(status_code=400, detail="Key value too large (max 10KB)")

            upsert_tenant_key(conn, laundry_id, provider, key_name, value, is_platform_managed=True)
            logger.info(f"[platform-admin] Set tenant key: tenant={laundry_id}, provider={provider}, key_name={key_name}, managed=True")

    return {"status": "success", "message": f"Set {len(keys)} key(s) for laundry {laundry_id}"}


@router.delete("/tenant-keys")
async def delete_tenant_keys(body: dict = Body(...), x_platform_key: str = Header(None)):
    """
    Platform admin removes a tenant key or clears the platform-managed flag.
    """
    verify_platform_admin(x_platform_key)

    laundry_id = body.get("laundryId")
    provider = body.get("provider")
    key_name = body.get("key_name")
    action = body.get("action", "delete")  # "delete" or "release" (clears managed flag)

    if not laundry_id or not provider or not key_name:
        raise HTTPException(status_code=400, detail="laundryId, provider, and key_name are required")

    with get_db() as conn:
        cur = get_cursor(conn)

        if action == "release":
            # Remove platform-managed flag so tenant can manage it themselves
            cur.execute("""
                UPDATE tenant_api_keys
                SET is_platform_managed = FALSE
                WHERE laundry_id = %s AND provider = %s AND key_name = %s
            """, (laundry_id, provider, key_name))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Key not found")
            logger.info(f"[platform-admin] Released managed flag: tenant={laundry_id}, provider={provider}, key_name={key_name}")
            return {"status": "success", "message": "Platform-managed flag removed"}
        else:
            # Delete the key entirely
            cur.execute("""
                DELETE FROM tenant_api_keys
                WHERE laundry_id = %s AND provider = %s AND key_name = %s
            """, (laundry_id, provider, key_name))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Key not found")
            logger.info(f"[platform-admin] Deleted tenant key: tenant={laundry_id}, provider={provider}, key_name={key_name}")
            return {"status": "success", "message": "Key deleted"}
