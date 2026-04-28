#!/usr/bin/env python3
"""find-unmounted-components.py -- Built-not-mounted inventory for frontend/src.

Walks frontend/src/**/*.{tsx,ts}, parses imports (static, dynamic, re-export),
builds the import graph, runs reachability from the entrypoint (main.tsx).
Files unreachable from the entrypoint are "unmounted" -- production-ready
code that no consumer imports.

Why this exists:
  `.claude/rules/ux-audit-validate.md` Section 4 ("Built-not-mounted inventory")
  is cited by `/lattice:design` Block 1.3 and `/lattice:ux-audit-validate` to
  decide whether a missing UI is a build task or a wiring task. A stale
  snapshot misroutes that decision. This script regenerates the table from
  ground truth so the citation stays honest.

Two output classes:
  COMPONENT         -- .tsx file with capitalized exports (likely a UI component)
  HELPER            -- .ts module with exports nobody imports

Optional git-history flag classifies each entry as recent (last touched
within --recent-days) versus stale code, so reviewers can distinguish
"built and waiting to be wired" from "abandoned stub that should be deleted."

Run:
    python scripts/find-unmounted-components.py
    python scripts/find-unmounted-components.py --format markdown
    python scripts/find-unmounted-components.py --update-section4

Exit code: 0 = scan completed (always, even if unmounted files found -- this
is informational, not a defect gate). 1 = script error (e.g., missing src dir).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src"
ENTRYPOINTS = ["main.tsx"]  # relative to SRC

SCAN_EXTS = {".tsx", ".ts"}
SKIP_FRAGMENTS = ("/_archived/", "/__tests__/", "/node_modules/", "/dist/")
SKIP_SUFFIXES = (".test.tsx", ".test.ts", ".spec.tsx", ".spec.ts", ".stories.tsx", "vite-env.d.ts")

# `@/foo` resolves to `src/foo` per CLAUDE.md TypeScript Conventions.
ALIAS_PREFIX = "@/"

# Static imports + re-exports: `import X from "..."`, `export ... from "..."`,
# bare side-effect `import "..."`. The leading `from` or `import` clause may
# span lines in TS, so we match the trailing `from "..."` or bare `import "..."`.
STATIC_IMPORT_RE = re.compile(r"""(?:from|import)\s+["']([^"']+)["']""")

# Dynamic imports: `import("...")`, `lazy(() => import("..."))`.
DYNAMIC_IMPORT_RE = re.compile(r"""\bimport\s*\(\s*["']([^"']+)["']\s*\)""")

# Component heuristic: a .tsx file is "component-shaped" if it has at least
# one capital-letter export (default or named). Rules out `useFoo` hooks
# living in .tsx (rare) and pure type files. The narrower test catches the
# Section 4 cases (AuditTrailPanel, RecoveryPane) without dragging in noise.
COMPONENT_EXPORT_RE = re.compile(
    r"""^\s*export\s+(?:default\s+(?:function\s+|class\s+)?([A-Z]\w*)|"""
    r"""(?:function|class|const|let|var)\s+([A-Z]\w*))""",
    re.MULTILINE,
)


# =============================================================================
# Path resolution
# =============================================================================

def resolve_import(spec: str, importer: Path) -> Path | None:
    """Resolve a TS module specifier to a file path under SRC.

    Returns None for external packages (`react`, `lucide-react`, etc.) and
    for paths that don't resolve to a file we can lint.
    """
    if spec.startswith(ALIAS_PREFIX):
        base = SRC / spec[len(ALIAS_PREFIX):]
    elif spec.startswith("./") or spec.startswith("../"):
        base = (importer.parent / spec).resolve()
    else:
        # Bare specifier -- external package or unresolvable. Ignore.
        return None

    # Strip explicit extension if present (.tsx, .ts, .js, .jsx, .css, .json).
    # We try our own extensions; explicit `.tsx` etc. is fine because the file
    # exists at that exact path.
    candidates = []
    if base.suffix in {".tsx", ".ts", ".jsx", ".js"}:
        candidates.append(base)
    elif base.suffix in {".css", ".json", ".svg", ".png"}:
        return None  # asset, not code
    else:
        for ext in (".tsx", ".ts"):
            candidates.append(base.with_suffix(ext))
            # Also try `<base>.tsx` when base has no suffix at all
        candidates.append(base.with_name(base.name + ".tsx"))
        candidates.append(base.with_name(base.name + ".ts"))
        # Index-file fallbacks
        candidates.append(base / "index.tsx")
        candidates.append(base / "index.ts")

    for c in candidates:
        try:
            if c.is_file():
                return c.resolve()
        except OSError:
            continue
    return None


# =============================================================================
# Walk + parse
# =============================================================================

@dataclass
class FileInfo:
    path: Path
    imports: set[Path] = field(default_factory=set)
    has_component_export: bool = False
    last_commit_days: int | None = None  # None when unknown


def collect_files() -> list[Path]:
    files: list[Path] = []
    for path in SRC.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in SCAN_EXTS:
            continue
        posix = path.as_posix()
        if any(frag in posix for frag in SKIP_FRAGMENTS):
            continue
        if any(posix.endswith(suf) for suf in SKIP_SUFFIXES):
            continue
        files.append(path.resolve())
    return files


def parse_file(path: Path) -> tuple[set[str], bool]:
    """Return (set of import specifiers, has_component_export)."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return set(), False
    specs: set[str] = set()
    specs.update(STATIC_IMPORT_RE.findall(text))
    specs.update(DYNAMIC_IMPORT_RE.findall(text))
    has_component = bool(COMPONENT_EXPORT_RE.search(text)) and path.suffix == ".tsx"
    return specs, has_component


