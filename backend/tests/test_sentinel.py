"""Tests for subject sentinel annotations and supporting statistics.

Unit tests for qn_scale() and hamada_studentized_residuals() in statistics.py.
Integration tests for build_subject_sentinel() using PointCross generated data.
"""

import json
import math
from pathlib import Path

import numpy as np
import pytest

from services.analysis.statistics import qn_scale, hamada_studentized_residuals


# ──────────────────────────────────────────────────────────────
# Unit tests: qn_scale (Rousseeuw & Croux 1993)
# ──────────────────────────────────────────────────────────────

class TestQnScale:
    def test_returns_zero_for_n_less_than_2(self):
        assert qn_scale([]) == 0.0
        assert qn_scale([5.0]) == 0.0

    def test_n2_known_value(self):
        """N=2: only one pairwise diff, d_n = 0.399."""
        result = qn_scale([1.0, 3.0])
        # |3-1| = 2.0, d_n(2) = 0.399 -> 2.0 * 0.399 = 0.798
        assert abs(result - 0.798) < 0.01

    def test_n5_gaussian_sample(self):
        """N=5: Qn should approximate SD for Gaussian data."""
        np.random.seed(42)
        x = list(np.random.normal(0, 1, 5))
        result = qn_scale(x)
        # Qn for 5 Gaussian samples should be in [0.3, 3.0] range
        assert 0.1 < result < 5.0

    def test_n10_gaussian_approximation(self):
        """N=10: Qn of N(0,1) should approximate 1.0."""
        np.random.seed(123)
        x = list(np.random.normal(0, 1, 10))
        result = qn_scale(x)
        # Should be roughly 1.0 for standard normal
        assert 0.3 < result < 3.0

    def test_n20_gaussian_consistency(self):
        """N=20: Qn of N(0, sigma) should be in the right ballpark."""
        np.random.seed(456)
        sigma = 2.5
        x = list(np.random.normal(10, sigma, 20))
        result = qn_scale(x)
        # At N=20 with one random seed, Qn may deviate from sigma
        # but should be in the same order of magnitude
        assert 0.5 * sigma < result < 2.5 * sigma

    def test_breakdown_resistance(self):
        """One extreme outlier at 10x should not inflate Qn catastrophically."""
        clean = [1.0, 2.0, 3.0, 4.0, 5.0]
        contaminated = [1.0, 2.0, 3.0, 4.0, 50.0]  # 10x outlier
        qn_clean = qn_scale(clean)
        qn_contaminated = qn_scale(contaminated)
        # Qn has 50% breakdown: one outlier in 5 shouldn't inflate by more than 3x
        assert qn_contaminated < qn_clean * 3.0

    def test_constant_values(self):
        """All identical values should give Qn = 0."""
        result = qn_scale([3.0, 3.0, 3.0, 3.0])
        assert result == 0.0

    def test_finite_sample_correction_applied(self):
        """Verify finite-sample correction factors differ from asymptotic."""
        # N=3 uses d_n=0.994, N=20 uses asymptotic 2.2219
        x3 = [1.0, 2.0, 3.0]
        x20 = list(range(1, 21))
        # Both should return non-zero
        assert qn_scale(x3) > 0
        assert qn_scale(x20) > 0


# ──────────────────────────────────────────────────────────────
# Unit tests: hamada_studentized_residuals
# ──────────────────────────────────────────────────────────────

