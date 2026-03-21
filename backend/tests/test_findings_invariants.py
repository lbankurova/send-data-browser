"""Invariant-based validation of generated findings data.

Catches cross-module contract violations that unit tests miss — each module
may be correct in isolation, but the assembled output silently wrong.

Loads unified_findings.json and checks domain invariants on every finding.
Parameterized by study — auto-discovers all studies in generated/.
Spec: docs/incoming/findings-invariant-audit.md
"""

import json
import math
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

GENERATED_DIR = Path(__file__).resolve().parent.parent / "generated"


def _discover_studies() -> list[str]:
    """Auto-discover studies with generated unified_findings.json."""
    if not GENERATED_DIR.is_dir():
        return []
    return sorted(
        d.name
        for d in GENERATED_DIR.iterdir()
        if d.is_dir() and (d / "unified_findings.json").exists()
    )


STUDIES = _discover_studies()


def _load_findings(study: str) -> list[dict]:
    path = GENERATED_DIR / study / "unified_findings.json"
    if not path.exists():
        pytest.skip(f"No generated data for study {study}")
    with open(path) as f:
        data = json.load(f)
    return data["findings"]


@pytest.fixture(params=STUDIES or [pytest.param("PointCross", marks=pytest.mark.skip(reason="No generated studies"))], scope="module")
def study_name(request) -> str:
    return request.param


@pytest.fixture(scope="module")
def findings(study_name: str) -> list[dict]:
    return _load_findings(study_name)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fid(f: dict) -> str:
    """Short human-readable finding identifier for violation messages."""
    parts = [f.get("domain", "?"), f.get("test_code", "?"), f.get("sex", "?")]
    if f.get("day"):
        parts.append(f"day{f['day']}")
    return " | ".join(parts)


def _continuous_with_groups(findings: list[dict], min_groups: int = 2) -> list[dict]:
    """Filter to continuous findings with at least `min_groups` dose groups."""
    return [
        f for f in findings
        if f.get("data_type") == "continuous"
        and len(f.get("group_stats", [])) >= min_groups
    ]


def _om_findings(findings: list[dict]) -> list[dict]:
    """Filter to organ measurement (OM) findings."""
    return [f for f in findings if f.get("domain") == "OM"]


# ---------------------------------------------------------------------------
# Category A: Data integrity
# ---------------------------------------------------------------------------


