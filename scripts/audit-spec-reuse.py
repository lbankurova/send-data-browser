#!/usr/bin/env python3
"""
audit-spec-reuse.py -- detect REUSE-ANCHOR-DRIFT.

When a spec cites `file.tsx:LINE` as a reuse anchor (a precise citation
indicating intent to consume), the staged diff must actually import that
file's symbols (or modify the file directly). Otherwise the implementation
is reuse-name-only -- claims to follow the cited pattern while bypassing
the file the pattern lives in.

Why this exists: rule 5 ("reuse before reinventing") is honor-system in
CLAUDE.md. Recurring failure mode (2026-04-29 retro): an implementation
ships an `organ-tbl` class name + a colgroup-with-percentage-widths,
matching the spec's STRUCTURE while bypassing the spec's named anchor
(`OrganBlock.tsx:120` and the `col-w-*` classes). All gates pass because
the gates check WHAT (class name present) not WHERE-FROM (the cited file
imported). This script closes that gap.

Detection:
  - Parse the spec for `<filename>.<ext>:LINE` patterns where ext in
    {tsx, ts, jsx, js, py}. Loose mentions without :LINE are excluded
    to keep the heuristic tight (line numbers imply reuse intent;
    bare mentions are often just context).
  - For each anchor, check the staged diff: does it import the file's
    basename, or modify the file directly? Either counts as consumption.
  - Anchors not consumed are emitted as REUSE-ANCHOR-DRIFT findings.

Baseline: like the validation harness, supports a known-failures snapshot
at `.lattice/reuse-anchor-baseline.json`. CI fails only on new drift.
Bootstrap: `UPDATE_BASELINE=1 python scripts/audit-spec-reuse.py`.

Usage:
  python scripts/audit-spec-reuse.py             # auto-detect spec from staged
  python scripts/audit-spec-reuse.py --spec PATH # explicit spec
  python scripts/audit-spec-reuse.py --strict    # exit 1 on any drift
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / ".lattice/reuse-anchor-baseline.json"

# Match "file.ext:LINE" -- a precise citation.  Optional surrounding backticks.
ANCHOR_RE = re.compile(
    r"`?([A-Za-z][A-Za-z0-9_./-]*\.(?:tsx|ts|jsx|js|py))`?:(\d+)"
)


@dataclass(frozen=True)
class Anchor:
    file: str           # repo-relative path to anchored file
    line: int           # cited line number


def find_repo_path(filename: str) -> str | None:
    """Resolve a bare filename or path to a repo-relative path. Returns None
    if the file does not exist in the repo. Excludes node_modules + venv."""
    target = Path(filename)
    # Direct hit (path is already repo-relative or absolute-into-repo)
    candidate = ROOT / target
    if candidate.exists() and "node_modules" not in str(candidate) and "venv" not in str(candidate):
        return str(candidate.relative_to(ROOT)).replace("\\", "/")
    # Search by basename across repo. Excludes node_modules / venv.
    matches: list[Path] = []
    for p in ROOT.rglob(target.name):
        if not p.is_file():
            continue
        s = str(p).replace("\\", "/")
        if "/node_modules/" in s or "/venv/" in s or "/.git/" in s or "/dist/" in s or "/_archived/" in s:
            continue
        matches.append(p)
    if len(matches) == 1:
        return str(matches[0].relative_to(ROOT)).replace("\\", "/")
    # Multiple basenames in repo: ambiguous; require the spec to be more specific.
    return None


def extract_anchors(spec_text: str) -> list[Anchor]:
    """Pull file:line citations from the spec. Tight heuristic: only `file.ext:LINE` form."""
    seen: set[tuple[str, int]] = set()
    out: list[Anchor] = []
    for m in ANCHOR_RE.finditer(spec_text):
        raw_path = m.group(1)
        line_no = int(m.group(2))
        resolved = find_repo_path(raw_path)
        if resolved is None:
            continue
        key = (resolved, line_no)
        if key in seen:
            continue
        seen.add(key)
        out.append(Anchor(file=resolved, line=line_no))
    return sorted(out, key=lambda a: (a.file, a.line))


def get_staged_diff() -> str:
    proc = subprocess.run(
        ["git", "diff", "--cached"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    return proc.stdout


def get_staged_files() -> list[str]:
    proc = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    return [s.strip() for s in proc.stdout.splitlines() if s.strip()]


def is_consumed(anchor: Anchor, diff: str, staged_files: list[str]) -> bool:
    """True if the staged diff imports the anchor's basename OR modifies the
    anchored file directly. Either is a form of consumption."""
    if anchor.file in staged_files:
        # Direct edit: the file IS being modified. Treat as consumption.
        return True
    # Import name = filename without extension.
    module = Path(anchor.file).stem
    # TS/JS imports: `import ... from '.../module'` or `import ... { X } from 'module'`
    # Python imports: `from x.y.module import ...` or `import x.y.module`
    patterns = [
        rf"\bimport\b[^\n]*\b{re.escape(module)}\b",
        rf"\bfrom\b\s+[\"'][^\"']*{re.escape(module)}[\"']",
        rf"\bfrom\s+[\w.]*{re.escape(module)}\s+import\b",
    ]
    for pat in patterns:
        if re.search(pat, diff):
            return True
    return False


def auto_detect_spec(staged_files: list[str]) -> Path | None:
    """Find the most likely active spec in the staged set. Conservative:
    only consider files under docs/_internal/incoming/ that are NOT in archive."""
    candidates = [
        f for f in staged_files
        if f.startswith("docs/_internal/incoming/")
        and "/archive/" not in f
        and f.endswith(".md")
    ]
    if len(candidates) == 1:
        return ROOT / candidates[0]
    return None


def load_baseline() -> set[str]:
    if not BASELINE_PATH.exists():
        return set()
    data = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    return {f"{e['spec']}::{e['file']}:{e['line']}" for e in data}


def write_baseline(spec: str, anchors: list[Anchor]) -> None:
    entries = [
        {"spec": spec, "file": a.file, "line": a.line}
        for a in anchors
    ]
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")


def key_for(spec: str, anchor: Anchor) -> str:
    return f"{spec}::{anchor.file}:{anchor.line}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--spec", help="path to spec (default: auto-detect from staged files)")
    parser.add_argument("--strict", action="store_true", help="exit 1 on any new drift (vs baseline)")
    args = parser.parse_args(argv)

    staged_files = get_staged_files()

    spec_path: Path | None
    if args.spec:
        spec_path = ROOT / args.spec if not Path(args.spec).is_absolute() else Path(args.spec)
    else:
        spec_path = auto_detect_spec(staged_files)

    if spec_path is None:
        # No spec staged. Hook context: silent skip; CI context: also fine.
        return 0
    if not spec_path.exists():
        print(f"audit-spec-reuse: spec not found: {spec_path}", file=sys.stderr)
        return 0

    anchors = extract_anchors(spec_path.read_text(encoding="utf-8", errors="ignore"))
    if not anchors:
        return 0

    diff = get_staged_diff()
    drifted = [a for a in anchors if not is_consumed(a, diff, staged_files)]
    try:
        spec_rel = str(spec_path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        spec_rel = spec_path.name

    update_mode = os.environ.get("UPDATE_BASELINE") == "1"
    if update_mode:
        write_baseline(spec_rel, drifted)
        print(f"audit-spec-reuse: baseline updated -- {len(drifted)} known drift entr{'y' if len(drifted) == 1 else 'ies'}")
        return 0

    baseline = load_baseline()
    new_drift = [a for a in drifted if key_for(spec_rel, a) not in baseline]

    if drifted:
        print(f"audit-spec-reuse: spec {spec_rel} cites {len(anchors)} reuse anchor(s); {len(drifted)} not consumed by staged diff:")
        for a in drifted:
            tag = "REGRESSION" if key_for(spec_rel, a) not in baseline else "baselined"
            print(f"  [{tag}] {a.file}:{a.line}")

    if new_drift:
        if args.strict:
            print(f"\nREUSE-ANCHOR-DRIFT: {len(new_drift)} new drift entr{'y' if len(new_drift) == 1 else 'ies'} not in .lattice/reuse-anchor-baseline.json")
            print("Resolve options:")
            print("  1. Import the cited file's symbols in the implementation.")
            print("  2. If the spec citation is wrong, update the spec to remove the file:line.")
            print("  3. If the new drift is intentional, refresh baseline:")
            print("     UPDATE_BASELINE=1 python scripts/audit-spec-reuse.py")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
