"""Backend integration tests for DD/DS mortality pipeline.

Tests against PointCross XPT data, cross-checked with domain ground truth.
Run: cd backend && python tests/test_mortality.py

PointCross ground truth (from XPT):
  DS domain: 150 records -- 108 TERMINAL SACRIFICE, 39 RECOVERY SACRIFICE, 3 MORIBUND SACRIFICE
  DD domain: 3 records --
    PC201708-1001: Control (dose 0), male,   Day 30,  GAVAGE ERROR,              ACCIDENTAL
    PC201708-4003: Dose 3 (200 mg/kg), male, Day 90,  HEPATOCELLULAR CARCINOMA,  UNDETERMINED
    PC201708-4113: Dose 3 (200 mg/kg), female,Day 100, HEPATOCELLULAR CARCINOMA,  UNDETERMINED (recovery arm)

Derivation chain:
  DS 3 MORIBUND SACRIFICE -> classify_disposition -> 3 deaths
  DD DDRESCAT ACCIDENTAL for PC201708-1001 -> reclassify 1 death as accidental -> 2 deaths + 1 accidental
  Recovery filter excludes PC201708-4113 from main-study counts -> 1 main-study death + 1 accidental
  Dose 0: 0 main deaths, 1 accidental | Dose 3: 1 main death
  mortality_loael = 3 (lowest treated dose with death)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.xpt_processor import read_xpt
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_ds import classify_disposition, DEATH_TERMS
from services.analysis.findings_dd import parse_dd_domain
from services.analysis.mortality import compute_study_mortality


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


print("=== Mortality Pipeline Tests ===\n")

# ── DS domain ground truth ─────────────────────────────────────────────
print("DS domain ground truth:")
study, subjects, dose_groups = _setup()
ds_df, _ = read_xpt(study.xpt_files["ds"])
ds_df.columns = [c.upper() for c in ds_df.columns]
ds_counts = ds_df["DSDECOD"].str.strip().str.upper().value_counts()
check("DS has 150 total records", len(ds_df) == 150, f"got {len(ds_df)}")
check("108 TERMINAL SACRIFICE", ds_counts.get("TERMINAL SACRIFICE", 0) == 108,
      f"got {ds_counts.get('TERMINAL SACRIFICE', 0)}")
check("39 RECOVERY SACRIFICE", ds_counts.get("RECOVERY SACRIFICE", 0) == 39,
      f"got {ds_counts.get('RECOVERY SACRIFICE', 0)}")
check("3 MORIBUND SACRIFICE", ds_counts.get("MORIBUND SACRIFICE", 0) == 3,
      f"got {ds_counts.get('MORIBUND SACRIFICE', 0)}")

# ── DEATH_TERMS correctness ───────────────────────────────────────────
print("\nDEATH_TERMS correctness:")
check("excludes TERMINAL SACRIFICE", "TERMINAL SACRIFICE" not in DEATH_TERMS)
check("excludes SCHEDULED EUTHANASIA", "SCHEDULED EUTHANASIA" not in DEATH_TERMS)
check("includes MORIBUND SACRIFICE", "MORIBUND SACRIFICE" in DEATH_TERMS)
# Verify only 3 DS records match DEATH_TERMS (not 108+3)
matched = ds_df[ds_df["DSDECOD"].str.strip().str.upper().isin(DEATH_TERMS)]
check("only 3 DS records match DEATH_TERMS", len(matched) == 3, f"got {len(matched)}")

# ── classify_disposition ──────────────────────────────────────────────
print("\nclassify_disposition:")
check("MORIBUND SACRIFICE -> death", classify_disposition("MORIBUND SACRIFICE") == "death")
check("TERMINAL SACRIFICE -> scheduled", classify_disposition("TERMINAL SACRIFICE") == "scheduled")
check("SCHEDULED EUTHANASIA -> scheduled", classify_disposition("SCHEDULED EUTHANASIA") == "scheduled")
check("GAVAGE ERROR -> accidental", classify_disposition("GAVAGE ERROR") == "accidental")
check("RECOVERY SACRIFICE -> unknown", classify_disposition("RECOVERY SACRIFICE") == "unknown")
check("FOUND DEAD -> death", classify_disposition("FOUND DEAD") == "death")

# ── DD domain ground truth ────────────────────────────────────────────
print("\nDD domain ground truth:")
dd_df, _ = read_xpt(study.xpt_files["dd"])
dd_df.columns = [c.upper() for c in dd_df.columns]
check("DD has 3 raw records", len(dd_df) == 3, f"got {len(dd_df)}")

dd = parse_dd_domain(study, subjects)
check("parse_dd_domain returns 3 records", len(dd) == 3, f"got {len(dd)}")

# Cross-check each DD record against known ground truth
by_subj = {r["USUBJID"]: r for r in dd}
check("PC201708-1001 exists in DD", "PC201708-1001" in by_subj)
check("PC201708-4003 exists in DD", "PC201708-4003" in by_subj)
check("PC201708-4113 exists in DD", "PC201708-4113" in by_subj)

check("PC201708-1001 cause = GAVAGE ERROR",
      by_subj["PC201708-1001"]["cause"] == "GAVAGE ERROR",
      f"got {by_subj['PC201708-1001']['cause']}")
check("PC201708-4003 cause = HEPATOCELLULAR CARCINOMA",
      by_subj["PC201708-4003"]["cause"] == "HEPATOCELLULAR CARCINOMA",
      f"got {by_subj['PC201708-4003']['cause']}")
check("PC201708-4113 cause = HEPATOCELLULAR CARCINOMA",
      by_subj["PC201708-4113"]["cause"] == "HEPATOCELLULAR CARCINOMA",
      f"got {by_subj['PC201708-4113']['cause']}")

check("PC201708-1001 DDRESCAT = ACCIDENTAL",
      by_subj["PC201708-1001"]["relatedness"] == "ACCIDENTAL",
      f"got {by_subj['PC201708-1001']['relatedness']}")
check("PC201708-4003 DDRESCAT = UNDETERMINED",
      by_subj["PC201708-4003"]["relatedness"] == "UNDETERMINED",
      f"got {by_subj['PC201708-4003']['relatedness']}")
check("PC201708-4113 DDRESCAT = UNDETERMINED",
      by_subj["PC201708-4113"]["relatedness"] == "UNDETERMINED",
      f"got {by_subj['PC201708-4113']['relatedness']}")

# Subject metadata cross-check
check("PC201708-1001 is dose 0 (control)",
      by_subj["PC201708-1001"]["dose_level"] == 0,
      f"got dose_level={by_subj['PC201708-1001']['dose_level']}")
check("PC201708-4003 is dose 3",
      by_subj["PC201708-4003"]["dose_level"] == 3,
      f"got dose_level={by_subj['PC201708-4003']['dose_level']}")
check("PC201708-4113 is recovery arm",
      by_subj["PC201708-4113"]["is_recovery"] is True,
      f"got is_recovery={by_subj['PC201708-4113']['is_recovery']}")
check("PC201708-1001 is male",
      by_subj["PC201708-1001"]["SEX"] == "M",
      f"got SEX={by_subj['PC201708-1001']['SEX']}")

# ── Mortality aggregation ─────────────────────────────────────────────
print("\nMortality aggregation:")
m = compute_study_mortality(study, subjects, dose_groups)

# Step 1: 3 MORIBUND SACRIFICE -> 3 deaths via classify_disposition
# Step 2: DD DDRESCAT reclassifies PC201708-1001 as accidental -> 2 deaths + 1 accidental
all_deaths = m["deaths"]
all_accidentals = m["accidentals"]
check("2 total deaths (before recovery filter)",
      len(all_deaths) == 2,
      f"got {len(all_deaths)}")
check("1 total accidental (PC201708-1001 reclassified via DDRESCAT)",
      len(all_accidentals) == 1,
      f"got {len(all_accidentals)}")
check("accidental subject is PC201708-1001",
      all_accidentals[0]["USUBJID"] == "PC201708-1001")
check("accidental cause is GAVAGE ERROR",
      all_accidentals[0]["cause"] == "GAVAGE ERROR")

# Death subjects are PC201708-4003 and PC201708-4113
death_subjects = {d["USUBJID"] for d in all_deaths}
check("death subjects = {4003, 4113}",
      death_subjects == {"PC201708-4003", "PC201708-4113"},
      f"got {death_subjects}")

# Step 3: Recovery filter for main-study counts
# PC201708-4113 is recovery -> excluded from main-study total_deaths
check("total_deaths = 1 (main-study only, recovery excluded)",
      m["total_deaths"] == 1,
      f"got {m['total_deaths']}")
check("total_accidental = 1 (main-study only)",
      m["total_accidental"] == 1,
      f"got {m['total_accidental']}")

# Recovery death still in deaths list for reference
recovery_deaths = [d for d in all_deaths if d["is_recovery"]]
check("1 recovery-arm death in deaths list",
      len(recovery_deaths) == 1,
      f"got {len(recovery_deaths)}")
check("recovery death is PC201708-4113",
      recovery_deaths[0]["USUBJID"] == "PC201708-4113")

# Per-dose breakdown (main-study only)
by_dose = {bd["dose_level"]: bd for bd in m["by_dose"]}
check("dose 0: 0 deaths, 1 accidental",
      by_dose[0]["deaths"] == 0 and by_dose[0]["accidental"] == 1,
      f"got deaths={by_dose[0]['deaths']}, accidental={by_dose[0]['accidental']}")
check("dose 1: 0 deaths, 0 accidental",
      by_dose[1]["deaths"] == 0 and by_dose[1]["accidental"] == 0)
check("dose 2: 0 deaths, 0 accidental",
      by_dose[2]["deaths"] == 0 and by_dose[2]["accidental"] == 0)
check("dose 3: 1 death, 0 accidental",
      by_dose[3]["deaths"] == 1 and by_dose[3]["accidental"] == 0,
      f"got deaths={by_dose[3]['deaths']}, accidental={by_dose[3]['accidental']}")

# LOAEL / cap
check("mortality_loael = 3 (lowest treated dose with death)",
      m["mortality_loael"] == 3,
      f"got {m['mortality_loael']}")
check("mortality_noael_cap = 200.0 (dose value at LOAEL)",
      m["mortality_noael_cap"] == 200.0,
      f"got {m['mortality_noael_cap']}")
check("severity_tier = S0_Death",
      m["severity_tier"] == "S0_Death",
      f"got {m['severity_tier']}")
check("has_mortality = True",
      m["has_mortality"] is True)

print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(1 if failed > 0 else 0)
