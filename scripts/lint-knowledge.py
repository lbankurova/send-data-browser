#!/usr/bin/env python3
"""lint-knowledge.py -- Generic linter for the stable-ID knowledge registries.

Lints the five registries that carry stable IDs cited from code per
`docs/_internal/knowledge/CONVENTIONS.md`:

  - methods-index.md       (STAT-NN / METH-NN / CLASS-NN / ASSAY-NN)  cited via @method
  - field-contracts-index.md  (FIELD-NN / BFIELD-NN)                  cited via @field
  - dependencies.md        (varied uppercase IDs)                     cited via @depends
  - species-profiles.md    (SPECIES-NN / STRAIN-NN-XX)                cited via @species, @strain
  - vehicle-profiles.md    (VEHICLE-NN / ROUTE-NN)                    cited via @vehicle, @route

Three checks:

1. **id-uniqueness** -- within each registry, every ID appears exactly once.
   Duplicates are errors: code citing the duplicate ID has no canonical
   target.

2. **citation-resolution** -- every `@<tag> <ID>` citation in the codebase
   resolves to an entry in the corresponding registry. Unresolved citations
   are errors: the code claims a stable knowledge anchor that doesn't exist.

3. **orphan-detection** -- every entry in a registry is cited at least once
   from code (warning, not error). Orphans surface as informational
   backlog so dead knowledge entries don't accumulate silently. Stub
   exemption: entries whose body contains "stubbed" / "no API yet" / "always"
   are exempt (per CONVENTIONS.md examples).

Domain-specific typed-schema audits (e.g., audit-knowledge-graph.py for
the typed-fact knowledge graph, audit-contract-triangles.py for the
contract triangle registry) run separately. This linter is structural
ID/citation hygiene only.

Run: python scripts/lint-knowledge.py
Exit code: 0 = clean (or warnings only); 1 = errors found.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# =============================================================================
# Registry config
# =============================================================================

# Each registry declares: where it lives, how to parse IDs out of it, the
# regex an ID must match, and which @-tags in code cite it.
REGISTRIES: list[dict] = [
    {
        "name": "methods",
        "path": "docs/_internal/knowledge/methods-index.md",
        "parser": "table",       # markdown `| ID | ... |` rows
        "id_regex": r"^(?:STAT|METH|CLASS|ASSAY|SCORE|AGG)-[0-9]+[a-z]?$",
        "tags": ["method"],
    },
    {
        "name": "field-contracts",
        "path": "docs/_internal/knowledge/field-contracts-index.md",
        "parser": "table",
        "id_regex": r"^B?FIELD-[0-9]+[a-z]?$",
        "tags": ["field"],
    },
    {
        "name": "dependencies",
        "path": "docs/_internal/knowledge/dependencies.md",
        "parser": "h3",          # H3 headings `### <ID> [-- name]`
        "id_regex": r"^[A-Z][A-Z0-9.-]*[A-Z0-9]$",
        "tags": ["depends"],
    },
    {
        "name": "species",
        "path": "docs/_internal/knowledge/species-profiles.md",
        "parser": "h3",
        "id_regex": r"^(?:SPECIES|STRAIN)-[0-9A-Z][0-9A-Z-]*$",
        "tags": ["species", "strain"],
    },
    {
        "name": "vehicle",
        "path": "docs/_internal/knowledge/vehicle-profiles.md",
        "parser": "h3",
        "id_regex": r"^(?:VEHICLE|ROUTE)-[0-9]+$",
        "tags": ["vehicle", "route"],
    },
]

# Code roots scanned for citations. Skip generated / archived / vendored.
SCAN_ROOTS = ["backend", "frontend/src", "shared"]
SCAN_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx"}
SKIP_FRAGMENTS = ("/__pycache__/", "/node_modules/", "/_archived/", "/dist/", "/build/", "/.venv-core/")

# Stub-marker phrases inside a registry entry body that exempt it from
# orphan-detection. Per CONVENTIONS.md ("Stubbed Dependencies" section).
STUB_MARKERS = ("stubbed", "no api yet", "hand-seeded", "always", "deferred")

# =============================================================================
# Content-drift checks (LIT-01) — knowledge-corpus body scanner
# =============================================================================

# Knowledge files scanned for content drift. Distinct from the citation
# registries above (which are scanned for IDs); this is the broader corpus.
KNOWLEDGE_DIR = "docs/_internal/knowledge"

# Inline file:line citations inside knowledge bodies, e.g.
#   `backend/tests/test_bfield_contracts.py:60-77` (`SEVERITY_ENUM`)
# Captures: (path, line_spec, optional symbol-hint).
FILE_LINE_RE = re.compile(
    r"`([\w./-]+\.(?:py|tsx?|jsx?)):([0-9][0-9,\-]*)`"
    r"(?:\s*\(\s*`([^`]+)`)?"
)

# Relative-tense markers — break the future-reader convention (Ahrens). A
# knowledge file should read the same in 2027 as in 2026, so it cannot
# anchor on conversational time. The list is intentionally tight: each
# phrase is a known failure mode, not a stylistic preference.
FUTURE_READER_PATTERNS = [
    re.compile(r"\bas (?:we )?discussed (?:above|earlier|before|previously)\b", re.IGNORECASE),
    re.compile(r"\bin the previous section\b", re.IGNORECASE),
    re.compile(r"\bwe (?:recently|just) (?:decided|added|agreed|chose|landed)\b", re.IGNORECASE),
    re.compile(r"\b(?:today|this morning|yesterday)\b.{0,40}\b(?:decided|added|chose|landed|shipped)\b", re.IGNORECASE),
    re.compile(r"\bin the meeting (?:today|yesterday|this week|last week)\b", re.IGNORECASE),
]

# Range of lines around a cited line to search for a symbol-hint match.
# Anchored on the empirical case `_assess_all_findings` in
# `findings_pipeline.py` (def line 838, cited body 865-885 -- a 27-47 line
# gap between def and cited body). At 25 the def line falls outside the
# window and the symbol search emits a false positive on a correctly-cited
# function. 50 accommodates this gap with margin. The check still fires on
# genuinely-renamed symbols (file-existence + zero-window-match catches
# rename regardless of window size); the window only governs the
# "function moved within its file" failure mode.
SYMBOL_PROXIMITY_LINES = 50

# Only verify file:line citations whose path starts with one of these
# top-level prefixes. Knowledge bodies frequently use shorthand citations
# like `analysis.ts:77` or `lib/derive-summaries.ts:684` that are relative
# to a previously-cited file in the same row — those are not mechanically
# resolvable, so the check skips them rather than emitting false positives.
PROJECT_ROOT_PREFIXES = (
    "backend/", "frontend/", "shared/", "docs/", "scripts/",
    "tests/", "send/", ".lattice/",
)


# =============================================================================
# Parsers
# =============================================================================

@dataclass
class Entry:
    registry: str
    entry_id: str
    line_no: int
    body: str = ""    # surrounding text used for stub-marker detection


def parse_table_registry(path: Path, registry_name: str, id_regex: re.Pattern) -> list[Entry]:
    """Extract IDs from markdown table rows of the form `| <ID> | ... | ... |`."""
    entries: list[Entry] = []
    text = path.read_text(encoding="utf-8")
    for line_no, line in enumerate(text.splitlines(), start=1):
        # Match `|` then optional whitespace then capture token up to next `|`
        m = re.match(r"\s*\|\s*([A-Z][A-Z0-9.-]*[A-Za-z0-9])\s*\|", line)
        if not m:
            continue
        entry_id = m.group(1).strip()
        if not id_regex.match(entry_id):
            continue
        entries.append(Entry(registry=registry_name, entry_id=entry_id, line_no=line_no, body=line))
    return entries


def parse_h3_registry(path: Path, registry_name: str, id_regex: re.Pattern) -> list[Entry]:
    """Extract IDs from H3 headings of the form `### <ID> [-- name]`.

    The body is the section text up to the next H3 / H2 / horizontal rule;
    used for stub-marker detection.
    """
    entries: list[Entry] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    # First pass: collect H3 line numbers + IDs
    raw: list[tuple[int, str]] = []
    for line_no, line in enumerate(lines, start=1):
        m = re.match(r"^### ([A-Z][A-Z0-9.-]*[A-Za-z0-9])(?:\s|$)", line)
        if not m:
            continue
        entry_id = m.group(1).strip()
        if not id_regex.match(entry_id):
            continue
        raw.append((line_no, entry_id))
    # Second pass: extract body up to next H3 / H2 / HR
    for i, (line_no, entry_id) in enumerate(raw):
        body_start = line_no  # 1-indexed
        body_end = raw[i + 1][0] - 1 if i + 1 < len(raw) else len(lines)
        body = "\n".join(lines[body_start:body_end])
        entries.append(Entry(registry=registry_name, entry_id=entry_id, line_no=line_no, body=body))
    return entries


def parse_registry(config: dict) -> list[Entry]:
    path = ROOT / config["path"]
    if not path.exists():
        return []
    id_regex = re.compile(config["id_regex"])
    if config["parser"] == "table":
        return parse_table_registry(path, config["name"], id_regex)
    if config["parser"] == "h3":
        return parse_h3_registry(path, config["name"], id_regex)
    raise ValueError(f"unknown parser: {config['parser']}")


# =============================================================================
# Citation scanner
# =============================================================================

@dataclass
class Citation:
    tag: str          # method | field | depends | species | strain | vehicle | route
    cited_id: str
    file_path: Path
    line_no: int


# Captures `@<tag> <ID>` where tag is one of our registered tags.
ALL_TAGS = sorted({t for cfg in REGISTRIES for t in cfg["tags"]})
CITATION_RE = re.compile(
    rf"@({'|'.join(ALL_TAGS)})\s+([A-Z][A-Z0-9.-]*[A-Za-z0-9])"
)


def scan_citations(roots: list[Path]) -> list[Citation]:
    citations: list[Citation] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTS:
                continue
            posix = path.as_posix()
            if any(frag in posix for frag in SKIP_FRAGMENTS):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                for m in CITATION_RE.finditer(line):
                    citations.append(Citation(
                        tag=m.group(1),
                        cited_id=m.group(2),
                        file_path=path,
                        line_no=line_no,
                    ))
    return citations


# =============================================================================
# Defect dataclass + checks
# =============================================================================

@dataclass
class Defect:
    severity: str       # "error" | "warning"
    rule: str
    message: str


def check_id_uniqueness(entries_by_registry: dict[str, list[Entry]]) -> list[Defect]:
    defects: list[Defect] = []
    for registry_name, entries in entries_by_registry.items():
        seen: dict[str, list[int]] = {}
        for e in entries:
            seen.setdefault(e.entry_id, []).append(e.line_no)
        for entry_id, line_nos in seen.items():
            if len(line_nos) > 1:
                defects.append(Defect(
                    severity="error",
                    rule="id-uniqueness",
                    message=f"[{registry_name}] duplicate ID {entry_id} at lines {line_nos}",
                ))
    return defects


def check_citation_resolution(
    citations: list[Citation],
    entries_by_registry: dict[str, list[Entry]],
    registries: list[dict],
) -> list[Defect]:
    """Every cited ID must resolve to an entry in the registry that owns its tag."""
    # Build tag -> registry-name lookup
    tag_to_registry = {tag: cfg["name"] for cfg in registries for tag in cfg["tags"]}
    # Build registry -> ID set
    ids_by_registry = {
        name: {e.entry_id for e in entries}
        for name, entries in entries_by_registry.items()
    }
    defects: list[Defect] = []
    for c in citations:
        registry_name = tag_to_registry.get(c.tag)
        if registry_name is None:
            continue   # tag not registered (shouldn't happen with our regex)
        if c.cited_id in ids_by_registry.get(registry_name, set()):
            continue
        try:
            rel = c.file_path.relative_to(ROOT).as_posix()
        except ValueError:
            rel = c.file_path.as_posix()
        defects.append(Defect(
            severity="error",
            rule="citation-resolution",
            message=f"unresolved @{c.tag} {c.cited_id} at {rel}:{c.line_no} (no entry in {registry_name})",
        ))
    return defects


def is_stub_entry(entry: Entry) -> bool:
    body_lower = entry.body.lower()
    return any(marker in body_lower for marker in STUB_MARKERS)


def check_orphan_detection(
    citations: list[Citation],
    entries_by_registry: dict[str, list[Entry]],
    registries: list[dict],
) -> list[Defect]:
    """Every registry entry should be cited at least once, unless it's stubbed."""
    cited_ids: set[str] = {c.cited_id for c in citations}
    defects: list[Defect] = []
    for cfg in registries:
        registry_name = cfg["name"]
        for entry in entries_by_registry.get(registry_name, []):
            if entry.entry_id in cited_ids:
                continue
            if is_stub_entry(entry):
                continue
            defects.append(Defect(
                severity="warning",
                rule="orphan-detection",
                message=f"[{registry_name}] {entry.entry_id} (line {entry.line_no}) is not cited from code",
            ))
    return defects


