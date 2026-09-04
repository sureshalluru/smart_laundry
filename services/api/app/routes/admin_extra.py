"""
Additional admin endpoints — covers remaining frontend API calls.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.pricing import compute_order_billing
from app.utils import serialize, serialize_row
from app.utils.invoice_helpers import is_valid_email
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
    current_user: dict = Depends(get_current_user),
):
    """Cancel an order from the admin panel. Reverses hold and optionally cancels frequency."""
    order_id = body.get("orderId")
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")
    cancel_reason = body.get("cancelReason", "")
    is_recurring = body.get("isRecurring", "false")
    emp_id = body.get("empId") or current_user.get("sub", "")

    if not order_id or not laundry_id:
        return {"status": "error", "message": "Missing orderId or laundryId"}

    # Resolve employee name for audit
    emp_name = "System"
    if emp_id:
        try:
            with get_db() as conn_emp:
                cur_emp = get_cursor(conn_emp)
                cur_emp.execute("SELECT first_name, last_name FROM shop.employees WHERE emp_id = %s AND laundry_id = %s", (emp_id, laundry_id))
                emp_row = cur_emp.fetchone()
                if emp_row:
                    emp_name = f"{emp_row['first_name']} {emp_row['last_name'] or ''}".strip()
        except Exception:
            pass
    # If employee not found (admin user, not an employee), use name from JWT token
    if emp_name == "System":
        token_name = current_user.get("name", "")
        if token_name:
            emp_name = token_name

    with get_db() as conn:
        cur = get_cursor(conn)

        # Cancel the order
        cur.execute("""
            UPDATE orders.orders
            SET order_status = 'OrderCanceled', status_category = 'Cancelled',
                cancel_reason = %s, updated_at = NOW()
            WHERE order_id = %s AND laundry_id = %s
        """, (cancel_reason, order_id, laundry_id))

        # The DB trigger automatically creates order_history rows when order_status changes.
        # We UPDATE those trigger-created rows to stamp the actual employee/admin name.
        try:
            cur.execute("SAVEPOINT audit_update_sp")
            cur.execute("""
                UPDATE orders.order_history
                SET emp_id = %s, emp_name = %s
                WHERE order_id = %s AND laundry_id = %s
                  AND (emp_name IS NULL OR emp_name = '' OR emp_name = 'System')
                  AND changed_at >= NOW() - INTERVAL '5 seconds'
            """, (emp_id, emp_name, order_id, laundry_id))
            cur.execute("RELEASE SAVEPOINT audit_update_sp")
        except Exception:
            cur.execute("ROLLBACK TO SAVEPOINT audit_update_sp")

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
            send_email(emp["email"], f"Your Credentials - {laundry_name}", html_body,
                       sender_name=laundry_name)
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
                   c.notif_email, c.notif_sms, c.notif_phone, c.is_commercial, c.billing_email,
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
            "isCommercial": bool(r.get("is_commercial")),
            "billingEmail": r.get("billing_email") or "",
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

            def _parse_min_weight(raw):
                """Coerce the per-service minimum to a positive float or None.
                Blank / 0 / invalid means 'no minimum' for this service."""
                if raw in (None, "", 0, "0"):
                    return None
                try:
                    v = float(raw)
                    return v if v > 0 else None
                except (TypeError, ValueError):
                    return None

            for svc in services_to_add:
                cur.execute("""
                    INSERT INTO shop.laundry_services (laundry_id, service_name, price, description, input_weight, customer_access, is_active, category_id, min_billable_weight)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                """, (laundryId, svc.get("serviceName"), float(svc.get("price", 0)),
                      svc.get("description", ""), svc.get("inputWeight", True), svc.get("customerAccess", True),
                      svc.get("categoryId") or None,
                      _parse_min_weight(svc.get("minBillableWeight"))))

            for svc in services_to_update:
                new_name = svc.get("newServiceName") or svc.get("serviceName")
                original_name = svc.get("originalServiceName") or svc.get("serviceName")
                cur.execute("""
                    UPDATE shop.laundry_services
                    SET service_name = %s, price = %s, description = %s, input_weight = %s, customer_access = %s, category_id = %s, min_billable_weight = %s
                    WHERE laundry_id = %s AND service_name = %s
                """, (new_name, float(svc.get("price", 0)), svc.get("description", ""),
                      svc.get("inputWeight", True), svc.get("customerAccess", True),
                      svc.get("categoryId") or None,
                      _parse_min_weight(svc.get("minBillableWeight")),
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

            # Master tenant opt-in for minimum billable weight (Phase 2). Only
            # written when the key is present so unrelated updates don't touch it.
            if "minWeightEnabled" in body:
                cur.execute("""
                    UPDATE shop.laundry_shops SET min_weight_enabled = %s WHERE laundry_id = %s
                """, (bool(body.get("minWeightEnabled")), laundryId))
            if "minWeightScope" in body:
                _scope_val = str(body.get("minWeightScope") or "all").strip().lower()
                if _scope_val not in ("all", "online", "instore"):
                    _scope_val = "all"
                cur.execute("""
                    UPDATE shop.laundry_shops SET min_weight_scope = %s WHERE laundry_id = %s
                """, (_scope_val, laundryId))

            # Delivery fee config (Phase 3). Each field written only when present
            # so unrelated saves don't touch it. When the mode is written, keep
            # the delivery_fee_enabled mirror consistent (enabled = mode != none).
            if "deliveryFeeMode" in body:
                _dmode = str(body.get("deliveryFeeMode") or "none").strip().lower()
                if _dmode not in ("none", "flat", "distance", "tiered"):
                    _dmode = "none"
                cur.execute("""
                    UPDATE shop.laundry_shops
                    SET delivery_fee_mode = %s, delivery_fee_enabled = %s
                    WHERE laundry_id = %s
                """, (_dmode, _dmode != "none", laundryId))

            # 'tiered' mode brackets. Written only when present so unrelated
            # saves never touch it. Each bracket is normalized to
            # {up_to_mi: float|None, flat: float, per_mile_over: float}; blank/
            # non-positive up_to_mi becomes null ("and above"). Sorted ascending.
            if "deliveryFeeTiers" in body:
                import json as _json
                _raw_tiers = body.get("deliveryFeeTiers") or []
                _clean_tiers = []
                if isinstance(_raw_tiers, list):
                    for _t in _raw_tiers:
                        if not isinstance(_t, dict):
                            continue
                        _up_raw = _t.get("upToMi", _t.get("up_to_mi"))
                        try:
                            _up = float(_up_raw)
                            _up = _up if _up > 0 else None
                        except (TypeError, ValueError):
                            _up = None
                        def _fnum(v):
                            try:
                                return round(float(v), 2)
                            except (TypeError, ValueError):
                                return 0.0
                        _clean_tiers.append({
                            "up_to_mi": _up,
                            "flat": _fnum(_t.get("flat")),
                            "per_mile_over": _fnum(_t.get("perMileOver", _t.get("per_mile_over"))),
                        })
                    _clean_tiers.sort(key=lambda b: (b["up_to_mi"] is None,
                                                     b["up_to_mi"] if b["up_to_mi"] is not None else 0.0))
                cur.execute(
                    "UPDATE shop.laundry_shops SET delivery_fee_tiers = %s::jsonb WHERE laundry_id = %s",
                    (_json.dumps(_clean_tiers), laundryId),
                )

            def _num_or_none(v):
                try:
                    return round(float(v), 2) if v is not None and str(v) != "" else None
                except (TypeError, ValueError):
                    return None

            for _key, _col in (
                ("deliveryFeeFlat", "delivery_fee_flat"),
                ("deliveryFeeBase", "delivery_fee_base"),
                ("deliveryFeePerMile", "delivery_fee_per_mile"),
                ("deliveryFeeFreeRadiusMi", "delivery_fee_free_radius_mi"),
                ("deliveryFeeMax", "delivery_fee_max"),
                ("deliveryFeeRoadFactor", "delivery_fee_road_factor"),
                ("maxServiceableDistanceMi", "max_serviceable_distance_mi"),
            ):
                if _key in body:
                    cur.execute(
                        f"UPDATE shop.laundry_shops SET {_col} = %s WHERE laundry_id = %s",
                        (_num_or_none(body.get(_key)), laundryId),
                    )

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

        elif operation == "updateAddons":
            # Add-on / processing-extra catalog management (Phase 2c). Per-tenant,
            # scoped by laundry_id. pricing_basis is 'per_pound' or 'per_item'.
            addons_to_add = body.get("addonsToAdd", [])
            addons_to_update = body.get("addonsToUpdate", [])
            addons_to_remove = body.get("addonsToRemove", [])  # list of addon_id

            def _basis(raw):
                return "per_pound" if str(raw or "").strip() == "per_pound" else "per_item"

            for a in addons_to_add:
                if not (a.get("addonName") or "").strip():
                    continue
                cur.execute("""
                    INSERT INTO shop.laundry_addons (laundry_id, addon_name, description, pricing_basis, unit_price, customer_access, is_active)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                """, (laundryId, a.get("addonName").strip(), a.get("description", ""),
                      _basis(a.get("pricingBasis")), float(a.get("unitPrice", 0) or 0),
                      a.get("customerAccess", True)))

            for a in addons_to_update:
                addon_id = a.get("addonId")
                if not addon_id:
                    continue
                cur.execute("""
                    UPDATE shop.laundry_addons
                    SET addon_name = %s, description = %s, pricing_basis = %s, unit_price = %s,
                        customer_access = %s, updated_at = now()
                    WHERE addon_id = %s AND laundry_id = %s
                """, (a.get("addonName", "").strip(), a.get("description", ""),
                      _basis(a.get("pricingBasis")), float(a.get("unitPrice", 0) or 0),
                      a.get("customerAccess", True), addon_id, laundryId))

            for addon_id in addons_to_remove:
                cur.execute("""
                    UPDATE shop.laundry_addons SET is_active = FALSE, updated_at = now()
                    WHERE addon_id = %s AND laundry_id = %s
                """, (addon_id, laundryId))

            # Master tenant opt-in for add-ons (Phase 2). Only written when present.
            if "addonsEnabled" in body:
                cur.execute("""
                    UPDATE shop.laundry_shops SET addons_enabled = %s WHERE laundry_id = %s
                """, (bool(body.get("addonsEnabled")), laundryId))

            return {"statusCode": 200, "body": {"message": "Add-ons updated successfully"}}

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

        elif operation == "updateLaundryInfo":
            # Logo + admin/user domain update. Payload from LaundryInfoManagement
            # handleSaveLogoAndDomain: { imageBase64, laundryDomain: {adminDomain, userDomain} }.
            # Logo upload mirrors onboarding (platform_admin): push to the
            # laundrylogos S3 bucket and store the URL; on any failure fall back
            # to storing the data-URI base64 directly so the logo still shows.
            updated_fields = []

            image_base64 = body.get("imageBase64")
            if image_base64:
                # Strip a data-URI prefix if present so we base64-decode raw bytes.
                raw_b64 = image_base64
                if "," in raw_b64 and raw_b64.strip().startswith("data:"):
                    raw_b64 = raw_b64.split(",", 1)[1]
                logo_stored = False
                try:
                    from app.services.s3_service import get_s3_client
                    import base64
                    logo_bytes = base64.b64decode(raw_b64)
                    s3_key = f"logos/{laundryId}/logo.png"
                    s3 = get_s3_client()
                    s3.put_object(Bucket="laundrylogos", Key=s3_key, Body=logo_bytes, ContentType="image/png")
                    logo_url = f"https://laundrylogos.s3.amazonaws.com/{s3_key}"
                    cur.execute("UPDATE shop.laundry_shops SET laundry_logo = %s WHERE laundry_id = %s",
                                (logo_url, laundryId))
                    logo_stored = True
                except Exception as logo_err:
                    logger.warning(f"Logo S3 upload failed for {laundryId}, falling back to base64: {logo_err}")
                    fallback = image_base64 if image_base64.strip().startswith("data:") else f"data:image/png;base64,{raw_b64}"
                    cur.execute("UPDATE shop.laundry_shops SET laundry_logo = %s WHERE laundry_id = %s",
                                (fallback, laundryId))
                    logo_stored = True
                if logo_stored:
                    updated_fields.append("logo")

            domain = body.get("laundryDomain") or {}
            if "adminDomain" in domain or "userDomain" in domain:
                cur.execute("""
                    UPDATE shop.laundry_shops
                    SET admin_domain = COALESCE(%s, admin_domain),
                        user_domain = COALESCE(%s, user_domain)
                    WHERE laundry_id = %s
                """, (domain.get("adminDomain"), domain.get("userDomain"), laundryId))
                updated_fields.append("domain")

            if not updated_fields:
                return {"statusCode": 400, "body": {"message": "Nothing to update"}}

            from app.services.audit_service import log_action
            log_action(laundryId, "update_laundry_info", "shop", None, {"updated": updated_fields})
            return {"statusCode": 200, "body": {"message": "Laundry info updated successfully",
                                                "updated": updated_fields}}

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
        # Get tenant branding
        laundry_id = current_user.get("laundry_id") or body.get("laundryId")
        sender_name = None
        reply_to = None
        if laundry_id:
            try:
                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("SELECT laundry_name, contact_email FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                    shop = cur.fetchone()
                    if shop:
                        sender_name = shop.get("laundry_name")
                        reply_to = shop.get("contact_email")
            except Exception:
                pass
        send_email(recipient, subject, message, sender_name=sender_name, reply_to=reply_to)
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

        # Generate a unique passcode within this laundry (prevents wrong employee on PIN login)
        passcode = None
        for _ in range(50):  # Try up to 50 times for unique passcode
            candidate = str(random.randint(1000, 9999))
            cur.execute(
                "SELECT emp_id FROM shop.employees WHERE laundry_id = %s AND passcode = %s AND is_active = TRUE",
                (laundry_id, candidate)
            )
            if not cur.fetchone():
                passcode = candidate
                break
        if not passcode:
            return {"statusCode": 200, "body": {
                "createdEmployees": [],
                "failedEmployees": [{"error": "Could not generate a unique PIN. Too many employees with 4-digit PINs. Please contact support.", "data": {"email": email}}],
            }}

        try:
            cur.execute("""
                INSERT INTO shop.employees (emp_id, laundry_id, first_name, last_name, email, role, passcode, joining_date, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, COALESCE(%s, CURRENT_DATE), TRUE, NOW(), NOW())
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


