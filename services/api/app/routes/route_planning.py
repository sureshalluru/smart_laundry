"""
Route planning endpoints — admin route planner for multi-driver optimization.
Handles stop fetching, driver listing, clustering, assignment, and retrieval.
"""
import hashlib
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query, Body
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.config import settings
from app.services.clustering_service import cluster_stops
from app.services.route_optimizer import optimize_route_order

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Geocoding helpers ──────────────────────────────────────────────────────────

async def _geocode_address(address: str) -> Optional[dict]:
    """
    Geocode an address using Google Maps Geocoding API.
    Returns {"latitude": float, "longitude": float} or None on failure.
    """
    api_key = settings.google_maps_api_key
    if not api_key:
        logger.warning("Google Maps API key not configured, cannot geocode")
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": address, "key": api_key},
            )
        data = response.json()
        if data.get("status") == "OK" and data.get("results"):
            location = data["results"][0]["geometry"]["location"]
            return {"latitude": location["lat"], "longitude": location["lng"]}
        else:
            logger.warning(f"Geocoding failed for '{address}': {data.get('status')}")
            return None
    except Exception as e:
        logger.error(f"Geocoding API call failed for '{address}': {e}")
        return None


def _get_cached_geocode(conn, address: str) -> Optional[dict]:
    """Check geocode cache for an address."""
    address_hash = hashlib.sha256(address.strip().lower().encode()).hexdigest()
    cur = get_cursor(conn)
    cur.execute(
        "SELECT latitude, longitude FROM routes.geocode_cache WHERE address_hash = %s",
        (address_hash,),
    )
    row = cur.fetchone()
    if row:
        return {"latitude": row["latitude"], "longitude": row["longitude"]}
    return None


def _save_geocode_cache(conn, address: str, latitude: float, longitude: float):
    """Save geocode result to cache."""
    address_hash = hashlib.sha256(address.strip().lower().encode()).hexdigest()
    cur = get_cursor(conn)
    cur.execute(
        """INSERT INTO routes.geocode_cache (address_hash, address, latitude, longitude)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (address_hash) DO NOTHING""",
        (address_hash, address, latitude, longitude),
    )


# ── GET /stops ─────────────────────────────────────────────────────────────────

