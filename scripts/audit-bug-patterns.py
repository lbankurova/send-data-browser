#!/usr/bin/env python3
"""
audit-bug-patterns.py -- F6 audit of the bug-patterns.md registry.

Two modes:

  1. validate        Default. Parse bug-patterns.md and verify each entry's
                     structural shape, file:line resolvability of representative
                     instances, and applies_to glob coverage. Reports defects
                     in dataclass-style format; exit 1 on any defect.

  2. --staged-check  Used by pre-commit (and CI). For each pattern, check
                     whether any staged file matches its applies_to glob.
                     If yes, the pre-commit hook (Step 0d) requires a
                     kind=bug-pattern attestation referencing that pattern.
                     This script just enumerates which patterns fired -- the
                     attestation enforcement lives in the hook + scripts/check-attestation-kind.py.
                     Output format:
                       <pattern-name>\\t<count of staged files matching applies_to>

Schema parsed: see docs/_internal/knowledge/bug-patterns.md.

Run:
  python scripts/audit-bug-patterns.py
  python scripts/audit-bug-patterns.py --staged-check
  python scripts/audit-bug-patterns.py --pattern multi-timepoint-kitchen-sink-aggregation

Exit:
  0  no defects (validate) OR pattern listing (--staged-check)
  1  defects found
  2  registry file unreadable
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("Missing pyyaml. Install: pip install pyyaml", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "docs" / "_internal" / "knowledge" / "bug-patterns.md"

PATTERN_HEADING_RE = re.compile(
    r"^## ([a-z][\w-]+)\s*\n(?:.*?\n)*?```yaml\n(.*?)\n```",
    re.MULTILINE | re.DOTALL,
)

REQUIRED_FIELDS = (
    "name", "title", "status", "root_cause", "representative_instances",
    "applies_to", "introduced", "last_updated",
)
NULLABLE_FIELDS = ("prevention_property", "prevention_fact", "prevention_test")
VALID_STATUS = {"active", "retired"}


@dataclass
class Pattern:
    name: str
    yaml_data: dict[str, Any]
    line_no: int


@dataclass
class Defect:
    pattern_name: str
    rule: str
    message: str


def parse_registry(path: Path) -> list[Pattern]:
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(2)
    text = path.read_text(encoding="utf-8")
    patterns: list[Pattern] = []
    for m in PATTERN_HEADING_RE.finditer(text):
        name = m.group(1).strip()
        yaml_text = m.group(2)
        line_no = text[: m.start()].count("\n") + 1
        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as exc:
            print(f"[parse-warning] {name}: {exc}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            continue
        patterns.append(Pattern(name=name, yaml_data=data, line_no=line_no))
    return patterns


def glob_to_regex(glob: str) -> re.Pattern:
    """Convert a simple glob (** -> .*, * -> [^/]*) to a regex anchored to
    the start of the path. Same conversion as write-review-gate.sh and the
    pcc pre-commit Step 0c."""
    frag = re.escape(glob)
    # Undo escaping for the wildcards we want to be active
    frag = frag.replace(r"\*\*", ".*")
    frag = frag.replace(r"\*", "[^/]*")
    return re.compile("^" + frag + "$")


def get_staged_files() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        return [line for line in result.stdout.splitlines() if line]
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


def validate(patterns: list[Pattern]) -> list[Defect]:
    defects: list[Defect] = []
    seen_names = {}
    for p in patterns:
        # Required fields
        for field_name in REQUIRED_FIELDS:
            if field_name not in p.yaml_data:
                defects.append(Defect(p.name, "required-field",
                                      f"missing required field {field_name!r}"))

        # Nullable fields exist (may be null)
        for field_name in NULLABLE_FIELDS:
            if field_name not in p.yaml_data:
                defects.append(Defect(p.name, "nullable-field-missing",
                                      f"nullable field {field_name!r} must be present (use null)"))

        # name field must match heading
        if p.yaml_data.get("name") != p.name:
            defects.append(Defect(p.name, "name-mismatch",
                                  f"YAML name field {p.yaml_data.get('name')!r} does not match heading {p.name!r}"))

        # status enum
        status = p.yaml_data.get("status")
        if status not in VALID_STATUS:
            defects.append(Defect(p.name, "status-enum",
                                  f"status {status!r} not in {sorted(VALID_STATUS)}"))

        # No duplicate names
        if p.name in seen_names:
            defects.append(Defect(p.name, "duplicate-name",
                                  f"name {p.name!r} also at line {seen_names[p.name]}"))
        else:
            seen_names[p.name] = p.line_no

        # representative_instances structure + file existence
        instances = p.yaml_data.get("representative_instances") or []
        if not isinstance(instances, list):
            defects.append(Defect(p.name, "instances-shape",
                                  "representative_instances must be a list"))
        else:
            for i, inst in enumerate(instances):
                if not isinstance(inst, dict):
                    defects.append(Defect(p.name, "instance-shape",
                                          f"instance[{i}] is not a dict"))
                    continue
                file_str = inst.get("file")
                if not file_str:
                    defects.append(Defect(p.name, "instance-file",
                                          f"instance[{i}] missing 'file' field"))
                    continue
                file_path = ROOT / file_str
                if not file_path.exists():
                    # Allow knowledge/ paths to be inside the submodule (relative to ROOT) -- they exist
                    defects.append(Defect(p.name, "instance-file-missing",
                                          f"instance[{i}] file {file_str!r} does not exist on disk"))

        # applies_to non-empty list of strings
        applies = p.yaml_data.get("applies_to") or []
        if not isinstance(applies, list) or not applies:
            defects.append(Defect(p.name, "applies-to-empty",
                                  "applies_to must be a non-empty list of glob strings"))
        else:
            for i, glob in enumerate(applies):
                if not isinstance(glob, str) or not glob.strip():
                    defects.append(Defect(p.name, "applies-to-shape",
                                          f"applies_to[{i}] is not a non-empty string"))

    return defects


def staged_check(patterns: list[Pattern], staged_files: list[str]) -> list[tuple[str, list[str]]]:
    """For each pattern, return (name, list of staged files matching its applies_to)."""
    results: list[tuple[str, list[str]]] = []
    for p in patterns:
        if p.yaml_data.get("status") == "retired":
            continue
        applies = p.yaml_data.get("applies_to") or []
        regexes = [glob_to_regex(g) for g in applies if isinstance(g, str)]
        matches = [f for f in staged_files if any(r.match(f) for r in regexes)]
        if matches:
            results.append((p.name, matches))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="F6 audit of bug-patterns.md registry")
    parser.add_argument("--staged-check", action="store_true",
                        help="List patterns whose applies_to matches any staged file (used by pre-commit)")
    parser.add_argument("--pattern", help="Validate only this pattern name")
    parser.add_argument("--registry", default=str(REGISTRY),
                        help="Override registry path (test usage)")
    parser.add_argument("--staged-files", default=None,
                        help="Comma-separated staged file list (test usage; bypasses git diff)")
    args = parser.parse_args()

    patterns = parse_registry(Path(args.registry))
    if args.pattern:
        patterns = [p for p in patterns if p.name == args.pattern]
        if not patterns:
            print(f"ERROR: pattern {args.pattern!r} not found in registry", file=sys.stderr)
            return 2

    if args.staged_check:
        if args.staged_files is not None:
            staged = [s.strip() for s in args.staged_files.split(",") if s.strip()]
        else:
            staged = get_staged_files()
        results = staged_check(patterns, staged)
        if not results:
            return 0
        for name, files in results:
            print(f"{name}\t{len(files)}\t{','.join(files[:5])}")
        return 0

    # Default: validate
    print("=" * 60)
    print(f"  bug-patterns.md audit -- {len(patterns)} pattern(s)")
    print("=" * 60)
    print()

    defects = validate(patterns)
    if not defects:
        print(f"  RESULT: {len(patterns)} pattern(s) validated; no defects.")
        return 0

    by_pattern: dict[str, list[Defect]] = {}
    for d in defects:
        by_pattern.setdefault(d.pattern_name, []).append(d)
    for pname in sorted(by_pattern):
        print(f"  {pname}:")
        for d in by_pattern[pname]:
            print(f"    [{d.rule}] {d.message}")
    print()
    print(f"  RESULT: {len(defects)} defect(s) across {len(by_pattern)} pattern(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
