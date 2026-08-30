"""
Unit tests for the shared billing helper (tenant-pricing-phase2, sub-phase 2a).

The critical guarantee: with apply_minimums=False and no add-ons/extras, the
helper reproduces the EXACT legacy inline formula:
    sub_total = round(Σ(service_price × weight_or_count)
                    + Σ(product_price × product_count), 2)
so routing every total site through it changes no existing order's total.

Also covers minimum floors and per-pound/per-item add-ons for later sub-phases.

Validates: Requirements P3.3, P3.4, P1.2, P1.5, P2.1, P2.3, P2.5, P2.9
"""
import random

from app.services.pricing import (
    compute_order_billing,
    apply_discount_tip_tax,
    line_total_for_service,
    billed_weight,
    minimum_applies,
)


class TestMinimumApplies:
    """Order-type scoping for the minimum billable weight (all|online|instore)."""

    def test_flag_off_never_applies(self):
        for scope in ("all", "online", "instore"):
            for ot in ("Online", "InStore", "Commercial"):
                assert minimum_applies(False, scope, ot) is False

    def test_scope_all_applies_everywhere(self):
        assert minimum_applies(True, "all", "Online") is True
        assert minimum_applies(True, "all", "InStore") is True
        assert minimum_applies(True, "all", "Commercial") is True

    def test_scope_instore_only(self):
        assert minimum_applies(True, "instore", "InStore") is True
        assert minimum_applies(True, "instore", "Online") is False
        assert minimum_applies(True, "instore", "Commercial") is False  # online-channel

    def test_scope_online_only(self):
        assert minimum_applies(True, "online", "Online") is True
        assert minimum_applies(True, "online", "Commercial") is True   # online-channel
        assert minimum_applies(True, "online", "InStore") is False

    def test_unknown_scope_defaults_to_all(self):
        assert minimum_applies(True, None, "InStore") is True
        assert minimum_applies(True, "", "Online") is True
        assert minimum_applies(True, "garbage", "InStore") is True

    def test_instore_aliases(self):
        for ot in ("InStore", "in-store", "in store", "POS", "walkin", "walk-in"):
            assert minimum_applies(True, "instore", ot) is True


def _legacy_sub_total(services, products):
    """The exact inline formula the codebase used before the helper."""
    svc = sum(float(s.get("service_price") or 0) * float(s.get("weight_or_count") or 0) for s in services)
    prod = sum(float(p.get("product_price") or 0) * float(p.get("product_count") or 0) for p in products)
    return round(svc + prod, 2)


class TestTotalPreserving:
    def test_matches_legacy_simple(self):
        services = [{"service_price": 1.59, "weight_or_count": 12.5, "input_weight": True}]
        products = [{"product_price": 3.00, "product_count": 2}]
        res = compute_order_billing(services=services, products=products)
        assert res["sub_total"] == _legacy_sub_total(services, products)
        assert res["sub_total"] == round(1.59 * 12.5 + 3.00 * 2, 2)

    def test_matches_legacy_services_only(self):
        services = [
            {"service_price": 2.0, "weight_or_count": 10, "input_weight": True},
            {"service_price": 5.0, "weight_or_count": 3, "input_weight": False},
        ]
        res = compute_order_billing(services=services, products=[])
        assert res["sub_total"] == _legacy_sub_total(services, [])

    def test_matches_legacy_empty(self):
        res = compute_order_billing(services=[], products=[])
        assert res["sub_total"] == 0.0

    def test_matches_legacy_randomized(self):
        """Property-style: for many random orders across seeds, helper == legacy
        formula EXACTLY (guards the float-accumulation / rounding-boundary risk)."""
        for seed in range(20):
            rng = random.Random(seed)
            for _ in range(500):
                services = [
                    {"service_price": round(rng.uniform(0.5, 5.0), 2),
                     "weight_or_count": round(rng.uniform(0, 40), 1),
                     "input_weight": rng.choice([True, False])}
                    for _ in range(rng.randint(0, 4))
                ]
                products = [
                    {"product_price": round(rng.uniform(1, 30), 2),
                     "product_count": rng.randint(1, 5)}
                    for _ in range(rng.randint(0, 3))
                ]
                res = compute_order_billing(services=services, products=products)
                assert res["sub_total"] == _legacy_sub_total(services, products)

    def test_none_and_string_values_coerced(self):
        services = [{"service_price": None, "weight_or_count": None, "input_weight": True}]
        products = [{"product_price": "2.50", "product_count": "3"}]
        res = compute_order_billing(services=services, products=products)
        assert res["sub_total"] == round(2.50 * 3, 2)


class TestApplyDiscountTipTax:
    def test_no_discount(self):
        r = apply_discount_tip_tax(100.0, discounted_price=0, tip_amount=5, tax_amount=0)
        assert r["total_cost"] == 100.0
        assert r["grand_total"] == 105.0

    def test_with_discount_and_tax(self):
        r = apply_discount_tip_tax(100.0, discounted_price=10, tip_amount=5, tax_amount=8.55)
        assert r["total_cost"] == 90.0
        assert r["grand_total"] == round(90.0 + 5 + 8.55, 2)

    def test_matches_legacy_assembly(self):
        # legacy: total_cost = sub - disc (if disc>0); grand = total + tip (+ tax)
        sub, disc, tip = 47.70, 0, 9.54
        r = apply_discount_tip_tax(sub, disc, tip)
        assert r["total_cost"] == 47.70
        assert r["grand_total"] == round(47.70 + 9.54, 2)