@router.get("/stops")
async def get_stops(
    laundryId: str = Query(...),
    date: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch pending stops for a date with geocoded lat/lng.
    Returns stops with status OrderSubmitted (pickup) or EnRouteToDelivery (delivery).
    """
    try:
        route_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}

    with get_db() as conn:
        cur = get_cursor(conn)
        # Fetch orders matching the criteria
        cur.execute("""
            SELECT o.order_id, o.order_status, o.pickup_date, o.dropoff_date,
                   c.first_name, c.last_name, ca.address AS customer_address
            FROM orders.orders o
            JOIN shop.customers c ON c.customer_id = o.customer_id
            LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
            WHERE o.laundry_id = %s
              AND (
                (o.order_status = 'OrderSubmitted' AND o.pickup_date = %s)
                OR
                (o.order_status = 'EnRouteToDelivery' AND o.dropoff_date = %s)
              )
        """, (laundryId, route_date, route_date))

        rows = cur.fetchall()
        stops = []

        for row in rows:
            address = row["customer_address"]
            if not address:
                continue

            # Check geocode cache first
            cached = _get_cached_geocode(conn, address)
            if cached:
                lat, lng = cached["latitude"], cached["longitude"]
            else:
                # Geocode the address
                geo_result = await _geocode_address(address)
                if not geo_result:
                    continue
                lat, lng = geo_result["latitude"], geo_result["longitude"]
                _save_geocode_cache(conn, address, lat, lng)

            # Skip stops without valid coordinates
            if lat == 0 and lng == 0:
                continue

            order_type = "pickup" if row["order_status"] == "OrderSubmitted" else "delivery"
            stops.append({
                "orderId": row["order_id"],
                "customerName": f"{row['first_name'] or ''} {row['last_name'] or ''}".strip(),
                "address": address,
                "latitude": lat,
                "longitude": lng,
                "orderType": order_type,
                "status": row["order_status"],
            })

    return {"stops": stops}


# ── GET /drivers ───────────────────────────────────────────────────────────────

@router.get("/drivers")
async def get_drivers(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List available drivers for the laundry (employees with Driver role, or all if no drivers exist)."""
    with get_db() as conn:
        cur = get_cursor(conn)
        # First try to get Driver-role employees
        cur.execute("""
            SELECT emp_id, first_name, last_name, role
            FROM shop.employees
            WHERE laundry_id = %s
              AND role = 'Driver'
              AND is_active = TRUE
            ORDER BY first_name
        """, (laundryId,))
        rows = cur.fetchall()

        # Fallback: if no Driver-role employees, return all active employees
        if not rows:
            cur.execute("""
                SELECT emp_id, first_name, last_name, role
                FROM shop.employees
                WHERE laundry_id = %s
                  AND is_active = TRUE
                ORDER BY role, first_name
            """, (laundryId,))
            rows = cur.fetchall()
        rows = cur.fetchall()

    drivers = [
        {
            "driverId": r["emp_id"],
            "name": f"{r['first_name'] or ''} {r['last_name'] or ''}".strip(),
        }
        for r in rows
    ]
    return {"drivers": drivers}


# ── POST /optimize ─────────────────────────────────────────────────────────────

@router.post("/optimize")
async def optimize_clusters(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Run k-means clustering on stops.
    Expects: { laundryId, stops: [{orderId, latitude, longitude}], driverCount: int }
    """
    stops = body.get("stops", [])
    driver_count = body.get("driverCount", 1)

    if not stops:
        return {"clusters": []}

    if driver_count < 1:
        driver_count = 1

    # Run clustering
    clusters_result = cluster_stops(stops, driver_count)

    clusters = []
    for idx, order_ids in enumerate(clusters_result):
        clusters.append({
            "driverId": None,
            "clusterIndex": idx,
            "stops": order_ids,
        })

    return {"clusters": clusters}


# ── POST /assign ───────────────────────────────────────────────────────────────

@router.post("/assign")
async def assign_routes(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Save route assignments and optimize per-driver order via Google Maps.
    Expects: {
        laundryId, date, assignments: [{driverId, orderIds: [...]}],
        origin (optional), destination (optional)
    }
    """
    laundry_id = body.get("laundryId")
    date_str = body.get("date")
    assignments = body.get("assignments", [])
    origin_override = body.get("origin")
    destination_override = body.get("destination")

    if not laundry_id or not date_str or not assignments:
        return {"status": "error", "message": "Missing required fields: laundryId, date, assignments"}

    try:
        route_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}

    # Get laundry address for origin/destination
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT street, city, state, zip_code
            FROM shop.laundry_shops
            WHERE laundry_id = %s
        """, (laundry_id,))
        laundry_row = cur.fetchone()

    laundry_address = ""
    if laundry_row:
        parts = [
            laundry_row.get("street", ""),
            laundry_row.get("city", ""),
            laundry_row.get("state", ""),
            laundry_row.get("zip_code", ""),
        ]
        laundry_address = ", ".join(p for p in parts if p)

    origin = origin_override or laundry_address
    destination = destination_override or laundry_address

    # Get addresses for all orders for Google Maps optimization
    all_order_ids = []
    for a in assignments:
        all_order_ids.extend(a.get("orderIds", []))

    order_addresses = {}
    if all_order_ids:
        with get_db() as conn:
            cur = get_cursor(conn)
            placeholders = ",".join(["%s"] * len(all_order_ids))
            cur.execute(f"""
                SELECT o.order_id, ca.address
                FROM orders.orders o
                LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
                WHERE o.order_id IN ({placeholders})
            """, all_order_ids)
            for row in cur.fetchall():
                order_addresses[row["order_id"]] = row["address"] or ""

    # Optimize each driver's route and build results
    routes = []
    for assignment in assignments:
        driver_id = assignment.get("driverId")
        order_ids = assignment.get("orderIds", [])

        if not order_ids:
            routes.append({
                "driverId": driver_id,
                "optimizedOrder": [],
                "sequencePositions": {},
            })
            continue

        # Build waypoints for Google Maps optimization
        waypoints = [
            {"orderId": oid, "address": order_addresses.get(oid, "")}
            for oid in order_ids
            if order_addresses.get(oid)
        ]

        # Optimize route order
        if waypoints and origin:
            optimized_ids = await optimize_route_order(origin, destination, waypoints)
        else:
            optimized_ids = order_ids

        # Build sequence positions
        sequence_positions = {oid: idx + 1 for idx, oid in enumerate(optimized_ids)}

        # Include any order_ids that weren't in waypoints (no address)
        for oid in order_ids:
            if oid not in sequence_positions:
                sequence_positions[oid] = len(sequence_positions) + 1

        routes.append({
            "driverId": driver_id,
            "optimizedOrder": optimized_ids,
            "sequencePositions": sequence_positions,
        })

    # Persist assignments to database
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get completed assignments to preserve them
        cur.execute("""
            SELECT order_id FROM routes.route_assignments
            WHERE laundry_id = %s AND route_date = %s AND status = 'completed'
        """, (laundry_id, route_date))
        completed_order_ids = {row["order_id"] for row in cur.fetchall()}

        # Delete existing non-completed assignments for this date
        cur.execute("""
            DELETE FROM routes.route_assignments
            WHERE laundry_id = %s AND route_date = %s AND status != 'completed'
        """, (laundry_id, route_date))

        # Insert new assignments
        for route in routes:
            driver_id = route["driverId"]
            for oid, seq_pos in route["sequencePositions"].items():
                # Skip if this order is already completed
                if oid in completed_order_ids:
                    continue
                cur.execute("""
                    INSERT INTO routes.route_assignments
                        (laundry_id, route_date, driver_id, order_id, sequence_position, status)
                    VALUES (%s, %s, %s, %s, %s, 'pending')
                    ON CONFLICT (laundry_id, route_date, order_id) DO UPDATE
                    SET driver_id = EXCLUDED.driver_id,
                        sequence_position = EXCLUDED.sequence_position,
                        updated_at = NOW()
                """, (laundry_id, route_date, driver_id, oid, seq_pos))

    # Notify drivers via SMS
    try:
        from app.services.notification_service import send_sms

        with get_db() as conn:
            cur = get_cursor(conn)
            for route in routes:
                driver_id = route["driverId"]
                stop_count = len(route.get("sequencePositions", {}))
                if stop_count == 0:
                    continue

                # Get driver phone number
                cur.execute(
                    "SELECT phone FROM shop.employees WHERE emp_id = %s",
                    (driver_id,),
                )
                emp_row = cur.fetchone()
                if emp_row and emp_row.get("phone"):
                    message = (
                        f"Your route for {date_str} is ready — {stop_count} stop{'s' if stop_count > 1 else ''} assigned. "
                        f"Open the app to see your route and tap Navigate."
                    )
                    send_sms(emp_row["phone"], message)
                    logger.info(f"Route notification sent to driver {driver_id}")
    except Exception as e:
        # Non-blocking — don't fail assignment if SMS fails
        logger.warning(f"Failed to notify drivers via SMS: {e}")

    return {"status": "success", "routes": routes}


# ── GET /assignments ───────────────────────────────────────────────────────────

@router.get("/assignments")
async def get_assignments(
    laundryId: str = Query(...),
    date: str = Query(...),
    driverId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Load existing assignments for a date.
    Optionally filter by driverId for driver home view.
    """
    try:
        route_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}

    with get_db() as conn:
        cur = get_cursor(conn)

        if driverId:
            cur.execute("""
                SELECT ra.driver_id, ra.order_id, ra.sequence_position, ra.status, ra.cluster_index,
                       c.first_name, c.last_name, ca.address AS customer_address
                FROM routes.route_assignments ra
                JOIN orders.orders o ON o.order_id = ra.order_id
                JOIN shop.customers c ON c.customer_id = o.customer_id
                LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
                WHERE ra.laundry_id = %s AND ra.route_date = %s AND ra.driver_id = %s
                ORDER BY ra.sequence_position ASC
            """, (laundryId, route_date, driverId))
        else:
            cur.execute("""
                SELECT ra.driver_id, ra.order_id, ra.sequence_position, ra.status, ra.cluster_index,
                       c.first_name, c.last_name, ca.address AS customer_address
                FROM routes.route_assignments ra
                JOIN orders.orders o ON o.order_id = ra.order_id
                JOIN shop.customers c ON c.customer_id = o.customer_id
                LEFT JOIN shop.customer_addresses ca ON ca.address_id = o.address_id
                WHERE ra.laundry_id = %s AND ra.route_date = %s
                ORDER BY ra.driver_id, ra.sequence_position ASC
            """, (laundryId, route_date))

        rows = cur.fetchall()

    # Group by driver
    driver_assignments = {}
    for row in rows:
        did = row["driver_id"]
        if did not in driver_assignments:
            driver_assignments[did] = []
        driver_assignments[did].append({
            "orderId": row["order_id"],
            "sequencePosition": row["sequence_position"],
            "status": row["status"],
            "clusterIndex": row["cluster_index"],
            "customerName": f"{row['first_name'] or ''} {row['last_name'] or ''}".strip(),
            "address": row["customer_address"],
        })

    return {"assignments": driver_assignments}


# ── DELETE /assignments ────────────────────────────────────────────────────────

@router.delete("/assignments")
async def delete_assignments(
    laundryId: str = Query(...),
    date: str = Query(...),
    body: dict = Body({}),
    current_user: dict = Depends(get_current_user),
):
    """
    Clear assignments for re-planning.
    Only deletes non-completed stops. Requires confirm=true in body.
    """
    confirm = body.get("confirm", False)
    if not confirm:
        return {"status": "error", "message": "Confirmation required. Send confirm: true in body."}

    try:
        route_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return {"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            DELETE FROM routes.route_assignments
            WHERE laundry_id = %s AND route_date = %s AND status != 'completed'
        """, (laundryId, route_date))
        deleted_count = cur.rowcount

    return {"status": "success", "deletedCount": deleted_count}
