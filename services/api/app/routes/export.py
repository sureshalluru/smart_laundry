"""
CSV Export endpoints — allows admin users to download data as CSV files.
"""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.auth import get_current_user
from app.database import get_db, get_cursor

router = APIRouter()


@router.get("/export/customers")
async def export_customers_csv(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Export all customers for a laundry as CSV."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT
                c.first_name,
                c.last_name,
                c.phone_number,
                c.email,
                COALESCE(cls.total_orders_placed, 0) AS total_orders,
                COALESCE(cls.total_order_value, 0) AS total_revenue,
                cls.last_completed_at
            FROM shop.customer_laundry_stats cls
            JOIN shop.customers c ON c.customer_id = cls.customer_id
            WHERE cls.laundry_id = %s
            ORDER BY cls.total_order_value DESC
        """, (laundryId,))
        rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "First Name", "Last Name", "Phone", "Email",
        "Total Orders", "Total Revenue", "Last Order Date",
    ])
    for row in rows:
        writer.writerow([
            row.get("first_name", ""),
            row.get("last_name", ""),
            row.get("phone_number", ""),
            row.get("email", ""),
            row.get("total_orders", 0),
            f"{float(row.get('total_revenue', 0)):.2f}",
            str(row.get("last_completed_at", "")) if row.get("last_completed_at") else "",
        ])

    output.seek(0)
    filename = f"customers_{laundryId}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/orders")
async def export_orders_csv(
    laundryId: str = Query(...),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    statusCategory: Optional[str] = Query("All"),
    current_user: dict = Depends(get_current_user),
):
    """Export orders for a laundry as CSV with optional date and status filters."""
    with get_db() as conn:
        cur = get_cursor(conn)

        query = """
            SELECT
                o.order_id,
                COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') AS customer_name,
                c.phone_number,
                o.order_type,
                o.order_status,
                o.payment_status,
                o.pickup_date,
                o.dropoff_date,
                o.grand_total,
                o.created_at
            FROM orders.orders o
            LEFT JOIN shop.customers c ON c.customer_id = o.customer_id
            WHERE o.laundry_id = %s
        """
        params = [laundryId]

        if startDate:
            query += " AND o.created_at::date >= %s"
            params.append(startDate)
        if endDate:
            query += " AND o.created_at::date <= %s"
            params.append(endDate)
        if statusCategory and statusCategory != "All":
            query += " AND o.status_category = %s"
            params.append(statusCategory)

        query += " ORDER BY o.created_at DESC"
        cur.execute(query, params)
        rows = cur.fetchall()

        # Fetch services for each order
        order_ids = [row["order_id"] for row in rows]
        services_map = {}
        if order_ids:
            cur.execute("""
                SELECT order_id, service_name
                FROM orders.order_services
                WHERE order_id = ANY(%s)
            """, (order_ids,))
            for svc in cur.fetchall():
                oid = svc["order_id"]
                if oid not in services_map:
                    services_map[oid] = []
                services_map[oid].append(svc["service_name"])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order ID", "Customer Name", "Phone", "Order Type", "Status",
        "Payment Status", "Pickup Date", "Dropoff Date", "Services",
        "Grand Total", "Created At",
    ])
    for row in rows:
        services = "; ".join(services_map.get(row["order_id"], []))
        writer.writerow([
            row.get("order_id", ""),
            row.get("customer_name", "").strip(),
            row.get("phone_number", ""),
            row.get("order_type", ""),
            row.get("order_status", ""),
            row.get("payment_status", ""),
            str(row.get("pickup_date", "")) if row.get("pickup_date") else "",
            str(row.get("dropoff_date", "")) if row.get("dropoff_date") else "",
            services,
            f"{float(row.get('grand_total', 0)):.2f}",
            str(row.get("created_at", "")) if row.get("created_at") else "",
        ])

    output.seek(0)
    filename = f"orders_{laundryId}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/reports")
async def export_reports_csv(
    laundryId: str = Query(...),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Export daily summary report as CSV."""
    with get_db() as conn:
        cur = get_cursor(conn)

        if not startDate:
            startDate = (datetime.now().date() - timedelta(days=30)).isoformat()
        if not endDate:
            endDate = datetime.now().date().isoformat()

        cur.execute("""
            SELECT
                created_at::date AS date,
                COUNT(*) AS orders_count,
                COALESCE(SUM(grand_total), 0) AS revenue,
                COALESCE(AVG(grand_total), 0) AS avg_order_value
            FROM orders.orders
            WHERE laundry_id = %s
              AND created_at::date >= %s
              AND created_at::date <= %s
              AND payment_status = 'Paid'
            GROUP BY created_at::date
            ORDER BY date
        """, (laundryId, startDate, endDate))
        rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Orders Count", "Revenue", "Average Order Value"])
    for row in rows:
        writer.writerow([
            str(row["date"]),
            row["orders_count"],
            f"{float(row['revenue']):.2f}",
            f"{float(row['avg_order_value']):.2f}",
        ])

    output.seek(0)
    filename = f"report_{laundryId}_{startDate}_to_{endDate}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
