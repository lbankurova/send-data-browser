"""
Test script for complete insights engine (Rules 0-18)

Tests against expected outputs from insights_engine_spec.md
"""

from services.study_metadata_service import get_study_metadata_service
from services.insights_engine import generate_insights


def test_pc201708_insights():
    """PC201708 (Submitted, Rat 13wk) vs PC201802 (Dog 4wk)"""
    print("\n" + "=" * 80)
    print("Testing PC201708 (Rat 13wk) - Should fire ~10 rules")
    print("=" * 80)

    service = get_study_metadata_service()
    selected = service.get_study("PC201708")
    all_studies = service.get_all_studies()

    insights = generate_insights(selected, all_studies)

    print(f"\nGenerated {len(insights)} insights:\n")

    # Group by priority
    by_priority = {}
    for insight in insights:
        if insight.priority not in by_priority:
            by_priority[insight.priority] = []
        by_priority[insight.priority].append(insight)

    for priority in sorted(by_priority.keys()):
        print(f"\n--- Priority {priority} ({len(by_priority[priority])} insights) ---")
        for insight in by_priority[priority]:
            print(f"\n{insight.rule}: {insight.title}")
            print(f"  Ref: {insight.ref_study or 'self'}")
            print(f"  Detail: {insight.detail[:120]}...")

    # Expected rules from spec
    expected_rules = [
        "discrepancy",  # Rule 0
        "cross_species_noael",  # Rule 4
        "shared_target_organ",  # Rule 5
        "novel_target_organ",  # Rule 6 (2x — both directions)
        "noael_loael_margin",  # Rule 9
        "reversibility_comparison",  # Rule 12
        "sex_specific_finding",  # Rule 14
        "route_difference",  # Rule 15
        "domain_coverage_gap",  # Rule 17
        "dose_range_context",  # Rule 18
    ]

    fired_rules = set(i.rule for i in insights)

    print(f"\n\n--- Rule Coverage Check ---")
    print(f"Expected rules to fire: {len(expected_rules)}")
    print(f"Actual rules that fired: {len(fired_rules)}")

    for rule in expected_rules:
        status = "[PASS]" if rule in fired_rules else "[FAIL]"
        count = sum(1 for i in insights if i.rule == rule)
        print(f"{status} {rule} (count: {count})")

    # Verify specific insights
    print("\n--- Specific Insight Checks ---")

    # Check discrepancy
    disc_insights = [i for i in insights if i.rule == "discrepancy"]
    if disc_insights and "HEMATOPOIETIC SYSTEM" in disc_insights[0].detail:
        print("[PASS] Discrepancy insight mentions HEMATOPOIETIC SYSTEM")
    else:
        print("[FAIL] Discrepancy insight missing or incorrect")

    # Check cross-species NOAEL
    cross_noael = [i for i in insights if i.rule == "cross_species_noael"]
    if cross_noael and "2.5x" in cross_noael[0].detail:
        print("[PASS] Cross-species NOAEL shows Dog tolerates ~2.5x higher")
    else:
        print(f"[WARN] Cross-species NOAEL may not match expected ratio")

    return len(insights)


def test_pc201905_insights():
    """PC201905 (Pre-Sub, Dog 26wk) - The discrepancy study"""
    print("\n" + "=" * 80)
    print("Testing PC201905 (Dog 26wk) - Should generate 14+ insights including discrepancies")
    print("=" * 80)

    service = get_study_metadata_service()
    selected = service.get_study("PC201905")
    all_studies = service.get_all_studies()

    insights = generate_insights(selected, all_studies)

    print(f"\nGenerated {len(insights)} insights:\n")

    # Priority 0 check
    priority_0 = [i for i in insights if i.priority == 0]
    print(f"\n--- Priority 0 (Critical/Stage-Specific) ---")
    print(f"Count: {len(priority_0)}")
    for insight in priority_0:
        print(f"  {insight.rule}: {insight.title}")
        print(f"    Detail: {insight.detail[:100]}...")

    # Discrepancy checks
    discrepancies = [i for i in priority_0 if i.rule == "discrepancy"]
    print(f"\n[CHECK] Discrepancy insights: {len(discrepancies)} (expected: 2-3)")

    if discrepancies:
        for disc in discrepancies:
            if "NOAEL" in disc.detail and "3" in disc.detail and "1" in disc.detail:
                print("  [PASS] NOAEL discrepancy found (3 vs 1)")
            elif "ADRENAL" in disc.detail:
                print("  [PASS] ADRENAL target organ discrepancy found")
            elif "LOAEL" in disc.detail:
                print("  [PASS] LOAEL discrepancy found")

    # Rule 9 (NOAEL-LOAEL margin)
    margin = [i for i in insights if i.rule == "noael_loael_margin"]
    if margin:
        print(f"\n[PASS] Rule 9 (NOAEL-LOAEL margin) fired: {margin[0].detail[:80]}")
    else:
        print("[FAIL] Rule 9 should fire")

    # Same-species trends (vs PC201802)
    same_sp_noael = [i for i in insights if i.rule == "same_species_noael_trend"]
    same_sp_loael = [i for i in insights if i.rule == "same_species_loael_trend"]

    if same_sp_noael:
        print(f"[PASS] Rule 7 (same-species NOAEL trend) fired")
    if same_sp_loael:
        print(f"[PASS] Rule 8 (same-species LOAEL trend) fired")

    # Mortality and tumor signals
    mortality = [i for i in insights if i.rule == "mortality_signal"]
    tumor = [i for i in insights if i.rule == "tumor_signal"]

    if mortality:
        print(f"[PASS] Rule 10 (mortality signal) fired: {len(mortality)} insights")
    if tumor:
        print(f"[PASS] Rule 11 (tumor signal) fired: {len(tumor)} insights")

    return len(insights)


