"""
Financial Reports endpoints — sales tax, tips, revenue, comptroller reports.
"""
from fastapi import APIRouter, Depends, Query
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
print("[REPORTS MODULE] Reports router loaded with routes:", [r.path for r in router.routes] if hasattr(router, 'routes') else "none yet")


@router.get("/sales-tax")
async def get_sales_tax_report(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Sales tax report for a date range."""
    logger.info(f"[REPORTS] sales-tax called: laundryId={laundryId}, startDate={startDate}, endDate={endDate}")
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get tax rate from laundry_shops
        cur.execute(
            "SELECT tax_rate FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundryId,)
        )
        shop_row = cur.fetchone()
        tax_rate = float(shop_row["tax_rate"] or 0) if shop_row else 0

        # Sum orders in date range (exclude canceled)
        cur.execute("""
            SELECT
                COALESCE(SUM(grand_total), 0) AS gross_sales,
                COUNT(*) AS order_count
            FROM orders.orders
            WHERE laundry_id = %s
              AND created_at >= %s
              AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        row = cur.fetchone()

        gross_sales = float(row["gross_sales"] or 0)
        order_count = int(row["order_count"] or 0)
        logger.info(f"[REPORTS] sales-tax result: gross_sales={gross_sales}, order_count={order_count}, tax_rate={tax_rate}")

        # Calculate taxable amount and tax collected
        # taxable_amount = gross_sales / (1 + tax_rate) if tax is included
        # tax_collected = gross_sales - taxable_amount
        if tax_rate > 0:
            taxable_amount = round(gross_sales / (1 + tax_rate), 2)
            tax_collected = round(gross_sales - taxable_amount, 2)
        else:
            taxable_amount = gross_sales
            tax_collected = 0.0

        period_label = f"{startDate} to {endDate}"

        return {
            "status": "success",
            "data": {
                "grossSales": round(gross_sales, 2),
                "taxableAmount": taxable_amount,
                "taxCollected": tax_collected,
                "taxRate": tax_rate,
                "orderCount": order_count,
                "periodLabel": period_label,
            }
        }


@router.get("/tips")
async def get_tips_report(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Tips report for a date range."""
    logger.info(f"[REPORTS] tips called: laundryId={laundryId}, startDate={startDate}, endDate={endDate}")
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get all orders with tips in range
        cur.execute("""
            SELECT
                o.tip,
                o.order_id
            FROM orders.orders o
            WHERE o.laundry_id = %s
              AND o.created_at >= %s
              AND o.created_at < (%s::date + INTERVAL '1 day')
              AND o.order_status != 'OrderCanceled'
              AND o.tip IS NOT NULL
        """, (laundryId, startDate, endDate))
        rows = cur.fetchall()
        logger.info(f"[REPORTS] tips query returned {len(rows)} orders with tip data")

        total_tips = 0.0
        tips_by_employee = {}
        tips_by_method = {"cash": 0.0, "card": 0.0}

        for row in rows:
            tip_data = row["tip"]
            if not tip_data or not isinstance(tip_data, dict):
                continue

            tip_amount = float(tip_data.get("tipAmount", 0) or 0)
            if tip_amount <= 0:
                continue

            total_tips += tip_amount
            tip_method = (tip_data.get("tipMethod") or "card").lower()
            tip_receiver_id = tip_data.get("tipReceiverId") or tip_data.get("tip_receiver_id")

            if tip_method in tips_by_method:
                tips_by_method[tip_method] += tip_amount
            else:
                tips_by_method["card"] += tip_amount

            if tip_receiver_id:
                if tip_receiver_id not in tips_by_employee:
                    tips_by_employee[tip_receiver_id] = {
                        "empId": tip_receiver_id,
                        "tipsEarned": 0.0,
                        "orderCount": 0,
                    }
                tips_by_employee[tip_receiver_id]["tipsEarned"] += tip_amount
                tips_by_employee[tip_receiver_id]["orderCount"] += 1

        # Fetch employee names
        emp_ids = list(tips_by_employee.keys())
        if emp_ids:
            placeholders = ",".join(["%s"] * len(emp_ids))
            cur.execute(f"""
                SELECT emp_id, first_name, last_name
                FROM shop.employees
                WHERE emp_id IN ({placeholders})
            """, emp_ids)
            emp_rows = cur.fetchall()
            emp_name_map = {r["emp_id"]: f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() for r in emp_rows}
        else:
            emp_name_map = {}

        tips_list = []
        for emp_id, data in tips_by_employee.items():
            tips_list.append({
                "name": emp_name_map.get(emp_id, "Unknown"),
                "tipsEarned": round(data["tipsEarned"], 2),
                "orderCount": data["orderCount"],
            })

        # Sort by tips earned descending
        tips_list.sort(key=lambda x: x["tipsEarned"], reverse=True)

        return {
            "status": "success",
            "data": {
                "totalTipsCollected": round(total_tips, 2),
                "tipsByEmployee": tips_list,
                "tipsByMethod": {
                    "cash": round(tips_by_method["cash"], 2),
                    "card": round(tips_by_method["card"], 2),
                },
            }
        }


@router.get("/revenue-summary")
async def get_revenue_summary(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Revenue breakdown report."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Total revenue and breakdown by order type
        cur.execute("""
            SELECT
                COALESCE(SUM(grand_total), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN order_type = 'Online' THEN grand_total ELSE 0 END), 0) AS online_revenue,
                COALESCE(SUM(CASE WHEN order_type = 'InStore' THEN grand_total ELSE 0 END), 0) AS instore_revenue,
                COALESCE(SUM(CASE WHEN order_type = 'Commercial' THEN grand_total ELSE 0 END), 0) AS commercial_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'Paid' AND
                    (tip->>'tipMethod' = 'cash' OR payment_method = 'cash') THEN grand_total ELSE 0 END), 0) AS cash_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'Paid' AND
                    (tip->>'tipMethod' != 'cash' AND (payment_method IS NULL OR payment_method != 'cash'))
                    THEN grand_total ELSE 0 END), 0) AS card_revenue,
                COALESCE(SUM(CASE WHEN payment_status = 'Unpaid' THEN grand_total ELSE 0 END), 0) AS pay_later_revenue
            FROM orders.orders
            WHERE laundry_id = %s
              AND created_at >= %s
              AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        rev_row = cur.fetchone()

        # Revenue by service
        cur.execute("""
            SELECT
                os.service_name AS service,
                COALESCE(SUM(os.service_price * os.weight_or_count), 0) AS revenue,
                COUNT(DISTINCT o.order_id) AS orders
            FROM orders.order_services os
            JOIN orders.orders o ON o.order_id = os.order_id
            WHERE o.laundry_id = %s
              AND o.created_at >= %s
              AND o.created_at < (%s::date + INTERVAL '1 day')
              AND o.order_status != 'OrderCanceled'
            GROUP BY os.service_name
            ORDER BY revenue DESC
        """, (laundryId, startDate, endDate))
        svc_rows = cur.fetchall()

        revenue_by_service = [
            {
                "service": r["service"],
                "revenue": round(float(r["revenue"] or 0), 2),
                "orders": int(r["orders"] or 0),
            }
            for r in svc_rows
        ]

        return {
            "status": "success",
            "data": {
                "totalRevenue": round(float(rev_row["total_revenue"] or 0), 2),
                "revenueByService": revenue_by_service,
                "revenueByType": {
                    "online": round(float(rev_row["online_revenue"] or 0), 2),
                    "instore": round(float(rev_row["instore_revenue"] or 0), 2),
                    "commercial": round(float(rev_row["commercial_revenue"] or 0), 2),
                },
                "cashRevenue": round(float(rev_row["cash_revenue"] or 0), 2),
                "cardRevenue": round(float(rev_row["card_revenue"] or 0), 2),
                "payLaterRevenue": round(float(rev_row["pay_later_revenue"] or 0), 2),
            }
        }