# =============================================================================
# Content-drift check functions (LIT-01)
# =============================================================================

def _parse_line_spec(spec: str) -> list[int]:
    """Parse `60`, `60-77`, `60,80,100`, `60-77,100-120` -> sorted unique line numbers."""
    out: set[int] = set()
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            lo, hi = chunk.split("-", 1)
            try:
                lo_i, hi_i = int(lo), int(hi)
            except ValueError:
                continue
            if lo_i <= hi_i:
                out.update(range(lo_i, hi_i + 1))
        else:
            try:
                out.add(int(chunk))
            except ValueError:
                continue
    return sorted(out)


def _scan_knowledge_files() -> list[Path]:
    knowledge_root = ROOT / KNOWLEDGE_DIR
    if not knowledge_root.exists():
        return []
    return sorted(p for p in knowledge_root.glob("*.md") if p.is_file())


def check_stale_file_line(knowledge_files: list[Path]) -> list[Defect]:
    """Verify every `file.ext:NN` citation in knowledge bodies still resolves.

    Three failure modes flagged:
      - file does not exist (path renamed/deleted)
      - line number exceeds file length (file shrank)
      - symbol hint named in the citation does not appear within
        SYMBOL_PROXIMITY_LINES of the cited line (function moved)
    """
    defects: list[Defect] = []
    for kfile in knowledge_files:
        try:
            text = kfile.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        try:
            kfile_rel = kfile.relative_to(ROOT).as_posix()
        except ValueError:
            kfile_rel = kfile.as_posix()
        for line_no, line in enumerate(text.splitlines(), start=1):
            for m in FILE_LINE_RE.finditer(line):
                path_str, line_spec, symbol_hint = m.group(1), m.group(2), m.group(3)
                # Skip shorthand citations (no project-root prefix) — they're
                # relative to a previously-cited file in the same row, which
                # we can't track without a row parser.
                if not any(path_str.startswith(p) for p in PROJECT_ROOT_PREFIXES):
                    continue
                target = ROOT / path_str
                if not target.is_file():
                    defects.append(Defect(
                        severity="error",
                        rule="stale-file-line",
                        message=f"{kfile_rel}:{line_no}: cited file does not exist: {path_str}",
                    ))
                    continue
                cited_lines = _parse_line_spec(line_spec)
                if not cited_lines:
                    continue
                try:
                    target_text = target.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                target_total = target_text.count("\n") + 1
                max_cited = cited_lines[-1]
                if max_cited > target_total:
                    defects.append(Defect(
                        severity="error",
                        rule="stale-file-line",
                        message=f"{kfile_rel}:{line_no}: cite {path_str}:{line_spec} exceeds file length ({target_total} lines)",
                    ))
                    continue
                if symbol_hint:
                    # Take the first identifier-shaped token from the hint
                    # (covers cases like "(`SEVERITY_ENUM`, ...)" where only
                    # the first symbol is the load-bearing anchor).
                    sym_match = re.match(r"\s*([A-Za-z_][\w]*)", symbol_hint)
                    if not sym_match:
                        continue
                    symbol = sym_match.group(1)
                    target_lines = target_text.splitlines()
                    lo = max(0, min(cited_lines) - SYMBOL_PROXIMITY_LINES - 1)
                    hi = min(len(target_lines), max(cited_lines) + SYMBOL_PROXIMITY_LINES)
                    window = "\n".join(target_lines[lo:hi])
                    if symbol not in window:
                        defects.append(Defect(
                            severity="warning",
                            rule="stale-file-line",
                            message=f"{kfile_rel}:{line_no}: symbol `{symbol}` not found within +/-{SYMBOL_PROXIMITY_LINES} lines of {path_str}:{line_spec} (function may have moved)",
                        ))
    return defects


