#!/usr/bin/env python3
"""audit-contract-triangles.py -- Verify the contract triangle registry.

Reads docs/_internal/knowledge/contract-triangles.md and runs two checks:

1. **Citation freshness:** every cited `path/file.ext:line` in the registry
   resolves to an existing file with the cited line in range.

2. **Subset straggler scan:** for each triangle whose body contains a
   `Vocabulary: {"a", "b", ...}` declaration, scan the registered scan
   directories for lines that literally contain a proper subset of the
   vocabulary (size |V|-1) without any of the missing values. This catches
   the BFIELD-21 shape: implementation has 4 values, but a test or doc
   asserts only 3 ({"adverse", "warning", "normal"} present, "not_assessed"
   absent).

Opt out by adding `triangle-audit:exempt` somewhere on the offending line.
The exemption MUST carry a justification per CLAUDE.md rule 14.

Exit codes:
  0  PASS  all citations resolve, no subset stragglers
  1  FAIL  drift detected
  2  CONFIG ERROR  registry missing / unparseable

Usage:
  python scripts/audit-contract-triangles.py [--registry PATH] [--root DIR]

CLAUDE.md rule 18 / COMMIT-CHECKLIST item 12 / /lattice:review TRIANGLE check.
"""

from __future__ import annotations

import argparse
import re
import sys
from itertools import combinations
from pathlib import Path

REGISTRY_DEFAULT = "docs/_internal/knowledge/contract-triangles.md"

SCAN_DIRS = [
    "backend/tests",
    "backend/services/analysis",
    "backend/generator",
    "docs/_internal/knowledge",
    "docs/_internal/architecture",
    "frontend/src/types",
    "frontend/src/lib",
    "frontend/src/components",
    "frontend/src/hooks",
    "frontend/src/contexts",
    "shared/rules",
    "shared/config",
]

SKIP_FRAGMENTS = ["/__pycache__/", "/node_modules/", "/_archived/", "/dist/", "/build/"]
SCAN_EXTENSIONS = {".py", ".ts", ".tsx", ".md", ".json", ".js"}

OPT_OUT_MARKER = "triangle-audit:exempt"


def parse_registry(path: Path) -> list[dict]:
    """Extract triangles from the registry markdown.

    A triangle is a `## ...` or `### ...` section that contains a line of
    the form ``Vocabulary: `{...}` `` somewhere in its body.
    """
    text = path.read_text(encoding="utf-8")
    triangles: list[dict] = []

    # Split on either "## " or "### " section markers
    sections = re.split(r"^#{2,3} ", text, flags=re.M)
    for sec in sections[1:]:
        lines = sec.split("\n", 1)
        title = lines[0].strip()
        body = lines[1] if len(lines) > 1 else ""
        # Stop at next horizontal rule (--- on its own line)
        body = re.split(r"^---\s*$", body, flags=re.M)[0]

        vocab_match = re.search(r"Vocabulary:\s*`\{([^}]+)\}`", body)
        if not vocab_match:
            continue
        raw_values = vocab_match.group(1)
        values = [v.strip().strip('"').strip("'") for v in raw_values.split(",")]
        values = [v for v in values if v]
        if len(values) < 2:
            continue

        # File:line citations: backtick-quoted `path/file.ext:N` or
        # `path/file.ext:N,M,O` or `path/file.ext` (no line). Also accept
        # ranges: `file.ext:60-77`.
        citations: list[tuple[str, list[int]]] = []
        for m in re.finditer(
            r"`([A-Za-z0-9_./\\-]+\.[A-Za-z]+)(?::([\d,\-]+))?`",
            body,
        ):
            file_path = m.group(1).replace("\\", "/")
            lines_str = m.group(2)
            line_nums: list[int] = []
            if lines_str:
                for part in lines_str.split(","):
                    part = part.strip()
                    if "-" in part:
                        start, end = part.split("-", 1)
                        try:
                            line_nums.extend(range(int(start), int(end) + 1))
                        except ValueError:
                            pass
                    else:
                        try:
                            line_nums.append(int(part))
                        except ValueError:
                            pass
            citations.append((file_path, line_nums))

        triangles.append(
            {
                "name": title,
                "vocabulary": set(values),
                "citations": citations,
            }
        )

    return triangles


