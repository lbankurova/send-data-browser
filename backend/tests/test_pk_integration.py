"""Backend integration tests for PK integration (PC + PP + DM).

Tests against PointCross XPT data, cross-checked with domain ground truth.
Run: cd backend && python tests/test_pk_integration.py

PointCross ground truth (from XPT):
  PC.xpt: 150 rows, 30 TK satellite subjects, 5 timepoints each
    Single analyte: PCDRUGC, specimen: PLASMA, method: GCMS
    PCLLOQ: 20.0 ng/mL, 10 BQL rows (PCSTRESN = NaN)
    ALL rows VISITDY=91 (single study day)

  PP.xpt: 150 rows, 30 subjects, ~5 parameters each
    PPTESTCD: CMAX, AUCLST, AUCTAU, TMAX, TLST, AUCIFO (6 codes)
    Some negative AUCIFO values (extrapolation failures)
    ALL rows VISITDY=91

  DM SETCD: 2TK (10 subj, 2 mg/kg), 3TK (10 subj, 20 mg/kg), 4TK (10 subj, 200 mg/kg)
    No 1TK (control has no drug)
    Rodent satellite design

  Species: RAT (from TS domain)
  Dose mapping: dose_level 0=control, 1=2mg/kg, 2=20mg/kg, 3=200mg/kg
  Computed NOAEL: dose_level 0 (control, 0 mg/kg), LOAEL: dose_level 1 (2 mg/kg)
    -> adverse effects present at lowest tested dose
    -> NOAEL exposure = None (no TK at control), LOAEL exposure = dose_level 1 data
    -> HED = 0/6.2 = 0 (NOAEL at control means no safe dose margin)
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import build_dose_groups
from generator.pk_integration import build_pk_integration, _parse_elapsed_time
from generator.view_dataframes import build_noael_summary
from generator.domain_stats import compute_all_findings
from services.analysis.mortality import compute_study_mortality

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


def _setup():
    studies = discover_studies()
    study = studies["PointCross"]
    dg = build_dose_groups(study)
    subjects = dg["subjects"]
    dose_groups = dg["dose_groups"]

    # Compute mortality (needed for NOAEL)
    mortality = compute_study_mortality(study, subjects, dose_groups)

    # Compute findings + NOAEL (needed for PK integration)
    findings, _ = compute_all_findings(study)
    noael = build_noael_summary(findings, dose_groups, mortality=mortality)

    # Build PK integration
    pk = build_pk_integration(study, dose_groups, noael)
    return study, pk, noael, dose_groups


print("=== PK Integration Tests ===\n")

study, pk, noael, dose_groups = _setup()

# --- Availability ---
print("Availability:")
check("PK data available", pk["available"] is True)
check("Species is RAT", pk["species"] == "RAT", f"got {pk.get('species')}")
check("Km factor is 6", pk["km_factor"] == 6, f"got {pk.get('km_factor')}")
check("HED conversion factor is 6.2", pk["hed_conversion_factor"] == 6.2, f"got {pk.get('hed_conversion_factor')}")

# --- TK Design ---
print("\nTK design:")
tk = pk["tk_design"]
check("Has satellite groups", tk["has_satellite_groups"] is True)
check("Satellite codes include TK suffix",
      all(s.endswith("TK") for s in tk["satellite_set_codes"]),
      f"got {tk['satellite_set_codes']}")
check("3 satellite codes", len(tk["satellite_set_codes"]) == 3, f"got {len(tk['satellite_set_codes'])}")
check("Satellite codes are 2TK, 3TK, 4TK",
      set(tk["satellite_set_codes"]) == {"2TK", "3TK", "4TK"},
      f"got {tk['satellite_set_codes']}")
check("30 TK subjects", tk["n_tk_subjects"] == 30, f"got {tk['n_tk_subjects']}")
check("No individual correlation", tk["individual_correlation_possible"] is False)

# --- Analyte info ---
print("\nAnalyte info:")
check("Analyte detected", pk.get("analyte") is not None, f"got {pk.get('analyte')}")
check("Specimen is PLASMA", pk.get("specimen") == "PLASMA", f"got {pk.get('specimen')}")
check("LLOQ is 20.0", pk.get("lloq") == 20.0, f"got {pk.get('lloq')}")

# --- Visit days ---
print("\nVisit days:")
check("Visit days present", len(pk.get("visit_days", [])) > 0)
check("Visit day 91", 91 in pk.get("visit_days", []), f"got {pk.get('visit_days')}")
check("Not multi-visit", pk.get("multi_visit") is False)

# --- PP Parameters ---
print("\nPP parameters:")
pp_params = pk.get("pp_parameters_available", [])
check("CMAX available", "CMAX" in pp_params, f"got {pp_params}")
check("AUCLST available", "AUCLST" in pp_params, f"got {pp_params}")
check("TMAX available", "TMAX" in pp_params, f"got {pp_params}")

# --- Dose groups ---
print("\nDose groups:")
by_dose = pk.get("by_dose_group", [])
check("3 dose groups (no control TK)", len(by_dose) == 3, f"got {len(by_dose)}")
if len(by_dose) >= 3:
    check("First dose group is dose_level 1", by_dose[0]["dose_level"] == 1, f"got {by_dose[0]['dose_level']}")
    check("Dose group 1 = 2 mg/kg",
          by_dose[0].get("dose_value") == 2.0,
          f"got {by_dose[0].get('dose_value')}")
    check("10 subjects per group",
          all(g["n_subjects"] == 10 for g in by_dose),
          f"got {[g['n_subjects'] for g in by_dose]}")
    check("CMAX in all groups",
          all("CMAX" in g["parameters"] for g in by_dose),
          f"missing CMAX in {[g['dose_level'] for g in by_dose if 'CMAX' not in g['parameters']]}")

    # Check parameter stats are reasonable
    cmax_low = by_dose[0]["parameters"].get("CMAX", {})
    cmax_high = by_dose[2]["parameters"].get("CMAX", {})
    check("CMAX mean is positive (low dose)",
          cmax_low.get("mean") is not None and cmax_low["mean"] > 0,
          f"got {cmax_low.get('mean')}")
    check("CMAX mean is positive (high dose)",
          cmax_high.get("mean") is not None and cmax_high["mean"] > 0,
          f"got {cmax_high.get('mean')}")
    check("CMAX increases with dose",
          cmax_high.get("mean", 0) > cmax_low.get("mean", 0),
          f"low={cmax_low.get('mean')}, high={cmax_high.get('mean')}")

# --- Concentration-time ---
print("\nConcentration-time profiles:")
if len(by_dose) >= 1:
    ct = by_dose[0].get("concentration_time", [])
    check("Concentration-time data present", len(ct) > 0, f"got {len(ct)} timepoints")
    check("5 timepoints per group",
          all(len(g.get("concentration_time", [])) == 5 for g in by_dose),
          f"got {[len(g.get('concentration_time', [])) for g in by_dose]}")

# --- Dose proportionality ---
print("\nDose proportionality:")
dp = pk.get("dose_proportionality", {})
check("DP computed (not insufficient_data)", dp.get("assessment") != "insufficient_data", f"got {dp.get('assessment')}")
check("DP uses 3 dose levels", len(dp.get("dose_levels_used", [])) == 3, f"got {dp.get('dose_levels_used')}")
check("DP slope computed", dp.get("slope") is not None, f"got {dp.get('slope')}")
check("DP R-squared computed", dp.get("r_squared") is not None, f"got {dp.get('r_squared')}")
# Note: PointCross AUC is non-monotonic (dose 3 AUC < dose 2 AUC), so R-squared is low
# TK satellites all survived at 200 mg/kg, so the AUC drop is real PK (not survivorship artifact)
check("DP assessment is sublinear (non-monotonic AUC)", dp.get("assessment") == "sublinear",
      f"got {dp.get('assessment')}")
check("DP non-monotonic detected", dp.get("non_monotonic") is True)
check("DP interpretation present", dp.get("interpretation") is not None and len(dp["interpretation"]) > 0)
check("DP interpretation mentions TK survived",
      "satellite" in (dp.get("interpretation") or "").lower() or "survived" in (dp.get("interpretation") or "").lower(),
      f"interpretation does not cross-reference survivorship")

# --- Accumulation ---
print("\nAccumulation:")
acc = pk.get("accumulation", {})
check("Accumulation not available (single visit)", acc.get("available") is False)
check("Accumulation assessment is unknown", acc.get("assessment") == "unknown")

# --- HED/MRSD ---
# PointCross NOAEL is at control (dose_level 0, 0 mg/kg) since adverse effects
# are present at lowest tested dose. HED/MRSD are computed but = 0.
print("\nHED/MRSD:")
hed = pk.get("hed")
check("HED data present", hed is not None)
if hed:
    # NOAEL = control (0 mg/kg) for PointCross
    noael_combined = next((r for r in noael if r.get("sex") == "Combined"), noael[0])
    expected_noael_mg = noael_combined.get("noael_dose_value", 0)
    check("NOAEL dose matches noael summary", hed["noael_mg_kg"] == expected_noael_mg,
          f"got {hed['noael_mg_kg']}, expected {expected_noael_mg}")
    check("Safety factor 10", hed["safety_factor"] == 10)
    check("HED = NOAEL / conversion_factor",
          abs(hed["hed_mg_kg"] - expected_noael_mg / 6.2) < 0.01,
          f"got {hed['hed_mg_kg']}")
    # PointCross NOAEL is at control -> noael_status should be "at_control"
    check("NOAEL status is at_control", hed.get("noael_status") == "at_control",
          f"got {hed.get('noael_status')}")

# --- NOAEL exposure ---
# NOAEL is at control (dose_level 0); no TK satellites for control -> None is correct
print("\nNOAEL exposure:")
noael_exp = pk.get("noael_exposure")
noael_level = noael_combined.get("noael_dose_level")
if noael_level == 0:
    check("NOAEL exposure is None (no TK at control)", noael_exp is None)
else:
    check("NOAEL exposure present", noael_exp is not None)
    if noael_exp:
        check("NOAEL CMAX has mean", noael_exp.get("cmax") is not None and noael_exp["cmax"]["mean"] > 0)
        check("NOAEL AUC has mean", noael_exp.get("auc") is not None and noael_exp["auc"]["mean"] > 0)

# --- LOAEL exposure ---
print("\nLOAEL exposure:")
loael_exp = pk.get("loael_exposure")
check("LOAEL exposure present", loael_exp is not None)
if loael_exp:
    check("LOAEL CMAX has mean", loael_exp.get("cmax") is not None and loael_exp["cmax"]["mean"] > 0,
          f"got {loael_exp.get('cmax')}")
    check("LOAEL AUC has mean", loael_exp.get("auc") is not None and loael_exp["auc"]["mean"] > 0,
          f"got {loael_exp.get('auc')}")
    check("LOAEL dose_level matches noael summary",
          loael_exp["dose_level"] == noael_combined.get("loael_dose_level"),
          f"got {loael_exp['dose_level']}, expected {noael_combined.get('loael_dose_level')}")

# --- Elapsed time parsing ---
print("\nElapsed time parsing:")
check("PT0.5H -> 0.5", _parse_elapsed_time("PT0.5H") == 0.5)
check("PT2H -> 2.0", _parse_elapsed_time("PT2H") == 2.0)
check("PT30M -> 0.5", _parse_elapsed_time("PT30M") == 0.5)
check("PT1H30M -> 1.5", _parse_elapsed_time("PT1H30M") == 1.5)
check("None -> None", _parse_elapsed_time(None) is None)

# --- Summary ---
print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(1 if failed > 0 else 0)
