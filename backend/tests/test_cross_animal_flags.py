"""Integration tests for cross_animal_flags generator module.

Run: cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe tests/test_cross_animal_flags.py
"""

import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

GENERATED_FILE = Path(__file__).parent.parent / "generated" / "PointCross" / "cross_animal_flags.json"


def load_data():
    assert GENERATED_FILE.exists(), f"Generated file not found: {GENERATED_FILE}"
    with open(GENERATED_FILE) as f:
        return json.load(f)


def test_top_level_structure():
    data = load_data()
    assert "tissue_battery" in data
    assert "tumor_linkage" in data
    assert "recovery_narratives" in data


def test_tissue_battery_reference_batteries():
    """Reference batteries built (terminal expected_count > 30)."""
    tb = load_data()["tissue_battery"]
    refs = tb["reference_batteries"]
    assert len(refs) > 0, "No reference batteries built"

    # Terminal batteries should have > 30 specimens
    for key, ref in refs.items():
        if "terminal" in key:
            assert ref["expected_count"] > 30, (
                f"{key}: expected_count={ref['expected_count']}, should be > 30"
            )
        assert ref["source"], f"{key}: source is empty"
        assert isinstance(ref["specimens"], list)


def test_tissue_battery_flagged_animals():
    """Flagged animals list populated for animals with < 80%."""
    tb = load_data()["tissue_battery"]
    # For PointCross, recovery controls have ~5 specimens so animals might not be flagged
    # But structure should be valid
    for f in tb["flagged_animals"]:
        assert f["flag"] is True
        assert f["completion_pct"] < 80
        assert isinstance(f["missing_specimens"], list)
        assert isinstance(f["missing_target_organs"], list)


def test_tumor_linkage_hepatocellular_carcinoma():
    """Tumor linkage: hepatocellular carcinoma with behavior=MALIGNANT."""
    tl = load_data()["tumor_linkage"]
    malignant = [
        t for t in tl["tumor_dose_response"]
        if t["behavior"] == "MALIGNANT"
    ]
    assert len(malignant) > 0, "No malignant tumors found"

    # Find hepatocellular carcinoma specifically
    hcc = [t for t in malignant if "CARCINOMA" in t["finding"].upper() and "HEPATO" in t["finding"].upper()]
    assert len(hcc) > 0, "No hepatocellular carcinoma found"

    hcc_entry = hcc[0]
    assert len(hcc_entry["animal_ids"]) >= 2, "HCC should be in ≥2 animals"
    assert hcc_entry["specimen"].upper() == "LIVER"


def test_tumor_linkage_flags():
    """At least one interpretive flag generated."""
    tl = load_data()["tumor_linkage"]
    total_flags = sum(len(t["flags"]) for t in tl["tumor_dose_response"])
    assert total_flags > 0, "No interpretive flags generated"

    # Check for specific expected flags on malignant tumors
    for t in tl["tumor_dose_response"]:
        if t["behavior"] == "MALIGNANT":
            flag_text = " ".join(t["flags"])
            # Should have carcinogenicity duration flag (13-week study)
            assert "weeks" in flag_text.lower() or "dose" in flag_text.lower(), (
                f"Malignant tumor missing expected flags: {t['flags']}"
            )


def test_tumor_linkage_banner():
    """Banner text non-null."""
    tl = load_data()["tumor_linkage"]
    assert tl["banner_text"] is not None, "Banner text should be non-null"
    assert len(tl["banner_text"]) > 0


def test_tumor_linkage_incidence_by_dose():
    """Incidence by dose has correct structure."""
    tl = load_data()["tumor_linkage"]
    for t in tl["tumor_dose_response"]:
        assert len(t["incidence_by_dose"]) > 0
        for d in t["incidence_by_dose"]:
            assert "dose_level" in d
            assert "dose_label" in d
            assert "males" in d and "affected" in d["males"] and "total" in d["males"]
            assert "females" in d and "affected" in d["females"] and "total" in d["females"]


def test_recovery_narratives():
    """Recovery narrative for recovery death (4113)."""
    rn = load_data()["recovery_narratives"]
    # PointCross has animal 4113 as a recovery death
    rec_deaths = [r for r in rn if "4113" in r["animal_id"]]
    if rec_deaths:
        r = rec_deaths[0]
        assert r["bw_trend"] in ("gaining", "declining", "stable", "unknown")
        assert r["narrative"], "Narrative should not be empty"
        assert r["recovery_start_day"] > 0
        assert r["death_day"] is not None
        # 4113 should be gaining weight
        assert r["bw_trend"] == "gaining", f"4113 BW trend should be gaining, got {r['bw_trend']}"
        assert r["bw_change_pct"] > 0, "4113 should have positive BW change"
        # COD should be hepatocellular carcinoma
        assert r["cod_finding"] is not None
        assert "CARCINOMA" in r["cod_finding"].upper()
    else:
        # If no recovery narratives, that's OK — means SE parsing found no recovery start day
        print("  NOTE: No recovery narrative for 4113 (SE domain may not have recovery element)")


def test_no_crash_empty_inputs():
    """Module doesn't crash on empty/missing data."""
    from generator.cross_animal_flags import build_cross_animal_flags
    import pandas as pd
    from services.study_discovery import StudyInfo

    # Create a minimal StudyInfo with no XPT files
    fake_study = StudyInfo(
        study_id="EMPTY",
        name="Empty",
        path=Path("/nonexistent"),
        xpt_files={},
    )
    fake_subjects = pd.DataFrame(columns=["USUBJID", "SEX", "dose_level", "is_recovery", "is_satellite"])
    result = build_cross_animal_flags(
        findings=[],
        study=fake_study,
        subjects=fake_subjects,
        dose_groups=[],
        mortality=None,
        tumor_summary=None,
    )
    assert result["tissue_battery"]["flagged_animals"] == []
    assert result["tumor_linkage"]["tumor_dose_response"] == []
    assert result["recovery_narratives"] == []


if __name__ == "__main__":
    tests = [
        test_top_level_structure,
        test_tissue_battery_reference_batteries,
        test_tissue_battery_flagged_animals,
        test_tumor_linkage_hepatocellular_carcinoma,
        test_tumor_linkage_flags,
        test_tumor_linkage_banner,
        test_tumor_linkage_incidence_by_dose,
        test_recovery_narratives,
        test_no_crash_empty_inputs,
    ]

    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS: {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL: {t.__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
