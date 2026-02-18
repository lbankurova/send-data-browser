"""Backend integration tests for TF/PM tumor pipeline.

Tests against PointCross XPT data, cross-checked with domain ground truth.
Run: cd backend && python tests/test_tumor_integration.py

PointCross ground truth (from XPT):
  TF domain: 5 records --
    LIVER  ADENOMA, HEPATOCELLULAR, BENIGN    x2  (high dose, M)
    LIVER  CARCINOMA, HEPATOCELLULAR, MALIGNANT x2 (high dose, M, 1 is DD cause)
    UTERUS LEIOMYOMA, BENIGN                  x1  (mid dose, F)
  PM domain: 3 records --
    PC201708-3111: Left hindlimb, 11x22mm
    PC201708-4005: Top of head, RED 5x6mm
    PC201708-4108: Right abdomen, 13x20mm

  MI domain has LIVER HYPERTROPHY + LIVER NECROSIS -> progression detection.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_tf import compute_tf_findings, _extract_cell_type
from generator.tumor_summary import build_tumor_summary
from generator.domain_stats import compute_all_findings, TERMINAL_DOMAINS


def _setup():
    studies = discover_studies()
    study = studies["PointCross"]
    dg = build_dose_groups(study)
    return study, dg["subjects"], dg["dose_groups"]


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


print("=== Tumor Integration Tests ===\n")

# ── TF findings parser ─────────────────────────────────────────────
print("TF findings parser:")
study, subjects, dose_groups = _setup()
tf_findings = compute_tf_findings(study, subjects)

check("TF findings returned", len(tf_findings) > 0, f"got {len(tf_findings)}")
check("3 TF finding groups (liver adenoma M, liver carcinoma M, uterus leiomyoma F)",
      len(tf_findings) == 3, f"got {len(tf_findings)}")

# Check hepatic tumors
liver_findings = [f for f in tf_findings if f["specimen"] == "LIVER"]
check("Liver tumors detected", len(liver_findings) == 2, f"got {len(liver_findings)}")

# Check behavior field
behaviors = {f["finding"]: f["behavior"] for f in tf_findings}
benign_present = any(b == "BENIGN" for b in behaviors.values())
malignant_present = any(b == "MALIGNANT" for b in behaviors.values())
check("Behavior field -- BENIGN found", benign_present)
check("Behavior field -- MALIGNANT found", malignant_present)

# Check uterus leiomyoma
uterus_findings = [f for f in tf_findings if f["specimen"] == "UTERUS"]
check("Uterus leiomyoma detected", len(uterus_findings) == 1, f"got {len(uterus_findings)}")
if uterus_findings:
    check("Uterus leiomyoma sex is F", uterus_findings[0]["sex"] == "F",
          f"got {uterus_findings[0]['sex']}")

# Check all are incidence-type
check("All TF findings are incidence-type",
      all(f["data_type"] == "incidence" for f in tf_findings))

# Check isNeoplastic flag
check("All TF findings have isNeoplastic=True",
      all(f.get("isNeoplastic") is True for f in tf_findings))

# Check cell type extraction
check("Cell type: hepatocellular detected",
      any(f.get("cell_type") == "hepatocellular" for f in tf_findings))
check("Cell type: smooth_muscle detected",
      any(f.get("cell_type") == "smooth_muscle" for f in tf_findings))

# ── Cell type extraction unit tests ────────────────────────────────
print("\nCell type extraction:")
check("CARCINOMA HEPATOCELLULAR -> hepatocellular",
      _extract_cell_type("CARCINOMA, HEPATOCELLULAR, MALIGNANT") == "hepatocellular")
check("LEIOMYOMA -> smooth_muscle",
      _extract_cell_type("LEIOMYOMA, BENIGN") == "smooth_muscle")
check("ADENOMA, HEPATOCELLULAR -> hepatocellular",
      _extract_cell_type("ADENOMA, HEPATOCELLULAR, BENIGN") == "hepatocellular")
check("Unknown morphology -> unclassified",
      _extract_cell_type("SOMETHING UNUSUAL") == "unclassified")

# ── TF in TERMINAL_DOMAINS ────────────────────────────────────────
print("\nTerminal domain registration:")
check("TF in TERMINAL_DOMAINS", "TF" in TERMINAL_DOMAINS)

# ── Dual-pass scheduled stats ────────────────────────────────────
print("\nDual-pass scheduled-only stats:")
from services.analysis.mortality import get_early_death_subjects
early_death_subjects = get_early_death_subjects(study, subjects)
findings, dg_data = compute_all_findings(study, early_death_subjects=early_death_subjects)

tf_in_pipeline = [f for f in findings if f["domain"] == "TF"]
check("TF findings present in pipeline", len(tf_in_pipeline) > 0,
      f"got {len(tf_in_pipeline)}")

# Check that TF findings got scheduled stats (dual-pass)
has_scheduled = any(f.get("scheduled_group_stats") is not None for f in tf_in_pipeline)
has_n_excluded = any(f.get("n_excluded") is not None for f in tf_in_pipeline)
check("TF findings have n_excluded (dual-pass participant)",
      has_n_excluded, f"scheduled={has_scheduled}, n_excluded={has_n_excluded}")

# ── Tumor summary ─────────────────────────────────────────────────
print("\nTumor summary:")
tumor_summary = build_tumor_summary(findings, study)

check("has_tumors is True", tumor_summary["has_tumors"])
check("total_tumor_animals = 5", tumor_summary["total_tumor_animals"] == 5,
      f"got {tumor_summary['total_tumor_animals']}")
check("total_tumor_types = 3", tumor_summary["total_tumor_types"] == 3,
      f"got {tumor_summary['total_tumor_types']}")

# Combined analysis
combined = tumor_summary["combined_analyses"]
check("Combined analysis present for hepatocellular", len(combined) >= 1,
      f"got {len(combined)}")
if combined:
    hep_combined = [c for c in combined if c["cell_type"] == "hepatocellular"]
    check("Hepatocellular combined analysis found", len(hep_combined) == 1)
    if hep_combined:
        check("Combined adenoma+carcinoma count correct",
              hep_combined[0]["adenoma_count"] == 2 and hep_combined[0]["carcinoma_count"] == 1,
              f"adenoma={hep_combined[0]['adenoma_count']}, carcinoma={hep_combined[0]['carcinoma_count']}")
        check("Combined trend p-value present",
              hep_combined[0]["combined_trend_p"] is not None and hep_combined[0]["combined_trend_p"] < 0.05,
              f"p={hep_combined[0]['combined_trend_p']}")

# Progression detection
progressions = tumor_summary["progression_sequences"]
check("Progression sequences detected", len(progressions) >= 1,
      f"got {len(progressions)}")

liver_prog = [p for p in progressions if p["organ"] == "LIVER" and p["cell_type"] == "hepatocellular"]
check("Liver hepatocellular progression found", len(liver_prog) == 1)
if liver_prog:
    lp = liver_prog[0]
    check("Progression has MI precursors", lp["has_mi_precursor"],
          f"mi_precursors={lp['mi_precursors']}")
    check("Progression has TF tumors", lp["has_tf_tumor"])
    check("Stages present includes necrosis",
          "necrosis" in lp["stages_present"], f"stages={lp['stages_present']}")
    check("Stages present includes hypertrophy",
          "hypertrophy" in lp["stages_present"], f"stages={lp['stages_present']}")
    check("Stages present includes adenoma",
          "adenoma" in lp["stages_present"], f"stages={lp['stages_present']}")
    check("Stages present includes carcinoma",
          "carcinoma" in lp["stages_present"], f"stages={lp['stages_present']}")

# PM palpable masses
pm = tumor_summary["palpable_masses"]
check("PM palpable masses parsed", len(pm) == 3, f"got {len(pm)}")

# ── Generated JSON verification ──────────────────────────────────
print("\nGenerated JSON verification:")
gen_dir = Path(__file__).parent.parent / "generated" / "PointCross"

tumor_json = gen_dir / "tumor_summary.json"
check("tumor_summary.json exists", tumor_json.exists())
if tumor_json.exists():
    with open(tumor_json) as f:
        data = json.load(f)
    check("tumor_summary.json has_tumors", data["has_tumors"])
    check("tumor_summary.json total_tumor_types", data["total_tumor_types"] == 3)

# TF findings may or may not appear in adverse_effect_summary.json depending
# on individual finding p-values. The combined analysis (adenoma + carcinoma)
# is significant but individual morphology groups may not be. This is correct
# behavior -- tumor_summary.json provides the combined analysis.

# Check TF in lesion_severity_summary
lss_json = gen_dir / "lesion_severity_summary.json"
if lss_json.exists():
    with open(lss_json) as f:
        lss_data = json.load(f)
    tf_rows = [r for r in lss_data if r.get("domain") == "TF"]
    check("TF findings in lesion_severity_summary.json", len(tf_rows) > 0,
          f"got {len(tf_rows)}")


print(f"\n=== Results: {passed} passed, {failed} failed ===")
if failed > 0:
    sys.exit(1)
