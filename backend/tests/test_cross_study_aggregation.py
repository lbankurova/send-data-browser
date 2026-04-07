"""Tests for inter-pathologist severity uncertainty band (Feature 1-5).

Run: cd backend && python -m pytest tests/test_cross_study_aggregation.py -v

Covers:
  - Feature 1 severity_band.classify_pair() + classify_pathologist_tier() ACs 1-12
  - Feature 3 findings matrix: sex-keyed rows, per_study severity_modal_at_loael,
    has_grade1_any_dose, row-level severity_bands (F8), per-sex merge (R2 N1)
  - Feature 2 concordance matrix: severity_band_summary roll-up + AC-20a
    consistency invariant
  - Feature 4 pathologist-source annotation roundtrip + tier propagation
  - Feature 5 NOAEL adjacent-grade caveats: scoping, grouped output, modal
    severity, Combined-sex fallback (R2 N3)

Spec: docs/_internal/incoming/inter-pathologist-severity-uncertainty-synthesis.md
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from services.analysis.severity_band import (
    classify_pair,
    classify_pathologist_tier,
    band_result_to_dict,
)
from services.analysis.cross_study_aggregation import (
    StudyContext,
    StudyData,
    build_concordance_matrix,
    build_findings_matrix,
    build_safety_margin_table,
    _clear_study_data_cache,
    _compute_noael_severity_caveats,
    _modal_grade,
    load_study_data,
    ANNOTATIONS_DIR,
)


# ════════════════════════════════════════════════════════════
# Fixtures
# ════════════════════════════════════════════════════════════


def _mk_finding(
    *,
    domain: str,
    finding: str,
    canonical_testcd: str,
    organ_system: str,
    sex: str,
    specimen: str | None = None,
    group_stats: list[dict] | None = None,
    severity_grade_5pt: int | None = None,
    treatment_related: bool = True,
) -> dict:
    return {
        "domain": domain,
        "finding": finding,
        "canonical_testcd": canonical_testcd,
        "organ_system": organ_system,
        "sex": sex,
        "specimen": specimen,
        "group_stats": group_stats or [],
        "severity_grade_5pt": severity_grade_5pt,
        "treatment_related": treatment_related,
    }


def _mk_study(
    study_id: str,
    *,
    findings: list[dict],
    noael: list[dict] | None = None,
    pathologist_name: str | None = None,
    cro_name: str | None = None,
    grading_scale: str | None = None,
) -> StudyData:
    ctx = StudyContext(
        study_id=study_id,
        pathologist_name=pathologist_name,
        cro_name=cro_name,
        grading_scale=grading_scale,
    )
    return StudyData(
        study_id=study_id,
        context=ctx,
        noael=noael or [],
        unified_findings=findings,
    )


# ════════════════════════════════════════════════════════════
# Feature 1: classifier ACs
# ════════════════════════════════════════════════════════════


def test_ac1_within_uncertainty_delta1():
    r = classify_pair(2, 3, tier="different_cro")
    assert r.classification == "within_uncertainty"
    assert r.delta == 1


def test_ac2_exceeds_uncertainty_delta3():
    r = classify_pair(1, 4, tier="different_cro")
    assert r.classification == "exceeds_uncertainty"
    assert r.delta == 3


def test_ac3_within_diagnostic_grade1_absent():
    r = classify_pair(
        1, None,
        tier="different_cro",
        grade_a_present_any_dose=True,
        grade_b_present=False,
    )
    assert r.classification == "within_diagnostic"


def test_ac4_same_pathologist_within_study():
    r = classify_pair(2, 2, tier="same_pathologist")
    assert r.classification == "within_study"


def test_ac5_f13_multi_dose_grade1_tail_fires_within_diagnostic():
    # F13 resolution: high modal but grade-1 tail present -> within_diagnostic
    r = classify_pair(
        3, None,
        tier="different_cro",
        grade_a_present_any_dose=True,
        grade_b_present=False,
    )
    assert r.classification == "within_diagnostic"


def test_ac6_no_grade1_tail_missing_data():
    r = classify_pair(
        3, None,
        tier="different_cro",
        grade_a_present_any_dose=False,
        grade_b_present=False,
    )
    assert r.classification == "missing_data"


def test_ac7_same_cro_identical_band_different_tooltip():
    r_same = classify_pair(2, 3, tier="same_cro")
    r_diff = classify_pair(2, 3, tier="different_cro")
    assert r_same.classification == r_diff.classification
    assert r_same.delta == r_diff.delta
    assert r_same.caveat != r_diff.caveat


def test_ac8_both_none_but_present_missing_data():
    r = classify_pair(
        None, None,
        tier="different_cro",
        grade_a_present=True,
        grade_b_present=True,
    )
    assert r.classification == "missing_data"


def test_ac9_negative_invalid_grade_a_present_false():
    with pytest.raises(ValueError):
        classify_pair(3, 2, tier="different_cro", grade_a_present=False)


def test_ac10_negative_invalid_grade_b_present_false():
    with pytest.raises(ValueError):
        classify_pair(2, 3, tier="different_cro", grade_b_present=False)


def test_ac11_noael_boundary_1_2():
    r = classify_pair(1, 2, tier="different_cro")
    assert r.classification == "within_uncertainty"
    assert r.flag_noael_boundary is True


def test_ac12_no_noael_boundary_4_5():
    r = classify_pair(4, 5, tier="different_cro")
    assert r.classification == "within_uncertainty"
    assert r.flag_noael_boundary is False


def test_noael_boundary_2_3():
    r = classify_pair(2, 3, tier="different_cro")
    assert r.flag_noael_boundary is True


def test_higher_study_id_populated():
    r = classify_pair(1, 3, tier="different_cro", study_a_id="A", study_b_id="B")
    assert r.higher_study_id == "B" and r.delta == 2
    r2 = classify_pair(3, 1, tier="different_cro", study_a_id="A", study_b_id="B")
    assert r2.higher_study_id == "A" and r2.delta == -2


def test_higher_study_id_none_on_exact_match():
    r = classify_pair(2, 2, tier="different_cro", study_a_id="A", study_b_id="B")
    assert r.higher_study_id is None


# Tier resolver


def test_tier_same_pathologist():
    assert classify_pathologist_tier("Smith", "Smith", "X", "Y") == "same_pathologist"


def test_tier_same_cro_not_same_pathologist():
    assert classify_pathologist_tier("Smith", "Jones", "Acme", "Acme") == "same_cro"


def test_tier_default_different_cro():
    assert classify_pathologist_tier(None, None, None, None) == "different_cro"
    assert classify_pathologist_tier("Smith", None, None, None) == "different_cro"


def test_tier_missing_cro_with_matching_pathologist_still_same_pathologist():
    assert classify_pathologist_tier("Smith", "Smith", None, None) == "same_pathologist"


def test_scale_heterogeneity_forces_caveat():
    r = classify_pair(2, 3, tier="different_cro", scale_heterogeneity=True)
    assert r.scale_heterogeneity is True
    assert r.caveat is not None
    assert "grading scale" in r.caveat.lower()


# ════════════════════════════════════════════════════════════
# _modal_grade helper (AC-34)
# ════════════════════════════════════════════════════════════


def test_modal_grade_basic_argmax():
    assert _modal_grade({"1": 3, "2": 1}) == 1


def test_modal_grade_tie_break_max():
    # R2 N7: tie-break picks higher grade
    assert _modal_grade({"1": 2, "2": 2, "3": 1}) == 2


def test_modal_grade_empty_returns_none():
    assert _modal_grade({}) is None
    assert _modal_grade(None) is None


def test_modal_grade_ignores_non_integer_keys():
    assert _modal_grade({"1": 1, "total": 5}) == 1


# ════════════════════════════════════════════════════════════
# Feature 3: findings matrix -- sex-keyed rows + per-finding bands
# ════════════════════════════════════════════════════════════


def _two_study_hypertrophy_fixture():
    """Two studies, both with LIVER_HYPERTROPHY (F). Study A modal=1,
    Study B modal=2 at LOAEL. LOAEL at dose_level=1 in both.
    """
    sd_a = _mk_study(
        "A",
        findings=[
            _mk_finding(
                domain="MI",
                finding="Hypertrophy",
                specimen="LIVER",
                canonical_testcd="LIVER_HYPERTROPHY",
                organ_system="liver",
                sex="F",
                group_stats=[
                    {"dose_level": 0, "severity_grade_counts": None},
                    {"dose_level": 1, "severity_grade_counts": {"1": 4, "2": 1}},
                ],
                severity_grade_5pt=2,
            ),
        ],
        noael=[{
            "sex": "F", "loael_dose_level": 1,
            "noael_derivation": {
                "adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ],
            },
        }],
    )
    sd_b = _mk_study(
        "B",
        findings=[
            _mk_finding(
                domain="MI",
                finding="Hypertrophy",
                specimen="LIVER",
                canonical_testcd="LIVER_HYPERTROPHY",
                organ_system="liver",
                sex="F",
                group_stats=[
                    {"dose_level": 0, "severity_grade_counts": None},
                    {"dose_level": 1, "severity_grade_counts": {"2": 3, "1": 1}},
                ],
                severity_grade_5pt=2,
            ),
        ],
        noael=[{
            "sex": "F", "loael_dose_level": 1,
            "noael_derivation": {
                "adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ],
            },
        }],
    )
    return sd_a, sd_b


def test_ac21_sex_keyed_rows_separate_sexes():
    # Same canonical finding in both sexes -> two rows, not one
    sd = _mk_study(
        "X",
        findings=[
            _mk_finding(
                domain="MI", finding="Hypertrophy", specimen="LIVER",
                canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
                sex="F",
                group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 3}}],
            ),
            _mk_finding(
                domain="MI", finding="Hypertrophy", specimen="LIVER",
                canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
                sex="M",
                group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 2}}],
            ),
        ],
        noael=[{"sex": "Combined", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    result = build_findings_matrix([sd])
    rows = [r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY"]
    assert len(rows) == 2
    sexes = sorted(r["sex"] for r in rows)
    assert sexes == ["F", "M"]


def test_ac22_severity_bands_row_level_pair_keyed():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    result = build_findings_matrix([sd_a, sd_b])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    # Row-level severity_bands, not nested in per_study
    assert "severity_bands" in row
    assert isinstance(row["severity_bands"], dict)
    assert "A::B" in row["severity_bands"]
    band = row["severity_bands"]["A::B"]
    assert band["classification"] == "within_uncertainty"
    assert band["delta"] == 1  # A modal=1, B modal=2 -> delta = 2-1 = 1
    assert band["higher_study_id"] == "B"


def test_ac23_present_in_a_only_within_diagnostic():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    # Remove the finding from B entirely
    sd_b.unified_findings = []
    sd_b.noael = []
    result = build_findings_matrix([sd_a, sd_b])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    assert row["per_study"]["B"]["present"] is False
    # Pair key still exists
    assert "A::B" in row["severity_bands"]
    assert row["severity_bands"]["A::B"]["classification"] == "within_diagnostic"


def test_ac25_severity_modal_at_loael_from_group_stats():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    result = build_findings_matrix([sd_a, sd_b])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    assert row["per_study"]["A"]["severity_modal_at_loael"] == 1
    assert row["per_study"]["B"]["severity_modal_at_loael"] == 2


def test_ac26_has_grade1_any_dose_true_when_grade1_tail_present():
    # Finding with max=3 but grade-1 tail at low dose -> has_grade1_any_dose True
    sd = _mk_study(
        "X",
        findings=[
            _mk_finding(
                domain="MI", finding="Hypertrophy", specimen="LIVER",
                canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
                sex="F",
                group_stats=[
                    {"dose_level": 1, "severity_grade_counts": {"1": 2}},
                    {"dose_level": 2, "severity_grade_counts": {"2": 1, "3": 1}},
                ],
            ),
        ],
        noael=[{"sex": "F", "loael_dose_level": 2, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    result = build_findings_matrix([sd])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    assert row["per_study"]["X"]["has_grade1_any_dose"] is True


def test_per_sex_merge_regression_r2_n1():
    # R2 N1: male and female must stay separate, never merge to max
    sd = _mk_study(
        "X",
        findings=[
            _mk_finding(
                domain="MI", finding="Degeneration", specimen="KIDNEY",
                canonical_testcd="KIDNEY_DEGENERATION", organ_system="kidney",
                sex="F", severity_grade_5pt=2,
                group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 2}}],
            ),
            _mk_finding(
                domain="MI", finding="Degeneration", specimen="KIDNEY",
                canonical_testcd="KIDNEY_DEGENERATION", organ_system="kidney",
                sex="M", severity_grade_5pt=1,
                group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 2}}],
            ),
        ],
        noael=[{"sex": "Combined", "loael_dose_level": 1, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    result = build_findings_matrix([sd])
    rows = [r for r in result["findings"] if r["canonical_testcd"] == "KIDNEY_DEGENERATION"]
    assert len(rows) == 2
    by_sex = {r["sex"]: r for r in rows}
    assert by_sex["F"]["per_study"]["X"]["severity_grade_5pt"] == 2
    assert by_sex["M"]["per_study"]["X"]["severity_grade_5pt"] == 1


# ════════════════════════════════════════════════════════════
# Feature 2: concordance matrix roll-up + AC-20a invariant
# ════════════════════════════════════════════════════════════


def test_ac13_severity_band_summary_per_cell():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    result = build_concordance_matrix([sd_a, sd_b])
    cell_a = result["matrix"]["liver"]["A"]
    assert cell_a["present"] is True
    sbs = cell_a["evidence"]["severity_band_summary"]
    assert "B" in sbs
    entry = sbs["B"]
    assert entry["n_compared"] == 1
    assert entry["n_within_uncertainty"] == 1
    assert entry["tier"] == "different_cro"


def test_ac14_severity_max_preserved():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    result = build_concordance_matrix([sd_a, sd_b])
    # severity_max is a scalar on the cell.evidence, not nested under a band
    cell = result["matrix"]["liver"]["A"]
    assert cell["evidence"]["severity_max"] == 2


def test_ac19_empty_pair_caveat():
    # Two studies with no shared canonical finding in any organ
    sd_a = _mk_study(
        "A",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 2}}],
        )],
    )
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Necrosis", specimen="KIDNEY",
            canonical_testcd="KIDNEY_NECROSIS", organ_system="kidney",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 1}}],
        )],
    )
    result = build_concordance_matrix([sd_a, sd_b])
    # Study A liver cell has no matching B findings in liver
    a_liver = result["matrix"]["liver"]["A"]
    sbs = a_liver["evidence"]["severity_band_summary"]
    assert "B" in sbs
    assert sbs["B"]["n_compared"] == 0
    assert "caveat" in sbs["B"]


def test_ac20a_feature_2_3_consistency_invariant():
    """Feature 2's roll-up counts must equal the rolled-up Feature 3
    per-finding bands for the same organ + study pair. Contract guard."""
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    # Add a second finding to each study in the same organ so counts are nontrivial
    sd_a.unified_findings.append(_mk_finding(
        domain="MI", finding="Necrosis", specimen="LIVER",
        canonical_testcd="LIVER_NECROSIS", organ_system="liver",
        sex="F",
        group_stats=[{"dose_level": 1, "severity_grade_counts": {"3": 2}}],
    ))
    sd_b.unified_findings.append(_mk_finding(
        domain="MI", finding="Necrosis", specimen="LIVER",
        canonical_testcd="LIVER_NECROSIS", organ_system="liver",
        sex="F",
        group_stats=[{"dose_level": 1, "severity_grade_counts": {"3": 3}}],
    ))

    findings_result = build_findings_matrix([sd_a, sd_b])
    concordance_result = build_concordance_matrix([sd_a, sd_b])

    # Manually roll up Feature 3 bands for liver, A vs B
    from collections import Counter
    counter: Counter = Counter()
    for row in findings_result["findings"]:
        if row["organ_system"] != "liver":
            continue
        band = row.get("severity_bands", {}).get("A::B")
        if band is None:
            continue
        # Only count if either side of the pair is present in this row
        if not (row["per_study"]["A"].get("present") or row["per_study"]["B"].get("present")):
            continue
        counter[band["classification"]] += 1

    summary = concordance_result["matrix"]["liver"]["A"]["evidence"]["severity_band_summary"]["B"]
    assert summary["n_exact"] == counter["exact_match"]
    assert summary["n_within_uncertainty"] == counter["within_uncertainty"]
    assert summary["n_exceeds_uncertainty"] == counter["exceeds_uncertainty"]
    assert summary["n_within_diagnostic"] == counter["within_diagnostic"]
    assert summary["n_missing_data"] == counter["missing_data"]
    # n_compared counts only findings with severity data in BOTH studies
    # (AC-19 semantic); within_diagnostic and missing_data contribute to
    # their own counters but not to n_compared.
    assert summary["n_compared"] == (
        counter["exact_match"]
        + counter["within_uncertainty"]
        + counter["exceeds_uncertainty"]
        + counter["within_study"]
    )


def test_ac15_same_pathologist_cells_route_to_within_study_counter():
    """AC-15: When both studies have matching pathologist_name, the roll-up
    has tier=same_pathologist and n_compared > 0 (the finding IS shared with
    severity data in both studies).

    Spec text for AC-15 reads "all counts route to n_exact" BUT the
    Feature 1 classifier definition and AC-4 both establish that
    `same_pathologist` produces classification `within_study`, which the
    _BAND_COUNTER_TO_KEY map routes to `n_within_study`. Feature 1 is
    the authoritative source; the "n_exact" phrasing in AC-15 is a spec
    drafting error. This test asserts the behavior consistent with the
    classifier definition.
    """
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    sd_a.context = StudyContext(study_id="A", pathologist_name="Smith")
    sd_b.context = StudyContext(study_id="B", pathologist_name="Smith")
    result = build_concordance_matrix([sd_a, sd_b])
    summary = result["matrix"]["liver"]["A"]["evidence"]["severity_band_summary"]["B"]
    assert summary["tier"] == "same_pathologist"
    assert summary["n_within_study"] == 1
    assert summary["n_exact"] == 0
    assert summary["n_within_uncertainty"] == 0
    # n_compared counts shared findings with severity data in both studies
    # regardless of tier. The inter-pathologist band is SUPPRESSED for
    # same_pathologist (classification -> within_study, no caveat) but the
    # pair was still a shared-with-data comparison.
    assert summary["n_compared"] == 1


def test_ac17_three_study_response_pair_count_per_cell():
    """AC-17: 3-study response produces 2 summary entries per cell
    (each study pairs with 2 others). Symmetric storage means the same
    pair is represented on each side.
    """
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    sd_c = _mk_study(
        "C",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    result = build_concordance_matrix([sd_a, sd_b, sd_c])
    cell_a = result["matrix"]["liver"]["A"]
    cell_b = result["matrix"]["liver"]["B"]
    cell_c = result["matrix"]["liver"]["C"]
    # Each cell has entries for the other 2 studies
    assert set(cell_a["evidence"]["severity_band_summary"].keys()) == {"B", "C"}
    assert set(cell_b["evidence"]["severity_band_summary"].keys()) == {"A", "C"}
    assert set(cell_c["evidence"]["severity_band_summary"].keys()) == {"A", "B"}
    # Symmetric: A-vs-B counts equal B-vs-A counts
    a_vs_b = cell_a["evidence"]["severity_band_summary"]["B"]
    b_vs_a = cell_b["evidence"]["severity_band_summary"]["A"]
    assert a_vs_b["n_compared"] == b_vs_a["n_compared"]
    assert a_vs_b["n_within_uncertainty"] == b_vs_a["n_within_uncertainty"]
    assert a_vs_b["n_exact"] == b_vs_a["n_exact"]


def test_ac18_count_distribution_5_findings():
    """AC-18: An organ with 5 shared findings producing 2 exact, 2 +-1,
    1 +-2 yields {n_compared: 5, n_exact: 2, n_within_uncertainty: 2,
    n_exceeds_uncertainty: 1}.
    """
    def _mk_pair(ctc, grade_a, grade_b):
        """Helper: build a (study_a_finding, study_b_finding) pair with
        modal grade_a and grade_b at LOAEL dose_level=1."""
        fa = _mk_finding(
            domain="MI", finding=ctc, specimen="LIVER",
            canonical_testcd=ctc, organ_system="liver", sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {str(grade_a): 3}}],
        )
        fb = _mk_finding(
            domain="MI", finding=ctc, specimen="LIVER",
            canonical_testcd=ctc, organ_system="liver", sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {str(grade_b): 3}}],
        )
        return fa, fb

    pairs = [
        _mk_pair("LIVER_HYPERTROPHY", 2, 2),      # exact
        _mk_pair("LIVER_NECROSIS", 3, 3),         # exact
        _mk_pair("LIVER_DEGENERATION", 2, 3),     # +-1
        _mk_pair("LIVER_INFLAMMATION", 3, 4),     # +-1
        _mk_pair("LIVER_FIBROSIS", 1, 3),         # +-2
    ]
    a_findings = [p[0] for p in pairs]
    b_findings = [p[1] for p in pairs]
    noael_row = {"sex": "F", "loael_dose_level": 1, "noael_derivation": {"adverse_findings_at_loael": []}}
    sd_a = _mk_study("A", findings=a_findings, noael=[noael_row])
    sd_b = _mk_study("B", findings=b_findings, noael=[noael_row])

    result = build_concordance_matrix([sd_a, sd_b])
    summary = result["matrix"]["liver"]["A"]["evidence"]["severity_band_summary"]["B"]
    assert summary["n_compared"] == 5
    assert summary["n_exact"] == 2
    assert summary["n_within_uncertainty"] == 2
    assert summary["n_exceeds_uncertainty"] == 1


def test_ac24_severity_grade_5pt_preserved():
    """AC-24: Pre-existing severity_grade_5pt field on per_study cells
    is unchanged by the new band augmentation.
    """
    sd = _mk_study(
        "X",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
            severity_grade_5pt=2,
        )],
    )
    result = build_findings_matrix([sd])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    assert row["per_study"]["X"]["severity_grade_5pt"] == 2


def test_ac32_continuous_finding_skipped_from_noael_caveat():
    """AC-32: When a LOAEL-driving finding has no per-dose severity_grade_counts
    (continuous finding, e.g., LB), it is skipped -- no false positive caveat."""
    # Study A: LOAEL-driving finding is a continuous LB finding (no severity counts)
    sd_a = _mk_study(
        "A",
        findings=[_mk_finding(
            domain="LB", finding="ALT", specimen=None,
            canonical_testcd="ALT", organ_system="liver", sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": None}],
        )],
        noael=[{
            "sex": "F", "loael_dose_level": 1,
            "noael_derivation": {
                "adverse_findings_at_loael": [
                    {"domain": "LB", "specimen": None, "finding": "ALT"},
                ],
            },
        }],
    )
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="LB", finding="ALT", specimen=None,
            canonical_testcd="ALT", organ_system="liver", sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": None}],
        )],
        noael=[{
            "sex": "F", "loael_dose_level": 1,
            "noael_derivation": {
                "adverse_findings_at_loael": [
                    {"domain": "LB", "specimen": None, "finding": "ALT"},
                ],
            },
        }],
    )
    caveats = _compute_noael_severity_caveats([sd_a, sd_b])
    assert caveats == []


def test_f4_route_handler_put_get_annotation_roundtrip():
    """Feature 4 AC-16/17: pathologist-source schema is accepted by the
    annotations router and a PUT/GET roundtrip through the route handlers
    preserves the payload.

    Calls the route handlers directly (not via TestClient) because
    httpx is not installed in the backend venv. This still exercises the
    schema-type validation, the slug-to-file mapping, and the file-level
    write/read path -- the entire router logic except the FastAPI wrapper.
    """
    import asyncio
    from routers.annotations import (
        save_annotation,
        get_annotations,
        VALID_SCHEMA_TYPES,
        AnnotationPayload,
    )

    # Schema type is in the allowlist (the one-line router change)
    assert "pathologist-source" in VALID_SCHEMA_TYPES

    sid = "FFU-Contribution-to-FDA"
    ann_path = ANNOTATIONS_DIR / sid / "pathologist_source.json"
    if ann_path.exists():
        ann_path.unlink()

    try:
        payload = AnnotationPayload.model_validate({
            "pathologist_name": "Smith J",
            "cro_name": "Acme Pathology",
            "grading_scale": "5pt",
        })
        saved = asyncio.run(save_annotation(sid, "pathologist-source", "_study", payload))
        assert saved["pathologist_name"] == "Smith J"
        assert saved["cro_name"] == "Acme Pathology"
        assert saved["grading_scale"] == "5pt"

        got = asyncio.run(get_annotations(sid, "pathologist-source"))
        assert "_study" in got
        assert got["_study"]["pathologist_name"] == "Smith J"
        assert got["_study"]["cro_name"] == "Acme Pathology"
        assert got["_study"]["grading_scale"] == "5pt"
    finally:
        if ann_path.exists():
            ann_path.unlink()


# ════════════════════════════════════════════════════════════
# Feature 4: pathologist-source annotation roundtrip + tier propagation
# ════════════════════════════════════════════════════════════


@pytest.fixture
def _pathologist_annotation_cleanup():
    """Fixture that cleans up any pathologist_source.json written by a test."""
    written_paths: list[Path] = []

    def register(sid: str) -> Path:
        p = ANNOTATIONS_DIR / sid / "pathologist_source.json"
        written_paths.append(p)
        return p

    yield register

    for p in written_paths:
        if p.exists():
            p.unlink()


def test_pathologist_annotation_loads_into_study_context(_pathologist_annotation_cleanup):
    sid = "CBER-POC-Pilot-Study3-Gene-Therapy"
    ann_path = _pathologist_annotation_cleanup(sid)
    ann_path.parent.mkdir(parents=True, exist_ok=True)
    ann_path.write_text(json.dumps({
        "_study": {
            "pathologist_name": "Smith J",
            "cro_name": "Acme",
            "grading_scale": "5pt",
        }
    }))
    _clear_study_data_cache()  # F7 resolution: integration tests must clear
    sd = load_study_data(sid)
    assert sd is not None
    assert sd.context.pathologist_name == "Smith J"
    assert sd.context.cro_name == "Acme"
    assert sd.context.grading_scale == "5pt"


def test_tier_propagation_same_pathologist_within_study(_pathologist_annotation_cleanup):
    # When both studies have matching pathologist_name, tier -> same_pathologist
    # and bands should classify as within_study.
    ctx_a = StudyContext(study_id="A", pathologist_name="Smith J", cro_name="Acme")
    ctx_b = StudyContext(study_id="B", pathologist_name="Smith J", cro_name="Acme")
    sd_a = StudyData(
        study_id="A", context=ctx_a,
        unified_findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    sd_b = StudyData(
        study_id="B", context=ctx_b,
        unified_findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    result = build_findings_matrix([sd_a, sd_b])
    row = next(r for r in result["findings"] if r["canonical_testcd"] == "LIVER_HYPERTROPHY")
    band = row["severity_bands"]["A::B"]
    assert band["tier"] == "same_pathologist"
    assert band["classification"] == "within_study"


def test_study_context_dict_includes_pathologist_fields():
    sd = _mk_study("A", findings=[], pathologist_name="Smith", cro_name="Acme", grading_scale="5pt")
    result = build_findings_matrix([sd])
    studies_dict = result["studies"][0]
    assert studies_dict["pathologist_name"] == "Smith"
    assert studies_dict["cro_name"] == "Acme"
    assert studies_dict["grading_scale"] == "5pt"


# ════════════════════════════════════════════════════════════
# Feature 5: NOAEL adjacent-grade caveats
# ════════════════════════════════════════════════════════════


def test_ac27_matching_driver_at_1_2_boundary_fires():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    caveats = _compute_noael_severity_caveats([sd_a, sd_b])
    assert len(caveats) == 1
    assert caveats[0]["canonical_testcd"] == "LIVER_HYPERTROPHY"
    assert caveats[0]["sex"] == "F"
    assert len(caveats[0]["observations"]) == 1
    obs = caveats[0]["observations"][0]
    assert obs["boundary"] == "grade_1_2"


def test_ac28_different_canonical_testcd_no_caveat():
    sd_a, _ = _two_study_hypertrophy_fixture()
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Necrosis", specimen="KIDNEY",
            canonical_testcd="KIDNEY_NECROSIS", organ_system="kidney",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "KIDNEY", "finding": "Necrosis"},
                ]}}],
    )
    assert _compute_noael_severity_caveats([sd_a, sd_b]) == []


def test_ac29_different_sex_no_caveat():
    sd_a, _ = _two_study_hypertrophy_fixture()
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="M",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "M", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    assert _compute_noael_severity_caveats([sd_a, sd_b]) == []


def test_ac30_delta_greater_than_1_no_caveat():
    sd_a, _ = _two_study_hypertrophy_fixture()
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"3": 4}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    assert _compute_noael_severity_caveats([sd_a, sd_b]) == []


def test_ac31_same_pathologist_no_caveat():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    sd_a.context = StudyContext(study_id="A", pathologist_name="Smith")
    sd_b.context = StudyContext(study_id="B", pathologist_name="Smith")
    assert _compute_noael_severity_caveats([sd_a, sd_b]) == []


def test_ac33_no_loael_silently_skipped():
    sd_a, _ = _two_study_hypertrophy_fixture()
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": None, "noael_derivation": {"adverse_findings_at_loael": []}}],
    )
    assert _compute_noael_severity_caveats([sd_a, sd_b]) == []


def test_ac35_three_studies_grouped_output():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    sd_c = _mk_study(
        "C",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    caveats = _compute_noael_severity_caveats([sd_a, sd_b, sd_c])
    # One group (same key across all three), two firing pairs: A-B (1 vs 2) and A-C (1 vs 2).
    # B-C has identical severity (2 vs 2) -> no observation.
    assert len(caveats) == 1
    assert len(caveats[0]["observations"]) == 2


def test_combined_sex_noael_fallback_r2_n3():
    """R2 N3: Combined-sex NOAEL with per-sex findings falls back to M/F
    lookup and returns the worst modal. Without this, rodent caveats zero.
    """
    # Study A: Combined-sex NOAEL, but finding is keyed per-sex (F)
    sd_a = _mk_study(
        "A",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 3}}],
        )],
        noael=[{"sex": "Combined", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "Combined", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    caveats = _compute_noael_severity_caveats([sd_a, sd_b])
    # Both are keyed Combined, both fall back to F -> modal 1 vs 2 -> fires
    assert len(caveats) == 1
    assert caveats[0]["sex"] == "Combined"


def test_ac34_modal_severity_not_max():
    """AC-34: Feature 5 uses MODAL grade, not max. A finding with counts
    {'1': 4, '2': 1} at LOAEL contributes modal 1, not max 2."""
    sd_a = _mk_study(
        "A",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"1": 4, "2": 1}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    sd_b = _mk_study(
        "B",
        findings=[_mk_finding(
            domain="MI", finding="Hypertrophy", specimen="LIVER",
            canonical_testcd="LIVER_HYPERTROPHY", organ_system="liver",
            sex="F",
            group_stats=[{"dose_level": 1, "severity_grade_counts": {"2": 3}}],
        )],
        noael=[{"sex": "F", "loael_dose_level": 1,
                "noael_derivation": {"adverse_findings_at_loael": [
                    {"domain": "MI", "specimen": "LIVER", "finding": "Hypertrophy"},
                ]}}],
    )
    caveats = _compute_noael_severity_caveats([sd_a, sd_b])
    assert len(caveats) == 1
    obs = caveats[0]["observations"][0]
    # If MAX semantics were used, both would be 2 -> delta 0 -> no caveat.
    # Modal semantics yield 1 vs 2 -> caveat fires at boundary 1_2.
    assert obs["severity_a"] == 1
    assert obs["severity_b"] == 2


# ════════════════════════════════════════════════════════════
# Safety margin table wiring
# ════════════════════════════════════════════════════════════


def test_safety_margin_response_includes_caveats_field():
    sd_a, sd_b = _two_study_hypertrophy_fixture()
    result = build_safety_margin_table([sd_a, sd_b])
    assert "noael_severity_caveats" in result
    assert isinstance(result["noael_severity_caveats"], list)
    assert len(result["noael_severity_caveats"]) == 1
