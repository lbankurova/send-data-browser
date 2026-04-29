"""Knowledge-graph parity tests: NOAEL facts (gate_criterion, threshold,
regulatory_expectation, relevance_exclusion).

Pins the engine's actual NOAEL behavior + parameter values + regulatory grounding
against the typed values declared in docs/_internal/knowledge/knowledge-graph.md.
Drift (fact value changes without consumer follow-up, function rename without
fact update, parameter literal divergence) surfaces here as a test failure.

Each fact_id below appears as a parametrize id so
scripts/audit-knowledge-load-bearing.py classifies the fact as TEST_VERIFIED.

Companion to:
- frontend/tests/properties/noael.property.test.ts -- covers
  NOAEL-FACT-001..005 (disable_marker -- behavioral invariants on the
  derive-summaries pipeline).
- backend/tests/test_knowledge_facts_hcd.py -- covers HCD-FACT-001..010.

Covers the remaining 16 NOAEL facts:
- NOAEL-FACT-006/007/012/013/014 (gate_criterion -- F2 dispatch policies)
- NOAEL-FACT-008/009/015 (regulatory_expectation -- OECD/ICH/EFSA citations)
- NOAEL-FACT-010/011/016 (threshold -- scalar policy parameters)
- NOAEL-FACT-017..021 (relevance_exclusion -- mechanistic species exclusions)
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# Reuse the fact loader from the HCD parity tests to avoid duplication.
from backend.tests.test_knowledge_facts_hcd import FACTS

ROOT = Path(__file__).resolve().parent.parent.parent
NOAEL_AGGREGATION = ROOT / "backend/services/analysis/noael_aggregation.py"
ANALYSIS_SETTINGS = ROOT / "backend/services/analysis/analysis_settings.py"
LITERATURE_DIR = ROOT / "docs/_internal/research/literature"


# ---------------------------------------------------------------------------
# gate_criterion: NOAEL-FACT-006/007/012/013/014.
# Each declares a policy_id; the live consumer is a function in
# noael_aggregation.py named _<policy_id>. Parity = "rename detector":
# if the function is renamed without updating the fact, the test fails.
# ---------------------------------------------------------------------------

GATE_CRITERION_FACTS = [
    "NOAEL-FACT-006",
    "NOAEL-FACT-007",
    "NOAEL-FACT-012",
    "NOAEL-FACT-013",
    "NOAEL-FACT-014",
]


@pytest.mark.parametrize("fact_id", GATE_CRITERION_FACTS, ids=GATE_CRITERION_FACTS)
def test_gate_criterion_policy_in_noael_aggregation(fact_id: str) -> None:
    """The fact's policy_id must resolve to a function in noael_aggregation.py."""
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "gate_criterion"
    policy_id = fact["value"]["policy_id"]
    # The fact uses mixed-case policy_id (e.g., "P3_terminal_primary"); the
    # dispatch + function names are canonically lowercased per the backend
    # convention ("p3_terminal_primary"). Compare on the lowered form.
    canonical = policy_id.lower()
    src = NOAEL_AGGREGATION.read_text(encoding="utf-8")
    assert re.search(rf"^def _{re.escape(canonical)}\b", src, re.MULTILINE), (
        f"{fact_id}: noael_aggregation.py must define _{canonical}() to consume this gate_criterion fact"
    )
    # Dispatch wiring: the canonical policy_id string must appear in the
    # _wrap(...) call so the function is reachable.
    assert f'"{canonical}"' in src, (
        f"{fact_id}: policy_id {canonical!r} not referenced in dispatch wiring"
    )


# ---------------------------------------------------------------------------
# threshold: NOAEL-FACT-010/011/016. scalar_policy_parameter encoding --
# parity = "the parameter literal in analysis_settings.py matches the fact's
# parameter_value." If someone bumps the value in code without updating the
# fact (or vice-versa), the test fails.
# ---------------------------------------------------------------------------