def test_pc202103_ongoing():
    """PC202103 (Ongoing, Dog 13wk) - Should generate monitoring watchlist"""
    print("\n" + "=" * 80)
    print("Testing PC202103 (Ongoing Dog 13wk) - Should fire Rule 2 (monitoring watchlist)")
    print("=" * 80)

    service = get_study_metadata_service()
    selected = service.get_study("PC202103")
    all_studies = service.get_all_studies()

    insights = generate_insights(selected, all_studies)

    print(f"\nGenerated {len(insights)} insights\n")

    # Check for monitoring watchlist
    watchlist = [i for i in insights if i.rule == "monitoring_watchlist"]
    print(f"[CHECK] Monitoring watchlist insights: {len(watchlist)} (expected: 2)")

    for w in watchlist:
        print(f"  Ref: {w.ref_study}")
        print(f"  Detail: {w.detail[:100]}...")

    # Should NOT have discrepancy (no reported data in ongoing)
    discrepancies = [i for i in insights if i.rule == "discrepancy"]
    if not discrepancies:
        print("\n[PASS] No discrepancy insights (ongoing study has no reported data)")
    else:
        print(f"\n[FAIL] Should not have discrepancy insights, but found {len(discrepancies)}")

    return len(insights)


def test_pc202201_planned():
    """PC202201 (Planned, Dog 52wk) - Should generate dose selection insights"""
    print("\n" + "=" * 80)
    print("Testing PC202201 (Planned Dog 52wk) - Should fire Rule 1 (dose selection)")
    print("=" * 80)

    service = get_study_metadata_service()
    selected = service.get_study("PC202201")
    all_studies = service.get_all_studies()

    insights = generate_insights(selected, all_studies)

    print(f"\nGenerated {len(insights)} insights\n")

    # Check for dose selection
    dose_sel = [i for i in insights if i.rule == "dose_selection"]
    print(f"[CHECK] Dose selection insights: {len(dose_sel)}")

    for ds in dose_sel:
        print(f"  Ref: {ds.ref_study}")
        print(f"  Detail: {ds.detail[:150]}...")

    if dose_sel:
        print("\n[PASS] Dose selection rule fired for planned study")
    else:
        print("\n[WARN] Dose selection may not fire if design_rationale is missing")

    return len(insights)


def test_ax220401_single_compound():
    """AX220401 (Submitted, Rat 13wk) - Only has Rule 9 (no same-compound refs)"""
    print("\n" + "=" * 80)
    print("Testing AX220401 (Rat 13wk) - Different compound, should only fire Rule 9")
    print("=" * 80)

    service = get_study_metadata_service()
    selected = service.get_study("AX220401")
    all_studies = service.get_all_studies()

    insights = generate_insights(selected, all_studies)

    print(f"\nGenerated {len(insights)} insights\n")

    for insight in insights:
        print(f"{insight.rule}: {insight.title}")
        print(f"  Detail: {insight.detail[:100]}...")

    # Should only have Rule 9 (self-referencing)
    if len(insights) == 1 and insights[0].rule == "noael_loael_margin":
        print("\n[PASS] Only Rule 9 fired (no same-compound references)")
    else:
        rules = [i.rule for i in insights]
        print(f"\n[CHECK] Rules that fired: {rules}")

    return len(insights)


if __name__ == "__main__":
    print("=" * 80)
    print("Complete Insights Engine Test Suite (Rules 0-18)")
    print("=" * 80)

    results = {}

    try:
        results["PC201708"] = test_pc201708_insights()
    except Exception as e:
        print(f"\n[ERROR] PC201708 test failed: {e}")
        results["PC201708"] = 0

    try:
        results["PC201905"] = test_pc201905_insights()
    except Exception as e:
        print(f"\n[ERROR] PC201905 test failed: {e}")
        results["PC201905"] = 0

    try:
        results["PC202103"] = test_pc202103_ongoing()
    except Exception as e:
        print(f"\n[ERROR] PC202103 test failed: {e}")
        results["PC202103"] = 0

    try:
        results["PC202201"] = test_pc202201_planned()
    except Exception as e:
        print(f"\n[ERROR] PC202201 test failed: {e}")
        results["PC202201"] = 0

    try:
        results["AX220401"] = test_ax220401_single_compound()
    except Exception as e:
        print(f"\n[ERROR] AX220401 test failed: {e}")
        results["AX220401"] = 0

    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)

    for study, count in results.items():
        print(f"{study}: {count} insights generated")

    print("\nAll test scenarios executed!")
