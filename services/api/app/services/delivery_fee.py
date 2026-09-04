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

VALID_MODES = ("none", "flat", "distance", "tiered")


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


def _normalize_tiers(tiers) -> list:
    """Coerce a raw tiers config into a clean, ascending list of brackets.

    Each input bracket is a dict with:
        up_to_mi     -> upper bound of the bracket in miles (None/""/<=0 on the
                        LAST bracket means "and above", i.e. open-ended).
        flat         -> fixed fee for orders that fall in this bracket.
        per_mile_over-> per-mile rate charged on miles beyond the PREVIOUS
                        bracket's upper bound (0 for the first).

    Accepts both snake_case and camelCase keys so it can consume the DB JSON or
    a raw API body without a translation layer. Brackets are sorted ascending
    by their finite upper bound; any bracket with a missing/blank/<=0 upper
    bound is treated as the open-ended top bracket and sorted last.

    Returns a list of {"up_to": float|None, "flat": float, "per_mile_over": float}.
    """
    if not isinstance(tiers, (list, tuple)):
        return []

    cleaned = []
    for t in tiers:
        if not isinstance(t, dict):
            continue
        raw_up = t.get("up_to_mi", t.get("upToMi", t.get("up_to")))
        if raw_up in (None, "", "null"):
            up_to = None
        else:
            try:
                v = float(raw_up)
                up_to = v if v > 0 else None
            except (TypeError, ValueError):
                up_to = None
        flat = _f(t.get("flat"))
        per_mile_over = _f(t.get("per_mile_over", t.get("perMileOver")))
        cleaned.append({"up_to": up_to, "flat": flat, "per_mile_over": per_mile_over})

    # Sort finite bounds ascending; open-ended (None) brackets go last.
    cleaned.sort(key=lambda b: (b["up_to"] is None, b["up_to"] if b["up_to"] is not None else 0.0))
    return cleaned


def compute_tiered_fee(distance_mi, tiers) -> tuple:
    """Compute a bracketed delivery fee for a (road-adjusted) distance.

    Pure. Walks ascending brackets and charges the FIRST bracket whose upper
    bound the distance falls within (<= up_to), or the open-ended top bracket
    if the distance exceeds every finite bound. Within the matched bracket:

        fee = flat + per_mile_over * max(0, distance - previous_upper_bound)

    Example (Shelly's structure), distance already road-adjusted in miles:
        [{up_to:10, flat:0,  per_mile_over:0},      # 0–10  -> free
         {up_to:20, flat:15, per_mile_over:0},      # 10–20 -> $15 flat
         {up_to:30, flat:15, per_mile_over:1.50},   # 20–30 -> $15 + $1.50/mi over 20
         {up_to:None, flat:25, per_mile_over:2.0}]  # 30+   -> $25 + $2/mi over 30

    Args:
        distance_mi: road-adjusted miles (caller applies road_factor). If None
            or no brackets are configured, returns (0.0, 0.0) — fail open.
        tiers: raw bracket list (see _normalize_tiers).

    Returns:
        (fee, billable_miles) — fee rounded to 2 dp; billable_miles is the
        portion charged per-mile within the matched bracket (0 when the bracket
        is flat-only). Returns (0.0, 0.0) when no bracket applies.
    """
    if distance_mi is None:
        return 0.0, 0.0
    brackets = _normalize_tiers(tiers)
    if not brackets:
        return 0.0, 0.0

    dist = _f(distance_mi)
    prev_bound = 0.0
    for b in brackets:
        up_to = b["up_to"]
        in_bracket = up_to is None or dist <= up_to
        if in_bracket:
            billable = max(0.0, dist - prev_bound)
            fee = b["flat"] + billable * b["per_mile_over"]
            return round(fee, 2), round(billable, 2)
        prev_bound = up_to

    # Distance exceeds every finite bound and there was no open-ended bracket.
    # Charge the last (highest) finite bracket's flat + per-mile beyond its
    # lower edge, so a missing "and above" row never silently drops the fee.
    last = brackets[-1]
    lower = 0.0
    if len(brackets) >= 2:
        lower = brackets[-2]["up_to"] or 0.0
    billable = max(0.0, dist - lower)
    fee = last["flat"] + billable * last["per_mile_over"]
    return round(fee, 2), round(billable, 2)