def build_graph(files: list[Path]) -> dict[Path, FileInfo]:
    graph: dict[Path, FileInfo] = {f: FileInfo(path=f) for f in files}
    file_set = set(files)
    for f in files:
        specs, has_component = parse_file(f)
        info = graph[f]
        info.has_component_export = has_component
        for spec in specs:
            target = resolve_import(spec, f)
            if target is None:
                continue
            if target not in file_set:
                # Resolved to a file outside our scan set (e.g., a .css
                # import we already filtered, or a target that didn't pass
                # the SKIP filters). Ignore -- nothing for the graph.
                continue
            info.imports.add(target)
    return graph


def compute_reachable(graph: dict[Path, FileInfo], entrypoints: list[Path]) -> set[Path]:
    """BFS from entrypoints over the import graph."""
    reachable: set[Path] = set()
    queue: list[Path] = [e for e in entrypoints if e in graph]
    while queue:
        node = queue.pop()
        if node in reachable:
            continue
        reachable.add(node)
        for target in graph[node].imports:
            if target not in reachable:
                queue.append(target)
    return reachable


# =============================================================================
# Git age (best-effort; no failure if git absent)
# =============================================================================

def fetch_last_commit_days(path: Path) -> int | None:
    """Days since the file was last touched in git. None if git unavailable."""
    try:
        rel = path.relative_to(ROOT).as_posix()
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", rel],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        import time
        ts = int(result.stdout.strip())
        return int((time.time() - ts) / 86400)
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return None


# =============================================================================
# Output formatting
# =============================================================================

@dataclass
class UnmountedEntry:
    path: Path
    classification: str  # "COMPONENT" | "HELPER"
    last_commit_days: int | None


def classify_entries(graph: dict[Path, FileInfo], reachable: set[Path]) -> list[UnmountedEntry]:
    entries: list[UnmountedEntry] = []
    for path, info in graph.items():
        if path in reachable:
            continue
        if info.has_component_export:
            classification = "COMPONENT"
        elif path.suffix == ".ts":
            classification = "HELPER"
        else:
            # .tsx without a component-shaped export -- unusual but possible
            # (e.g., a JSX util file). Treat as HELPER so it surfaces but
            # doesn't pollute the COMPONENT bucket.
            classification = "HELPER"
        entries.append(UnmountedEntry(
            path=path,
            classification=classification,
            last_commit_days=info.last_commit_days,
        ))
    entries.sort(key=lambda e: (e.classification, e.path.as_posix()))
    return entries


def format_text(entries: list[UnmountedEntry], stats: dict) -> str:
    lines: list[str] = []
    lines.append(f"Unmounted-component scan: {stats['files']} files, "
                 f"{stats['edges']} import edges, "
                 f"{stats['reachable']} reachable from entrypoints")
    lines.append("")
    if not entries:
        lines.append("CLEAN -- every code file is reachable from main.tsx")
        return "\n".join(lines)

    by_class: dict[str, list[UnmountedEntry]] = defaultdict(list)
    for e in entries:
        by_class[e.classification].append(e)

    for cls in ("COMPONENT", "HELPER"):
        items = by_class.get(cls, [])
        if not items:
            continue
        lines.append(f"=== {cls} ({len(items)}) ===")
        for e in items:
            rel = e.path.relative_to(ROOT).as_posix()
            age = f"{e.last_commit_days}d" if e.last_commit_days is not None else "?"
            lines.append(f"  {rel}  [last touched: {age}]")
        lines.append("")
    return "\n".join(lines)


