"""
Unit tests for the pure delivery-fee math (tenant-pricing-phase3, Group A).

Covers haversine distance and the three-mode fee dispatch (none / flat /
distance), including free radius, cap, road factor, and the fail-open behavior
when distance is unavailable.

Validates: Requirements P1.2, P1.6, P2.1, P2.8, P2.9, P2.10, P2.11
"""
import math

from app.services.delivery_fee import haversine_miles, compute_delivery_fee


class TestHaversine:
    def test_identical_points_zero(self):
        assert haversine_miles(30.5, -97.7, 30.5, -97.7) == 0.0

    def test_missing_coord_returns_none(self):
        assert haversine_miles(None, -97.7, 30.5, -97.7) is None
        assert haversine_miles(30.5, None, 30.5, -97.7) is None
        assert haversine_miles(30.5, -97.7, None, -97.7) is None
        assert haversine_miles(30.5, -97.7, 30.5, "") is None

    def test_known_distance_approx(self):
        # Round Rock, TX (~30.5083, -97.6789) to downtown Austin (~30.2672, -97.7431)
        # is roughly 17 miles straight-line. Allow generous tolerance.
        d = haversine_miles(30.5083, -97.6789, 30.2672, -97.7431)
        assert d is not None
        assert 15 < d < 20

    def test_one_degree_latitude_about_69_miles(self):
        # One degree of latitude is ~69 miles anywhere on Earth.
        d = haversine_miles(30.0, -97.0, 31.0, -97.0)
        assert abs(d - 69.0) < 1.5

    def test_string_coords_coerced(self):
        d = haversine_miles("30.0", "-97.0", "31.0", "-97.0")
        assert d is not None and abs(d - 69.0) < 1.5


class TestModeNone:
    def test_none_mode_never_charges(self):
        r = compute_delivery_fee("none", distance_mi=50, config={"flat": 5, "base": 3, "per_mile": 1})
        assert r["applies"] is False
        assert r["fee"] == 0.0
        assert r["distance_mi"] is None

    def test_unknown_mode_treated_as_none(self):
        r = compute_delivery_fee("weird", distance_mi=50, config={"flat": 5})
        assert r["mode"] == "none"
        assert r["fee"] == 0.0

    def test_none_default_when_missing(self):
        assert compute_delivery_fee(None)["fee"] == 0.0


class TestModeFlat:
    def test_flat_fee_charged_regardless_of_distance(self):
        r = compute_delivery_fee("flat", distance_mi=None, config={"flat": 5})
        assert r["mode"] == "flat"
        assert r["applies"] is True
        assert r["fee"] == 5.0
        assert r["distance_mi"] is None  # flat never uses distance

    def test_flat_zero_does_not_apply(self):
        r = compute_delivery_fee("flat", config={"flat": 0})
        assert r["applies"] is False
        assert r["fee"] == 0.0

    def test_flat_rounds(self):
        r = compute_delivery_fee("flat", config={"flat": 4.999})
        assert r["fee"] == 5.0


class TestModeDistance:
    BASE_CFG = {"base": 3.0, "per_mile": 0.5, "free_radius_mi": 0,
                "max_cap": None, "road_factor": 1.0}

    def test_base_plus_per_mile(self):
        # 3 + 10mi * 0.5 = 8.00
        r = compute_delivery_fee("distance", distance_mi=10, config=self.BASE_CFG)
        assert r["applies"] is True
        assert r["fee"] == 8.0
        assert r["billable_miles"] == 10.0
        assert r["distance_mi"] == 10.0

    def test_free_radius_subtracts(self):
        # free 5mi: billable = 10-5 = 5; fee = 3 + 5*0.5 = 5.50
        cfg = {**self.BASE_CFG, "free_radius_mi": 5}
        r = compute_delivery_fee("distance", distance_mi=10, config=cfg)
        assert r["billable_miles"] == 5.0
        assert r["fee"] == 5.5

    def test_free_radius_covers_whole_distance_base_only(self):
        # free 20mi > 10mi actual: billable 0; fee = base only = 3.00
        cfg = {**self.BASE_CFG, "free_radius_mi": 20}
        r = compute_delivery_fee("distance", distance_mi=10, config=cfg)
        assert r["billable_miles"] == 0.0
        assert r["fee"] == 3.0

    def test_cap_clamps(self):
        # 3 + 100*0.5 = 53, capped at 10
        cfg = {**self.BASE_CFG, "max_cap": 10}
        r = compute_delivery_fee("distance", distance_mi=100, config=cfg)
        assert r["fee"] == 10.0

    def test_road_factor_scales_distance(self):
        # road_factor 1.3: billable = 1.3*10 = 13; fee = 3 + 13*0.5 = 9.50
        cfg = {**self.BASE_CFG, "road_factor": 1.3}
        r = compute_delivery_fee("distance", distance_mi=10, config=cfg)
        assert r["fee"] == 9.5
        assert r["billable_miles"] == 13.0

    def test_per_mile_zero_reduces_to_base(self):
        cfg = {**self.BASE_CFG, "per_mile": 0}
        r = compute_delivery_fee("distance", distance_mi=50, config=cfg)
        assert r["fee"] == 3.0

    def test_distance_unavailable_fails_open(self):
        # None distance in distance mode → $0, does not apply, does not raise.
        r = compute_delivery_fee("distance", distance_mi=None, config=self.BASE_CFG)
        assert r["applies"] is False
        assert r["fee"] == 0.0
        assert r["distance_mi"] is None

    def test_zero_config_zero_fee(self):
        r = compute_delivery_fee("distance", distance_mi=10,
                                 config={"base": 0, "per_mile": 0})
        assert r["fee"] == 0.0
        assert r["applies"] is False

    def test_missing_road_factor_defaults_to_one(self):
        # No road_factor in config → treated as 1.0
        cfg = {"base": 0, "per_mile": 1.0, "free_radius_mi": 0}
        r = compute_delivery_fee("distance", distance_mi=7, config=cfg)
        assert r["fee"] == 7.0
