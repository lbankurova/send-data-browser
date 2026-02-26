"""Tests for organ weight normalization metric selection engine.

Verifies organ category mapping and metric decision logic for all organ
correlation categories and BW tiers.
"""

import numpy as np
import pytest

from services.analysis.normalization import (
    get_organ_category,
    decide_metric,
    compute_hedges_g,
    compute_bw_tier,
)


# ──────────────────────────────────────────────────────────────
# Organ Category Mapping
# ──────────────────────────────────────────────────────────────

class TestOrganCategories:
    @pytest.mark.parametrize("organ,expected", [
        ("LIVER", "strong_bw"),
        ("THYROID", "strong_bw"),
        ("HEART", "moderate_bw"),
        ("KIDNEY", "moderate_bw"),
        ("KIDNEYS", "moderate_bw"),
        ("SPLEEN", "moderate_bw"),
        ("LUNG", "moderate_bw"),
        ("LUNGS", "moderate_bw"),
        ("ADRENAL", "weak_bw"),
        ("ADRENALS", "weak_bw"),
        ("THYMUS", "weak_bw"),
        ("PITUITARY", "weak_bw"),
        ("BRAIN", "brain"),
        ("TESTES", "gonadal"),
        ("TESTIS", "gonadal"),
        ("EPIDID", "androgen_dependent"),
        ("PROSTATE", "androgen_dependent"),
        ("SEMVES", "androgen_dependent"),
        ("OVARY", "female_reproductive"),
        ("OVARIES", "female_reproductive"),
        ("UTERUS", "female_reproductive"),
    ])
    def test_known_organs(self, organ: str, expected: str):
        assert get_organ_category(organ) == expected

    def test_unknown_organ_defaults(self):
        assert get_organ_category("UNKNOWN_ORGAN") == "moderate_bw"

    def test_case_insensitive(self):
        assert get_organ_category("liver") == "strong_bw"
        assert get_organ_category("Liver") == "strong_bw"


# ──────────────────────────────────────────────────────────────
# Metric Decision Engine
# ──────────────────────────────────────────────────────────────

class TestDecideMetric:
    # ── Gonadal: always absolute ──
    def test_testes_always_absolute(self):
        result = decide_metric("TESTES", bw_g=2.5)
        assert result["metric"] == "absolute"
        assert result["category"] == "gonadal"

    # ── Androgen-dependent: always absolute ──
    def test_prostate_always_absolute(self):
        result = decide_metric("PROSTATE", bw_g=1.5)
        assert result["metric"] == "absolute"
        assert result["category"] == "androgen_dependent"

    # ── Female reproductive ──
    def test_ovary_brain_when_available(self):
        result = decide_metric("OVARY", bw_g=0.3, brain_g=0.2, brain_affected=False)
        assert result["metric"] == "ratio_to_brain"
        assert result["confidence"] == "low"

    def test_ovary_absolute_when_brain_affected(self):
        result = decide_metric("OVARY", bw_g=0.3, brain_g=1.5, brain_affected=True)
        assert result["metric"] == "absolute"

    def test_uterus_always_absolute(self):
        result = decide_metric("UTERUS", bw_g=0.5)
        assert result["metric"] == "absolute"

    # ── Brain ──
    def test_brain_bw_ratio_low_effect(self):
        result = decide_metric("BRAIN", bw_g=0.3)
        assert result["metric"] == "ratio_to_bw"

    def test_brain_absolute_high_effect(self):
        result = decide_metric("BRAIN", bw_g=1.5)
        assert result["metric"] == "absolute"

    # ── Weak BW with brain available → brain ratio ──
    def test_adrenal_brain_ratio(self):
        result = decide_metric("ADRENAL", bw_g=0.3, brain_g=0.2)
        assert result["metric"] == "ratio_to_brain"
        assert result["category"] == "weak_bw"

    def test_thymus_brain_ratio(self):
        result = decide_metric("THYMUS", bw_g=0.8, brain_g=0.3)
        assert result["metric"] == "ratio_to_brain"

    # ── Strong BW tiered ──
    def test_liver_tier1_bw_ratio(self):
        result = decide_metric("LIVER", bw_g=0.3)
        assert result["metric"] == "ratio_to_bw"
        assert result["tier"] == 1
        assert result["confidence"] == "high"

    def test_liver_tier2_bw_ratio(self):
        result = decide_metric("LIVER", bw_g=0.7)
        assert result["metric"] == "ratio_to_bw"
        assert result["tier"] == 2
        assert result["confidence"] == "medium"

    def test_liver_tier3_brain_available(self):
        result = decide_metric("LIVER", bw_g=1.5, brain_g=0.2)
        assert result["metric"] == "ratio_to_brain"
        assert result["tier"] == 3

    def test_liver_tier3_no_brain(self):
        result = decide_metric("LIVER", bw_g=1.5)
        assert result["metric"] == "absolute"
        assert result["tier"] == 3

    def test_liver_tier4(self):
        result = decide_metric("LIVER", bw_g=2.5)
        assert result["metric"] == "absolute"
        assert result["tier"] == 4

    # ── Moderate BW tiered ──
    def test_kidney_tier1(self):
        result = decide_metric("KIDNEY", bw_g=0.3)
        assert result["metric"] == "ratio_to_bw"

    def test_kidney_tier3_brain(self):
        result = decide_metric("KIDNEY", bw_g=1.2, brain_g=0.3)
        assert result["metric"] == "ratio_to_brain"

    # ── Brain affected override ──
    def test_kidney_brain_affected_override(self):
        result = decide_metric("KIDNEY", bw_g=0.5, brain_g=1.5, brain_affected=True)
        assert result["metric"] == "absolute"
        assert result["tier"] == 4


# ──────────────────────────────────────────────────────────────
# BW Tier Computation
# ──────────────────────────────────────────────────────────────

class TestBWTier:
    def test_tier_boundaries(self):
        assert compute_bw_tier(0.0) == 1
        assert compute_bw_tier(0.49) == 1
        assert compute_bw_tier(0.5) == 2
        assert compute_bw_tier(0.99) == 2
        assert compute_bw_tier(1.0) == 3
        assert compute_bw_tier(1.99) == 3
        assert compute_bw_tier(2.0) == 4
        assert compute_bw_tier(3.0) == 4


# ──────────────────────────────────────────────────────────────
# Hedges' g Computation
# ──────────────────────────────────────────────────────────────

class TestHedgesG:
    def test_basic_computation(self):
        ctrl = np.array([1.0, 1.1, 0.9, 1.0, 1.2])
        trt = np.array([2.0, 2.1, 1.9, 2.0, 2.2])
        g = compute_hedges_g(ctrl, trt)
        assert g is not None
        assert g > 5.0  # large effect

    def test_no_effect(self):
        ctrl = np.array([1.0, 1.0, 1.0])
        trt = np.array([1.0, 1.0, 1.0])
        g = compute_hedges_g(ctrl, trt)
        assert g == 0.0

    def test_insufficient_data(self):
        ctrl = np.array([1.0])
        trt = np.array([2.0])
        g = compute_hedges_g(ctrl, trt)
        assert g is None

    def test_returns_absolute(self):
        """g should always be positive (absolute value)."""
        ctrl = np.array([2.0, 2.1, 1.9, 2.0, 2.2])
        trt = np.array([1.0, 1.1, 0.9, 1.0, 1.2])
        g = compute_hedges_g(ctrl, trt)
        assert g is not None
        assert g > 0
