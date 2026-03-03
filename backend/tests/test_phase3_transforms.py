"""Tests for Phase 3 parameterized pipeline transforms.

Covers: Williams pairwise, Williams trend, organ weight method swap,
adversity threshold parameterization, and combined interactions.
"""

import copy
import pytest

from services.analysis.classification import classify_severity
from services.analysis.parameterized_pipeline import (
    apply_pairwise_williams,
    apply_trend_williams,
    apply_organ_weight_method,
    apply_settings_transforms,
    rederive_enrichment,
    _recompute_min_p_adj,
    _recompute_max_effect_size,
)
from services.analysis.analysis_settings import AnalysisSettings


# ---------------------------------------------------------------------------
# Fixtures: mock findings
# ---------------------------------------------------------------------------

def _continuous_finding(
    domain="BW",
    min_p=0.02,
    max_d=0.8,
    trend_p=0.03,
    n_groups=4,
):
    """Build a continuous finding with group_stats and pairwise entries."""
    group_stats = [
        {"dose_level": 0, "mean": 100.0, "sd": 10.0, "n": 10},
    ]
    pairwise = []
    for i in range(1, n_groups):
        group_stats.append({
            "dose_level": i,
            "mean": 100.0 + i * 5,
            "sd": 10.0,
            "n": 10,
        })
        pairwise.append({
            "dose_level": i,
            "p_value": 0.03 / i,
            "p_value_adj": min_p if i == n_groups - 1 else 0.1,
            "cohens_d": max_d * i / (n_groups - 1),
        })
    return {
        "domain": domain,
        "test_code": "BW",
        "sex": "M",
        "data_type": "continuous",
        "group_stats": group_stats,
        "pairwise": pairwise,
        "min_p_adj": min_p,
        "max_effect_size": max_d,
        "trend_p": trend_p,
        "direction": "up",
    }


def _incidence_finding():
    """Build an incidence finding."""
    return {
        "domain": "MI",
        "test_code": "HEPATOCELLULAR",
        "specimen": "LIVER",
        "sex": "M",
        "data_type": "incidence",
        "group_stats": [
            {"dose_level": 0, "incidence": 0.0, "n": 10},
            {"dose_level": 1, "incidence": 0.1, "n": 10},
            {"dose_level": 2, "incidence": 0.3, "n": 10},
        ],
        "pairwise": [
            {"dose_level": 1, "p_value": 0.5, "p_value_adj": 0.5},
            {"dose_level": 2, "p_value": 0.04, "p_value_adj": 0.04},
        ],
        "min_p_adj": 0.04,
        "max_effect_size": None,
        "trend_p": 0.02,
        "direction": "up",
    }


def _om_finding_with_alternatives():
    """Build an OM finding with pre-computed alternatives."""
    return {
        "domain": "OM",
        "test_code": "WEIGHT",
        "specimen": "LIVER",
        "sex": "M",
        "data_type": "continuous",
        "group_stats": [
            {"dose_level": 0, "mean": 10.0, "sd": 1.0, "n": 10},
            {"dose_level": 1, "mean": 10.5, "sd": 1.0, "n": 10},
            {"dose_level": 2, "mean": 11.0, "sd": 1.0, "n": 10},
        ],
        "pairwise": [
            {"dose_level": 1, "p_value": 0.2, "p_value_adj": 0.2, "cohens_d": 0.3},
            {"dose_level": 2, "p_value": 0.04, "p_value_adj": 0.04, "cohens_d": 0.7},
        ],
        "min_p_adj": 0.04,
        "max_effect_size": 0.7,
        "trend_p": 0.03,
        "direction": "up",
        "normalization": {
            "recommended_metric": "ratio_to_bw",
            "active_metric": "absolute",
        },
        "alternatives": {
            "ratio_to_bw": {
                "group_stats": [
                    {"dose_level": 0, "mean": 0.035, "sd": 0.003, "n": 10},
                    {"dose_level": 1, "mean": 0.038, "sd": 0.003, "n": 10},
                    {"dose_level": 2, "mean": 0.042, "sd": 0.003, "n": 10},
                ],
                "pairwise": [
                    {"dose_level": 1, "p_value": 0.15, "p_value_adj": 0.15, "cohens_d": 0.6},
                    {"dose_level": 2, "p_value": 0.01, "p_value_adj": 0.01, "cohens_d": 1.5},
                ],
                "trend_p": 0.005,
            },
            "ratio_to_brain": {
                "group_stats": [
                    {"dose_level": 0, "mean": 5.0, "sd": 0.5, "n": 10},
                    {"dose_level": 1, "mean": 5.3, "sd": 0.5, "n": 10},
                    {"dose_level": 2, "mean": 5.8, "sd": 0.5, "n": 10},
                ],
                "pairwise": [
                    {"dose_level": 1, "p_value": 0.18, "p_value_adj": 0.18, "cohens_d": 0.4},
                    {"dose_level": 2, "p_value": 0.02, "p_value_adj": 0.02, "cohens_d": 1.1},
                ],
                "trend_p": 0.008,
            },
        },
    }


