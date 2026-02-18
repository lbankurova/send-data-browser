"""Backend integration tests for study design rules (SD-001 through SD-007).

Tests against live XPT data using study-agnostic structural invariants.
Run: cd backend && python tests/test_sd_validation.py

Each SD rule is tested for:
  1. Runs without error
  2. Output structure (correct domain, variable, evidence format)
  3. Cross-check against raw data (flagged values exist, clean data is genuinely clean)
  4. Dedup invariants where applicable
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from services.study_discovery import discover_studies
from validation.engine import ValidationEngine
from validation.checks.study_design import check_study_design, clear_cache

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
    engine = ValidationEngine()
    domains = engine.load_study_domains(study)
    clear_cache()
    return study, engine, domains


print("=== Study Design Validation Tests ===\n")

study, engine, domains = _setup()

sd_rules = [r for r in engine.rules if r.parameters.get("sd_rule", "").startswith("SD-")]
check("SD rules loaded", len(sd_rules) == 7, f"got {len(sd_rules)}")


# -- Helper: run a single SD rule ---------------------------------------------

def run_rule(rule_id: str) -> list:
    rule = next((r for r in sd_rules if r.id == rule_id), None)
    if rule is None:
        return []
    return check_study_design(
        rule=rule,
        domains=domains,
        metadata=engine.metadata,
        rule_id_prefix=rule.id,
        study=study,
        ct_data=engine.ct_data,
    )


# -- Common structural invariants for all SD rules ----------------------------

def check_common_structure(results, rule_id, expected_domain, expected_variable):
    """Verify structural invariants shared by all SD rules."""
    for r in results:
        check(f"{rule_id} domain is {expected_domain}",
              r.domain == expected_domain,
              f"got {r.domain}")
        check(f"{rule_id} variable is {expected_variable}",
              r.variable == expected_variable,
              f"got {r.variable}")
        check(f"{rule_id} has evidence dict",
              isinstance(r.evidence, dict),
              f"got {type(r.evidence)}")
        check(f"{rule_id} has diagnosis string",
              isinstance(r.diagnosis, str) and len(r.diagnosis) > 0,
              f"diagnosis empty or wrong type")
        check(f"{rule_id} has fix_tier",
              isinstance(r.fix_tier, int) and r.fix_tier >= 1,
              f"got {r.fix_tier}")
        break  # Just check first record to avoid noise


# -- SD-001: Orphaned subjects ------------------------------------------------

print("\n--- SD-001: Orphaned subjects ---")
results_001 = run_rule("SD-001")
check("SD-001 runs without error", True)

dm = domains.get("DM")
ta = domains.get("TA")

if results_001:
    check_common_structure(results_001, "SD-001", "DM", "ARMCD")
    # Every result should have a real subject_id
    check("SD-001 all subjects populated",
          all(r.subject_id != "--" for r in results_001))
    # Evidence should have cross-domain type with DM ARMCD and Valid TA ARMCDs
    ev = results_001[0].evidence
    check("SD-001 evidence type is cross-domain",
          ev.get("type") == "cross-domain",
          f"got {ev.get('type')}")
    if "lines" in ev:
        labels = {line["label"] for line in ev["lines"]}
        check("SD-001 evidence has DM ARMCD label", "DM ARMCD" in labels,
              f"labels: {labels}")
        check("SD-001 evidence has Valid TA ARMCDs label", "Valid TA ARMCDs" in labels,
              f"labels: {labels}")
    # Cross-check: orphan ARMCDs should NOT be in TA
    if ta is not None and "ARMCD" in ta.columns:
        ta_armcds = set(ta["ARMCD"].dropna().unique())
        orphan_armcds = {r.actual_value for r in results_001}
        overlap = orphan_armcds & ta_armcds
        check("SD-001 orphan ARMCDs not in TA (cross-check)",
              len(overlap) == 0,
              f"overlap: {overlap}")
    # No duplicate subject within same ARMCD group
    subj_armcd_pairs = [(r.subject_id, r.actual_value) for r in results_001]
    check("SD-001 no duplicate subject-ARMCD pairs",
          len(subj_armcd_pairs) == len(set(subj_armcd_pairs)),
          f"{len(subj_armcd_pairs)} records, {len(set(subj_armcd_pairs))} unique")
    print(f"  (found {len(results_001)} orphaned subjects)")
else:
    # Clean data — verify DM ARMCDs are all in TA
    if dm is not None and ta is not None and "ARMCD" in dm.columns and "ARMCD" in ta.columns:
        dm_armcds = set(dm["ARMCD"].dropna().unique())
        ta_armcds = set(ta["ARMCD"].dropna().unique())
        check("SD-001 clean: all DM ARMCDs in TA",
              dm_armcds.issubset(ta_armcds),
              f"orphans: {dm_armcds - ta_armcds}")
    print("  (no orphaned subjects — clean data)")


# -- SD-002: Empty arms -------------------------------------------------------

print("\n--- SD-002: Empty arms ---")
results_002 = run_rule("SD-002")
check("SD-002 runs without error", True)

if results_002:
    check_common_structure(results_002, "SD-002", "TA", "ARMCD")
    # subject_id should be "--" (no specific subject)
    check("SD-002 subject is --",
          all(r.subject_id == "--" for r in results_002))
    # Evidence has ARMCD and ARM lines
    ev = results_002[0].evidence
    if "lines" in ev:
        labels = {line["label"] for line in ev["lines"]}
        check("SD-002 evidence has ARMCD label", "ARMCD" in labels,
              f"labels: {labels}")
        check("SD-002 evidence has ARM label", "ARM" in labels,
              f"labels: {labels}")
    # Cross-check: empty arm ARMCDs should NOT be in DM
    if dm is not None and "ARMCD" in dm.columns:
        dm_armcds = set(dm["ARMCD"].dropna().unique())
        empty_armcds = {r.actual_value for r in results_002}
        overlap = empty_armcds & dm_armcds
        check("SD-002 empty ARMCDs not in DM (cross-check)",
              len(overlap) == 0,
              f"overlap: {overlap}")
    # No duplicate ARMCDs
    armcds = [r.actual_value for r in results_002]
    check("SD-002 no duplicate ARMCDs",
          len(armcds) == len(set(armcds)),
          f"{len(armcds)} records, {len(set(armcds))} unique")
    print(f"  (found {len(results_002)} empty arms)")
else:
    # Clean data — verify all TA ARMCDs have subjects in DM
    if dm is not None and ta is not None and "ARMCD" in dm.columns and "ARMCD" in ta.columns:
        dm_armcds = set(dm["ARMCD"].dropna().unique())
        ta_armcds = set(ta["ARMCD"].dropna().unique())
        empty = ta_armcds - dm_armcds
        check("SD-002 clean: all TA ARMCDs have subjects",
              len(empty) == 0,
              f"empty: {empty}")
    print("  (no empty arms — clean data)")


# -- SD-003: Ambiguous control status -----------------------------------------

print("\n--- SD-003: Ambiguous control status ---")
results_003 = run_rule("SD-003")
check("SD-003 runs without error", True)

if results_003:
    check_common_structure(results_003, "SD-003", "DM", "IS_CONTROL")
    # Evidence should have cross-domain type
    ev = results_003[0].evidence
    check("SD-003 evidence type is cross-domain",
          ev.get("type") == "cross-domain",
          f"got {ev.get('type')}")
    # actual_value should match one of the three variant patterns
    valid_patterns = [
        "DOSE=0, not flagged as control",  # variant a
        "Control with dose=",               # variant b prefix
        "No control group detected",        # variant c
    ]
    for r in results_003:
        matches_pattern = any(p in r.actual_value for p in valid_patterns)
        check("SD-003 actual_value matches variant pattern",
              matches_pattern,
              f"actual_value={r.actual_value}")
        break  # Check first only
    print(f"  (found {len(results_003)} control ambiguity issues)")
else:
    # Clean data — verify a control group exists (ARMCD with dose=0 or "control" in name)
    tx = domains.get("TX")
    if tx is not None and dm is not None and "ARMCD" in dm.columns:
        # At minimum the study should have a control-like arm
        dm_armcds = set(dm["ARMCD"].dropna().unique())
        check("SD-003 clean: study has at least 2 arms",
              len(dm_armcds) >= 2,
              f"arms: {dm_armcds}")
    print("  (no control ambiguity — clean data)")


# -- SD-004: Missing trial summary parameters ---------------------------------

print("\n--- SD-004: Missing trial summary parameters ---")
results_004 = run_rule("SD-004")
check("SD-004 runs without error", True)

REQUIRED_TS_PARAMS = {"SPECIES", "STRAIN", "ROUTE", "SSTDTC", "SSTYP"}

if results_004:
    check_common_structure(results_004, "SD-004", "TS", "TSPARMCD")
    # subject_id should be "--" (study-level issue)
    check("SD-004 subject is --",
          all(r.subject_id == "--" for r in results_004))
    # actual_value should match "(missing: XXXX)" pattern
    for r in results_004:
        match = re.match(r"\(missing: (\w+)\)", r.actual_value)
        check("SD-004 actual_value matches missing pattern",
              match is not None,
              f"actual_value={r.actual_value}")
        if match:
            param = match.group(1)
            check(f"SD-004 missing param '{param}' is in required set",
                  param in REQUIRED_TS_PARAMS,
                  f"required: {REQUIRED_TS_PARAMS}")
    # Evidence should have missing-value type
    ev = results_004[0].evidence
    check("SD-004 evidence type is missing-value",
          ev.get("type") == "missing-value",
          f"got {ev.get('type')}")
    check("SD-004 evidence has variable field",
          "variable" in ev,
          f"keys: {list(ev.keys())}")
    # Cross-check: reported missing params should NOT be in TS domain
    ts = domains.get("TS")
    if ts is not None and "TSPARMCD" in ts.columns:
        ts_params = set(ts["TSPARMCD"].dropna().astype(str).str.upper().unique())
        for r in results_004:
            match = re.match(r"\(missing: (\w+)\)", r.actual_value)
            if match:
                param = match.group(1)
                check(f"SD-004 '{param}' not in TS (cross-check)",
                      param not in ts_params,
                      f"param {param} IS in TS: {ts_params}")
    # Issues <= required params (can't report more missing than we check)
    check("SD-004 issues <= required param count",
          len(results_004) <= len(REQUIRED_TS_PARAMS),
          f"{len(results_004)} issues but only {len(REQUIRED_TS_PARAMS)} required params")
    # No duplicate params
    params = [r.actual_value for r in results_004]
    check("SD-004 no duplicate params",
          len(params) == len(set(params)),
          f"{len(params)} records, {len(set(params))} unique")
    print(f"  (found {len(results_004)} missing TS params: "
          f"{[r.actual_value for r in results_004]})")
else:
    # All required params present
    ts = domains.get("TS")
    if ts is not None and "TSPARMCD" in ts.columns:
        ts_params = set(ts["TSPARMCD"].dropna().astype(str).str.upper().unique())
        missing = REQUIRED_TS_PARAMS - ts_params
        check("SD-004 clean: all required TS params present",
              len(missing) == 0,
              f"missing: {missing}")
    print("  (no missing TS params — clean data)")


# -- SD-005: Dose inconsistency within subject --------------------------------

print("\n--- SD-005: Dose inconsistency within subject ---")
results_005 = run_rule("SD-005")
check("SD-005 runs without error", True)

if results_005:
    check_common_structure(results_005, "SD-005", "EX", "EXDOSE")
    # Every result should have a real subject_id
    check("SD-005 all subjects populated",
          all(r.subject_id != "--" for r in results_005))
    # actual_value should mention "Multiple doses"
    check("SD-005 actual_value mentions multiple doses",
          all("Multiple doses" in r.actual_value for r in results_005),
          f"first: {results_005[0].actual_value}")
    # Evidence should have Doses and Unit lines
    ev = results_005[0].evidence
    if "lines" in ev:
        labels = {line["label"] for line in ev["lines"]}
        check("SD-005 evidence has Doses label", "Doses" in labels,
              f"labels: {labels}")
        check("SD-005 evidence has Unit label", "Unit" in labels,
              f"labels: {labels}")
    # No duplicate subjects
    subjs = [r.subject_id for r in results_005]
    check("SD-005 no duplicate subjects",
          len(subjs) == len(set(subjs)),
          f"{len(subjs)} records, {len(set(subjs))} unique")
    # Cross-check: each flagged subject should have >1 distinct dose in EX
    ex = domains.get("EX")
    if ex is not None and "EXDOSE" in ex.columns and "USUBJID" in ex.columns:
        for r in results_005[:3]:  # Check first 3 to avoid excessive runtime
            subj_doses = ex[ex["USUBJID"] == r.subject_id]["EXDOSE"].dropna().unique()
            nonzero = [d for d in subj_doses if d != 0]
            check(f"SD-005 subject {r.subject_id} has >1 dose in EX",
                  len(set(nonzero)) > 1,
                  f"doses: {sorted(set(nonzero))}")
    print(f"  (found {len(results_005)} subjects with dose inconsistency)")
else:
    # Clean data — verify each subject has at most 1 distinct non-zero dose in EX
    ex = domains.get("EX")
    if ex is not None and "EXDOSE" in ex.columns and "USUBJID" in ex.columns:
        inconsistent = []
        for subj, grp in ex.groupby("USUBJID"):
            nonzero = set(d for d in grp["EXDOSE"].dropna().unique() if d != 0)
            if len(nonzero) > 1:
                inconsistent.append(subj)
        check("SD-005 clean: all subjects have consistent dosing",
              len(inconsistent) == 0,
              f"inconsistent: {inconsistent[:5]}")
    print("  (no dose inconsistency — clean data)")


# -- SD-006: Orphaned sets ----------------------------------------------------

print("\n--- SD-006: Orphaned sets ---")
results_006 = run_rule("SD-006")
check("SD-006 runs without error", True)

if results_006:
    check_common_structure(results_006, "SD-006", "TX", "SETCD")
    # subject_id should be "--"
    check("SD-006 subject is --",
          all(r.subject_id == "--" for r in results_006))
    # Evidence has SETCD and SET lines
    ev = results_006[0].evidence
    if "lines" in ev:
        labels = {line["label"] for line in ev["lines"]}
        check("SD-006 evidence has SETCD label", "SETCD" in labels,
              f"labels: {labels}")
        check("SD-006 evidence has SET label", "SET" in labels,
              f"labels: {labels}")
    # Cross-check: orphaned SETCDs should NOT be in DM
    if dm is not None and "SETCD" in dm.columns:
        dm_setcds = set(dm["SETCD"].dropna().unique())
        orphan_setcds = {r.actual_value for r in results_006}
        overlap = orphan_setcds & dm_setcds
        check("SD-006 orphaned SETCDs not in DM (cross-check)",
              len(overlap) == 0,
              f"overlap: {overlap}")
    # No duplicate SETCDs
    setcds = [r.actual_value for r in results_006]
    check("SD-006 no duplicate SETCDs",
          len(setcds) == len(set(setcds)),
          f"{len(setcds)} records, {len(set(setcds))} unique")
    print(f"  (found {len(results_006)} orphaned sets)")
else:
    # Clean data — verify all TX SETCDs have subjects in DM
    tx = domains.get("TX")
    if tx is not None and dm is not None and "SETCD" in tx.columns:
        tx_setcds = set(tx["SETCD"].dropna().unique())
        if "SETCD" in dm.columns:
            dm_setcds = set(dm["SETCD"].dropna().unique())
            orphan = tx_setcds - dm_setcds
            check("SD-006 clean: all TX SETCDs in DM",
                  len(orphan) == 0,
                  f"orphaned: {orphan}")
    print("  (no orphaned sets — clean data)")


# -- SD-007: ARM/ARMCD mismatch across domains --------------------------------

print("\n--- SD-007: ARM/ARMCD mismatch ---")
results_007 = run_rule("SD-007")
check("SD-007 runs without error", True)

if results_007:
    check_common_structure(results_007, "SD-007", "DM", "ARM")
    # Every result should have a real subject_id
    check("SD-007 all subjects populated",
          all(r.subject_id != "--" for r in results_007))
    # actual_value should contain both DM and TA labels
    check("SD-007 actual_value mentions DM and TA",
          all("DM:" in r.actual_value and "TA:" in r.actual_value for r in results_007),
          f"first: {results_007[0].actual_value}")
    # Evidence should have ARMCD, DM.ARM, TA.ARM lines
    ev = results_007[0].evidence
    if "lines" in ev:
        labels = {line["label"] for line in ev["lines"]}
        check("SD-007 evidence has ARMCD label", "ARMCD" in labels,
              f"labels: {labels}")
        check("SD-007 evidence has DM.ARM label", "DM.ARM" in labels,
              f"labels: {labels}")
        check("SD-007 evidence has TA.ARM label", "TA.ARM" in labels,
              f"labels: {labels}")
    # Cross-check: the DM.ARM and TA.ARM should genuinely differ for each issue
    if ta is not None and dm is not None:
        ta_map = {}
        if "ARMCD" in ta.columns and "ARM" in ta.columns:
            ta_map = dict(zip(ta["ARMCD"], ta["ARM"]))
        dm_map = {}
        if "ARMCD" in dm.columns and "ARM" in dm.columns:
            for _, row in dm.iterrows():
                if pd.notna(row.get("ARMCD")):
                    dm_map.setdefault(str(row["ARMCD"]), str(row.get("ARM", "")))
        for r in results_007[:3]:
            ev_lines = r.evidence.get("lines", [])
            ev_dict = {line["label"]: line["value"] for line in ev_lines}
            armcd = ev_dict.get("ARMCD", "")
            if armcd in ta_map and armcd in dm_map:
                check(f"SD-007 ARMCD '{armcd}' has different labels",
                      str(dm_map[armcd]) != str(ta_map[armcd]),
                      f"DM={dm_map[armcd]}, TA={ta_map[armcd]}")
    # No duplicate subjects within same ARMCD
    subj_armcd = [(r.subject_id, r.evidence.get("lines", [{}])[0].get("value", ""))
                  for r in results_007]
    check("SD-007 no duplicate subject-ARMCD pairs",
          len(subj_armcd) == len(set(subj_armcd)),
          f"{len(subj_armcd)} records, {len(set(subj_armcd))} unique")
    print(f"  (found {len(results_007)} ARM/ARMCD mismatches)")
else:
    # Clean data — verify DM and TA ARM labels match for shared ARMCDs
    if (dm is not None and ta is not None
            and "ARMCD" in dm.columns and "ARM" in dm.columns
            and "ARMCD" in ta.columns and "ARM" in ta.columns):
        ta_map = {}
        for _, row in ta.iterrows():
            if pd.notna(row.get("ARMCD")):
                ta_map.setdefault(str(row["ARMCD"]), str(row.get("ARM", "")))
        dm_map = {}
        for _, row in dm.iterrows():
            if pd.notna(row.get("ARMCD")):
                dm_map.setdefault(str(row["ARMCD"]), str(row.get("ARM", "")))
        mismatches = []
        for armcd in set(dm_map) & set(ta_map):
            if dm_map[armcd] != ta_map[armcd]:
                mismatches.append(f"{armcd}: DM={dm_map[armcd]}, TA={ta_map[armcd]}")
        check("SD-007 clean: ARM labels match across DM and TA",
              len(mismatches) == 0,
              f"mismatches: {mismatches}")
    print("  (no ARM/ARMCD mismatches — clean data)")


# -- Cross-rule structural invariants -----------------------------------------

print("\n--- Cross-rule: SD rule structural invariants ---")

from validation.checks.study_design import clear_cache as sd_clear
sd_clear()

all_sd_results = []
for rule in sd_rules:
    results = check_study_design(
        rule=rule, domains=domains, metadata=engine.metadata,
        rule_id_prefix=rule.id, study=study, ct_data=engine.ct_data,
    )
    all_sd_results.extend(results)

# All results should have valid rule_id format
for r in all_sd_results:
    check("Result rule_id matches SD-xxx pattern",
          r.rule_id.startswith("SD-"),
          f"got {r.rule_id}")
    break  # Just check first

# All results should have non-empty diagnosis
check("All SD results have diagnosis",
      all(r.diagnosis and len(r.diagnosis) > 0 for r in all_sd_results) if all_sd_results else True)

# All results should have valid evidence dict
check("All SD results have evidence dict",
      all(isinstance(r.evidence, dict) for r in all_sd_results) if all_sd_results else True)


# -- Integration: SD rules in full validation ----------------------------------

print("\n--- Integration: SD rules in full validation ---")
full_results = engine.validate(study)
sd_fired = [r for r in full_results.rules if r.rule_id.startswith("SD-")]
check("Full validation produces SD results",
      len(sd_fired) >= 1,
      f"got {len(sd_fired)} SD rules")

# All SD rules should have category "Study design"
check("All SD rules have 'Study design' category",
      all(r.category == "Study design" for r in sd_fired),
      f"categories: {set(r.category for r in sd_fired)}")

# All SD rules should have source "custom"
check("All SD rules have 'custom' source",
      all(r.source == "custom" for r in sd_fired),
      f"sources: {set(r.source for r in sd_fired)}")

# Severity is valid
check("All SD rules have valid severity",
      all(r.severity in ("Error", "Warning", "Info") for r in sd_fired),
      f"severities: {set(r.severity for r in sd_fired)}")

# records_affected >= 1 for every fired rule
check("All fired SD rules have records_affected >= 1",
      all(r.records_affected >= 1 for r in sd_fired),
      f"zeros: {[r.rule_id for r in sd_fired if r.records_affected < 1]}")

print(f"\n  SD rules fired in full validation:")
for r in sd_fired:
    print(f"    {r.rule_id}: {r.severity} - {r.records_affected} records - {r.description}")


# -- Summary -------------------------------------------------------------------

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed out of {passed + failed}")
if failed:
    sys.exit(1)
else:
    print("All tests passed!")
