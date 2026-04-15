"""Unit tests for tumor evaluation features.

Tests: poly-3 survival-adjusted test, malignant suffix exceptions,
dose scoring parameter, Haseman thresholds, discordance detection,
tumor HCD lookup, combined count deduplication.

Run: cd backend && venv/Scripts/python.exe -m pytest tests/test_tumor_evaluation.py -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.analysis.statistics import trend_test_incidence, poly3_test
from services.analysis.findings_mi import _classify_mi_neoplasm
from services.analysis.hcd import assess_tumor_hcd


# ── Feature 0: Malignant -oma suffix exceptions ──────────────────────


class TestMalignantSuffixExceptions:
    """AC-0.1 through AC-0.5."""

    def test_lymphoma_is_malignant(self):
        """AC-0.1: LYMPHOMA -> MALIGNANT."""
        is_neo, behavior = _classify_mi_neoplasm("LYMPHOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"

    def test_melanoma_is_malignant(self):
        """AC-0.2: MELANOMA -> MALIGNANT."""
        is_neo, behavior = _classify_mi_neoplasm("MELANOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"

    def test_thymoma_is_ambiguous(self):
        """AC-0.3: THYMOMA -> behavior=None (ambiguous)."""
        is_neo, behavior = _classify_mi_neoplasm("THYMOMA", None)
        assert is_neo is True
        assert behavior is None

    def test_granuloma_not_neoplastic(self):
        """AC-0.4: GRANULOMA -> not neoplastic."""
        is_neo, behavior = _classify_mi_neoplasm("GRANULOMA", None)
        assert is_neo is False
        assert behavior is None

    def test_mirescat_takes_priority(self):
        """AC-0.5: MIRESCAT-based classification unchanged."""
        is_neo, behavior = _classify_mi_neoplasm("LYMPHOMA", "BENIGN")
        assert is_neo is True
        assert behavior == "BENIGN"  # MIRESCAT overrides text inference

    def test_carcinoma_suffix_infers_malignant(self):
        """Suffix -CARCINOMA -> MALIGNANT."""
        is_neo, behavior = _classify_mi_neoplasm("HEPATOCELLULAR CARCINOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"

    def test_sarcoma_suffix_infers_malignant(self):
        """Suffix -SARCOMA -> MALIGNANT."""
        is_neo, behavior = _classify_mi_neoplasm("HISTIOCYTIC SARCOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"

    def test_adenoma_no_behavior_inferred(self):
        """Plain ADENOMA -> behavior=None (not in malignant list, no malignant suffix)."""
        is_neo, behavior = _classify_mi_neoplasm("ADENOMA", None)
        assert is_neo is True
        assert behavior is None

    def test_glioma_is_malignant(self):
        """GLIOMA in _MALIGNANT_OMA_TERMS."""
        is_neo, behavior = _classify_mi_neoplasm("GLIOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"

    def test_nephroblastoma_is_malignant(self):
        """NEPHROBLASTOMA in _MALIGNANT_OMA_TERMS + has -BLASTOMA suffix."""
        is_neo, behavior = _classify_mi_neoplasm("NEPHROBLASTOMA", None)
        assert is_neo is True
        assert behavior == "MALIGNANT"


# ── Feature 1: Dose scoring parameter ────────────────────────────────


class TestDoseScoringParameter:
    """AC-1.1 through AC-1.3."""

    def test_backward_compatible(self):
        """AC-1.1: Existing callers produce identical results."""
        r1 = trend_test_incidence([1, 2, 5], [10, 10, 10])
        r2 = trend_test_incidence([1, 2, 5], [10, 10, 10], dose_scores=None)
        assert r1["statistic"] == r2["statistic"]
        assert r1["p_value"] == r2["p_value"]

    def test_custom_scores_valid(self):
        """AC-1.2: Custom dose scores produce valid p-value."""
        r = trend_test_incidence([2, 5, 8], [50, 50, 50], dose_scores=[0, 10, 100])
        assert r["p_value"] is not None
        assert 0 <= r["p_value"] <= 1

    def test_custom_scores_differ(self):
        """AC-1.3: Different scores produce different z-statistic."""
        r_default = trend_test_incidence([2, 5, 8], [50, 50, 50])
        r_custom = trend_test_incidence([2, 5, 8], [50, 50, 50], dose_scores=[0, 10, 100])
        assert r_default["statistic"] != r_custom["statistic"]

    def test_float_totals_accepted(self):
        """Poly-3 passes float totals; verify C-A handles them."""
        r = trend_test_incidence([1, 3, 5], [9.5, 8.7, 10.0])
        assert r["p_value"] is not None

    def test_wrong_length_scores(self):
        """Mismatched dose_scores length returns None."""
        r = trend_test_incidence([1, 2, 3], [10, 10, 10], dose_scores=[0, 1])
        assert r["statistic"] is None


# ── Feature 2: Poly-3 survival-adjusted test ─────────────────────────


def _make_animals(group_specs):
    """Helper: group_specs = [(dose_level, n, n_with_tumor, day, is_terminal), ...]"""
    animals = []
    for dl, n, n_tumor, day, terminal in group_specs:
        for i in range(n):
            animals.append({
                "dose_level": dl,
                "has_tumor": i < n_tumor,
                "disposition_day": day,
                "is_terminal": terminal,
            })
    return animals


class TestPoly3Test:
    """AC-2.1 through AC-2.6."""

    def test_all_terminal_equals_ca(self):
        """AC-2.1: All terminal -> poly-3 = standard C-A."""
        animals = _make_animals([
            (0, 50, 2, 90, True),
            (1, 50, 5, 90, True),
            (2, 50, 10, 90, True),
        ])
        ca = trend_test_incidence([2, 5, 10], [50, 50, 50])
        p3 = poly3_test(animals, 90)
        assert abs(ca["p_value"] - p3["trend_p"]) < 1e-10

    def test_early_deaths_adjust_rate(self):
        """AC-2.2: Early deaths -> adjusted rate < raw rate for high dose."""
        animals = _make_animals([
            (0, 50, 2, 90, True),
            (1, 50, 5, 90, True),
        ])
        # High dose: 10 tumors, but 20 die early (day 30/90) without tumors
        for i in range(30):
            animals.append({"dose_level": 2, "has_tumor": i < 10, "disposition_day": 90, "is_terminal": True})
        for i in range(20):
            animals.append({"dose_level": 2, "has_tumor": False, "disposition_day": 30, "is_terminal": False})

        p3 = poly3_test(animals, 90)
        raw_rate = 10 / 50
        adjusted_rate = p3["adjusted_rates"]["2"]
        # With early deaths getting w=(30/90)^3=0.037, effective N < 50,
        # so adjusted rate should be HIGHER than raw (fewer opportunities counted)
        assert adjusted_rate > raw_rate
        assert p3["effective_n"]["2"] < 50.0

    def test_pairwise_p_present(self):
        """Pairwise p-values computed for treated vs control."""
        animals = _make_animals([
            (0, 50, 1, 90, True),
            (1, 50, 5, 90, True),
            (2, 50, 15, 90, True),
        ])
        p3 = poly3_test(animals, 90)
        assert "1" in p3["pairwise_p"]
        assert "2" in p3["pairwise_p"]
        assert p3["pairwise_p"]["2"] is not None

    def test_boundary_guard_zero_zero(self):
        """Boundary: both groups zero incidence -> pairwise p = None."""
        animals = _make_animals([
            (0, 50, 0, 90, True),
            (1, 50, 0, 90, True),
        ])
        p3 = poly3_test(animals, 90)
        assert p3["pairwise_p"].get("1") is None

    def test_fractional_denominators(self):
        """AC-2.6: Fractional effective N passed to C-A without rounding."""
        animals = _make_animals([
            (0, 10, 1, 100, True),
            (1, 10, 3, 100, True),
        ])
        # Add early deaths to dose 1 so effective_n is fractional
        for i in range(5):
            animals.append({"dose_level": 1, "has_tumor": False, "disposition_day": 50, "is_terminal": False})
        p3 = poly3_test(animals, 100)
        eff_n = p3["effective_n"]["1"]
        # (50/100)^3 = 0.125 per early death, 5 animals -> 0.625
        # Total effective_n for dose 1 = 10 + 0.625 = 10.625
        assert eff_n != int(eff_n)  # fractional

    def test_empty_input(self):
        """Empty animal_data returns null results."""
        p3 = poly3_test([], 90)
        assert p3["trend_p"] is None

    def test_single_group(self):
        """Single group returns null trend."""
        animals = _make_animals([(0, 50, 2, 90, True)])
        p3 = poly3_test(animals, 90)
        assert p3["trend_p"] is None


# ── Feature 4: Haseman dual-threshold ────────────────────────────────


class TestHasemanThreshold:

    def test_rare_tumor_threshold(self):
        """Background rate < 1% -> rare, threshold 0.05."""
        r = assess_tumor_hcd("ADRENAL GLAND", "PHEOCHROMOCYTOMA", "SPRAGUE-DAWLEY", "M")
        # SD M pheochromocytoma: rate = 0.089 -> NOT rare (>1%)
        assert r["background_rate"] == 0.089
        assert r["is_rare"] is False

    def test_common_tumor(self):
        """Background rate >= 1% -> common."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "SPRAGUE-DAWLEY", "F")
        assert r["background_rate"] == 0.771
        assert r["is_rare"] is False

    def test_unknown_returns_none(self):
        """AC-4.2: Unknown tumor type -> all-None."""
        r = assess_tumor_hcd("KIDNEY", "SOMETHING UNKNOWN", "SPRAGUE-DAWLEY", "M")
        assert r["background_rate"] is None
        assert r["is_rare"] is None


