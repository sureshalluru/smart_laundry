"""
Additional admin endpoints — covers remaining frontend API calls.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.utils import serialize, serialize_row
from datetime import datetime
import json
import logging
import uuid

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/order-audit-history")
async def get_order_audit_history(
    orderId: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Fetch order history timeline."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT history_id, emp_id, emp_name, action,
                   field_changed, old_value, new_value,
                   change_summary, changed_at
            FROM orders.order_history
            WHERE order_id = %s AND laundry_id = %s
            ORDER BY changed_at ASC
        """, (orderId, laundryId))
        rows = cur.fetchall()
        if not rows:
            return {"statusCode": 200, "body": {"orderId": orderId, "history": []}}
        return {"statusCode": 200, "body": {
            "orderId": orderId,
            "history": [{
                "historyId": str(r["history_id"]),
                "timestamp": r["changed_at"].isoformat() if r["changed_at"] else None,
                "empId": r["emp_id"],
                "Employee Name": r["emp_name"] or "System",
                "action": r["action"],
                "fieldChanged": r["field_changed"],
                "oldValue": r["old_value"],
                "newValue": r["new_value"],
                "modifications": [r["change_summary"]] if r["change_summary"] else [],
                "changedAt": r["changed_at"].isoformat() if r["changed_at"] else None,
            } for r in rows]
        }}


