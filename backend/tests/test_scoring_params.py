"""Tests for ScoringParams dataclass, annotation reader, and parameterized
signal score / NOAEL confidence / target organ computations.

Guards:
- Default ScoringParams reproduce original hardcoded behavior (regression)
- Custom params change computation results as expected
- load_scoring_params handles missing/malformed files gracefully
- Cache hash changes when scoring params change
"""

import json
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.analysis.analysis_settings import (
    AnalysisSettings,
    ScoringParams,
    DEFAULT_PATTERN_SCORES,
    load_scoring_params,
    ANNOTATIONS_DIR,
)
from generator.view_dataframes import (
    _compute_signal_score,
    build_target_organ_summary,
    _compute_noael_confidence,
)


# ──────────────────────────────────────────────────────────────
# ScoringParams dataclass
# ──────────────────────────────────────────────────────────────

class TestScoringParamsDefaults:
    """Verify default values match the original hardcoded constants."""

    def test_continuous_weights(self):
        p = ScoringParams()
        assert p.cont_w_pvalue == 0.35
        assert p.cont_w_trend == 0.20
        assert p.cont_w_effect == 0.25
        assert p.cont_w_pattern == 0.20
        assert abs(p.cont_w_pvalue + p.cont_w_trend + p.cont_w_effect + p.cont_w_pattern - 1.0) < 1e-9

    def test_incidence_weights(self):
        p = ScoringParams()
        assert p.inc_w_pvalue == 0.45
        assert p.inc_w_trend == 0.30
        assert p.inc_w_pattern == 0.25
        assert p.inc_w_severity == 0.10
        assert abs(p.inc_w_pvalue + p.inc_w_trend + p.inc_w_pattern - 1.0) < 1e-9

    def test_pattern_scores(self):
        p = ScoringParams()
        assert p.pattern_scores == DEFAULT_PATTERN_SCORES
        assert p.pattern_scores["monotonic_increase"] == 1.0
        assert p.pattern_scores["flat"] == 0.0
        assert p.pattern_scores["threshold_increase"] == 0.7

    def test_key_thresholds(self):
        p = ScoringParams()
        assert p.p_value_significance == 0.05
        assert p.large_effect == 1.0
        assert p.moderate_effect == 0.5
        assert p.target_organ_evidence == 0.3
        assert p.target_organ_n_significant == 1

    def test_noael_penalties(self):
        p = ScoringParams()
        assert p.penalty_single_endpoint == 0.20
        assert p.penalty_sex_inconsistency == 0.20
        assert p.penalty_pathology_disagreement == 0.0
        assert p.penalty_large_effect_non_sig == 0.20

    def test_is_default(self):
        assert ScoringParams().is_default()

    def test_not_default_after_change(self):
        p = ScoringParams()
        p.cont_w_pvalue = 0.50
        assert not p.is_default()

    def test_hash_deterministic(self):
        assert ScoringParams().params_hash() == ScoringParams().params_hash()

    def test_hash_changes_on_modification(self):
        a = ScoringParams()
        b = ScoringParams()
        b.cont_w_pvalue = 0.50
        assert a.params_hash() != b.params_hash()


# ──────────────────────────────────────────────────────────────
# load_scoring_params
# ──────────────────────────────────────────────────────────────

