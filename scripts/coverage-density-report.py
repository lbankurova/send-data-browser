#!/usr/bin/env python3
"""coverage-density-report.py -- Test-density audit for an analytical module.

Given a changed module path, this script:
  1. Identifies the module's public functions (top-level `def` in Python,
     `export function` / `export const` in TypeScript)
  2. Locates the conventional test file (`backend/tests/test_<base>.py` or
     a sibling `*.test.ts`)
  3. Counts how many module functions have at least one name reference in
     the test file -- a coarse "is this exercised?" heuristic
  4. Reports density (% covered) and names the functions with zero references

Why this exists (LIT-07):
  `/ops:bug-stress` Step 4 verifies the bug fix has a test. That's necessary
  but not sufficient -- a fix can ship with a unit test for the specific
  branch that broke while the surrounding code stays under-tested. The
  "Nyquist auditor" question (gsd literature note) is: *would the test
  suite have caught this bug class structurally, not by accident?* Density
  is a coarse proxy: a module where 4 of 12 functions are referenced from
  tests has weak structural coverage, regardless of whether the specific
  bug fix added a passing test.

The check is heuristic, not authoritative. A function with a test reference
might still have weak branch coverage; a function without one might be
exercised transitively. Treat the output as a *signal for human review*,
not a coverage gate. Pair with explicit branch coverage tools when stronger
evidence is needed.

Run:
    python scripts/coverage-density-report.py backend/services/analysis/classification.py
    python scripts/coverage-density-report.py frontend/src/lib/derive-summaries.ts

Exit code: 0 = scan completed (always); 1 = script error.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Function definitions per language.
PY_FUNC_RE = re.compile(r"^def\s+([a-zA-Z_]\w*)\s*\(", re.MULTILINE)
PY_CLASS_RE = re.compile(r"^class\s+([A-Z]\w*)\s*[\(:]", re.MULTILINE)

# TS/TSX: `export function`, `export const X = (`, `export class`.
# Skipping internal helpers (no `export`) — the audit targets the public
# surface that consumers call into.
TS_FUNC_RE = re.compile(
    r"^export\s+(?:async\s+)?(?:function\s+([a-zA-Z_]\w*)|"
    r"const\s+([a-zA-Z_]\w*)\s*[:=]|"
    r"class\s+([A-Z]\w*))",
    re.MULTILINE,
)


@dataclass
class FunctionInfo:
    name: str
    line: int
    referenced_in_tests: bool = False


def find_test_files(module_path: Path) -> tuple[Path | None, list[Path]]:
    """Resolve test files for a given module.

    Returns (primary, all_tests):
      primary: the conventional 1:1 test file if one exists (None otherwise)
      all_tests: every test file in the relevant test root, used for a
                 broader name-reference scan. Many analytical modules in
                 `backend/services/analysis/` are exercised via integration
                 test files (e.g., test_findings_pipeline.py covers
                 classification.py functions transitively). Ignoring those
                 makes the density signal misleadingly low.
    """
    rel = module_path.relative_to(ROOT) if module_path.is_absolute() else module_path
    parts = rel.parts
    base = module_path.stem
    primary: Path | None = None
    all_tests: list[Path] = []

    if parts and parts[0] == "backend":
        tests_dir = ROOT / "backend" / "tests"
        candidate = tests_dir / f"test_{base}.py"
        if candidate.is_file():
            primary = candidate
        if tests_dir.exists():
            all_tests = sorted(tests_dir.rglob("test_*.py"))
        return primary, all_tests

    if parts and parts[0] == "frontend":
        for suffix in (".test.tsx", ".test.ts"):
            candidate = ROOT / "frontend" / "tests" / f"{base}{suffix}"
            if candidate.is_file():
                primary = candidate
                break
            sibling = module_path.with_suffix("").with_name(base + suffix)
            if sibling.is_file():
                primary = sibling
                break
        # Frontend tests live in `frontend/tests/` and as `*.test.ts(x)` siblings.
        for root in (ROOT / "frontend" / "tests", ROOT / "frontend" / "src"):
            if root.exists():
                all_tests.extend(sorted(root.rglob("*.test.ts")))
                all_tests.extend(sorted(root.rglob("*.test.tsx")))
        return primary, all_tests

    return None, []


def extract_functions(module_path: Path) -> list[FunctionInfo]:
    text = module_path.read_text(encoding="utf-8", errors="replace")
    suffix = module_path.suffix
    out: list[FunctionInfo] = []
    if suffix == ".py":
        for m in PY_FUNC_RE.finditer(text):
            name = m.group(1)
            if name.startswith("_") and not name.startswith("__"):
                # Module-level private helper. Still count, but flag in
                # output so the user sees the public-vs-private split.
                pass
            line = text[: m.start()].count("\n") + 1
            out.append(FunctionInfo(name=name, line=line))
        for m in PY_CLASS_RE.finditer(text):
            line = text[: m.start()].count("\n") + 1
            out.append(FunctionInfo(name=m.group(1), line=line))
    elif suffix in {".ts", ".tsx"}:
        for m in TS_FUNC_RE.finditer(text):
            name = m.group(1) or m.group(2) or m.group(3)
            line = text[: m.start()].count("\n") + 1
            out.append(FunctionInfo(name=name, line=line))
    out.sort(key=lambda f: f.line)
    return out


def check_references(funcs: list[FunctionInfo], test_paths: list[Path]) -> dict[str, list[str]]:
    """Mark each function as referenced in tests if its name appears in any test
    file's text.

    Word-boundary match -- avoids false hits from substring overlap (e.g.,
    `compute_score` vs `compute_score_v2`).

    Returns: {function_name: [test_file_relpath, ...]} for referenced funcs,
    used to surface WHICH integration tests exercise each function (more
    actionable than just a boolean).
    """
    by_test: dict[Path, str] = {}
    for tp in test_paths:
        try:
            by_test[tp] = tp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
    refs: dict[str, list[str]] = {}
    for f in funcs:
        pat = re.compile(rf"\b{re.escape(f.name)}\b")
        for tp, text in by_test.items():
            if pat.search(text):
                f.referenced_in_tests = True
                try:
                    rel = tp.relative_to(ROOT).as_posix()
                except ValueError:
                    rel = tp.as_posix()
                refs.setdefault(f.name, []).append(rel)
    return refs


def report(module_path: Path, funcs: list[FunctionInfo], primary: Path | None, all_tests: list[Path]) -> None:
    rel = module_path.relative_to(ROOT) if module_path.is_absolute() else module_path
    print(f"COVERAGE-DENSITY: {rel.as_posix()}")
    print()

    if not funcs:
        print("  No public functions / classes detected. Skipping.")
        return

    refs = check_references(funcs, all_tests)
    referenced = sum(1 for f in funcs if f.referenced_in_tests)
    density = referenced / len(funcs) if funcs else 0.0

    if primary is not None:
        primary_rel = primary.relative_to(ROOT).as_posix() if primary.is_absolute() else primary.as_posix()
        print(f"  Primary 1:1 test:  {primary_rel}")
    else:
        print(f"  Primary 1:1 test:  (none -- no `test_{module_path.stem}.py` or `{module_path.stem}.test.ts(x)`)")
    print(f"  Test files scanned: {len(all_tests)}")
    print(f"  Functions:          {len(funcs)}")
    print(f"  Referenced:         {referenced} / {len(funcs)}  ({density:.0%})")
    print()

    unreferenced = [f for f in funcs if not f.referenced_in_tests]
    if unreferenced:
        print(f"  UNREFERENCED FUNCTIONS ({len(unreferenced)}):")
        for f in unreferenced:
            visibility = "private" if f.name.startswith("_") else "public"
            print(f"    {f.name:40s}  line {f.line:5d}  [{visibility}]")
        print()

    # Surface where each referenced function is exercised, so the user can
    # check that the test isn't a thin import smoke-test.
    if refs:
        print(f"  REFERENCE MAP (function -> test files):")
        for name, files in sorted(refs.items()):
            shown = ", ".join(files[:3])
            extra = f" (+{len(files)-3} more)" if len(files) > 3 else ""
            print(f"    {name:40s}  {shown}{extra}")
        print()

    # Recommendation thresholds. Calibrated 2026-04-27 against 7 representative
    # analytical modules. Observed distribution was bimodal:
    #   noael_aggregation.py 18%, classification.py 21%, findings_pipeline.py 33%,
    #   findings-rail-engine.ts 33%, cross-domain-syndromes.ts 67%,
    #   derive-summaries.ts 73%, endpoint-confidence.ts 80%.
    # Backend modules cluster low (heavy use of private `_compute_*` helpers
    # exercised transitively but not name-referenced in tests); frontend
    # modules cluster high (vitest tests typically import + call by name).
    # 35% separates the bottom cluster ("weak"); 65% separates the top
    # cluster ("adequate"); the gap (35-65%) is empirically unpopulated in
    # the current corpus and lands as "verify exemptions" — the case where
    # a human should look but no module currently sits.
    if not all_tests:
        print("  RECOMMENDATION: no test files found in the project's test root.")
    elif density < 0.35:
        print("  RECOMMENDATION: density below 35% (calibrated weak). The bug-pattern-search")
        print("  step (Step 3 of /ops:bug-stress) likely under-covered this module.")
        print("  Add tests for the listed unreferenced functions before closing")
        print("  the bug-stress retro.")
    elif density < 0.65:
        print("  RECOMMENDATION: density 35-65% (mid-range). Verify the unreferenced")
        print("  functions are intentionally test-exempt (glue / wrappers / pure")
        print("  formatters). If any encode domain rules, add tests.")
    else:
        print("  RECOMMENDATION: density >= 65% (calibrated adequate). Coverage is")
        print("  structurally adequate. Bug-stress can proceed to Step 5 (Grow the")
        print("  oracle) without density remediation.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("module", help="path to the changed module (e.g., backend/services/analysis/classification.py)")
    args = parser.parse_args()

    module_path = (ROOT / args.module).resolve() if not Path(args.module).is_absolute() else Path(args.module).resolve()
    if not module_path.is_file():
        print(f"ERROR: module not found: {module_path}", file=sys.stderr)
        return 1
    if module_path.suffix not in {".py", ".ts", ".tsx"}:
        print(f"ERROR: unsupported extension {module_path.suffix} (supported: .py, .ts, .tsx)", file=sys.stderr)
        return 1

    funcs = extract_functions(module_path)
    primary, all_tests = find_test_files(module_path)
    report(module_path, funcs, primary, all_tests)
    return 0


if __name__ == "__main__":
    sys.exit(main())
