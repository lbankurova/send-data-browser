#!/usr/bin/env python3
"""
test-query-knowledge.py -- regression suite for scripts/query-knowledge.py.

Exercises the structured-query path against a synthetic fixture knowledge
graph (independent of pcc's real docs/_internal/knowledge/knowledge-graph.md
so refactors of the real corpus don't break the test).

Cases:
  1. id lookup -- exact match returns the fact
  2. id miss + default behavior -- no-match stub message, exit 0
  3. id miss + --strict -- exit 1
  4. fact_kind filter -- returns all matching kind
  5. scope species filter -- returns species-matching facts
  6. scope sex:M against fact sex:both -- 'both' matches as sex wildcard
  7. scope endpoint list-membership -- 'ALT' matches scope.endpoints=[ALT, AST]
  8. domain filter against current schema (no fact has scope.domain) -- always no-match
  9. multi-criteria AND -- kind + scope + confidence narrows correctly
 10. JSON output shape -- match_count, no_fact_found, fallback_message
 11. confidence filter -- excludes mismatched confidence
 12. invalid --scope KEY:VALUE format -- exits 1 with clear error

Run: python scripts/test-query-knowledge.py
Exit 0 = all pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUERY_SCRIPT = ROOT / "scripts" / "query-knowledge.py"
PYTHON = sys.executable

FIXTURE = """\
# Test Knowledge Graph

Test fixture for query-knowledge.py regression suite. Schema mirrors the
real docs/_internal/knowledge/knowledge-graph.md format.

---

## HCD-FACT-T01

```yaml
id: HCD-FACT-T01
title: Test cyno male ALT baseline
scope:
  species: [primate]
  strains: [cynomolgus]
  sex: M
  endpoints: [ALT]
  study_types: [any]
fact_kind: numeric_baseline
value:
  encoding: arithmetic_mean_sd
  units: IU/L
  mean: 50.0
  sd: 24.0
  n: 76
consumed_by:
  - path: "test/path"
    status: live
influences:
  - signal_score
derives_from:
  - test/literature/test.md
confidence: internal_validated
last_reviewed: 2026-04-26
```

---

## HCD-FACT-T02

```yaml
id: HCD-FACT-T02
title: Test cyno disable marker (sex:both)
scope:
  species: [primate]
  strains: [cynomolgus]
  sex: both
  endpoints: [ALP]
fact_kind: disable_marker
value:
  rule: "Test rule"
consumed_by:
  - path: "test/path"
    status: planned
influences:
  - syndrome.test
derives_from:
  - test/literature/test.md
confidence: internal_validated
last_reviewed: 2026-04-26
```

---

## HCD-FACT-T03

