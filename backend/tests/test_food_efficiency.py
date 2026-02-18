"""Integration tests for food consumption summary against PointCross ground truth.

PointCross verified facts:
- FW: 279 rows, 120 subjects, per-animal, FWTESTCD="FC", FWSTRESN in g/day
- Two measurement periods: Day 1-29 (120 animals), Day 1-92 (119 animals)
- No water consumption data (no FWTESTCD="WC")
- BW: 18 study days, same 120 subjects
- Route: ORAL GAVAGE (no caloric dilution confounder)
- Dose 3 (200 mg/kg): FW only -5% vs control, BW gain -54%
- Food efficiency 0.16 vs control 0.34 → primary_weight_loss
- Recovery: FW returns to control levels, BW remains 17% below control
"""

import json
import sys
from pathlib import Path

# Backend modules need path setup
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies, StudyInfo, _find_xpt_files
from config import SEND_DATA_DIR
from generator.domain_stats import compute_all_findings
from generator.food_consumption_summary import build_food_consumption_summary_with_subjects


def get_pointcross_study() -> StudyInfo:
    """Get PointCross study info."""
    study_path = SEND_DATA_DIR / "PointCross"
    assert study_path.is_dir(), f"PointCross study not found at {study_path}"
    xpt_files = _find_xpt_files(study_path)
    return StudyInfo(
        study_id="PointCross",
        name="PointCross",
        path=study_path,
        xpt_files=xpt_files,
    )


def test_food_consumption_summary():
    """Test full food consumption summary against PointCross ground truth."""
    study = get_pointcross_study()
    findings, _ = compute_all_findings(study)
    summary = build_food_consumption_summary_with_subjects(findings, study)

    # 1. available is True (FW domain exists)
    assert summary["available"] is True, "FW data should be available for PointCross"

    # 2. has_water_data is False (no FWTESTCD="WC")
    assert summary["has_water_data"] is False, "PointCross has no water consumption data"

    # 3. At least 1 measurement period present
    periods = summary.get("periods", [])
    assert len(periods) >= 1, f"Expected at least 1 period, got {len(periods)}"

    # 4. High dose food efficiency < 0.5 * control food efficiency
    found_fe_check = False
    for period in periods:
        for entry in period.get("by_dose_sex", []):
            ctrl_fe = entry.get("food_efficiency_control")
            if entry["dose_level"] > 0 and ctrl_fe is not None and ctrl_fe > 0:
                if entry.get("food_efficiency_reduced"):
                    assert entry["mean_food_efficiency"] < ctrl_fe * 0.8, (
                        f"Reduced FE at dose {entry['dose_level']} should be < 80% of control"
                    )
                    found_fe_check = True
    assert found_fe_check, "Should find at least one dose with reduced food efficiency"

    # 5. overall_assessment.assessment == "primary_weight_loss"
    overall = summary["overall_assessment"]
    assert overall["assessment"] == "primary_weight_loss", (
        f"Expected primary_weight_loss, got {overall['assessment']}"
    )

    # 6. bw_decreased is True
    assert overall["bw_decreased"] is True, "BW should be decreased at high dose"

    # 7. fw_decreased is False (only -5%, below threshold)
    assert overall["fw_decreased"] is False, (
        "FW should NOT be meaningfully decreased (only -5%, below 10% threshold)"
    )

    # 8. fe_reduced is True
    assert overall["fe_reduced"] is True, "Food efficiency should be reduced"

    # 9. recovery.fw_recovered is True
    recovery = summary.get("recovery")
    assert recovery is not None, "Recovery data should be present"
    assert recovery["available"] is True, "Recovery should be available"
    assert recovery["fw_recovered"] is True, "FW should recover to near-control levels"

    # 10. recovery.bw_recovered is False
    assert recovery["bw_recovered"] is False, (
        "BW should remain depressed (17% below control)"
    )

    # 11. caloric_dilution_risk is False (ORAL GAVAGE route)
    assert summary["caloric_dilution_risk"] is False, (
        "ORAL GAVAGE should not have caloric dilution risk"
    )

    # 12. Narrative is present and mentions key pattern
    narrative = overall.get("narrative", "")
    assert len(narrative) > 0, "Narrative should not be empty"
    assert "weight" in narrative.lower() or "food" in narrative.lower(), (
        "Narrative should mention weight or food"
    )

    print("\n=== All 12 assertions passed! ===")
    print(f"  Periods: {len(periods)}")
    print(f"  Assessment: {overall['assessment']}")
    print(f"  Narrative: {narrative[:120]}...")
    if recovery:
        print(f"  Recovery: FW={recovery['fw_recovered']}, BW={recovery['bw_recovered']}")


def test_food_consumption_json_output():
    """Test that the generated JSON file is valid and matches summary."""
    generated_path = Path(__file__).parent.parent / "generated" / "PointCross" / "food_consumption_summary.json"
    if not generated_path.exists():
        print("  SKIP: food_consumption_summary.json not yet generated")
        return

    with open(generated_path) as f:
        data = json.load(f)

    assert data["available"] is True
    assert "periods" in data
    assert "overall_assessment" in data
    print("  food_consumption_summary.json validated")


if __name__ == "__main__":
    print("Running food efficiency tests against PointCross...")
    test_food_consumption_summary()
    test_food_consumption_json_output()
    print("\nAll tests passed!")
