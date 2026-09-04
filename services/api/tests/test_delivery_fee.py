"""
Unit tests for the pure delivery-fee math (tenant-pricing-phase3, Group A).

Covers haversine distance and the three-mode fee dispatch (none / flat /
distance), including free radius, cap, road factor, and the fail-open behavior
when distance is unavailable.

Validates: Requirements P1.2, P1.6, P2.1, P2.8, P2.9, P2.10, P2.11
"""
import math

from app.services.delivery_fee import haversine_miles, compute_delivery_fee, compute_tiered_fee


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


# Shelly / Fetch & Fold tiered structure, used across the tiered tests:
#   0–10 mi   -> free
#   10–20 mi  -> $15 flat
#   20–30 mi  -> $15 + $1.50/mi over 20
#   30+ mi    -> $25 + $2.00/mi over 30
SHELLY_TIERS = [
    {"up_to_mi": 10, "flat": 0, "per_mile_over": 0},
    {"up_to_mi": 20, "flat": 15, "per_mile_over": 0},
    {"up_to_mi": 30, "flat": 15, "per_mile_over": 1.5},
    {"up_to_mi": None, "flat": 25, "per_mile_over": 2.0},
]


class TestModeTiered:
    def _fee(self, miles, tiers=None, road_factor=1.0):
        cfg = {"tiers": tiers if tiers is not None else SHELLY_TIERS, "road_factor": road_factor}
        return compute_delivery_fee("tiered", distance_mi=miles, config=cfg)

    def test_free_band(self):
        assert self._fee(5)["fee"] == 0.0
        assert self._fee(5)["applies"] is False

    def test_lower_boundary_stays_in_free_band(self):
        # Exactly 10 falls in the first band (<= up_to), still free.
        assert self._fee(10)["fee"] == 0.0

    def test_flat_band(self):
        r = self._fee(15)
        assert r["fee"] == 15.0
        assert r["applies"] is True

    def test_flat_band_upper_boundary(self):
        assert self._fee(20)["fee"] == 15.0

    def test_per_mile_band(self):
        # 25 mi: 15 + 1.5*(25-20) = 22.50
        assert self._fee(25)["fee"] == 22.5

    def test_per_mile_band_upper_boundary(self):
        # 30 mi: 15 + 1.5*(30-20) = 30.00
        assert self._fee(30)["fee"] == 30.0

    def test_open_ended_top_band(self):
        # 35 mi: 25 + 2*(35-30) = 35.00
        assert self._fee(35)["fee"] == 35.0

    def test_road_factor_pushes_into_higher_band(self):
        # 8 straight-line * 1.3 = 10.4 road miles -> lands in the $15 flat band.
        r = self._fee(8, road_factor=1.3)
        assert r["fee"] == 15.0
        assert r["distance_mi"] == 8.0  # reports the straight-line input

    def test_distance_unavailable_fails_open(self):
        r = self._fee(None)
        assert r["fee"] == 0.0
        assert r["applies"] is False

    def test_empty_tiers_fails_open(self):
        r = self._fee(50, tiers=[])
        assert r["fee"] == 0.0
        assert r["applies"] is False

    def test_missing_tiers_key_fails_open(self):
        r = compute_delivery_fee("tiered", distance_mi=50, config={"road_factor": 1.0})
        assert r["fee"] == 0.0

    def test_unsorted_tiers_are_normalized(self):
        # Same bands, shuffled — result must match the sorted table.
        shuffled = [SHELLY_TIERS[2], SHELLY_TIERS[0], SHELLY_TIERS[3], SHELLY_TIERS[1]]
        assert self._fee(25, tiers=shuffled)["fee"] == 22.5

    def test_all_finite_bands_over_top_uses_last_band(self):
        # No open-ended band; a distance beyond the top finite bound still
        # charges the highest band rather than silently dropping to $0.
        finite = [
            {"up_to_mi": 10, "flat": 0, "per_mile_over": 0},
            {"up_to_mi": 20, "flat": 15, "per_mile_over": 1.0},
        ]
        # 25 mi > 20: 15 + 1.0*(25-10) = 30.00 (billed beyond the 10-mi lower edge)
        assert self._fee(25, tiers=finite)["fee"] == 30.0

    def test_camelcase_keys_accepted(self):
        camel = [
            {"upToMi": 10, "flat": 0, "perMileOver": 0},
            {"upToMi": None, "flat": 20, "perMileOver": 0},
        ]
        assert self._fee(15, tiers=camel)["fee"] == 20.0


class TestTieredPureFunction:
    def test_compute_tiered_fee_returns_fee_and_billable(self):
        fee, billable = compute_tiered_fee(25, SHELLY_TIERS)
        assert fee == 22.5
        assert billable == 5.0

    def test_compute_tiered_fee_none_distance(self):
        assert compute_tiered_fee(None, SHELLY_TIERS) == (0.0, 0.0)

    def test_compute_tiered_fee_no_tiers(self):
        assert compute_tiered_fee(25, []) == (0.0, 0.0)
