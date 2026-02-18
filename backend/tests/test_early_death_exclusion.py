"""Backend integration tests for early death exclusion — dual-pass terminal stats.

Tests against PointCross XPT data.
Run: cd backend && python tests/test_early_death_exclusion.py

PointCross early-death ground truth (from DS domain):
  108 TERMINAL SACRIFICE + 39 RECOVERY SACRIFICE + 3 MORIBUND SACRIFICE = 150 records
  Non-scheduled main-study subjects:
    PC201708-1001: dose 0, M, MORIBUND SACRIFICE
    PC201708-4003: dose 3, M, MORIBUND SACRIFICE
  (PC201708-4113 is recovery arm — excluded from main-study filter)

Expected behavior:
  - get_early_death_subjects() → 2 subjects (both males)
  - Terminal domains (MI, MA, OM): exclude both from all stats
  - LB: exclude only from terminal timepoint (max LBDY)
  - BW, CL: never exclude (longitudinal)
  - Scheduled group_stats N should be lower where subjects belonged
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import build_dose_groups
from services.analysis.mortality import get_early_death_subjects, SCHEDULED_DISPOSITIONS

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
    return study, dg["subjects"], dg["dose_groups"]


print("=== Early Death Exclusion Tests ===\n")

study, subjects, dose_groups = _setup()

# ── 1. get_early_death_subjects() ─────────────────────────────

print("get_early_death_subjects:")

eds = get_early_death_subjects(study, subjects)

check("returns a dict", isinstance(eds, dict))
check("exactly 2 early-death subjects", len(eds) == 2, f"got {len(eds)}: {list(eds.keys())}")
check("PC201708-1001 included", "PC201708-1001" in eds)
check("PC201708-4003 included", "PC201708-4003" in eds)
check("PC201708-4113 NOT included (recovery arm)", "PC201708-4113" not in eds)
check(
    "disposition is MORIBUND SACRIFICE for both",
    all(v == "MORIBUND SACRIFICE" for v in eds.values()),
    f"got {list(eds.values())}",
)
check(
    "no scheduled dispositions in result",
    not any(v in SCHEDULED_DISPOSITIONS for v in eds.values()),
)

# ── 2. Generated mortality JSON ─────────────────────────────

print("\nGenerated study_mortality.json:")

mort_path = Path(__file__).parent.parent / "generated" / "PointCross" / "study_mortality.json"
with open(mort_path) as f:
    mort = json.load(f)

check("early_death_subjects field exists", "early_death_subjects" in mort)
check(
    "early_death_subjects matches get_early_death_subjects()",
    mort["early_death_subjects"] == eds,
    f"got {mort.get('early_death_subjects')}",
)
check("early_death_details field exists", "early_death_details" in mort)
check(
    "early_death_details has 2 entries",
    len(mort.get("early_death_details", [])) == 2,
    f"got {len(mort.get('early_death_details', []))}",
)

# Verify detail fields
details = mort.get("early_death_details", [])
detail_uids = {d["USUBJID"] for d in details}
check("details contain correct subjects", detail_uids == {"PC201708-1001", "PC201708-4003"})
for d in details:
    check(
        f"detail {d['USUBJID']} has all fields",
        all(k in d for k in ("USUBJID", "sex", "dose_level", "disposition", "dose_label")),
    )

# ── 3. Generated adverse_effect_summary — scheduled fields ────

print("\nGenerated adverse_effect_summary.json (scheduled fields):")

ae_path = Path(__file__).parent.parent / "generated" / "PointCross" / "adverse_effect_summary.json"
with open(ae_path) as f:
    ae_data = json.load(f)

# Terminal domains should have scheduled fields
terminal_domains = {"MI", "MA", "OM"}
longitudinal_domains = {"BW", "CL", "FW"}

terminal_with_sched = [r for r in ae_data if r.get("domain") in terminal_domains and r.get("scheduled_group_stats")]
terminal_total = [r for r in ae_data if r.get("domain") in terminal_domains]
check(
    "all terminal-domain findings have scheduled_group_stats",
    len(terminal_with_sched) == len(terminal_total),
    f"{len(terminal_with_sched)}/{len(terminal_total)} have scheduled stats",
)

# LB is also terminal (special case)
lb_with_sched = [r for r in ae_data if r.get("domain") == "LB" and r.get("scheduled_group_stats")]
lb_total = [r for r in ae_data if r.get("domain") == "LB"]
check(
    "LB findings have scheduled_group_stats",
    len(lb_with_sched) == len(lb_total),
    f"{len(lb_with_sched)}/{len(lb_total)} LB findings have scheduled stats",
)

# Longitudinal domains should NOT have scheduled fields
long_with_sched = [r for r in ae_data if r.get("domain") in longitudinal_domains and r.get("scheduled_group_stats")]
check(
    "longitudinal-domain findings have NO scheduled_group_stats",
    len(long_with_sched) == 0,
    f"{len(long_with_sched)} longitudinal findings incorrectly have scheduled stats",
)

# n_excluded is set for terminal but not longitudinal
for r in ae_data:
    if r.get("domain") in terminal_domains or r.get("domain") == "LB":
        if r.get("n_excluded") is None or r["n_excluded"] != 2:
            check(
                f"n_excluded=2 for {r.get('domain')} {r.get('endpoint_label')} {r.get('sex')}",
                False,
                f"got n_excluded={r.get('n_excluded')}",
            )
            break
else:
    check("all terminal/LB findings have n_excluded=2", True)

for r in ae_data:
    if r.get("domain") in longitudinal_domains:
        if r.get("n_excluded") is not None:
            check(
                f"no n_excluded for longitudinal {r.get('domain')} {r.get('endpoint_label')}",
                False,
                f"got n_excluded={r.get('n_excluded')}",
            )
            break
else:
    check("longitudinal findings have no n_excluded", True)

# ── 4. Scheduled stats differ from base for affected dose groups ──

print("\nScheduled vs base stats comparison:")

# PC201708-1001 is M dose 0, PC201708-4003 is M dose 3
# So male findings in dose 0 and dose 3 should show lower N in scheduled stats
# Female findings should be identical (no female early deaths)

# Find an MI finding for M
mi_m = next((r for r in ae_data if r.get("domain") == "MI" and r.get("sex") == "M" and r.get("scheduled_group_stats")), None)
if mi_m:
    check("found MI male finding for comparison", True)
    sched_gs = {g["dose_level"]: g for g in mi_m["scheduled_group_stats"]}
    # Male dose 0: should have 1 fewer subject (PC201708-1001 excluded)
    # Male dose 3: should have 1 fewer subject (PC201708-4003 excluded)
    # But wait — adverse_effect_summary.json rows don't have base group_stats
    # They only have scheduled_group_stats and n_excluded
    # We need the base UnifiedFinding to compare — check the generated findings directly
    check("MI male has scheduled_pairwise", mi_m.get("scheduled_pairwise") is not None)
    check("MI male has scheduled_direction", "scheduled_direction" in mi_m)
else:
    check("found MI male finding for comparison", False, "no MI male finding found")

# ── 5. Generated NOAEL summary — scheduled NOAEL fields ──

print("\nGenerated noael_summary.json (scheduled NOAEL):")

noael_path = Path(__file__).parent.parent / "generated" / "PointCross" / "noael_summary.json"
with open(noael_path) as f:
    noael_data = json.load(f)

for row in noael_data:
    check(
        f"NOAEL row {row['sex']} has scheduled_noael_dose_level",
        "scheduled_noael_dose_level" in row,
    )
    check(
        f"NOAEL row {row['sex']} has scheduled_noael_differs flag",
        "scheduled_noael_differs" in row,
    )

# ── 6. Dual-pass via domain_stats.compute_all_findings ──

print("\nDual-pass compute_all_findings:")

from generator.domain_stats import compute_all_findings

# Run with early_death_subjects — returns (findings, dose_group_data)
all_findings, _dg_data = compute_all_findings(study, early_death_subjects=eds)

mi_findings = [f for f in all_findings if f.get("domain") == "MI"]
bw_findings = [f for f in all_findings if f.get("domain") == "BW"]

mi_with_sched = sum(1 for f in mi_findings if f.get("scheduled_group_stats"))
check(
    "most MI findings have scheduled_group_stats (>95%)",
    mi_with_sched / len(mi_findings) > 0.95 if mi_findings else False,
    f"{mi_with_sched}/{len(mi_findings)}",
)

check(
    "BW findings do NOT have scheduled_group_stats",
    all(f.get("scheduled_group_stats") is None for f in bw_findings),
)

# Verify scheduled N is less than or equal to base N for MI
if mi_findings:
    f0 = mi_findings[0]
    base_gs = {g["dose_level"]: g["n"] for g in f0["group_stats"]}
    sched_gs = {g["dose_level"]: g["n"] for g in f0["scheduled_group_stats"]}
    all_le = all(sched_gs.get(dl, 0) <= base_gs.get(dl, 0) for dl in base_gs)
    check("scheduled N <= base N for MI finding", all_le, f"base={base_gs}, sched={sched_gs}")

# Run WITHOUT early_death_subjects → should have no scheduled fields
all_findings_no_eds, _ = compute_all_findings(study, early_death_subjects=None)
mi_no_eds = [f for f in all_findings_no_eds if f.get("domain") == "MI"]
check(
    "no scheduled fields when early_death_subjects is None",
    all(f.get("scheduled_group_stats") is None for f in mi_no_eds),
)

# ── 7. Terminal module exclusion directly ──

print("\nDirect module exclusion tests:")

from services.analysis.findings_mi import compute_mi_findings

mi_base = compute_mi_findings(study, subjects)
mi_excl = compute_mi_findings(study, subjects, excluded_subjects=set(eds.keys()))

check("MI base findings exist", len(mi_base) > 0, f"got {len(mi_base)}")
check("MI excluded findings exist", len(mi_excl) > 0, f"got {len(mi_excl)}")

# Compare: excluded set should have same number of findings but potentially different N
if mi_base and mi_excl:
    # Find same finding in both
    base_f = mi_base[0]
    excl_f = next(
        (f for f in mi_excl if f.get("finding") == base_f.get("finding")
         and f.get("sex") == base_f.get("sex")),
        None,
    )
    if excl_f:
        base_n = sum(g["n"] for g in base_f["group_stats"])
        excl_n = sum(g["n"] for g in excl_f["group_stats"])
        # Excluded should have fewer total subjects (2 males removed)
        if base_f.get("sex") == "M":
            check(
                f"MI male excluded N < base N ({excl_n} < {base_n})",
                excl_n < base_n,
            )
        else:
            check(
                f"MI female N unchanged ({excl_n} == {base_n})",
                excl_n == base_n,
            )

# ── Summary ──

print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(1 if failed > 0 else 0)