class TestMinimumWeight:
    def test_floor_applied_when_under_min(self):
        qty, total = line_total_for_service(1.59, 15, input_weight=True,
                                            min_billable_weight=20, apply_minimum=True)
        assert qty == 20
        assert total == round(1.59 * 20, 2) or total == 1.59 * 20

    def test_no_floor_when_over_min(self):
        qty, total = line_total_for_service(1.59, 25, input_weight=True,
                                            min_billable_weight=20, apply_minimum=True)
        assert qty == 25

    def test_no_floor_when_disabled(self):
        qty, _ = line_total_for_service(1.59, 15, input_weight=True,
                                        min_billable_weight=20, apply_minimum=False)
        assert qty == 15  # apply_minimum False → actual weight billed

    def test_no_floor_for_piece_service(self):
        qty, _ = line_total_for_service(5.0, 2, input_weight=False,
                                        min_billable_weight=20, apply_minimum=True)
        assert qty == 2  # minimum only applies to weight-based

    def test_billed_weight_helper(self):
        assert billed_weight(15, 20, True) == 20
        assert billed_weight(25, 20, True) == 25
        assert billed_weight(15, 20, False) == 15
        assert billed_weight(15, 0, True) == 15   # no minimum set

    def test_order_billing_with_minimum(self):
        services = [{"service_price": 1.59, "weight_or_count": 15, "input_weight": True,
                     "min_billable_weight": 20}]
        res = compute_order_billing(services=services, apply_minimums=True)
        assert res["sub_total"] == round(1.59 * 20, 2)
        assert res["billed_weight_total"] == 20

    def test_order_billing_minimum_disabled_is_legacy(self):
        services = [{"service_price": 1.59, "weight_or_count": 15, "input_weight": True,
                     "min_billable_weight": 20}]
        res = compute_order_billing(services=services, apply_minimums=False)
        assert res["sub_total"] == round(1.59 * 15, 2)  # floor ignored

    def test_mixed_order_only_underweight_weight_services_floor(self):
        # Mirrors a real order: one weight-based service under its min, one over
        # its min, one piece-based service, and a product. Only the under-min
        # weight-based line should be floored; everything else billed as-is.
        services = [
            {"service_name": "Wash & Fold", "service_price": 1.59, "weight_or_count": 12,
             "input_weight": True, "min_billable_weight": 20},   # floored → 20
            {"service_name": "Bulky", "service_price": 2.00, "weight_or_count": 30,
             "input_weight": True, "min_billable_weight": 20},   # over min → 30
            {"service_name": "Comforter", "service_price": 8.00, "weight_or_count": 2,
             "input_weight": False, "min_billable_weight": 20},  # piece → 2
        ]
        products = [{"product_price": 3.00, "product_count": 2}]
        res = compute_order_billing(services=services, products=products, apply_minimums=True)
        expected = round(1.59 * 20 + 2.00 * 30 + 8.00 * 2 + 3.00 * 2, 2)
        assert res["sub_total"] == expected
        assert res["billed_weight_total"] == 20 + 30  # only weight-based lines

    def test_null_min_never_floors_even_when_enabled(self):
        # A service with no configured minimum must bill actual weight even when
        # the tenant flag is on (guards the common "flag on, service not set" case).
        services = [{"service_price": 1.59, "weight_or_count": 8, "input_weight": True,
                     "min_billable_weight": None}]
        res = compute_order_billing(services=services, apply_minimums=True)
        assert res["sub_total"] == round(1.59 * 8, 2)


class TestAddons:
    def test_per_pound_addon_uses_billed_weight(self):
        services = [{"service_price": 1.59, "weight_or_count": 20, "input_weight": True}]
        addons = [{"addon_name": "Softener", "pricing_basis": "per_pound", "unit_price": 0.25}]
        res = compute_order_billing(services=services, addons=addons)
        # add-on bills 0.25 * 20 lb
        addon_line = [l for l in res["lines"] if l["kind"] == "addon"][0]
        assert addon_line["amount"] == round(0.25 * 20, 2) or addon_line["amount"] == 0.25 * 20
        assert res["sub_total"] == round(1.59 * 20 + 0.25 * 20, 2)

    def test_per_pound_addon_respects_minimum(self):
        services = [{"service_price": 1.59, "weight_or_count": 15, "input_weight": True,
                     "min_billable_weight": 20}]
        addons = [{"pricing_basis": "per_pound", "unit_price": 0.25}]
        res = compute_order_billing(services=services, addons=addons, apply_minimums=True)
        # both service and add-on priced on floored 20 lb
        assert res["sub_total"] == round(1.59 * 20 + 0.25 * 20, 2)

    def test_per_item_addon(self):
        addons = [{"pricing_basis": "per_item", "unit_price": 0.50, "quantity": 3}]
        res = compute_order_billing(services=[], addons=addons)
        assert res["sub_total"] == round(0.50 * 3, 2)

    def test_per_item_extra(self):
        extras = [{"name": "Hanger", "unit_price": 0.15, "count": 5}]
        res = compute_order_billing(services=[], extras=extras)
        assert res["sub_total"] == round(0.15 * 5, 2)

    def test_no_addons_no_extras_is_legacy(self):
        services = [{"service_price": 2.0, "weight_or_count": 10, "input_weight": True}]
        res = compute_order_billing(services=services, addons=[], extras=[])
        assert res["sub_total"] == round(2.0 * 10, 2)
