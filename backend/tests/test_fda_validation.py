"""Backend integration tests for FDA data quality rules (FDA-001 through FDA-007).

Tests against PointCross XPT data.
Run: cd backend && python tests/test_fda_validation.py

PointCross ground truth (verified from XPT exploration):
  FDA-001: KETONES has 3 distinct integer values (5, 15, 50) — semiquantitative
           urinalysis dipstick data in numeric field.  1 test flagged.
  FDA-002: VISITDY and --DY are perfectly aligned across all 4 domains
           (LB, CL, EG, BW).  0 misalignment issues (clean data).
  FDA-003: PC has 10 BQL rows (PCSTRESN=NaN, PCLLOQ=20.0).
           SUPPPC does not exist.  All 10 flagged.
  FDA-004: DSDECOD values: TERMINAL SACRIFICE (108), RECOVERY SACRIFICE (39),
           MORIBUND SACRIFICE (3) — all in NCOMPLT codelist.
           EG.EGTESTCD: PRAG, QTCBAG, RRAG — all valid.  0 issues.
  FDA-005: 3 moribund subjects.  Terminal day=92.
           PC201708-1001 died day 30 (gap=62) → flagged.
           PC201708-4003 died day 90 (gap=2) → NOT flagged.
           PC201708-4113 died day 100 (gap=-8) → NOT flagged.
           Exactly 1 early-death flag.
  FDA-006: All SE.ETCD values match TA.  All DM subjects have SE records.
           0 issues (clean data).
  FDA-007: EGMETHOD empty for all 354 EG rows.  QTcB only.
           Species=RAT (rodent).  1 issue for empty EGMETHOD.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies, StudyInfo
from validation.engine import ValidationEngine
from validation.models import RuleDefinition

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
    return study, engine, domains


print("=== FDA Data Quality Validation Tests ===\n")

study, engine, domains = _setup()

# Load just the FDA rules
fda_rules = [r for r in engine.rules if r.parameters.get("fda_rule", "").startswith("FDA-")]
check("FDA rules loaded", len(fda_rules) == 7, f"got {len(fda_rules)}")


# ── Helper: run a single FDA rule ─────────────────────────────────

def run_rule(rule_id: str) -> list:
    rule = next((r for r in fda_rules if r.id == rule_id), None)
    if rule is None:
        return []
    from validation.checks.fda_data_quality import check_fda_data_quality
    return check_fda_data_quality(
        rule=rule,
        domains=domains,
        metadata=engine.metadata,
        rule_id_prefix=rule.id,
        study=study,
        ct_data=engine.ct_data,
    )


# ── FDA-001: Categorical data in numeric result ──────────────────

print("\n--- FDA-001: Categorical data in numeric result ---")
results_001 = run_rule("FDA-001")
check("FDA-001 runs without error", True)
# KETONES: 3 distinct integer values (5, 15, 50) — semiquantitative dipstick
check("FDA-001 flags 1 test (KETONES)", len(results_001) == 1,
      f"got {len(results_001)}")
if results_001:
    r = results_001[0]
    check("FDA-001 domain is LB", r.domain == "LB")
    check("FDA-001 variable is LBSTRESN", r.variable == "LBSTRESN")
    check("FDA-001 mentions KETONES", "KETONES" in r.actual_value,
          f"actual_value={r.actual_value}")
    check("FDA-001 evidence has 3 distinct values",
          "5, 15, 50" in r.actual_value,
          f"actual_value={r.actual_value}")


# ── FDA-002: Timing variable alignment ───────────────────────────

print("\n--- FDA-002: Timing variable alignment ---")
results_002 = run_rule("FDA-002")
check("FDA-002 runs without error", True)
# PointCross: VISITDY and --DY are perfectly aligned in all domains → 0 issues
check("FDA-002 no issues (clean data)", len(results_002) == 0,
      f"got {len(results_002)} issues: {[(r.domain, r.actual_value) for r in results_002]}")


# ── FDA-003: Below-LLOQ without imputation method ────────────────

print("\n--- FDA-003: Below-LLOQ without imputation method ---")
results_003 = run_rule("FDA-003")
check("FDA-003 runs without error", True)
check("FDA-003 finds exactly 10 BQL rows", len(results_003) == 10,
      f"expected 10, got {len(results_003)}")

if results_003:
    check("FDA-003 domain is PC", all(r.domain == "PC" for r in results_003))
    check("FDA-003 variable is PCSTRESN", all(r.variable == "PCSTRESN" for r in results_003))
    subjects_003 = {r.subject_id for r in results_003}
    check("FDA-003 has subject IDs", all(s != "--" for s in subjects_003),
          f"subjects: {subjects_003}")


# ── FDA-004: Undefined controlled terminology codes ──────────────

print("\n--- FDA-004: Undefined controlled terminology codes ---")
results_004 = run_rule("FDA-004")
check("FDA-004 runs without error", True)
# DSDECOD: all valid (TERMINAL/RECOVERY/MORIBUND SACRIFICE all in NCOMPLT)
# EGTESTCD: PRAG, QTCBAG, RRAG — all in valid set
check("FDA-004 no issues (clean CT)", len(results_004) == 0,
      f"got {len(results_004)} issues: {[(r.domain, r.variable, r.actual_value) for r in results_004]}")


# ── FDA-005: Early-death data in terminal statistics ─────────────

print("\n--- FDA-005: Early-death data in terminal statistics ---")
results_005 = run_rule("FDA-005")
check("FDA-005 runs without error", True)
# Only PC201708-1001 (day 30, gap=62) should be flagged
# PC201708-4003 (day 90, gap=2) and PC201708-4113 (day 100, gap=-8) should NOT
check("FDA-005 finds exactly 1 early death", len(results_005) == 1,
      f"got {len(results_005)}")

if results_005:
    r = results_005[0]
    check("FDA-005 subject is PC201708-1001",
          "1001" in r.subject_id,
          f"subject={r.subject_id}")
    check("FDA-005 domain is DS", r.domain == "DS")
    check("FDA-005 visit is Day 30", r.visit == "Day 30",
          f"visit={r.visit}")

    # Check evidence
    evidence_lines = r.evidence.get("lines", [])
    ev_dict = {line["label"]: line["value"] for line in evidence_lines}
    check("FDA-005 evidence has death day", ev_dict.get("Death day") == "30",
          f"got {ev_dict.get('Death day')}")
    check("FDA-005 evidence has terminal day", ev_dict.get("Terminal day") == "92",
          f"got {ev_dict.get('Terminal day')}")
    check("FDA-005 evidence has gap", ev_dict.get("Gap") == "62 days",
          f"got {ev_dict.get('Gap')}")
    check("FDA-005 evidence has affected domains",
          "Affected domains" in ev_dict,
          f"labels: {list(ev_dict.keys())}")


# ── FDA-006: Cross-domain EPOCH linking ──────────────────────────

print("\n--- FDA-006: Cross-domain EPOCH linking ---")
results_006 = run_rule("FDA-006")
check("FDA-006 runs without error", True)
# PointCross: clean epoch linking
check("FDA-006 no issues (clean data)", len(results_006) == 0,
      f"got {len(results_006)} issues")


# ── FDA-007: QTc correction documentation ────────────────────────

print("\n--- FDA-007: QTc correction documentation ---")
results_007 = run_rule("FDA-007")
check("FDA-007 runs without error", True)
# EGMETHOD empty for all 354 rows. Species=RAT (rodent). Only QTcB.
# Should flag EGMETHOD empty. Should NOT flag "single correction" since rodent.
check("FDA-007 finds exactly 1 issue (EGMETHOD)", len(results_007) == 1,
      f"got {len(results_007)} issues")

if results_007:
    r = results_007[0]
    check("FDA-007 domain is EG", r.domain == "EG")
    check("FDA-007 variable is EGMETHOD", r.variable == "EGMETHOD")
    # Evidence should note rodent species
    evidence_lines = r.evidence.get("lines", [])
    ev_dict = {line["label"]: line["value"] for line in evidence_lines}
    check("FDA-007 evidence notes species", ev_dict.get("Species") == "RAT",
          f"got {ev_dict.get('Species')}")
    check("FDA-007 evidence notes rodent", ev_dict.get("Rodent") == "Yes",
          f"got {ev_dict.get('Rodent')}")
    check("FDA-007 diagnosis mentions rodent", "rodent" in r.diagnosis.lower(),
          f"diagnosis: {r.diagnosis}")


# ── Integration: Full validation run ─────────────────────────────

print("\n--- Integration: Full validation run ---")
results = engine.validate(study)
check("Full validation completes", results is not None)

# Count SD and FDA rules that fired
sd_rules = [r for r in results.rules if r.rule_id.startswith("SD-")]
fda_rules_fired = [r for r in results.rules if r.rule_id.startswith("FDA-")]

check("SD rules still fire", len(sd_rules) >= 1,
      f"got {len(sd_rules)} SD rules")
check("FDA rules fire", len(fda_rules_fired) >= 1,
      f"got {len(fda_rules_fired)} FDA rules")
check("Total rules > 1", len(results.rules) > 1,
      f"got {len(results.rules)} total rules")

# Category check
fda_categories = {r.category for r in fda_rules_fired}
check("FDA rules have 'Data quality' category",
      "Data quality" in fda_categories,
      f"categories: {fda_categories}")

# Summary has correct severity counts
check("Summary has errors", isinstance(results.summary.get("errors"), int))
check("Summary has warnings", isinstance(results.summary.get("warnings"), int))
check("Summary has info", isinstance(results.summary.get("info"), int))

# Save results
cache_path = engine.save_results("PointCross", results)
check("Results saved", cache_path.exists())

# Print summary for inspection
print(f"\n  Summary: {results.summary}")
print(f"  Rules fired:")
for r in results.rules:
    print(f"    {r.rule_id}: {r.severity} - {r.records_affected} records - {r.description}")


# ── Summary ──────────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed out of {passed + failed}")
if failed:
    sys.exit(1)
else:
    print("All tests passed!")