def format_markdown_table(entries: list[UnmountedEntry]) -> str:
    """Produce the Markdown chunk that lives between AUTOGEN markers in
    `.claude/rules/ux-audit-validate.md` Section 4. Header + rows."""
    lines: list[str] = []
    lines.append("| Component | Path | Class | Last touched (git) |")
    lines.append("|---|---|---|---|")
    if not entries:
        lines.append("| _none_ | _every code file is reachable from `main.tsx`_ | -- | -- |")
        return "\n".join(lines)
    for e in entries:
        rel = e.path.relative_to(ROOT).as_posix()
        name = e.path.name
        age = f"{e.last_commit_days}d ago" if e.last_commit_days is not None else "unknown"
        lines.append(f"| `{name}` | `{rel}` | {e.classification} | {age} |")
    return "\n".join(lines)


# =============================================================================
# Section 4 update
# =============================================================================

SECTION4_FILE = ROOT / ".claude" / "rules" / "ux-audit-validate.md"
AUTOGEN_BEGIN = "<!-- AUTOGEN:built-not-mounted BEGIN -- regenerated by scripts/find-unmounted-components.py -->"
AUTOGEN_END = "<!-- AUTOGEN:built-not-mounted END -->"


def update_section4(table_md: str) -> bool:
    """Replace the autogen block in ux-audit-validate.md with the fresh table.

    Returns True if the file was modified, False if no markers were found
    (caller is responsible for adding markers on first run).
    """
    if not SECTION4_FILE.exists():
        return False
    text = SECTION4_FILE.read_text(encoding="utf-8")
    begin_idx = text.find(AUTOGEN_BEGIN)
    end_idx = text.find(AUTOGEN_END)
    if begin_idx < 0 or end_idx < 0 or end_idx < begin_idx:
        return False
    new_block = (
        AUTOGEN_BEGIN
        + "\n\n"
        + table_md
        + "\n\n"
        + AUTOGEN_END
    )
    new_text = text[:begin_idx] + new_block + text[end_idx + len(AUTOGEN_END):]
    if new_text == text:
        return False
    SECTION4_FILE.write_text(new_text, encoding="utf-8")
    return True


# =============================================================================
# Driver
# =============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["text", "markdown", "json"], default="text",
                        help="output format (default: text)")
    parser.add_argument("--update-section4", action="store_true",
                        help="rewrite the AUTOGEN block in .claude/rules/ux-audit-validate.md")
    parser.add_argument("--no-git", action="store_true",
                        help="skip per-file git-age lookup (faster)")
    args = parser.parse_args()

    if not SRC.exists():
        print(f"ERROR: frontend/src not found at {SRC}", file=sys.stderr)
        return 1

    files = collect_files()
    graph = build_graph(files)
    edges = sum(len(info.imports) for info in graph.values())

    entrypoints = [(SRC / e).resolve() for e in ENTRYPOINTS]
    reachable = compute_reachable(graph, entrypoints)

    if not args.no_git:
        for path, info in graph.items():
            if path in reachable:
                continue
            info.last_commit_days = fetch_last_commit_days(path)

    entries = classify_entries(graph, reachable)
    stats = {"files": len(files), "edges": edges, "reachable": len(reachable)}

    if args.format == "json":
        import json
        payload = {
            "stats": stats,
            "entries": [
                {
                    "path": e.path.relative_to(ROOT).as_posix(),
                    "name": e.path.name,
                    "classification": e.classification,
                    "last_commit_days": e.last_commit_days,
                }
                for e in entries
            ],
        }
        print(json.dumps(payload, indent=2))
    elif args.format == "markdown":
        print(format_markdown_table(entries))
    else:
        print(format_text(entries, stats))

    if args.update_section4:
        table = format_markdown_table(entries)
        if update_section4(table):
            print(f"\nUpdated {SECTION4_FILE.relative_to(ROOT).as_posix()}", file=sys.stderr)
        else:
            print(f"\nWARNING: AUTOGEN markers not found in "
                  f"{SECTION4_FILE.relative_to(ROOT).as_posix()}; no update applied.",
                  file=sys.stderr)
            print(f"  Add this block to Section 4:\n  {AUTOGEN_BEGIN}\n  ...\n  {AUTOGEN_END}",
                  file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
