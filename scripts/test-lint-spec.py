#!/usr/bin/env python3
"""
test-lint-spec.py -- regression suite for scripts/lint-spec.py.

Cases:
  1. BUG-031 anti-pattern (synthetic) -- "BW reads below tested range" with
     no data citation -> criterion 1 FAIL
  2. Clean spec (synthetic) with citations + facts -> no defects
  3. Multi-feature spec without SPEC-VALUE-AUDIT reference -> criterion 3 FAIL
  4. Algorithmic spec without knowledge-fact citation -> criterion 4 FAIL
  5. Behavioral requirement ('must X') without test reference -> criterion 2 FAIL
  6. Existing reference checklists pass (acceptance §7.3) -- the real
     SPEC-VALUE-AUDIT.md and design-system audit-checklist.md must produce
     0 defects when not in incoming/.
  7. --strict on a flagged file -> rc=1
  8. --strict on a clean file -> rc=0
  9. Acceptance-criteria sections relax criterion 2 (intentional 'must' uses)
 10. Empirical claim WITH a data citation in the paragraph -> no defect

Run: python scripts/test-lint-spec.py
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINT = ROOT / "scripts" / "lint-spec.py"
PYTHON = sys.executable

# Real reference docs that must NOT trigger defects (per spec §7.3 acceptance)
REAL_CHECKLISTS = [
    ROOT / "docs" / "_internal" / "checklists" / "SPEC-VALUE-AUDIT.md",
    ROOT / "docs" / "_internal" / "design-system" / "audit-checklist.md",
]


def run_lint(args: list[str]) -> tuple[int, str, str]:
    import os
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.run(
        [PYTHON, str(LINT), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        env=env,
    )
    return proc.returncode, proc.stdout, proc.stderr


def write_incoming_spec(tmp: Path, name: str, content: str) -> Path:
    """Write a fixture spec into a fake incoming/ tree so is_incoming_spec()
    returns True. The lint resolves paths against the real ROOT, so the
    fixture must be reachable as docs/_internal/incoming/<name> under a
    project root we can simulate. Easiest: write into the real incoming/ dir
    with a clearly-test-only filename, then delete after the test."""
    incoming = ROOT / "docs" / "_internal" / "incoming"
    if not incoming.exists():
        incoming.mkdir(parents=True, exist_ok=True)
    path = incoming / f"_lint_test_{name}.md"
    path.write_text(content, encoding="utf-8")
    return path


def main() -> int:
    if not LINT.exists():
        print(f"ERROR: {LINT} not found", file=sys.stderr)
        return 1

    pass_count = 0
    fail_count = 0
    failures: list[str] = []
    cleanup: list[Path] = []

    print("=" * 50)
    print("  lint-spec regression suite")
    print("=" * 50)
    print()

    def check(name: str, expected: str, args: list[str]) -> None:
        """expected: 'PASS' (no FLAGGED) or 'FLAG-<criterion>' or 'FLAG-ANY'"""
        nonlocal pass_count, fail_count
        rc, out, err = run_lint(args)
        flagged = "FLAGGED" in out
        ok = False
        if expected == "PASS":
            ok = not flagged
        elif expected == "FLAG-ANY":
            ok = flagged
        elif expected.startswith("FLAG-"):
            wanted_criterion = expected.split("-", 1)[1]
            ok = flagged and f"Criterion {wanted_criterion}" in out
        elif expected.startswith("RC-"):
            ok = rc == int(expected.split("-", 1)[1])
        if ok:
            pass_count += 1
            print(f"  PASS  {name}")
        else:
            fail_count += 1
            failures.append(name)
            print(f"  FAIL  {name} (expected={expected}, rc={rc}, flagged={flagged})")
            if out.strip():
                print(f"        stdout: {out.strip()[:300]}")

    try:
        # Case 1 -- BUG-031 anti-pattern
        bug031 = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                     "case1_bug031", """\
# BUG-031 anti-pattern fixture

## Desired behavior