# ── Homepage Promo Settings ───────────────────────────────────────────────────

@router.get("/homepage-promo")
async def get_homepage_promo(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get homepage promo settings from site_content."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    return {
        "promoCode": sc.get("promoCode", ""),
        "promoDiscount": sc.get("promoDiscount", "20"),
        "promoEnabled": sc.get("promoEnabled", True),
    }


@router.put("/homepage-promo")
async def update_homepage_promo(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update homepage promo settings in site_content."""
    promo_code = body.get("promoCode", "")
    promo_discount = body.get("promoDiscount", "20")
    promo_enabled = body.get("promoEnabled", True)

    with get_db() as conn:
        cur = get_cursor(conn)
        import json
        # Update the promo fields in site_content JSONB
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = COALESCE(site_content, '{}'::jsonb)
                || jsonb_build_object('promoCode', %s::text, 'promoDiscount', %s::text, 'promoEnabled', %s::boolean)
            WHERE laundry_id = %s
        """, (promo_code, str(promo_discount), promo_enabled, laundryId))

    return {"status": "success", "message": "Homepage promo settings updated"}


# ── Store Hours Settings ──────────────────────────────────────────────────────

@router.get("/store-hours")
async def get_store_hours(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get store operating hours from site_content.hours."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    return {"hours": sc.get("hours", [])}


@router.put("/store-hours")
async def update_store_hours(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update store operating hours in site_content.hours."""
    hours = body.get("hours", [])
    # Validate format: [{day: "...", time: "..."}, ...]
    cleaned = [{"day": h.get("day", "").strip(), "time": h.get("time", "").strip()} for h in hours if h.get("day") and h.get("time")]

    with get_db() as conn:
        cur = get_cursor(conn)
        import json
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = COALESCE(site_content, '{}'::jsonb) || jsonb_build_object('hours', %s::jsonb)
            WHERE laundry_id = %s
        """, (json.dumps(cleaned), laundryId))

    return {"status": "success", "message": "Store hours updated", "hours": cleaned}


# ── Trust Badges (storefront hero badges) ─────────────────────────────────────

@router.get("/trust-badges")
async def get_trust_badges(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get the storefront trust badges from site_content.trustBadges."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    return {"trustBadges": sc.get("trustBadges", [])}


@router.put("/trust-badges")
async def update_trust_badges(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update the storefront trust badges in site_content.trustBadges.

    Accepts a list of short strings. Blank entries are dropped and each badge
    is capped to a reasonable length. Empty list is allowed (hides badges).
    """
    badges = body.get("trustBadges", [])
    if not isinstance(badges, list):
        return {"status": "error", "message": "trustBadges must be a list"}
    # Clean: trim, drop blanks, cap length and count (hero cycles 3 icons)
    cleaned = [str(b).strip()[:40] for b in badges if str(b).strip()][:6]

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = jsonb_set(
                COALESCE(site_content, '{}'::jsonb),
                '{trustBadges}',
                %s::jsonb
            )
            WHERE laundry_id = %s
        """, (json.dumps(cleaned), laundryId))

    return {"status": "success", "message": "Trust badges updated", "trustBadges": cleaned}


# ── Hero Content (storefront headline / subheadline) ──────────────────────────

@router.get("/hero-content")
async def get_hero_content(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get the storefront hero headline/subheadline from site_content."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    return {
        "headline": sc.get("headline", ""),
        "subheadline": sc.get("subheadline", ""),
    }


@router.put("/hero-content")
async def update_hero_content(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update the storefront hero headline/subheadline in site_content.

    headline may contain a single <span>...</span> accent (rendered highlighted
    on the site). Both fields are trimmed and length-capped. Empty values fall
    back to the site's defaults on render.
    """
    headline = str(body.get("headline", "")).strip()[:120]
    subheadline = str(body.get("subheadline", "")).strip()[:240]

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = COALESCE(site_content, '{}'::jsonb)
                || jsonb_build_object('headline', %s::text, 'subheadline', %s::text)
            WHERE laundry_id = %s
        """, (headline, subheadline, laundryId))

    return {"status": "success", "message": "Hero content updated",
            "headline": headline, "subheadline": subheadline}


# ── Site Section Visibility (which marketing sections show on the public site) ──

# The public storefront hides a section when the corresponding flag is TRUE.
# Absent flag => section shows (today's default behavior).
#
# Section flags hide whole page sections; nav flags hide individual navbar
# links. All are stored in site_content and default to FALSE (visible), so
# existing tenants are unaffected until they opt in.
_SECTION_FLAGS = (
    "hideHowItWorks", "hidePricing", "hideLocation", "hideAbout",
    "hideNavServices",     # hide the "Services" item in the public navbar
    "hideNavStaffLinks",   # hide the Admin + Driver shortcuts from public nav
    "hidePickupOnlyCopy",  # pickup/delivery-only: hide storefront-specific copy
                           # (the hero "Visit Our Location" button)
)


@router.get("/site-sections")
async def get_site_sections(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get storefront section visibility flags from site_content."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    return {flag: bool(sc.get(flag, False)) for flag in _SECTION_FLAGS}


@router.put("/site-sections")
async def update_site_sections(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update storefront section visibility flags in site_content.

    Only the four known section flags are accepted; each coerced to a boolean.
    A TRUE flag hides that section on the public site.
    """
    payload = {flag: bool(body.get(flag, False)) for flag in _SECTION_FLAGS}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = COALESCE(site_content, '{}'::jsonb) || %s::jsonb
            WHERE laundry_id = %s
        """, (json.dumps(payload), laundryId))

    return {"status": "success", "message": "Site sections updated", **payload}


# Allowed theme colors — must match the customer site's themeColors map
# (SiteHero.jsx) and the onboarding picker (OnboardingPage.jsx).
_THEME_COLORS = ("blue", "green", "purple", "teal", "orange", "red", "pink", "cyan")


@router.get("/site-theme")
async def get_site_theme(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get the public site theme color from site_content (defaults to blue)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT site_content FROM shop.laundry_shops WHERE laundry_id = %s", (laundryId,))
        row = cur.fetchone()
    sc = row["site_content"] if row and row.get("site_content") else {}
    theme = sc.get("themeColor", "blue")
    if theme not in _THEME_COLORS:
        theme = "blue"
    return {"themeColor": theme, "options": list(_THEME_COLORS)}


@router.put("/site-theme")
async def update_site_theme(
    laundryId: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update the public site theme color in site_content.

    Only a value from the known palette is accepted; anything else is
    rejected so we never write a color the customer site can't render.
    """
    theme = (body.get("themeColor") or "").strip().lower()
    if theme not in _THEME_COLORS:
        return {"statusCode": 400, "body": {"error": f"Invalid theme color. Must be one of {list(_THEME_COLORS)}"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE shop.laundry_shops
            SET site_content = COALESCE(site_content, '{}'::jsonb) || %s::jsonb
            WHERE laundry_id = %s
        """, (json.dumps({"themeColor": theme}), laundryId))

    return {"status": "success", "message": "Theme color updated", "themeColor": theme}


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


# ── Photo Upload + Auto Status Change (Mobile Order Workflow) ─────────────────

@router.post("/photo-upload-status")
async def photo_upload_status(
    laundryId: str = Query(...),
    orderId: str = Query(...),
    targetStatus: str = Query(...),
    empId: str = Query(...),
    imageType: str = Query(...),
    body: dict = Body({}),
):
    """
    Combined photo upload + order status change endpoint for mobile order workflow.
    Uploads photo to S3, updates order status and image URL in a single transaction,
    records audit history, and fires off Claude Vision AI in parallel for intake/fold photos.

    No admin JWT auth required — protected by PIN session on frontend.

    Query params:
        laundryId: Laundry shop ID
        orderId: Order ID
        targetStatus: New order status to set
        empId: Employee ID (from PIN session)
        imageType: One of 'weight', 'processing', 'scan_received', 'fold_complete'

    Body:
        { "imageBase64": "data:image/jpeg;base64,..." }
    """
    import asyncio

    image_base64 = body.get("imageBase64", "")

    if not image_base64:
        return {"statusCode": 400, "body": {"message": "Missing imageBase64 in request body"}}

    # Validate imageType
    valid_image_types = ("weight", "processing", "scan_received", "fold_complete", "washing", "drying")
    if imageType not in valid_image_types:
        return {"statusCode": 400, "body": {"message": f"Invalid imageType. Must be one of: {', '.join(valid_image_types)}"}}

    # Map imageType to the correct DB column
    image_type_to_column = {
        "weight": "weight_image_url",
        "processing": "processing_image_url",
        "scan_received": "weight_image_url",
        "fold_complete": "fold_image_url",
        "washing": "washing_image_url",
        "drying": "drying_image_url",
    }
    db_column = image_type_to_column[imageType]

    # Upload image to S3 using existing service
    from app.services.s3_service import upload_order_image
    upload_result = upload_order_image(laundryId, orderId, image_base64, imageType)

    if upload_result["status"] != "success":
        # Fallback: store base64 directly in DB if S3 fails
        logger.warning(f"S3 upload failed for {orderId} (photo-upload-status), falling back to DB: {upload_result.get('message')}")
        if not image_base64.startswith("data:"):
            image_url = f"data:image/jpeg;base64,{image_base64}"
        else:
            image_url = image_base64
    else:
        image_url = upload_result["url"]

    # Single DB transaction: update order status, set image URL, set last_updated_by, insert audit history
    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Get current order for audit history and payment gate check
            cur.execute(
                "SELECT order_id, order_status, payment_status, order_type, customer_id, grand_total FROM orders.orders WHERE order_id = %s AND laundry_id = %s",
                (orderId, laundryId),
            )
            order_row = cur.fetchone()
            if not order_row:
                return {"statusCode": 404, "body": {"message": "Order not found"}}

            previous_status = order_row["order_status"]

            # Payment gate: block status transition for unpaid orders targeting post-processing statuses
            from app.services.payment_service import check_payment_gate
            gate_result = check_payment_gate(order_row, targetStatus, laundryId)
            if not gate_result.get("allowed"):
                return {"statusCode": 400, "body": {"message": gate_result["error"], "photoUploaded": True}}

            # If the gate auto-charged the card, update payment_status to 'Paid'
            payment_status_update = ""
            if gate_result.get("charged"):
                payment_status_update = ", payment_status = 'Paid'"

            # Update order: status, image column, last_updated_by, updated_at
            # For weight/washing/drying photos, append to existing (|||‐separated) to support multi-photo
            if db_column in ("weight_image_url", "washing_image_url", "drying_image_url"):
                # Log current value for debugging
                cur.execute(f"SELECT {db_column} FROM orders.orders WHERE order_id = %s FOR UPDATE", (orderId,))
                current_row = cur.fetchone()
                current_url = current_row[db_column] if current_row else None
                logger.info(f"[photo-upload] Appending {imageType} photo for {orderId}. Current value length: {len(current_url) if current_url else 0}, has separator: {'|||' in (current_url or '')}")

                cur.execute(f"""
                    UPDATE orders.orders
                    SET order_status = %s,
                        {db_column} = CASE
                            WHEN {db_column} IS NULL OR {db_column} = '' THEN %s
                            ELSE {db_column} || '|||' || %s
                        END,
                        last_updated_by = %s,
                        updated_at = NOW()
                        {payment_status_update}
                    WHERE order_id = %s AND laundry_id = %s
                """, (targetStatus, image_url, image_url, empId, orderId, laundryId))
            else:
                cur.execute(f"""
                    UPDATE orders.orders
                    SET order_status = %s,
                        {db_column} = %s,
                        last_updated_by = %s,
                        updated_at = NOW()
                        {payment_status_update}
                    WHERE order_id = %s AND laundry_id = %s
                """, (targetStatus, image_url, empId, orderId, laundryId))

            if cur.rowcount == 0:
                return {"statusCode": 404, "body": {"message": "Order not found or update failed"}}

            # Get employee name for audit record
            cur.execute(
                "SELECT first_name, last_name FROM shop.employees WHERE emp_id = %s AND laundry_id = %s",
                (empId, laundryId),
            )
            emp_row = cur.fetchone()
            emp_name = f"{emp_row['first_name']} {emp_row['last_name']}".strip() if emp_row else empId

            # Insert audit history record
            cur.execute("""
                INSERT INTO orders.order_history
                    (order_id, laundry_id, emp_id, emp_name, action, field_changed, old_value, new_value, change_summary, changed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (
                orderId,
                laundryId,
                empId,
                emp_name,
                "photo_upload",
                "order_status",
                previous_status,
                targetStatus,
                f"Photo uploaded ({imageType}) and status changed from {previous_status} to {targetStatus}",
            ))

    except Exception as e:
        logger.exception(f"DB transaction failed for photo-upload-status: order={orderId}")
        return {"statusCode": 500, "body": {"message": f"Database update failed: {str(e)}"}}

    # Fire off Claude Vision AI in parallel (non-blocking) for scan_received and fold_complete
    vision_pending = False
    if imageType in ("scan_received", "fold_complete"):
        vision_pending = True
        asyncio.create_task(
            _run_vision_analysis(laundryId, orderId, empId, image_base64, imageType)
        )

    # Fire off weight detection for scale photos (non-blocking)
    if imageType == "weight":
        asyncio.create_task(
            _run_weight_detection(laundryId, orderId, image_base64)
        )

    return {
        "statusCode": 200,
        "body": {
            "message": "Photo uploaded and status changed",
            "imageUrl": image_url,
            "newStatus": targetStatus,
            "visionPending": vision_pending,
        },
    }


# ── Employee Update Services (Mobile Order Workflow) ──────────────────────────

@router.post("/employee-update-services")
async def employee_update_services(
    body: dict = Body({}),
):
    """
    Update service weights/counts for an order from the mobile employee workflow.
    Reuses the service-update logic from PUT /api/admin/update-order.

    No admin JWT auth required — protected by PIN session on frontend
    (same no-auth pattern as employee-order-info).

    Body:
        {
            "servicesToUpdate": [
                { "id": 42, "serviceName": "Wash & Fold", "weightOrCount": 12.5 },
                { "id": 43, "serviceName": "Dry Clean", "weightOrCount": 3 }
            ],
            "empId": "EMP-001",
            "orderId": "IS-ABC123",
            "laundryId": "5"
        }
    """
    services_to_update = body.get("servicesToUpdate", [])
    addons_to_add = body.get("addonsToAdd", [])       # Phase 2d: [{addonId, quantity}]
    addons_to_remove = body.get("addonsToRemove", []) # Phase 2d: [order_addons.id]
    emp_id = body.get("empId", "")
    order_id = body.get("orderId", "")
    laundry_id = body.get("laundryId", "")

    if not order_id or not laundry_id or not emp_id:
        return {"statusCode": 400, "body": {"message": "Missing required fields: orderId, laundryId, empId"}}

    if not services_to_update and not addons_to_add and not addons_to_remove:
        return {"statusCode": 400, "body": {"message": "No services or add-ons to update"}}

    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Verify order exists and belongs to the specified laundry
            cur.execute("""
                SELECT o.order_id, o.coupon, o.discounted_price, o.delivery_fee,
                       ot.tip_amount, ot.tip_percentage, ot.tip_type, ot.tip_method, ot.tip_receiver_id
                FROM orders.orders o
                LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
                WHERE o.order_id = %s AND o.laundry_id = %s
            """, (order_id, laundry_id))
            current_order = cur.fetchone()
            if not current_order:
                return {"statusCode": 404, "body": {"message": "Order not found"}}

            # Get service prices from catalog
            cur.execute("""
                SELECT service_name, price, input_weight FROM shop.laundry_services
                WHERE laundry_id = %s AND is_active = TRUE
            """, (laundry_id,))
            service_catalog = {r["service_name"].strip().lower(): r for r in cur.fetchall()}

            # Process service updates (by id) — same logic as update-order endpoint
            for svc in services_to_update:
                svc_id = svc.get("id")
                if svc_id:
                    name = svc.get("serviceName") or svc.get("service", "")
                    woc = float(svc.get("weightOrCount", 0))
                    catalog_entry = service_catalog.get(name.strip().lower())
                    price = float(catalog_entry["price"]) if catalog_entry else float(svc.get("servicePrice", 0))
                    cur.execute("""
                        UPDATE orders.order_services
                        SET service_name = %s, service_price = %s, weight_or_count = %s
                        WHERE id = %s AND order_id = %s
                    """, (name, price, woc, svc_id, order_id))

            # Phase 2d: staff can add/remove processing extras mid-order. New
            # add-ons snapshot the catalog name/basis/price; removals are by row id.
            for _aid in (addons_to_remove or []):
                cur.execute("DELETE FROM orders.order_addons WHERE id = %s AND order_id = %s", (_aid, order_id))
            for _a in (addons_to_add or []):
                _addon_id = _a.get("addonId") or _a.get("addon_id")
                if not _addon_id:
                    continue
                cur.execute("""
                    SELECT addon_name, pricing_basis, unit_price FROM shop.laundry_addons
                    WHERE addon_id = %s AND laundry_id = %s AND is_active = TRUE
                """, (_addon_id, laundry_id))
                _cat = cur.fetchone()
                if not _cat:
                    continue
                if _cat["pricing_basis"] == "per_pound":
                    _qv = None
                else:
                    try:
                        _qv = float(_a.get("quantity")) if _a.get("quantity") is not None else 1.0
                    except (TypeError, ValueError):
                        _qv = 1.0
                cur.execute("""
                    INSERT INTO orders.order_addons
                        (order_id, laundry_id, addon_id, addon_name, pricing_basis, unit_price, quantity)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (order_id, laundry_id, _addon_id, _cat["addon_name"],
                      _cat["pricing_basis"], float(_cat["unit_price"] or 0), _qv))

            # Recalculate totals via the shared billing helper (Phase 2).
            cur.execute("SELECT service_price, weight_or_count, input_weight, min_billable_weight FROM orders.order_services WHERE order_id = %s", (order_id,))
            svc_rows = cur.fetchall()
            cur.execute("SELECT product_price, product_count FROM orders.order_products WHERE order_id = %s", (order_id,))
            prod_rows = cur.fetchall()
            # Tenant opt-in: floor to min billable weight / include add-ons.
            from app.services.pricing import minimum_applies
            cur.execute("SELECT min_weight_enabled, addons_enabled, min_weight_scope FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
            _shop = cur.fetchone() or {}
            cur.execute("SELECT order_type FROM orders.orders WHERE order_id = %s", (order_id,))
            _ot_row = cur.fetchone() or {}
            _apply_min = minimum_applies(
                bool(_shop.get("min_weight_enabled")),
                _shop.get("min_weight_scope"),
                _ot_row.get("order_type"),
            )
            _addon_lines = []
            if _shop.get("addons_enabled"):
                cur.execute("SELECT addon_name, pricing_basis, unit_price, quantity FROM orders.order_addons WHERE order_id = %s", (order_id,))
                _addon_lines = [{"name": r["addon_name"], "pricing_basis": r["pricing_basis"],
                                 "unit_price": r["unit_price"], "quantity": r["quantity"]} for r in cur.fetchall()]
            _billing = compute_order_billing(
                services=[{"service_price": r["service_price"], "weight_or_count": r["weight_or_count"],
                           "input_weight": r.get("input_weight"), "min_billable_weight": r.get("min_billable_weight")} for r in svc_rows],
                products=[{"product_price": r["product_price"], "product_count": r["product_count"]} for r in prod_rows],
                addons=_addon_lines,
                apply_minimums=_apply_min,
            )
            sub_total = _billing["sub_total"]
            total_cost = sub_total

            # Apply discount if coupon exists
            discounted_price = float(current_order.get("discounted_price") or 0)
            coupon_code = current_order.get("coupon")
            if coupon_code and discounted_price == 0:
                cur.execute("""
                    SELECT discount_type, discount_value, minimum_order_value
                    FROM shop.promotions WHERE laundry_id = %s AND promo_code = %s AND is_active = TRUE
                """, (laundry_id, coupon_code))
                promo = cur.fetchone()
                if promo and sub_total >= float(promo["minimum_order_value"] or 0):
                    if promo["discount_type"] == "percentage":
                        discounted_price = round(sub_total * (float(promo["discount_value"] or 0) / 100), 2)
                    else:
                        discounted_price = min(float(promo["discount_value"] or 0), sub_total)

            if discounted_price > 0:
                total_cost = round(sub_total - discounted_price, 2)

            # Tip recalculation
            tip_type = current_order["tip_type"] or "noTip"
            tip_amount = float(current_order["tip_amount"] or 0)
            if tip_type == "percentage":
                pct = float(current_order["tip_percentage"] or 0)
                tip_amount = round(sub_total * (pct / 100), 2)
                cur.execute("""
                    INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (order_id) DO UPDATE SET tip_amount = EXCLUDED.tip_amount
                """, (order_id, tip_amount, current_order["tip_percentage"], tip_type, current_order["tip_method"],
                      current_order.get("tip_receiver_id")))

            # Preserve the snapshotted delivery fee (Phase 3) across recompute.
            _delivery_fee = float(current_order.get("delivery_fee") or 0)
            grand_total = round(total_cost + tip_amount + _delivery_fee, 2)

            # Update order totals and set last_updated_by
            cur.execute("""
                UPDATE orders.orders
                SET sub_total = %s, total_cost = %s, grand_total = %s,
                    discounted_price = %s, last_updated_by = %s, updated_at = NOW()
                WHERE order_id = %s AND laundry_id = %s
            """, (sub_total, total_cost, grand_total, discounted_price, emp_id, order_id, laundry_id))

            # Get employee name for audit record
            cur.execute(
                "SELECT first_name, last_name FROM shop.employees WHERE emp_id = %s AND laundry_id = %s",
                (emp_id, laundry_id),
            )
            emp_row = cur.fetchone()
            emp_name = f"{emp_row['first_name']} {emp_row['last_name']}".strip() if emp_row else emp_id

            # Insert audit history record
            services_summary = ", ".join(
                f"{s.get('serviceName', '')}: {s.get('weightOrCount', 0)}" for s in services_to_update
            )
            cur.execute("""
                INSERT INTO orders.order_history
                    (order_id, laundry_id, emp_id, emp_name, action, field_changed, old_value, new_value, change_summary, changed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """, (
                order_id,
                laundry_id,
                emp_id,
                emp_name,
                "update_services",
                "services",
                None,
                None,
                f"Services updated: {services_summary}",
            ))

            # --- Auto-status transition for pre-facility orders ---
            # If the order is still in a pre-facility status (OrderSubmitted or ReadyForIntake),
            # weight entry implies the laundry is physically at the facility, so auto-transition
            # to ReceivedAtFacility. Do NOT transition for any later status.
            cur.execute(
                "SELECT order_status FROM orders.orders WHERE order_id = %s AND laundry_id = %s",
                (order_id, laundry_id),
            )
            status_row = cur.fetchone()
            current_status = status_row["order_status"] if status_row else None

            if current_status in ("OrderSubmitted", "ReadyForIntake"):
                cur.execute("""
                    UPDATE orders.orders
                    SET order_status = 'ReceivedAtFacility', status_category = 'Active', updated_at = NOW()
                    WHERE order_id = %s AND laundry_id = %s
                      AND order_status IN ('OrderSubmitted', 'ReadyForIntake')
                """, (order_id, laundry_id))

                # Record the auto-status transition in order history
                cur.execute("""
                    INSERT INTO orders.order_history
                        (order_id, laundry_id, emp_id, emp_name, action, field_changed, old_value, new_value, change_summary, changed_at)
                    VALUES (%s, %s, %s, %s, 'auto_status_transition', 'order_status', %s, 'ReceivedAtFacility',
                            'Auto-transitioned to ReceivedAtFacility on weight entry', NOW())
                """, (
                    order_id,
                    laundry_id,
                    emp_id,
                    emp_name,
                    current_status,
                ))

        return {
            "statusCode": 200,
            "body": {
                "message": "Services updated successfully",
                "subTotal": sub_total,
                "totalCost": total_cost,
                "grandTotal": grand_total,
            },
        }

    except Exception as e:
        logger.exception(f"employee-update-services failed: order={order_id}")
        return {"statusCode": 500, "body": {"message": f"Update failed: {str(e)}"}}


@router.post("/order-bags")
async def upsert_order_bags(
    body: dict = Body({}),
):
    """
    Save per-bag weights for an order (scale-integration-bag-tags spec).

    No admin JWT auth required — protected by PIN session on frontend
    (same no-auth pattern as employee-update-services).

    This stores the per-bag detail only. The order-level weight that drives
    totals is written separately via employee-update-services as the sum of the
    bag weights. weight may be null for a bag that was tagged but not weighed.

    Body:
        {
            "orderId": "IS-ABC123",
            "laundryId": "5",
            "empId": "EMP-001",
            "bags": [
                { "bagNumber": 1, "weight": 12.5 },
                { "bagNumber": 2, "weight": null }
            ]
        }
    """
    order_id = body.get("orderId", "")
    laundry_id = body.get("laundryId", "")
    emp_id = body.get("empId", "")
    bags = body.get("bags", [])

    if not order_id or not laundry_id or not emp_id:
        return {"statusCode": 400, "body": {"message": "Missing required fields: orderId, laundryId, empId"}}

    if not isinstance(bags, list) or not bags:
        return {"statusCode": 400, "body": {"message": "No bags to update"}}

    try:
        with get_db() as conn:
            cur = get_cursor(conn)

            # Verify the order exists and belongs to this laundry (tenant scoping)
            cur.execute(
                "SELECT order_id FROM orders.orders WHERE order_id = %s AND laundry_id = %s",
                (order_id, laundry_id),
            )
            if not cur.fetchone():
                return {"statusCode": 404, "body": {"message": "Order not found"}}

            for bag in bags:
                bag_number = bag.get("bagNumber")
                if bag_number is None:
                    continue
                raw_weight = bag.get("weight")
                weight = None
                if raw_weight is not None and raw_weight != "":
                    try:
                        weight = float(raw_weight)
                    except (TypeError, ValueError):
                        weight = None
                # Idempotent upsert — re-weighing a bag updates rather than duplicates
                cur.execute("""
                    INSERT INTO orders.order_bags (order_id, laundry_id, bag_number, weight)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (order_id, laundry_id, bag_number)
                    DO UPDATE SET weight = EXCLUDED.weight
                """, (order_id, laundry_id, int(bag_number), weight))

            # Return the current stored bags
            cur.execute("""
                SELECT bag_number, weight
                FROM orders.order_bags
                WHERE order_id = %s AND laundry_id = %s
                ORDER BY bag_number ASC
            """, (order_id, laundry_id))
            stored = [
                {"bagNumber": r["bag_number"], "weight": float(r["weight"]) if r["weight"] is not None else None}
                for r in cur.fetchall()
            ]

        return {"statusCode": 200, "body": {"message": "Bags updated successfully", "bags": stored}}

    except Exception as e:
        logger.exception(f"order-bags upsert failed: order={order_id}")
        return {"statusCode": 500, "body": {"message": f"Update failed: {str(e)}"}}


@router.get("/order-bags")
async def get_order_bags(
    orderId: str = Query(...),
    laundryId: str = Query(...),
):
    """
    Return the stored per-bag weights for an order (bag_number ascending).

    Used to display "Bag N = X lb" and to feed bagWeights into the bag-tag
    print template on reprint. laundry_id-scoped.
    """
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT bag_number, weight
                FROM orders.order_bags
                WHERE order_id = %s AND laundry_id = %s
                ORDER BY bag_number ASC
            """, (orderId, laundryId))
            bags = [
                {"bagNumber": r["bag_number"], "weight": float(r["weight"]) if r["weight"] is not None else None}
                for r in cur.fetchall()
            ]
        return {"statusCode": 200, "body": {"orderId": orderId, "bags": bags}}

    except Exception as e:
        logger.exception(f"order-bags fetch failed: order={orderId}")
        return {"statusCode": 500, "body": {"message": f"Fetch failed: {str(e)}"}}


async def _run_weight_detection(laundry_id: str, order_id: str, image_base64: str):
    """
    Background task: call Claude Vision to detect weight from a scale photo.
    Stores the detected weight in the order's service weight field.
    """
    try:
        import base64
        import json
        import anthropic
        from app.config import settings
        from app.services.vision_service import build_weight_detection_prompt, _resize_image

        if not settings.anthropic_api_key:
            logger.warning(f"[weight-detect] No Anthropic API key, skipping weight detection for {order_id}")
            return

        # Strip data URL prefix
        img_data = image_base64
        if "," in img_data and img_data.startswith("data:"):
            img_data = img_data.split(",", 1)[1]

        image_bytes = base64.b64decode(img_data)
        media_type = "image/jpeg"
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            media_type = "image/png"

        # Resize
        image_bytes = _resize_image(image_bytes, media_type, max_dimension=1024)
        img_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        weight_prompt = build_weight_detection_prompt()

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=weight_prompt,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_b64}},
                    {"type": "text", "text": "Please read the weight displayed on the scale in this photo."},
                ],
            }],
        )

        response_text = response.content[0].text if response.content else ""
        logger.info(f"[weight-detect] order={order_id} response: {response_text[:200]}")

        # Parse weight from response
        import re
        text = response_text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
            if text.endswith("```"):
                text = text[:-3].strip()
        if not text.startswith("{"):
            json_match = re.search(r'\{[^{}]*"weight"[^{}]*\}', text)
            if json_match:
                text = json_match.group()
            else:
                logger.warning(f"[weight-detect] No JSON in response for {order_id}")
                return

        result = json.loads(text)
        weight = result.get("weight")
        if weight is not None:
            weight = float(weight)
            logger.info(f"[weight-detect] Detected weight {weight} for order {order_id}")
            # Update order service weight
            with get_db() as conn:
                cur = get_cursor(conn)
                cur.execute("""
                    UPDATE orders.order_services
                    SET weight_or_count = %s
                    WHERE order_id = %s AND weight_or_count <= 1
                """, (weight, order_id))
                if cur.rowcount > 0:
                    logger.info(f"[weight-detect] Updated service weight for {order_id} to {weight}")

    except Exception as e:
        logger.exception(f"[weight-detect] Failed for order {order_id}: {e}")


async def _run_vision_analysis(
    laundry_id: str,
    order_id: str,
    employee_id: str,
    image_base64: str,
    image_type: str,
):
    """
    Run Claude Vision AI analysis on the uploaded photo in the background.
    Stores results in the appropriate tracking records table.

    For scan_received: stores in tracking.intake_records (phase = intake)
    For fold_complete: stores in tracking.fold_records (phase = fold)
    """
    import base64
    from datetime import datetime, timezone

    phase = "intake" if image_type == "scan_received" else "fold"

    try:
        # Decode the image for vision processing
        img_data = image_base64
        if "," in img_data and img_data.startswith("data:"):
            img_data = img_data.split(",", 1)[1]

        try:
            image_bytes = base64.b64decode(img_data)
        except Exception:
            logger.error(f"[photo-upload-vision] Base64 decode failed: order={order_id}")
            return

        # Detect content type
        content_type = "image/jpeg"
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            content_type = "image/png"

        image_data = [(image_bytes, content_type)]

        # Get active categories for this laundry
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                "SELECT name FROM tracking.item_categories WHERE laundry_id = %s AND is_active = TRUE ORDER BY display_order",
                (laundry_id,),
            )
            category_rows = cur.fetchall()

        categories = [row["name"] for row in category_rows]
        if not categories:
            from app.migrations.add_item_tracking import DEFAULT_CATEGORIES
            categories = DEFAULT_CATEGORIES

        # Call Claude Vision
        from app.services.vision_service import analyze_photos, flag_low_confidence, VisionServiceError
        vision_result = await analyze_photos(
            image_urls=[],  # Not needed when image_data is provided
            categories=categories,
            phase=phase,
            image_data=image_data,
        )

        # Flag low-confidence items
        flagged_items = flag_low_confidence(vision_result.items)

        # Store results in appropriate tracking table
        now = datetime.now(timezone.utc)

        with get_db() as conn:
            cur = get_cursor(conn)

            if phase == "intake":
                # Upsert into tracking.intake_records
                cur.execute(
                    "SELECT record_id FROM tracking.intake_records WHERE order_id = %s AND laundry_id = %s",
                    (order_id, laundry_id),
                )
                existing = cur.fetchone()

                items_for_db = [{"category": item["category"], "count": item["count"]} for item in flagged_items]

                if existing:
                    # Update existing record with vision results
                    cur.execute("""
                        UPDATE tracking.intake_records
                        SET items = %s::jsonb, employee_id = %s, status = 'ai_detected', confirmed_at = %s
                        WHERE order_id = %s AND laundry_id = %s
                    """, (json.dumps(items_for_db), employee_id, now, order_id, laundry_id))
                else:
                    # Insert new intake record
                    cur.execute("""
                        INSERT INTO tracking.intake_records
                            (order_id, laundry_id, employee_id, items, photo_urls, status, confirmed_at)
                        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, 'ai_detected', %s)
                    """, (order_id, laundry_id, employee_id, json.dumps(items_for_db), json.dumps([]), now))

            else:
                # Upsert into tracking.fold_records
                cur.execute(
                    "SELECT record_id FROM tracking.fold_records WHERE order_id = %s AND laundry_id = %s",
                    (order_id, laundry_id),
                )
                existing = cur.fetchone()

                items_for_db = [{"category": item["category"], "count": item["count"]} for item in flagged_items]

                if existing:
                    cur.execute("""
                        UPDATE tracking.fold_records
                        SET items = %s::jsonb, employee_id = %s, status = 'ai_detected', confirmed_at = %s
                        WHERE order_id = %s AND laundry_id = %s
                    """, (json.dumps(items_for_db), employee_id, now, order_id, laundry_id))
                else:
                    cur.execute("""
                        INSERT INTO tracking.fold_records
                            (order_id, laundry_id, employee_id, items, photo_urls, discrepancies, acknowledgements, status, confirmed_at)
                        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, '[]'::jsonb, '[]'::jsonb, 'ai_detected', %s)
                    """, (order_id, laundry_id, employee_id, json.dumps(items_for_db), json.dumps([]), now))

        logger.info(f"[photo-upload-vision] Vision analysis complete: order={order_id} phase={phase} items={len(flagged_items)}")

    except Exception as e:
        logger.error(f"[photo-upload-vision] Vision analysis failed for order={order_id} phase={phase}: {e}")


@router.get("/customer-commercial")
async def get_customer_commercial(
    customerId: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get commercial account fields (billing_email, is_commercial) for a customer."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT c.billing_email, c.is_commercial
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.customer_id = %s
        """, (laundryId, customerId))
        row = cur.fetchone()
        if not row:
            return {"statusCode": 404, "body": {"message": "Customer not found"}}
        return {"statusCode": 200, "body": {
            "billingEmail": row["billing_email"],
            "isCommercial": row["is_commercial"],
        }}


@router.patch("/customer-commercial")
async def update_customer_commercial(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update commercial account fields (billing_email, is_commercial) for a customer."""
    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId")

    if not customer_id or not laundry_id:
        return {"statusCode": 400, "body": {"message": "Missing customerId or laundryId"}}

    # Determine which fields to update
    update_fields = []
    update_values = []

    # Handle billingEmail — only update if key is present in body
    if "billingEmail" in body:
        billing_email = body["billingEmail"]
        if billing_email is None or (isinstance(billing_email, str) and billing_email.strip() == ""):
            # Explicitly clear billing email
            update_fields.append("billing_email = NULL")
        else:
            # Validate email format
            if not is_valid_email(billing_email):
                return {"statusCode": 400, "body": {"message": "Invalid billing email format"}}
            update_fields.append("billing_email = %s")
            update_values.append(billing_email.strip())

    # Handle isCommercial — only update if key is present in body
    if "isCommercial" in body:
        is_commercial = body["isCommercial"]
        update_fields.append("is_commercial = %s")
        update_values.append(bool(is_commercial))

    if not update_fields:
        return {"statusCode": 400, "body": {"message": "No fields to update"}}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify customer exists (same pattern as GET endpoint with JOIN to customer_laundry_stats)
        cur.execute("""
            SELECT c.customer_id
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.customer_id = %s
        """, (laundry_id, customer_id))
        row = cur.fetchone()
        if not row:
            return {"statusCode": 404, "body": {"message": "Customer not found"}}

        # Build and execute dynamic UPDATE
        set_clause = ", ".join(update_fields)
        update_values.append(customer_id)
        cur.execute(
            f"UPDATE shop.customers SET {set_clause} WHERE customer_id = %s",
            tuple(update_values)
        )

    return {"statusCode": 200, "body": {"message": "Customer commercial settings updated successfully"}}


@router.patch("/frequency-commercial")
async def update_frequency_commercial(
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """Update is_commercial flag on a frequency record."""
    frequency_id = body.get("frequencyId")
    laundry_id = body.get("laundryId")
    is_commercial = body.get("isCommercial")

    if not frequency_id or not laundry_id:
        return {"statusCode": 400, "body": {"message": "Missing frequencyId or laundryId"}}

    if is_commercial is None:
        return {"statusCode": 400, "body": {"message": "Missing isCommercial"}}

    with get_db() as conn:
        cur = get_cursor(conn)

        # Verify frequency record exists
        cur.execute("""
            SELECT frequency_id
            FROM orders.laundry_frequency
            WHERE frequency_id = %s AND laundry_id = %s
        """, (frequency_id, laundry_id))
        row = cur.fetchone()
        if not row:
            return {"statusCode": 404, "body": {"message": "Frequency record not found"}}

        # Update is_commercial flag
        cur.execute("""
            UPDATE orders.laundry_frequency
            SET is_commercial = %s, updated_at = NOW()
            WHERE frequency_id = %s AND laundry_id = %s
        """, (bool(is_commercial), frequency_id, laundry_id))

    return {"statusCode": 200, "body": {"message": "Frequency commercial status updated successfully"}}