```yaml
id: HCD-FACT-T03
title: Test rat heuristic with multiple endpoints
scope:
  species: [rat]
  strains: [Wistar]
  sex: F
  endpoints: [ALT, AST, ALP]
  study_types: [chronic]
fact_kind: numeric_baseline
value:
  encoding: arithmetic_mean_sem
  mean: 30.0
  sem: 5.0
  n: 24
consumed_by:
  - path: "test/path"
    status: live
influences:
  - signal_score
derives_from:
  - test/literature/test.md
confidence: heuristic
last_reviewed: 2026-04-26
```
"""


def run_query(args: list[str], graph_path: Path) -> tuple[int, str, str]:
    """Run query-knowledge.py with the test fixture; return (rc, stdout, stderr)."""
    proc = subprocess.run(
        [PYTHON, str(QUERY_SCRIPT), "--graph", str(graph_path), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return proc.returncode, proc.stdout, proc.stderr


def main() -> int:
    if not QUERY_SCRIPT.exists():
        print(f"ERROR: {QUERY_SCRIPT} not found", file=sys.stderr)
        return 1

    pass_count = 0
    fail_count = 0
    failures: list[str] = []

    with tempfile.TemporaryDirectory() as tmp:
        graph_path = Path(tmp) / "fixture-graph.md"
        graph_path.write_text(FIXTURE, encoding="utf-8")

        cases: list[tuple[str, list[str], callable]] = [
            (
                "case 1: id lookup -- exact match returns the fact",
                ["--id", "HCD-FACT-T01"],
                lambda rc, out, err: rc == 0 and "HCD-FACT-T01" in out and "Test cyno male ALT" in out,
            ),
            (
                "case 2: id miss + default -- no-match stub, exit 0",
                ["--id", "HCD-FACT-NONEXISTENT"],
                lambda rc, out, err: rc == 0 and "NO FACT FOUND" in out,
            ),
            (
                "case 3: id miss + --strict -- exit 1",
                ["--id", "HCD-FACT-NONEXISTENT", "--strict"],
                lambda rc, out, err: rc == 1 and "NO FACT FOUND" in out,
            ),
            (
                "case 4: fact_kind filter -- 2 numeric_baseline facts in fixture",
                ["--kind", "numeric_baseline"],
                lambda rc, out, err: rc == 0 and "Matches: 2" in out
                    and "HCD-FACT-T01" in out and "HCD-FACT-T03" in out
                    and "HCD-FACT-T02" not in out,
            ),
            (
                "case 5: scope species filter -- rat returns T03 only",
                ["--scope", "species:rat"],
                lambda rc, out, err: rc == 0 and "Matches: 1" in out and "HCD-FACT-T03" in out,
            ),
            (
                "case 6: sex:M against sex:both wildcard -- T02 matches via 'both'",
                ["--scope", "sex:M"],
                lambda rc, out, err: rc == 0
                    and "HCD-FACT-T01" in out  # exact M
                    and "HCD-FACT-T02" in out  # both -> wildcard match
                    and "HCD-FACT-T03" not in out,  # F
            ),
            (
                "case 7: endpoint list-membership -- ALT matches T01 and T03",
                ["--scope", "endpoints:ALT"],
                lambda rc, out, err: rc == 0
                    and "HCD-FACT-T01" in out and "HCD-FACT-T03" in out
                    and "HCD-FACT-T02" not in out,
            ),
            (
                "case 8: domain filter against schema-without-domain -- no match",
                ["--domain", "LB"],
                lambda rc, out, err: rc == 0 and "NO FACT FOUND" in out,
            ),
            (
                "case 9: multi-criteria AND narrows correctly",
                ["--kind", "numeric_baseline", "--scope", "sex:F", "--confidence", "heuristic"],
                lambda rc, out, err: rc == 0 and "Matches: 1" in out and "HCD-FACT-T03" in out,
            ),
            (
                "case 10: JSON output shape",
                ["--kind", "numeric_baseline", "--format", "json"],
                lambda rc, out, err: _check_json_shape(rc, out),
            ),
            (
                "case 11: confidence filter excludes mismatch",
                ["--confidence", "internal_validated"],
                lambda rc, out, err: rc == 0
                    and "HCD-FACT-T01" in out and "HCD-FACT-T02" in out
                    and "HCD-FACT-T03" not in out,
            ),
            (
                "case 12: malformed --scope (no colon) -- exit 1",
                ["--scope", "invalid_no_colon"],
                lambda rc, out, err: rc == 1 and "KEY:VALUE" in err,
            ),
        ]

        print("=" * 50)
        print("  query-knowledge regression suite")
        print("=" * 50)
        print()

        for name, args, predicate in cases:
            rc, out, err = run_query(args, graph_path)
            try:
                ok = predicate(rc, out, err)
            except Exception as exc:
                ok = False
                err = err + f"\n[predicate-exception] {exc}"
            if ok:
                pass_count += 1
                print(f"  PASS  {name}")
            else:
                fail_count += 1
                failures.append(name)
                print(f"  FAIL  {name}")
                print(f"        rc={rc}")
                if out.strip():
                    print(f"        stdout: {out.strip()[:200]}")
                if err.strip():
                    print(f"        stderr: {err.strip()[:200]}")

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


def _check_json_shape(rc: int, out: str) -> bool:
    if rc != 0:
        return False
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return False
    return (
        "query" in data
        and data.get("match_count") == 2
        and data.get("no_fact_found") is False
        and data.get("fallback_message") is None
        and isinstance(data.get("facts"), list)
        and len(data["facts"]) == 2
        and {f["id"] for f in data["facts"]} == {"HCD-FACT-T01", "HCD-FACT-T03"}
    )


if __name__ == "__main__":
    sys.exit(main())
