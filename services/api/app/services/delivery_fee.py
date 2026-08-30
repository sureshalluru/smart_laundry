"""
Distance/flat delivery fee math (tenant-pricing-phase3).

Pure functions — no DB, no I/O — so the fee arithmetic is exhaustively
unit-testable without a database or network. Callers fetch the tenant config +
resolve distance, then call these.

DESIGN CONTRACT (money-critical):
- The tenant chooses a MODE: 'none' | 'flat' | 'distance'.
    none     -> never charges; no distance lookup needed.
    flat     -> one fixed fee per delivery; no distance lookup needed.
    distance -> base + per-mile with an optional free radius, cap, and a
                road-factor multiplier applied to the straight-line miles.
- Default is 'none', so a tenant that configures nothing charges nothing and
  bills byte-identically to before Phase 3.
- Fail-open: in 'distance' mode, if the distance is unavailable (None — e.g. an
  address couldn't be geocoded) the fee is 0.0 and applies is False, so a
  lookup failure never blocks or inflates an order.

Only the returned `fee` is rounded (to 2 dp); intermediate miles are not
pre-rounded.
"""
from math import radians, sin, cos, asin, sqrt
from typing import Optional

# Mean Earth radius in miles (matches common haversine references).
EARTH_RADIUS_MI = 3958.7613

VALID_MODES = ("none", "flat", "distance")


def _f(value) -> float:
    """Coerce a possibly-None / string numeric to float, defaulting to 0.0."""
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _coord(value) -> Optional[float]:
    """Coerce a coordinate to float, or None if missing/invalid.

    Distinct from _f: a missing coordinate must stay None (so haversine can
    signal "unavailable"), not silently become 0.0 (a valid point off Africa).
    """
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def haversine_miles(lat1, lng1, lat2, lng2) -> Optional[float]:
    """Great-circle distance in miles between two lat/lng points.

    Pure. Returns None if ANY coordinate is missing/invalid (caller treats None
    as "distance unavailable" and fails open to a $0 fee). Returns 0.0 for
    identical points.
    """
    a1, o1, a2, o2 = _coord(lat1), _coord(lng1), _coord(lat2), _coord(lng2)
    if a1 is None or o1 is None or a2 is None or o2 is None:
        return None

    rlat1, rlat2 = radians(a1), radians(a2)
    dlat = radians(a2 - a1)
    dlng = radians(o2 - o1)
    h = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MI * asin(sqrt(h))


def _normalize_mode(mode) -> str:
    m = (str(mode or "none")).strip().lower()
    return m if m in VALID_MODES else "none"


def compute_delivery_fee(mode, distance_mi=None, config=None) -> dict:
    """Compute the delivery fee for one order.

    Args:
        mode: 'none' | 'flat' | 'distance' (anything else → 'none').
        distance_mi: straight-line miles between shop and delivery address.
            Only used in 'distance' mode. None = unavailable (fail-open to $0).
        config: {
            "flat": float,            # 'flat' mode amount
            "base": float,            # 'distance' mode base fee
            "per_mile": float,        # 'distance' mode per-mile rate
            "free_radius_mi": float,  # 'distance' mode: first N miles free
            "max_cap": float | None,  # 'distance' mode: cap (None = no cap)
            "road_factor": float,     # 'distance' mode: straight-line → road (default 1.0)
        }

    Returns:
        {
          "mode": str,
          "applies": bool,           # True when a positive fee is charged
          "distance_mi": float|None, # the input distance for 'distance' mode, else None
          "billable_miles": float,   # miles charged after free radius (0 otherwise)
          "fee": float,              # rounded to 2 dp
        }
    """
    m = _normalize_mode(mode)
    cfg = config or {}

    result = {
        "mode": m,
        "applies": False,
        "distance_mi": None,
        "billable_miles": 0.0,
        "fee": 0.0,
    }

    if m == "none":
        return result

    if m == "flat":
        fee = round(_f(cfg.get("flat")), 2)
        result["fee"] = fee
        result["applies"] = fee > 0
        return result

    # m == "distance"
    if distance_mi is None:
        # Distance unavailable — fail open to $0 (never block/inflate an order).
        return result

    dist = _f(distance_mi)
    road_factor = _f(cfg.get("road_factor")) or 1.0
    free_radius = _f(cfg.get("free_radius_mi"))
    base = _f(cfg.get("base"))
    per_mile = _f(cfg.get("per_mile"))
    max_cap = cfg.get("max_cap")

    road_dist = road_factor * dist
    billable = max(0.0, road_dist - free_radius)
    fee = base + billable * per_mile
    if max_cap is not None and str(max_cap) != "":
        cap = _f(max_cap)
        if cap > 0:
            fee = min(fee, cap)
    fee = round(fee, 2)

    result["distance_mi"] = round(dist, 2)
    result["billable_miles"] = round(billable, 2)
    result["fee"] = fee
    result["applies"] = fee > 0
    return result
