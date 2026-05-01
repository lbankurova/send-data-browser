"""Knowledge-graph parity tests: CV facts (cardiovascular safety pharm thresholds).

Pins the values declared in the typed graph (CV-FACT-001..005) against the
_CONCERN_THRESHOLDS dict in classification.py. If either side drifts, the
test fails -- closing the silent-drift surface that the load-bearing audit
surfaces as LIVE_OVERCLAIM.

Each fact_id below appears as a parametrize id so
scripts/audit-knowledge-load-bearing.py classifies the fact as TEST_VERIFIED.

Covers:
- CV-FACT-001 QTc 10 ms (one fact, 9 SEND test_code aliases)
- CV-FACT-002 MAP 10 mmHg
- CV-FACT-003 SYSBP 15 mmHg
- CV-FACT-004 DIABP 10 mmHg
- CV-FACT-005 HR 10 bpm
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Reuse FACTS loader from HCD parity tests (one parser, one source-of-truth path).
from backend.tests.test_knowledge_facts_hcd import FACTS

ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from services.analysis.classification import _CONCERN_THRESHOLDS  # noqa: E402


# (fact_id, list-of-test-codes the fact's endpoints scope covers)
CV_THRESHOLD_FACTS: list[tuple[str, list[str]]] = [
    (
        "CV-FACT-001",
        ["QTC", "QTCB", "QTCF", "QTCAG", "QTCBAG", "QTCFAG", "QTCVAG", "QTCSAG", "QTCVDW"],
    ),
    ("CV-FACT-002", ["MAP"]),
    ("CV-FACT-003", ["SYSBP"]),
    ("CV-FACT-004", ["DIABP"]),
    ("CV-FACT-005", ["HR"]),
]


@pytest.mark.parametrize("fact_id, test_codes", CV_THRESHOLD_FACTS, ids=[t[0] for t in CV_THRESHOLD_FACTS])
def test_cv_threshold_parameter_value_parity(fact_id: str, test_codes: list[str]) -> None:
    """_CONCERN_THRESHOLDS entries for the fact's test_codes must equal parameter_value."""
    assert fact_id in FACTS, f"{fact_id} not in knowledge-graph.md"
    fact = FACTS[fact_id]
    assert fact["fact_kind"] == "threshold"
    assert fact["value"]["encoding"] == "scalar_policy_parameter"

    declared = float(fact["value"]["parameter_value"])

    # Endpoint scope must match the test_codes list this test asserts on.
    declared_endpoints = fact["scope"]["endpoints"]
    assert sorted(declared_endpoints) == sorted(test_codes), (
        f"{fact_id}: scope.endpoints={declared_endpoints} but parity test asserts on {test_codes}"
    )

    # Every endpoint must be present in _CONCERN_THRESHOLDS with the declared value.
    for tc in test_codes:
        assert tc in _CONCERN_THRESHOLDS, (
            f"{fact_id}: '{tc}' missing from _CONCERN_THRESHOLDS in classification.py"
        )
        actual = float(_CONCERN_THRESHOLDS[tc])
        assert abs(actual - declared) < 1e-6, (
            f"{fact_id}: _CONCERN_THRESHOLDS['{tc}']={actual} but fact declares parameter_value={declared}"
        )


def test_all_cv_facts_covered() -> None:
    """Every CV-FACT-* in knowledge-graph.md must have a parity test entry above."""
    cv_in_graph = {fid for fid in FACTS if fid.startswith("CV-FACT-")}
    cv_tested = {fid for fid, _ in CV_THRESHOLD_FACTS}
    missing = cv_in_graph - cv_tested
    assert not missing, f"CV facts in graph but not in CV_THRESHOLD_FACTS: {sorted(missing)}"
