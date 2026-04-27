#!/usr/bin/env python3
"""
audit-knowledge-graph.py — lint the typed knowledge-graph registry.

Parses `docs/_internal/knowledge/knowledge-graph.md` and runs the audit
behaviors mandated by the architect-gate verdicts:

1. **scoring_eligible enforcement** — list every fact with its confidence and
   scoring_eligible status; flag any inconsistency with the policy table.
2. **contradicts symmetry** — bidirectional invariant: if A.contradicts lists B,
   B.contradicts must list A.
3. **structural-pointer row-count check** — for facts with
   encoding=log_normal_by_bw_class, run the source_table.query against the
   declared SQLite database and verify expected_row_count matches actual.
4. **cited_unverified backlog** — list every cited_unverified fact with its
   stub literature note for the "needs direct-read" tracking.
5. **sex:both pairing constraint** — `sex: both` is valid ONLY when paired with
   fact_kind=disable_marker OR confidence=cited_unverified. Anything else is a
   defect.
6. **relevance_exclusion field completeness** (Extension 8, 2026-04-27) — every
   `fact_kind: relevance_exclusion` declares the five required value-block
   fields (name, species_scope, mechanism_basis, supporting_citations,
   regulatory_context); `name` is unique across all relevance_exclusion facts;
   `supporting_citations` is non-empty; `confidence != cited_unverified`.

The script does NOT lint scientific accuracy — it only enforces typed-schema
invariants. Domain accuracy is the architect-gate's job.

Run: python scripts/audit-knowledge-graph.py
Exit code: 0 = clean; 1 = defects found.
"""

from __future__ import annotations