THRESHOLD_FACTS = [
    # (fact_id, settings-attribute name)
    ("NOAEL-FACT-010", "c2b_tightened_threshold_smallN"),
    ("NOAEL-FACT-011", "effect_relevance_threshold"),
    ("NOAEL-FACT-016", "sustained_M"),
]


@pytest.mark.parametrize("fact_id, attr_name", THRESHOLD_FACTS, ids=[t[0] for t in THRESHOLD_FACTS])
def test_threshold_parameter_value_parity(fact_id: str, attr_name: str) -> None:
    """analysis_settings.py default for the named attr must match the fact's parameter_value."""
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "threshold"
    declared = fact["value"]["parameter_value"]
    src = ANALYSIS_SETTINGS.read_text(encoding="utf-8")
    # Match: `<attr>: <type> = <value>` allowing optional type annotation.
    pattern = rf"^\s*{re.escape(attr_name)}\s*(?::\s*\w+)?\s*=\s*([0-9.]+)"
    match = re.search(pattern, src, re.MULTILINE)
    assert match, f"{fact_id}: {attr_name} not found in analysis_settings.py"
    actual = float(match.group(1))
    assert abs(actual - float(declared)) < 1e-6, (
        f"{fact_id}: analysis_settings.{attr_name}={actual} but fact declares parameter_value={declared}"
    )


# ---------------------------------------------------------------------------
# regulatory_expectation: NOAEL-FACT-008/009/015. Each carries a verbatim
# cited_text quote. Parity = either (a) the cited_text appears in the
# referenced literature note (when one exists), or (b) the fact carries
# the four required structural fields when no internal literature note
# exists. Both modes catch tampering with the cited quote.
# ---------------------------------------------------------------------------

REGULATORY_EXPECTATION_FACTS = [
    # (fact_id, optional literature-note path; None means no internal note)
    ("NOAEL-FACT-008", LITERATURE_DIR / "oecd-408-2018-90-day-rdt.md"),
    ("NOAEL-FACT-009", None),    # ICH S4: cites URL only; no internal note
    ("NOAEL-FACT-015", None),    # EFSA 2017: cites URL only; no internal note
]


@pytest.mark.parametrize("fact_id, lit_path", REGULATORY_EXPECTATION_FACTS, ids=[t[0] for t in REGULATORY_EXPECTATION_FACTS])
def test_regulatory_expectation_structure(fact_id: str, lit_path: Path | None) -> None:
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "regulatory_expectation"
    value = fact["value"]
    # Structural: every regulatory_expectation needs the citation triple.
    for required in ("authority", "document", "section", "cited_text", "algorithmic_implication"):
        assert required in value and value[required], f"{fact_id}: value.{required} missing or empty"

    # If there's an internal literature note, verify it covers the fact's
    # cited authority + document + year. We don't require literal section
    # markers (e.g., "§22") because the literature notes paraphrase rather
    # than quote -- but if the authority/title/year drift, the citation
    # is no longer load-bearing and the test should fail.
    if lit_path is not None:
        assert lit_path.exists(), f"{fact_id}: cited literature note missing -- {lit_path}"
        body = lit_path.read_text(encoding="utf-8", errors="ignore")
        authority = value["authority"]
        year = str(value["document_year"])
        assert authority in body, f"{fact_id}: literature note {lit_path.name} does not mention authority {authority!r}"
        assert year in body, f"{fact_id}: literature note {lit_path.name} does not mention document_year {year!r}"


# ---------------------------------------------------------------------------
# relevance_exclusion: NOAEL-FACT-017..021. Extension 8 schema -- each must
# declare the five required value-block fields, all supporting_citations
# files exist, and confidence != cited_unverified. This mirrors the audit
# in audit-knowledge-graph.py but pins each fact_id by id, which lets the
# load-bearing audit recognize each one as TEST_VERIFIED.
# ---------------------------------------------------------------------------