@router.put("/cancel-order-admin")
async def cancel_order_admin(
    body: dict = Body({}),
):
    """Cancel an order from the admin panel. Reverses hold and optionally cancels frequency."""
    order_id = body.get("orderId")
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")
    cancel_reason = body.get("cancelReason", "")
    is_recurring = body.get("isRecurring", "false")

    if not order_id or not laundry_id:
        return {"status": "error", "message": "Missing orderId or laundryId"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Cancel the order
        cur.execute("""
            UPDATE orders.orders
            SET order_status = 'OrderCanceled', status_category = 'Cancelled',
                cancel_reason = %s, updated_at = NOW()
            WHERE order_id = %s AND laundry_id = %s
        """, (cancel_reason, order_id, laundry_id))

        if cur.rowcount == 0:
            return {"status": "error", "message": "Order not found"}

        # If canceling all future recurring orders, deactivate the frequency
        if str(is_recurring).lower() == 'true' and customer_id:
            cur.execute("""
                UPDATE orders.laundry_frequency
                SET is_active = FALSE, updated_at = NOW()
                WHERE customer_id = %s AND laundry_id = %s AND is_active = TRUE
            """, (customer_id, laundry_id))
            if cur.rowcount:
                logger.info(f"Admin deactivated frequency for customer {customer_id}, laundry {laundry_id}")

        # Get holds to reverse
        cur.execute("""
            SELECT payment_intent_id FROM orders.order_payments
            WHERE order_id = %s AND payment_method = 'hold'
        """, (order_id,))
        holds = cur.fetchall()

    # Reverse Stripe holds
    if holds:
        try:
            import stripe
            from app.services.payment_service import get_stripe_key
            key, _ = get_stripe_key(laundry_id)
            stripe.api_key = key
            for hold in holds:
                try:
                    stripe.PaymentIntent.cancel(hold["payment_intent_id"])
                    logger.info(f"Reversed hold {hold['payment_intent_id']} for order {order_id}")
                except Exception as e:
                    logger.warning(f"Could not cancel hold {hold['payment_intent_id']}: {e}")
        except Exception as e:
            logger.warning(f"Error reversing holds for order {order_id}: {e}")

    # Cancel any Uber deliveries associated with this order
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("SELECT uber_info FROM orders.orders WHERE order_id = %s", (order_id,))
            row = cur.fetchone()
            uber_info = (row.get("uber_info") if row else None) or {}

        for leg in ("laundryPickup", "laundryDropoff"):
            leg_info = uber_info.get(leg, {})
            delivery_id = leg_info.get("deliveryId")
            if not delivery_id:
                continue
            # Only cancel if Uber hasn't already completed/canceled
            leg_status = (leg_info.get("status") or "").lower()
            if leg_status in ("delivered", "canceled", "cancelled", "returned"):
                continue
            try:
                from app.routes.uber import get_laundry_uber_credentials, get_uber_access_token
                import requests as req
                creds = get_laundry_uber_credentials(laundry_id)
                token = get_uber_access_token(creds["clientId"], creds["clientSecret"])
                url = f"{creds['baseUrl']}/customers/{creds['customerId']}/deliveries/{delivery_id}/cancel"
                headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
                resp = req.post(url, headers=headers)
                if resp.status_code in (200, 202):
                    logger.info(f"Canceled Uber delivery {delivery_id} for order {order_id} ({leg})")
                else:
                    logger.warning(f"Uber cancel returned {resp.status_code} for {delivery_id}: {resp.text[:200]}")
            except Exception as ue:
                logger.warning(f"Could not cancel Uber delivery {delivery_id} for {order_id}: {ue}")
    except Exception as uber_err:
        logger.warning(f"Error checking/canceling Uber for order {order_id}: {uber_err}")

    # Send cancellation notification to customer
    try:
        from app.routes.customer_public import _send_cancel_notification
        _send_cancel_notification(order_id, laundry_id, customer_id, cancel_reason, cancelled_by="admin")
    except Exception as notif_err:
        logger.warning(f"Cancel notification failed for {order_id}: {notif_err}")

    return {"status": "success", "message": "Order canceled successfully"}


@router.get("/show-all-employees")
async def show_all_employees(
    operation: Optional[str] = Query(None),
    laundryId: str = Query(...),
    empId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """List all employees or send credentials to an employee."""

    # Send credentials via email
    if operation == "sendEmpCredentials" and empId:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT emp_id, first_name, last_name, email, passcode, role
                FROM shop.employees WHERE emp_id = %s AND laundry_id = %s
            """, (empId, laundryId))
            emp = cur.fetchone()
            if not emp:
                return {"statusCode": 200, "body": {"message": "Employee not found"}}
            if not emp["email"]:
                return {"statusCode": 200, "body": {"message": "Employee has no email address"}}

            cur.execute("SELECT laundry_name FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
            shop = cur.fetchone()
            laundry_name = shop["laundry_name"] if shop else "Smart Laundry"

        # Send email with credentials
        try:
            from app.services.notification_service import send_email
            html_body = f"""
            <h2>Your Employee Credentials</h2>
            <p>Hi {emp['first_name']},</p>
            <p>Here are your login credentials for <strong>{laundry_name}</strong>:</p>
            <table style="border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;">Employee ID:</td><td style="padding:8px;">{emp['emp_id']}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Passcode:</td><td style="padding:8px;">{emp['passcode']}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Role:</td><td style="padding:8px;">{emp['role']}</td></tr>
            </table>
            <p>Please keep these credentials secure and do not share them.</p>
            """
            send_email(emp["email"], f"Your Credentials - {laundry_name}", html_body)
            return {"statusCode": 200, "body": {"message": f"Credentials sent to {emp['email']}"}}
        except Exception as e:
            return {"statusCode": 200, "body": {"message": f"Failed to send: {str(e)}"}}

    # Default: list employees
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, laundry_id, first_name, last_name, role, email, phone,
                   joining_date, is_active, avg_rating, total_reviews, passcode
            FROM shop.employees WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY created_at DESC
        """, (laundryId,))

        is_admin = current_user.get("role") == "Admin"

        employees = [{
            "employeeId": r["emp_id"],
            "laundryId": r["laundry_id"],
            "fullName": f"{r['first_name']} {r['last_name']}".strip(),
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "role": r["role"],
            "contact": {"email": r["email"] or "", "phone": r["phone"] or ""},
            "email": r["email"],
            "phone": r["phone"],
            "joiningDate": str(r["joining_date"]) if r["joining_date"] else None,
            "avgRating": float(r["avg_rating"]) if r["avg_rating"] is not None else 0.0,
            "totalReviews": r["total_reviews"] or 0,
            **({"passcode": r["passcode"]} if is_admin else {}),
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"employees": employees}}


@router.get("/show-all-customers")
async def show_all_customers(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all customers for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number, c.email,
                   c.notif_email, c.notif_sms, c.notif_phone,
                   cls.total_orders_placed, cls.total_order_value
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            ORDER BY c.first_name
        """, (laundryId,))
        customers = [{
            "customerId": r["customer_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "phoneNumber": r["phone_number"],
            "email": r["email"],
            "notificationPreferences": {"email": r["notif_email"], "sms": r["notif_sms"], "phone": r["notif_phone"]},
            "totalOrdersPlaced": r["total_orders_placed"],
            "totalOrderValue": float(r["total_order_value"] or 0),
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"status": "success", "customers": customers}}


@router.post("/update-products-services")
async def update_products_services(
    operation: str = Query(...),
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update laundry services or products — matches frontend payload format."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == "updateServices":
            services_to_add = body.get("servicesToAdd", [])
            services_to_update = body.get("servicesToUpdate", [])
            services_to_remove = body.get("servicesToRemove", [])

            for svc in services_to_add:
                cur.execute("""
                    INSERT INTO shop.laundry_services (laundry_id, service_name, price, description, input_weight, customer_access, is_active, category_id)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s)
                """, (laundryId, svc.get("serviceName"), float(svc.get("price", 0)),
                      svc.get("description", ""), svc.get("inputWeight", True), svc.get("customerAccess", True),
                      svc.get("categoryId") or None))

            for svc in services_to_update:
                new_name = svc.get("newServiceName") or svc.get("serviceName")
                original_name = svc.get("originalServiceName") or svc.get("serviceName")
                cur.execute("""
                    UPDATE shop.laundry_services
                    SET service_name = %s, price = %s, description = %s, input_weight = %s, customer_access = %s, category_id = %s
                    WHERE laundry_id = %s AND service_name = %s
                """, (new_name, float(svc.get("price", 0)), svc.get("description", ""),
                      svc.get("inputWeight", True), svc.get("customerAccess", True),
                      svc.get("categoryId") or None,
                      laundryId, original_name))

            for svc_name in services_to_remove:
                cur.execute("""
                    UPDATE shop.laundry_services SET is_active = FALSE
                    WHERE laundry_id = %s AND service_name = %s
                """, (laundryId, svc_name))

            # Audit log
            from app.services.audit_service import log_action
            log_action(laundryId, "update_services", "services", None, {
                "added": [s.get("serviceName") for s in services_to_add],
                "updated": [s.get("serviceName") for s in services_to_update],
                "removed": services_to_remove,
            }, performed_by=current_user.get("sub", ""))

            return {"statusCode": 200, "body": {"message": "Services updated successfully"}}

        elif operation == "updateProducts":
            products_to_add = body.get("productsToAdd", [])
            products_to_update = body.get("productsToUpdate", [])
            products_to_remove = body.get("productsToRemove", [])

            for prod in products_to_add:
                cur.execute("""
                    INSERT INTO shop.laundry_products (laundry_id, product_name, price, description, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                """, (laundryId, prod.get("productName"), float(prod.get("price", 0)), prod.get("description", "")))

            for prod in products_to_update:
                cur.execute("""
                    UPDATE shop.laundry_products
                    SET price = %s, description = %s
                    WHERE laundry_id = %s AND product_name = %s
                """, (float(prod.get("price", 0)), prod.get("description", ""),
                      laundryId, prod.get("productName")))

            for prod_name in products_to_remove:
                cur.execute("""
                    UPDATE shop.laundry_products SET is_active = FALSE
                    WHERE laundry_id = %s AND product_name = %s
                """, (laundryId, prod_name))

            return {"statusCode": 200, "body": {"message": "Products updated successfully"}}

        elif operation == "updatePromotions":
            promos_to_add = body.get("promotionsToAdd", [])
            promos_to_update = body.get("promotionsToUpdate", [])
            promos_to_delete = body.get("promotionsToDelete", []) or body.get("promotionsToRemove", [])

            for promo in promos_to_add:
                promo_code = promo.get("promoCode", "")
                # Skip empty or generate code if TEMP
                if not promo_code or promo_code.startswith("TEMP-"):
                    import random, string
                    promo_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

                cur.execute("""
                    INSERT INTO shop.promotions (
                        laundry_id, promo_code, promo_name, description, discount_type, discount_value,
                        minimum_order_value, apply_on_whole_order, is_active,
                        linked_frequency, is_online_frequency_promo, start_date, end_date, created_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                """, (
                    laundryId,
                    promo_code,
                    promo.get("promoName", ""),
                    promo.get("description", ""),
                    promo.get("discountType", "percentage"),
                    float(promo.get("discountValue", 0)),
                    float(promo.get("minimumOrderValue", 0)),
                    promo.get("appliedOn", "wholeOrder") == "wholeOrder",
                    promo.get("isActive", True),
                    promo.get("linkedFrequency"),
                    promo.get("isOnlineFrequencyPromo", False),
                    promo.get("startDate") or None,
                    promo.get("endDate") or None,
                ))

            for promo in promos_to_update:
                cur.execute("""
                    UPDATE shop.promotions
                    SET description = %s, discount_type = %s, discount_value = %s,
                        minimum_order_value = %s, apply_on_whole_order = %s,
                        is_active = %s, linked_frequency = %s, is_online_frequency_promo = %s,
                        start_date = COALESCE(%s, start_date),
                        end_date = COALESCE(%s, end_date),
                        updated_at = NOW()
                    WHERE laundry_id = %s AND promo_code = %s
                """, (
                    promo.get("description", ""),
                    promo.get("discountType", "percentage"),
                    float(promo.get("discountValue", 0)),
                    float(promo.get("minimumOrderValue", 0)),
                    promo.get("appliedOn", "wholeOrder") == "wholeOrder",
                    promo.get("isActive", True),
                    promo.get("linkedFrequency"),
                    promo.get("isOnlineFrequencyPromo", False),
                    promo.get("startDate") or None,
                    promo.get("endDate") or None,
                    laundryId,
                    promo.get("promoCode", ""),
                ))

            for promo_code in promos_to_delete:
                cur.execute("""
                    DELETE FROM shop.promotions WHERE laundry_id = %s AND promo_code = %s
                """, (laundryId, promo_code))

            return {"statusCode": 200, "body": {"message": "Promotions updated successfully"}}

        elif operation == "modifyServiceableZipCodes":
            zip_codes_to_add = body.get("zipCodesToAdd", [])
            zip_codes_to_remove = body.get("zipCodesToRemove", [])

            # Get current zip codes
            cur.execute("SELECT serviceable_zip_codes FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
            row = cur.fetchone()
            current_zips = row["serviceable_zip_codes"] if row else []

            # Normalize to list
            if isinstance(current_zips, dict):
                current_zips = list(current_zips.keys())
            elif not isinstance(current_zips, list):
                current_zips = []

            # Add new, remove old
            updated_zips = [z for z in current_zips if z not in zip_codes_to_remove]
            for z in zip_codes_to_add:
                if z not in updated_zips:
                    updated_zips.append(z)

            import json
            cur.execute("UPDATE shop.laundry_shops SET serviceable_zip_codes = %s::jsonb WHERE laundry_id = %s",
                        (json.dumps(updated_zips), laundryId))
            return {"statusCode": 200, "body": {"message": "Zip codes updated successfully"}}

    return {"statusCode": 400, "body": {"message": "Unknown operation"}}


@router.post("/update-products")
async def update_products(
    operation: str = Query("updateProducts"),
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update products — separate endpoint used by frontend."""
    with get_db() as conn:
        cur = get_cursor(conn)
        products_to_add = body.get("productsToAdd", [])
        products_to_update = body.get("productsToUpdate", [])
        products_to_remove = body.get("productsToRemove", [])

        for prod in products_to_add:
            cur.execute("""
                INSERT INTO shop.laundry_products (laundry_id, product_name, price, description, is_active)
                VALUES (%s, %s, %s, %s, TRUE)
            """, (laundryId, prod.get("productName"), float(prod.get("price", 0)), prod.get("description", "")))

        for prod in products_to_update:
            cur.execute("""
                UPDATE shop.laundry_products
                SET price = %s, description = %s
                WHERE laundry_id = %s AND product_name = %s
            """, (float(prod.get("price", 0)), prod.get("description", ""),
                  laundryId, prod.get("productName")))

        for prod_name in products_to_remove:
            cur.execute("""
                UPDATE shop.laundry_products SET is_active = FALSE
                WHERE laundry_id = %s AND product_name = %s
            """, (laundryId, prod_name))

    return {"statusCode": 200, "body": {"message": "Products updated successfully"}}


@router.post("/send-notifications")
async def send_notifications(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Send email/SMS notification to a customer."""
    from app.services.notification_service import send_email, send_sms
    notif_type = body.get("type", "email")
    recipient = body.get("recipient")
    message = body.get("message", "")
    subject = body.get("subject", "Notification from your laundry")

    if notif_type == "email" and recipient:
        send_email(recipient, subject, message)
        return {"statusCode": 200, "body": {"message": "Email sent"}}
    elif notif_type == "sms" and recipient:
        send_sms(recipient, message)
        return {"statusCode": 200, "body": {"message": "SMS sent"}}
    return {"statusCode": 400, "body": {"message": "Missing recipient or type"}}


@router.post("/create-employee")
async def create_employee(
    operation: Optional[str] = Query(None),
    laundryId: Optional[str] = Query(None),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Create or delete an employee based on operation param."""
    op = operation or "createEmployee"
    laundry_id = laundryId or body.get("laundryId") or current_user.get("laundryId")

    if not laundry_id:
        return {"statusCode": 400, "body": {"message": "Missing laundryId"}}

    # DELETE employee
    if op == "deleteEmployee":
        emp_id = body.get("empId")
        if not emp_id:
            return {"statusCode": 400, "body": {"message": "Missing empId"}}
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                UPDATE shop.employees SET is_active = FALSE, updated_at = NOW()
                WHERE emp_id = %s AND laundry_id = %s
            """, (emp_id, laundry_id))
        return {"statusCode": 200, "body": {"message": f"Employee {emp_id} deleted successfully"}}

    # CREATE employee
    with get_db() as conn:
        cur = get_cursor(conn)
        first_name = body.get("firstName", "")
        last_name = body.get("lastName", "")
        email = body.get("email", "")
        phone = body.get("phone", "")
        role = body.get("role", "FrontDesk")
        joining_date = body.get("joiningDate")
        address = body.get("address", {})

        # Get emp_prefix for this laundry
        cur.execute("SELECT emp_prefix FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
        row = cur.fetchone()
        prefix = row["emp_prefix"] if row and row["emp_prefix"] else "EMP"

        # Generate unique employee ID and passcode
        import random
        for _ in range(10):  # Try up to 10 times for unique ID
            emp_num = random.randint(100, 999)
            emp_id = f"{prefix}{emp_num}"
            cur.execute("SELECT emp_id FROM shop.employees WHERE emp_id = %s", (emp_id,))
            if not cur.fetchone():
                break

        passcode = str(random.randint(1000, 9999))

        try:
            cur.execute("""
                INSERT INTO shop.employees (emp_id, laundry_id, first_name, last_name, email, role, passcode, joining_date, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, NOW(), NOW())
            """, (emp_id, laundry_id, first_name, last_name, email, role, passcode, joining_date or None))
        except Exception as e:
            return {"statusCode": 200, "body": {
                "createdEmployees": [],
                "failedEmployees": [{"error": str(e), "data": {"email": email}}],
            }}

    return {"statusCode": 200, "body": {
        "message": "Employee created successfully",
        "createdEmployees": [{
            "empId": emp_id,
            "passcode": passcode,
            "email": email,
            "role": role,
        }],
        "failedEmployees": [],
    }}


@router.get("/generate-reports")
async def generate_reports(
    operation: str = Query(...),
    laundryId: str = Query(...),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate order/tip reports."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == "monthlySummary":
            cur.execute("""
                SELECT COUNT(*) as total_orders,
                       COALESCE(SUM(grand_total), 0) as total_revenue,
                       COALESCE(AVG(grand_total), 0) as avg_order_value
                FROM orders.orders
                WHERE laundry_id = %s AND created_at >= NOW() - INTERVAL '30 days'
            """, (laundryId,))
            row = cur.fetchone()
            return {"statusCode": 200, "body": {
                "totalOrders": row["total_orders"],
                "totalRevenue": float(row["total_revenue"]),
                "avgOrderValue": float(row["avg_order_value"]),
            }}

        elif operation == "viewOrdersByLaundryId" and startDate and endDate:
            cur.execute("""
                SELECT o.order_id, o.order_type, o.order_status, o.payment_status,
                       o.grand_total, o.created_at, c.first_name, c.last_name, c.phone_number
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                WHERE o.laundry_id = %s AND o.created_at::date BETWEEN %s AND %s
                ORDER BY o.created_at DESC
            """, (laundryId, startDate, endDate))
            orders = [{
                "orderId": r["order_id"], "orderType": r["order_type"],
                "orderStatus": r["order_status"], "paymentStatus": r["payment_status"],
                "grandTotal": float(r["grand_total"] or 0), "createdAt": str(r["created_at"]),
                "customerName": f"{r['first_name']} {r['last_name']}".strip(),
                "customerPhone": r["phone_number"],
            } for r in cur.fetchall()]
            return {"statusCode": 200, "body": {"orders": orders}}

    return {"statusCode": 200, "body": {"message": "No data"}}


@router.get("/employee-tip-info")
async def employee_tip_info(
    laundryId: str = Query(...),
    empId: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get tip information for employees — returns individual tip records."""
    with get_db() as conn:
        cur = get_cursor(conn)
        query = """
            SELECT ot.tip_receiver_id, ot.tip_amount, ot.tip_percentage,
                   ot.tip_type, ot.tip_method, ot.order_id,
                   o.created_at,
                   o.total_cost, o.grand_total
            FROM orders.order_tips ot
            JOIN orders.orders o ON o.order_id = ot.order_id
            WHERE o.laundry_id = %s AND ot.tip_amount > 0
        """
        params = [laundryId]
        if empId:
            query += " AND ot.tip_receiver_id = %s"
            params.append(empId)
        if startDate:
            query += " AND o.created_at::date >= %s"
            params.append(startDate)
        if endDate:
            query += " AND o.created_at::date <= %s"
            params.append(endDate)
        query += " ORDER BY o.created_at DESC"

        cur.execute(query, params)
        tips = [{
            "tipReceiverId": r["tip_receiver_id"],
            "tipAmount": float(r["tip_amount"] or 0),
            "tipPercentage": float(r["tip_percentage"]) if r["tip_percentage"] else None,
            "tipType": r["tip_type"],
            "tipMethod": r["tip_method"],
            "orderId": r["order_id"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            "totalCost": float(r["total_cost"] or 0),
            "grandTotal": float(r["grand_total"] or 0),
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": tips}


@router.get("/get-employee-reviews")
async def get_employee_reviews(
    laundryId: str = Query(...),
    empId: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get employee reviews."""
    with get_db() as conn:
        cur = get_cursor(conn)
        query = """
            SELECT r.review_id, r.emp_id, r.order_id, r.customer_id,
                   r.employee_rating, r.review_comment, r.photo_url, r.review_date,
                   c.first_name, c.last_name
            FROM orders.order_reviews r
            JOIN shop.customers c ON c.customer_id = r.customer_id
            WHERE r.laundry_id = %s
        """
        params = [laundryId]
        if empId:
            query += " AND r.emp_id = %s"
            params.append(empId)
        query += " ORDER BY r.review_date DESC NULLS LAST LIMIT 50"
        cur.execute(query, params)
        reviews = [{
            "reviewId": r["review_id"],
            "empId": r["emp_id"],
            "orderId": r["order_id"],
            "customerId": r["customer_id"],
            "employeeRating": float(r["employee_rating"]) if r["employee_rating"] is not None else 0.0,
            "rating": float(r["employee_rating"]) if r["employee_rating"] is not None else 0.0,
            "reviewComment": r["review_comment"] or "",
            "comment": r["review_comment"] or "",
            "photoUrl": r["photo_url"],
            "reviewDate": str(r["review_date"]) if r["review_date"] else None,
            "customerName": f"{r['first_name']} {r['last_name']}".strip(),
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"reviews": reviews}}


@router.get("/laundry-stats")
async def laundry_stats(
    operation: str = Query("stats"),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get laundry dashboard stats or shop details."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if operation == "fetchShopDetails":
            cur.execute("""
                SELECT laundry_name, contact_email, contact_phone,
                       street, city, state, zip_code
                FROM shop.laundry_shops WHERE laundry_id = %s
            """, (laundryId,))
            row = cur.fetchone()
            if not row:
                return {"statusCode": 200, "body": {"name": "N/A", "address": "N/A", "phone": "N/A", "email": "N/A"}}
            addr = f"{row['street']}, {row['city']}, {row['state']} {row['zip_code']}".strip(", ")
            return {"statusCode": 200, "body": {
                "name": row["laundry_name"],
                "address": addr,
                "phone": row["contact_phone"] or "N/A",
                "email": row["contact_email"] or "N/A",
            }}

        elif operation == "monthlySummary":
            cur.execute("""
                SELECT COUNT(*) as total_orders,
                       COALESCE(SUM(grand_total), 0) as monthly_sales,
                       COALESCE(AVG(grand_total), 0) as average_cost
                FROM orders.orders
                WHERE laundry_id = %s AND created_at >= NOW() - INTERVAL '30 days'
            """, (laundryId,))
            row = cur.fetchone()
            return {"statusCode": 200, "body": {
                "totalOrders": row["total_orders"],
                "monthlySales": round(float(row["monthly_sales"]), 2),
                "averageCost": round(float(row["average_cost"]), 2),
            }}

    # Default stats
    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE status_category = 'Active') as active_orders,
            COUNT(*) FILTER (WHERE status_category = 'Completed') as completed_orders,
            COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_orders,
            COALESCE(SUM(grand_total) FILTER (WHERE created_at::date = CURRENT_DATE), 0) as today_revenue
        FROM orders.orders WHERE laundry_id = %s
    """, (laundryId,))
    row = cur.fetchone()
    return {"statusCode": 200, "body": {
        "activeOrders": row["active_orders"],
        "completedOrders": row["completed_orders"],
        "todayOrders": row["today_orders"],
        "todayRevenue": float(row["today_revenue"]),
    }}


@router.get("/print-invoice")
async def print_invoice(
    orderId: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get invoice data for printing."""
    # Reuse single order endpoint logic
    with get_db() as conn:
        cur = get_cursor(conn)
        from app.routes.orders_info import get_single_order
        return get_single_order(cur, laundryId, orderId)


@router.post("/update-customer-notifications")
async def update_customer_notifications(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update customer notification preferences."""
    customer_id = body.get("customerId")
    prefs = body.get("notificationPreferences", {})
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.customers
            SET notif_email = %s, notif_sms = %s, notif_phone = %s
            WHERE customer_id = %s
        """, (prefs.get("email", False), prefs.get("sms", False), prefs.get("phone", False), customer_id))
    return {"statusCode": 200, "body": {"message": "Preferences updated"}}


@router.get("/check-partial-phonenumbers")
async def check_partial_phone(
    phoneQuery: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Search customers by partial phone number."""
    with get_db() as conn:
        cur = get_cursor(conn)
        normalized = phoneQuery.replace("+1", "").strip()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.phone_number LIKE %s
            LIMIT 10
        """, (laundryId, f"%{normalized}%"))
        suggestions = [{
            "customerId": r["customer_id"],
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "phoneNumber": r["phone_number"],
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"suggestions": suggestions}}


# ── Stripe Terminal Payment Endpoints ─────────────────────────────────────────

@router.post("/terminal-payment")
async def initiate_terminal_payment(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Initiate a terminal payment — creates PaymentIntent and processes on reader."""
    return await _initiate_terminal(body)


@router.post("/terminal-direct-payment")
async def initiate_terminal_direct_payment(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Initiate a terminal payment (direct/immediate) — same flow."""
    return await _initiate_terminal(body)


@router.get("/terminal-payment-status")
async def check_terminal_payment_status(
    operation: str = Query("checkTerminalPaymentStatus"),
    laundryId: str = Query(...),
    terminalPaymentIntentId: str = Query(...),
    lastRun: Optional[str] = Query("false"),
    current_user: dict = Depends(get_current_user),
):
    """Poll terminal payment status."""
    return await _check_terminal_status(laundryId, terminalPaymentIntentId, lastRun)


@router.get("/terminal-direct-payment-status")
async def check_terminal_direct_payment_status(
    operation: str = Query("checkImmediateTerminalPaymentStatus"),
    laundryId: str = Query(...),
    terminalPaymentIntentId: str = Query(...),
    lastRun: Optional[str] = Query("false"),
    current_user: dict = Depends(get_current_user),
):
    """Poll terminal payment status (direct/immediate)."""
    return await _check_terminal_status(laundryId, terminalPaymentIntentId, lastRun)


async def _initiate_terminal(body: dict):
    """Shared logic: create PaymentIntent and process on Stripe Terminal reader."""
    import stripe
    from app.services.payment_service import _init_stripe
    from decimal import Decimal

    amount = body.get("amount", 0)
    laundry_id = body.get("laundryId")
    existing_intent_id = body.get("terminalPaymentIntentId")

    if not laundry_id or not amount:
        return {"status": "error", "message": "Missing laundryId or amount"}

    try:
        terminal_id = _init_stripe(laundry_id)
        if not terminal_id:
            return {"status": "error", "message": "No terminal configured for this laundry"}

        amount_cents = int(round(Decimal(str(amount)) * 100))

        # If re-initiating with existing intent, cancel the old one first
        if existing_intent_id:
            try:
                stripe.PaymentIntent.cancel(existing_intent_id)
                logger.info(f"Cancelled existing terminal intent: {existing_intent_id}")
            except Exception:
                pass  # May already be cancelled

        # Create PaymentIntent for terminal
        payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            payment_method_types=["card_present"],
            capture_method="automatic",
            description=f"Terminal payment - Laundry {laundry_id}",
        )

        # Process the payment intent on the terminal reader
        reader = stripe.terminal.Reader.process_payment_intent(
            terminal_id,
            payment_intent=payment_intent.id,
        )

        logger.info(f"Terminal payment initiated: {payment_intent.id} on reader {terminal_id}")

        return {
            "status": "success",
            "paymentIntentId": payment_intent.id,
            "readerId": terminal_id,
        }

    except stripe.error.InvalidRequestError as e:
        logger.error(f"Terminal initiation error: {e}")
        return {"status": "error", "message": str(e), "reInitiate": True}
    except Exception as e:
        logger.exception("Terminal payment initiation failed")
        return {"status": "error", "message": str(e)}


async def _check_terminal_status(laundry_id: str, payment_intent_id: str, last_run: str):
    """Shared logic: check if terminal payment succeeded."""
    import stripe
    from app.services.payment_service import _init_stripe

    try:
        _init_stripe(laundry_id)
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        status = intent.get("status", "")

        if status == "succeeded":
            return {
                "status": "success",
                "paymentIntentId": payment_intent_id,
                "payment_status": status,
            }
        elif status == "canceled" or status == "cancelled":
            return {
                "status": "cancelled",
                "message": "Payment was cancelled",
                "payment_status": status,
                "reInitiate": True,
            }
        elif status == "requires_capture":
            # Auto-capture
            captured = stripe.PaymentIntent.capture(payment_intent_id)
            if captured["status"] == "succeeded":
                return {
                    "status": "success",
                    "paymentIntentId": payment_intent_id,
                    "payment_status": "succeeded",
                }
            return {
                "status": "pending",
                "payment_status": captured["status"],
            }
        else:
            # Still processing (requires_payment_method, requires_action, processing)
            if str(last_run).lower() == "true":
                # Final check — cancel if not done
                try:
                    stripe.PaymentIntent.cancel(payment_intent_id)
                except Exception:
                    pass
                return {
                    "status": "cancelled",
                    "message": "Payment timed out",
                    "payment_status": status,
                    "reInitiate": True,
                }
            return {
                "status": "pending",
                "payment_status": status,
            }

    except Exception as e:
        logger.exception("Terminal status check failed")
        return {"status": "error", "message": str(e), "reInitiate": True}


# ── Zip Code Interest / Demand ────────────────────────────────────────────────

@router.get("/zip-interest")
async def get_zip_interest(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get zip code interest/demand data for unserved areas."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT zip_code, COUNT(*) as request_count,
                   array_agg(DISTINCT email) FILTER (WHERE email != '') as emails,
                   array_agg(DISTINCT phone) FILTER (WHERE phone != '') as phones,
                   MIN(created_at) as first_request,
                   MAX(created_at) as latest_request
            FROM shop.zip_code_interest
            WHERE laundry_id = %s
            GROUP BY zip_code
            ORDER BY request_count DESC
        """, (laundryId,))
        data = [{
            "zipCode": r["zip_code"],
            "requestCount": r["request_count"],
            "emails": r["emails"] or [],
            "phones": r["phones"] or [],
            "firstRequest": str(r["first_request"]),
            "latestRequest": str(r["latest_request"]),
        } for r in cur.fetchall()]

    return {"statusCode": 200, "body": {"status": "success", "data": data}}


# ── Service Categories CRUD ───────────────────────────────────────────────────

@router.get("/service-categories")
async def get_service_categories(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all active service categories for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT category_id, category_name, display_order
            FROM shop.service_categories
            WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY display_order, category_id
        """, (laundryId,))
        categories = [{
            "categoryId": r["category_id"],
            "categoryName": r["category_name"],
            "displayOrder": r["display_order"],
        } for r in cur.fetchall()]
    return {"status": "success", "categories": categories}


@router.post("/service-categories")
async def create_service_category(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Create a new service category."""
    laundry_id = body.get("laundryId")
    category_name = body.get("categoryName", "").strip()
    display_order = body.get("displayOrder")

    if not laundry_id or not category_name:
        return {"status": "error", "message": "laundryId and categoryName are required"}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Auto-assign display_order if not provided
        if display_order is None:
            cur.execute("""
                SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
                FROM shop.service_categories
                WHERE laundry_id = %s AND is_active = TRUE
            """, (laundry_id,))
            display_order = cur.fetchone()["next_order"]

        try:
            cur.execute("""
                INSERT INTO shop.service_categories (laundry_id, category_name, display_order)
                VALUES (%s, %s, %s)
                RETURNING category_id
            """, (laundry_id, category_name, display_order))
            row = cur.fetchone()
            return {
                "status": "success",
                "category": {
                    "categoryId": row["category_id"],
                    "categoryName": category_name,
                    "displayOrder": display_order,
                }
            }
        except Exception as e:
            if "unique" in str(e).lower():
                return {"status": "error", "message": f"Category '{category_name}' already exists"}
            raise


@router.put("/service-categories")
async def update_service_category(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update a service category's name or display order."""
    category_id = body.get("categoryId")
    laundry_id = body.get("laundryId")
    category_name = body.get("categoryName", "").strip()
    display_order = body.get("displayOrder")

    if not category_id or not laundry_id:
        return {"status": "error", "message": "categoryId and laundryId are required"}

    with get_db() as conn:
        cur = get_cursor(conn)
        sets = []
        params = []
        if category_name:
            sets.append("category_name = %s")
            params.append(category_name)
        if display_order is not None:
            sets.append("display_order = %s")
            params.append(display_order)

        if not sets:
            return {"status": "error", "message": "Nothing to update"}

        params.extend([category_id, laundry_id])
        cur.execute(f"""
            UPDATE shop.service_categories
            SET {', '.join(sets)}
            WHERE category_id = %s AND laundry_id = %s
        """, params)

        if cur.rowcount == 0:
            return {"status": "error", "message": "Category not found"}

    return {"status": "success", "message": "Category updated"}


@router.delete("/service-categories")
async def delete_service_category(
    categoryId: int = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Delete a service category. Blocks if services are still assigned to it."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Check if any active services are assigned to this category
        cur.execute("""
            SELECT COUNT(*) as cnt FROM shop.laundry_services
            WHERE category_id = %s AND laundry_id = %s AND is_active = TRUE
        """, (categoryId, laundryId))
        row = cur.fetchone()
        if row and row["cnt"] > 0:
            return {
                "status": "error",
                "message": f"Cannot delete — {row['cnt']} service(s) still assigned to this category. Unassign them first."
            }

        cur.execute("""
            DELETE FROM shop.service_categories
            WHERE category_id = %s AND laundry_id = %s
        """, (categoryId, laundryId))
        if cur.rowcount == 0:
            return {"status": "error", "message": "Category not found"}
    return {"status": "success", "message": "Category deleted"}


# ── Customer Pricing (Commercial Accounts) ────────────────────────────────────

@router.get("/customer-pricing")
async def get_customer_pricing(
    laundryId: str = Query(...),
    customerId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get custom pricing rules for a specific customer."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT id, pricing_type, service_name, value
            FROM shop.customer_pricing
            WHERE customer_id = %s AND laundry_id = %s
            ORDER BY service_name NULLS FIRST
        """, (customerId, laundryId))
        rules = [{
            "id": r["id"],
            "pricingType": r["pricing_type"],
            "serviceName": r["service_name"],
            "value": float(r["value"]),
        } for r in cur.fetchall()]
    return {"status": "success", "pricingRules": rules}


@router.post("/customer-pricing")
async def set_customer_pricing(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Set custom pricing for a customer. Supports discount % or custom service price."""
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")
    pricing_type = body.get("pricingType", "discount")  # 'discount' or 'custom_price'
    service_name = body.get("serviceName") or None  # NULL = applies to all
    value = float(body.get("value", 0))

    if not customer_id or not laundry_id or value <= 0:
        return {"status": "error", "message": "customerId, laundryId, and value > 0 are required"}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO shop.customer_pricing (customer_id, laundry_id, pricing_type, service_name, value)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (customer_id, laundry_id, service_name)
            DO UPDATE SET pricing_type = EXCLUDED.pricing_type, value = EXCLUDED.value
            RETURNING id
        """, (customer_id, laundry_id, pricing_type, service_name, value))
        row = cur.fetchone()

    return {"status": "success", "id": row["id"]}


@router.delete("/customer-pricing")
async def delete_customer_pricing(
    id: int = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Remove a custom pricing rule."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("DELETE FROM shop.customer_pricing WHERE id = %s AND laundry_id = %s", (id, laundryId))
    return {"status": "success", "message": "Pricing rule removed"}


# ── Service Catalog Endpoints ─────────────────────────────────────────────────

VALID_ICON_KEYS = ["package", "droplet", "truck", "sun", "bag"]
VALID_COLORS = ["blue", "green", "orange", "purple", "red", "teal", "cyan", "pink", "yellow"]


@router.get("/service-catalog")
async def get_service_catalog(
    current_user: dict = Depends(get_current_user),
):
    """Return all active entries from the shared service catalog."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT id, title, description, icon_key, color, source_type, source_id
            FROM shop.service_catalog
            WHERE is_active = TRUE
            ORDER BY id
        """)
        catalog = [{
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "iconKey": r["icon_key"],
            "color": r["color"],
            "sourceType": r["source_type"],
            "sourceId": r["source_id"],
        } for r in cur.fetchall()]
    return {"statusCode": 200, "body": {"catalog": catalog}}


@router.post("/service-catalog")
async def create_service_catalog_entry(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Create a custom service in the shared catalog."""
    laundry_id = body.get("laundryId")
    title = (body.get("title") or "").strip()
    description = body.get("description", "")
    icon_key = body.get("iconKey", "package")
    color = body.get("color", "blue")

    # Validation
    if not title or len(title) > 100:
        return {"statusCode": 400, "body": {"error": "Title is required and must be 100 characters or fewer"}}

    if icon_key not in VALID_ICON_KEYS:
        return {"statusCode": 400, "body": {"error": f"Invalid icon_key: must be one of {VALID_ICON_KEYS}"}}

    if color not in VALID_COLORS:
        return {"statusCode": 400, "body": {"error": f"Invalid color: must be one of {VALID_COLORS}"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        try:
            cur.execute("""
                INSERT INTO shop.service_catalog (title, description, icon_key, color, source_type, source_id)
                VALUES (%s, %s, %s, %s, 'tenant', %s)
                RETURNING id, title, description, icon_key, color, source_type, source_id
            """, (title, description, icon_key, color, laundry_id))
            row = cur.fetchone()
        except Exception as e:
            if "unique" in str(e).lower() or "duplicate" in str(e).lower():
                conn.rollback()
                return {"statusCode": 409, "body": {"error": "A service with this title already exists"}}
            raise

    return {"statusCode": 200, "body": {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "iconKey": row["icon_key"],
        "color": row["color"],
        "sourceType": row["source_type"],
        "sourceId": row["source_id"],
    }}


@router.put("/service-catalog/config")
async def save_service_catalog_config(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Save a tenant's selected services configuration to site_content."""
    laundry_id = body.get("laundryId")
    services = body.get("services", [])

    if not laundry_id:
        return {"statusCode": 400, "body": {"error": "laundryId is required"}}

    services_json = json.dumps(services)

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = jsonb_set(
                COALESCE(site_content, '{}'::jsonb),
                '{services}',
                %s::jsonb
            )
            WHERE laundry_id = %s
        """, (services_json, laundry_id))

    return {"statusCode": 200, "body": {"message": "Service configuration saved successfully"}}


# ── Financial Reports (added directly to admin_extra to avoid routing issues) ──

@router.get("/financial-reports/sales-tax")
async def get_financial_sales_tax(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Sales tax report."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT tax_rate FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        shop_row = cur.fetchone()
        tax_rate = float(shop_row["tax_rate"] or 0) if shop_row else 0

        cur.execute("""
            SELECT COALESCE(SUM(grand_total), 0) AS gross_sales, COUNT(*) AS order_count
            FROM orders.orders
            WHERE laundry_id = %s AND created_at >= %s AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        row = cur.fetchone()
        gross_sales = float(row["gross_sales"] or 0)
        order_count = int(row["order_count"] or 0)

        if tax_rate > 0:
            taxable_amount = round(gross_sales / (1 + tax_rate), 2)
            tax_collected = round(gross_sales - taxable_amount, 2)
        else:
            taxable_amount = gross_sales
            tax_collected = 0.0

    return {"status": "success", "data": {
        "grossSales": round(gross_sales, 2), "taxableAmount": taxable_amount,
        "taxCollected": tax_collected, "taxRate": tax_rate,
        "orderCount": order_count, "periodLabel": f"{startDate} to {endDate}",
    }}


@router.get("/financial-reports/tips")
async def get_financial_tips(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Tips report - reads from orders.order_tips table."""
    with get_db() as conn:
        cur = get_cursor(conn)
        # Join order_tips with orders to filter by laundry and date range
        cur.execute("""
            SELECT ot.tip_amount, ot.tip_method, ot.tip_receiver_id
            FROM orders.order_tips ot
            JOIN orders.orders o ON o.order_id = ot.order_id
            WHERE o.laundry_id = %s
              AND o.created_at >= %s
              AND o.created_at < (%s::date + INTERVAL '1 day')
              AND o.order_status != 'OrderCanceled'
              AND ot.tip_amount > 0
        """, (laundryId, startDate, endDate))
        rows = cur.fetchall()

        total_tips = 0.0
        tips_by_employee = {}
        tips_by_method = {"cash": 0.0, "card": 0.0}

        for row in rows:
            tip_amount = float(row["tip_amount"] or 0)
            if tip_amount <= 0:
                continue
            total_tips += tip_amount
            method = (row["tip_method"] or "card").lower()
            if method in tips_by_method:
                tips_by_method[method] += tip_amount
            else:
                tips_by_method["card"] += tip_amount
            receiver = row["tip_receiver_id"] or ""
            if receiver:
                receiver = str(receiver)
                if receiver not in tips_by_employee:
                    tips_by_employee[receiver] = {"tipsEarned": 0.0, "orderCount": 0}
                tips_by_employee[receiver]["tipsEarned"] += tip_amount
                tips_by_employee[receiver]["orderCount"] += 1

        # Get employee names
        tips_list = []
        if tips_by_employee:
            emp_ids = list(tips_by_employee.keys())
            placeholders = ",".join(["%s"] * len(emp_ids))
            cur.execute(f"SELECT emp_id, first_name, last_name FROM shop.employees WHERE emp_id IN ({placeholders})", emp_ids)
            name_map = {str(r["emp_id"]): f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() for r in cur.fetchall()}
            for eid, data in tips_by_employee.items():
                tips_list.append({"name": name_map.get(eid, "Unknown"), "tipsEarned": round(data["tipsEarned"], 2), "orderCount": data["orderCount"]})
            tips_list.sort(key=lambda x: x["tipsEarned"], reverse=True)

    return {"status": "success", "data": {
        "totalTipsCollected": round(total_tips, 2), "tipsByEmployee": tips_list,
        "tipsByMethod": {"cash": round(tips_by_method["cash"], 2), "card": round(tips_by_method["card"], 2)},
    }}


@router.get("/financial-reports/revenue-summary")
async def get_financial_revenue(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Revenue summary."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT COALESCE(SUM(grand_total), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN order_type = 'Online' THEN grand_total ELSE 0 END), 0) AS online_rev,
                COALESCE(SUM(CASE WHEN order_type = 'InStore' THEN grand_total ELSE 0 END), 0) AS instore_rev,
                COALESCE(SUM(CASE WHEN order_type = 'Commercial' THEN grand_total ELSE 0 END), 0) AS commercial_rev,
                COALESCE(SUM(CASE WHEN payment_status = 'Unpaid' THEN grand_total ELSE 0 END), 0) AS unpaid_rev
            FROM orders.orders
            WHERE laundry_id = %s AND created_at >= %s AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        r = cur.fetchone()

    return {"status": "success", "data": {
        "totalRevenue": round(float(r["total_revenue"] or 0), 2),
        "revenueByType": {"online": round(float(r["online_rev"] or 0), 2), "instore": round(float(r["instore_rev"] or 0), 2), "commercial": round(float(r["commercial_rev"] or 0), 2)},
        "revenueByService": [],
        "cashRevenue": round(float(r["total_revenue"] or 0) - float(r["unpaid_rev"] or 0), 2),
        "cardRevenue": 0.0,
        "payLaterRevenue": round(float(r["unpaid_rev"] or 0), 2),
    }}


@router.get("/financial-reports/comptroller")
async def get_financial_comptroller(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """State comptroller report."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT tax_rate FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        shop_row = cur.fetchone()
        tax_rate = float(shop_row["tax_rate"] or 0) if shop_row else 0

        cur.execute("""
            SELECT COALESCE(SUM(grand_total), 0) AS gross, COUNT(*) AS cnt
            FROM orders.orders
            WHERE laundry_id = %s AND created_at >= %s AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        row = cur.fetchone()
        gross = float(row["gross"] or 0)
        cnt = int(row["cnt"] or 0)

        if tax_rate > 0:
            taxable = round(gross / (1 + tax_rate), 2)
            tax_collected = round(gross - taxable, 2)
        else:
            taxable = gross
            tax_collected = 0.0

    return {"status": "success", "data": {
        "reportingPeriod": f"{startDate} to {endDate}", "grossReceipts": round(gross, 2),
        "taxableReceipts": taxable, "salesTaxCollected": tax_collected,
        "taxRate": tax_rate, "totalOrders": cnt, "exemptSales": 0.0,
    }}


# ═══════════════════════════════════════════════════════════════
# EXPENSES TRACKING
# ═══════════════════════════════════════════════════════════════

@router.get("/financial-reports/expenses")
async def get_expenses(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get expenses for date range."""
    with get_db() as conn:
        cur = get_cursor(conn)
        # Ensure table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.expenses (
                expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                laundry_id TEXT NOT NULL,
                category TEXT NOT NULL,
                amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
                description TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.commit()

        cur.execute("""
            SELECT expense_id, category, amount, expense_date, description, created_by, created_at
            FROM shop.expenses
            WHERE laundry_id = %s AND expense_date >= %s AND expense_date <= %s
            ORDER BY expense_date DESC, created_at DESC
        """, (laundryId, startDate, endDate))
        rows = cur.fetchall()

        expenses = [{
            "expenseId": str(r["expense_id"]),
            "category": r["category"],
            "amount": float(r["amount"]),
            "expenseDate": str(r["expense_date"]),
            "description": r["description"] or "",
            "createdBy": r["created_by"] or "",
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        } for r in rows]

        # Summary by category
        cur.execute("""
            SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM shop.expenses
            WHERE laundry_id = %s AND expense_date >= %s AND expense_date <= %s
            GROUP BY category ORDER BY total DESC
        """, (laundryId, startDate, endDate))
        summary = [{
            "category": r["category"],
            "total": float(r["total"]),
            "count": int(r["count"]),
        } for r in cur.fetchall()]

        total_expenses = sum(s["total"] for s in summary)

    return {"status": "success", "data": {
        "expenses": expenses,
        "summary": summary,
        "totalExpenses": round(total_expenses, 2),
    }}


@router.post("/financial-reports/expenses")
async def add_expense(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Add a new expense."""
    category = body.get("category", "").strip()
    amount = float(body.get("amount", 0))
    expense_date = body.get("expenseDate") or datetime.now().strftime("%Y-%m-%d")
    description = body.get("description", "").strip()

    if not category or amount <= 0:
        return {"status": "error", "message": "Category and positive amount required"}

    created_by = current_user.get("empId") or current_user.get("sub", "")

    with get_db() as conn:
        cur = get_cursor(conn)
        # Ensure table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shop.expenses (
                expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                laundry_id TEXT NOT NULL,
                category TEXT NOT NULL,
                amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
                description TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        conn.commit()

        cur.execute("""
            INSERT INTO shop.expenses (laundry_id, category, amount, expense_date, description, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING expense_id
        """, (laundryId, category, amount, expense_date, description, created_by))
        row = cur.fetchone()
        expense_id = str(row["expense_id"])

    return {"status": "success", "data": {"expenseId": expense_id, "message": "Expense added"}}


@router.delete("/financial-reports/expenses")
async def delete_expense(
    laundryId: str = Query(...),
    expenseId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Delete an expense."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            DELETE FROM shop.expenses WHERE expense_id = %s::uuid AND laundry_id = %s
        """, (expenseId, laundryId))
        if cur.rowcount == 0:
            return {"status": "error", "message": "Expense not found"}

    return {"status": "success", "message": "Expense deleted"}


@router.get("/financial-reports/expense-categories")
async def get_expense_categories(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get distinct expense categories used by this laundry (for autocomplete)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT DISTINCT category FROM shop.expenses
            WHERE laundry_id = %s ORDER BY category
        """, (laundryId,))
        categories = [r["category"] for r in cur.fetchall()]

    # Include default categories even if not used yet
    defaults = ["Soap/Detergent", "Gas", "Machine Quarters", "Bags/Hangers", "Delivery/Gas", "Utilities", "Supplies", "Maintenance", "Other"]
    for d in defaults:
        if d not in categories:
            categories.append(d)

    return {"status": "success", "data": {"categories": sorted(categories)}}
