#!/usr/bin/env python3
"""
test-validate-approval-baseline.py -- regression suite for
scripts/validate-approval-baseline.py.

Cases:
  1. _example baseline validates clean (positive control)
  2. missing required top-level field -> FAIL
  3. wrong schema_version (const) -> FAIL
  4. unknown top-level property (additionalProperties: false) -> FAIL
  5. invalid finding_id key (wrong number of segments) -> FAIL
  6. invalid syndrome certainty enum -> FAIL
  7. negative summary count (minimum: 0) -> FAIL
  8. invalid date-time format -> FAIL
  9. duplicate target_organs (uniqueItems) -> FAIL
 10. valid minimal baseline (smallest legal shape) -> OK

Run: python scripts/test-validate-approval-baseline.py
Exit 0 = all pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VALIDATOR = ROOT / "scripts" / "validate-approval-baseline.py"
EXAMPLE = ROOT / "backend" / "tests" / "approval-baselines" / "_example" / "baseline.json"
PYTHON = sys.executable


def run_validator(baseline_path: Path) -> tuple[int, str, str]:
    proc = subprocess.run(
        [PYTHON, str(VALIDATOR), str(baseline_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return proc.returncode, proc.stdout, proc.stderr


def write_tmp(d: dict, tmp_dir: Path, name: str) -> Path:
    p = tmp_dir / f"{name}.json"
    p.write_text(json.dumps(d, indent=2), encoding="utf-8")
    return p


def base_valid_doc() -> dict:
    """Smallest baseline that validates clean. Used as the starting point for
    each negative case (which then mutates one field to introduce a defect)."""
    return {
        "schema_version": 1,
        "study_id": "test_study",
        "captured_at": "2026-04-27T00:00:00Z",
        "captured_against_commit": "0000000",
        "captured_from": "test/source",
        "captured_by": "test/script",
        "scientific": {
            "summary_counts": {
                "total_findings": 0,
                "total_adverse": 0,
                "total_warning": 0,
                "total_normal": 0,
                "total_treatment_related": 0,
            },
            "noael_per_endpoint_sex": {},
            "adverse_classification": {},
            "target_organs": [],
            "syndrome_detections": [],
            "signal_scores": {},
            "effect_sizes": {},
            "p_value_adjustments": {},
            "eci_dimensions": {},
        },
        "presentation": {},
    }


def main() -> int:
    if not VALIDATOR.exists():
        print(f"ERROR: {VALIDATOR} not found", file=sys.stderr)
        return 1
    if not EXAMPLE.exists():
        print(f"ERROR: {EXAMPLE} not found", file=sys.stderr)
        return 1

    pass_count = 0
    fail_count = 0
    failures: list[str] = []

    print("=" * 50)
    print("  validate-approval-baseline regression suite")
    print("=" * 50)
    print()

    def check(name: str, expected_rc: int, baseline_path: Path) -> None:
        nonlocal pass_count, fail_count
        rc, out, err = run_validator(baseline_path)
        if rc == expected_rc:
            pass_count += 1
            print(f"  PASS  {name}")
        else:
            fail_count += 1
            failures.append(name)
            print(f"  FAIL  {name} (expected rc={expected_rc}, got rc={rc})")
            if out.strip():
                print(f"        stdout: {out.strip()[:200]}")
            if err.strip():
                print(f"        stderr: {err.strip()[:200]}")

    # Case 1 -- positive control on the real example fixture
    check("case 1: _example baseline validates clean", 0, EXAMPLE)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        # Case 10 -- minimal clean (positive)
        d = base_valid_doc()
        check("case 10: minimal clean baseline", 0, write_tmp(d, tmp_dir, "case10"))

        # Case 2 -- missing required top-level field
        d = base_valid_doc()
        del d["captured_at"]
        check("case 2: missing required field 'captured_at' -> FAIL", 1, write_tmp(d, tmp_dir, "case2"))

        # Case 3 -- wrong schema_version (const)
        d = base_valid_doc()
        d["schema_version"] = 99
        check("case 3: wrong schema_version (const) -> FAIL", 1, write_tmp(d, tmp_dir, "case3"))

        # Case 4 -- unknown top-level property
        d = base_valid_doc()
        d["bogus_field"] = "x"
        check("case 4: unknown top-level property (additionalProperties: false) -> FAIL", 1, write_tmp(d, tmp_dir, "case4"))

        # Case 5 -- invalid finding_id key (only 3 segments instead of 5)
        d = base_valid_doc()
        d["scientific"]["adverse_classification"]["LB.ALT.M"] = {
            "verdict": "adverse", "treatment_related": True, "severity": "moderate",
        }
        check("case 5: invalid finding_id key (wrong segment count) -> FAIL", 1, write_tmp(d, tmp_dir, "case5"))

        # Case 6 -- invalid syndrome certainty enum
        d = base_valid_doc()
        d["scientific"]["syndrome_detections"].append({
            "syndrome_id": "XS01",
            "certainty": "definitely",  # not in enum
            "evidence_count": 4,
        })
        check("case 6: invalid syndrome certainty enum -> FAIL", 1, write_tmp(d, tmp_dir, "case6"))

        # Case 7 -- negative summary count
        d = base_valid_doc()
        d["scientific"]["summary_counts"]["total_findings"] = -1
        check("case 7: negative summary count (minimum: 0) -> FAIL", 1, write_tmp(d, tmp_dir, "case7"))

        # Case 8 -- invalid date-time
        d = base_valid_doc()
        d["captured_at"] = "not-a-date"
        check("case 8: invalid date-time format -> FAIL", 1, write_tmp(d, tmp_dir, "case8"))

        # Case 9 -- duplicate target_organs
        d = base_valid_doc()
        d["scientific"]["target_organs"] = ["liver", "kidney", "liver"]
        check("case 9: duplicate target_organs (uniqueItems) -> FAIL", 1, write_tmp(d, tmp_dir, "case9"))

    print()
    print("=" * 50)
    total = pass_count + fail_count
    if fail_count == 0:
        print(f"  RESULT: {pass_count}/{total} passed.")
        return 0
    print(f"  RESULT: {fail_count}/{total} failed.")
    for f in failures:
        print(f"    - {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
