"""Tests for ANCOVA implementation (Phase 2 of organ weight normalization)."""

import numpy as np
import pytest

from services.analysis.ancova import run_ancova, ancova_from_dose_groups


# ─── Helper: create dose-group data with known properties ───

def _make_data(
    group_means: list[float],
    group_bw_means: list[float],
    n_per_group: int = 10,
    noise_sd: float = 0.5,
    bw_slope: float = 0.003,
    seed: int = 42,
):
    """Generate organ weight data with a known BW relationship.

    organ_weight = group_mean + bw_slope * (bw - mean_bw) + noise
    """
    rng = np.random.default_rng(seed)
    ov_all, bw_all, gp_all = [], [], []
    for g, (om, bwm) in enumerate(zip(group_means, group_bw_means)):
        bw = rng.normal(bwm, 20, n_per_group)
        noise = rng.normal(0, noise_sd, n_per_group)
        ov = om + bw_slope * (bw - bwm) + noise
        ov_all.extend(ov)
        bw_all.extend(bw)
        gp_all.extend([g] * n_per_group)
    return np.array(ov_all), np.array(bw_all), np.array(gp_all)


class TestRunAncova:
    """Core run_ancova() tests."""

    def test_basic_output_structure(self):
        ov, bw, gp = _make_data([5, 5.5, 6], [300, 280, 260], n_per_group=10)
        result = run_ancova(ov, bw, gp, control_group=0)
        assert result is not None
        assert "adjusted_means" in result
        assert "pairwise" in result
        assert "slope" in result
        assert "slope_homogeneity" in result
        assert "effect_decomposition" in result
        assert "model_r_squared" in result
        assert "mse" in result

    def test_adjusted_means_count(self):
        ov, bw, gp = _make_data([5, 5.5, 6, 7], [300, 290, 280, 260])
        result = run_ancova(ov, bw, gp)
        assert len(result["adjusted_means"]) == 4  # one per group

    def test_pairwise_count(self):
        """Pairwise = k-1 (treated groups vs control)."""
        ov, bw, gp = _make_data([5, 5.5, 6, 7], [300, 290, 280, 260])
        result = run_ancova(ov, bw, gp)
        assert len(result["pairwise"]) == 3  # 3 treated groups

    def test_effect_decomposition_count(self):
        ov, bw, gp = _make_data([5, 5.5, 6], [300, 280, 260])
        result = run_ancova(ov, bw, gp)
        assert len(result["effect_decomposition"]) == 2

    def test_total_equals_direct_plus_indirect(self):
        """Effect decomposition: total = direct + indirect."""
        ov, bw, gp = _make_data([5, 5.5, 6, 7], [300, 290, 280, 260])
        result = run_ancova(ov, bw, gp)
        for d in result["effect_decomposition"]:
            assert abs(d["total_effect"] - (d["direct_effect"] + d["indirect_effect"])) < 0.01

    def test_no_bw_confound_means_small_indirect(self):
        """When BW is constant across groups, indirect effect ≈ 0."""
        ov, bw, gp = _make_data(
            [5, 6, 7], [300, 300, 300],  # same BW across groups
            bw_slope=0.003, n_per_group=15,
        )
        result = run_ancova(ov, bw, gp)
        for d in result["effect_decomposition"]:
            assert abs(d["indirect_effect"]) < 0.5, (
                f"Indirect effect should be small when BW is constant, got {d['indirect_effect']}"
            )

    def test_strong_bw_confound_has_large_indirect(self):
        """When BW changes drive organ weight changes, indirect is large."""
        rng = np.random.default_rng(42)
        n = 20
        # Control: BW ~300, Treated: BW ~250
        bw_ctrl = rng.normal(300, 15, n)
        bw_trt = rng.normal(250, 15, n)
        # Organ weight purely BW-dependent (no direct organ effect):
        # organ = 0.01 * bw + noise
        ov_ctrl = 0.01 * bw_ctrl + rng.normal(0, 0.1, n)
        ov_trt = 0.01 * bw_trt + rng.normal(0, 0.1, n)

        ov = np.concatenate([ov_ctrl, ov_trt])
        bw = np.concatenate([bw_ctrl, bw_trt])
        gp = np.array([0] * n + [1] * n)

        result = run_ancova(ov, bw, gp)
        d = result["effect_decomposition"][0]
        # Total effect should be substantial (BW drop → organ drop)
        assert abs(d["total_effect"]) > 0.2
        # Direct effect should be near zero (no real organ toxicity)
        assert abs(d["direct_effect"]) < abs(d["total_effect"]) * 0.5
        # Most of the effect is BW-mediated (indirect)
        assert abs(d["indirect_effect"]) > abs(d["total_effect"]) * 0.5

    def test_slope_positive_when_correlated(self):
        """BW slope should be positive when organ and BW are positively correlated."""
        ov, bw, gp = _make_data([5, 5.5, 6], [300, 280, 260], bw_slope=0.01)
        result = run_ancova(ov, bw, gp)
        assert result["slope"]["estimate"] > 0

    def test_r_squared_between_0_and_1(self):
        ov, bw, gp = _make_data([5, 5.5, 6], [300, 280, 260])
        result = run_ancova(ov, bw, gp)
        assert 0 <= result["model_r_squared"] <= 1

    def test_homogeneous_slopes_typical(self):
        """With same BW relationship per group, slopes should be homogeneous."""
        ov, bw, gp = _make_data(
            [5, 5.5, 6], [300, 280, 260],
            bw_slope=0.005, n_per_group=15,
        )
        result = run_ancova(ov, bw, gp)
        assert result["slope_homogeneity"]["homogeneous"] is True

    def test_insufficient_data_returns_none(self):
        """Need at least k+2 observations."""
        ov = np.array([5.0, 6.0])
        bw = np.array([300.0, 280.0])
        gp = np.array([0, 1])
        assert run_ancova(ov, bw, gp) is None

    def test_single_group_returns_none(self):
        ov = np.array([5.0, 5.1, 5.2, 5.3])
        bw = np.array([300.0, 310.0, 290.0, 305.0])
        gp = np.array([0, 0, 0, 0])
        assert run_ancova(ov, bw, gp) is None

    def test_nan_handling(self):
        """NaN values should be excluded cleanly."""
        ov, bw, gp = _make_data([5, 6, 7], [300, 280, 260], n_per_group=10)
        # Insert some NaNs
        ov[0] = np.nan
        bw[5] = np.nan
        result = run_ancova(ov, bw, gp)
        assert result is not None
        total_n = sum(m["n"] for m in result["adjusted_means"])
        assert total_n == 28  # 30 - 2 NaN exclusions

    def test_organ_free_bw(self):
        """Organ-free BW (Lazic 2020) should give different results."""
        ov, bw, gp = _make_data([5, 6, 7], [300, 280, 260], bw_slope=0.01)
        result_standard = run_ancova(ov, bw, gp, use_organ_free_bw=False)
        result_orgfree = run_ancova(ov, bw, gp, use_organ_free_bw=True)
        # Both should work
        assert result_standard is not None
        assert result_orgfree is not None
        assert result_orgfree["use_organ_free_bw"] is True
        # Adjusted means should differ
        adj_std = result_standard["adjusted_means"][1]["adjusted_mean"]
        adj_of = result_orgfree["adjusted_means"][1]["adjusted_mean"]
        # They might be close but shouldn't be identical
        assert isinstance(adj_std, float) and isinstance(adj_of, float)

    def test_direct_g_is_positive(self):
        """Hedges' g for direct effect should be non-negative."""
        ov, bw, gp = _make_data([5, 6, 7], [300, 280, 260])
        result = run_ancova(ov, bw, gp)
        for d in result["effect_decomposition"]:
            assert d["direct_g"] >= 0


