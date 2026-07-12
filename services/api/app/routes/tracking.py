"""
Driver tracking routes — real-time location broadcasting and retrieval.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Body, HTTPException, Query, status
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # Public endpoints (no auth required)


STALENESS_THRESHOLD = timedelta(minutes=2)


def is_location_stale(updated_at: datetime, now: datetime = None) -> bool:
    """
    Determine if a driver location record is stale based on its updated_at timestamp.

    Returns True if the record is older than 2 minutes from the current time,
    meaning tracking should return status 'unavailable' with reason 'stale_data'.
    Returns False if the record is within the 2-minute threshold (status 'active').

    Args:
        updated_at: The timestamp of the last location update.
        now: The current time (defaults to datetime.now(UTC) if not provided).
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Ensure both timestamps are timezone-aware (UTC)
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    return (now - updated_at) > STALENESS_THRESHOLD


def is_order_trackable(order_status: str, pickup_service: str, dropoff_service: str) -> bool:
    """
    Determine if an order is in a trackable state based on its status and service types.

    Returns True if and only if:
    - order_status is 'OrderSubmitted' AND pickup_service is 'LaundryDriver'
    - OR order_status is 'EnRouteToDelivery' AND dropoff_service is 'LaundryDriver'

    All other combinations return False (tracking unavailable).
    """
    pickup = (pickup_service or "").strip().lower().replace(" ", "")
    dropoff = (dropoff_service or "").strip().lower().replace(" ", "")

    return (
        (order_status == "OrderSubmitted" and pickup == "laundrydriver")
        or (order_status == "EnRouteToDelivery" and dropoff == "laundrydriver")
    )


def is_tracking_activated(driver_current_position: int, customer_sequence_position: int, remaining_stops: int) -> bool:
    """
    Determine if live tracking should be activated for a customer based on
    sequential activation rules.

    Returns True (tracking activated) if:
    - driver_current_position >= customer_sequence_position - 1
      (driver is at or past the stop before the customer's stop)
    - OR remaining_stops <= 1
      (driver has only one remaining stop, always serve regardless of position)

    Args:
        driver_current_position: The driver's current stop position (C).
        customer_sequence_position: The customer's sequence position in the route (P).
        remaining_stops: Number of remaining (non-completed) stops for the driver.
    """
    if remaining_stops <= 1:
        return True
    return driver_current_position >= (customer_sequence_position - 1)


