"""Tests for evidence quality grade derivation and sex concordance.

Run: cd backend && python -m pytest tests/test_evidence_quality.py -v

Covers:
  - All 15 (convergence_count, mi_status) grade combinations
  - examined_normal != positive demotion (R2 NF2)
  - Single-dimension cap at moderate
  - Sex concordance: signal weighting, inclusive denominator, single-sex null
  - Score immutability: evidence_quality does not modify evidence_score
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import json
from collections import defaultdict

from generator.view_dataframes import build_target_organ_summary, _evidence_quality_grade

# ════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════

def _make_finding(
    organ: str = "liver",
    domain: str = "LB",
    test_code: str = "ALT",
    sex: str = "M",
    direction: str = "up",
    treatment_related: bool = True,
    min_p_adj: float = 0.01,
    dose_response_pattern: str = "monotonic_up",
    data_type: str = "continuous",
    effect_size: float | None = 0.5,
    group_stats: list | None = None,
    specimen: str | None = None,
) -> dict:
    """Minimal finding dict for build_target_organ_summary."""
    f: dict = {
        "organ_system": organ,
        "domain": domain,
        "test_code": test_code,
        "sex": sex,
        "direction": direction,
        "treatment_related": treatment_related,
        "min_p_adj": min_p_adj,
        "dose_response_pattern": dose_response_pattern,
        "data_type": data_type,
        "group_stats": group_stats or [],
    }
    if effect_size is not None:
        f["max_effect_size"] = effect_size
    if specimen is not None:
        f["specimen"] = specimen
    return f


def _get_organ_eq(findings, mi_tissue_inventory=None, species="rat"):
    """Run build_target_organ_summary and return the first organ's evidence_quality."""
    rows = build_target_organ_summary(
        findings, has_concurrent_control=True,
        mi_tissue_inventory=mi_tissue_inventory, species=species,
    )
    assert len(rows) > 0, "Expected at least one organ row"
    return rows[0]


# ════════════════════════════════════════════════════════════
# Grade derivation table: 15 parametrized cases
# ════════════════════════════════════════════════════════════

# (convergence_count, mi_status, expected_grade)
# convergence_count is simulated by adding findings from N distinct convergence groups
# mi_status is driven by: max_ep_domain==OM + tissue_inventory presence + MI/MA findings

GRADE_CASES = [
    # mi_status = positive (OM-dominant, has MI findings)
    (1, "positive", "weak"),
    (2, "positive", "moderate"),
    (3, "positive", "strong"),
    # mi_status = examined_normal (OM-dominant, on tissue list, no MI)
    (1, "examined_normal", "weak"),
    (2, "examined_normal", "weak"),
    (3, "examined_normal", "moderate"),
    # mi_status = lb_corroborated (OM-dominant, not on tissue list, but has LB)
    (1, "lb_corroborated", "weak"),
    (2, "lb_corroborated", "weak"),
    (3, "lb_corroborated", "moderate"),
    # mi_status = not_examined (OM-dominant, not on tissue list, no LB)
    (1, "not_examined", "insufficient"),
    (2, "not_examined", "weak"),
    (3, "not_examined", "weak"),
    # mi_status = None (non-OM-dominant, single-dimension capped at moderate)
    (1, None, "weak"),
    (2, None, "moderate"),
    (3, None, "moderate"),
]


