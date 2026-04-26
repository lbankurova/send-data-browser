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
# Driver
# =============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-orphans", action="store_true",
                        help="skip orphan-detection check")
    parser.add_argument("--show-all-orphans", action="store_true",
                        help="list every orphan (default: first 10 per registry)")
    args = parser.parse_args()

    # Parse all registries
    entries_by_registry: dict[str, list[Entry]] = {}
    for cfg in REGISTRIES:
        entries_by_registry[cfg["name"]] = parse_registry(cfg)

    # Scan citations
    roots = [ROOT / r for r in SCAN_ROOTS]
    citations = scan_citations(roots)

    print(f"Knowledge linter: {sum(len(e) for e in entries_by_registry.values())} entries across "
          f"{len(REGISTRIES)} registries; {len(citations)} citations across {len(SCAN_ROOTS)} code roots")
    print()

    # Run checks
    all_defects: list[Defect] = []
    all_defects.extend(check_id_uniqueness(entries_by_registry))
    all_defects.extend(check_citation_resolution(citations, entries_by_registry, REGISTRIES))
    if not args.no_orphans:
        all_defects.extend(check_orphan_detection(citations, entries_by_registry, REGISTRIES))

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