@router.post("/location")
async def update_location(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Receive and store driver's current GPS position."""
    # Extract driver identity from JWT claims
    driver_id = current_user.get("empId") or current_user.get("sub")
    laundry_id = current_user.get("laundryId")

    if not driver_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing empId or laundryId in token claims",
        )

    # Extract and validate payload
    latitude = body.get("latitude")
    longitude = body.get("longitude")
    heading = body.get("heading", 0)
    speed = body.get("speed", 0)
    current_stop_position = body.get("currentStopPosition", 1)

    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="latitude and longitude are required",
        )

    # Validate coordinate ranges
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="latitude and longitude must be numeric",
        )

    if latitude < -90 or latitude > 90:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="latitude must be between -90 and 90",
        )

    if longitude < -180 or longitude > 180:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="longitude must be between -180 and 180",
        )

    # Upsert into routes.driver_locations
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO routes.driver_locations (
                driver_id, laundry_id, latitude, longitude,
                heading, speed, current_stop_position, is_active, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, NOW())
            ON CONFLICT (driver_id) DO UPDATE SET
                laundry_id = EXCLUDED.laundry_id,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                heading = EXCLUDED.heading,
                speed = EXCLUDED.speed,
                current_stop_position = EXCLUDED.current_stop_position,
                is_active = TRUE,
                updated_at = NOW()
        """, (driver_id, laundry_id, latitude, longitude, heading, speed, current_stop_position))

    return {"status": "success"}


@router.post("/start-route")
async def start_route(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Driver starts their delivery route. This:
    1. Moves the first delivery order in sequence to 'EnRouteToDelivery' (if not already)
    2. Sends SMS to the first customer with a tracking link
    Returns the first order details.

    Accepts optional body params:
    - orderId: specific order to notify (from frontend's visible orders)
    - date: route date override
    """
    # Resolve driver_id: try empId claim first, then sub
    driver_id = current_user.get("empId") or current_user.get("custom:empId") or current_user.get("sub", "")
    laundry_id = current_user.get("laundryId") or current_user.get("custom:laundryId")

    logger.info(f"start-route: JWT claims: sub={current_user.get('sub')}, empId={current_user.get('empId')}, resolved driver_id={driver_id}")

    if not driver_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing empId or laundryId in token claims",
        )

    explicit_order_id = body.get("orderId")
    date_str = body.get("date")

    with get_db() as conn:
        cur = get_cursor(conn)
        first_stop = None

        # ─── Path 1: Frontend provided a specific orderId — use it directly ───
        if explicit_order_id:
            logger.info(f"start-route: using explicit orderId={explicit_order_id} from frontend")
            cur.execute("""
                SELECT o.order_id, o.order_status, o.customer_id,
                       c.phone_number, c.first_name, s.user_domain, s.laundry_name
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                JOIN shop.laundry_shops s ON s.laundry_id = o.laundry_id
                WHERE o.order_id = %s AND o.laundry_id = %s
            """, (explicit_order_id, laundry_id))
            first_stop = cur.fetchone()
            if first_stop:
                logger.info(f"start-route: found order {explicit_order_id}, customer phone={first_stop['phone_number']}")
            else:
                logger.warning(f"start-route: explicit orderId={explicit_order_id} not found for laundry_id={laundry_id}")

        # ─── Path 2: No explicit orderId — discover from route assignments ───
        if not first_stop:
            if not date_str:
                # Find the earliest pending assignment date for this driver
                cur.execute("""
                    SELECT route_date FROM routes.route_assignments
                    WHERE laundry_id = %s AND UPPER(driver_id) = UPPER(%s) AND status != 'completed'
                    ORDER BY route_date ASC LIMIT 1
                """, (str(laundry_id), driver_id))
                row = cur.fetchone()
                if row:
                    date_str = str(row["route_date"])
                    logger.info(f"start-route: found assignment date {date_str} for driver {driver_id}")
                else:
                    logger.warning(f"start-route: NO assignments found for driver_id={driver_id}, laundry_id={laundry_id}")

            # Get the first pending stop for this driver (by sequence if assigned, otherwise first by date)
            if date_str:
                cur.execute("""
                    SELECT ra.order_id, ra.sequence_position, o.order_status, o.customer_id,
                           c.phone_number, c.first_name, s.user_domain, s.laundry_name
                    FROM routes.route_assignments ra
                    JOIN orders.orders o ON o.order_id = ra.order_id
                    JOIN shop.customers c ON c.customer_id = o.customer_id
                    JOIN shop.laundry_shops s ON s.laundry_id = o.laundry_id
                    WHERE ra.laundry_id = %s AND UPPER(ra.driver_id) = UPPER(%s) AND ra.route_date = %s
                      AND ra.status != 'completed'
                      AND o.order_status IN ('EnRouteToDelivery', 'ProcessingCompleted', 'OrderSubmitted')
                    ORDER BY ra.sequence_position ASC
                    LIMIT 1
                """, (laundry_id, driver_id, date_str))
            else:
                # No date — find any pending assignment
                cur.execute("""
                    SELECT ra.order_id, ra.sequence_position, o.order_status, o.customer_id,
                           c.phone_number, c.first_name, s.user_domain, s.laundry_name
                    FROM routes.route_assignments ra
                    JOIN orders.orders o ON o.order_id = ra.order_id
                    JOIN shop.customers c ON c.customer_id = o.customer_id
                    JOIN shop.laundry_shops s ON s.laundry_id = o.laundry_id
                    WHERE ra.laundry_id = %s AND UPPER(ra.driver_id) = UPPER(%s)
                      AND ra.status != 'completed'
                      AND o.order_status IN ('EnRouteToDelivery', 'ProcessingCompleted', 'OrderSubmitted')
                    ORDER BY ra.route_date ASC, ra.sequence_position ASC
                    LIMIT 1
                """, (laundry_id, driver_id))

            first_stop = cur.fetchone()
            logger.info(f"start-route: assignment query result: {first_stop is not None}, driver_id={driver_id}, date_str={date_str}")

        if not first_stop:
            return {"status": "no_stops", "message": "No pending delivery stops found."}

        order_id = first_stop["order_id"]
        order_status = first_stop["order_status"]
        customer_phone = first_stop["phone_number"]
        customer_name = first_stop["first_name"] or "Customer"
        base_url = first_stop["user_domain"] or "https://www.smartlaundrybasket.ai"
        laundry_name = first_stop["laundry_name"] or "Your Laundry"

        # Move to EnRouteToDelivery if not already
        if order_status != "EnRouteToDelivery":
            cur.execute("""
                UPDATE orders.orders SET order_status = 'EnRouteToDelivery', updated_at = NOW()
                WHERE order_id = %s
            """, (order_id,))

        # Send SMS to first customer
        tracking_url = f"{base_url}/{laundry_id}/user/track/{order_id}"
        sms_message = (
            f"Hi {customer_name}! Your driver from {laundry_name} is on the way. "
            f"Track your delivery: {tracking_url}"
        )

        try:
            from app.services.notification_service import send_sms_for_tenant
            if customer_phone:
                send_sms_for_tenant(customer_phone, sms_message, laundry_id)
                logger.info(f"Delivery tracking SMS sent to {customer_phone} for order {order_id}")
        except Exception as e:
            logger.warning(f"Failed to send tracking SMS for order {order_id}: {e}")

    return {
        "status": "success",
        "orderId": order_id,
        "message": f"Route started. Customer notified for order {order_id}.",
    }