def check_future_reader(knowledge_files: list[Path]) -> list[Defect]:
    """Flag relative-tense / future-reader-rotting phrases in knowledge bodies.

    A knowledge file is read by a future agent who has no conversation
    context. Phrases like "as discussed above" or "we recently decided" are
    only meaningful with that context — they're rot vectors.
    """
    defects: list[Defect] = []
    for kfile in knowledge_files:
        try:
            text = kfile.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        try:
            kfile_rel = kfile.relative_to(ROOT).as_posix()
        except ValueError:
            kfile_rel = kfile.as_posix()
        for line_no, line in enumerate(text.splitlines(), start=1):
            for pat in FUTURE_READER_PATTERNS:
                m = pat.search(line)
                if m:
                    defects.append(Defect(
                        severity="warning",
                        rule="future-reader",
                        message=f"{kfile_rel}:{line_no}: relative-tense phrase: {m.group(0)!r}",
                    ))
                    break  # one defect per line is enough
    return defects


# =============================================================================
# Driver
# =============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-orphans", action="store_true",
                        help="skip orphan-detection check")
    parser.add_argument("--show-all-orphans", action="store_true",
                        help="list every orphan (default: first 10 per registry)")
    parser.add_argument("--no-content-drift", action="store_true",
                        help="skip content-drift checks (stale-file-line, future-reader)")
    args = parser.parse_args()

    # Parse all registries
    entries_by_registry: dict[str, list[Entry]] = {}
    for cfg in REGISTRIES:
        entries_by_registry[cfg["name"]] = parse_registry(cfg)

    # Scan citations
    roots = [ROOT / r for r in SCAN_ROOTS]
    citations = scan_citations(roots)

    # Scan knowledge files for content-drift checks
    knowledge_files = _scan_knowledge_files() if not args.no_content_drift else []

    print(f"Knowledge linter: {sum(len(e) for e in entries_by_registry.values())} entries across "
          f"{len(REGISTRIES)} registries; {len(citations)} citations across {len(SCAN_ROOTS)} code roots")
    if knowledge_files:
        print(f"Content-drift scan: {len(knowledge_files)} knowledge files in {KNOWLEDGE_DIR}/")
    print()

    # Run checks
    all_defects: list[Defect] = []
    all_defects.extend(check_id_uniqueness(entries_by_registry))
    all_defects.extend(check_citation_resolution(citations, entries_by_registry, REGISTRIES))
    if not args.no_orphans:
        all_defects.extend(check_orphan_detection(citations, entries_by_registry, REGISTRIES))
    if knowledge_files:
        all_defects.extend(check_stale_file_line(knowledge_files))
        all_defects.extend(check_future_reader(knowledge_files))

    errors = [d for d in all_defects if d.severity == "error"]
    warnings = [d for d in all_defects if d.severity == "warning"]

    # Per-registry summary line
    for cfg in REGISTRIES:
        name = cfg["name"]
        entry_count = len(entries_by_registry.get(name, []))
        cite_count = sum(1 for c in citations if c.tag in cfg["tags"])
        print(f"  {name:18s} {entry_count:4d} entries  {cite_count:4d} citations")
    print()

    if errors:
        print(f"=== ERRORS ({len(errors)}) ===")
        by_rule: dict[str, list[Defect]] = {}
        for d in errors:
            by_rule.setdefault(d.rule, []).append(d)
        for rule, items in by_rule.items():
            print(f"  -- {rule} ({len(items)}) --")
            for d in items:
                print(f"    {d.message}")
        print()

    if warnings:
        print(f"=== WARNINGS ({len(warnings)}) ===")
        by_rule: dict[str, list[Defect]] = {}
        for d in warnings:
            by_rule.setdefault(d.rule, []).append(d)
        for rule, items in by_rule.items():
            print(f"  -- {rule} ({len(items)}) --")
            if rule == "orphan-detection" and not args.show_all_orphans:
                # Group by registry; show count + first 10 per registry.
                by_registry: dict[str, list[Defect]] = {}
                for d in items:
                    # Parse "[registry] ID (line N) ..." -> registry name
                    m = re.match(r"\[([^\]]+)\]", d.message)
                    reg = m.group(1) if m else "unknown"
                    by_registry.setdefault(reg, []).append(d)
                for reg, reg_items in by_registry.items():
                    print(f"    [{reg}] {len(reg_items)} orphan(s)")
                    for d in reg_items[:10]:
                        print(f"      {d.message}")
                    if len(reg_items) > 10:
                        print(f"      ... and {len(reg_items) - 10} more (use --show-all-orphans to see all)")
            else:
                for d in items:
                    print(f"    {d.message}")
        print()

    if not errors and not warnings:
        print("=== CLEAN ===")
        return 0
    if errors:
        print(f"FAIL: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"PASS with {len(warnings)} informational warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