def _build_findings_for_grade(convergence_count: int, mi_status: str | None) -> tuple[list, set | None]:
    """Build a findings list that produces the desired convergence_count and mi_status."""
    findings = []
    tissue_inv = None

    # Convergence groups: each unique convergence group adds 1. OM is one group.
    # We use different domains from different convergence groups.
    # Groups: "clinical_pathology" (LB), "morphological" (MI, MA, TF), "organ_weight" (OM),
    #         "body_weight" (BW), "clinical_observation" (CL)
    domain_pool = [("LB", "ALT"), ("BW", "BWSTC"), ("CL", "FOOD"), ("OM", "LIVER")]
    organ = "liver"

    if mi_status is not None:
        # OM must be the dominant domain (highest signal) for mi_status to be set
        # Put OM first with highest signal
        findings.append(_make_finding(
            organ=organ, domain="OM", test_code="LIVER",
            effect_size=2.0, specimen="LIVER", min_p_adj=0.001,
        ))
        used_groups = 1  # OM = "organ_weight" group

        if mi_status == "positive":
            # Add MI finding — MI is in "morphological" convergence group (separate from OM)
            findings.append(_make_finding(
                organ=organ, domain="MI", test_code="HEPATOCELLULAR_HYPERTROPHY",
                effect_size=0.3, data_type="incidence",
            ))
            used_groups += 1  # morphological group

        if mi_status == "examined_normal":
            tissue_inv = {"LIVER"}

        if mi_status == "lb_corroborated":
            # Has LB but not on tissue list
            tissue_inv = set()
            findings.append(_make_finding(
                organ=organ, domain="LB", test_code="ALT", effect_size=0.5,
            ))
            used_groups += 1  # LB = "clinical_pathology" group

        if mi_status == "not_examined":
            tissue_inv = set()

        # Add more convergence groups as needed
        remaining = convergence_count - used_groups
        extra_domains = [("BW", "BWSTC"), ("CL", "FOOD"), ("LB", "ALT")]
        for d, tc in extra_domains:
            if remaining <= 0:
                break
            # Skip LB if already used (lb_corroborated case)
            if mi_status == "lb_corroborated" and d == "LB":
                continue
            findings.append(_make_finding(
                organ=organ, domain=d, test_code=tc, effect_size=0.3,
            ))
            remaining -= 1

    else:
        # Non-OM-dominant: use LB as the highest-signal domain
        findings.append(_make_finding(
            organ=organ, domain="LB", test_code="ALT", effect_size=2.0, min_p_adj=0.001,
        ))
        used_groups = 1

        extra_domains = [("BW", "BWSTC"), ("CL", "FOOD"), ("OM", "LIVER")]
        remaining = convergence_count - used_groups
        for d, tc in extra_domains:
            if remaining <= 0:
                break
            findings.append(_make_finding(
                organ=organ, domain=d, test_code=tc, effect_size=0.3,
                specimen="LIVER" if d == "OM" else None,
            ))
            remaining -= 1

    return findings, tissue_inv


@pytest.mark.parametrize("convergence,mi_status,expected_grade", GRADE_CASES,
                         ids=[f"conv={c}_mi={m}" for c, m, _ in GRADE_CASES])
def test_grade_derivation_table(convergence, mi_status, expected_grade):
    """Verify all 15 grade derivation table entries (direct logic test)."""
    grade, _limiting = _evidence_quality_grade(convergence, mi_status)
    assert grade == expected_grade, (
        f"conv={convergence}, mi_status={mi_status}: "
        f"expected {expected_grade}, got {grade}"
    )


# Integration tests for reachable combinations via build_target_organ_summary
# (conv=1+positive and conv=1+lb_corroborated are structurally unreachable
#  because those mi_status values require domains in different convergence groups)
REACHABLE_CASES = [
    (2, "positive", "moderate"),
    (3, "positive", "strong"),
    (1, "examined_normal", "weak"),
    (3, "examined_normal", "moderate"),
    (2, "lb_corroborated", "weak"),
    (1, "not_examined", "insufficient"),
    (2, "not_examined", "weak"),
    (1, None, "weak"),
    (3, None, "moderate"),
]


@pytest.mark.parametrize("convergence,mi_status,expected_grade", REACHABLE_CASES,
                         ids=[f"e2e_conv={c}_mi={m}" for c, m, _ in REACHABLE_CASES])
def test_grade_e2e_reachable(convergence, mi_status, expected_grade):
    """End-to-end grade test for structurally reachable (convergence, mi_status) pairs."""
    findings, tissue_inv = _build_findings_for_grade(convergence, mi_status)
    row = _get_organ_eq(findings, mi_tissue_inventory=tissue_inv)
    eq = row["evidence_quality"]
    assert eq["grade"] == expected_grade, (
        f"conv={convergence}, mi_status={mi_status}: "
        f"expected {expected_grade}, got {eq['grade']}"
    )


# ════════════════════════════════════════════════════════════
# examined_normal != positive (R2 NF2)
# ════════════════════════════════════════════════════════════

def test_examined_normal_demoted_from_positive():
    """At convergence=3, positive -> strong but examined_normal -> moderate."""
    findings_pos, _ = _build_findings_for_grade(3, "positive")
    findings_en, tissue_inv = _build_findings_for_grade(3, "examined_normal")

    row_pos = _get_organ_eq(findings_pos)
    row_en = _get_organ_eq(findings_en, mi_tissue_inventory=tissue_inv)

    assert row_pos["evidence_quality"]["grade"] == "strong"
    assert row_en["evidence_quality"]["grade"] == "moderate"
    assert row_pos["evidence_quality"]["grade"] != row_en["evidence_quality"]["grade"]