@router.post("/notify-next")
async def notify_next_customer(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """
    After confirming delivery on current stop, notify the next customer in sequence.
    Moves next order to 'EnRouteToDelivery' and sends SMS.
    """
    driver_id = current_user.get("empId") or current_user.get("sub")
    laundry_id = current_user.get("laundryId")

    if not driver_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing empId or laundryId in token claims",
        )

    date_str = body.get("date")
    completed_order_id = body.get("completedOrderId")

    if not date_str or not completed_order_id:
        raise HTTPException(status_code=400, detail="date and completedOrderId are required")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get the sequence position of the completed order
        cur.execute("""
            SELECT sequence_position FROM routes.route_assignments
            WHERE laundry_id = %s AND driver_id = %s AND route_date = %s AND order_id = %s
        """, (laundry_id, driver_id, date_str, completed_order_id))
        completed_row = cur.fetchone()

        if not completed_row:
            return {"status": "no_next", "message": "Completed order not found in assignments."}

        completed_seq = completed_row["sequence_position"]

        # Get the next pending stop after the completed one
        cur.execute("""
            SELECT ra.order_id, ra.sequence_position, o.order_status,
                   c.phone_number, c.first_name, s.user_domain, s.laundry_name
            FROM routes.route_assignments ra
            JOIN orders.orders o ON o.order_id = ra.order_id
            JOIN shop.customers c ON c.customer_id = o.customer_id
            JOIN shop.laundry_shops s ON s.laundry_id = o.laundry_id
            WHERE ra.laundry_id = %s AND ra.driver_id = %s AND ra.route_date = %s
              AND ra.status != 'completed'
              AND ra.sequence_position > %s
            ORDER BY ra.sequence_position ASC
            LIMIT 1
        """, (laundry_id, driver_id, date_str, completed_seq))
        next_stop = cur.fetchone()

        if not next_stop:
            return {"status": "route_complete", "message": "All stops completed. Route done!"}

        next_order_id = next_stop["order_id"]
        order_status = next_stop["order_status"]
        customer_phone = next_stop["phone_number"]
        customer_name = next_stop["first_name"] or "Customer"
        base_url = next_stop["user_domain"] or "https://www.smartlaundrybasket.ai"
        laundry_name = next_stop["laundry_name"] or "Your Laundry"

        # Move to EnRouteToDelivery if not already
        if order_status != "EnRouteToDelivery":
            cur.execute("""
                UPDATE orders.orders SET order_status = 'EnRouteToDelivery', updated_at = NOW()
                WHERE order_id = %s
            """, (next_order_id,))

        # Send SMS to next customer
        tracking_url = f"{base_url}/{laundry_id}/user/track/{next_order_id}"
        sms_message = (
            f"Hi {customer_name}! Your driver from {laundry_name} is on the way. "
            f"Track your delivery: {tracking_url}"
        )

        try:
            from app.services.notification_service import send_sms_for_tenant
            if customer_phone:
                send_sms_for_tenant(customer_phone, sms_message, laundry_id)
                logger.info(f"Delivery tracking SMS sent to {customer_phone} for order {next_order_id}")
        except Exception as e:
            logger.warning(f"Failed to send tracking SMS for order {next_order_id}: {e}")

    return {
        "status": "success",
        "nextOrderId": next_order_id,
        "message": f"Next customer notified for order {next_order_id}.",
    }


