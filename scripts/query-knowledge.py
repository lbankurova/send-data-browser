#!/usr/bin/env python3
"""
query-knowledge.py -- F1 query interface to the typed knowledge-graph registry.

Structured-query path (Phase 1, CI-safe). Free-text / embedding-based queries
are deferred to Phase 2 per spec §3.4.

This is the canonical query path used by:
  - /lattice:peer-review (F3) -- ground claims against typed facts before the
    "is this defensible?" verdict
  - /lattice:architect when gating algorithmic specs
  - /lattice:review ALGORITHM CHECK (rule 19 in pcc) when verifying algorithm
    output against domain truth
  - any agent prompt that today says "consult docs/_internal/knowledge/..."

Day-1 stub behavior (per spec §20a Review-2):
  When no fact matches the query, the script exits 0 with an explicit
  fallback notice ("no fact found in domain-truth oracle; falling back to
  LLM judgment with explicit caveat") rather than failing silently or
  returning empty output. This keeps F3 from invisibly bypassing F1 when
  facts have not yet been populated for a query scope.
  Use --strict to make no-match exit 1 (for callers that want fail-loud,
  e.g. property-test gates that REQUIRE a fact to exist).

Usage:
  python scripts/query-knowledge.py --id HCD-FACT-001
  python scripts/query-knowledge.py --scope species:primate --scope sex:M
  python scripts/query-knowledge.py --kind numeric_baseline --confidence internal_validated
  python scripts/query-knowledge.py --domain LB --scope species:rat
  python scripts/query-knowledge.py --kind disable_marker --format json

Exit codes:
  0  one or more matches printed, OR no-match with stub message (default)
  1  no match AND --strict was passed, OR argument / parse error
  2  knowledge-graph file missing or unreadable
"""

from __future__ import annotations

import argparse
import json
import re
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
GRAPH_PATH = ROOT / "docs/_internal/knowledge/knowledge-graph.md"

# Match a fact heading like:
#   ## HCD-FACT-001
#   ## NOAEL-FACT-007
#   ## METH-FACT-12a
# and the YAML block that follows. The audit script today only matches HCD-FACT-*;
# this query script accepts any uppercase prefix so the F1 schema extension
# (regulatory/methods/NOAEL fact families) does not require a code change here.
FACT_HEADING_RE = re.compile(
    r"^## ([A-Z][A-Z0-9]*-FACT-[\w]+)\s*\n(?:.*?\n)*?```yaml\n(.*?)\n```",
    re.MULTILINE | re.DOTALL,
)

NO_FACT_FOUND_STUB = (
    "NO FACT FOUND in domain-truth oracle for this query.\n"
    "\n"
    "Falling back to LLM judgment. Caller MUST treat any conclusion as\n"
    "provisional and explicitly note 'domain-truth oracle returned no fact\n"
    "for this scope' in the resulting verdict / citation.\n"
    "\n"
    "To populate this gap:\n"
    "  1. Identify the relevant authority (regulatory standard, peer-reviewed\n"
    "     paper, internal validation).\n"
    "  2. Add a literature note under docs/_internal/research/literature/.\n"
    "  3. Add a fact to docs/_internal/knowledge/knowledge-graph.md following\n"
    "     the typed schema (fact_kind, scope, value, confidence, etc.).\n"
    "  4. Run scripts/audit-knowledge-graph.py to verify; commit with the\n"
    "     gap reference.\n"
)


@dataclass
class Fact:
    fact_id: str
    yaml_data: dict[str, Any]
    line_no: int


@dataclass
class QueryFilter:
    """ANDed filter criteria. Empty filter matches all facts."""
    id: str | None = None
    kind: str | None = None
    domain: str | None = None
    confidence: str | None = None
    # scope key:value pairs, AND-combined; value matches against scalar OR list-membership
    scope: dict[str, str] = field(default_factory=dict)


def parse_facts(path: Path) -> list[Fact]:
    """Extract YAML fact blocks from the knowledge-graph markdown file.

    Mirrors the parser in audit-knowledge-graph.py but accepts any uppercase
    fact prefix (HCD-FACT-, NOAEL-FACT-, etc.) since F1 extends the schema
    beyond HCD.
    """
    if not path.exists():
        print(f"ERROR: knowledge-graph file not found at {path}", file=sys.stderr)
        sys.exit(2)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        sys.exit(2)

    facts: list[Fact] = []
    for m in FACT_HEADING_RE.finditer(text):
        fact_id = m.group(1).strip()
        yaml_text = m.group(2)
        line_no = text[: m.start()].count("\n") + 1
        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as exc:
            print(f"[parse-warning] {fact_id}: {exc}", file=sys.stderr)
            continue
        if not isinstance(data, dict):
            continue
        facts.append(Fact(fact_id=fact_id, yaml_data=data, line_no=line_no))
    return facts