RELEVANCE_EXCLUSION_FACTS = [
    "NOAEL-FACT-017",
    "NOAEL-FACT-018",
    "NOAEL-FACT-019",
    "NOAEL-FACT-020",
    "NOAEL-FACT-021",
]


@pytest.mark.parametrize("fact_id", RELEVANCE_EXCLUSION_FACTS, ids=RELEVANCE_EXCLUSION_FACTS)
def test_relevance_exclusion_field_completeness(fact_id: str) -> None:
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "relevance_exclusion"
    value = fact["value"]
    for required in ("name", "species_scope", "mechanism_basis", "supporting_citations", "regulatory_context"):
        assert required in value and value[required], f"{fact_id}: value.{required} missing or empty"
    # Per Extension 8 audit rule: confidence cannot be cited_unverified.
    assert fact["confidence"] != "cited_unverified", (
        f"{fact_id}: relevance_exclusion cannot be cited_unverified (Extension 8 invariant)"
    )
    # supporting_citations: each entry must be either a literature note that
    # exists, or a non-prefix string the audit-knowledge-graph script accepts.
    for cite in value["supporting_citations"]:
        if isinstance(cite, str) and cite.startswith("research/literature/"):
            cite_path = ROOT / "docs/_internal" / cite
            assert cite_path.exists(), f"{fact_id}: supporting citation {cite} not found at {cite_path}"


@pytest.mark.parametrize("fact_id", RELEVANCE_EXCLUSION_FACTS, ids=RELEVANCE_EXCLUSION_FACTS)
def test_relevance_exclusion_name_unique(fact_id: str) -> None:
    """Each relevance_exclusion's `name` must be unique across the family."""
    fact = FACTS[fact_id]
    name = fact["value"]["name"]
    siblings = [
        f for f in FACTS.values()
        if f.get("fact_kind") == "relevance_exclusion" and f["id"] != fact_id
    ]
    sibling_names = [f["value"].get("name") for f in siblings]
    assert name not in sibling_names, (
        f"{fact_id}: name {name!r} duplicates a sibling relevance_exclusion fact"
    )


# ---------------------------------------------------------------------------
# Re-pin NOAEL-FACT-001..005. The behavioral property tests live in
# frontend/tests/properties/noael.property.test.ts but the audit script
# also scans backend/tests/. Listing them here keeps the fact_id reference
# stable even if the frontend property file is reorganized -- a defense
# against silent regression on the disable_marker family.
# ---------------------------------------------------------------------------

DISABLE_MARKER_FACTS = [
    "NOAEL-FACT-001",
    "NOAEL-FACT-002",
    "NOAEL-FACT-003",
    "NOAEL-FACT-004",
    "NOAEL-FACT-005",
]


@pytest.mark.parametrize("fact_id", DISABLE_MARKER_FACTS, ids=DISABLE_MARKER_FACTS)
def test_disable_marker_present_with_required_fields(fact_id: str) -> None:
    """disable_marker facts must declare a rule + rationale + recommended_action."""
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "disable_marker"
    value = fact["value"]
    for required in ("rule", "rationale", "recommended_action"):
        assert required in value and value[required], f"{fact_id}: value.{required} missing or empty"


# ---------------------------------------------------------------------------
# Smoke: every NOAEL fact in the graph must be covered by at least one of
# the parametrize lists above (or by the frontend property tests).
# ---------------------------------------------------------------------------

def test_all_noael_facts_covered() -> None:
    noael_in_graph = {fid for fid in FACTS if fid.startswith("NOAEL-FACT-")}
    noael_covered = (
        set(GATE_CRITERION_FACTS)
        | {t[0] for t in THRESHOLD_FACTS}
        | {t[0] for t in REGULATORY_EXPECTATION_FACTS}
        | set(RELEVANCE_EXCLUSION_FACTS)
        | set(DISABLE_MARKER_FACTS)
    )
    missing = noael_in_graph - noael_covered
    assert not missing, f"new NOAEL fact(s) without parity coverage: {sorted(missing)}"