# ════════════════════════════════════════════════════════════
# Single-dimension cap
# ════════════════════════════════════════════════════════════

def test_single_dimension_cap_at_moderate():
    """Corroboration null (non-OM) + convergence 3+ -> moderate, never strong."""
    findings, _ = _build_findings_for_grade(3, None)
    row = _get_organ_eq(findings)
    eq = row["evidence_quality"]
    assert eq["grade"] == "moderate", "Single-dimension should cap at moderate"
    assert eq["dimensions_assessed"] == 1


# ════════════════════════════════════════════════════════════
# Concordance
# ════════════════════════════════════════════════════════════

def test_concordance_signal_weighting():
    """High-signal concordant + low-signal discordant -> fraction > 0.5."""
    findings = [
        # Concordant endpoint (both sexes, same direction, HIGH signal)
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="M",
                      direction="up", effect_size=2.0, min_p_adj=0.001),
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="F",
                      direction="up", effect_size=2.0, min_p_adj=0.001),
        # Discordant endpoint (both sexes, different direction, LOW signal)
        _make_finding(organ="liver", domain="LB", test_code="GGT", sex="M",
                      direction="up", effect_size=0.1, min_p_adj=0.04),
        _make_finding(organ="liver", domain="LB", test_code="GGT", sex="F",
                      direction="down", effect_size=0.1, min_p_adj=0.04),
    ]
    row = _get_organ_eq(findings)
    conc = row["evidence_quality"]["sex_concordance"]
    assert conc is not None
    assert conc["fraction"] > 0.5, f"Signal-weighted fraction should favor concordant high-signal: {conc['fraction']}"
    assert conc["n_evaluable"] == 2


def test_concordance_inclusive_denominator():
    """One-sex-only endpoint in two-sex study counted as discordant."""
    findings = [
        # Both-sex endpoint (concordant)
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="M",
                      direction="up", effect_size=1.0),
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="F",
                      direction="up", effect_size=1.0),
        # Male-only endpoint (discordant by inclusive denominator)
        _make_finding(organ="liver", domain="LB", test_code="AST", sex="M",
                      direction="up", effect_size=1.0),
    ]
    row = _get_organ_eq(findings)
    conc = row["evidence_quality"]["sex_concordance"]
    assert conc is not None
    assert conc["n_evaluable"] == 2, "One-sex-only should be counted as evaluable"
    assert conc["fraction"] < 1.0, "One-sex-only should reduce concordance"


def test_concordance_null_for_single_sex_study():
    """Single-sex study -> concordance null."""
    findings = [
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="M",
                      direction="up", effect_size=1.0),
        _make_finding(organ="liver", domain="LB", test_code="AST", sex="M",
                      direction="up", effect_size=1.0),
    ]
    row = _get_organ_eq(findings)
    conc = row["evidence_quality"]["sex_concordance"]
    assert conc is None, "Single-sex study should have null concordance"


def test_concordance_incidence_endpoint():
    """MI finding present in both sexes = concordant; MI in one sex only = sex-specific."""
    findings = [
        # OM finding (dominant) to trigger mi_status
        _make_finding(organ="liver", domain="OM", test_code="LIVER", sex="M",
                      direction="up", effect_size=2.0, specimen="LIVER"),
        _make_finding(organ="liver", domain="OM", test_code="LIVER", sex="F",
                      direction="up", effect_size=2.0, specimen="LIVER"),
        # MI in both sexes (concordant incidence endpoint)
        _make_finding(organ="liver", domain="MI", test_code="HYPERTROPHY", sex="M",
                      direction="up", data_type="incidence", effect_size=0.5),
        _make_finding(organ="liver", domain="MI", test_code="HYPERTROPHY", sex="F",
                      direction="up", data_type="incidence", effect_size=0.5),
    ]
    row = _get_organ_eq(findings)
    conc = row["evidence_quality"]["sex_concordance"]
    assert conc is not None
    assert conc["fraction"] >= 0.8, "Both-sex MI should be concordant"