@router.post("/deactivate")
async def deactivate_tracking(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Mark driver's tracking session as inactive when order is delivered."""
    # Extract driver identity from JWT claims
    driver_id = current_user.get("empId") or current_user.get("sub")

    if not driver_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing empId in token claims",
        )

    order_id = body.get("orderId")
    if not order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="orderId is required",
        )

    # Set is_active=false for this driver's tracking session
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            UPDATE routes.driver_locations
            SET is_active = FALSE, updated_at = NOW()
            WHERE driver_id = %s
        """, (driver_id,))

    return {"status": "success"}


@public_router.get("/driver")
async def get_driver_location(
    orderId: str = Query(...),
    laundryId: str = Query(...),
):
    """Fetch current driver location for a customer's order. No auth required."""
    with get_db() as conn:
        cur = get_cursor(conn)

        # 1. Validate order belongs to laundryId and is in a trackable state
        cur.execute("""
            SELECT order_id, order_status, pickup_service, dropoff_service
            FROM orders.orders
            WHERE order_id = %s AND laundry_id = %s
        """, (orderId, laundryId))
        order = cur.fetchone()

        if not order:
            logger.warning(f"tracking/driver: order {orderId} not found for laundry {laundryId}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found",
            )

        order_status = order["order_status"]
        pickup_service = (order.get("pickup_service") or "LaundryDriver").strip()
        dropoff_service = (order.get("dropoff_service") or "LaundryDriver").strip()
        logger.info(f"tracking/driver: order={orderId}, status={order_status}, pickup_svc={pickup_service}, dropoff_svc={dropoff_service}")

        if not is_order_trackable(order_status, pickup_service, dropoff_service):
            logger.info(f"tracking/driver: FAIL at step 1 - not trackable. status={order_status}, pickup={pickup_service}, dropoff={dropoff_service}")
            return {"status": "unavailable", "reason": "not_active"}

        # 2. Look up driver assignment from routes.route_assignments
        cur.execute("""
            SELECT ra.driver_id, ra.sequence_position
            FROM routes.route_assignments ra
            WHERE ra.order_id = %s AND ra.laundry_id = %s
            ORDER BY ra.route_date DESC
            LIMIT 1
        """, (orderId, laundryId))
        assignment = cur.fetchone()

        if not assignment:
            # Fallback: find the active driver for this laundry (single-driver laundries)
            cur.execute("""
                SELECT driver_id FROM routes.driver_locations
                WHERE laundry_id = %s AND is_active = TRUE
                ORDER BY updated_at DESC LIMIT 1
            """, (laundryId,))
            active_driver = cur.fetchone()
            if not active_driver:
                logger.info(f"tracking/driver: FAIL at step 2 - no assignment AND no active driver for laundry {laundryId}")
                return {"status": "unavailable", "reason": "not_active"}
            driver_id = active_driver["driver_id"]
            customer_sequence_position = 1
            logger.info(f"tracking/driver: no assignment, using active driver fallback: {driver_id}")
        else:
            driver_id = assignment["driver_id"]
            customer_sequence_position = assignment["sequence_position"]
            logger.info(f"tracking/driver: found assignment, driver={driver_id}, seq={customer_sequence_position}")

        # 3. Fetch driver location
        cur.execute("""
            SELECT latitude, longitude, heading, speed, current_stop_position, updated_at
            FROM routes.driver_locations
            WHERE driver_id = %s AND is_active = TRUE
        """, (driver_id,))
        location = cur.fetchone()

        if not location:
            logger.info(f"tracking/driver: FAIL at step 3 - no active location for driver {driver_id}")
            return {"status": "unavailable", "reason": "not_active"}

        # 4. Check staleness
        updated_at = location["updated_at"]
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age_seconds = (now - updated_at).total_seconds()
        logger.info(f"tracking/driver: driver={driver_id}, location age={age_seconds:.0f}s, lat={location['latitude']}, lng={location['longitude']}")

        if is_location_stale(updated_at, now):
            logger.info(f"tracking/driver: FAIL at step 4 - stale data ({age_seconds:.0f}s old, threshold=120s)")
            return {"status": "unavailable", "reason": "stale_data"}

        # 5. Sequential activation check
        driver_current_stop = location["current_stop_position"]

        cur.execute("""
            SELECT COUNT(*) as remaining_stops
            FROM routes.route_assignments
            WHERE driver_id = %s AND laundry_id = %s AND status != 'completed'
              AND route_date = (
                  SELECT route_date FROM routes.route_assignments
                  WHERE order_id = %s AND laundry_id = %s
                  ORDER BY route_date DESC LIMIT 1
              )
        """, (driver_id, laundryId, orderId, laundryId))
        remaining_row = cur.fetchone()
        remaining_stops = remaining_row["remaining_stops"] if remaining_row else 0

        if not is_tracking_activated(driver_current_stop, customer_sequence_position, remaining_stops):
            logger.info(f"tracking/driver: FAIL at step 5 - not_your_turn. driver_pos={driver_current_stop}, customer_seq={customer_sequence_position}, remaining={remaining_stops}")
            return {"status": "unavailable", "reason": "not_your_turn"}

        # 6. Get driver name
        cur.execute("""
            SELECT first_name FROM shop.employees
            WHERE emp_id = %s
        """, (driver_id,))
        emp = cur.fetchone()
        driver_name = emp["first_name"] if emp else "Driver"

        logger.info(f"tracking/driver: SUCCESS - returning active location for driver {driver_name}")
        # 7. Return active driver location
        return {
            "status": "active",
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "heading": location["heading"],
            "speed": location["speed"],
            "updatedAt": updated_at.isoformat(),
            "driverName": driver_name,
        }
