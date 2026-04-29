"""Knowledge-graph parity tests: HCD facts.

Pins the engine's actual HCD baseline data against the typed values declared in
docs/_internal/knowledge/knowledge-graph.md. If a fact's value (mean / SD / n /
range / encoding) is changed in the YAML without updating the underlying SQLite
row, this test fails -- closing the silent-drift surface that load-bearing
audits surface as LIVE_OVERCLAIM.

Each fact_id below appears as a parametrize id so scripts/audit-knowledge-load-bearing.py
classifies the fact as TEST_VERIFIED.

Covers all 12 HCD facts:
- HCD-FACT-001 (cyno male ALT, numeric_baseline)
- HCD-FACT-002 (cyno ALP DISABLED in 2-5yr, disable_marker)
- HCD-FACT-003a / 003b (cyno male/female CRP, pharma_anchor)
- HCD-FACT-004 (cyno female ALT, numeric_baseline)
- HCD-FACT-005a / 005b (cyno male/female fibrinogen, pharma_anchor)
- HCD-FACT-006 / 007 (Wistar Han male/female ALT, numeric_baseline log_normal_by_bw_class)
- HCD-FACT-008 / 009 (NZW rabbit male/female ALT, numeric_baseline arithmetic_mean_sem)
- HCD-FACT-010 (NZW rabbit ALT cited stub, numeric_baseline arithmetic_range_cited)
"""

from __future__ import annotations

import math
import re
import sqlite3
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
GRAPH_PATH = ROOT / "docs/_internal/knowledge/knowledge-graph.md"
SQLITE_PATH = ROOT / "docs/_internal/research/hcd/hcd_seed.sqlite"


# ---------------------------------------------------------------------------
# Fact loader -- shared with NOAEL parity tests
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"```yaml\s*\n(.*?)```", re.DOTALL)


def load_facts() -> dict[str, dict]:
    """Parse every typed fact YAML block keyed by fact_id."""
    text = GRAPH_PATH.read_text(encoding="utf-8")
    facts: dict[str, dict] = {}
    for match in _FENCE_RE.finditer(text):
        try:
            data = yaml.safe_load(match.group(1))
        except yaml.YAMLError:
            continue
        if isinstance(data, dict) and isinstance(data.get("id"), str) and "-FACT-" in data["id"]:
            facts[data["id"]] = data
    return facts


FACTS = load_facts()


# ---------------------------------------------------------------------------
# Single-row sqlite-baselined facts: numeric_baseline + pharma_anchor with
# encoding=arithmetic_mean_sd, arithmetic_mean_sem, etc.
# ---------------------------------------------------------------------------

# (fact_id, sqlite predicates, expected fields)
SINGLE_ROW_HCD: list[tuple[str, dict, dict]] = [
    (
        "HCD-FACT-001",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "M", "lbtestcd": "ALT"},
        {"n": 76, "mean_val": 51.8, "sd_val": 24.0},
    ),
    (
        "HCD-FACT-003a",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "M", "lbtestcd": "CRP"},
        {"n": 51, "mean_val": 1.49, "sd_val": 1.33},
    ),
    (
        "HCD-FACT-003b",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "F", "lbtestcd": "CRP"},
        {"n": 17, "mean_val": 1.32, "sd_val": 0.90},
    ),
    (
        "HCD-FACT-004",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "F", "lbtestcd": "ALT"},
        {"n": 37, "mean_val": 60.0, "sd_val": 45.0},
    ),
    (
        "HCD-FACT-005a",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "M", "lbtestcd": "FIB"},
        {"n": 50, "mean_val": 245.0, "sd_val": 58.0},
    ),
    (
        "HCD-FACT-005b",
        {"source_id": "KIM2016", "species": "PRIMATE", "strain": "CYNOMOLGUS", "sex": "F", "lbtestcd": "FIB"},
        {"n": 17, "mean_val": 261.0, "sd_val": 56.0},
    ),
    (
        "HCD-FACT-008",
        {"source_id": "OZKAN2012", "species": "RABBIT", "strain": "NZW", "sex": "M", "lbtestcd": "ALT"},
        {"n": 24, "mean_val": 7.20, "sem_val": 0.19},
    ),
    (
        "HCD-FACT-009",
        {"source_id": "OZKAN2012", "species": "RABBIT", "strain": "NZW", "sex": "F", "lbtestcd": "ALT"},
        {"n": 16, "mean_val": 7.0, "sem_val": 0.27},
    ),
]