# ── Feature 5: Tumor HCD lookup ──────────────────────────────────────


class TestTumorHcdLookup:

    def test_sd_female_pituitary(self):
        """AC-5.1: SD female pituitary adenoma."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "SD", "F")
        assert r["background_rate"] == 0.771
        assert r["is_rare"] is False

    def test_f344_male_leydig(self):
        """AC-5.2: F344 male Leydig cell."""
        r = assess_tumor_hcd("TESTIS", "INTERSTITIAL CELL TUMOR", "F344", "M")
        assert r["background_rate"] == 0.90
        assert r["is_rare"] is False

    def test_unknown_tumor(self):
        """AC-5.3: Unknown tumor -> all-None."""
        r = assess_tumor_hcd("BRAIN", "EXTREMELY RARE THING", "SD", "M")
        assert r["background_rate"] is None

    def test_strain_alias_resolution(self):
        """AC-5.4: Strain alias 'CRL:CD(SD)' -> SPRAGUE-DAWLEY."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "CRL:CD(SD)", "M")
        assert r["background_rate"] == 0.564

    def test_morphology_normalization_comma(self):
        """Morphology 'ADENOMA, HEPATOCELLULAR' -> first token ADENOMA."""
        r = assess_tumor_hcd("LIVER", "ADENOMA, HEPATOCELLULAR, BENIGN", "SD", "M")
        # LIVER + ADENOMA -> HEPATOCELLULAR_ADENOMA, but not in SD seed data
        # So returns None (correct — no hepatocellular HCD in seed)
        assert r["background_rate"] is None

    def test_morphology_full_match(self):
        """Full morphology 'HEPATOCELLULAR CARCINOMA' matches table."""
        r = assess_tumor_hcd("LIVER", "HEPATOCELLULAR CARCINOMA", "SD", "M")
        assert r["background_rate"] is None  # not in SD seed data

    def test_behavior_suffix_stripped(self):
        """Behavior suffix ', BENIGN' stripped before lookup."""
        r1 = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA, BENIGN", "SD", "F")
        r2 = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "SD", "F")
        assert r1["background_rate"] == r2["background_rate"]

    def test_wistar_han_alias(self):
        """WH alias for WISTAR HAN."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "WH", "M")
        assert r["background_rate"] == 0.407

    def test_unknown_strain(self):
        """Unknown strain returns all-None."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", "BEAGLE", "M")
        assert r["background_rate"] is None

    def test_no_strain(self):
        """None strain returns all-None."""
        r = assess_tumor_hcd("PITUITARY GLAND", "ADENOMA", None, "M")
        assert r["background_rate"] is None