def match_scope_value(fact_value: Any, query_value: str) -> bool:
    """Match a single scope dimension. Handles scalar and list-of-scalars.

    A fact's scope.endpoints can be ['ALT', 'AST']; querying 'endpoints:ALT'
    matches via list-membership. A fact's scope.sex is 'M' or 'both'; querying
    'sex:M' matches scalar equality OR fact-value 'both' (treats 'both' as
    a wildcard within sex).
    """
    if fact_value is None:
        return False
    if isinstance(fact_value, list):
        return any(str(item).lower() == query_value.lower() for item in fact_value)
    fact_str = str(fact_value).lower()
    query_str = query_value.lower()
    if fact_str == query_str:
        return True
    # 'both' is a sex-axis wildcard; do not generalize this beyond sex.
    if fact_str == "both" and query_str in {"m", "f"}:
        return True
    return False


def fact_matches(fact: Fact, qf: QueryFilter) -> bool:
    """Apply all ANDed filter criteria to a fact. Empty filter matches all."""
    if qf.id is not None and fact.fact_id != qf.id:
        return False

    if qf.kind is not None:
        fact_kind = fact.yaml_data.get("fact_kind")
        if fact_kind is None or str(fact_kind).lower() != qf.kind.lower():
            return False

    if qf.confidence is not None:
        fact_conf = fact.yaml_data.get("confidence")
        if fact_conf is None or str(fact_conf).lower() != qf.confidence.lower():
            return False

    scope = fact.yaml_data.get("scope") or {}
    if not isinstance(scope, dict):
        scope = {}

    if qf.domain is not None:
        # Domain is a F1 schema extension; today's facts may not have it.
        # When the field is absent, the fact does NOT match a --domain query.
        # This is correct: if domain-grounding matters, an undeclared fact
        # cannot satisfy that grounding and should not be treated as relevant.
        fact_domain = scope.get("domain")
        if fact_domain is None:
            return False
        if not match_scope_value(fact_domain, qf.domain):
            return False

    for key, value in qf.scope.items():
        # Scope queries support both top-level scope keys (species, sex, strains, etc.)
        # and the 'endpoints' / 'study_types' / 'pharmacological_context' lists.
        fact_value = scope.get(key)
        if not match_scope_value(fact_value, value):
            return False

    return True


def render_markdown(facts: list[Fact], qf: QueryFilter) -> str:
    """Render matched facts as a citation block ready to paste into a review."""
    parts: list[str] = []
    parts.append("# Knowledge query")
    parts.append(_query_summary_line(qf))
    parts.append("")

    if not facts:
        parts.append(NO_FACT_FOUND_STUB)
        return "\n".join(parts).rstrip() + "\n"

    parts.append(f"Matches: {len(facts)}")
    parts.append("")
    for fact in facts:
        parts.append(f"## {fact.fact_id}")
        title = fact.yaml_data.get("title")
        if title:
            parts.append(f"**Title:** {title}")
        kind = fact.yaml_data.get("fact_kind")
        if kind:
            parts.append(f"**Kind:** `{kind}`")
        confidence = fact.yaml_data.get("confidence")
        if confidence:
            parts.append(f"**Confidence:** `{confidence}`")
        scope = fact.yaml_data.get("scope") or {}
        if isinstance(scope, dict):
            scope_summary = _format_scope(scope)
            if scope_summary:
                parts.append(f"**Scope:** {scope_summary}")
        derives = fact.yaml_data.get("derives_from") or []
        if isinstance(derives, list) and derives:
            parts.append("**Derives from:**")
            for src in derives:
                parts.append(f"  - {src}")
        parts.append("")
        parts.append(f"_File:_ `docs/_internal/knowledge/knowledge-graph.md` (line {fact.line_no})")
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def render_json(facts: list[Fact], qf: QueryFilter) -> str:
    """Programmatic output -- for skill consumption via subprocess."""
    out = {
        "query": _query_summary_dict(qf),
        "match_count": len(facts),
        "no_fact_found": len(facts) == 0,
        "fallback_message": NO_FACT_FOUND_STUB if not facts else None,
        "facts": [
            {
                "id": f.fact_id,
                "line_no": f.line_no,
                "title": f.yaml_data.get("title"),
                "fact_kind": f.yaml_data.get("fact_kind"),
                "confidence": f.yaml_data.get("confidence"),
                "scope": f.yaml_data.get("scope"),
                "derives_from": f.yaml_data.get("derives_from"),
                "value": f.yaml_data.get("value"),
            }
            for f in facts
        ],
    }
    return json.dumps(out, indent=2, default=str) + "\n"


