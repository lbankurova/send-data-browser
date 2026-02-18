"""Backend integration tests for EG, VS, BG domain findings.

Tests against PointCross XPT data.
Run: cd backend && python tests/test_domain_findings.py

PointCross ground truth (from XPT):
  EG.xpt: 354 rows, 3 ECG interval tests (PRAG, QTCBAG, RRAG), 118 subjects
    Numeric range: 38–249 ms
  VS.xpt: 118 rows, 1 test (HR), 118 subjects
    Numeric range: 330–480 bpm
  BG.xpt: 676 rows, 1 test (BWGAIN), 120 subjects, longitudinal (~5.6 intervals/subject)
    Numeric range: -87 to 253 g
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.study_discovery import discover_studies
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_eg import compute_eg_findings
from services.analysis.findings_vs import compute_vs_findings
from services.analysis.findings_bg import compute_bg_findings
from generator.domain_stats import compute_all_findings

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
    study = studies.get("PointCross")
    assert study is not None, "PointCross study not found"
    dg = build_dose_groups(study)
    subjects = dg["subjects"]
    return study, subjects


def test_eg_findings():
    print("\n=== EG (Electrocardiogram) Findings ===")
    study, subjects = _setup()
    findings = compute_eg_findings(study, subjects)

    check("EG findings produced", len(findings) > 0, f"got {len(findings)}")

    test_codes = {f["test_code"] for f in findings}
    check("EG has 3 test codes", len(test_codes) == 3, f"got {test_codes}")
    check("EG has PRAG", "PRAG" in test_codes, f"codes: {test_codes}")
    check("EG has QTCBAG", "QTCBAG" in test_codes, f"codes: {test_codes}")
    check("EG has RRAG", "RRAG" in test_codes, f"codes: {test_codes}")

    for f in findings:
        check(f"EG {f['test_code']} is continuous", f["data_type"] == "continuous")
        break  # Check one representative

    # Check group_stats structure
    f0 = findings[0]
    gs = f0["group_stats"]
    check("EG group_stats present", len(gs) > 0, f"got {len(gs)} groups")
    if gs:
        g = gs[0]
        check("EG group_stats have mean", "mean" in g and g["mean"] is not None)
        check("EG group_stats have sd", "sd" in g)
        check("EG group_stats have n", "n" in g and g["n"] > 0)

    # Check pairwise structure
    pw = f0.get("pairwise", [])
    if pw:
        check("EG pairwise have p_value", "p_value" in pw[0])
        check("EG pairwise have cohens_d", "cohens_d" in pw[0])

    # Check both sexes present
    sexes = {f["sex"] for f in findings}
    check("EG has both sexes", len(sexes) == 2, f"got {sexes}")

    # All findings are domain EG
    domains = {f["domain"] for f in findings}
    check("EG domain correct", domains == {"EG"}, f"got {domains}")


def test_vs_findings():
    print("\n=== VS (Vital Signs) Findings ===")
    study, subjects = _setup()
    findings = compute_vs_findings(study, subjects)

    check("VS findings produced", len(findings) > 0, f"got {len(findings)}")

    test_codes = {f["test_code"] for f in findings}
    check("VS has HR test code", "HR" in test_codes, f"codes: {test_codes}")

    for f in findings:
        check(f"VS {f['test_code']} is continuous", f["data_type"] == "continuous")
        break

    f0 = findings[0]
    gs = f0["group_stats"]
    check("VS group_stats present", len(gs) > 0, f"got {len(gs)} groups")
    if gs:
        g = gs[0]
        check("VS group_stats have mean", "mean" in g and g["mean"] is not None)
        check("VS group_stats have sd", "sd" in g)
        check("VS group_stats have n", "n" in g and g["n"] > 0)

    domains = {f["domain"] for f in findings}
    check("VS domain correct", domains == {"VS"}, f"got {domains}")


def test_bg_findings():
    print("\n=== BG (Body Weight Gain) Findings ===")
    study, subjects = _setup()
    findings = compute_bg_findings(study, subjects)

    check("BG findings produced", len(findings) > 0, f"got {len(findings)}")

    for f in findings:
        check(f"BG is continuous", f["data_type"] == "continuous")
        break

    # BG should have multiple timepoints (longitudinal)
    days = {f["day"] for f in findings}
    check("BG has multiple timepoints", len(days) > 1, f"got {len(days)} days: {sorted(d for d in days if d is not None)}")

    f0 = findings[0]
    gs = f0["group_stats"]
    check("BG group_stats present", len(gs) > 0, f"got {len(gs)} groups")
    if gs:
        g = gs[0]
        check("BG group_stats have mean", "mean" in g and g["mean"] is not None)
        check("BG group_stats have sd", "sd" in g)
        check("BG group_stats have n", "n" in g and g["n"] > 0)

    domains = {f["domain"] for f in findings}
    check("BG domain correct", domains == {"BG"}, f"got {domains}")


def test_enrichment():
    """Test post-pipeline enrichment: organ systems and endpoint types."""
    print("\n=== Enrichment (post-pipeline) ===")
    study, _ = _setup()
    all_findings, _ = compute_all_findings(study)

    eg_findings = [f for f in all_findings if f["domain"] == "EG"]
    vs_findings = [f for f in all_findings if f["domain"] == "VS"]
    bg_findings = [f for f in all_findings if f["domain"] == "BG"]

    check("EG present in pipeline", len(eg_findings) > 0, f"got {len(eg_findings)}")
    check("VS present in pipeline", len(vs_findings) > 0, f"got {len(vs_findings)}")
    check("BG present in pipeline", len(bg_findings) > 0, f"got {len(bg_findings)}")

    if eg_findings:
        check("EG organ_system = cardiovascular",
              eg_findings[0].get("organ_system") == "cardiovascular",
              f"got {eg_findings[0].get('organ_system')}")
        check("EG endpoint_type = electrocardiogram",
              eg_findings[0].get("endpoint_type") == "electrocardiogram",
              f"got {eg_findings[0].get('endpoint_type')}")

    if vs_findings:
        check("VS organ_system = cardiovascular",
              vs_findings[0].get("organ_system") == "cardiovascular",
              f"got {vs_findings[0].get('organ_system')}")
        check("VS endpoint_type = vital_signs",
              vs_findings[0].get("endpoint_type") == "vital_signs",
              f"got {vs_findings[0].get('endpoint_type')}")

    if bg_findings:
        check("BG endpoint_type = body_weight_gain",
              bg_findings[0].get("endpoint_type") == "body_weight_gain",
              f"got {bg_findings[0].get('endpoint_type')}")


if __name__ == "__main__":
    test_eg_findings()
    test_vs_findings()
    test_bg_findings()
    test_enrichment()
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
    else:
        print("All tests passed!")