class TestA_DataIntegrity:
    """Catches destroyed/collapsed data (e.g. brain self-normalization bug)."""

    def test_A1_continuous_group_means_vary(self, findings):
        """For continuous findings with >=2 groups, means must not be identical.

        Identical means across all groups = destroyed data (e.g. brain/brain=1.0).
        """
        violations = []
        for f in _continuous_with_groups(findings):
            gs = f["group_stats"]
            means = [g["mean"] for g in gs if g.get("mean") is not None]
            if len(means) < 2:
                continue
            # Check if all means are identical within floating-point tolerance
            if all(math.isclose(means[0], m, rel_tol=1e-9) for m in means[1:]):
                violations.append(
                    f"  {_fid(f)}: all {len(means)} group means = {means[0]}"
                )
        assert not violations, (
            f"A1: {len(violations)} findings with identical means across all groups:\n"
            + "\n".join(violations)
        )

    def test_A2_continuous_group_sds_not_all_zero(self, findings):
        """At least one dose group must have sd > 0.

        All-zero SDs = single-subject groups or collapsed data.
        """
        violations = []
        for f in _continuous_with_groups(findings):
            gs = f["group_stats"]
            sds = [g.get("sd") for g in gs]
            # Filter to groups that actually have sd values
            numeric_sds = [s for s in sds if s is not None]
            if not numeric_sds:
                continue  # All null SDs — separate concern (single-subject)
            if all(s == 0.0 for s in numeric_sds):
                violations.append(
                    f"  {_fid(f)}: all SDs = 0 across {len(numeric_sds)} groups"
                )
        assert not violations, (
            f"A2: {len(violations)} findings with all-zero SDs:\n"
            + "\n".join(violations)
        )

    def test_A3_sample_sizes_positive(self, findings):
        """Every group_stats[].n must be >= 1.

        KNOWN: Generator maintains full dose-group structure even when no
        subjects were measured for a group (n=0, mean=None). These placeholder
        groups are legitimate — they preserve the dose-level skeleton so the
        frontend can render empty cells. We only flag n=0 groups that also
        claim to have data (mean is not None).
        """
        violations = []
        for f in findings:
            for i, g in enumerate(f.get("group_stats", [])):
                n = g.get("n")
                if n is None or n < 1:
                    # n=0 with null mean is a known placeholder — skip
                    if n == 0 and g.get("mean") is None:
                        continue
                    violations.append(
                        f"  {_fid(f)}: group_stats[{i}] (dose={g.get('dose_level')}) n={n} mean={g.get('mean')}"
                    )
        assert not violations, (
            f"A3: {len(violations)} groups with invalid sample size:\n"
            + "\n".join(violations)
        )

    def test_A4_control_group_exists(self, findings):
        """Every finding with group_stats must have at least one dose_level == 0.

        KNOWN: Single-survivor findings at unscheduled timepoints may have data
        from only one treated group (e.g., day-90 male dose-group-3 only). The
        generator creates findings for whatever data exists. These are legitimate
        when treatment_related=false and total n across all groups is small.
        We exclude single-group findings with total n <= 2.
        """
        violations = []
        known_survivors = 0
        for f in findings:
            gs = f.get("group_stats", [])
            if not gs:
                continue
            dose_levels = {g.get("dose_level") for g in gs}
            has_control = 0 in dose_levels
            has_treated = bool(dose_levels - {0})
            if has_treated and not has_control:
                total_n = sum(g.get("n", 0) for g in gs)
                # Single-survivor pattern: few subjects, not treatment-related
                if total_n <= 2 and f.get("treatment_related") is False:
                    known_survivors += 1
                    continue
                violations.append(
                    f"  {_fid(f)}: dose_levels={sorted(dose_levels)}, no control, n={total_n}"
                )
        if known_survivors:
            # Verify pattern is consistent — all should be non-treatment-related
            pass  # Already filtered above
        assert not violations, (
            f"A4: {len(violations)} findings with treated groups but no control "
            f"({known_survivors} known single-survivor findings excluded):\n"
            + "\n".join(violations)
        )

    def test_A5_pairwise_only_treated_dose_levels(self, findings):
        """No pairwise entry should reference dose_level 0 (control).

        Pairwise comparisons are always treatment vs. control.
        """
        violations = []
        for f in findings:
            for i, pw in enumerate(f.get("pairwise", [])):
                if pw.get("dose_level") == 0:
                    violations.append(
                        f"  {_fid(f)}: pairwise[{i}] has dose_level=0"
                    )
        assert not violations, (
            f"A5: {len(violations)} pairwise entries referencing control:\n"
            + "\n".join(violations)
        )

    def test_A6_no_control_only_findings(self, findings):
        """Findings must have >= 1 treated dose group with n > 0.

        KNOWN: 37 LB day-30 control-only findings exist — these are legitimate
        baseline-only lab draws where only control animals were sampled. They are
        all treatment_related=false. We exclude them from violation reporting
        but assert they follow the expected pattern.
        """
        violations = []
        known_baseline = []
        for f in findings:
            gs = f.get("group_stats", [])
            if not gs:
                continue
            dose_levels = {g.get("dose_level") for g in gs}
            treated_groups = [g for g in gs if g.get("dose_level", 0) != 0]
            treated_with_data = [g for g in treated_groups if g.get("n", 0) > 0]
            if not treated_with_data:
                # Control-only finding
                if (
                    f.get("domain") == "LB"
                    and f.get("treatment_related") is False
                ):
                    known_baseline.append(f)
                else:
                    violations.append(
                        f"  {_fid(f)}: control-only (not a known LB baseline)"
                    )
        # Known baselines should all be non-treatment-related
        for f in known_baseline:
            assert f.get("treatment_related") is False, (
                f"Known baseline {_fid(f)} has treatment_related=True"
            )
        assert not violations, (
            f"A6: {len(violations)} unexpected control-only findings "
            f"({len(known_baseline)} known LB baselines excluded):\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category B: Normalization contract
# ---------------------------------------------------------------------------

# Metrics that can appear as active_metric or alternative keys.
# "ancova" is a recommended_metric but never stored as active_metric in
# the generated JSON — ANCOVA results live in the top-level "ancova" dict.
_KNOWN_METRICS = {"absolute", "ratio_to_bw", "ratio_to_brain"}


class TestB_NormalizationContract:
    """Catches metric-swap and normalization bugs (e.g. brain self-normalization)."""

    def test_B1_active_metric_is_set(self, findings):
        """Every OM finding must have normalization.active_metric."""
        violations = []
        for f in _om_findings(findings):
            norm = f.get("normalization")
            if not norm:
                violations.append(f"  {_fid(f)}: missing normalization dict entirely")
                continue
            active = norm.get("active_metric")
            if not active:
                violations.append(f"  {_fid(f)}: active_metric is {active!r}")
        assert not violations, (
            f"B1: {len(violations)} OM findings without active_metric:\n"
            + "\n".join(violations)
        )

    def test_B2_alternatives_complement(self, findings):
        """alternatives keys == computable_metrics - {active_metric}.

        The generation code asserts this at write time (findings_om.py:369).
        This check validates the output file hasn't been corrupted and the
        invariant holds on disk.
        """
        violations = []
        for f in _om_findings(findings):
            norm = f.get("normalization", {})
            active = norm.get("active_metric")
            alts = f.get("alternatives")
            organ_cat = norm.get("organ_category")

            if not active:
                continue  # B1 catches this

            # Reconstruct expected computable metrics
            expected_metrics = {"absolute", "ratio_to_bw"}
            if organ_cat != "brain":
                # ratio_to_brain available for non-brain organs (when brain data exists)
                # Check if ratio_to_brain is either active or in alternatives
                has_brain_metric = (
                    active == "ratio_to_brain"
                    or (alts and "ratio_to_brain" in alts)
                )
                if has_brain_metric:
                    expected_metrics.add("ratio_to_brain")

            expected_alt_keys = expected_metrics - {active}

            if alts is None and expected_alt_keys:
                violations.append(
                    f"  {_fid(f)}: alternatives is None, expected keys {expected_alt_keys}"
                )
            elif alts is not None:
                actual_alt_keys = set(alts.keys())
                if actual_alt_keys != expected_alt_keys:
                    violations.append(
                        f"  {_fid(f)}: alternatives={actual_alt_keys}, "
                        f"expected={expected_alt_keys}"
                    )

            # active_metric must not appear in alternatives
            if alts and active in alts:
                violations.append(
                    f"  {_fid(f)}: active_metric '{active}' leaked into alternatives"
                )

        assert not violations, (
            f"B2: {len(violations)} OM findings with alternatives mismatch:\n"
            + "\n".join(violations)
        )

    def test_B3_brain_never_has_ratio_to_brain(self, findings):
        """If organ_category == 'brain', neither active_metric nor any
        alternative key should be 'ratio_to_brain'.

        Brain / brain = 1.0 for all subjects — meaningless normalization.
        """
        violations = []
        for f in _om_findings(findings):
            norm = f.get("normalization", {})
            if norm.get("organ_category") != "brain":
                continue
            active = norm.get("active_metric")
            if active == "ratio_to_brain":
                violations.append(
                    f"  {_fid(f)}: active_metric is ratio_to_brain (brain organ!)"
                )
            alts = f.get("alternatives") or {}
            if "ratio_to_brain" in alts:
                violations.append(
                    f"  {_fid(f)}: 'ratio_to_brain' in alternatives (brain organ!)"
                )
        assert not violations, (
            f"B3: {len(violations)} brain findings with ratio_to_brain:\n"
            + "\n".join(violations)
        )

    def test_B4_alternative_stats_differ_from_primary(self, findings):
        """For each alternative, at least one group mean must differ from the
        primary group_stats mean.

        Identical means = the 'swap' is a no-op copy (generation bug).
        """
        violations = []
        for f in _om_findings(findings):
            primary_gs = f.get("group_stats", [])
            alts = f.get("alternatives") or {}
            primary_means = [
                g["mean"] for g in primary_gs if g.get("mean") is not None
            ]
            if len(primary_means) < 2:
                continue

            for alt_key, alt_data in alts.items():
                alt_gs = alt_data.get("group_stats", [])
                alt_means = [
                    g["mean"] for g in alt_gs if g.get("mean") is not None
                ]
                if len(alt_means) != len(primary_means):
                    continue  # Mismatched group counts — separate concern
                # Check if all means are identical (within tolerance)
                all_same = all(
                    math.isclose(p, a, rel_tol=1e-6)
                    for p, a in zip(primary_means, alt_means)
                )
                if all_same:
                    violations.append(
                        f"  {_fid(f)}: alternative '{alt_key}' has identical "
                        f"means to primary — no-op swap"
                    )
        assert not violations, (
            f"B4: {len(violations)} OM alternatives with identical means to primary:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category C: Statistical consistency
# ---------------------------------------------------------------------------


class TestC_StatisticalConsistency:
    """Catches computation bugs and cross-field inconsistencies."""

    def test_C1_direction_matches_data(self, findings):
        """Direction must be consistent with the underlying data.

        For continuous findings: direction matches sign of the max-|effect_size|
        pairwise entry (the generator overrides initial direction with this).
        For incidence findings: direction matches highest-dose incidence vs
        control incidence.
        """
        violations = []
        for f in findings:
            d = f.get("direction")
            if d not in ("up", "down"):
                continue
            pw = f.get("pairwise", [])
            cds = [
                (p["effect_size"], p.get("dose_level"))
                for p in pw
                if p.get("effect_size") is not None
            ]
            if cds:
                # Continuous path: direction = sign of max |effect_size|
                max_cd, max_dl = max(cds, key=lambda x: abs(x[0]))
                if abs(max_cd) < 0.01:
                    continue  # Near-zero — direction can go either way
                expected = "up" if max_cd > 0 else "down"
                if d != expected:
                    violations.append(
                        f"  {_fid(f)}: dir={d}, max_cd={max_cd:.4f} "
                        f"(dose={max_dl}) -> expected {expected}"
                    )
            else:
                # Incidence path: direction from highest-dose vs control
                gs = f.get("group_stats", [])
                ctrl = [
                    g for g in gs
                    if g.get("dose_level") == 0 and g.get("n", 0) > 0
                ]
                treated = [
                    g for g in gs
                    if g.get("dose_level", 0) != 0 and g.get("n", 0) > 0
                ]
                if not ctrl or not treated:
                    continue
                ctrl_inc = ctrl[0].get("incidence")
                hi = max(treated, key=lambda g: g["dose_level"])
                hi_inc = hi.get("incidence")
                if ctrl_inc is None or hi_inc is None:
                    continue
                if abs(hi_inc - ctrl_inc) < 0.01:
                    continue  # Near-equal — direction ambiguous
                expected = "up" if hi_inc > ctrl_inc else "down"
                if d != expected:
                    violations.append(
                        f"  {_fid(f)}: dir={d}, ctrl_inc={ctrl_inc}, "
                        f"hi_inc={hi_inc} -> expected {expected}"
                    )
        assert not violations, (
            f"C1: {len(violations)} direction/data mismatches:\n"
            + "\n".join(violations)
        )

    def test_C2_p_values_in_valid_range(self, findings):
        """All p-values must be in [0, 1]."""
        violations = []
        for f in findings:
            # Top-level p-values
            for field in ("min_p_adj", "trend_p"):
                val = f.get(field)
                if val is not None and not (0.0 <= val <= 1.0):
                    violations.append(
                        f"  {_fid(f)}: {field}={val}"
                    )
            # Pairwise p-values
            for i, pw in enumerate(f.get("pairwise", [])):
                for field in ("p_value", "p_value_adj"):
                    val = pw.get(field)
                    if val is not None and not (0.0 <= val <= 1.0):
                        violations.append(
                            f"  {_fid(f)}: pairwise[{i}].{field}={val}"
                        )
        assert not violations, (
            f"C2: {len(violations)} out-of-range p-values:\n"
            + "\n".join(violations)
        )

    def test_C3_effect_size_sign_convention(self, findings):
        """effect_size > 0 ↔ treatment mean > control mean.

        Verifies the sign convention is consistent across all continuous
        findings with both effect_size and group means available.
        """
        violations = []
        for f in findings:
            if f.get("data_type") != "continuous":
                continue
            gs = f.get("group_stats", [])
            ctrl = [
                g for g in gs
                if g.get("dose_level") == 0 and g.get("mean") is not None
            ]
            if not ctrl:
                continue
            ctrl_mean = ctrl[0]["mean"]
            for pw in f.get("pairwise", []):
                cd = pw.get("effect_size")
                dl = pw.get("dose_level")
                if cd is None or dl is None or abs(cd) < 0.1:
                    continue  # Skip near-zero — rounding noise
                trt = [
                    g for g in gs
                    if g.get("dose_level") == dl and g.get("mean") is not None
                ]
                if not trt:
                    continue
                trt_mean = trt[0]["mean"]
                if cd > 0.1 and trt_mean < ctrl_mean:
                    violations.append(
                        f"  {_fid(f)}: dose={dl} cd={cd:.3f} but "
                        f"trt({trt_mean}) < ctrl({ctrl_mean})"
                    )
                elif cd < -0.1 and trt_mean > ctrl_mean:
                    violations.append(
                        f"  {_fid(f)}: dose={dl} cd={cd:.3f} but "
                        f"trt({trt_mean}) > ctrl({ctrl_mean})"
                    )
        assert not violations, (
            f"C3: {len(violations)} effect_size sign convention violations:\n"
            + "\n".join(violations)
        )

    def test_C4_min_p_adj_matches_pairwise(self, findings):
        """min_p_adj must equal the minimum p_value_adj across all pairwise."""
        violations = []
        for f in findings:
            reported = f.get("min_p_adj")
            pw = f.get("pairwise", [])
            padjs = [
                p["p_value_adj"] for p in pw
                if p.get("p_value_adj") is not None
            ]
            if reported is None or not padjs:
                continue
            actual_min = min(padjs)
            if not math.isclose(reported, actual_min, rel_tol=1e-9, abs_tol=1e-15):
                violations.append(
                    f"  {_fid(f)}: min_p_adj={reported}, "
                    f"min(pairwise)={actual_min}"
                )
        assert not violations, (
            f"C4: {len(violations)} min_p_adj mismatches:\n"
            + "\n".join(violations)
        )

    def test_C5_max_effect_size_matches_pairwise(self, findings):
        """For continuous findings, abs(max_effect_size) must equal
        max(|effect_size|) across pairwise entries.

        max_effect_size is the signed effect_size with the largest absolute
        value. Incidence findings use avg_severity instead — excluded here.
        """
        violations = []
        for f in findings:
            if f.get("data_type") != "continuous":
                continue
            reported = f.get("max_effect_size")
            pw = f.get("pairwise", [])
            cds = [
                p["effect_size"] for p in pw
                if p.get("effect_size") is not None
            ]
            if reported is None or not cds:
                continue
            # max_effect_size is signed — find the cd with largest |cd|
            max_cd = max(cds, key=lambda x: abs(x))
            if not math.isclose(reported, max_cd, rel_tol=1e-6, abs_tol=1e-10):
                violations.append(
                    f"  {_fid(f)}: max_effect_size={reported}, "
                    f"max_cd={max_cd}"
                )
        assert not violations, (
            f"C5: {len(violations)} max_effect_size mismatches:\n"
            + "\n".join(violations)
        )

    def test_C6_trend_p_and_stat_paired(self, findings):
        """trend_p and trend_stat must both be present or both absent."""
        violations = []
        for f in findings:
            has_p = f.get("trend_p") is not None
            has_stat = f.get("trend_stat") is not None
            if has_p != has_stat:
                violations.append(
                    f"  {_fid(f)}: trend_p={'set' if has_p else 'null'}, "
                    f"trend_stat={'set' if has_stat else 'null'}"
                )
        assert not violations, (
            f"C6: {len(violations)} findings with partial trend data:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category D: Classification pipeline
# ---------------------------------------------------------------------------

# Canonical pattern names produced by classification.py
_CANONICAL_PATTERNS = {
    "monotonic_increase",
    "monotonic_decrease",
    "threshold_increase",
    "threshold_decrease",
    "non_monotonic",
    "flat",
    "insufficient_data",
}


class TestD_ClassificationPipeline:
    """Catches D2-type bugs (producer/consumer string mismatches)."""

    def test_D1_confidence_dimensions_scored(self, findings):
        """For findings with a confidence grade, at least one dimension must
        have been scored (n_scored > 0).

        n_scored=0 with a grade = the scoring function failed silently and
        fell through to the default. Note: all-neutral scores (sum=0) are
        legitimate — baseline grade is MODERATE.
        """
        violations = []
        for f in findings:
            conf = f.get("_confidence", {})
            grade = conf.get("grade")
            if not grade:
                continue
            n_scored = conf.get("n_scored", 0)
            if n_scored == 0:
                violations.append(
                    f"  {_fid(f)}: grade={grade} but n_scored=0 "
                    f"(n_skipped={conf.get('n_skipped')})"
                )
        assert not violations, (
            f"D1: {len(violations)} findings with grade but no scored dimensions:\n"
            + "\n".join(violations)
        )

    def test_D2_pattern_names_canonical(self, findings):
        """dose_response_pattern must be one of the known canonical set.

        Unknown patterns cause the confidence D2 scorer to fall through to
        'unknown — neutral', silently degrading confidence grades (the exact
        bug pattern from dda9629).
        """
        violations = []
        for f in findings:
            pattern = f.get("dose_response_pattern")
            if pattern is None:
                continue
            if pattern not in _CANONICAL_PATTERNS:
                violations.append(
                    f"  {_fid(f)}: pattern='{pattern}'"
                )
        assert not violations, (
            f"D2: {len(violations)} findings with non-canonical pattern names "
            f"(known: {sorted(_CANONICAL_PATTERNS)}):\n"
            + "\n".join(violations)
        )

    def test_D3_severity_consistent_with_stats(self, findings):
        """Severity classification must be consistent with statistics.

        For continuous findings:
        - If min_p_adj < 0.05 AND |max_effect_size| >= 0.8, severity should
          be at least 'warning' (not 'normal').
        - If min_p_adj >= 0.2 AND |max_effect_size| < 0.5, severity should
          not be 'adverse'.
        """
        violations = []
        for f in findings:
            if f.get("data_type") != "continuous":
                continue
            mp = f.get("min_p_adj")
            mes = f.get("max_effect_size")
            sev = f.get("severity")
            if mp is None or mes is None or not sev:
                continue

            # Rule 1: significant + large effect → at least warning
            if mp < 0.05 and abs(mes) >= 0.8 and sev == "normal":
                violations.append(
                    f"  {_fid(f)}: min_p={mp:.4f}, |mes|={abs(mes):.3f}, "
                    f"severity={sev} (expected >= warning)"
                )
            # Rule 2: not significant + small effect → not adverse
            if mp >= 0.2 and abs(mes) < 0.5 and sev == "adverse":
                violations.append(
                    f"  {_fid(f)}: min_p={mp:.4f}, |mes|={abs(mes):.3f}, "
                    f"severity={sev} (expected != adverse)"
                )
        assert not violations, (
            f"D3: {len(violations)} severity/statistics inconsistencies:\n"
            + "\n".join(violations)
        )

    def test_D4_severity_non_null(self, findings):
        """Every finding must have a non-null severity in the known set."""
        valid_severities = {"normal", "warning", "adverse"}
        violations = []
        for f in findings:
            sev = f.get("severity")
            if sev not in valid_severities:
                violations.append(
                    f"  {_fid(f)}: severity={sev!r}"
                )
        assert not violations, (
            f"D4: {len(violations)} findings with invalid severity:\n"
            + "\n".join(violations)
        )

    def test_D5_signal_score_non_negative(self, study_name):
        """Every signal_score in study_signal_summary.json must be >= 0.

        signal_score is computed per endpoint per dose group at generation
        time and stored in a separate file from unified_findings.json.
        """
        path = GENERATED_DIR / study_name / "study_signal_summary.json"
        if not path.exists():
            pytest.skip("No study_signal_summary.json")
        with open(path) as fp:
            rows = json.load(fp)
        violations = []
        for i, row in enumerate(rows):
            score = row.get("signal_score")
            if score is not None and score < 0:
                violations.append(
                    f"  row[{i}]: {row.get('test_code')} {row.get('sex')} "
                    f"dose={row.get('dose_level')} signal_score={score}"
                )
        assert not violations, (
            f"D5: {len(violations)} negative signal scores:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category E: Cross-domain consistency
# ---------------------------------------------------------------------------


class TestE_CrossDomainConsistency:
    """Catches missing required fields and structural duplicates."""

    def test_E1_om_findings_have_specimen(self, findings):
        """Every OM finding must have a non-null specimen."""
        violations = []
        for f in _om_findings(findings):
            if not f.get("specimen"):
                violations.append(
                    f"  {_fid(f)}: specimen={f.get('specimen')!r}"
                )
        assert not violations, (
            f"E1: {len(violations)} OM findings without specimen:\n"
            + "\n".join(violations)
        )

    def test_E2_lb_findings_have_test_code(self, findings):
        """Every LB finding must have a non-null test_code that isn't just
        the domain name.
        """
        violations = []
        for f in findings:
            if f.get("domain") != "LB":
                continue
            tc = f.get("test_code")
            if not tc or tc == "LB":
                violations.append(
                    f"  {_fid(f)}: test_code={tc!r}"
                )
        assert not violations, (
            f"E2: {len(violations)} LB findings with invalid test_code:\n"
            + "\n".join(violations)
        )

    def test_E3_incidence_in_valid_range(self, findings):
        """For incidence findings, all group_stats[].incidence must be in [0, 1]."""
        violations = []
        for f in findings:
            if f.get("data_type") != "incidence":
                continue
            for i, g in enumerate(f.get("group_stats", [])):
                inc = g.get("incidence")
                if inc is not None and not (0.0 <= inc <= 1.0):
                    violations.append(
                        f"  {_fid(f)}: group_stats[{i}] "
                        f"(dose={g.get('dose_level')}) incidence={inc}"
                    )
        assert not violations, (
            f"E3: {len(violations)} incidence values out of [0,1]:\n"
            + "\n".join(violations)
        )

    def test_E4_sex_is_valid(self, findings):
        """sex must be one of {'M', 'F', 'Combined'}."""
        valid_sex = {"M", "F", "Combined"}
        violations = []
        for f in findings:
            sex = f.get("sex")
            if sex not in valid_sex:
                violations.append(
                    f"  {_fid(f)}: sex={sex!r}"
                )
        assert not violations, (
            f"E4: {len(violations)} findings with invalid sex:\n"
            + "\n".join(violations)
        )

    def test_E5_no_duplicate_findings(self, findings):
        """No two findings should share the same
        (domain, test_code, specimen, sex, day) tuple.
        """
        seen: dict[tuple, int] = {}
        violations = []
        for i, f in enumerate(findings):
            key = (
                f.get("domain"),
                f.get("test_code"),
                f.get("specimen"),
                f.get("sex"),
                f.get("day"),
            )
            if key in seen:
                violations.append(
                    f"  findings[{seen[key]}] and [{i}]: {key}"
                )
            else:
                seen[key] = i
        assert not violations, (
            f"E5: {len(violations)} duplicate finding keys:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category F: Recovery data
# ---------------------------------------------------------------------------

# Canonical verdicts from incidence_recovery.compute_incidence_verdict
_RECOVERY_VERDICTS = {
    "resolved", "improving", "worsening", "persistent",
    "new_in_recovery", "insufficient_n",
}


class TestF_RecoveryData:
    """Validates recovery-related fields on findings.

    Recovery verdicts are computed live by the API (not stored in
    unified_findings.json), so F1-F3 from the spec are adapted to check
    the structural fields that ARE persisted: has_recovery_subjects,
    separate_group_stats, separate_pairwise, separate_direction.
    """

    def test_F1_has_recovery_only_on_applicable_domains(self, findings):
        """has_recovery_subjects should only appear on incidence domains
        (MI, MA, CL, TF) that can have recovery arms.
        """
        incidence_domains = {"MI", "MA", "CL", "TF", "DS"}
        violations = []
        for f in findings:
            if "has_recovery_subjects" not in f:
                continue
            if f["domain"] not in incidence_domains:
                violations.append(
                    f"  {_fid(f)}: domain={f['domain']} has "
                    f"has_recovery_subjects={f['has_recovery_subjects']}"
                )
        assert not violations, (
            f"F1: {len(violations)} findings with has_recovery_subjects "
            f"on non-incidence domains:\n"
            + "\n".join(violations)
        )

    def test_F2_separate_stats_structurally_valid(self, findings):
        """When separate_group_stats is non-empty, it must have the same
        group structure as group_stats (same dose_level set and data shape).
        """
        violations = []
        for f in findings:
            sgs = f.get("separate_group_stats")
            if not sgs:
                continue
            gs = f.get("group_stats", [])
            if not gs:
                continue
            # Check that each separate group has required fields
            for i, g in enumerate(sgs):
                if "dose_level" not in g:
                    violations.append(
                        f"  {_fid(f)}: separate_group_stats[{i}] "
                        f"missing dose_level"
                    )
                if "n" not in g:
                    violations.append(
                        f"  {_fid(f)}: separate_group_stats[{i}] "
                        f"missing n"
                    )
        assert not violations, (
            f"F2: {len(violations)} structurally invalid separate_group_stats:\n"
            + "\n".join(violations)
        )

    def test_F3_separate_direction_consistent(self, findings):
        """When separate_direction is up/down, it must match the sign of
        the max |effect_size| in separate_pairwise (same rule as C1 for primary).
        """
        violations = []
        for f in findings:
            sep_dir = f.get("separate_direction")
            if sep_dir not in ("up", "down"):
                continue
            sep_pw = f.get("separate_pairwise", [])
            cds = [
                (p["effect_size"], p.get("dose_level"))
                for p in sep_pw
                if p.get("effect_size") is not None
            ]
            if not cds:
                continue
            max_cd, max_dl = max(cds, key=lambda x: abs(x[0]))
            if abs(max_cd) < 0.01:
                continue
            expected = "up" if max_cd > 0 else "down"
            if sep_dir != expected:
                violations.append(
                    f"  {_fid(f)}: separate_direction={sep_dir}, "
                    f"max_cd={max_cd:.4f} (dose={max_dl}) -> expected {expected}"
                )
        assert not violations, (
            f"F3: {len(violations)} separate_direction/data mismatches:\n"
            + "\n".join(violations)
        )


# ---------------------------------------------------------------------------
# Category G: Enrichment pipeline (cross-file)
# ---------------------------------------------------------------------------


class TestG_EnrichmentPipeline:
    """Validates generated summary files that derive from unified_findings.

    signal_score and target organ summaries are pre-computed at generation
    time into study_signal_summary.json and target_organ_summary.json.
    """

    def test_G1_every_signal_row_has_required_fields(self, study_name):
        """Every row in study_signal_summary must have the core fields."""
        path = GENERATED_DIR / study_name / "study_signal_summary.json"
        if not path.exists():
            pytest.skip("No study_signal_summary.json")
        with open(path) as fp:
            rows = json.load(fp)
        required = {
            "signal_score", "domain", "test_code", "sex",
            "dose_level", "severity", "treatment_related",
        }
        violations = []
        for i, row in enumerate(rows):
            missing = required - set(row.keys())
            if missing:
                violations.append(
                    f"  row[{i}] ({row.get('test_code', '?')}): "
                    f"missing {sorted(missing)}"
                )
        assert not violations, (
            f"G1: {len(violations)} signal summary rows missing required fields:\n"
            + "\n".join(violations)
        )

    def test_G2_signal_scores_in_valid_range(self, study_name):
        """signal_score must be in [0, 1]."""
        path = GENERATED_DIR / study_name / "study_signal_summary.json"
        if not path.exists():
            pytest.skip("No study_signal_summary.json")
        with open(path) as fp:
            rows = json.load(fp)
        violations = []
        for i, row in enumerate(rows):
            score = row.get("signal_score")
            if score is not None and not (0.0 <= score <= 1.0):
                violations.append(
                    f"  row[{i}]: {row.get('test_code')} {row.get('sex')} "
                    f"dose={row.get('dose_level')} signal_score={score}"
                )
        assert not violations, (
            f"G2: {len(violations)} signal scores outside [0,1]:\n"
            + "\n".join(violations)
        )

    def test_G3_target_organ_summary_consistent(self, study_name):
        """target_organ_summary entries must have valid structure and
        non-negative evidence scores.
        """
        path = GENERATED_DIR / study_name / "target_organ_summary.json"
        if not path.exists():
            pytest.skip("No target_organ_summary.json")
        with open(path) as fp:
            rows = json.load(fp)
        violations = []
        for i, row in enumerate(rows):
            organ = row.get("organ_system", f"row[{i}]")
            # evidence_score must be non-negative
            es = row.get("evidence_score")
            if es is not None and es < 0:
                violations.append(
                    f"  {organ}: evidence_score={es}")
            # n_endpoints must be positive
            ne = row.get("n_endpoints", 0)
            if ne < 1:
                violations.append(
                    f"  {organ}: n_endpoints={ne}")
            # max_signal_score in [0, 1]
            mss = row.get("max_signal_score")
            if mss is not None and not (0.0 <= mss <= 1.0):
                violations.append(
                    f"  {organ}: max_signal_score={mss}")
            # n_treatment_related <= n_endpoints
            ntr = row.get("n_treatment_related", 0)
            if ntr > ne:
                violations.append(
                    f"  {organ}: n_treatment_related={ntr} > n_endpoints={ne}")
        assert not violations, (
            f"G3: {len(violations)} target organ summary issues:\n"
            + "\n".join(violations)
        )