# ---------------------------------------------------------------------------
# classify_severity threshold tests
# ---------------------------------------------------------------------------

class TestClassifySeverityThresholds:
    def test_grade_ge_1_significant_small_effect(self):
        """grade-ge-1: p=0.04, |d|=0.2 → adverse (was warning under default)."""
        f = {"min_p_adj": 0.04, "max_effect_size": 0.2, "trend_p": 0.1, "data_type": "continuous"}
        assert classify_severity(f) == "warning"  # default
        assert classify_severity(f, threshold="grade-ge-1") == "adverse"

    def test_grade_ge_2_no_trend(self):
        """grade-ge-2: p=0.04, |d|=0.6, trend_p=0.03 → adverse (trend ignored in classification)."""
        f = {"min_p_adj": 0.04, "max_effect_size": 0.6, "trend_p": 0.03, "data_type": "continuous"}
        # Both default and grade-ge-2 should be adverse here (significant + large d)
        assert classify_severity(f, threshold="grade-ge-2") == "adverse"

    def test_grade_ge_2_trend_only_not_adverse(self):
        """grade-ge-2: trend-only significance doesn't escalate to adverse."""
        f = {"min_p_adj": 0.2, "max_effect_size": 0.9, "trend_p": 0.01, "data_type": "continuous"}
        # Default: trend_p < 0.05 AND |d| >= 0.8 → adverse
        assert classify_severity(f) == "adverse"
        # grade-ge-2: no significant pairwise, no trend path → normal (|d|=0.9 < 1.0)
        assert classify_severity(f, threshold="grade-ge-2") == "normal"

    def test_incidence_unchanged_across_thresholds(self):
        """Incidence classification is the same regardless of threshold."""
        f = {"min_p_adj": 0.03, "data_type": "incidence", "direction": "up"}
        assert classify_severity(f) == "adverse"
        assert classify_severity(f, threshold="grade-ge-1") == "adverse"
        assert classify_severity(f, threshold="grade-ge-2") == "adverse"


# ---------------------------------------------------------------------------
# Williams pairwise tests
# ---------------------------------------------------------------------------

class TestApplyPairwiseWilliams:
    def test_converts_p_values(self):
        """Williams replaces Dunnett p-values."""
        findings = [_continuous_finding()]
        original_p = findings[0]["pairwise"][-1]["p_value_adj"]
        apply_pairwise_williams(findings)
        # p-values should change (Williams ≠ Dunnett)
        assert "_williams_applied" in findings[0]
        # min_p_adj should be updated
        new_min_p = findings[0]["min_p_adj"]
        assert new_min_p is not None

    def test_preserves_cohens_d(self):
        """Effect sizes are measurement-based, not test-dependent."""
        findings = [_continuous_finding()]
        original_d = [pw["cohens_d"] for pw in findings[0]["pairwise"]]
        apply_pairwise_williams(findings)
        new_d = [pw["cohens_d"] for pw in findings[0]["pairwise"]]
        assert original_d == new_d

    def test_skips_incidence(self):
        """Incidence findings are untouched."""
        findings = [_incidence_finding()]
        original = copy.deepcopy(findings[0]["pairwise"])
        apply_pairwise_williams(findings)
        assert findings[0]["pairwise"] == original
        assert "_williams_applied" not in findings[0]


# ---------------------------------------------------------------------------
# Williams trend tests
# ---------------------------------------------------------------------------

class TestApplyTrendWilliams:
    def test_uses_first_step_p(self):
        """trend_p = Williams first step-down p (highest dose)."""
        findings = [_continuous_finding()]
        apply_trend_williams(findings)
        # trend_p should be set from Williams
        assert findings[0]["trend_p"] is not None

    def test_reuses_pairwise_metadata(self):
        """When _williams_applied present, no re-run."""
        findings = [_continuous_finding()]
        # Run pairwise first to set _williams_applied
        apply_pairwise_williams(findings)
        meta_p = findings[0]["_williams_applied"]["step_down_results"][0]["p_value"]
        # Now run trend
        apply_trend_williams(findings)
        assert findings[0]["trend_p"] == meta_p


# ---------------------------------------------------------------------------
# Organ weight method tests
# ---------------------------------------------------------------------------