@router.get("/comptroller")
async def get_comptroller_report(
    laundryId: str = Query(...),
    startDate: str = Query(...),
    endDate: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Pre-formatted report for state tax filing."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get tax rate
        cur.execute(
            "SELECT tax_rate FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundryId,)
        )
        shop_row = cur.fetchone()
        tax_rate = float(shop_row["tax_rate"] or 0) if shop_row else 0

        # Gross receipts and order count
        cur.execute("""
            SELECT
                COALESCE(SUM(grand_total), 0) AS gross_receipts,
                COUNT(*) AS total_orders
            FROM orders.orders
            WHERE laundry_id = %s
              AND created_at >= %s
              AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
        """, (laundryId, startDate, endDate))
        row = cur.fetchone()

        gross_receipts = float(row["gross_receipts"] or 0)
        total_orders = int(row["total_orders"] or 0)

        # Calculate taxable receipts and exempt sales
        if tax_rate > 0:
            taxable_receipts = round(gross_receipts / (1 + tax_rate), 2)
            sales_tax_collected = round(gross_receipts - taxable_receipts, 2)
        else:
            taxable_receipts = gross_receipts
            sales_tax_collected = 0.0

        # Exempt sales (e.g., orders with no tax applied — if tax_rate is 0 everything is exempt)
        exempt_sales = round(gross_receipts - taxable_receipts, 2) if tax_rate > 0 else gross_receipts

        # For comptroller: exempt_sales is revenue that isn't taxed
        # If all sales are taxable, exempt = 0
        exempt_sales = 0.0  # Default: assume all sales taxable unless specific exemptions exist

        # Check for exempt orders (commercial orders are often tax-exempt)
        cur.execute("""
            SELECT COALESCE(SUM(grand_total), 0) AS exempt_total
            FROM orders.orders
            WHERE laundry_id = %s
              AND created_at >= %s
              AND created_at < (%s::date + INTERVAL '1 day')
              AND order_status != 'OrderCanceled'
              AND order_type = 'Commercial'
        """, (laundryId, startDate, endDate))
        exempt_row = cur.fetchone()
        exempt_sales = round(float(exempt_row["exempt_total"] or 0), 2)

        reporting_period = f"{startDate} to {endDate}"

        return {
            "status": "success",
            "data": {
                "reportingPeriod": reporting_period,
                "grossReceipts": round(gross_receipts, 2),
                "taxableReceipts": taxable_receipts,
                "salesTaxCollected": sales_tax_collected,
                "taxRate": tax_rate,
                "totalOrders": total_orders,
                "exemptSales": exempt_sales,
            }
        }