class TestLoadScoringParams:
    def test_missing_study_returns_defaults(self):
        p = load_scoring_params("__nonexistent_study_xyz__")
        assert p.is_default()

    def test_reads_new_format(self, tmp_path, monkeypatch):
        """New format with continuousWeights + incidenceWeights."""
        study_dir = tmp_path / "TEST_STUDY"
        study_dir.mkdir()
        config = {
            "defaults": {
                "continuousWeights": {"pValue": 0.50, "trend": 0.10, "effectSize": 0.30, "pattern": 0.10},
                "incidenceWeights": {"pValue": 0.50, "trend": 0.25, "pattern": 0.25, "severityModifier": 0.05},
                "patternScores": {"monotonic_increase": 0.9, "flat": 0.1},
                "pValueSignificance": 0.01,
                "largeEffect": 2.0,
                "moderateEffect": 0.8,
                "targetOrganEvidence": 0.5,
                "targetOrganSignificant": 2,
                "noaelPenalties": {
                    "singleEndpoint": -0.30,
                    "sexInconsistency": -0.10,
                    "pathologyDisagreement": 0.0,
                    "largeEffectNonSig": -0.25,
                },
            }
        }
        (study_dir / "threshold_config.json").write_text(json.dumps(config))
        monkeypatch.setattr("services.analysis.analysis_settings.ANNOTATIONS_DIR", tmp_path)

        p = load_scoring_params("TEST_STUDY")
        assert p.cont_w_pvalue == 0.50
        assert p.cont_w_trend == 0.10
        assert p.inc_w_pvalue == 0.50
        assert p.inc_w_severity == 0.05
        assert p.p_value_significance == 0.01
        assert p.large_effect == 2.0
        assert p.target_organ_evidence == 0.5
        assert p.target_organ_n_significant == 2
        assert p.penalty_single_endpoint == 0.30  # abs() applied
        assert p.penalty_sex_inconsistency == 0.10
        assert p.pattern_scores["monotonic_increase"] == 0.9
        # Unmentioned patterns keep defaults
        assert p.pattern_scores["non_monotonic"] == 0.3

    def test_reads_legacy_format(self, tmp_path, monkeypatch):
        """Old format with signalScoreWeights only → maps to continuous."""
        study_dir = tmp_path / "LEGACY"
        study_dir.mkdir()
        config = {
            "defaults": {
                "signalScoreWeights": {"pValue": 0.40, "trend": 0.20, "effectSize": 0.20, "pattern": 0.20},
                "patternScores": {},
                "pValueSignificance": 0.05,
                "largeEffect": 1.0,
                "moderateEffect": 0.5,
                "targetOrganEvidence": 0.3,
                "targetOrganSignificant": 1,
                "noaelPenalties": {},
            }
        }
        (study_dir / "threshold_config.json").write_text(json.dumps(config))
        monkeypatch.setattr("services.analysis.analysis_settings.ANNOTATIONS_DIR", tmp_path)

        p = load_scoring_params("LEGACY")
        assert p.cont_w_pvalue == 0.40  # from signalScoreWeights
        assert p.inc_w_pvalue == 0.45  # default (no incidenceWeights)

    def test_malformed_json_returns_defaults(self, tmp_path, monkeypatch):
        study_dir = tmp_path / "BAD"
        study_dir.mkdir()
        (study_dir / "threshold_config.json").write_text("not json{{{")
        monkeypatch.setattr("services.analysis.analysis_settings.ANNOTATIONS_DIR", tmp_path)
        p = load_scoring_params("BAD")
        assert p.is_default()


# ──────────────────────────────────────────────────────────────
# _compute_signal_score regression
# ──────────────────────────────────────────────────────────────

class TestSignalScoreRegression:
    """Verify default params produce same scores as the old hardcoded version."""

    def test_continuous_baseline(self):
        # p=0.001, trend=0.01, effect=1.5, monotonic_increase
        score = _compute_signal_score(0.001, 0.01, 1.5, "monotonic_increase", "continuous")
        assert score == 0.75

    def test_incidence_baseline(self):
        score = _compute_signal_score(0.001, 0.01, None, "monotonic_increase", "incidence")
        assert abs(score - 0.7375) < 0.001

    def test_none_values(self):
        score = _compute_signal_score(None, None, None, None, "continuous")
        assert score == 0.0

    def test_flat_pattern(self):
        score = _compute_signal_score(0.001, 0.01, 1.5, "flat", "continuous")
        # Same as baseline but pattern component is 0
        assert score < 0.75


class TestSignalScoreCustomParams:
    """Verify custom params change computation."""

    def test_increased_pvalue_weight(self):
        default_score = _compute_signal_score(0.001, None, None, None, "continuous")
        custom = ScoringParams()
        custom.cont_w_pvalue = 0.70  # doubled
        custom_score = _compute_signal_score(0.001, None, None, None, "continuous", params=custom)
        assert custom_score > default_score

    def test_incidence_custom_weights(self):
        default_score = _compute_signal_score(0.001, None, None, "monotonic_increase", "incidence")
        custom = ScoringParams()
        custom.inc_w_pvalue = 0.70
        custom.inc_w_pattern = 0.30
        custom_score = _compute_signal_score(0.001, None, None, "monotonic_increase", "incidence", params=custom)
        assert custom_score != default_score

    def test_custom_pattern_scores(self):
        custom = ScoringParams()
        custom.pattern_scores["flat"] = 0.5  # normally 0
        score = _compute_signal_score(None, None, None, "flat", "continuous", params=custom)
        assert score > 0  # pattern weight * 0.5

    def test_incidence_custom_severity_modifier(self):
        """MI severity modifier weight affects incidence score."""
        # effect_size=2.0 represents MI severity for incidence data
        default_score = _compute_signal_score(None, None, 2.0, None, "incidence")
        custom = ScoringParams()
        custom.inc_w_severity = 0.30  # tripled from 0.10
        custom_score = _compute_signal_score(None, None, 2.0, None, "incidence", params=custom)
        assert custom_score > default_score

    def test_score_always_bounded(self):
        custom = ScoringParams()
        custom.cont_w_pvalue = 2.0  # absurdly high
        score = _compute_signal_score(0.0001, 0.0001, 5.0, "monotonic_increase", "continuous", params=custom)
        assert score <= 1.0


