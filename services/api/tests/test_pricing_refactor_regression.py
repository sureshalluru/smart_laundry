"""
Regression guard for the sub-phase 2a refactor (tenant-pricing-phase2).

The 3 server-side recompute sites (employee_update_services, orders_info
update-order, item_tracking detect_weight) and the 2 Stripe invoice builders
were changed to call compute_order_billing instead of inline `price × weight`.
These tests assert that the exact row→dict mapping those sites use produces the
same sub_total and the same per-line invoice amounts as the legacy inline math,
so the refactor cannot have shifted any live total.

Validates: Requirements P3.2, P3.4
"""
import random

from app.services.pricing import compute_order_billing


def _legacy_sub_total(svc_rows, prod_rows):
    svc = sum(float(r["service_price"] or 0) * float(r["weight_or_count"] or 0) for r in svc_rows)
    prod = sum(float(r["product_price"] or 0) * float(r["product_count"] or 0) for r in prod_rows)
    return round(svc + prod, 2)


def _map_and_compute(svc_rows, prod_rows):
    """Mirror the exact mapping the routed endpoints use."""
    return compute_order_billing(
        services=[{"service_price": r["service_price"], "weight_or_count": r["weight_or_count"]} for r in svc_rows],
        products=[{"product_price": r["product_price"], "product_count": r["product_count"]} for r in prod_rows],
        apply_minimums=False,
    )["sub_total"]


class TestRecomputeSitesTotalPreserving:
    def test_matches_legacy_across_random_orders(self):
        for seed in range(15):
            rng = random.Random(seed)
            for _ in range(300):
                svc_rows = [
                    {"service_price": round(rng.uniform(0.5, 6.0), 2),
                     "weight_or_count": round(rng.uniform(0, 45), 1)}
                    for _ in range(rng.randint(0, 4))
                ]
                prod_rows = [
                    {"product_price": round(rng.uniform(1, 40), 2),
                     "product_count": rng.randint(1, 6)}
                    for _ in range(rng.randint(0, 3))
                ]
                assert _map_and_compute(svc_rows, prod_rows) == _legacy_sub_total(svc_rows, prod_rows)

    def test_null_rows_coerced_like_legacy(self):
        svc_rows = [{"service_price": None, "weight_or_count": None}]
        prod_rows = [{"product_price": None, "product_count": None}]
        assert _map_and_compute(svc_rows, prod_rows) == _legacy_sub_total(svc_rows, prod_rows) == 0.0


class TestStripeLineAmountsTotalPreserving:
    def test_invoice_line_cents_match_legacy_per_row(self):
        """Each helper line's cents == the legacy per-row cents the builders used."""
        rng = random.Random(7)
        for _ in range(300):
            svc_rows = [
                {"service_price": round(rng.uniform(0.5, 6.0), 2),
                 "weight_or_count": round(rng.uniform(0, 45), 1),
                 "input_weight": True, "service_name": "S"}
                for _ in range(rng.randint(0, 3))
            ]
            prod_rows = [
                {"product_price": round(rng.uniform(1, 40), 2),
                 "product_count": rng.randint(1, 6), "product_name": "P"}
                for _ in range(rng.randint(0, 3))
            ]
            billing = compute_order_billing(
                services=[{"service_price": s["service_price"], "weight_or_count": s["weight_or_count"],
                           "input_weight": s["input_weight"], "service_name": s["service_name"]} for s in svc_rows],
                products=[{"product_price": p["product_price"], "product_count": p["product_count"],
                           "product_name": p["product_name"]} for p in prod_rows],
                apply_minimums=False,
            )
            helper_svc_cents = [int(round(float(l["amount"]) * 100)) for l in billing["lines"] if l["kind"] == "service"]
            helper_prod_cents = [int(round(float(l["amount"]) * 100)) for l in billing["lines"] if l["kind"] == "product"]

            legacy_svc_cents = [int(round(float(s["service_price"] or 0) * float(s["weight_or_count"] or 0) * 100)) for s in svc_rows]
            legacy_prod_cents = [int(round(float(p["product_price"] or 0) * int(p["product_count"] or 1) * 100)) for p in prod_rows]

            assert helper_svc_cents == legacy_svc_cents
            assert helper_prod_cents == legacy_prod_cents
