"""
Dashboard analytics routes — provides insights for laundry owners.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary")
async def get_dashboard_summary(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get dashboard summary metrics."""
    with get_db() as conn:
        cur = get_cursor(conn)
        today = datetime.now().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        prev_month_start = today - timedelta(days=60)
        prev_month_end = today - timedelta(days=30)

        # Revenue metrics
        cur.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN created_at::date = %s THEN grand_total ELSE 0 END), 0) as today_revenue,
                COALESCE(SUM(CASE WHEN created_at::date >= %s THEN grand_total ELSE 0 END), 0) as week_revenue,
                COALESCE(SUM(CASE WHEN created_at::date >= %s THEN grand_total ELSE 0 END), 0) as month_revenue,
                COALESCE(SUM(CASE WHEN created_at::date >= %s AND created_at::date < %s THEN grand_total ELSE 0 END), 0) as prev_month_revenue
            FROM orders.orders
            WHERE laundry_id = %s AND payment_status = 'Paid'
        """, (today, week_ago, month_ago, prev_month_start, prev_month_end, laundryId))
        rev = cur.fetchone()

        # Order counts
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE created_at::date = %s) as today_orders,
                COUNT(*) FILTER (WHERE created_at::date >= %s) as week_orders,
                COUNT(*) FILTER (WHERE created_at::date >= %s) as month_orders,
                COUNT(*) FILTER (WHERE status_category = 'Active') as active_orders,
                COUNT(*) FILTER (WHERE payment_status = 'Unpaid' AND status_category = 'Active') as unpaid_orders
            FROM orders.orders
            WHERE laundry_id = %s
        """, (today, week_ago, month_ago, laundryId))
        orders = cur.fetchone()

        # Customer metrics
        cur.execute("""
            SELECT
                COUNT(DISTINCT customer_id) FILTER (WHERE created_at::date >= %s) as new_customers_month,
                COUNT(DISTINCT customer_id) as total_customers
            FROM orders.orders
            WHERE laundry_id = %s
        """, (month_ago, laundryId))
        customers = cur.fetchone()

        # Revenue growth
        month_rev = float(rev["month_revenue"] or 0)
        prev_rev = float(rev["prev_month_revenue"] or 0)
        growth = round(((month_rev - prev_rev) / prev_rev * 100) if prev_rev > 0 else 0, 1)

    return {"status": "success", "data": {
        "revenue": {
            "today": float(rev["today_revenue"] or 0),
            "week": float(rev["week_revenue"] or 0),
            "month": float(rev["month_revenue"] or 0),
            "growth": growth,
        },
        "orders": {
            "today": orders["today_orders"],
            "week": orders["week_orders"],
            "month": orders["month_orders"],
            "active": orders["active_orders"],
            "unpaid": orders["unpaid_orders"],
        },
        "customers": {
            "newThisMonth": customers["new_customers_month"],
            "total": customers["total_customers"],
        },
    }}


@router.get("/revenue-chart")
async def get_revenue_chart(
    laundryId: str = Query(...),
    days: int = Query(30),
    current_user: dict = Depends(get_current_user),
):
    """Get daily revenue for chart."""
    with get_db() as conn:
        cur = get_cursor(conn)
        start_date = (datetime.now().date() - timedelta(days=days)).isoformat()
        cur.execute("""
            SELECT created_at::date as day, 
                   COALESCE(SUM(grand_total), 0) as revenue,
                   COUNT(*) as order_count
            FROM orders.orders
            WHERE laundry_id = %s AND created_at::date >= %s AND payment_status = 'Paid'
            GROUP BY created_at::date
            ORDER BY day
        """, (laundryId, start_date))
        data = [{"date": str(r["day"]), "revenue": float(r["revenue"]), "orders": r["order_count"]} for r in cur.fetchall()]

    return {"status": "success", "data": data}


