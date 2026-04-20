"""Endpoint-name match rate between sentinel and influence generators.

DATA-GAP-OUTLIER-01 verification gate. Outliers-pane-unified Phase 2
merges sentinel bio-outlier flags into the animal-influence column. That
merge keys on endpoint name. If the two generators derive the name
differently, the join becomes a no-op for continuous endpoints.

Sentinel builds `_make_endpoint_name(domain, test_code, specimen)` from
raw SEND fields (e.g. `"ALB"` for LB, `"WEIGHT (BRAIN)"` for OM).
Influence calls `_make_endpoint_name(finding)` which reads
`finding["endpoint_label"]` first -- populated by the finding builder
with a human-readable label (e.g. `"Albumin"`, `"BRAIN (WEIGHT)"`).

This test loads PointCross real data, derives both names per continuous
finding, and asserts the match rate is >=90%. Below that threshold,
Phase 2 cannot proceed -- either canonicalize the two derivations or
key the merge on a stable identifier.

Spec: docs/_internal/incoming/outliers-pane-unified.md (R1 F1, AC-13)
TODO: DATA-GAP-OUTLIER-01
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from generator.animal_influence import _make_endpoint_name as influence_name
from generator.subject_sentinel import _make_endpoint_name as sentinel_name

GENERATED_DIR = Path(__file__).resolve().parent.parent / "generated"
MATCH_RATE_THRESHOLD = 0.90
GATE_STUDY = "PointCross"


def _load(study: str, name: str) -> dict:
    path = GENERATED_DIR / study / name
    if not path.exists():
        pytest.skip(f"Missing generated file: {path}")
    with open(path) as f:
        return json.load(f)


def _continuous_findings(unified: dict) -> list[dict]:
    return [f for f in unified["findings"] if f.get("data_type") == "continuous"]


def _derive_names(findings: list[dict]) -> list[tuple[dict, str, str, bool]]:
    """For each finding return (finding, sentinel_name, influence_name, match)."""
    rows = []
    for f in findings:
        domain = f.get("domain", "") or ""
        test_code = f.get("test_code", "") or ""
        specimen = f.get("specimen", "") or ""
        s_name = sentinel_name(domain, test_code, specimen)
        i_name = influence_name(f)
        rows.append((f, s_name, i_name, s_name == i_name))
    return rows


def test_endpoint_name_match_rate_pointcross() -> None:
    """Gate: sentinel vs influence endpoint-name agreement on PointCross."""
    unified = _load(GATE_STUDY, "unified_findings.json")
    cont = _continuous_findings(unified)
    assert cont, f"No continuous findings in {GATE_STUDY}"

    rows = _derive_names(cont)
    total = len(rows)
    matches = sum(1 for _, _, _, m in rows if m)
    rate = matches / total

    if rate < MATCH_RATE_THRESHOLD:
        by_domain: dict[str, list[tuple[str, str]]] = {}
        for f, s, i, match in rows:
            if match:
                continue
            by_domain.setdefault(f.get("domain", "?"), []).append((s, i))
        lines = [
            f"Match rate {rate:.1%} ({matches}/{total}) below {MATCH_RATE_THRESHOLD:.0%} threshold.",
            "Mismatches by domain (sentinel -> influence):",
        ]
        for dom in sorted(by_domain):
            pairs = by_domain[dom]
            lines.append(f"  {dom}: {len(pairs)} mismatches")
            for s, i in pairs[:5]:
                lines.append(f"    {s!r}  vs  {i!r}")
            if len(pairs) > 5:
                lines.append(f"    ... and {len(pairs) - 5} more")
        pytest.fail("\n".join(lines))


def test_endpoint_name_match_rate_per_domain_pointcross() -> None:
    """Diagnostic: per-domain match rates on PointCross.

    Not a gate -- exposes which domains drive the overall rate so fix
    scope is clear. Always passes; the report is in captured stdout.
    """
    unified = _load(GATE_STUDY, "unified_findings.json")
    cont = _continuous_findings(unified)
    rows = _derive_names(cont)

    by_dom: dict[str, tuple[int, int]] = {}
    for f, _, _, match in rows:
        dom = f.get("domain", "?")
        total, matched = by_dom.get(dom, (0, 0))
        by_dom[dom] = (total + 1, matched + (1 if match else 0))

    report = [f"Per-domain endpoint-name match rates ({GATE_STUDY}):"]
    for dom in sorted(by_dom):
        total, matched = by_dom[dom]
        report.append(f"  {dom}: {matched}/{total} ({matched / total:.1%})")
    print("\n".join(report))
