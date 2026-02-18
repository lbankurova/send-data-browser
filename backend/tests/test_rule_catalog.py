"""Rule catalog test — verifies all validation rules have handlers and tests.

Run: cd backend && python tests/test_rule_catalog.py

Catches automatically:
  - New YAML rule file without a CHECK_DISPATCH handler
  - New check_type without a dedicated test file
  - Orphan handlers registered but not referenced by any YAML rule
  - Rules missing required YAML fields
  - Rule output that violates structural invariants
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml
from services.study_discovery import discover_studies
from validation.engine import ValidationEngine, CHECK_DISPATCH
from validation.checks.study_design import clear_cache

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


# -- Map of check_type -> dedicated test file ---------------------------------
# When you add a new check_type, add an entry here AND create the test file.

TEST_FILE_MAP = {
    "study_design": "test_sd_validation.py",
    "fda_data_quality": "test_fda_validation.py",
}


print("=== Rule Catalog Tests ===\n")


# -- 1. Discover YAML rule files ---------------------------------------------

print("--- YAML rule discovery ---")
rules_dir = Path(__file__).parent.parent / "validation" / "rules"
yaml_files = sorted(rules_dir.glob("*.yaml"))
check("At least 1 YAML rule file exists", len(yaml_files) >= 1,
      f"looked in {rules_dir}")

all_yaml_rules = []
check_types_in_yaml = set()
rules_by_check_type: dict[str, list] = {}

for yf in yaml_files:
    with open(yf, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    rules = data.get("rules", [])
    check(f"  {yf.name}: {len(rules)} rules", len(rules) >= 1,
          f"empty rule file")
    for r in rules:
        all_yaml_rules.append(r)
        ct = r.get("check_type", "")
        check_types_in_yaml.add(ct)
        rules_by_check_type.setdefault(ct, []).append(r)

print(f"\n  Total: {len(all_yaml_rules)} rules across {len(yaml_files)} files, "
      f"{len(check_types_in_yaml)} check types")


# -- 2. Required YAML fields --------------------------------------------------

print("\n--- Rule schema validation ---")
REQUIRED_FIELDS = {"id", "name", "description", "severity", "category",
                   "applicable_domains", "check_type"}

for r in all_yaml_rules:
    missing = REQUIRED_FIELDS - set(r.keys())
    check(f"Rule {r.get('id', '???')} has required fields",
          len(missing) == 0,
          f"missing: {missing}")

# Severity values must be valid
valid_severities = {"Error", "Warning", "Info"}
for r in all_yaml_rules:
    check(f"Rule {r['id']} severity is valid",
          r["severity"] in valid_severities,
          f"got '{r['severity']}'")

# Rule IDs must be unique
rule_ids = [r["id"] for r in all_yaml_rules]
check("All rule IDs are unique",
      len(rule_ids) == len(set(rule_ids)),
      f"duplicates: {[rid for rid in rule_ids if rule_ids.count(rid) > 1]}")


# -- 3. CHECK_DISPATCH coverage -----------------------------------------------

print("\n--- Handler coverage ---")

# Every check_type in YAML has a handler
for ct in sorted(check_types_in_yaml):
    n = len(rules_by_check_type[ct])
    check(f"CHECK_DISPATCH has handler for '{ct}' ({n} rules)",
          ct in CHECK_DISPATCH,
          f"add handler to CHECK_DISPATCH in engine.py")

# No orphan handlers — every CHECK_DISPATCH entry has YAML rules
for ct in sorted(CHECK_DISPATCH.keys()):
    check(f"Handler '{ct}' has YAML rules",
          ct in check_types_in_yaml,
          f"handler registered but no YAML rules use check_type='{ct}'")


# -- 4. Dedicated test file per check_type ------------------------------------

print("\n--- Test file coverage ---")
tests_dir = Path(__file__).parent

for ct in sorted(check_types_in_yaml):
    test_file = TEST_FILE_MAP.get(ct)
    if test_file:
        check(f"Test file exists for '{ct}' ({test_file})",
              (tests_dir / test_file).exists(),
              f"{test_file} not found in {tests_dir}")
    else:
        check(f"TEST_FILE_MAP has entry for '{ct}'",
              False,
              f"add '{ct}' to TEST_FILE_MAP in test_rule_catalog.py "
              f"and create a dedicated test file")


# -- 5. Engine loads all YAML rules -------------------------------------------

print("\n--- Engine rule loading ---")
engine = ValidationEngine()

# Engine rule count matches YAML
check("Engine loads all YAML rules",
      len(engine.rules) == len(all_yaml_rules),
      f"engine has {len(engine.rules)}, YAML has {len(all_yaml_rules)}")

# Every YAML rule ID is present in engine
engine_ids = {r.id for r in engine.rules}
for r in all_yaml_rules:
    check(f"Engine has rule {r['id']}",
          r["id"] in engine_ids)


# -- 6. Run all rules — structural invariants on output -----------------------

print("\n--- Structural output invariants ---")
studies = discover_studies()
study = studies["PointCross"]
domains = engine.load_study_domains(study)
clear_cache()

rules_with_output = 0
for rule_def in engine.rules:
    records = engine._run_rule(rule_def, domains, study=study)
    if not records:
        continue
    rules_with_output += 1
    # Check first record for structural invariants
    r = records[0]
    check(f"Rule {rule_def.id} output has non-empty domain",
          isinstance(r.domain, str) and len(r.domain) > 0,
          f"domain={r.domain!r}")
    check(f"Rule {rule_def.id} output has evidence dict",
          isinstance(r.evidence, dict),
          f"type={type(r.evidence)}")
    check(f"Rule {rule_def.id} output has non-empty diagnosis",
          isinstance(r.diagnosis, str) and len(r.diagnosis) > 0)
    check(f"Rule {rule_def.id} output has valid fix_tier",
          isinstance(r.fix_tier, int) and 1 <= r.fix_tier <= 3,
          f"fix_tier={r.fix_tier}")

check("At least 1 rule produces output",
      rules_with_output >= 1,
      f"no rules fired — check study data")


# -- 7. Full engine validation round-trip -------------------------------------

print("\n--- Full validation round-trip ---")
results = engine.validate(study)
check("Full validation produces results", results is not None)
check("Results have rules list", len(results.rules) >= 1,
      f"got {len(results.rules)}")
check("Results have summary dict",
      isinstance(results.summary, dict) and "total_issues" in results.summary)

# Every fired rule has valid source
for r in results.rules:
    check(f"Fired rule {r.rule_id} has valid source",
          r.source in ("custom", "core"),
          f"source={r.source!r}")
    break  # Just check first to avoid noise

# Save/load round-trip
cache_path = engine.save_results(study.study_id, results)
check("Results saved to disk", cache_path.exists())
loaded = engine.load_cached_results(study.study_id)
check("Cached results load successfully", loaded is not None)
if loaded:
    check("Cached rule count matches",
          len(loaded.rules) == len(results.rules),
          f"saved {len(results.rules)}, loaded {len(loaded.rules)}")


# -- Summary -------------------------------------------------------------------

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed out of {passed + failed}")
if failed:
    sys.exit(1)
else:
    print("All tests passed!")