def _query_summary_line(qf: QueryFilter) -> str:
    parts: list[str] = []
    if qf.id:
        parts.append(f"id={qf.id}")
    if qf.kind:
        parts.append(f"kind={qf.kind}")
    if qf.domain:
        parts.append(f"domain={qf.domain}")
    if qf.confidence:
        parts.append(f"confidence={qf.confidence}")
    for k, v in qf.scope.items():
        parts.append(f"scope.{k}={v}")
    if not parts:
        return "_(empty filter -- all facts)_"
    return "Query: " + " ".join(parts)


def _query_summary_dict(qf: QueryFilter) -> dict[str, Any]:
    return {
        "id": qf.id,
        "kind": qf.kind,
        "domain": qf.domain,
        "confidence": qf.confidence,
        "scope": dict(qf.scope),
    }


def _format_scope(scope: dict[str, Any]) -> str:
    """Compact one-line scope summary."""
    pieces: list[str] = []
    for key in ("species", "strains", "sex", "endpoints", "study_types",
                "pharmacological_context", "domain", "origin"):
        if key not in scope or scope[key] is None:
            continue
        value = scope[key]
        if isinstance(value, list):
            value = ",".join(str(v) for v in value)
        pieces.append(f"{key}={value}")
    return " ".join(pieces)


def parse_args(argv: list[str] | None = None) -> tuple[QueryFilter, argparse.Namespace]:
    parser = argparse.ArgumentParser(
        description="Structured-query interface to the typed knowledge-graph registry.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  query-knowledge.py --id HCD-FACT-001\n"
            "  query-knowledge.py --scope species:primate --scope sex:M\n"
            "  query-knowledge.py --kind numeric_baseline --confidence internal_validated\n"
            "  query-knowledge.py --domain LB --scope species:rat\n"
            "  query-knowledge.py --kind disable_marker --format json --strict\n"
            "\n"
            "Day-1 stub: when no fact matches, exits 0 with a fallback notice\n"
            "instructing the caller to treat conclusions as provisional. Use --strict\n"
            "to make no-match exit 1 for callers that require a fact (e.g. tests).\n"
        ),
    )
    parser.add_argument("--id", help="Exact fact id (e.g. HCD-FACT-001)")
    parser.add_argument("--kind", help="Match fact_kind enum (e.g. numeric_baseline)")
    parser.add_argument("--domain", help="Match scope.domain (F1 schema extension; LB / BW / MI / MA / OM / CL)")
    parser.add_argument("--confidence", help="Match confidence enum (e.g. internal_validated)")
    parser.add_argument(
        "--scope", action="append", default=[], metavar="KEY:VALUE",
        help="Match scope.{KEY} == VALUE (or VALUE in scope.{KEY} list). Repeatable, AND-combined.",
    )
    parser.add_argument(
        "--format", choices=("markdown", "json"), default="markdown",
        help="Output format (default: markdown citation block).",
    )
    parser.add_argument(
        "--strict", action="store_true",
        help="Exit 1 (not 0) when no fact matches. Use in tests / hard-grounding gates.",
    )
    parser.add_argument(
        "--graph", default=str(GRAPH_PATH),
        help="Override path to knowledge-graph.md (test usage).",
    )
    args = parser.parse_args(argv)

    qf = QueryFilter(
        id=args.id,
        kind=args.kind,
        domain=args.domain,
        confidence=args.confidence,
    )
    for spec in args.scope:
        if ":" not in spec:
            print(f"ERROR: --scope must be KEY:VALUE; got {spec!r}", file=sys.stderr)
            sys.exit(1)
        key, _, value = spec.partition(":")
        key = key.strip()
        value = value.strip()
        if not key or not value:
            print(f"ERROR: --scope KEY and VALUE must be non-empty; got {spec!r}", file=sys.stderr)
            sys.exit(1)
        qf.scope[key] = value
    return qf, args


def main(argv: list[str] | None = None) -> int:
    qf, args = parse_args(argv)
    facts = parse_facts(Path(args.graph))
    matches = [f for f in facts if fact_matches(f, qf)]
    if args.format == "json":
        sys.stdout.write(render_json(matches, qf))
    else:
        sys.stdout.write(render_markdown(matches, qf))
    if not matches and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
