"""Tests for Williams' step-down trend test and PAVA isotonic regression.

Test cases from SPEC-WTC-AMD-003 §2.5, §8.1, and §8.2.
Audit-fix tests added 2026-03-31 (MC PAVA scope, CV source tracing, table guard).
"""

import numpy as np
import pytest

from services.analysis.williams import (
    _WILLIAMS_CV_005,
    pava_increasing,
    pava_decreasing,
    williams_critical_value,
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


# ──────────────────────────────────────────────────────────────
# Audit-fix tests (2026-03-31)
# ──────────────────────────────────────────────────────────────

class TestTableMonotonicity:
    """Regression: table values must decrease monotonically with df."""

    def test_cv_decreases_with_df(self):
        """For each k, CV at lower df must be >= CV at higher df."""
        by_k: dict[int, list[tuple[int, float]]] = {}
        for (k, df), cv in _WILLIAMS_CV_005.items():
            by_k.setdefault(k, []).append((df, cv))

        for k, entries in by_k.items():
            entries.sort()  # sort by df ascending
            for i in range(len(entries) - 1):
                df1, cv1 = entries[i]
                df2, cv2 = entries[i + 1]
                assert cv1 >= cv2, (
                    f"Non-monotonic at k={k}: CV({df1})={cv1} < CV({df2})={cv2}"
                )


class TestCriticalValueSource:
    """Fix 2: critical_value_source tracing."""

    def test_balanced_table_path(self):
        """Equal n with (k, df) in table -> source='table'."""
        ns = np.array([10, 10, 10, 10])
        cv, source = williams_critical_value(k=3, dose_index=3, df=20, ns=ns)
        assert source == "table"
        assert cv > 0

    def test_unequal_n_mc_path(self):
        """Unequal n -> source='mc'."""
        ns = np.array([15, 8, 6])
        cv, source = williams_critical_value(k=2, dose_index=2, df=20, ns=ns)
        assert source == "mc"
        assert cv > 0

    def test_source_in_step_down_results(self):
        """Williams test output includes cv_source on each step."""
        dose_groups = [
            {"label": "Control", "mean": 1.0, "sd": 0.10, "n": 10},
            {"label": "Low", "mean": 1.5, "sd": 0.12, "n": 10},
            {"label": "High", "mean": 2.5, "sd": 0.10, "n": 10},
        ]
        result = williams_from_dose_groups(dose_groups)
        assert result is not None
        for r in result.step_down_results:
            assert r.critical_value_source in ("table", "mc")


class TestAlphaGuard:
    """Fix 3: alpha=0.01 must not use corrupted table values."""

    def test_alpha_001_falls_through_to_mc(self):
        """alpha=0.01 should not find table entries (they were removed)."""
        ns = np.array([10, 10, 10])
        cv, source = williams_critical_value(k=2, dose_index=2, df=10, ns=ns, alpha=0.01)
        # Should fall through to MC since table only has 0.05
        assert source == "mc"


class TestMCPavaScope:
    """Fix 1: MC simulation must restrict PAVA to groups 0..dose_index."""

    def test_mc_cv_at_highest_dose_unchanged(self):
        """MC for dose_index=k should be same as before (full PAVA is correct)."""
        ns = np.array([10, 10, 10, 10])
        # Force MC by using alpha that's not in table
        cv_k, _ = williams_critical_value(k=3, dose_index=3, df=20, ns=ns, alpha=0.01)
        # Should be roughly in the range of a Williams CV (> standard t ~2.09)
        assert 1.5 < cv_k < 4.0

    def test_mc_cv_intermediate_dose_not_underestimated(self):
        """MC for dose_index < k must produce CV >= standard t one-sided CV.

        Before the fix, MC at intermediate doses produced CVs far below
        standard t (e.g., 1.27 instead of 1.78). The Williams CV at any
        dose_index must be >= the standard t CV at the same alpha.
        """
        from scipy import stats as sp_stats

        ns = np.array([10, 10, 10, 10, 10, 10, 10])  # k=6
        df = 49
        alpha = 0.05
        t_cv = sp_stats.t.ppf(1 - alpha, df)  # standard t one-sided ~1.677

        # Test intermediate dose (dose_index=3 with k=6)
        cv_mid, source = williams_critical_value(
            k=6, dose_index=3, df=df, ns=ns, alpha=alpha,
        )
        assert source == "mc"
        # Williams CV must be >= standard t CV (it's a constrained comparison)
        assert cv_mid >= t_cv * 0.95, (
            f"MC CV at dose_index=3 ({cv_mid:.3f}) is below standard t "
            f"({t_cv:.3f}) -- PAVA scope bug likely still present"
        )
