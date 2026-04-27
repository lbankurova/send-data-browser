#!/usr/bin/env python3
"""
test-audit-bug-patterns.py -- regression suite for scripts/audit-bug-patterns.py.

Cases:
  1. real registry validates clean (positive control on shipped registry)
  2. fixture: missing required field -> defect
  3. fixture: name field doesn't match heading -> defect
  4. fixture: invalid status -> defect
  5. fixture: duplicate pattern names -> defect
  6. fixture: representative_instance file doesn't exist on disk -> defect
  7. fixture: applies_to empty list -> defect
  8. --staged-check fires for files matching a pattern's applies_to glob
  9. --staged-check ignores retired patterns
 10. --pattern filter narrows audit to one entry
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT = ROOT / "scripts" / "audit-bug-patterns.py"
REGISTRY = ROOT / "docs" / "_internal" / "knowledge" / "bug-patterns.md"
PYTHON = sys.executable


def run(args: list[str]) -> tuple[int, str, str]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.run(
        [PYTHON, str(AUDIT), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        env=env,
    )
    return proc.returncode, proc.stdout, proc.stderr


def write_fixture(tmp: Path, name: str, content: str) -> Path:
    p = tmp / f"{name}.md"
    p.write_text(content, encoding="utf-8")
    return p


def fixture_pattern(name: str, mods: dict | None = None, instance_file: str | None = None) -> str:
    """Build a YAML pattern block with optional overrides."""
    inst = instance_file or "scripts/audit-bug-patterns.py"  # any real file
    body = {
        "name": name,
        "title": "Test pattern",
        "status": "active",
        "root_cause": "Test root cause line one",
        "representative_instances": [{"file": inst, "line": "null", "bug_id": "BUG-TEST", "note": "test"}],
        "applies_to": ["scripts/*.py"],
        "prevention_property": "null",
        "prevention_fact": "null",
        "prevention_test": "null",
        "introduced": "2026-04-27",
        "last_updated": "2026-04-27",
    }
    if mods:
        for k, v in mods.items():
            body[k] = v
    lines = [f"## {body.get('name', name)}", "", "```yaml"]
    for k, v in body.items():
        if k == "representative_instances":
            lines.append("representative_instances:")
            for inst in v:
                lines.append(f"  - file: {inst['file']}")
                lines.append(f"    line: {inst.get('line', 'null')}")
                lines.append(f"    bug_id: {inst.get('bug_id', 'null')}")
                lines.append(f"    note: \"{inst.get('note', '')}\"")
        elif k == "applies_to":
            lines.append("applies_to:")
            for g in v:
                lines.append(f"  - {g}")
        elif k == "root_cause":
            lines.append(f"root_cause: |")
            lines.append(f"  {v}")
        else:
            lines.append(f"{k}: {v}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if not AUDIT.exists() or not REGISTRY.exists():
        print(f"ERROR: missing {AUDIT} or {REGISTRY}", file=sys.stderr)
        return 1

    pass_count = 0
    fail_count = 0
    failures: list[str] = []

    print("=" * 60)
    print("  audit-bug-patterns regression suite")
    print("=" * 60)
    print()

    def check(name: str, expected_rc: int, args: list[str], stdout_must_contain: str | None = None) -> None:
        nonlocal pass_count, fail_count
        rc, out, err = run(args)
        ok = rc == expected_rc
        if ok and stdout_must_contain is not None:
            ok = stdout_must_contain in out
        if ok:
            pass_count += 1
            print(f"  PASS  {name}")
        else:
            fail_count += 1
            failures.append(name)
            print(f"  FAIL  {name} (expected rc={expected_rc}, got rc={rc})")
            if out.strip():
                print(f"        stdout: {out.strip()[:300]}")
            if err.strip():
                print(f"        stderr: {err.strip()[:300]}")

    # Case 1 -- real registry validates clean
    check("case 1: real registry validates clean", 0, [],
          stdout_must_contain="no defects")

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)

        # Case 2 -- missing required field (status omitted)
        f2 = write_fixture(tmp, "case2", "# Fixture\n\n" + fixture_pattern("test-pat", mods={"status": ""}))
        # The above keeps status empty; status:" " means YAML may parse ""; need true omission. Easier: write raw:
        f2.write_text("""# Fixture

## test-pat

```yaml
name: test-pat
title: Test
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 2: missing required field 'status' -> defect", 1, ["--registry", str(f2)])

        # Case 3 -- name mismatch
        f3 = write_fixture(tmp, "case3", "")
        f3.write_text("""# Fixture

## heading-name

```yaml
name: yaml-name
title: Test
status: active
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 3: name field mismatches heading -> defect", 1, ["--registry", str(f3)])

        # Case 4 -- invalid status
        f4 = write_fixture(tmp, "case4", "")
        f4.write_text("""# Fixture

## bogus-status

```yaml
name: bogus-status
title: Test
status: bogus
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 4: invalid status enum -> defect", 1, ["--registry", str(f4)])

        # Case 5 -- duplicate names
        f5 = write_fixture(tmp, "case5", "")
        f5.write_text("""# Fixture

## dup-name

```yaml
name: dup-name
title: First
status: active
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```

## dup-name

```yaml
name: dup-name
title: Second
status: active
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 5: duplicate pattern names -> defect", 1, ["--registry", str(f5)])

        # Case 6 -- instance file doesn't exist
        f6 = write_fixture(tmp, "case6", "")
        f6.write_text("""# Fixture

## bad-instance

```yaml
name: bad-instance
title: Test
status: active
root_cause: |
  test
representative_instances:
  - file: nonexistent/path/that/does/not/exist.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 6: instance file does not exist -> defect", 1, ["--registry", str(f6)])

        # Case 7 -- applies_to empty
        f7 = write_fixture(tmp, "case7", "")
        f7.write_text("""# Fixture

## empty-applies

```yaml
name: empty-applies
title: Test
status: active
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to: []
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        check("case 7: empty applies_to -> defect", 1, ["--registry", str(f7)])

        # Case 8 -- --staged-check fires for matching files
        check("case 8: --staged-check fires for matching files", 0,
              ["--staged-check", "--staged-files", "frontend/src/lib/derive-summaries.ts"],
              stdout_must_contain="multi-timepoint-kitchen-sink-aggregation")

        # Case 9 -- --staged-check ignores retired patterns
        f9 = write_fixture(tmp, "case9", "")
        f9.write_text("""# Fixture

## retired-pat

```yaml
name: retired-pat
title: Test
status: retired
root_cause: |
  test
representative_instances:
  - file: scripts/audit-bug-patterns.py
    line: null
    bug_id: null
    note: ""
applies_to:
  - scripts/*.py
prevention_property: null
prevention_fact: null
prevention_test: null
introduced: 2026-04-27
last_updated: 2026-04-27
```
""", encoding="utf-8")
        rc, out, err = run(["--registry", str(f9), "--staged-check", "--staged-files", "scripts/audit-bug-patterns.py"])
        if rc == 0 and "retired-pat" not in out:
            pass_count += 1
            print("  PASS  case 9: --staged-check ignores retired patterns")
        else:
            fail_count += 1
            failures.append("case 9: --staged-check ignores retired patterns")
            print(f"  FAIL  case 9: --staged-check ignores retired patterns (rc={rc}, out={out!r})")

        # Case 10 -- --pattern filter narrows
        check("case 10: --pattern filter narrows to one entry", 0,
              ["--pattern", "multi-timepoint-kitchen-sink-aggregation"],
              stdout_must_contain="1 pattern(s)")

    print()
    print("=" * 60)
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