import re
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("Missing pyyaml. Install: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent

GRAPH_PATH = ROOT / "docs/_internal/knowledge/knowledge-graph.md"
SQLITE_PATH = ROOT / "docs/_internal/research/hcd/hcd_seed.sqlite"
LITERATURE_DIR = ROOT / "docs/_internal/research/literature"

SCORING_ELIGIBLE = {
    "regulated_standard": True,
    "internal_validated": True,
    "heuristic": True,    # with flagging
    "cited_unverified": False,
    "extrapolation": True,  # with flagging
}

VALID_ENCODINGS = {
    "arithmetic_mean_sd",
    "arithmetic_mean_sem",
    "arithmetic_range_cited",
    "log_normal_by_bw_class",
}

# fact_kinds that MAY omit the encoding field (rule-centric value structure)
ENCODING_EXEMPT_KINDS = {"disable_marker", "relevance_exclusion"}

VALID_SEX = {"M", "F", "both", "n/a"}

# Required fields on the value-block of relevance_exclusion facts (Extension 8).
RELEVANCE_EXCLUSION_REQUIRED_FIELDS = (
    "name",
    "species_scope",
    "mechanism_basis",
    "supporting_citations",
    "regulatory_context",
)


@dataclass
class Fact:
    fact_id: str
    yaml_data: dict[str, Any]
    line_no: int


@dataclass
class Defect:
    severity: str       # "error" | "warning"
    fact_id: str
    rule: str
    message: str


# =============================================================================
# Parser
# =============================================================================

def parse_facts(path: Path) -> list[Fact]:
    """Extract YAML fact blocks from the knowledge-graph markdown file.

    Each fact is a fenced ```yaml block following a `## <PREFIX>-FACT-...` heading.
    Prefix is any uppercase domain identifier (HCD, NOAEL, METH, ...) so the
    registry can host multiple typed fact families per typed-knowledge-graph-spec
    §11 ("the schema is intended to govern future typed registries beyond HCD").
    Aligned with the query-knowledge.py FACT_HEADING_RE.
    """
    text = path.read_text(encoding="utf-8")
    facts: list[Fact] = []
    pattern = re.compile(
        r"^## ([A-Z][A-Z0-9]*-FACT-[\w]+)\s*\n(?:.*?\n)*?```yaml\n(.*?)\n```",
        re.MULTILINE | re.DOTALL,
    )
    for m in pattern.finditer(text):
        fact_id = m.group(1).strip()
        yaml_text = m.group(2)
        line_no = text[: m.start()].count("\n") + 1
        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as e:
            print(f"[parse-error] {fact_id}: {e}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            continue
        facts.append(Fact(fact_id=fact_id, yaml_data=data, line_no=line_no))
    return facts


# =============================================================================
# Audit checks
# =============================================================================

def check_scoring_eligible(facts: list[Fact]) -> list[Defect]:
    """Confidence levels match the SCORING_ELIGIBLE policy. Mainly informational
    — flags any unknown confidence level.
    """
    defects: list[Defect] = []
    for f in facts:
        conf = f.yaml_data.get("confidence")
        if conf is None:
            defects.append(Defect("error", f.fact_id, "scoring_eligible",
                                  "missing `confidence` field"))
            continue
        if conf not in SCORING_ELIGIBLE:
            defects.append(Defect("error", f.fact_id, "scoring_eligible",
                                  f"unknown confidence level: {conf!r}"))
    return defects


def check_contradicts_symmetry(facts: list[Fact]) -> list[Defect]:
    """Bidirectional invariant on contradicts edges."""
    contradicts_map: dict[str, set[str]] = {}
    for f in facts:
        edges = f.yaml_data.get("contradicts") or []
        if not isinstance(edges, list):
            continue
        contradicts_map[f.fact_id] = {str(e).strip() for e in edges if e}

    defects: list[Defect] = []
    fact_ids = {f.fact_id for f in facts}
    for fid, peers in contradicts_map.items():
        for peer in peers:
            if peer not in fact_ids:
                defects.append(Defect("error", fid, "contradicts_symmetry",
                                      f"contradicts unknown fact: {peer}"))
                continue
            peer_edges = contradicts_map.get(peer, set())
            if fid not in peer_edges:
                defects.append(Defect("error", fid, "contradicts_symmetry",
                                      f"asymmetric: {fid} -> {peer}, but {peer} does not list {fid}"))
    return defects


def check_structural_pointer(facts: list[Fact]) -> list[Defect]:
    """For log_normal_by_bw_class facts, verify SQLite row count matches expected."""
    defects: list[Defect] = []
    if not SQLITE_PATH.exists():
        defects.append(Defect("warning", "<global>", "structural_pointer",
                              f"SQLite not found at {SQLITE_PATH}; skipping"))
        return defects
    conn = sqlite3.connect(str(SQLITE_PATH))
    try:
        for f in facts:
            value = f.yaml_data.get("value") or {}
            if not isinstance(value, dict):
                continue
            encoding = value.get("encoding")
            if encoding != "log_normal_by_bw_class":
                continue
            source_table = value.get("source_table") or {}
            query = source_table.get("query")
            expected = source_table.get("expected_row_count")
            if not query or expected is None:
                defects.append(Defect("error", f.fact_id, "structural_pointer",
                                      "log_normal_by_bw_class fact missing source_table.query or expected_row_count"))
                continue
            try:
                cur = conn.cursor()
                rows = list(cur.execute(query))
                if len(rows) != expected:
                    defects.append(Defect("error", f.fact_id, "structural_pointer",
                                          f"row count mismatch: query returned {len(rows)}, expected {expected}"))
            except sqlite3.Error as e:
                defects.append(Defect("error", f.fact_id, "structural_pointer",
                                      f"SQL error: {e}"))
    finally:
        conn.close()
    return defects


def check_cited_unverified_backlog(facts: list[Fact]) -> list[Defect]:
    """List cited_unverified facts and verify their literature note has cited-not-read status.

    Returns informational defects (severity=warning) listing the backlog.
    """
    defects: list[Defect] = []
    for f in facts:
        if f.yaml_data.get("confidence") != "cited_unverified":
            continue
        derives = f.yaml_data.get("derives_from") or []
        if not isinstance(derives, list):
            derives = [derives]
        for d in derives:
            d_str = str(d).strip()
            # Try to extract literature note path; entries may be plain paths or have annotations
            m = re.search(r"(research/literature/[\w\-]+\.md)", d_str)
            if not m:
                defects.append(Defect("warning", f.fact_id, "cited_unverified_backlog",
                                      f"cited_unverified fact has no parseable literature-note path in derives_from: {d_str!r}"))
                continue
            note_path = ROOT / "docs/_internal" / m.group(1)
            if not note_path.exists():
                defects.append(Defect("error", f.fact_id, "cited_unverified_backlog",
                                      f"cited_unverified fact references non-existent literature note: {note_path}"))
                continue
            note_text = note_path.read_text(encoding="utf-8")
            if "status: cited-not-read" not in note_text:
                defects.append(Defect("warning", f.fact_id, "cited_unverified_backlog",
                                      f"literature note {note_path.name} does not have status: cited-not-read"))
            else:
                # informational backlog entry
                defects.append(Defect("warning", f.fact_id, "cited_unverified_backlog",
                                      f"NEEDS DIRECT READ: {note_path.name}"))
    return defects


def check_sex_both_pairing(facts: list[Fact]) -> list[Defect]:
    """sex: both is valid ONLY for disable_marker fact_kind OR cited_unverified confidence."""
    defects: list[Defect] = []
    for f in facts:
        scope = f.yaml_data.get("scope") or {}
        sex = scope.get("sex")
        if sex != "both":
            continue
        kind = f.yaml_data.get("fact_kind")
        conf = f.yaml_data.get("confidence")
        if kind == "disable_marker":
            continue
        if conf == "cited_unverified":
            continue
        defects.append(Defect("error", f.fact_id, "sex_both_pairing",
                              f"sex: both requires fact_kind=disable_marker OR confidence=cited_unverified; got fact_kind={kind!r}, confidence={conf!r}"))
    return defects


def check_relevance_exclusion_fields(facts: list[Fact]) -> list[Defect]:
    """Extension 8: relevance_exclusion facts must declare the five required
    value-block fields (name, species_scope, mechanism_basis, supporting_citations,
    regulatory_context); `name` must be unique; supporting_citations non-empty;
    confidence != cited_unverified.

    Per typed-knowledge-graph-spec Extension 8: an exclusion class IS a scoring
    decision (it suppresses findings from human-relevant NOAEL aggregation), so
    it cannot be backed by an unread secondary citation — same merit reasoning
    as Extension 6's cited_unverified scoring_eligible: N policy.
    """
    defects: list[Defect] = []
    seen_names: dict[str, str] = {}  # name -> first fact_id that declared it
    for f in facts:
        if f.yaml_data.get("fact_kind") != "relevance_exclusion":
            continue
        value = f.yaml_data.get("value") or {}
        if not isinstance(value, dict):
            defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                  "value field is not a structured object"))
            continue
        for field_name in RELEVANCE_EXCLUSION_REQUIRED_FIELDS:
            if field_name not in value or value[field_name] in (None, "", []):
                defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                      f"missing or empty required field: value.{field_name}"))
        species_scope = value.get("species_scope")
        if species_scope is not None and not isinstance(species_scope, list):
            defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                  f"value.species_scope must be a list, got {type(species_scope).__name__}"))
        citations = value.get("supporting_citations")
        if citations is not None and not isinstance(citations, list):
            defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                  f"value.supporting_citations must be a list, got {type(citations).__name__}"))
        name = value.get("name")
        if isinstance(name, str) and name:
            prior = seen_names.get(name)
            if prior is not None:
                defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                      f"duplicate value.name {name!r}; already declared by {prior}"))
            else:
                seen_names[name] = f.fact_id
        conf = f.yaml_data.get("confidence")
        if conf == "cited_unverified":
            defects.append(Defect("error", f.fact_id, "relevance_exclusion_fields",
                                  "relevance_exclusion cannot be cited_unverified -- exclusion class IS a scoring decision; primary source must be directly read"))
    return defects