def _resolve_bare_basename(name: str, root: Path) -> Path | None:
    """Resolve a citation that lacks a fully-qualified path.

    Handles two cases:
      - Bare basename (`analysis.ts`): search SCAN_DIRS for a unique match.
      - Partial path (`lib/derive-summaries.ts`): search SCAN_DIRS for files
        whose path ends with the partial path.

    Returns the resolved path if found unambiguously, else None.
    """
    name_normalized = name.replace("\\", "/")
    is_bare = "/" not in name_normalized
    matches: list[Path] = []
    for scan_dir in SCAN_DIRS:
        base = root / scan_dir
        if not base.exists():
            continue
        if is_bare:
            iterator = base.rglob(name_normalized)
        else:
            # Search for files ending with the partial path
            basename = name_normalized.rsplit("/", 1)[-1]
            iterator = (
                f for f in base.rglob(basename)
                if f.as_posix().endswith("/" + name_normalized)
            )
        for f in iterator:
            if f.is_file() and not any(skip in f.as_posix() for skip in SKIP_FRAGMENTS):
                matches.append(f)
    # Deduplicate (rglob can sometimes hit the same file via overlapping scan dirs)
    matches = list({m.resolve(): m for m in matches}.values())
    if len(matches) == 1:
        return matches[0]
    return None


def check_citations(triangles: list[dict], root: Path) -> list[str]:
    failures: list[str] = []
    for t in triangles:
        for file_path, line_nums in t["citations"]:
            full = root / file_path
            if not full.exists():
                # Try resolving bare basenames (`analysis.ts` -> `frontend/src/types/analysis.ts`)
                resolved = _resolve_bare_basename(file_path, root)
                if resolved is None:
                    failures.append(
                        f"  TRIANGLE {t['name']!r}: cited file does not exist or ambiguous: {file_path}"
                    )
                    continue
                full = resolved
            if line_nums:
                try:
                    n = sum(1 for _ in full.open(encoding="utf-8", errors="replace"))
                except Exception:
                    continue
                bad = [ln for ln in line_nums if ln > n]
                if bad:
                    failures.append(
                        f"  TRIANGLE {t['name']!r}: {file_path} cites lines "
                        f"{bad} but file has only {n} lines (drift)"
                    )
    return failures


def _value_present(line: str, value: str) -> bool:
    """True if `value` appears on `line` as a quoted string or word-bounded."""
    # Quoted: "value", 'value', `value`
    if re.search(rf'["\'`]{re.escape(value)}["\'`]', line):
        return True
    # Word-bounded (catches TS unions like `adverse | warning`)
    if re.search(rf'\b{re.escape(value)}\b', line):
        return True
    return False


def find_subset_stragglers(
    triangles: list[dict], root: Path, registry_path: Path
) -> list[str]:
    findings: list[str] = []
    registry_resolved = registry_path.resolve()

    for t in triangles:
        vocab = t["vocabulary"]
        if len(vocab) < 3:
            continue
        # Generate all proper subsets of size |V|-1
        subsets: list[tuple[set[str], set[str]]] = []
        for combo in combinations(sorted(vocab), len(vocab) - 1):
            subset_set = set(combo)
            missing = vocab - subset_set
            subsets.append((subset_set, missing))

        for scan_dir in SCAN_DIRS:
            base = root / scan_dir
            if not base.exists():
                continue
            for f in base.rglob("*"):
                if not f.is_file():
                    continue
                f_str = str(f).replace("\\", "/")
                if any(skip in f_str for skip in SKIP_FRAGMENTS):
                    continue
                if f.suffix not in SCAN_EXTENSIONS:
                    continue
                # Skip the registry file itself (it intentionally lists vocabularies)
                if f.resolve() == registry_resolved:
                    continue

                try:
                    text = f.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    continue

                for line_no, line in enumerate(text.split("\n"), 1):
                    if OPT_OUT_MARKER in line:
                        continue
                    for subset_set, missing in subsets:
                        if not all(_value_present(line, v) for v in subset_set):
                            continue
                        if any(_value_present(line, v) for v in missing):
                            continue
                        rel = f.relative_to(root).as_posix()
                        findings.append(
                            f"  TRIANGLE {t['name']!r}: subset straggler at {rel}:{line_no}\n"
                            f"    present: {sorted(subset_set)}  missing: {sorted(missing)}\n"
                            f"    line:    {line.strip()[:140]}"
                        )
                        break  # one subset hit per line is enough
    return findings


