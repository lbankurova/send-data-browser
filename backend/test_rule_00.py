"""
Test script for Rule 0 (discrepancy detection)

Tests against mock data with intentional discrepancies:
- PC201905: NOAEL + LOAEL + target organ discrepancies
- PC201708: Target organ discrepancy only
- PC201802: No discrepancies (all match)
"""

from services.study_metadata_service import get_study_metadata_service
from services.insights_engine import rule_00_discrepancy


def test_pc201905():
    """PC201905 should generate 3 discrepancy insights"""
    print("\n=== Testing PC201905 (Pre-Submission) ===")
    print("Expected: 3 insights (target organs + NOAEL + LOAEL)")

    service = get_study_metadata_service()
    study = service.get_study("PC201905")

    if not study:
        print("[FAIL] Study PC201905 not found")
        return False

    insights = rule_00_discrepancy(study)
    print(f"\nGenerated {len(insights)} insights:")

    for i, insight in enumerate(insights, 1):
        print(f"\n{i}. {insight.title}")
        print(f"   Priority: {insight.priority}")
        print(f"   Rule: {insight.rule}")
        print(f"   Detail: {insight.detail[:100]}...")
        print(f"   Ref Study: {insight.ref_study}")

    # Verify expectations
    assert len(insights) == 3, f"Expected 3 insights, got {len(insights)}"

    # Check for NOAEL discrepancy
    noael_insights = [i for i in insights if "NOAEL" in i.title]
    assert len(noael_insights) == 1, "Expected 1 NOAEL discrepancy"
    assert "3" in noael_insights[0].detail, "Expected reported NOAEL of 3"
    assert "1" in noael_insights[0].detail, "Expected derived NOAEL of 1"
    assert "Statistical analysis is more conservative" in noael_insights[0].detail

    # Check for LOAEL discrepancy
    loael_insights = [i for i in insights if "LOAEL" in i.title]
    assert len(loael_insights) == 1, "Expected 1 LOAEL discrepancy"

    # Check for target organ discrepancy
    organ_insights = [i for i in insights if "Target Organ" in i.title]
    assert len(organ_insights) == 1, "Expected 1 target organ discrepancy"
    assert "ADRENAL" in organ_insights[0].detail, "Expected ADRENAL in discrepancy"

    # All should be self-referencing (ref_study=None)
    assert all(i.ref_study is None for i in insights), "All should be self-referencing"

    # All should be priority 0
    assert all(i.priority == 0 for i in insights), "All should be priority 0"

    print("\n[PASS] PC201905 test passed!")
    return True


def test_pc201708():
    """PC201708 should generate 1 target organ discrepancy insight"""
    print("\n=== Testing PC201708 (Submitted) ===")
    print("Expected: 1 insight (target organs only)")

    service = get_study_metadata_service()
    study = service.get_study("PC201708")

    if not study:
        print("[FAIL] Study PC201708 not found")
        return False

    insights = rule_00_discrepancy(study)
    print(f"\nGenerated {len(insights)} insights:")

    for i, insight in enumerate(insights, 1):
        print(f"\n{i}. {insight.title}")
        print(f"   Priority: {insight.priority}")
        print(f"   Rule: {insight.rule}")
        print(f"   Detail: {insight.detail[:100]}...")

    # Verify expectations
    assert len(insights) == 1, f"Expected 1 insight, got {len(insights)}"
    assert "HEMATOPOIETIC SYSTEM" in insights[0].detail, "Expected HEMATOPOIETIC SYSTEM in discrepancy"
    assert insights[0].ref_study is None, "Should be self-referencing"
    assert insights[0].priority == 0, "Should be priority 0"

    print("\n[PASS] PC201708 test passed!")
    return True


def test_pc201802():
    """PC201802 should generate 0 discrepancy insights (all match)"""
    print("\n=== Testing PC201802 (Submitted) ===")
    print("Expected: 0 insights (reported and derived match)")

    service = get_study_metadata_service()
    study = service.get_study("PC201802")

    if not study:
        print("[FAIL] Study PC201802 not found")
        return False

    insights = rule_00_discrepancy(study)
    print(f"\nGenerated {len(insights)} insights")

    # Verify expectations
    assert len(insights) == 0, f"Expected 0 insights, got {len(insights)}"

    print("\n[PASS] PC201802 test passed!")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Rule 0: Discrepancy Detection Test Suite")
    print("=" * 60)

    results = []
    results.append(("PC201905", test_pc201905()))
    results.append(("PC201708", test_pc201708()))
    results.append(("PC201802", test_pc201802()))

    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for study, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{study}: {status}")

    all_passed = all(passed for _, passed in results)
    if all_passed:
        print("\nAll tests passed!")
    else:
        print("\nSome tests failed")

    exit(0 if all_passed else 1)
