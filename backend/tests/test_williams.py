"""Tests for Williams' step-down trend test and PAVA isotonic regression.

Test cases from SPEC-WTC-AMD-003 §2.5, §8.1, and §8.2.
"""

import numpy as np
import pytest

from services.analysis.williams import (
    pava_increasing,
    pava_decreasing,
    williams_from_dose_groups,
    williams_from_group_stats,
    williams_test,
)


# ──────────────────────────────────────────────────────────────
# §8.2 PAVA Correctness Tests (cases 7–11)
# ──────────────────────────────────────────────────────────────

class TestPAVA:
    def test_already_monotonic(self):
        """Case 7: No pooling needed when data is already non-decreasing."""
        values = np.array([1.0, 2.0, 3.0, 4.0])
        weights = np.array([10, 10, 10, 10])
        result = pava_increasing(values, weights)
        np.testing.assert_array_almost_equal(result, [1.0, 2.0, 3.0, 4.0])

    def test_complete_reversal(self):
        """Case 8: Fully decreasing input gets fully pooled."""
        values = np.array([4.0, 3.0, 2.0, 1.0])
        weights = np.array([10, 10, 10, 10])
        result = pava_increasing(values, weights)
        np.testing.assert_array_almost_equal(result, [2.5, 2.5, 2.5, 2.5])

    def test_triggering_case(self):
        """Case 9: Ovary weight means — the SPEC-ECI triggering case."""
        values = np.array([0.41, 0.29, 0.60, 0.44])
        weights = np.array([10, 10, 10, 10])
        result = pava_increasing(values, weights)
        np.testing.assert_array_almost_equal(result, [0.35, 0.35, 0.52, 0.52])

    def test_single_violation(self):
        """Case 10: One pair out of order gets pooled."""
        values = np.array([1.0, 3.0, 2.0, 4.0])
        weights = np.array([10, 10, 10, 10])
        result = pava_increasing(values, weights)
        np.testing.assert_array_almost_equal(result, [1.0, 2.5, 2.5, 4.0])

    def test_unequal_weights(self):
        """Case 11: Weighted pooling with different group sizes."""
        values = np.array([1.0, 3.0, 2.0])
        weights = np.array([10, 5, 10])
        result = pava_increasing(values, weights)
        # Pooled: (5*3 + 10*2) / 15 = 35/15 ≈ 2.333
        np.testing.assert_array_almost_equal(result, [1.0, 2.333, 2.333], decimal=2)

    def test_all_same(self):
        """All equal values stay equal."""
        values = np.array([2.0, 2.0, 2.0])
        weights = np.array([10, 10, 10])
        result = pava_increasing(values, weights)
        np.testing.assert_array_almost_equal(result, [2.0, 2.0, 2.0])

    def test_decreasing_constraint(self):
        """Decreasing constraint via pava_decreasing."""
        values = np.array([4.0, 2.0, 3.0, 1.0])
        weights = np.array([10, 10, 10, 10])
        result = pava_decreasing(values, weights)
        np.testing.assert_array_almost_equal(result, [4.0, 2.5, 2.5, 1.0])


# ──────────────────────────────────────────────────────────────
# §8.1 Williams' Test Correctness (cases 1–6)
# ──────────────────────────────────────────────────────────────

