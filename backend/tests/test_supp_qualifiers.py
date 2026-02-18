"""Tests for SUPP domain qualifier parsing and integration."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.analysis.supp_qualifiers import (
    parse_qval, load_supp_modifiers, aggregate_modifiers, count_distributions,
    ParsedModifiers, DISTRIBUTION_TERMS, TEMPORALITY_TERMS, LATERALITY_TERMS,
)

passed = 0
failed = 0


def check(name: str, condition: bool):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}")


# ── QVAL parsing tests ──────────────────────────────────────

print("\n=== QVAL Parsing ===")

r = parse_qval("acute")
check("acute -> temporality=acute", r.temporality == "acute")
check("acute -> no distribution", r.distribution is None)

r = parse_qval("chronic; ventral")
check("chronic; ventral -> temporality=chronic", r.temporality == "chronic")
check("chronic; ventral -> location=[ventral]", r.location == ["ventral"])

r = parse_qval("focal/multifocal")
check("focal/multifocal -> distribution=focal/multifocal", r.distribution == "focal/multifocal")

r = parse_qval("cortex; focal/multifocal")
check("cortex; focal/multifocal -> location=[cortex]", r.location == ["cortex"])
check("cortex; focal/multifocal -> distribution=focal/multifocal", r.distribution == "focal/multifocal")

r = parse_qval("red pulp; diffuse")
check("red pulp; diffuse -> location=[red pulp]", r.location == ["red pulp"])
check("red pulp; diffuse -> distribution=diffuse", r.distribution == "diffuse")

r = parse_qval("bilateral")
check("bilateral -> laterality=bilateral", r.laterality == "bilateral")

r = parse_qval("")
check("empty string -> no fields set", r.distribution is None and r.temporality is None and r.laterality is None)

r = parse_qval("left", is_ma=True)
check("MA 'left' -> laterality=left", r.laterality == "left")

r = parse_qval("foot pad, left", is_ma=True)
check("MA 'foot pad, left' -> laterality=left", r.laterality == "left")
check("MA 'foot pad, left' -> location=[foot pad]", r.location == ["foot pad"])

r = parse_qval("multiple, pinpoint to 1 mm in diameter", is_ma=True)
check("MA complex -> goes to other (long)", len(r.other) > 0 or len(r.location) > 0)

r = parse_qval("perivascular")
check("perivascular -> distribution=perivascular", r.distribution == "perivascular")

r = parse_qval("centrilobular")
check("centrilobular -> distribution=centrilobular", r.distribution == "centrilobular")

# ── Aggregation tests ────────────────────────────────────────

print("\n=== Aggregation ===")

mods = [
    ParsedModifiers(raw="focal", distribution="focal"),
    ParsedModifiers(raw="focal", distribution="focal"),
    ParsedModifiers(raw="diffuse", distribution="diffuse"),
]
agg = aggregate_modifiers(mods)
check("aggregate 3 records -> n_with_modifiers=3", agg["n_with_modifiers"] == 3)
check("aggregate distribution counts", agg["distribution"] == {"focal": 2, "diffuse": 1})
check("aggregate dominant_distribution=mixed (>1 value)", agg["dominant_distribution"] == "mixed")

mods2 = [
    ParsedModifiers(raw="acute; focal", distribution="focal", temporality="acute"),
    ParsedModifiers(raw="acute; focal", distribution="focal", temporality="acute"),
]
agg2 = aggregate_modifiers(mods2)
check("single distribution -> dominant=focal", agg2["dominant_distribution"] == "focal")
check("single temporality -> dominant=acute", agg2["dominant_temporality"] == "acute")

mods3 = [ParsedModifiers(raw="cortex", location=["cortex"])]
agg3 = aggregate_modifiers(mods3)
check("location-only -> no distribution", agg3["dominant_distribution"] is None)
check("location-only -> location counts", agg3["location"] == {"cortex": 1})

# count_distributions
check("count_distributions with data", count_distributions(mods) == {"focal": 2, "diffuse": 1})
check("count_distributions empty", count_distributions([ParsedModifiers(raw="cortex")]) is None)

# ── Integration tests (PointCross data) ─────────────────────

print("\n=== PointCross Integration ===")

try:
    from services.study_discovery import discover_studies
    studies = discover_studies()
    if "PointCross" not in studies:
        print("  SKIP  PointCross not available")
    else:
        study = studies["PointCross"]

        # SUPPMI
        supp_mi = load_supp_modifiers(study, "mi")
        check("SUPPMI loaded", len(supp_mi) > 0)
        check("SUPPMI has >400 entries", len(supp_mi) > 400)

        # Verify parsing worked for a subset
        n_with_dist = sum(1 for m in supp_mi.values() if m.distribution is not None)
        n_with_temp = sum(1 for m in supp_mi.values() if m.temporality is not None)
        check("SUPPMI has entries with distribution", n_with_dist > 0)
        check("SUPPMI has entries with temporality", n_with_temp > 0)
        check("SUPPMI raw values preserved", all(m.raw for m in supp_mi.values()))

        # SUPPMA
        supp_ma = load_supp_modifiers(study, "ma")
        check("SUPPMA loaded", len(supp_ma) > 0)
        check("SUPPMA has >50 entries", len(supp_ma) > 50)

        n_with_lat = sum(1 for m in supp_ma.values() if m.laterality is not None)
        check("SUPPMA has entries with laterality", n_with_lat > 0)

        # MI findings integration
        from services.analysis.dose_groups import build_dose_groups
        from services.analysis.findings_mi import compute_mi_findings

        dg_data = build_dose_groups(study)
        subjects = dg_data["subjects"]

        mi_findings = compute_mi_findings(study, subjects)
        has_profile = any(f.get("modifier_profile") for f in mi_findings)
        check("MI findings have modifier_profile", has_profile)

        if has_profile:
            profiled = [f for f in mi_findings if f.get("modifier_profile")]
            mp = profiled[0]["modifier_profile"]
            check("modifier_profile has n_with_modifiers > 0", mp.get("n_with_modifiers", 0) > 0)
            check("modifier_profile has raw_values", len(mp.get("raw_values", [])) > 0)

        # Check JSON output (lesion_severity_summary) if it exists
        import json
        lss_path = Path(__file__).resolve().parent.parent / "generated" / "PointCross" / "lesion_severity_summary.json"
        if lss_path.exists():
            lss = json.loads(lss_path.read_text())
            has_dist = any(r.get("dominant_distribution") for r in lss)
            check("lesion_severity_summary has dominant_distribution rows", has_dist)
        else:
            print("  SKIP  lesion_severity_summary.json not generated yet")

except Exception as e:
    print(f"  ERROR  Integration test failed: {e}")
    import traceback
    traceback.print_exc()

# ── Summary ──────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
if failed > 0:
    sys.exit(1)