# ──────────────────────────────────────────────────────────────
# _compute_noael_confidence
# ──────────────────────────────────────────────────────────────

class TestNoaelConfidence:
    def test_default_single_endpoint_penalty(self):
        score = _compute_noael_confidence("M", [], [], 1, n_adverse_at_loael=1)
        assert score == 0.8  # 1.0 - 0.2

    def test_custom_zero_penalty(self):
        custom = ScoringParams()
        custom.penalty_single_endpoint = 0.0
        score = _compute_noael_confidence("M", [], [], 1, n_adverse_at_loael=1, params=custom)
        assert score == 1.0

    def test_custom_large_effect_threshold(self):
        """Raising large_effect threshold means fewer findings trigger the penalty."""
        finding = {"data_type": "continuous", "max_effect_size": 1.5, "min_p_adj": 0.10}

        # Default threshold (1.0): |1.5| >= 1.0 AND p >= 0.05 → penalty applies
        default_score = _compute_noael_confidence("M", [finding], [finding], 1, n_adverse_at_loael=2)

        # Custom threshold (2.0): |1.5| < 2.0 → penalty does NOT apply
        custom = ScoringParams()
        custom.large_effect = 2.0
        custom_score = _compute_noael_confidence("M", [finding], [finding], 1, n_adverse_at_loael=2, params=custom)

        assert custom_score > default_score

    def test_score_never_below_zero(self):
        custom = ScoringParams()
        custom.penalty_single_endpoint = 0.5
        custom.penalty_sex_inconsistency = 0.5
        custom.penalty_large_effect_non_sig = 0.5
        # All penalties fire: 1.0 - 0.5 - 0.5 = 0.0 (clamped)
        finding = {"data_type": "continuous", "max_effect_size": 5.0, "min_p_adj": 0.10}
        score = _compute_noael_confidence("Combined", [finding], [finding], 1, n_adverse_at_loael=1, params=custom)
        assert score >= 0.0


# ──────────────────────────────────────────────────────────────
# Target organ thresholds
# ──────────────────────────────────────────────────────────────

class TestTargetOrganThresholds:
    """Verify target_organ_flag uses configurable thresholds."""

    def _make_finding(self, organ: str, p: float, effect: float):
        return {
            "organ_system": organ,
            "domain": "BW",
            "test_code": "WEIGHT",
            "sex": "M",
            "data_type": "continuous",
            "min_p_adj": p,
            "trend_p": p,
            "dose_response_pattern": "monotonic_increase",
            "treatment_related": True,
            "group_stats": [],
            "pairwise": [{"dose_level": 1, "p_value": p, "effect_size": effect}],
        }

    def test_default_threshold(self):
        findings = [self._make_finding("liver", 0.001, 2.0)]
        result = build_target_organ_summary(findings)
        liver = next(r for r in result if r["organ_system"] == "liver")
        assert liver["target_organ_flag"] is True

    def test_raised_threshold_removes_flag(self):
        findings = [self._make_finding("liver", 0.001, 2.0)]
        custom = ScoringParams()
        custom.target_organ_evidence = 0.99  # Very high → flag won't fire
        result = build_target_organ_summary(findings, params=custom)
        liver = next(r for r in result if r["organ_system"] == "liver")
        assert liver["target_organ_flag"] is False

    def test_lowered_n_significant(self):
        # Finding with no significant p-value
        findings = [self._make_finding("liver", 0.10, 2.0)]
        custom = ScoringParams()
        custom.target_organ_n_significant = 0  # Flag even with 0 significant
        custom.target_organ_evidence = 0.01
        result = build_target_organ_summary(findings, params=custom)
        liver = next(r for r in result if r["organ_system"] == "liver")
        assert liver["target_organ_flag"] is True


# ──────────────────────────────────────────────────────────────
# Cache hash integration
# ──────────────────────────────────────────────────────────────

class TestCacheHash:
    def test_default_scoring_no_impact_on_hash(self):
        settings = AnalysisSettings()
        h1 = settings.settings_hash()
        h2 = settings.settings_hash(scoring=ScoringParams())
        assert h1 == h2  # Default scoring is omitted from hash

    def test_custom_scoring_changes_hash(self):
        settings = AnalysisSettings()
        custom = ScoringParams()
        custom.cont_w_pvalue = 0.50
        h1 = settings.settings_hash()
        h2 = settings.settings_hash(scoring=custom)
        assert h1 != h2

    def test_same_custom_scoring_same_hash(self):
        settings = AnalysisSettings()
        a = ScoringParams()
        a.cont_w_pvalue = 0.50
        b = ScoringParams()
        b.cont_w_pvalue = 0.50
        assert settings.settings_hash(scoring=a) == settings.settings_hash(scoring=b)