The NOAEL header reads "below tested range" on PointCross BW for the analytics path.
This is the desired display state for the merged display surfaces.
""")
        cleanup.append(bug031)
        check("case 1: BUG-031 anti-pattern -> criterion 1 FAIL", "FLAG-1",
              [str(bug031)])

        # Case 2 -- clean spec with all citations + facts
        clean = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                    "case2_clean", """\
# Clean spec fixture

## Desired behavior

The NOAEL pane displays the value computed by `computeNoaelForFindings`
(`frontend/src/lib/derive-summaries.ts`). For PointCross BW, the value reads
"below tested range" -- verified against `backend/generated/PointCross/unified_findings.json`
and the fixture test `frontend/tests/derive-summaries.test.ts`.

The grading must follow HCD-FACT-001 (cyno male ALT baseline) per the typed
knowledge-graph schema. See also `scripts/query-knowledge.py --kind regulatory_expectation`.
""")
        cleanup.append(clean)
        check("case 2: clean spec with citations + facts -> PASS", "PASS",
              [str(clean)])

        # Case 3 -- multi-feature without SPEC-VALUE-AUDIT
        multi = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                    "case3_multi", """\
# Multi-feature fixture without audit

## F1 -- Feature one

Some content.

## F2 -- Feature two

Some content.

## F3 -- Feature three

Some content.
""")
        cleanup.append(multi)
        check("case 3: multi-feature spec without SPEC-VALUE-AUDIT -> criterion 3 FAIL",
              "FLAG-3", [str(multi)])

        # Case 4 -- algorithmic without knowledge-fact citation
        algo = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                   "case4_algo", """\
# Algorithmic spec fixture without facts

## Description

This spec proposes a new NOAEL aggregation rule that filters direction-flipping
single-timepoint hits. Severity classification of the resulting findings is
recomputed.
""")
        cleanup.append(algo)
        check("case 4: algorithmic spec without knowledge-fact citation -> criterion 4 FAIL",
              "FLAG-4", [str(algo)])

        # Case 5 -- behavioral 'must' without test reference
        behav = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                    "case5_behav", """\
# Behavioral requirement fixture

## Requirements

The system must accept all input shapes and produce a deterministic output.
The user must see a confirmation banner after each save.
""")
        cleanup.append(behav)
        check("case 5: 'must' without test reference -> criterion 2 FAIL",
              "FLAG-2", [str(behav)])

        # Case 6 -- real reference checklists pass
        for cl in REAL_CHECKLISTS:
            if cl.exists():
                check(f"case 6: {cl.name} (real reference) -> PASS",
                      "PASS", [str(cl)])

        # Case 7 -- --strict on a flagged file
        check("case 7: --strict on flagged file -> rc=1", "RC-1",
              ["--strict", str(bug031)])

        # Case 8 -- --strict on a clean file
        check("case 8: --strict on clean file -> rc=0", "RC-0",
              ["--strict", str(clean)])

        # Case 9 -- 'must' inside Acceptance section is exempt
        accept = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                     "case9_accept", """\
# Acceptance section fixture

## Description

Some prose. Cites `frontend/tests/some.test.ts`.

## Acceptance criteria

The implementation must produce N rows in the rendered output.
The pipeline must complete in under 30 seconds.
""")
        cleanup.append(accept)
        check("case 9: 'must' inside Acceptance section is exempt -> criterion 2 OK",
              "PASS", [str(accept)])

        # Case 10 -- empirical claim WITH citation in same paragraph
        cited = write_incoming_spec(tempfile.mkdtemp(prefix="ltest_") and Path("nonexistent"),
                                    "case10_cited", """\
# Cited empirical claim fixture

## Verified output

For PointCross, the header reads "20 mg/kg" -- verified against
`backend/generated/PointCross/unified_findings.json`.
""")
        cleanup.append(cited)
        check("case 10: empirical claim WITH citation in paragraph -> PASS",
              "PASS", [str(cited)])

    finally:
        for p in cleanup:
            try:
                p.unlink()
            except OSError:
                pass

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