@router.get("/top-services")
async def get_top_services(
    laundryId: str = Query(...),
    days: int = Query(30),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get top services by revenue."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if startDate and endDate:
            date_filter = startDate
        else:
            date_filter = (datetime.now().date() - timedelta(days=days)).isoformat()
        cur.execute("""
            SELECT os.service_name, 
                   COUNT(*) as order_count,
                   COALESCE(SUM(os.service_price * os.weight_or_count), 0) as total_revenue
            FROM orders.order_services os
            JOIN orders.orders o ON o.order_id = os.order_id
            WHERE o.laundry_id = %s AND o.created_at::date >= %s
            GROUP BY os.service_name
            ORDER BY total_revenue DESC
            LIMIT 10
        """, (laundryId, date_filter))
        data = [{"service": r["service_name"], "orders": r["order_count"], "revenue": float(r["total_revenue"])} for r in cur.fetchall()]

    return {"status": "success", "data": data}


@router.get("/employee-performance")
async def get_employee_performance(
    laundryId: str = Query(...),
    days: int = Query(30),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get employee performance metrics."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if startDate and endDate:
            date_filter = startDate
        else:
            date_filter = (datetime.now().date() - timedelta(days=days)).isoformat()
        cur.execute("""
            SELECT o.last_updated_by as emp_id,
                   e.first_name, e.last_name,
                   COUNT(*) as orders_processed,
                   COALESCE(SUM(ot.tip_amount), 0) as tips_earned
            FROM orders.orders o
            LEFT JOIN shop.employees e ON e.emp_id = o.last_updated_by
            LEFT JOIN orders.order_tips ot ON ot.order_id = o.order_id
            WHERE o.laundry_id = %s AND o.created_at::date >= %s
              AND o.last_updated_by IS NOT NULL AND o.last_updated_by != ''
            GROUP BY o.last_updated_by, e.first_name, e.last_name
            ORDER BY orders_processed DESC
        """, (laundryId, date_filter))
        data = [{
            "empId": r["emp_id"],
            "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip() or r["emp_id"],
            "ordersProcessed": r["orders_processed"],
            "tipsEarned": float(r["tips_earned"]),
        } for r in cur.fetchall()]

    return {"status": "success", "data": data}


@router.get("/order-breakdown")
async def get_order_breakdown(
    laundryId: str = Query(...),
    days: int = Query(30),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get order breakdown by type and status."""
    with get_db() as conn:
        cur = get_cursor(conn)
        if startDate and endDate:
            date_filter = startDate
        else:
            date_filter = (datetime.now().date() - timedelta(days=days)).isoformat()

        # By type
        cur.execute("""
            SELECT order_type, COUNT(*) as count
            FROM orders.orders
            WHERE laundry_id = %s AND created_at::date >= %s
            GROUP BY order_type
        """, (laundryId, date_filter))
        by_type = {r["order_type"]: r["count"] for r in cur.fetchall()}

        # By status
        cur.execute("""
            SELECT order_status, COUNT(*) as count
            FROM orders.orders
            WHERE laundry_id = %s AND status_category = 'Active'
            GROUP BY order_status
        """, (laundryId,))
        by_status = {r["order_status"]: r["count"] for r in cur.fetchall()}

        # By payment
        cur.execute("""
            SELECT payment_status, COUNT(*) as count
            FROM orders.orders
            WHERE laundry_id = %s AND created_at::date >= %s
            GROUP BY payment_status
        """, (laundryId, date_filter))
        by_payment = {r["payment_status"]: r["count"] for r in cur.fetchall()}

    return {"status": "success", "data": {
        "byType": by_type,
        "byStatus": by_status,
        "byPayment": by_payment,
    }}


@router.get("/top-customers")
async def get_top_customers(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get top customers by order count and revenue."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT o.customer_id, c.first_name, c.last_name, c.phone_number,
                   COUNT(*) as total_orders,
                   COALESCE(SUM(o.grand_total), 0) as total_spent
            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            WHERE o.laundry_id = %s AND o.status_category != 'Cancelled'
            GROUP BY o.customer_id, c.first_name, c.last_name, c.phone_number
            ORDER BY total_spent DESC
            LIMIT 10
        """, (laundryId,))
        data = [{
            "customerId": r["customer_id"],
            "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
            "phone": r["phone_number"],
            "totalOrders": r["total_orders"],
            "totalSpent": float(r["total_spent"]),
        } for r in cur.fetchall()]

    return {"status": "success", "data": data}
