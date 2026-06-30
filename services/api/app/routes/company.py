"""
Company routes — aggregated dashboard, reports, and location management
for multi-location company admins.

All endpoints require a valid company_admin JWT.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from app.auth import get_current_user
from app.database import get_db, get_cursor

import logging

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_company_admin(current_user: dict = Depends(get_current_user)):
    """
    Dependency that validates the current user is a company_admin.
    Reuses get_current_user for JWT validation, then checks the role claim.
    Returns the full user payload (includes company_id, laundry_ids, etc.).
    """
    if current_user.get("role") != "company_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company admin access required",
        )
    return current_user


@router.get("/dashboard")
async def get_company_dashboard(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    admin: dict = Depends(get_company_admin),
):
    """
    Aggregated dashboard metrics across all company locations.
    Returns combined total revenue, total order count, and per-location breakdown.
    Excludes orders with status OrderCanceled.
    """
    laundry_ids = admin.get("laundry_ids", [])

    # Handle empty laundry_ids — return zero totals
    if not laundry_ids:
        return {
            "status": "success",
            "data": {
                "totalRevenue": 0.0,
                "totalOrders": 0,
                "locations": [],
                "dateRange": {
                    "start": start_date or "",
                    "end": end_date or "",
                },
            },
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Build date filter clause
        date_filter = ""
        date_params: list = []
        if start_date:
            date_filter += " AND o.created_at >= %s"
            date_params.append(start_date)
        if end_date:
            date_filter += " AND o.created_at < (%s::date + INTERVAL '1 day')"
            date_params.append(end_date)

        # Per-location revenue and order count (excluding canceled)
        cur.execute(f"""
            SELECT
                o.laundry_id,
                ls.laundry_name,
                COALESCE(SUM(o.grand_total), 0) AS revenue,
                COUNT(*) AS order_count
            FROM orders.orders o
            JOIN shop.laundry_shops ls ON ls.laundry_id = o.laundry_id
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              {date_filter}
            GROUP BY o.laundry_id, ls.laundry_name
        """, (ids_tuple, *date_params))
        location_rows = cur.fetchall()

        # Active orders per location (status_category = 'Active')
        cur.execute("""
            SELECT laundry_id, COUNT(*) AS active_count
            FROM orders.orders
            WHERE laundry_id IN %s AND status_category = 'Active'
            GROUP BY laundry_id
        """, (ids_tuple,))
        active_map = {r["laundry_id"]: r["active_count"] for r in cur.fetchall()}

        # Get all locations (even those with no orders)
        cur.execute("""
            SELECT laundry_id, laundry_name
            FROM shop.laundry_shops
            WHERE laundry_id IN %s
            ORDER BY laundry_name
        """, (ids_tuple,))
        all_locations = cur.fetchall()

        # Build location map from revenue query
        rev_map = {
            str(r["laundry_id"]): {
                "revenue": float(r["revenue"] or 0),
                "orderCount": int(r["order_count"] or 0),
            }
            for r in location_rows
        }

        total_revenue = 0.0
        total_orders = 0
        locations = []

        for loc in all_locations:
            lid = str(loc["laundry_id"])
            rev_data = rev_map.get(lid, {"revenue": 0.0, "orderCount": 0})
            revenue = round(rev_data["revenue"], 2)
            order_count = rev_data["orderCount"]
            active_orders = active_map.get(loc["laundry_id"], 0)

            total_revenue += revenue
            total_orders += order_count

            locations.append({
                "laundryId": lid,
                "laundryName": loc["laundry_name"],
                "revenue": revenue,
                "orderCount": order_count,
                "activeOrders": active_orders,
            })

        return {
            "status": "success",
            "data": {
                "totalRevenue": round(total_revenue, 2),
                "totalOrders": total_orders,
                "locations": locations,
                "dateRange": {
                    "start": start_date or "",
                    "end": end_date or "",
                },
            },
        }


@router.get("/locations")
async def get_company_locations(
    admin: dict = Depends(get_company_admin),
):
    """
    List all laundry_shops for the company with name and active order count.
    """
    laundry_ids = admin.get("laundry_ids", [])

    if not laundry_ids:
        return {
            "status": "success",
            "data": {"locations": []},
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Get all locations with active order counts
        cur.execute("""
            SELECT
                ls.laundry_id,
                ls.laundry_name,
                COALESCE(active.cnt, 0) AS active_orders
            FROM shop.laundry_shops ls
            LEFT JOIN (
                SELECT laundry_id, COUNT(*) AS cnt
                FROM orders.orders
                WHERE status_category = 'Active'
                GROUP BY laundry_id
            ) active ON active.laundry_id = ls.laundry_id
            WHERE ls.laundry_id IN %s
            ORDER BY ls.laundry_name
        """, (ids_tuple,))
        rows = cur.fetchall()

        locations = [
            {
                "laundryId": str(r["laundry_id"]),
                "laundryName": r["laundry_name"],
                "activeOrders": int(r["active_orders"]),
            }
            for r in rows
        ]

        return {
            "status": "success",
            "data": {"locations": locations},
        }


@router.get("/reports/revenue")
async def get_company_revenue_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    admin: dict = Depends(get_company_admin),
):
    """
    Aggregated revenue report with per-location breakdown.
    Returns revenue, order count, and average order value per location.
    """
    laundry_ids = admin.get("laundry_ids", [])

    if not laundry_ids:
        return {
            "status": "success",
            "data": {
                "totalRevenue": 0.0,
                "totalOrders": 0,
                "averageOrderValue": 0.0,
                "locations": [],
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Build date filter
        date_filter = ""
        date_params: list = []
        if start_date:
            date_filter += " AND o.created_at >= %s"
            date_params.append(start_date)
        if end_date:
            date_filter += " AND o.created_at < (%s::date + INTERVAL '1 day')"
            date_params.append(end_date)

        # Per-location revenue breakdown
        cur.execute(f"""
            SELECT
                o.laundry_id,
                ls.laundry_name,
                COALESCE(SUM(o.grand_total), 0) AS revenue,
                COUNT(*) AS order_count
            FROM orders.orders o
            JOIN shop.laundry_shops ls ON ls.laundry_id = o.laundry_id
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              {date_filter}
            GROUP BY o.laundry_id, ls.laundry_name
        """, (ids_tuple, *date_params))
        location_rows = cur.fetchall()

        # Also get all company locations (some may have zero orders)
        cur.execute("""
            SELECT laundry_id, laundry_name
            FROM shop.laundry_shops
            WHERE laundry_id IN %s
            ORDER BY laundry_name
        """, (ids_tuple,))
        all_locations = cur.fetchall()

        rev_map = {
            str(r["laundry_id"]): {
                "laundryName": r["laundry_name"],
                "revenue": float(r["revenue"] or 0),
                "orderCount": int(r["order_count"] or 0),
            }
            for r in location_rows
        }

        total_revenue = 0.0
        total_orders = 0
        locations = []

        for loc in all_locations:
            lid = str(loc["laundry_id"])
            data = rev_map.get(lid, {"laundryName": loc["laundry_name"], "revenue": 0.0, "orderCount": 0})
            revenue = round(data["revenue"], 2)
            order_count = data["orderCount"]
            avg_value = round(revenue / order_count, 2) if order_count > 0 else 0.0

            total_revenue += revenue
            total_orders += order_count

            locations.append({
                "laundryId": lid,
                "laundryName": data["laundryName"] if "laundryName" in data else loc["laundry_name"],
                "revenue": revenue,
                "orderCount": order_count,
                "averageOrderValue": avg_value,
            })

        overall_avg = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0

        return {
            "status": "success",
            "data": {
                "totalRevenue": round(total_revenue, 2),
                "totalOrders": total_orders,
                "averageOrderValue": overall_avg,
                "locations": locations,
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }


@router.get("/reports/tips")
async def get_company_tips_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    admin: dict = Depends(get_company_admin),
):
    """
    Aggregate tip totals across all locations grouped by employee.
    """
    laundry_ids = admin.get("laundry_ids", [])

    if not laundry_ids:
        return {
            "status": "success",
            "data": {
                "totalTips": 0.0,
                "tipsByEmployee": [],
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Build date filter
        date_filter = ""
        date_params: list = []
        if start_date:
            date_filter += " AND o.created_at >= %s"
            date_params.append(start_date)
        if end_date:
            date_filter += " AND o.created_at < (%s::date + INTERVAL '1 day')"
            date_params.append(end_date)

        # Get all orders with tips
        cur.execute(f"""
            SELECT o.tip, o.laundry_id
            FROM orders.orders o
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              AND o.tip IS NOT NULL
              {date_filter}
        """, (ids_tuple, *date_params))
        rows = cur.fetchall()

        total_tips = 0.0
        tips_by_employee: dict = {}

        for row in rows:
            tip_data = row["tip"]
            if not tip_data or not isinstance(tip_data, dict):
                continue

            tip_amount = float(tip_data.get("tipAmount", 0) or 0)
            if tip_amount <= 0:
                continue

            total_tips += tip_amount
            tip_receiver_id = tip_data.get("tipReceiverId") or tip_data.get("tip_receiver_id")

            if tip_receiver_id:
                if tip_receiver_id not in tips_by_employee:
                    tips_by_employee[tip_receiver_id] = {
                        "empId": tip_receiver_id,
                        "tipsEarned": 0.0,
                        "orderCount": 0,
                        "laundryId": str(row["laundry_id"]),
                    }
                tips_by_employee[tip_receiver_id]["tipsEarned"] += tip_amount
                tips_by_employee[tip_receiver_id]["orderCount"] += 1

        # Fetch employee names
        emp_ids = list(tips_by_employee.keys())
        if emp_ids:
            placeholders = ",".join(["%s"] * len(emp_ids))
            cur.execute(f"""
                SELECT emp_id, first_name, last_name, laundry_id
                FROM shop.employees
                WHERE emp_id IN ({placeholders})
            """, emp_ids)
            emp_rows = cur.fetchall()
            emp_info_map = {
                r["emp_id"]: {
                    "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
                    "laundryId": str(r["laundry_id"]),
                }
                for r in emp_rows
            }
        else:
            emp_info_map = {}

        tips_list = []
        for emp_id, data in tips_by_employee.items():
            emp_info = emp_info_map.get(emp_id, {})
            tips_list.append({
                "employeeId": emp_id,
                "name": emp_info.get("name", "Unknown"),
                "laundryId": emp_info.get("laundryId", data["laundryId"]),
                "tipsEarned": round(data["tipsEarned"], 2),
                "orderCount": data["orderCount"],
            })

        # Sort by tips earned descending
        tips_list.sort(key=lambda x: x["tipsEarned"], reverse=True)

        return {
            "status": "success",
            "data": {
                "totalTips": round(total_tips, 2),
                "tipsByEmployee": tips_list,
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }


@router.get("/reports/sales-tax")
async def get_company_sales_tax_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    admin: dict = Depends(get_company_admin),
):
    """
    Return taxable receipts and tax collected per location + combined total.
    """
    laundry_ids = admin.get("laundry_ids", [])

    if not laundry_ids:
        return {
            "status": "success",
            "data": {
                "totalGrossSales": 0.0,
                "totalTaxableAmount": 0.0,
                "totalTaxCollected": 0.0,
                "locations": [],
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Build date filter
        date_filter = ""
        date_params: list = []
        if start_date:
            date_filter += " AND o.created_at >= %s"
            date_params.append(start_date)
        if end_date:
            date_filter += " AND o.created_at < (%s::date + INTERVAL '1 day')"
            date_params.append(end_date)

        # Get per-location gross sales
        cur.execute(f"""
            SELECT
                o.laundry_id,
                ls.laundry_name,
                ls.tax_rate,
                COALESCE(SUM(o.grand_total), 0) AS gross_sales,
                COUNT(*) AS order_count
            FROM orders.orders o
            JOIN shop.laundry_shops ls ON ls.laundry_id = o.laundry_id
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              {date_filter}
            GROUP BY o.laundry_id, ls.laundry_name, ls.tax_rate
        """, (ids_tuple, *date_params))
        location_rows = cur.fetchall()

        # Get all locations (even those with no orders)
        cur.execute("""
            SELECT laundry_id, laundry_name, tax_rate
            FROM shop.laundry_shops
            WHERE laundry_id IN %s
            ORDER BY laundry_name
        """, (ids_tuple,))
        all_locations = cur.fetchall()

        sales_map = {
            str(r["laundry_id"]): {
                "laundryName": r["laundry_name"],
                "taxRate": float(r["tax_rate"] or 0),
                "grossSales": float(r["gross_sales"] or 0),
                "orderCount": int(r["order_count"] or 0),
            }
            for r in location_rows
        }

        total_gross = 0.0
        total_taxable = 0.0
        total_tax = 0.0
        locations = []

        for loc in all_locations:
            lid = str(loc["laundry_id"])
            data = sales_map.get(lid, {
                "laundryName": loc["laundry_name"],
                "taxRate": float(loc["tax_rate"] or 0),
                "grossSales": 0.0,
                "orderCount": 0,
            })

            gross_sales = round(data["grossSales"], 2)
            tax_rate = data["taxRate"]

            if tax_rate > 0:
                taxable_amount = round(gross_sales / (1 + tax_rate), 2)
                tax_collected = round(gross_sales - taxable_amount, 2)
            else:
                taxable_amount = gross_sales
                tax_collected = 0.0

            total_gross += gross_sales
            total_taxable += taxable_amount
            total_tax += tax_collected

            locations.append({
                "laundryId": lid,
                "laundryName": data["laundryName"],
                "grossSales": gross_sales,
                "taxableAmount": taxable_amount,
                "taxCollected": tax_collected,
                "taxRate": tax_rate,
                "orderCount": data["orderCount"],
            })

        return {
            "status": "success",
            "data": {
                "totalGrossSales": round(total_gross, 2),
                "totalTaxableAmount": round(total_taxable, 2),
                "totalTaxCollected": round(total_tax, 2),
                "locations": locations,
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }


@router.get("/reports/performance")
async def get_company_performance_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    admin: dict = Depends(get_company_admin),
):
    """
    Per-location: average processing time, employee count.
    Cross-location: ranked list of top employees by orders completed (sorted descending).
    """
    laundry_ids = admin.get("laundry_ids", [])

    if not laundry_ids:
        return {
            "status": "success",
            "data": {
                "locations": [],
                "topEmployees": [],
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }

    with get_db() as conn:
        cur = get_cursor(conn)
        ids_tuple = tuple(str(lid) for lid in laundry_ids)

        # Build date filter
        date_filter = ""
        date_params: list = []
        if start_date:
            date_filter += " AND o.created_at >= %s"
            date_params.append(start_date)
        if end_date:
            date_filter += " AND o.created_at < (%s::date + INTERVAL '1 day')"
            date_params.append(end_date)

        # Per-location: average processing time (time from created_at to updated_at for completed orders)
        cur.execute(f"""
            SELECT
                o.laundry_id,
                ls.laundry_name,
                AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 3600) AS avg_processing_hours
            FROM orders.orders o
            JOIN shop.laundry_shops ls ON ls.laundry_id = o.laundry_id
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              AND o.status_category = 'Completed'
              {date_filter}
            GROUP BY o.laundry_id, ls.laundry_name
        """, (ids_tuple, *date_params))
        processing_rows = cur.fetchall()
        processing_map = {
            str(r["laundry_id"]): round(float(r["avg_processing_hours"] or 0), 2)
            for r in processing_rows
        }

        # Per-location: employee count
        cur.execute("""
            SELECT laundry_id, COUNT(*) AS emp_count
            FROM shop.employees
            WHERE laundry_id IN %s AND is_active = TRUE
            GROUP BY laundry_id
        """, (ids_tuple,))
        emp_count_map = {
            str(r["laundry_id"]): int(r["emp_count"])
            for r in cur.fetchall()
        }

        # Get all locations
        cur.execute("""
            SELECT laundry_id, laundry_name
            FROM shop.laundry_shops
            WHERE laundry_id IN %s
            ORDER BY laundry_name
        """, (ids_tuple,))
        all_locations = cur.fetchall()

        locations = []
        for loc in all_locations:
            lid = str(loc["laundry_id"])
            locations.append({
                "laundryId": lid,
                "laundryName": loc["laundry_name"],
                "avgProcessingTimeHours": processing_map.get(lid, 0.0),
                "employeeCount": emp_count_map.get(lid, 0),
            })

        # Cross-location: top employees by orders completed
        cur.execute(f"""
            SELECT
                o.last_updated_by AS emp_id,
                e.first_name,
                e.last_name,
                e.laundry_id,
                ls.laundry_name,
                COUNT(*) AS orders_completed
            FROM orders.orders o
            JOIN shop.employees e ON e.emp_id = o.last_updated_by
            JOIN shop.laundry_shops ls ON ls.laundry_id = e.laundry_id
            WHERE o.laundry_id IN %s
              AND o.order_status != 'OrderCanceled'
              AND o.last_updated_by IS NOT NULL
              AND o.last_updated_by != ''
              {date_filter}
            GROUP BY o.last_updated_by, e.first_name, e.last_name, e.laundry_id, ls.laundry_name
            ORDER BY orders_completed DESC
        """, (ids_tuple, *date_params))
        emp_rows = cur.fetchall()

        top_employees = [
            {
                "employeeId": r["emp_id"],
                "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
                "laundryId": str(r["laundry_id"]),
                "laundryName": r["laundry_name"],
                "ordersCompleted": int(r["orders_completed"]),
            }
            for r in emp_rows
        ]

        return {
            "status": "success",
            "data": {
                "locations": locations,
                "topEmployees": top_employees,
                "periodLabel": f"{start_date or ''} to {end_date or ''}",
            },
        }
