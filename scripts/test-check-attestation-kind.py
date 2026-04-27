#!/usr/bin/env python3
"""
test-check-attestation-kind.py -- regression suite for
scripts/check-attestation-kind.py.

Cases:
  1. gate with one peer-review attestation -> PASS for kind=peer-review
  2. gate with no peer-review attestation -> FAIL for kind=peer-review
  3. gate with one bug-pattern (ref=multi-timepoint) -> PASS for ref-match
  4. gate with one bug-pattern (ref=multi-timepoint) -> FAIL for ref=different
  5. gate with retro-action ref=BUG-031#5 -> PASS for ref-prefix=BUG-031
  6. --min 2 against gate with 1 matching -> FAIL
  7. --min 2 against gate with 2 matching -> PASS
  8. malformed gate (not JSON) -> rc=2
  9. missing gate file -> rc=2
 10. gate with attestations[] empty -> FAIL for any --kind
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECK = ROOT / "scripts" / "check-attestation-kind.py"
PYTHON = sys.executable


def run(args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(
        [PYTHON, str(CHECK), *args],
        capture_output=True, text=True, encoding="utf-8",
    )
    return proc.returncode, proc.stdout, proc.stderr


def write_gate(d: dict, tmp: Path, name: str) -> Path:
    p = tmp / f"{name}.json"
    p.write_text(json.dumps(d, indent=2), encoding="utf-8")
    return p


def gate_with(attestations: list[dict]) -> dict:
    return {
        "timestamp": "2026-04-27T00:00:00Z",
        "verdict": "pass",
        "summary": "test",
        "checks_run": 0,
        "checks_passed": 0,
        "algorithm_check": "not-applicable",
        "attestations": attestations,
        "staged_files": "test",
        "head_at_review": "0000000",
        "written_by": "test",
    }


def main() -> int:
    if not CHECK.exists():
        print(f"ERROR: {CHECK} not found", file=sys.stderr)
        return 1

    pass_count = 0
    fail_count = 0
    failures: list[str] = []

    print("=" * 50)
    print("  check-attestation-kind regression suite")
    print("=" * 50)
    print()

    def check(name: str, expected_rc: int, args: list[str]) -> None:
        nonlocal pass_count, fail_count
        rc, out, err = run(args)
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

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)

        # Case 1: peer-review present
        g1 = write_gate(gate_with([
            {"kind": "peer-review", "ref": "noael-spec.md", "verdict": "SOUND",
             "rationale": "Algorithm matches OECD 407 multi-timepoint policy"}
        ]), tmp, "g1")
        check("case 1: peer-review present -> PASS", 0,
              ["--gate", str(g1), "--kind", "peer-review"])

        # Case 2: no peer-review
        g2 = write_gate(gate_with([
            {"kind": "bug-pattern", "ref": "x", "verdict": "verified-not-applicable",
             "rationale": "Diff is display-only; pattern lives elsewhere"}
        ]), tmp, "g2")
        check("case 2: no peer-review -> FAIL", 1,
              ["--gate", str(g2), "--kind", "peer-review"])

        # Case 3: bug-pattern ref-match
        g3 = write_gate(gate_with([
            {"kind": "bug-pattern", "ref": "multi-timepoint-kitchen-sink-aggregation",
             "verdict": "verified-not-applicable",
             "rationale": "Diff is display-only; pattern lives elsewhere"}
        ]), tmp, "g3")
        check("case 3: bug-pattern with matching ref -> PASS", 0,
              ["--gate", str(g3), "--kind", "bug-pattern",
               "--ref", "multi-timepoint-kitchen-sink-aggregation"])

        # Case 4: bug-pattern ref-mismatch
        check("case 4: bug-pattern with non-matching ref -> FAIL", 1,
              ["--gate", str(g3), "--kind", "bug-pattern",
               "--ref", "different-pattern-name"])

        # Case 5: retro-action ref-prefix
        g5 = write_gate(gate_with([
            {"kind": "retro-action", "ref": "BUG-031#5",
             "verdict": "implemented-this-commit",
             "rationale": "Lattice change implemented at CLAUDE.md:84-86"}
        ]), tmp, "g5")
        check("case 5: retro-action ref-prefix match -> PASS", 0,
              ["--gate", str(g5), "--kind", "retro-action", "--ref-prefix", "BUG-031"])

        # Case 6: --min 2 with 1 matching
        g6 = write_gate(gate_with([
            {"kind": "peer-review", "ref": "spec1.md", "verdict": "SOUND",
             "rationale": "First peer-review rationale long enough"}
        ]), tmp, "g6")
        check("case 6: --min 2 against 1 matching -> FAIL", 1,
              ["--gate", str(g6), "--kind", "peer-review", "--min", "2"])

        # Case 7: --min 2 with 2 matching
        g7 = write_gate(gate_with([
            {"kind": "peer-review", "ref": "spec1.md", "verdict": "SOUND",
             "rationale": "First peer-review rationale long enough"},
            {"kind": "peer-review", "ref": "spec2.md", "verdict": "SOUND",
             "rationale": "Second peer-review rationale long enough"},
        ]), tmp, "g7")
        check("case 7: --min 2 against 2 matching -> PASS", 0,
              ["--gate", str(g7), "--kind", "peer-review", "--min", "2"])

        # Case 8: malformed gate
        g8 = tmp / "g8.json"
        g8.write_text("not json", encoding="utf-8")
        check("case 8: malformed gate -> rc=2", 2,
              ["--gate", str(g8), "--kind", "peer-review"])

        # Case 9: missing gate
        check("case 9: missing gate file -> rc=2", 2,
              ["--gate", str(tmp / "nonexistent.json"), "--kind", "peer-review"])

        # Case 10: empty attestations
        g10 = write_gate(gate_with([]), tmp, "g10")
        check("case 10: empty attestations[] -> FAIL", 1,
              ["--gate", str(g10), "--kind", "peer-review"])

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