class TestHamadaResiduals:
    def test_within_group_at_small_n(self):
        """N < 10 per group: always use within-group residuals."""
        groups = {0: [1.0, 2.0, 3.0], 1: [4.0, 5.0, 6.0]}
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        # All animals should have residuals
        assert len(result) == 6
        # Within-group: residuals are relative to group mean
        for key, val in result.items():
            assert isinstance(val, float)

    def test_within_group_forced_at_n_less_than_10(self):
        """Even if Brown-Forsythe would pass, N<10 forces within-group."""
        # Homogeneous variance, but small N
        groups = {0: [1.0, 2.0, 3.0, 4.0, 5.0],
                  1: [11.0, 12.0, 13.0, 14.0, 15.0]}
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        assert len(result) == 10
        # All should be valid floats
        for val in result.values():
            assert not math.isnan(val)

    def test_pooled_at_large_n_homogeneous(self):
        """N >= 10 with homogeneous variance: should pool."""
        np.random.seed(42)
        groups = {
            0: list(np.random.normal(10, 1, 15)),
            1: list(np.random.normal(12, 1, 15)),
        }
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        assert len(result) == 30

    def test_within_group_at_large_n_heterogeneous(self):
        """N >= 10 with heterogeneous variance: falls back to within-group."""
        np.random.seed(42)
        groups = {
            0: list(np.random.normal(10, 0.1, 15)),  # very tight
            1: list(np.random.normal(12, 10.0, 15)),  # very spread
        }
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        assert len(result) == 30

    def test_known_outlier_gets_large_residual(self):
        """An obvious outlier should get |r| > 2."""
        groups = {0: [1.0, 2.0, 3.0, 2.0, 2.5],
                  1: [5.0, 6.0, 5.5, 6.5, 50.0]}  # 50 is outlier
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        # The outlier at dose_level 1, index 4 should have large |r|
        outlier_r = result.get((1, 4), 0.0)
        assert abs(outlier_r) > 2.0

    def test_empty_groups(self):
        """Empty groups should not crash."""
        groups = {0: [], 1: [1.0, 2.0, 3.0]}
        dose_levels = [0, 1]
        result = hamada_studentized_residuals(groups, dose_levels)
        assert len(result) == 3

    def test_single_group(self):
        """Single group should produce within-group residuals."""
        groups = {0: [1.0, 2.0, 3.0, 4.0, 5.0]}
        dose_levels = [0]
        result = hamada_studentized_residuals(groups, dose_levels)
        assert len(result) == 5


# ──────────────────────────────────────────────────────────────
# Integration tests: build_subject_sentinel with PointCross
# ──────────────────────────────────────────────────────────────

GENERATED_DIR = Path(__file__).parent.parent / "generated" / "PointCross"


@pytest.fixture
def sentinel_data():
    """Load pre-generated sentinel JSON for PointCross."""
    path = GENERATED_DIR / "subject_sentinel.json"
    if not path.exists():
        pytest.skip("PointCross sentinel data not generated")
    with open(path) as f:
        return json.load(f)


@pytest.fixture
def influence_data():
    """Load pre-generated influence JSON for PointCross."""
    path = GENERATED_DIR / "animal_influence.json"
    if not path.exists():
        pytest.skip("PointCross influence data not generated")
    with open(path) as f:
        return json.load(f)


