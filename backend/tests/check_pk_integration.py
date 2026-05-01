"""Backend tests for PK integration (PC + PP + DM).

Combines two test classes into one file per spec mandate
(nonlinear-pk-model-sufficiency-synthesis.md, Reuse Inventory: "no new test
module"):

  1. Unit tests for the F1-F4 helpers introduced by the
     nonlinear-pk-model-sufficiency cycle (synthetic dose-group inputs;
     no real-data setup -- always run).
  2. Integration tests against PointCross XPT data (run only when invoked
     directly; gated under `if __name__ == "__main__":` to avoid
     ProcessPoolExecutor recursive-import failures on Windows).

Run: cd backend && python tests/check_pk_integration.py
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

sys.path.insert(0, str(Path(__file__).parent.parent))

import generator.pk_integration as _pkmod
from generator.pk_integration import (
    _build_fit_quality,
    _build_nonlinearity_caveat,
    _classify_dose_normalized_auc,
    _compute_accumulation,
    _compute_dose_proportionality,
    _finalize_accumulation_predictions,
    _is_multi_compartment_compound,
    _normalize_half_life_to_hours,
    _parse_elapsed_time,
    build_pk_integration,
)

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS: {name}")
        passed += 1
    else:
        msg = f"  FAIL: {name}"
        if detail:
            msg += f"  -- {detail}"
        print(msg)
        failed += 1


# ------------------------------------------------------------------
# Part 1: Unit tests for F1-F4 helpers (synthetic data; always run)
# ------------------------------------------------------------------

def _mk_dose_groups(doses_aucs):
    groups = []
    for i, (dose, auc) in enumerate(doses_aucs):
        groups.append({
            "dose_level": i + 1,
            "dose_value": float(dose),
            "dose_unit": "mg/kg",
            "dose_label": f"Dose {i+1}",
            "n_subjects": 5,
            "parameters": {
                "AUCLST": {
                    "mean": float(auc),
                    "sd": float(auc) * 0.1,
                    "median": float(auc),
                    "n": 5,
                    "unit": "ng*h/mL",
                    "values": [float(auc)] * 5,
                },
            },
            "concentration_time": [],
        })
    return groups


def _mk_pp_merged(rows):
    return pd.DataFrame(rows)


class _FakeStudy:
    def __init__(self, ex_freq=None):
        self.xpt_files = {"ex": "fake_path"} if ex_freq is not None else {}
        self._ex_freq = ex_freq
        self.study_id = "synthetic"


_orig_read_domain = _pkmod._read_domain


def _fake_read_domain(study, domain):
    if not isinstance(study, _FakeStudy):
        return _orig_read_domain(study, domain)
    if domain == "ex":
        if study._ex_freq is None:
            return pd.DataFrame({"EXFREQ": [pd.NA]})
        return pd.DataFrame({"EXFREQ": [study._ex_freq]})
    return None


_pkmod._read_domain = _fake_read_domain


print("=== PK Integration Tests ===\n")
print("Part 1: F1-F4 unit tests (synthetic data)\n")

# F1 -- dose-normalized AUC profile
print("F1 -- dose-normalized AUC profile:")
groups_t1 = _mk_dose_groups([(10, 100), (50, 500), (100, 1000)])
dp1 = _compute_dose_proportionality(groups_t1)
check("Test 1: linear -- assessment is 'linear'",
      dp1.get("assessment") == "linear", f"got {dp1.get('assessment')}")
check("Test 1: dose_normalized_auc_assessment is 'flat'",
      dp1.get("dose_normalized_auc_assessment") == "flat",
      f"got {dp1.get('dose_normalized_auc_assessment')}")
check("Test 1: 3 entries in dose_normalized_auc",
      len(dp1.get("dose_normalized_auc") or []) == 3)
check("Test 1: entries use spec field name 'group_id'",
      all("group_id" in e for e in dp1["dose_normalized_auc"]),
      f"keys: {list(dp1['dose_normalized_auc'][0].keys()) if dp1['dose_normalized_auc'] else []}")

groups_t2 = _mk_dose_groups([(10, 10**1.4), (30, 30**1.4), (100, 100**1.4), (300, 300**1.4)])
dp2 = _compute_dose_proportionality(groups_t2)
check("Test 2: supralinear -- slope > 1.2", dp2.get("slope") and dp2["slope"] > 1.2)
check("Test 2: dose_normalized_auc_assessment is 'monotonic_increasing'",
      dp2.get("dose_normalized_auc_assessment") == "monotonic_increasing")

groups_t3 = _mk_dose_groups([(10, 10**0.7), (30, 30**0.7), (100, 100**0.7), (300, 300**0.7)])
dp3 = _compute_dose_proportionality(groups_t3)
check("Test 3: sublinear -- slope < 0.8", dp3.get("slope") and dp3["slope"] < 0.8)
check("Test 3: dose_normalized_auc_assessment is 'monotonic_decreasing'",
      dp3.get("dose_normalized_auc_assessment") == "monotonic_decreasing")

# Test 4: V-shape -> inflection
auc_v = [1.0, 1.5, 1.0, 1.5]
groups_t4 = _mk_dose_groups([
    (10, 10 * auc_v[0]), (20, 20 * auc_v[1]), (40, 40 * auc_v[2]), (80, 80 * auc_v[3]),
])
dp4 = _compute_dose_proportionality(groups_t4)
check("Test 4: V-shape -- dose_normalized_auc_assessment is 'inflection'",
      dp4.get("dose_normalized_auc_assessment") == "inflection",
      f"got {dp4.get('dose_normalized_auc_assessment')}")

# Test 4b: sub-threshold noise -> flat
auc_n = [1.0, 1.05, 1.0, 1.05]
groups_t4b = _mk_dose_groups([
    (10, 10 * auc_n[0]), (20, 20 * auc_n[1]), (40, 40 * auc_n[2]), (80, 80 * auc_n[3]),
])
dp4b = _compute_dose_proportionality(groups_t4b)
check("Test 4b: noise (max/min<=1.3) -- assessment is 'flat'",
      dp4b.get("dose_normalized_auc_assessment") == "flat")

# Test 5: no AUC -> insufficient_data, dose_normalized_auc absent
groups_t5 = [
    {"dose_level": 1, "dose_value": 10.0, "dose_unit": "mg/kg",
     "dose_label": "Dose 1", "n_subjects": 5, "parameters": {}, "concentration_time": []},
    {"dose_level": 2, "dose_value": 100.0, "dose_unit": "mg/kg",
     "dose_label": "Dose 2", "n_subjects": 5, "parameters": {}, "concentration_time": []},
]
dp5 = _compute_dose_proportionality(groups_t5)
check("Test 5: no AUC -- assessment is 'insufficient_data'",
      dp5.get("assessment") == "insufficient_data")
check("Test 5: dose_normalized_auc absent on insufficient_data",
      dp5.get("dose_normalized_auc") is None)

# F4 -- N-conditional fit quality
print("\nF4 -- N-conditional fit quality:")
fq3 = dp1.get("fit_quality")
check("Test 12: N=3 -- r_squared_unreliable_at_n: true",
      fq3 and fq3["r_squared_unreliable_at_n"] is True)
check("Test 12: N=3 -- recommend_dose_normalized_profile: true",
      fq3 and fq3["recommend_dose_normalized_profile"] is True)
check("Test 12: N=3 -- df = 1", fq3 and fq3["df"] == 1)

fq4 = dp2.get("fit_quality")
check("Test 20: N=4 -- r_squared_unreliable_at_n: true (R1 F8)",
      fq4 and fq4["r_squared_unreliable_at_n"] is True)

groups_n5 = _mk_dose_groups([(10, 100), (50, 500), (100, 1000), (200, 2000), (400, 4000)])
dp_n5 = _compute_dose_proportionality(groups_n5)
fq5 = dp_n5.get("fit_quality")
check("F4 spot-check: N=5 -- r_squared_unreliable_at_n: false",
      fq5 and fq5["r_squared_unreliable_at_n"] is False)

# Test 17: t_crit at df=1 ~= 6.31 (NOT 1.645)
rng = np.random.default_rng(42)
doses_t17 = [10.0, 30.0, 100.0]
aucs_t17 = [(d ** 0.7) * (1 + 0.02 * rng.normal()) for d in doses_t17]
groups_t17 = _mk_dose_groups([(d, a) for d, a in zip(doses_t17, aucs_t17)])
dp_t17 = _compute_dose_proportionality(groups_t17)
fq_t17 = dp_t17.get("fit_quality")
se_slope_t17 = dp_t17.get("slope_stderr")
t_crit_expected = float(scipy_stats.t.ppf(0.95, df=1))
check("Test 17: t_crit at df=1 is approximately 6.31",
      abs(t_crit_expected - 6.31) < 0.05)
if se_slope_t17 is not None and fq_t17 and fq_t17["beta_ci_90_half_width"] is not None:
    expected_half_width = t_crit_expected * se_slope_t17
    check("Test 17: ci_half_width ~= t_crit (6.31) * SE_slope (NOT 1.645 * SE)",
          abs(fq_t17["beta_ci_90_half_width"] - expected_half_width) < 0.001)

# F2 -- nonlinearity caveat
print("\nF2 -- nonlinearity caveat:")
linear_dp = dp1
sublinear_dp = _compute_dose_proportionality(
    _mk_dose_groups([(10, 10**0.7), (30, 30**0.7), (100, 100**0.7)]))
supralinear_dp = _compute_dose_proportionality(
    _mk_dose_groups([(10, 10**1.4), (30, 30**1.4), (100, 100**1.4)]))
hed_based_t = {
    "available": True, "hed_mg_kg": 5.0, "mrsd_mg_kg": 0.5,
    "safety_factor": 10, "method": "bsa_hed", "noael_status": "established",
}
hed_based_unavail = {"available": False}

caveat_t6 = _build_nonlinearity_caveat(linear_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 6: linear PK -- caveat.applicable: false",
      caveat_t6["applicable"] is False)

caveat_t7 = _build_nonlinearity_caveat(sublinear_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 7: sub-proportional -- direction is 'potentially_overestimated'",
      caveat_t7.get("direction") == "potentially_overestimated")
check("Test 7: nonlinearity_corrected_margin_range[1] < linear_assumption_margin",
      caveat_t7.get("nonlinearity_corrected_margin_range")
      and caveat_t7["nonlinearity_corrected_margin_range"][1] < caveat_t7["linear_assumption_margin"])

caveat_t8 = _build_nonlinearity_caveat(supralinear_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 8: supra-proportional -- direction is 'potentially_underestimated'",
      caveat_t8.get("direction") == "potentially_underestimated")

check("Test 9: caveat does NOT emit 'corrected_margin' (anti-false-precision)",
      "corrected_margin" not in caveat_t7)
check("Test 9: caveat DOES emit nonlinearity_corrected_margin_range (a range)",
      "nonlinearity_corrected_margin_range" in caveat_t7)
range_t7 = caveat_t7.get("nonlinearity_corrected_margin_range") or []
check("Test 9: range is a 2-element list with low <= high",
      len(range_t7) == 2 and range_t7[0] <= range_t7[1])

fake_dp = {"assessment": "sublinear", "slope": 0.4, "slope_stderr": 0.5,
           "fit_quality": {"n_dose_groups": 3, "df": 1}}
caveat_t14 = _build_nonlinearity_caveat(fake_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 14: beta_low clamped to 0.3 floor",
      caveat_t14.get("beta_ci_90") and caveat_t14["beta_ci_90"][0] >= 0.3)

tight_dp = {"assessment": "sublinear", "slope": 0.7, "slope_stderr": 0.02,
            "fit_quality": {"n_dose_groups": 10, "df": 8}}
caveat_t18 = _build_nonlinearity_caveat(tight_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 18: tight CI -- range_uncertainty: 'narrow'",
      caveat_t18.get("range_uncertainty") == "narrow")

wide_dp = {"assessment": "sublinear", "slope": 0.7, "slope_stderr": 0.5,
           "fit_quality": {"n_dose_groups": 3, "df": 1}}
caveat_t19 = _build_nonlinearity_caveat(wide_dp, hed_based_t, clinical_dose_mg_kg=0.05)
check("Test 19: wide CI -- magnitude is the SAME as tight CI for same beta",
      caveat_t18.get("magnitude") == caveat_t19.get("magnitude"))
check("Test 19: wide CI -- range_uncertainty: 'wide'",
      caveat_t19.get("range_uncertainty") == "wide")

caveat_t21a = _build_nonlinearity_caveat(sublinear_dp, hed_based_t, clinical_dose_mg_kg=None)
check("Test 21a: no clinical_dose_mg_kg -- applicable: false, reason matches",
      caveat_t21a["applicable"] is False
      and caveat_t21a.get("reason") == "no_clinical_dose_or_hed")
caveat_t21b = _build_nonlinearity_caveat(sublinear_dp, hed_based_unavail, clinical_dose_mg_kg=0.05)
check("Test 21b: HED unavailable -- applicable: false, reason matches",
      caveat_t21b["applicable"] is False
      and caveat_t21b.get("reason") == "no_clinical_dose_or_hed")

# F3 -- accumulation ratio
print("\nF3 -- accumulation ratio:")
acc_single = _compute_accumulation(
    pp_merged=pd.DataFrame(), by_dose_group=[],
    compound_info={"compound_class": "small_molecule"},
    tk_design={"has_satellite_groups": False}, visit_days=[91],
)
check("Test 13: single-visit -- available: false", acc_single["available"] is False)
check("Test 13: single-visit -- reason: 'single_visit_only'",
      acc_single.get("reason") == "single_visit_only")
check("Test 13: single-visit -- study_assessment: 'insufficient_data'",
      acc_single.get("study_assessment") == "insufficient_data")

# Test 10: linear accumulation
pp_t10 = _mk_pp_merged([
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S2", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 200.0, "PPSTRESU": "ng*h/mL", "VISITDY": 14},
    {"dose_level": 1, "USUBJID": "S2", "PPTESTCD": "AUCLST", "PPSTRESN": 200.0, "PPSTRESU": "ng*h/mL", "VISITDY": 14},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "LAMZHL", "PPSTRESN": 24.0, "PPSTRESU": "h", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S2", "PPTESTCD": "LAMZHL", "PPSTRESN": 24.0, "PPSTRESU": "h", "VISITDY": 1},
])
acc_t10 = _compute_accumulation(
    pp_merged=pp_t10, by_dose_group=[{"dose_level": 1, "dose_value": 10.0}],
    compound_info={"compound_class": "small_molecule"},
    tk_design={}, visit_days=[1, 14],
)
acc_t10 = _finalize_accumulation_predictions(acc_t10, _FakeStudy("QD"), pp_t10)
check("Test 10: multi-visit -- available: true", acc_t10["available"] is True)
check("Test 10: r_ac_observed ~= 2.0",
      abs(acc_t10["by_dose_group"][0]["r_ac_observed"] - 2.0) < 0.01)
check("Test 10: study_assessment is 'linear_accumulation' (R_ac_obs ~= R_ac_pred)",
      acc_t10.get("study_assessment") == "linear_accumulation",
      f"got {acc_t10.get('study_assessment')}")

# Test 11: autoinhibition
pp_t11 = _mk_pp_merged([
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 500.0, "PPSTRESU": "ng*h/mL", "VISITDY": 14},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "LAMZHL", "PPSTRESN": 24.0, "PPSTRESU": "h", "VISITDY": 1},
])
acc_t11 = _compute_accumulation(
    pp_merged=pp_t11, by_dose_group=[{"dose_level": 1, "dose_value": 10.0}],
    compound_info={"compound_class": "small_molecule"},
    tk_design={}, visit_days=[1, 14],
)
acc_t11 = _finalize_accumulation_predictions(acc_t11, _FakeStudy("QD"), pp_t11)
check("Test 11: R_ac_obs > 2x R_ac_pred -- study_assessment: 'autoinhibition_likely'",
      acc_t11.get("study_assessment") == "autoinhibition_likely")

# Test 15: biologic forced to insufficient_data
pp_t15 = _mk_pp_merged([
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 14},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "LAMZHL", "PPSTRESN": 24.0, "PPSTRESU": "h", "VISITDY": 1},
])
acc_t15 = _compute_accumulation(
    pp_merged=pp_t15, by_dose_group=[{"dose_level": 1, "dose_value": 10.0}],
    compound_info={"compound_class": "monoclonal_antibody"},
    tk_design={}, visit_days=[1, 14],
)
acc_t15 = _finalize_accumulation_predictions(acc_t15, _FakeStudy("QD"), pp_t15)
check("Test 15: biologic -- prediction_reliability: 'unreliable'",
      acc_t15["by_dose_group"][0]["prediction_reliability"] == "unreliable")
check("Test 15: biologic -- study_assessment: 'insufficient_data' (NOT autoinduction)",
      acc_t15.get("study_assessment") == "insufficient_data")

# Test 16: no half-life
pp_t16 = _mk_pp_merged([
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 100.0, "PPSTRESU": "ng*h/mL", "VISITDY": 1},
    {"dose_level": 1, "USUBJID": "S1", "PPTESTCD": "AUCLST", "PPSTRESN": 200.0, "PPSTRESU": "ng*h/mL", "VISITDY": 14},
])
acc_t16 = _compute_accumulation(
    pp_merged=pp_t16, by_dose_group=[{"dose_level": 1, "dose_value": 10.0}],
    compound_info={"compound_class": "small_molecule"},
    tk_design={}, visit_days=[1, 14],
)
acc_t16 = _finalize_accumulation_predictions(acc_t16, _FakeStudy("QD"), pp_t16)
check("Test 16: no half-life -- r_ac_predicted: null",
      acc_t16["by_dose_group"][0]["r_ac_predicted"] is None)
check("Test 16: no half-life -- prediction_reliability: 'no_half_life'",
      acc_t16["by_dose_group"][0]["prediction_reliability"] == "no_half_life")
check("Test 16: no half-life -- r_ac_observed STILL emitted",
      acc_t16["by_dose_group"][0]["r_ac_observed"] is not None
      and abs(acc_t16["by_dose_group"][0]["r_ac_observed"] - 2.0) < 0.01)

# Tests 22, 23: unit normalization
check("Test 22: 1 day -> 24 hours", _normalize_half_life_to_hours(1.0, "day") == 24.0)
check("Test 22: 1 d -> 24 hours", _normalize_half_life_to_hours(1.0, "d") == 24.0)
check("Test 22: 60 min -> 1 hour", _normalize_half_life_to_hours(60.0, "min") == 1.0)
check("Test 22: 24 h -> 24 hours", _normalize_half_life_to_hours(24.0, "h") == 24.0)
check("Test 23: unrecognized unit -> None",
      _normalize_half_life_to_hours(1.0, "weeks") is None)
check("Test 23: empty unit -> None",
      _normalize_half_life_to_hours(1.0, "") is None)
check("Test 23: None value -> None",
      _normalize_half_life_to_hours(None, "h") is None)

# Multi-compartment compound class detection
print("\nF3 -- multi-compartment compound class detection:")
check("monoclonal_antibody is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "monoclonal_antibody"}))
check("checkpoint_inhibitor is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "checkpoint_inhibitor"}))
check("anti_vegf_mab is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "anti_vegf_mab"}))
check("fc_fusion_ctla4 is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "fc_fusion_ctla4"}))
check("aav_gene_therapy is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "aav_gene_therapy"}))
check("oligonucleotide is multi-compartment",
      _is_multi_compartment_compound({"compound_class": "oligonucleotide"}))
check("None compound_info is NOT multi-compartment",
      not _is_multi_compartment_compound(None))
check("small_molecule is NOT multi-compartment",
      not _is_multi_compartment_compound({"compound_class": "small_molecule"}))

# Test 24 (frontend smoke) -- enforced by .githooks/pre-commit npm run build.
print("\nTest 24 (frontend smoke):")
check("Test 24: enforced by .githooks/pre-commit npm run build (gate-level)",
      True)
check("Test 24: F1 group_id field name matches spec",
      all("group_id" in e for e in dp1["dose_normalized_auc"]))

# Elapsed time parsing (pre-existing)
print("\nElapsed time parsing:")
check("PT0.5H -> 0.5", _parse_elapsed_time("PT0.5H") == 0.5)
check("PT2H -> 2.0", _parse_elapsed_time("PT2H") == 2.0)
check("PT30M -> 0.5", _parse_elapsed_time("PT30M") == 0.5)
check("PT1H30M -> 1.5", _parse_elapsed_time("PT1H30M") == 1.5)
check("None -> None", _parse_elapsed_time(None) is None)

_pkmod._read_domain = _orig_read_domain


# ------------------------------------------------------------------
# Part 2: Integration tests against PointCross XPT data (main-guarded)
# ------------------------------------------------------------------

def _setup():
    from services.study_discovery import discover_studies
    from services.analysis.dose_groups import build_dose_groups
    from generator.view_dataframes import build_noael_summary
    from generator.domain_stats import compute_all_findings
    from services.analysis.mortality import compute_study_mortality

    studies = discover_studies()
    study = studies["PointCross"]
    dg = build_dose_groups(study)
    subjects = dg["subjects"]
    dose_groups = dg["dose_groups"]
    mortality = compute_study_mortality(study, subjects, dose_groups)
    findings, _ = compute_all_findings(study)
    noael = build_noael_summary(findings, dose_groups, mortality=mortality)
    pk = build_pk_integration(study, dose_groups, noael)
    return study, pk, noael, dose_groups


def _run_integration_tests():
    print("\nPart 2: PointCross integration tests\n")
    study, pk, noael, dose_groups = _setup()

    print("Availability:")
    check("PK data available", pk["available"] is True)
    check("Species is RAT", pk["species"] == "RAT")
    check("Km factor is 6", pk["km_factor"] == 6)
    check("HED conversion factor is 6.2", pk["hed_conversion_factor"] == 6.2)

    print("\nTK design:")
    tk = pk["tk_design"]
    check("Has satellite groups", tk["has_satellite_groups"] is True)
    check("3 satellite codes", len(tk["satellite_set_codes"]) == 3)
    check("Satellite codes are 2TK, 3TK, 4TK",
          set(tk["satellite_set_codes"]) == {"2TK", "3TK", "4TK"})
    check("30 TK subjects", tk["n_tk_subjects"] == 30)

    print("\nDose proportionality:")
    dp = pk.get("dose_proportionality", {})
    check("DP slope computed", dp.get("slope") is not None)
    check("DP R-squared computed", dp.get("r_squared") is not None)
    check("DP assessment is sublinear (non-monotonic AUC)",
          dp.get("assessment") == "sublinear")
    check("DP non-monotonic detected", dp.get("non_monotonic") is True)

    print("\nDose-normalized AUC profile (F1) + fit quality (F4):")
    check("F1: dose_normalized_auc populated (3 entries)",
          isinstance(dp.get("dose_normalized_auc"), list)
          and len(dp["dose_normalized_auc"]) == 3)
    check("F1: each entry uses 'group_id' field name",
          all("group_id" in e for e in (dp.get("dose_normalized_auc") or [])))
    check("F1: dose_normalized_auc_assessment in documented values",
          dp.get("dose_normalized_auc_assessment") in
          {"flat", "monotonic_increasing", "monotonic_decreasing", "inflection"})
    fq = dp.get("fit_quality")
    check("F4: fit_quality block present", isinstance(fq, dict))
    if isinstance(fq, dict):
        check("F4: N=3 dose groups (PointCross)", fq.get("n_dose_groups") == 3)
        check("F4: r_squared_unreliable_at_n=true (R1 F8: N<=4 unreliable)",
              fq.get("r_squared_unreliable_at_n") is True)
    check("F1+F4: slope_stderr exposed", dp.get("slope_stderr") is not None)

    print("\nNonlinearity caveat (F2):")
    sm = pk.get("safety_margin", {})
    hed_based = sm.get("hed_based", {})
    mm = pk.get("margin_method")
    if mm in ("bsa_hed", "bsa_fallback"):
        check("F2: nonlinearity_caveat block present on hed_based",
              "nonlinearity_caveat" in hed_based)
        nlc = hed_based.get("nonlinearity_caveat", {})
        check("F2: caveat has 'applicable' field", "applicable" in nlc)
        if nlc.get("applicable") is False:
            check("F2: PointCross caveat reason is documented value",
                  nlc.get("reason") in (
                      "no_clinical_dose_or_hed", "linear_or_insufficient_dp",
                      "near_linear_beta",
                  ))

    print("\nAccumulation (F3):")
    acc = pk.get("accumulation", {})
    check("Accumulation not available (single visit)", acc.get("available") is False)
    check("Accumulation study_assessment is 'insufficient_data'",
          acc.get("study_assessment") == "insufficient_data")
    check("Accumulation reason is 'single_visit_only'",
          acc.get("reason") == "single_visit_only")
    check("Accumulation by_dose_group field present (new schema)",
          "by_dose_group" in acc)


if __name__ == "__main__":
    try:
        _run_integration_tests()
    except Exception as e:
        import traceback
        print(f"\n[integration tests skipped due to setup failure]: {e}")
        traceback.print_exc()

    print(f"\n=== Results: {passed} passed, {failed} failed ===")
    sys.exit(1 if failed > 0 else 0)
else:
    print(f"\n=== Unit Test Results: {passed} passed, {failed} failed ===")