def check_encoding_present(facts: list[Fact]) -> list[Defect]:
    """encoding field is mandatory for non-disable_marker facts and must be in the enum."""
    defects: list[Defect] = []
    for f in facts:
        kind = f.yaml_data.get("fact_kind")
        value = f.yaml_data.get("value") or {}
        if not isinstance(value, dict):
            defects.append(Defect("error", f.fact_id, "encoding",
                                  "value field is not a structured object"))
            continue
        encoding = value.get("encoding")
        if encoding is None:
            if kind in ENCODING_EXEMPT_KINDS:
                continue
            defects.append(Defect("error", f.fact_id, "encoding",
                                  f"non-{tuple(ENCODING_EXEMPT_KINDS)} fact missing value.encoding"))
            continue
        if encoding not in VALID_ENCODINGS:
            defects.append(Defect("error", f.fact_id, "encoding",
                                  f"invalid encoding {encoding!r}; allowed: {sorted(VALID_ENCODINGS)}"))
    return defects


# =============================================================================
# Driver
# =============================================================================

CHECKS = [
    ("encoding-enum",            check_encoding_present),
    ("scoring-eligible",         check_scoring_eligible),
    ("contradicts-symmetry",     check_contradicts_symmetry),
    ("sex-both-pairing",         check_sex_both_pairing),
    ("structural-pointer",       check_structural_pointer),
    ("cited-unverified-backlog", check_cited_unverified_backlog),
    ("relevance-exclusion-fields", check_relevance_exclusion_fields),
]


def main() -> int:
    if not GRAPH_PATH.exists():
        print(f"[fatal] knowledge-graph.md not found at {GRAPH_PATH}", file=sys.stderr)
        return 1
    facts = parse_facts(GRAPH_PATH)
    if not facts:
        print(f"[fatal] no facts parsed from {GRAPH_PATH}", file=sys.stderr)
        return 1

    print(f"Knowledge-graph audit: {len(facts)} facts in {GRAPH_PATH.name}")
    print()

    all_defects: list[tuple[str, Defect]] = []
    for name, fn in CHECKS:
        try:
            defects = fn(facts)
        except Exception as e:
            print(f"[check-error] {name}: {type(e).__name__}: {e}", file=sys.stderr)
            return 1
        for d in defects:
            all_defects.append((name, d))

    errors = [d for _, d in all_defects if d.severity == "error"]
    warnings = [d for _, d in all_defects if d.severity == "warning"]

    if errors:
        print(f"=== ERRORS ({len(errors)}) ===")
        for d in errors:
            print(f"  [{d.rule}] {d.fact_id}: {d.message}")
        print()

    # Group warnings by rule for cleaner output
    if warnings:
        print(f"=== WARNINGS / INFORMATIONAL ({len(warnings)}) ===")
        by_rule: dict[str, list[Defect]] = {}
        for d in warnings:
            by_rule.setdefault(d.rule, []).append(d)
        for rule, items in by_rule.items():
            print(f"  -- {rule} ({len(items)}) --")
            for d in items:
                print(f"    {d.fact_id}: {d.message}")
        print()

    if not errors and not warnings:
        print("=== CLEAN ===")
        print(f"All {len(facts)} facts pass all {len(CHECKS)} checks.")
        return 0

    if errors:
        print(f"FAIL: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"PASS with {len(warnings)} informational warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