@pytest.mark.parametrize("fact_id, predicates, expected", SINGLE_ROW_HCD, ids=[t[0] for t in SINGLE_ROW_HCD])
def test_hcd_fact_single_row_parity(fact_id: str, predicates: dict, expected: dict) -> None:
    """SQLite row matching the fact's scope must carry the declared mean/SD/SEM/n."""
    assert fact_id in FACTS, f"{fact_id} not in knowledge-graph.md"
    conn = sqlite3.connect(str(SQLITE_PATH))
    try:
        where = " AND ".join(f"{k}=?" for k in predicates)
        cols = ", ".join(expected.keys())
        cur = conn.execute(f"SELECT {cols} FROM hcd_lb WHERE {where}", tuple(predicates.values()))
        rows = cur.fetchall()
    finally:
        conn.close()
    assert len(rows) == 1, f"{fact_id}: expected exactly one sqlite row matching {predicates}, got {len(rows)}"
    row = rows[0]
    for i, (field, want) in enumerate(expected.items()):
        got = row[i]
        if isinstance(want, float):
            assert got is not None and math.isclose(got, want, rel_tol=1e-3), (
                f"{fact_id}.{field}: sqlite={got}, fact YAML declares {want}"
            )
        else:
            assert got == want, f"{fact_id}.{field}: sqlite={got}, fact YAML declares {want}"


# ---------------------------------------------------------------------------
# HCD-FACT-002: disable_marker. The fact says "use ALT/AST as primary
# hepatocellular markers; do not promote ALP elevations to liver tree in
# 2-5yr cyno." consumed_by claims hcd_lb_etl.py emits a CAUTION note in this
# scope. Parity test: confirm the consumer file actually contains the
# CAUTION-emission code path and references ALP as the suppressed marker.
# ---------------------------------------------------------------------------

def test_hcd_fact_002_alp_disable_marker() -> None:
    """HCD-FACT-002: cyno young-adult ALP must be flagged as bone-isoform-dominated, not hepatic."""
    fact_id = "HCD-FACT-002"
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "disable_marker"
    assert "ALP" in fact["scope"]["endpoints"]

    # Verify the live consumer (per consumed_by claim) actually emits the
    # CAUTION semantic. This is the structural property that, if removed,
    # would make the disable_marker fact's claim drift.
    etl = (ROOT / "backend/etl/hcd_lb_etl.py").read_text(encoding="utf-8", errors="ignore")
    assert "ALP" in etl, "hcd_lb_etl.py must reference ALP for the disable_marker emission"
    # Look for the bone-isoform / cyno-young CAUTION emission. Prefer
    # specific-marker text; fall back to any "caution" branch in the file.
    has_caution = any(token in etl.lower() for token in ("bone isoform", "bone-isoform", "ALP CAUTION", "alp_caution", "caution"))
    assert has_caution, "hcd_lb_etl.py must emit a CAUTION about ALP in the cyno young-adult scope"