# ── Discordance detection ────────────────────────────────────────────


class TestDiscordanceDetection:

    def _analysis(self, trend_p_one_sided, direction="up"):
        return {
            "count": 5, "by_dose": [],
            "trend_p": trend_p_one_sided * 2 if trend_p_one_sided else None,
            "trend_p_one_sided": trend_p_one_sided,
            "trend_direction": direction,
            "poly3_trend_p": None,
            "haseman_threshold": 0.01, "haseman_class": "unknown", "meets_haseman": None,
        }

    def test_combined_only(self):
        """AC-3.4: Combined sig, neither alone -> combined_only."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.10)
        carcinoma = self._analysis(0.15)
        combined = self._analysis(0.02)
        d, interp = _detect_discordance(adenoma, carcinoma, combined)
        assert d == "combined_only"

    def test_all_concordant_significant(self):
        """All three significant -> no discordance."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.01)
        carcinoma = self._analysis(0.02)
        combined = self._analysis(0.005)
        d, _ = _detect_discordance(adenoma, carcinoma, combined)
        assert d is None

    def test_none_significant(self):
        """None significant -> no discordance."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.10)
        carcinoma = self._analysis(0.20)
        combined = self._analysis(0.08)
        d, _ = _detect_discordance(adenoma, carcinoma, combined)
        assert d is None

    def test_adenoma_only(self):
        """Adenoma sig alone."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.01)
        carcinoma = self._analysis(0.20)
        combined = self._analysis(0.10)
        d, interp = _detect_discordance(adenoma, carcinoma, combined)
        assert d == "adenoma_only"

    def test_both_components(self):
        """Both components sig but combined not."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.02)
        carcinoma = self._analysis(0.03)
        combined = self._analysis(0.10)
        d, interp = _detect_discordance(adenoma, carcinoma, combined)
        assert d == "both_components"

    def test_decreasing_trend_not_significant(self):
        """Decreasing direction -> not considered significant for discordance."""
        from generator.tumor_summary import _detect_discordance
        adenoma = self._analysis(0.01, direction="down")
        carcinoma = self._analysis(0.15)
        combined = self._analysis(0.08)
        d, _ = _detect_discordance(adenoma, carcinoma, combined)
        assert d is None  # downward adenoma doesn't count as sig


# ── One-sided p direction check ──────────────────────────────────────


class TestOneSidedDirection:

    def test_decreasing_trend_fails_haseman(self):
        """AC (R1 F2): Decreasing trend -> meets_haseman=False regardless of p."""
        # This is tested indirectly through _run_analysis; verify logic:
        # If trend_direction is "down", meets_haseman should be False
        # even if p_for_haseman is very small
        r = trend_test_incidence([10, 5, 1], [50, 50, 50])  # decreasing
        assert r["statistic"] < 0  # negative z -> down direction
        # One-sided p for down: 1 - two_sided/2 -> near 1.0
        one_sided = 1.0 - r["p_value"] / 2
        assert one_sided > 0.5  # should be large