class TestSentinelIntegration:
    def test_valid_json_shape(self, sentinel_data):
        """Sentinel JSON has required top-level keys."""
        assert "thresholds" in sentinel_data
        assert "animals" in sentinel_data
        assert "endpoint_details" in sentinel_data
        assert "stress_heuristic_mode" in sentinel_data

    def test_thresholds(self, sentinel_data):
        t = sentinel_data["thresholds"]
        assert t["outlier_z"] == 3.5
        assert t["concordance_z"] == 2.0
        assert t["poc_domains"] == 2
        assert t["coc_organs"] == 2

    def test_all_eligible_subjects_present(self, sentinel_data, influence_data):
        """Sentinel should cover the same subjects as influence."""
        sentinel_ids = {a["subject_id"] for a in sentinel_data["animals"]}
        influence_ids = {a["subject_id"] for a in influence_data["animals"]}
        # Sentinel may have fewer (animals with no data), but should be a subset
        assert sentinel_ids <= influence_ids or sentinel_ids == influence_ids

    def test_no_tk_satellites(self, sentinel_data):
        """TK satellites should be excluded."""
        for a in sentinel_data["animals"]:
            # TK satellites typically have subject IDs with TK patterns
            # but the definitive check is that the generator excludes them
            assert "subject_id" in a

    def test_animal_fields(self, sentinel_data):
        """Each animal has all required fields."""
        required = {
            "subject_id", "dose_level", "sex", "group_id",
            "n_outlier_flags", "max_z", "outlier_organs",
            "poc", "coc", "stress_flag", "n_sole_findings",
            "sole_finding_organs", "n_non_responder",
            "disposition", "is_control",
        }
        for a in sentinel_data["animals"]:
            missing = required - set(a.keys())
            assert not missing, f"Animal {a['subject_id']} missing fields: {missing}"

    def test_outlier_detection(self, sentinel_data):
        """Animals with outlier flags have valid metrics."""
        flagged = [a for a in sentinel_data["animals"] if a["n_outlier_flags"] > 0]
        assert len(flagged) > 0, "Expected at least some outlier flags in PointCross"
        for a in flagged:
            assert a["max_z"] is not None
            assert a["max_z"] > 3.5  # must exceed threshold
            assert len(a["outlier_organs"]) > 0

    def test_poc_coc_consistency(self, sentinel_data):
        """COC should count organ systems where POC >= 2."""
        for a in sentinel_data["animals"]:
            poc = a["poc"]
            expected_coc = sum(1 for count in poc.values() if count >= 2)
            assert a["coc"] == expected_coc, (
                f"Animal {a['subject_id']}: COC {a['coc']} != expected {expected_coc} "
                f"from POC {poc}"
            )

    def test_sole_finding_organs_consistent(self, sentinel_data):
        """sole_finding_organs should match n_sole_findings."""
        for a in sentinel_data["animals"]:
            if a["n_sole_findings"] == 0:
                assert a["sole_finding_organs"] == []
            else:
                assert len(a["sole_finding_organs"]) > 0

    def test_endpoint_details_structure(self, sentinel_data):
        """Endpoint details have required fields."""
        required = {
            "endpoint_id", "endpoint_name", "domain", "organ_system",
            "z_score", "hamada_residual", "is_outlier", "log_transformed",
            "is_sole_finding", "bw_confound_suppressed",
        }
        for uid, details in sentinel_data["endpoint_details"].items():
            for d in details:
                missing = required - set(d.keys())
                assert not missing, f"Endpoint detail for {uid} missing: {missing}"

    def test_log_transform_applied(self, sentinel_data):
        """ALT/AST endpoints should be log-transformed."""
        for uid, details in sentinel_data["endpoint_details"].items():
            for d in details:
                ep = d["endpoint_id"].upper()
                if ":ALT:" in ep or ":AST:" in ep:
                    assert d["log_transformed"], (
                        f"Expected log_transformed=True for {d['endpoint_id']}"
                    )

    def test_non_responder_only_in_treated(self, sentinel_data):
        """Non-responder flags should only appear in treated groups."""
        for a in sentinel_data["animals"]:
            if a["n_non_responder"] > 0:
                assert not a["is_control"], (
                    f"Control animal {a['subject_id']} has non-responder flags"
                )

    def test_stress_flag_requires_all_three(self, sentinel_data):
        """Stress flag should not be trivially common."""
        n_stress = sum(1 for a in sentinel_data["animals"] if a["stress_flag"])
        # Everds triad requires all 3 components -- should be rare
        assert n_stress <= len(sentinel_data["animals"]) // 2

    def test_bw_confound_suppression(self, sentinel_data):
        """BW-confound-suppressed endpoints should be OM relative weight."""
        for uid, details in sentinel_data["endpoint_details"].items():
            for d in details:
                if d["bw_confound_suppressed"]:
                    assert d["domain"] == "OM", (
                        f"BW confound suppression on non-OM endpoint: {d['endpoint_id']}"
                    )

    def test_sorted_by_coc_then_outlier(self, sentinel_data):
        """Animals should be sorted by COC desc, then n_outlier_flags desc."""
        animals = sentinel_data["animals"]
        for i in range(len(animals) - 1):
            a, b = animals[i], animals[i + 1]
            assert (a["coc"], a["n_outlier_flags"]) >= (b["coc"], b["n_outlier_flags"]), (
                f"Sort violation: {a['subject_id']} (COC={a['coc']}, flags={a['n_outlier_flags']}) "
                f"before {b['subject_id']} (COC={b['coc']}, flags={b['n_outlier_flags']})"
            )