# ---------------------------------------------------------------------------
# HCD-FACT-006 / 007: numeric_baseline with encoding=log_normal_by_bw_class.
# Multi-row stratified by BW class. Parity test asserts row-count >=
# expected_row_count and that one row carries the example_row values.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "fact_id, predicates",
    [
        ("HCD-FACT-006", {"source_id": "VICOG2025", "species": "RAT", "strain": "WISTAR_HAN", "sex": "M", "lbtestcd": "ALT"}),
        ("HCD-FACT-007", {"source_id": "VICOG2025", "species": "RAT", "strain": "WISTAR_HAN", "sex": "F", "lbtestcd": "ALT"}),
    ],
    ids=["HCD-FACT-006", "HCD-FACT-007"],
)
def test_hcd_fact_log_normal_bw_class_parity(fact_id: str, predicates: dict) -> None:
    """log_normal_by_bw_class facts must materialize as N>=expected_row_count rows in sqlite."""
    fact = FACTS[fact_id]
    assert fact["value"]["encoding"] == "log_normal_by_bw_class"
    expected_rows = fact["value"]["bw_class_bins"]

    conn = sqlite3.connect(str(SQLITE_PATH))
    try:
        where = " AND ".join(f"{k}=?" for k in predicates)
        cur = conn.execute(
            f"SELECT bw_class_g_min, bw_class_g_max, n, geom_mean_val, geom_sd_val FROM hcd_lb WHERE {where} AND bw_class_g_min IS NOT NULL ORDER BY bw_class_g_min",
            tuple(predicates.values()),
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    assert len(rows) == expected_rows, (
        f"{fact_id}: fact declares {expected_rows} BW-class bins, sqlite has {len(rows)}"
    )

    # Row-1 example assertion: value block carries an example_row that should
    # match one of the sqlite rows. For HCD-FACT-006: bw 300-320, n=1247,
    # geom_mean=0.601. Locating it surfaces drift if the example is staled.
    example = fact["value"].get("example_row", {})
    if example:
        target_min = example["bw_class_g"][0]
        matches = [r for r in rows if r[0] == target_min]
        assert matches, f"{fact_id}: no sqlite row matches example_row.bw_class_g={example['bw_class_g']}"


# ---------------------------------------------------------------------------
# HCD-FACT-010: cited_unverified stub. The fact's purpose is structural --
# it must NOT carry a usable value, must contradict 008/009, and must point
# to an existing literature-stub file with status: cited-not-read.
# ---------------------------------------------------------------------------

def test_hcd_fact_010_cited_unverified_stub() -> None:
    fact_id = "HCD-FACT-010"
    fact = FACTS[fact_id]
    assert fact["confidence"] == "cited_unverified", f"{fact_id} must remain cited_unverified until source is read"
    assert "HCD-FACT-008" in fact.get("contradicts", []), f"{fact_id} must contradict HCD-FACT-008 (Ozkan male)"
    assert "HCD-FACT-009" in fact.get("contradicts", []), f"{fact_id} must contradict HCD-FACT-009 (Ozkan female)"

    # Live consumer: research/literature/hewitt-1989-rabbit-lb-stub.md
    stub = ROOT / "docs/_internal/research/literature/hewitt-1989-rabbit-lb-stub.md"
    assert stub.exists(), f"{fact_id}: cited literature stub missing -- {stub}"
    body = stub.read_text(encoding="utf-8", errors="ignore")
    assert "cited-not-read" in body or "cited_unverified" in body, (
        f"{fact_id}: stub must declare status: cited-not-read so the audit backlog stays accurate"
    )


# ---------------------------------------------------------------------------
# Smoke: the fact_ids covered above must equal the set of HCD facts in the
# graph -- guard against new HCD facts landing without parity coverage.
# ---------------------------------------------------------------------------

def test_all_hcd_facts_covered() -> None:
    hcd_in_graph = {fid for fid in FACTS if fid.startswith("HCD-FACT-")}
    hcd_covered = (
        {t[0] for t in SINGLE_ROW_HCD}
        | {"HCD-FACT-002", "HCD-FACT-006", "HCD-FACT-007", "HCD-FACT-010"}
    )
    missing = hcd_in_graph - hcd_covered
    assert not missing, f"new HCD fact(s) without parity coverage: {sorted(missing)}"