def compute_delivery_fee(mode, distance_mi=None, config=None) -> dict:
    """Compute the delivery fee for one order.

    Args:
        mode: 'none' | 'flat' | 'distance' | 'tiered' (anything else → 'none').
        distance_mi: straight-line miles between shop and delivery address.
            Used in 'distance' and 'tiered' modes. None = unavailable
            (fail-open to $0).
        config: {
            "flat": float,            # 'flat' mode amount
            "base": float,            # 'distance' mode base fee
            "per_mile": float,        # 'distance' mode per-mile rate
            "free_radius_mi": float,  # 'distance' mode: first N miles free
            "max_cap": float | None,  # 'distance' mode: cap (None = no cap)
            "road_factor": float,     # 'distance'/'tiered': straight-line → road (default 1.0)
            "tiers": list,            # 'tiered' mode: bracket list (see compute_tiered_fee)
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

    if m == "tiered":
        # Bracket pricing on road-adjusted miles. Fail open to $0 when distance
        # is unavailable, exactly like 'distance' mode.
        if distance_mi is None:
            return result
        dist = _f(distance_mi)
        road_factor = _f(cfg.get("road_factor")) or 1.0
        road_dist = road_factor * dist
        fee, billable = compute_tiered_fee(road_dist, cfg.get("tiers"))
        result["distance_mi"] = round(dist, 2)
        result["billable_miles"] = round(billable, 2)
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


# ─── Distance resolver (does the I/O; kept separate from the pure math) ──────
#
# This is the only part of the module that touches the DB / network. It reuses
# the existing geocode cache (routes.geocode_cache) and the synchronous Google
# geocoder from the Uber integration, so 'distance' mode adds no new external
# dependency beyond what the app already uses. Everything above stays pure.

import logging as _logging

_logger = _logging.getLogger(__name__)


def _geocode_sync(address):
    """Geocode an address to (lat, lng) using the shared Google geocoder.

    Returns (lat, lng) or None on any failure (missing key, no result,
    network error). Never raises to the caller.
    """
    if not address or not str(address).strip():
        return None
    try:
        from app.routes.uber import get_coordinates_from_address
        return get_coordinates_from_address(address)
    except Exception as e:
        _logger.warning(f"delivery_fee geocode failed for {address!r}: {e}")
        return None


def resolve_distance_miles(conn, shop_row, address_text):
    """Resolve straight-line miles between the shop and a delivery address.

    Shop coordinates come from shop_row.latitude/longitude when present; else
    the shop's street/city/state/zip is geocoded once and persisted back onto
    laundry_shops (so subsequent orders skip the geocode). The delivery address
    is geocoded through the existing routes.geocode_cache.

    Args:
        conn: an open DB connection (caller owns the transaction).
        shop_row: a dict-like row with latitude/longitude and the address parts
                  (street, city, state, zip_code) + laundry_id.
        address_text: the customer's delivery address string.

    Returns:
        float miles, or None if either endpoint can't be resolved (caller then
        fails open to a $0 fee). Never raises.
    """
    try:
        from app.database import get_cursor
        from app.routes.route_planning import _get_cached_geocode, _save_geocode_cache
    except Exception as e:
        _logger.warning(f"delivery_fee resolver imports failed: {e}")
        return None

    # ── Shop coordinates (use stored lat/lng, else geocode once + persist) ──
    shop_lat = _coord(shop_row.get("latitude"))
    shop_lng = _coord(shop_row.get("longitude"))
    if shop_lat is None or shop_lng is None:
        parts = [shop_row.get("street"), shop_row.get("city"),
                 shop_row.get("state"), shop_row.get("zip_code")]
        shop_addr = ", ".join(str(p).strip() for p in parts if p and str(p).strip())
        coords = _geocode_sync(shop_addr) if shop_addr else None
        if not coords:
            return None
        shop_lat, shop_lng = coords[0], coords[1]
        # Persist onto the shop so we don't geocode it again next time.
        lid = shop_row.get("laundry_id")
        if lid is not None:
            try:
                cur = get_cursor(conn)
                cur.execute(
                    "UPDATE shop.laundry_shops SET latitude = %s, longitude = %s WHERE laundry_id = %s",
                    (shop_lat, shop_lng, lid),
                )
            except Exception as e:
                _logger.warning(f"delivery_fee: failed to persist shop coords for {lid}: {e}")

    # ── Delivery address coordinates (via the shared geocode cache) ─────────
    addr = (address_text or "").strip()
    if not addr:
        return None
    cust_lat = cust_lng = None
    try:
        cached = _get_cached_geocode(conn, addr)
    except Exception:
        cached = None
    if cached:
        cust_lat = _coord(cached.get("latitude"))
        cust_lng = _coord(cached.get("longitude"))
    if cust_lat is None or cust_lng is None:
        coords = _geocode_sync(addr)
        if not coords:
            return None
        cust_lat, cust_lng = coords[0], coords[1]
        try:
            _save_geocode_cache(conn, addr, cust_lat, cust_lng)
        except Exception:
            pass  # caching is best-effort

    return haversine_miles(shop_lat, shop_lng, cust_lat, cust_lng)
