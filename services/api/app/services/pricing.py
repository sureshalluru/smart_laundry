"""
Shared order billing math (tenant-pricing-phase2).

This is the single source of truth for turning an order's line items into
itemized lines and totals. Historically the `Σ(price × qty)` summation was
duplicated inline across 5 backend endpoints and 2 Stripe invoice builders with
no shared helper — a divergence risk this module removes.

DESIGN CONTRACT (money-critical):
- Pure functions — no DB, no I/O. Callers fetch rows, map to plain dicts, call
  these, then persist. This makes the arithmetic exhaustively unit-testable.
- Total-preserving by default: with `apply_minimums=False` and no add-ons/extras,
  `compute_order_billing` reproduces the EXACT legacy formula and rounding:
      sub_total = round( Σ(service_price × weight_or_count)
                       + Σ(product_price × product_count), 2 )
  and `apply_discount_tip_tax` mirrors the existing discount/tip/tax order.
- Minimums and add-ons only change results when explicitly enabled/supplied, so
  a tenant who opts into neither bills identically to before.

Rounding: to match the legacy code, individual line values are NOT pre-rounded;
only the aggregate sub_total (and each derived total) is rounded to 2 dp — same
as the inline sums being replaced.
"""

from typing import Optional


def _f(value) -> float:
    """Coerce a possibly-None / string numeric to float, defaulting to 0.0."""
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _channel_of(order_type) -> str:
    """Normalize an order's order_type to a billing channel: 'instore' or 'online'.

    InStore / walk-in / POS orders are 'instore'; everything else (Online,
    Commercial, subscription, etc.) is treated as 'online'.
    """
    ot = (str(order_type or "")).strip().lower()
    return "instore" if ot in ("instore", "in-store", "in store", "pos", "walkin", "walk-in") else "online"


def minimum_applies(min_weight_enabled: bool, min_weight_scope, order_type) -> bool:
    """Whether the minimum billable weight should apply to this order.

    True only when the tenant flag is on AND the tenant's scope
    ('all' | 'online' | 'instore') includes this order's channel. Unknown /
    missing scope is treated as 'all' (matches the "on = everywhere" default).
    """
    if not min_weight_enabled:
        return False
    scope = (str(min_weight_scope or "all")).strip().lower()
    if scope not in ("online", "instore"):
        return True  # 'all' or anything unexpected → apply everywhere
    return scope == _channel_of(order_type)


def billed_weight(actual, min_billable_weight, apply_minimum: bool) -> float:
    """Return the weight to bill for a per-pound line.

    When `apply_minimum` is True and a positive minimum is set, the billed
    weight is floored at the minimum; otherwise the actual weight is billed.
    The caller stores the *actual* weight separately — this only affects money.
    """
    actual_f = _f(actual)
    if apply_minimum:
        m = _f(min_billable_weight)
        if m > 0 and actual_f < m:
            return m
    return actual_f


def line_total_for_service(service_price, weight_or_count, input_weight=False,
                           min_billable_weight=None, apply_minimum: bool = False):
    """Compute (billed_qty, line_total) for one service line.

    For weight-based services (input_weight truthy) the minimum may apply; for
    count/piece services the qty is used as-is. line_total = price × billed_qty.
    """
    price = _f(service_price)
    if input_weight:
        qty = billed_weight(weight_or_count, min_billable_weight, apply_minimum)
    else:
        qty = _f(weight_or_count)
    return qty, price * qty