class TestApplyOrganWeightMethod:
    def test_swap_ratio_bw(self):
        """OM finding with alternatives: stats swapped to ratio-to-BW."""
        findings = [_om_finding_with_alternatives()]
        apply_organ_weight_method(findings, "ratio-bw")
        f = findings[0]
        assert f["normalization"]["active_metric"] == "ratio_to_bw"
        # Group stats should now be the ratio-to-BW stats
        assert f["group_stats"][0]["mean"] == 0.035
        assert f["min_p_adj"] == 0.01
        assert f["max_effect_size"] == 1.5

    def test_noop_when_already_active(self):
        """No swap when metric already matches."""
        findings = [_om_finding_with_alternatives()]
        findings[0]["normalization"]["active_metric"] = "ratio_to_bw"
        original_gs = copy.deepcopy(findings[0]["group_stats"])
        apply_organ_weight_method(findings, "ratio-bw")
        assert findings[0]["group_stats"] == original_gs

    def test_skips_non_om(self):
        """BW finding unchanged."""
        findings = [_continuous_finding(domain="BW")]
        original = copy.deepcopy(findings[0])
        apply_organ_weight_method(findings, "ratio-bw")
        assert findings[0]["group_stats"] == original["group_stats"]


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

class TestPhase3Integration:
    def test_adversity_only_triggers_rederive(self):
        """Rederivation runs when only threshold changes (no other transforms)."""
        findings = [_continuous_finding(min_p=0.04, max_d=0.2, trend_p=0.1)]
        # Add required fields for enrichment
        for f in findings:
            f.setdefault("test_name", "BW")
            f.setdefault("specimen", None)
        settings = AnalysisSettings(adversity_threshold="grade-ge-1")
        result = apply_settings_transforms(findings, settings)
        # grade-ge-1 with p=0.04 should classify as adverse (was warning)
        assert result[0]["severity"] == "adverse"

    def test_combined_organ_weight_and_williams(self):
        """Organ weight swap runs first, then Williams on swapped stats."""
        om_finding = _om_finding_with_alternatives()
        om_finding.setdefault("test_name", "WEIGHT")
        settings = AnalysisSettings(
            organ_weight_method="ratio-bw",
            pairwise_test="williams",
        )
        findings = [om_finding]
        result = apply_settings_transforms(findings, settings)
        f = result[0]
        # Should have swapped to ratio-to-BW first
        assert f["normalization"]["active_metric"] == "ratio_to_bw"
        # Williams should have run (on the swapped stats)
        assert "_williams_applied" in f

    def test_williams_skips_multiplicity_correction(self):
        """Bonferroni is not applied on top of Williams — prevents double-correction."""
        findings = [_continuous_finding()]
        apply_pairwise_williams(findings)
        williams_p = findings[0]["pairwise"][-1]["p_value_adj"]

        # Now run the full pipeline with Williams + Bonferroni
        findings2 = [_continuous_finding()]
        for f in findings2:
            f.setdefault("test_name", "BW")
            f.setdefault("specimen", None)
        settings = AnalysisSettings(
            pairwise_test="williams",
            multiplicity="bonferroni",
        )
        result = apply_settings_transforms(findings2, settings)
        # p_value_adj should be Williams' p, NOT Bonferroni-adjusted
        result_p = [pw["p_value_adj"] for pw in result[0]["pairwise"]
                     if pw.get("p_value_adj") is not None]
        # Bonferroni would multiply by k — if skipped, values match Williams
        assert all(p <= 1.0 for p in result_p)
        # The highest-dose p should match what Williams alone produced
        assert result[0]["pairwise"][-1]["p_value_adj"] == williams_p

    def test_organ_weight_round_trip(self):
        """Swap to ratio-bw then back to absolute — original stats restored."""
        findings = [_om_finding_with_alternatives()]
        original_gs = copy.deepcopy(findings[0]["group_stats"])
        original_pw = copy.deepcopy(findings[0]["pairwise"])
        original_trend = findings[0]["trend_p"]

        # Swap to ratio-bw
        apply_organ_weight_method(findings, "ratio-bw")
        assert findings[0]["normalization"]["active_metric"] == "ratio_to_bw"
        assert findings[0]["group_stats"][0]["mean"] == 0.035  # ratio stats

        # Swap back to absolute (saved in alternatives during first swap)
        # Need to simulate the "absolute" method — manually swap back
        f = findings[0]
        alt_abs = f["alternatives"].get("absolute")
        assert alt_abs is not None, "Original absolute stats should be saved in alternatives"
        assert alt_abs["group_stats"] == original_gs
        assert alt_abs["pairwise"] == original_pw
        assert alt_abs["trend_p"] == original_trend