BASELINE_DEFAULT = "scripts/data/triangle-audit-baseline.txt"


def _normalize_finding(finding: str) -> str:
    """Reduce a multi-line finding to its identity (file:line + subset signature).

    Used for baseline diffing. Strips the source-line content (which can shift
    by ASCII fallback) and any per-line leading whitespace differences.
    """
    lines = finding.split("\n")
    # Take first 2 lines (TRIANGLE header + present/missing signature),
    # strip per-line whitespace so indentation differences don't cause misses.
    return "\n".join(line.strip() for line in lines[:2])


def _load_baseline(path: Path) -> set[str]:
    if not path.exists():
        return set()
    text = path.read_text(encoding="utf-8")
    # Each baseline entry is separated by a blank line
    entries = [e for e in text.split("\n\n") if e.strip()]
    return {_normalize_finding(e) for e in entries}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--registry", default=REGISTRY_DEFAULT)
    parser.add_argument("--root", default=".")
    parser.add_argument("--no-subset-scan", action="store_true",
                        help="Run citation check only (skip subset straggler scan)")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress informational output; only print failures")
    parser.add_argument("--baseline", default=BASELINE_DEFAULT,
                        help=f"Baseline file of pre-existing stragglers (default: {BASELINE_DEFAULT}). "
                             "Only NEW stragglers cause failure. Pass empty string to disable.")
    parser.add_argument("--write-baseline", action="store_true",
                        help="Write current findings to the baseline file and exit 0. "
                             "Use after intentionally accepting current state as the new baseline.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    registry = root / args.registry

    if not registry.exists():
        print(f"ERROR: registry not found at {registry}", file=sys.stderr)
        return 2

    triangles = parse_registry(registry)
    if not triangles:
        print(f"ERROR: no triangles with explicit Vocabulary parsed from {registry}", file=sys.stderr)
        return 2

    if not args.quiet:
        print(f"Loaded {len(triangles)} triangle(s) from {registry.relative_to(root).as_posix()}:")
        for t in triangles:
            print(f"  - {t['name']}")
            print(f"      vocabulary: {sorted(t['vocabulary'])}")
            print(f"      citations:  {len(t['citations'])}")

    citation_fails = check_citations(triangles, root)
    subset_fails = [] if args.no_subset_scan else find_subset_stragglers(triangles, root, registry)
    all_fails = citation_fails + subset_fails

    # Handle --write-baseline mode: dump current findings and exit
    if args.write_baseline:
        baseline_path = root / args.baseline
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        text = "\n\n".join(all_fails) + "\n" if all_fails else ""
        baseline_path.write_text(text, encoding="utf-8")
        print(f"Wrote {len(all_fails)} entries to {baseline_path.relative_to(root).as_posix()}")
        return 0

    # Baseline diff: only NEW findings (not in baseline) cause failure
    baseline_set: set[str] = set()
    if args.baseline:
        baseline_set = _load_baseline(root / args.baseline)

    new_fails = [f for f in all_fails if _normalize_finding(f) not in baseline_set]
    accepted = len(all_fails) - len(new_fails)

    def _print(line: str) -> None:
        try:
            print(line)
        except UnicodeEncodeError:
            print(line.encode("ascii", "replace").decode("ascii"))

    if new_fails:
        _print(f"\nTRIANGLE: FAIL ({len(new_fails)} NEW stragglers; {accepted} accepted via baseline)")
        for line in new_fails:
            _print(line)
        _print(f"\nTo accept new stragglers as baseline (only after explicit triage):")
        _print(f"  python {Path(__file__).name} --write-baseline")
        return 1

    if not args.quiet:
        if accepted:
            _print(f"\nTRIANGLE: PASS -- {accepted} known straggler(s) in baseline; no new ones")
        else:
            _print("\nTRIANGLE: PASS -- all citations resolve, no subset stragglers detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
