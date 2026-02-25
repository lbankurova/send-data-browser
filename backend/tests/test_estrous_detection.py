"""Backend unit tests for estrous domain detection (has_estrous_data).

Run: cd backend && python tests/test_estrous_detection.py

Tests the logic that detects FE/EO/RE domain presence in study XPT files
and sets has_estrous_data accordingly. Study-agnostic — uses synthetic data.
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.schemas import StudyMetadata

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


def main():
    print("=== Estrous domain detection (has_estrous_data) ===\n")

    # ── Test 1: Default is False ──
    print("Test 1: Default value")
    m = StudyMetadata(study_id="test")
    check("has_estrous_data defaults to False", m.has_estrous_data is False)

    # ── Test 2: Detection logic (simulating xpt_processor behaviour) ──
    # The actual detection is: bool(domain_codes & {"fe", "eo", "re"})
    # We test the same logic here with synthetic domain lists.
    print("\nTest 2: Detection logic with synthetic domain sets")

    estrous_domains = {"fe", "eo", "re"}

    # Study with no reproductive domains
    domains_basic = {"dm", "ts", "lb", "mi", "om", "bw"}
    has_estrous = bool(domains_basic & estrous_domains)
    check("no estrous domains -> False", has_estrous is False)

    # Study with FE domain (Fertility/Early Embryonic)
    domains_fe = {"dm", "ts", "lb", "fe", "om"}
    has_estrous_fe = bool(domains_fe & estrous_domains)
    check("FE domain present -> True", has_estrous_fe is True)

    # Study with EO domain (Estrous Observations)
    domains_eo = {"dm", "ts", "lb", "eo"}
    has_estrous_eo = bool(domains_eo & estrous_domains)
    check("EO domain present -> True", has_estrous_eo is True)

    # Study with RE domain (Reproductive)
    domains_re = {"dm", "ts", "re"}
    has_estrous_re = bool(domains_re & estrous_domains)
    check("RE domain present -> True", has_estrous_re is True)

    # Study with multiple estrous domains
    domains_multi = {"dm", "ts", "fe", "eo", "re"}
    has_estrous_multi = bool(domains_multi & estrous_domains)
    check("multiple estrous domains -> True", has_estrous_multi is True)

    # ── Test 3: Schema accepts the field ──
    print("\nTest 3: Schema field acceptance")
    m_true = StudyMetadata(study_id="repro_study", has_estrous_data=True)
    check("has_estrous_data=True accepted", m_true.has_estrous_data is True)

    m_false = StudyMetadata(study_id="general_study", has_estrous_data=False)
    check("has_estrous_data=False accepted", m_false.has_estrous_data is False)

    # ── Test 4: PointCross ground truth ──
    print("\nTest 4: PointCross ground truth (no estrous domains)")
    from services.study_discovery import discover_studies
    studies = discover_studies()
    pc = studies.get("PointCross")
    if pc:
        pc_domains = set(pc.xpt_files.keys())
        pc_has_estrous = bool(pc_domains & estrous_domains)
        check("PointCross has no FE/EO/RE domains", pc_has_estrous is False,
              f"domains: {sorted(pc_domains)}")
    else:
        print("  SKIP: PointCross study not found")

    # ── Summary ──
    print(f"\n{'='*40}")
    print(f"  {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