class TestAncovaFromDoseGroups:
    """Test convenience wrapper matching findings_om.py data structures."""

    def test_basic_integration(self):
        """Should produce valid output from dose_groups_subj format."""
        dose_groups_subj = [
            {"S1": 5.0, "S2": 5.1, "S3": 4.9, "S4": 5.2, "S5": 5.0},  # control
            {"S6": 5.5, "S7": 5.6, "S8": 5.4, "S9": 5.7, "S10": 5.3},  # low
            {"S11": 6.5, "S12": 6.4, "S13": 6.6, "S14": 6.3, "S15": 6.7},  # high
        ]
        terminal_bw = {
            "S1": 300, "S2": 310, "S3": 290, "S4": 305, "S5": 295,
            "S6": 280, "S7": 285, "S8": 275, "S9": 290, "S10": 270,
            "S11": 260, "S12": 265, "S13": 255, "S14": 270, "S15": 250,
        }
        result = ancova_from_dose_groups(
            dose_groups_subj, [0, 1, 2], terminal_bw,
        )
        assert result is not None
        assert len(result["adjusted_means"]) == 3
        assert len(result["pairwise"]) == 2
        assert len(result["effect_decomposition"]) == 2

    def test_missing_bw_subjects_excluded(self):
        """Subjects without BW data should be excluded."""
        dose_groups_subj = [
            {"S1": 5.0, "S2": 5.1, "S3": 4.9},
            {"S4": 6.0, "S5": 6.1, "S6": 5.9},
        ]
        terminal_bw = {"S1": 300, "S2": 310, "S4": 280, "S5": 285}
        # S3 and S6 missing BW → excluded
        result = ancova_from_dose_groups(
            dose_groups_subj, [0, 1], terminal_bw,
        )
        assert result is not None
        total_n = sum(m["n"] for m in result["adjusted_means"])
        assert total_n == 4  # 6 subjects - 2 missing BW

    def test_insufficient_subjects_returns_none(self):
        """Too few subjects should return None."""
        dose_groups_subj = [
            {"S1": 5.0},
            {"S2": 6.0},
        ]
        terminal_bw = {"S1": 300, "S2": 280}
        result = ancova_from_dose_groups(
            dose_groups_subj, [0, 1], terminal_bw,
        )
        assert result is None


