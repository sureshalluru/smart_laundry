"""
Platform Admin routes — super-admin for onboarding laundries.
Protected by platform admin secret key.
"""
from fastapi import APIRouter, Body, Header, HTTPException, Query
from app.database import get_db, get_cursor
import logging
import uuid
import random
import string

logger = logging.getLogger(__name__)
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


@router.post("/laundries")
async def create_laundry(body: dict = Body(...), x_platform_key: str = Header(None)):
    """Create a new laundry + owner employee."""
    verify_platform_admin(x_platform_key)

    laundry_name = body.get("laundryName")
    timezone = body.get("timezone", "America/Chicago")
    street = body.get("street", "")
    city = body.get("city", "")
    state = body.get("state", "")
    zip_code = body.get("zipCode", "")
    country = body.get("country", "USA")
    bag_price = float(body.get("bagPrice", 30))

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
            "adminUrl": f"https://smartlaundrybasket.ai/{next_id}/admin",
            "customerUrl": f"https://smartlaundrybasket.ai/{next_id}/site",
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


@router.post("/onboard")
async def self_service_onboard(body: dict = Body(...)):
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

    if not laundry_name:
        return {"status": "error", "message": "Laundry name is required"}
    if not owner_phone:
        return {"status": "error", "message": "Owner phone number is required"}

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
                    serviceable_zip_codes, user_domain, site_content
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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

            # 3. Create services
            for svc in services:
                svc_name = svc.get("serviceName", "").strip()
                if not svc_name:
                    continue
                price = float(svc.get("price", 0))
                input_weight = svc.get("inputWeight", True)
                customer_access = svc.get("customerAccess", True)
                cur.execute("""
                    INSERT INTO shop.laundry_services (laundry_id, service_name, price, input_weight, customer_access, is_active)
                    VALUES (%s, %s, %s, %s, %s, TRUE)
                """, (next_id, svc_name, price, input_weight, customer_access))

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

        # Send welcome email to the new tenant owner
        if owner_email:
            try:
                from app.services.notification_service import send_email
                admin_url = f"https://smartlaundrybasket.ai/{next_id}/admin"
                customer_url = f"https://smartlaundrybasket.ai/{next_id}/site"
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
                        <tr><td style="padding: 10px 16px; font-weight: bold; background: #F7FAFC; border: 1px solid #E2E8F0;">Customer Website</td>
                            <td style="padding: 10px 16px; border: 1px solid #E2E8F0;"><a href="{customer_url}" style="color: #2B6CB0;">{customer_url}</a></td></tr>
                    </table>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">✅ Complete Your Setup</h3>
                    <p>To start receiving orders, please complete these steps in your Admin Dashboard:</p>
                    <ol style="line-height: 2;">
                        <li><strong>Add Stripe Payment</strong> — Connect your Stripe account to accept online payments</li>
                        <li><strong>Set Delivery Schedule</strong> — Configure your pickup/dropoff time slots</li>
                        <li><strong>Add Services & Pricing</strong> — Set up your service menu with prices</li>
                        <li><strong>Set Serviceable Area</strong> — Add zip codes you serve</li>
                        <li><strong>Add Team Members</strong> — Create employee accounts for your staff</li>
                    </ol>

                    <h3 style="color: #2D3748; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">📱 How to Log In</h3>
                    <ol style="line-height: 2;">
                        <li>Go to <a href="{admin_url}" style="color: #2B6CB0;">{admin_url}</a></li>
                        <li>Enter your Employee ID and Passcode</li>
                        <li>When prompted, enter the Device Registration Code shown above</li>
                    </ol>

                    <div style="margin-top: 24px; padding: 16px; background: #EBF8FF; border-radius: 8px; border: 1px solid #BEE3F8;">
                        <p style="margin: 0; font-size: 14px;"><strong>Need help?</strong> Reply to this email or use the support chat in your admin dashboard. We're here to help you get set up!</p>
                    </div>

                    <p style="margin-top: 24px; font-size: 12px; color: #999;">Please keep your credentials secure. You can find them again in your admin settings or contact support.</p>
                </div>
                """
                send_email(owner_email, f"Welcome to Smart Laundry Basket - {laundry_name} Setup Guide", welcome_html)
                logger.info(f"Welcome email sent to {owner_email} for {laundry_name}")
            except Exception as welcome_err:
                logger.warning(f"Failed to send welcome email for {laundry_name}: {welcome_err}")

        return {
            "status": "success",
            "laundry": {
                "laundryId": next_id,
                "laundryName": laundry_name,
                "deviceRegistrationCode": reg_code,
                "adminUrl": f"https://smartlaundrybasket.ai/{next_id}/admin",
                "customerUrl": f"https://smartlaundrybasket.ai/{next_id}/site",
            },
            "owner": {
                "employeeId": owner_emp_id,
                "passcode": owner_passcode,
                "name": f"{owner_first_name} {owner_last_name}".strip(),
            },
        }

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