def compute_order_billing(services=None, products=None, addons=None, extras=None,
                          apply_minimums: bool = False) -> dict:
    """Compute itemized lines and sub_total for an order.

    Args:
        services: [{price|service_price, qty|weight_or_count, input_weight,
                    min_billable_weight, name?}]
        products: [{price|product_price, count|product_count, name?}]
        addons:   [{unit_price, pricing_basis: 'per_pound'|'per_item',
                    quantity?, name?}] — per_pound multiplies by the order's
                    billed weight (see basis_billed_weight below); per_item uses quantity.
        extras:   [{unit_price|price, count|quantity, name?}] — per-item processing
                    extras (same shape as products).
        apply_minimums: when True, weight-based service lines honor
                    min_billable_weight; when False, no floor (legacy behavior).

    Returns:
        {"lines": [{"kind","name","qty","unit_price","amount"}...],
         "sub_total": float,
         "billed_weight_total": float}   # summed billed weight of per-pound services

    Per-pound add-ons are priced against `billed_weight_total` — the post-minimum
    billed weight of the order's weight-based services — so a minimum also floors
    the add-on (P2.3).
    """
    services = services or []
    products = products or []
    addons = addons or []
    extras = extras or []

    lines = []
    billed_weight_total = 0.0

    # IMPORTANT (total-preserving): the legacy inline code summed each group with
    # Python's built-in sum() over a generator of (price × qty), then combined
    # groups: round(svc_sum + prod_sum, 2). Because float addition is not
    # associative, we must reproduce BOTH the per-group sum() accumulation AND the
    # group-combination order to land on the exact same last-digit result (a naive
    # manual += loop can differ by 1 ULP and flip a .005 rounding boundary).
    # We therefore build each line, then sum the line amounts per group with sum().

    # Services (per-pound honoring minimum, or per-piece)
    for s in services:
        price = _f(s.get("price", s.get("service_price")))
        input_weight = bool(s.get("input_weight"))
        qty, amount = line_total_for_service(
            price,
            s.get("qty", s.get("weight_or_count")),
            input_weight=input_weight,
            min_billable_weight=s.get("min_billable_weight"),
            apply_minimum=apply_minimums,
        )
        if input_weight:
            billed_weight_total += qty
        lines.append({
            "kind": "service",
            "name": s.get("name", s.get("service_name", "")),
            "qty": qty,
            "unit_price": price,
            "amount": amount,
            "input_weight": input_weight,
        })

    # Products (flat × count)
    for p in products:
        price = _f(p.get("price", p.get("product_price")))
        count = _f(p.get("count", p.get("product_count")))
        lines.append({
            "kind": "product",
            "name": p.get("name", p.get("product_name", "")),
            "qty": count,
            "unit_price": price,
            "amount": price * count,
            "input_weight": False,
        })

    # Add-ons (per-pound on the order's billed weight, or per-item)
    for a in addons:
        unit_price = _f(a.get("unit_price", a.get("price")))
        basis = a.get("pricing_basis", "per_item")
        if basis == "per_pound":
            qty = billed_weight_total
        else:
            qty = _f(a.get("quantity", a.get("count")))
        lines.append({
            "kind": "addon",
            "name": a.get("name", a.get("addon_name", "")),
            "qty": qty,
            "unit_price": unit_price,
            "amount": unit_price * qty,
            "input_weight": False,
            "pricing_basis": basis,
        })

    # Per-item processing extras (same shape as products)
    for e in extras:
        unit_price = _f(e.get("unit_price", e.get("price")))
        count = _f(e.get("count", e.get("quantity")))
        lines.append({
            "kind": "extra",
            "name": e.get("name", ""),
            "qty": count,
            "unit_price": unit_price,
            "amount": unit_price * count,
            "input_weight": False,
        })

    # Per-group sums via built-in sum() to match legacy accumulation exactly.
    svc_sum = sum(l["amount"] for l in lines if l["kind"] == "service")
    prod_sum = sum(l["amount"] for l in lines if l["kind"] == "product")
    addon_sum = sum(l["amount"] for l in lines if l["kind"] == "addon")
    extra_sum = sum(l["amount"] for l in lines if l["kind"] == "extra")

    return {
        "lines": lines,
        "sub_total": round(svc_sum + prod_sum + addon_sum + extra_sum, 2),
        "billed_weight_total": billed_weight_total,
    }


def apply_discount_tip_tax(sub_total: float,
                           discounted_price: float = 0.0,
                           tip_amount: float = 0.0,
                           tax_amount: float = 0.0,
                           delivery_fee: float = 0.0) -> dict:
    """Derive total_cost / grand_total from sub_total, mirroring legacy order.

    Matches the existing inline logic exactly, with the Phase-3 delivery fee
    folded in AFTER tip and tax:
        total_cost  = round(sub_total - discounted_price, 2) if discount>0 else sub_total
        grand_total = round(total_cost + tip_amount + tax_amount + delivery_fee, 2)

    `delivery_fee` defaults to 0.0, so callers that don't pass it (and orders
    with no fee) produce a byte-identical result to the pre-Phase-3 formula.
    The delivery fee is NOT part of sub_total or total_cost — it's an add-on to
    the grand total, like tip/tax.

    Callers still compute the discount/tip/tax/fee amounts themselves — this
    only assembles the totals so the assembly is consistent everywhere.
    """
    st = round(_f(sub_total), 2)
    disc = _f(discounted_price)
    tip = _f(tip_amount)
    tax = _f(tax_amount)
    fee = _f(delivery_fee)
    total_cost = round(st - disc, 2) if disc > 0 else st
    grand_total = round(total_cost + tip + tax + fee, 2)
    return {
        "sub_total": st,
        "total_cost": total_cost,
        "grand_total": grand_total,
        "delivery_fee": round(fee, 2),
    }