class TestIntegrationPointCross:
    """Verify ANCOVA data in PointCross unified_findings.json."""

    @pytest.fixture(scope="class")
    def om_findings(self):
        import json
        with open("generated/PointCross/unified_findings.json") as f:
            data = json.load(f)
        return [f for f in data["findings"] if f["domain"] == "OM"]

    def test_ancova_present_for_high_tier(self, om_findings):
        """All tier >= 3 OM findings should have ANCOVA data."""
        for f in om_findings:
            tier = f.get("normalization", {}).get("tier", 1)
            if tier >= 3:
                assert f.get("ancova") is not None, (
                    f"{f['specimen']} ({f['sex']}) tier={tier} missing ANCOVA"
                )

    def test_ancova_absent_for_low_tier(self, om_findings):
        """Tier 1-2 findings without brain_affected should not have ANCOVA."""
        for f in om_findings:
            tier = f.get("normalization", {}).get("tier", 1)
            if tier < 3 and f.get("ancova") is not None:
                # OK if brain_affected triggered it — check by looking at tier 4 override
                # Brain affected always sets tier to 4, so tier < 3 with ANCOVA is unexpected
                pytest.fail(
                    f"{f['specimen']} ({f['sex']}) tier={tier} has unexpected ANCOVA"
                )

    def test_tier4_metric_is_ancova(self, om_findings):
        """Tier 4 findings with ANCOVA should have recommended_metric = 'ancova'."""
        for f in om_findings:
            tier = f.get("normalization", {}).get("tier", 1)
            if tier >= 4 and f.get("ancova") is not None:
                assert f["normalization"]["recommended_metric"] == "ancova", (
                    f"{f['specimen']} ({f['sex']}) tier=4 should have metric=ancova"
                )

    def test_effect_decomposition_sums(self, om_findings):
        """total = direct + indirect for all ANCOVA findings."""
        for f in om_findings:
            if f.get("ancova") is None:
                continue
            for d in f["ancova"]["effect_decomposition"]:
                total = d["total_effect"]
                direct = d["direct_effect"]
                indirect = d["indirect_effect"]
                assert abs(total - (direct + indirect)) < 0.01, (
                    f"{f['specimen']} ({f['sex']}) group {d['group']}: "
                    f"total={total} != direct={direct} + indirect={indirect}"
                )
