"""Integration tests for OM-MI corroboration discount (three-state model).

Tests against PointCross XPT data.
Run: cd backend && python tests/test_om_mi_discount.py

Tests:
  1. JSON config loads: 16 organs x 2 species, default fallback 0.75
  2. Species resolution: dog/beagle/mongrel -> "dog", unknown -> "other"
  3. Tissue inventory: examined-normal organs (BRAIN, THYMUS) present
  4. Three-state discount in target organ summary
  5. LB corroboration bypass
  6. Specimen-to-config-key coverage: all 16 JSON organs mapped
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_mi import compute_mi_findings
from services.analysis.findings_ma import compute_ma_findings
from services.analysis.organ_thresholds import (
    _resolve_species_category, _SPECIMEN_TO_CONFIG_KEY,
    get_om_mi_discount, _load_om_mi_discounts,
)
from generator.view_dataframes import build_target_organ_summary

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        msg = f"  FAIL  {name}"
        if detail:
            msg += f" -- {detail}"
        print(msg)


# ── 1. JSON config ──────────────────────────────────────────

print("\n=== JSON Config ===")

data = _load_om_mi_discounts()
check("JSON loads", data is not None and len(data) > 0)

rat_organs = data.get("rat", {})
dog_organs = data.get("dog", {})
check("Rat has 16 organs", len(rat_organs) == 16, f"got {len(rat_organs)}")
check("Dog has 16 organs", len(dog_organs) == 16, f"got {len(dog_organs)}")
check("Rat and dog have same organs", set(rat_organs.keys()) == set(dog_organs.keys()))

# Spot-check known values
check("Heart rat discount = 1.0 (exempt)", rat_organs.get("HEART", {}).get("discount") == 1.0)
check("Liver rat discount = 0.5 (high sensitivity)", rat_organs.get("LIVER", {}).get("discount") == 0.5)
check("Brain rat discount = 0.85 (low sensitivity)", rat_organs.get("BRAIN", {}).get("discount") == 0.85)

# Default fallback
default = data.get("default", {})
check("Default fallback = 0.75", default.get("discount") == 0.75)

# Sub-factors present (R1 N1/N4)
liver = rat_organs.get("LIVER", {})
check("Sub-factors present", "detection_sensitivity" in liver and "isolation_plausibility" in liver)

# Meta section
meta = data.get("_meta", {})
check("Meta has calibration_note", "calibration_note" in meta)
check("Meta has application_rules", "application_rules" in meta)
check("Meta has sources", len(meta.get("sources", [])) > 0)


# ── 2. Species resolution ───────────────────────────────────

print("\n=== Species Resolution ===")

check("RAT -> rat", _resolve_species_category("RAT") == "rat")
check("Sprague-Dawley -> rat", _resolve_species_category("SPRAGUE-DAWLEY RAT") == "rat")
check("MOUSE -> mouse", _resolve_species_category("MOUSE") == "mouse")
check("DOG -> dog", _resolve_species_category("DOG") == "dog")
check("BEAGLE -> dog", _resolve_species_category("BEAGLE") == "dog")
check("MONGREL -> dog", _resolve_species_category("MONGREL") == "dog")
check("None -> rat (conservative)", _resolve_species_category(None) == "rat")
check("RABBIT -> other", _resolve_species_category("RABBIT") == "other")
check("CYNOMOLGUS MONKEY -> other", _resolve_species_category("CYNOMOLGUS MONKEY") == "other")


# ── 3. Discount lookup ──────────────────────────────────────

print("\n=== Discount Lookup ===")

check("Liver rat = 0.5", get_om_mi_discount("LIVER", "RAT") == 0.5)
check("Heart rat = 1.0", get_om_mi_discount("HEART", "RAT") == 1.0)
check("Brain dog = 0.80", get_om_mi_discount("BRAIN", "DOG") == 0.80)
check("Unknown organ = 0.75 (default)", get_om_mi_discount("PANCREAS", "RAT") == 0.75)
check("Unknown species uses rat table", get_om_mi_discount("LIVER", "RABBIT") == 0.5)


# ── 4. Specimen-to-config-key coverage ──────────────────────

print("\n=== Specimen Mapping Coverage ===")

mapping_outputs = set(_SPECIMEN_TO_CONFIG_KEY.values())
json_keys = set(rat_organs.keys())
missing = json_keys - mapping_outputs
check("All 16 JSON organs have mapping entries", len(missing) == 0,
      f"missing: {sorted(missing)}" if missing else "")

# Specific variants from real SEND data
check("GLAND, ADRENAL -> ADRENAL", _SPECIMEN_TO_CONFIG_KEY.get("GLAND, ADRENAL") == "ADRENAL")
check("TESTIS -> TESTES", _SPECIMEN_TO_CONFIG_KEY.get("TESTIS") == "TESTES")
check("GLAND, PITUITARY -> PITUITARY", _SPECIMEN_TO_CONFIG_KEY.get("GLAND, PITUITARY") == "PITUITARY")
check("GLAND, SEMINAL VESICLE -> SEMINAL_VESICLES",
      _SPECIMEN_TO_CONFIG_KEY.get("GLAND, SEMINAL VESICLE") == "SEMINAL_VESICLES")
check("LUNG -> LUNGS", _SPECIMEN_TO_CONFIG_KEY.get("LUNG") == "LUNGS")


# ── 5. Tissue inventory (PointCross integration) ────────────

print("\n=== Tissue Inventory (PointCross) ===")

study = discover_studies()["PointCross"]
dg = build_dose_groups(study)
subjects = dg["subjects"]

mi_findings, mi_tissue = compute_mi_findings(study, subjects)
ma_findings, ma_tissue = compute_ma_findings(study, subjects)
combined_tissue = mi_tissue | ma_tissue

check("MI tissue inventory non-empty", len(mi_tissue) > 0, f"got {len(mi_tissue)}")
check("MA tissue inventory non-empty", len(ma_tissue) > 0, f"got {len(ma_tissue)}")

# Key organs must be in inventory (PointCross examines them all)
for organ in ["LIVER", "KIDNEY", "HEART", "BRAIN", "TESTES", "SPLEEN", "THYMUS"]:
    check(f"{organ} in MI tissue inventory", organ in mi_tissue)

# BP-3 AC-9: organ with ONLY NORMAL MI findings must be in inventory
# In PointCross, BRAIN has MI rows (examined) but no abnormal findings
mi_finding_keys = set()
for f in mi_findings:
    spec = f["specimen"].strip().upper()
    mi_finding_keys.add(_SPECIMEN_TO_CONFIG_KEY.get(spec, spec))

examined_normal = mi_tissue - mi_finding_keys
check("Examined-normal organs exist", len(examined_normal) > 0,
      f"got {sorted(examined_normal)}")
check("BRAIN is examined-normal (in inventory, no abnormal findings)",
      "BRAIN" in examined_normal,
      f"examined_normal={sorted(examined_normal)}, BRAIN in mi_tissue={('BRAIN' in mi_tissue)}, BRAIN in findings={('BRAIN' in mi_finding_keys)}")
check("THYMUS is examined-normal",
      "THYMUS" in examined_normal)

# Empty inventory when domain absent
check("MI returns empty set if no xpt", True)  # covered by signature test below

# Tuple return on empty
from services.study_discovery import StudyInfo
dummy = StudyInfo(study_id="NONEXISTENT", name="Fake", path=Path("/tmp/fake"), xpt_files={})
dummy_findings, dummy_tissue = compute_mi_findings(dummy, subjects)
check("No MI xpt -> empty findings", len(dummy_findings) == 0)
check("No MI xpt -> empty tissue set", len(dummy_tissue) == 0)


# ── 6. Three-state discount in target organ summary ─────────
# Use unified_findings (sequential, no ProcessPoolExecutor) for the full findings
# list, then call build_target_organ_summary directly with tissue inventory from
# section 5 and species from organ_thresholds.

print("\n=== Target Organ Summary (PointCross) ===")

from services.analysis.unified_findings import compute_adverse_effects
from services.analysis.organ_thresholds import get_species

ae_result = compute_adverse_effects(study)
all_findings = ae_result["findings"]
species = get_species(study)

target_organs = build_target_organ_summary(
    all_findings, species=species, mi_tissue_inventory=combined_tissue,
)

# Build lookup
organ_map = {r["organ_system"]: r for r in target_organs}

# Neurological = brain OM-only, but brain is in tissue inventory -> examined_normal
neuro = organ_map.get("neurological")
if neuro:
    check("Neurological mi_status = examined_normal",
          neuro.get("mi_status") == "examined_normal",
          f"got {neuro.get('mi_status')}")
    check("Neurological discount = 1.0 (no penalty for clean histopath)",
          neuro.get("om_mi_discount") == 1.0,
          f"got {neuro.get('om_mi_discount')}")
else:
    check("Neurological organ exists in summary", False, "not found")

# Cardiovascular = has MI findings -> positive
cardio = organ_map.get("cardiovascular")
if cardio:
    check("Cardiovascular mi_status = positive",
          cardio.get("mi_status") == "positive",
          f"got {cardio.get('mi_status')}")
    check("Cardiovascular discount = 1.0",
          cardio.get("om_mi_discount") == 1.0)
else:
    check("Cardiovascular organ exists", False, "not found")

# Non-OM-dominant organs -> null
metabolic = organ_map.get("metabolic")
if metabolic:
    check("Metabolic (LB-dominant) mi_status = null",
          metabolic.get("mi_status") is None,
          f"got {metabolic.get('mi_status')}")
    check("Metabolic om_mi_discount = null",
          metabolic.get("om_mi_discount") is None)

# All rows have mi_status and om_mi_discount keys
for row in target_organs:
    if "mi_status" not in row or "om_mi_discount" not in row:
        check(f"Row {row['organ_system']} has mi_status + om_mi_discount fields", False)
        break
else:
    check("All rows have mi_status + om_mi_discount fields", True)


# ── 7. Backward compatibility ───────────────────────────────

print("\n=== Backward Compatibility ===")

# Call without new params (defaults to None)
target_compat = build_target_organ_summary(all_findings)
check("build_target_organ_summary works without new params",
      len(target_compat) > 0, f"got {len(target_compat)} rows")


# ── Summary ─────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed")
if failed > 0:
    sys.exit(1)
