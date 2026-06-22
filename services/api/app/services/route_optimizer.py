"""
Route optimizer service — wraps Google Maps Directions API
for waypoint optimization within a driver's cluster.
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def optimize_route_order(
    origin: str,
    destination: str,
    waypoints: list[dict],
    api_key: str = None,
) -> list[str]:
    """
    Call Google Maps Directions API with optimizeWaypoints=true
    to get the optimal stop order for a driver.

    Args:
        origin: Start address (typically the laundry address)
        destination: End address (typically the laundry address)
        waypoints: List of dicts with "orderId" and "address"
        api_key: Google Maps API key (uses settings if not provided)

    Returns:
        Ordered list of order IDs in optimized sequence.
        Falls back to input order on API error.
    """
    key = api_key or settings.google_maps_api_key

    if not key:
        logger.warning("Google Maps API key not configured, returning input order")
        return [w["orderId"] for w in waypoints]

    if len(waypoints) == 0:
        return []

    if len(waypoints) == 1:
        return [waypoints[0]["orderId"]]

    # Google Maps allows max 25 waypoints per request
    if len(waypoints) > 25:
        return await _optimize_large_route(origin, destination, waypoints, key)

    # Build waypoints string: "optimize:true|addr1|addr2|..."
    waypoint_addresses = "|".join(w["address"] for w in waypoints)
    waypoints_param = f"optimize:true|{waypoint_addresses}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params={
                    "origin": origin,
                    "destination": destination,
                    "waypoints": waypoints_param,
                    "key": key,
                },
            )

        data = response.json()

        if data.get("status") != "OK":
            logger.warning(f"Google Maps Directions API error: {data.get('status')} - {data.get('error_message', '')}")
            return [w["orderId"] for w in waypoints]

        # Extract optimized order from waypoint_order
        routes = data.get("routes", [])
        if not routes:
            return [w["orderId"] for w in waypoints]

        waypoint_order = routes[0].get("waypoint_order", [])
        if not waypoint_order:
            return [w["orderId"] for w in waypoints]

        # Reorder based on Google's optimization
        optimized = [waypoints[i]["orderId"] for i in waypoint_order]
        logger.info(f"Route optimized: {len(waypoints)} waypoints reordered")
        return optimized

    except Exception as e:
        logger.error(f"Google Maps Directions API call failed: {e}")
        return [w["orderId"] for w in waypoints]


async def _optimize_large_route(
    origin: str,
    destination: str,
    waypoints: list[dict],
    api_key: str,
) -> list[str]:
    """
    Handle routes with > 25 waypoints by splitting into sub-routes.
    Uses a simple geographic-order approach for large sets.
    """
    # For > 25 waypoints, split into chunks of 23 (leaving room for origin/destination)
    chunk_size = 23
    all_optimized = []

    for i in range(0, len(waypoints), chunk_size):
        chunk = waypoints[i:i + chunk_size]
        # Use the last stop of previous chunk as origin for next chunk
        chunk_origin = origin if i == 0 else waypoints[i - 1]["address"]
        chunk_dest = destination if i + chunk_size >= len(waypoints) else waypoints[min(i + chunk_size, len(waypoints) - 1)]["address"]

        optimized_chunk = await optimize_route_order(
            chunk_origin, chunk_dest, chunk, api_key
        )
        all_optimized.extend(optimized_chunk)

    return all_optimized


def build_google_maps_nav_url(
    origin: str,
    destination: str,
    waypoints: list[str],
) -> str:
    """
    Build a Google Maps navigation URL with waypoints in order.

    Args:
        origin: Start address
        destination: End address
        waypoints: Ordered list of addresses

    Returns:
        Google Maps URL for navigation
    """
    import urllib.parse

    base = "https://www.google.com/maps/dir/"
    parts = [urllib.parse.quote(origin)]

    for wp in waypoints:
        parts.append(urllib.parse.quote(wp))

    parts.append(urllib.parse.quote(destination))

    return base + "/".join(parts)