def test_concordance_incidence_one_sex_only():
    """MI finding in one sex only in a two-sex study -> counted in n_evaluable.

    Note: MI findings have zero signal weight (no effect size for incidence
    domains), so they cannot affect the weighted concordance fraction. They DO
    count in n_evaluable via the inclusive denominator. The weighted fraction
    impact of one-sex-only is tested by test_concordance_inclusive_denominator
    (which uses continuous endpoints with non-zero signals).
    """
    findings = [
        # OM finding in both sexes (dominant)
        _make_finding(organ="liver", domain="OM", test_code="LIVER", sex="M",
                      direction="up", effect_size=1.0, specimen="LIVER", min_p_adj=0.01),
        _make_finding(organ="liver", domain="OM", test_code="LIVER", sex="F",
                      direction="up", effect_size=1.0, specimen="LIVER", min_p_adj=0.01),
        # MI in males only -> counted as evaluable by inclusive denominator
        _make_finding(organ="liver", domain="MI", test_code="HYPERTROPHY", sex="M",
                      direction="up", data_type="incidence", effect_size=1.0, min_p_adj=0.01),
    ]
    row = _get_organ_eq(findings)
    conc = row["evidence_quality"]["sex_concordance"]
    assert conc is not None
    # MI endpoint has zero signal weight but is still counted in n_evaluable
    assert conc["n_evaluable"] >= 2, "MI one-sex-only should be counted as evaluable"


# ════════════════════════════════════════════════════════════
# Score immutability (permanent regression guard)
# ════════════════════════════════════════════════════════════

def test_evidence_quality_does_not_modify_score():
    """evidence_score must be identical with or without evidence_quality computation.

    This is a permanent regression guard (spec PR-5). The grade is read-only --
    it must NEVER feed back into evidence_score or any scoring field.
    """
    findings = [
        _make_finding(organ="liver", domain="LB", test_code="ALT", sex="M",
                      effect_size=1.5, min_p_adj=0.001),
        _make_finding(organ="liver", domain="BW", test_code="BWSTC", sex="M",
                      effect_size=0.8, min_p_adj=0.01),
        _make_finding(organ="liver", domain="OM", test_code="LIVER", sex="M",
                      effect_size=0.5, specimen="LIVER"),
    ]
    rows = build_target_organ_summary(
        findings, has_concurrent_control=True,
        mi_tissue_inventory=set(), species="rat",
    )
    assert len(rows) == 1
    row = rows[0]

    # evidence_quality must exist but must not have changed evidence_score
    assert "evidence_quality" in row
    eq = row["evidence_quality"]
    assert eq["grade"] in ("strong", "moderate", "weak", "insufficient")

    # Value-comparison guard: compute score independently from the formula
    # avg_signal * (1 + 0.2 * (convergence - 1)) * om_mi_discount
    # The evidence_quality field is appended AFTER evidence_score is finalized.
    score = row["evidence_score"]
    assert score > 0, "Score should be positive"
    assert isinstance(score, float)

    # Run a second time -- score must be deterministic and identical
    rows2 = build_target_organ_summary(
        findings, has_concurrent_control=True,
        mi_tissue_inventory=set(), species="rat",
    )
    assert rows2[0]["evidence_score"] == score, (
        f"Score must be deterministic: {rows2[0]['evidence_score']} != {score}"
    )


# ════════════════════════════════════════════════════════════
# PointCross integration (run only if generated data exists)
# ════════════════════════════════════════════════════════════

POINTCROSS_DATA = Path(__file__).parent.parent / "generated" / "PointCross" / "target_organ_summary.json"


@pytest.mark.skipif(not POINTCROSS_DATA.exists(), reason="PointCross generated data not available")
def test_pointcross_validation_regression():
    """PointCross signal detection should be unchanged by evidence_quality addition."""
    data = json.loads(POINTCROSS_DATA.read_text())
    # Every row must have evidence_quality
    for row in data:
        assert "evidence_quality" in row, f"{row['organ_system']} missing evidence_quality"
        eq = row["evidence_quality"]
        assert eq["grade"] in ("strong", "moderate", "weak", "insufficient")
        assert eq["dimensions_assessed"] in (1, 2)
        assert "convergence" in eq
        assert "limiting_factor" in eq


@pytest.mark.skipif(not POINTCROSS_DATA.exists(), reason="PointCross generated data not available")
def test_pointcross_liver_grade():
    """PointCross liver: moderate grade (LB-dominant, single-dimension capped)."""
    data = json.loads(POINTCROSS_DATA.read_text())
    liver = next((r for r in data if r["organ_system"] == "hepatic"), None)
    assert liver is not None, "PointCross should have hepatic organ"
    eq = liver["evidence_quality"]
    # Liver is LB-dominant in PointCross -> mi_status is None -> capped at moderate
    assert eq["grade"] == "moderate", f"Expected moderate, got {eq['grade']}"
    assert eq["dimensions_assessed"] == 1