class TestWilliamsTest:
    def test_triggering_case_not_significant(self):
        """Case 1: SPEC-ECI-AMD-002 triggering case should NOT be significant."""
        dose_groups = [
            {"label": "Control", "mean": 0.41, "sd": 0.11, "n": 10},
            {"label": "2 mg/kg", "mean": 0.29, "sd": 0.10, "n": 10},
            {"label": "20 mg/kg", "mean": 0.60, "sd": 0.24, "n": 10},
            {"label": "200 mg/kg", "mean": 0.44, "sd": 0.16, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.minimum_effective_dose is None
        assert not result.step_down_results[0].significant
        # Step-down stopped at first dose
        assert len(result.step_down_results) == 1

    def test_clear_monotonic_increase(self):
        """Case 2: Clear dose-dependent increase — all doses significant."""
        dose_groups = [
            {"label": "Control", "mean": 1.0, "sd": 0.10, "n": 10},
            {"label": "Low", "mean": 1.5, "sd": 0.12, "n": 10},
            {"label": "Mid", "mean": 2.0, "sd": 0.11, "n": 10},
            {"label": "High", "mean": 2.5, "sd": 0.10, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.minimum_effective_dose == "Low"
        assert all(r.significant for r in result.step_down_results)

    def test_no_effect(self):
        """Case 3: No treatment effect → not significant."""
        dose_groups = [
            {"label": "Control", "mean": 5.0, "sd": 0.50, "n": 10},
            {"label": "Low", "mean": 5.1, "sd": 0.48, "n": 10},
            {"label": "Mid", "mean": 4.9, "sd": 0.52, "n": 10},
            {"label": "High", "mean": 5.05, "sd": 0.50, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.minimum_effective_dose is None

    def test_threshold_at_high_dose(self):
        """Case 4: Effect only at high dose — MED = High."""
        dose_groups = [
            {"label": "Control", "mean": 1.0, "sd": 0.10, "n": 10},
            {"label": "Low", "mean": 1.0, "sd": 0.10, "n": 10},
            {"label": "Mid", "mean": 1.05, "sd": 0.10, "n": 10},
            {"label": "High", "mean": 2.0, "sd": 0.10, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.step_down_results[0].significant  # High

    def test_decrease_direction(self):
        """Case 5: Dose-dependent decrease detected."""
        dose_groups = [
            {"label": "Control", "mean": 5.0, "sd": 0.10, "n": 10},
            {"label": "Low", "mean": 4.5, "sd": 0.12, "n": 10},
            {"label": "Mid", "mean": 3.5, "sd": 0.11, "n": 10},
            {"label": "High", "mean": 2.5, "sd": 0.10, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.direction == "decrease"
        assert result.minimum_effective_dose == "Low"

    def test_unequal_group_sizes(self):
        """Case 6: Unequal group sizes → simulation fallback for CV."""
        dose_groups = [
            {"label": "Control", "mean": 1.0, "sd": 0.10, "n": 15},
            {"label": "Low", "mean": 1.3, "sd": 0.10, "n": 8},
            {"label": "High", "mean": 2.0, "sd": 0.10, "n": 6},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.step_down_results[0].significant  # High

    def test_step_down_stops_correctly(self):
        """Step-down should stop when a dose is not significant."""
        dose_groups = [
            {"label": "Control", "mean": 1.0, "sd": 0.10, "n": 10},
            {"label": "Low", "mean": 1.02, "sd": 0.10, "n": 10},
            {"label": "Mid", "mean": 1.03, "sd": 0.10, "n": 10},
            {"label": "High", "mean": 2.0, "sd": 0.12, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        assert result.step_down_results[0].significant  # High
        # Mid is near control → should not be significant → step-down stops
        assert not result.all_groups_tested or not result.step_down_results[-1].significant


class TestWilliamsFromGroupStats:
    """Test the group_stats format wrapper (used by findings_om)."""

    def test_basic_increase(self):
        group_stats = [
            {"dose_level": 0, "mean": 1.0, "sd": 0.10, "n": 10},
            {"dose_level": 1, "mean": 1.5, "sd": 0.12, "n": 10},
            {"dose_level": 2, "mean": 2.0, "sd": 0.11, "n": 10},
            {"dose_level": 3, "mean": 2.5, "sd": 0.10, "n": 10},
        ]
        result = williams_from_group_stats(group_stats)
        assert result is not None
        assert result.minimum_effective_dose is not None

    def test_insufficient_data(self):
        """Single group → None."""
        group_stats = [{"dose_level": 0, "mean": 1.0, "sd": 0.10, "n": 10}]
        result = williams_from_group_stats(group_stats)
        assert result is None

    def test_none_mean_filtered(self):
        """Groups with None mean are filtered out."""
        group_stats = [
            {"dose_level": 0, "mean": 1.0, "sd": 0.10, "n": 10},
            {"dose_level": 1, "mean": None, "sd": None, "n": 0},
            {"dose_level": 2, "mean": 2.0, "sd": 0.10, "n": 10},
        ]
        result = williams_from_group_stats(group_stats)
        assert result is not None
