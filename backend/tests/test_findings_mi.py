"""GAP-242: severity_grade_counts must respect the affected-subjects invariant.

Per-subject worst-severity counting (findings_mi.py) means:
- sum(sgc.values()) <= affected for every (finding, dose_level)
- Equality holds when every affected subject has at least one graded row
- Subjects with NaN severity contribute to `affected` but no `sgc` bucket
  (frontend's defensive `ungraded = max(0, affected - sum(grades))` clamp
  legitimately represents these missing-severity subjects)

Pre-fix behavior counted raw rows (USUBJID-with-multiple-rows over-counted;
USUBJID-with-NaN-severity under-counted). The fixture test below asserts the
invariant against real generated data so future drift surfaces immediately.
"""

import json
from pathlib import Path

import pytest

GENERATED = Path(__file__).resolve().parents[1] / "generated"


def _load_mi_groups(study: str) -> list[tuple[str, int, int, dict | None]]:
    """Return [(endpoint_label, dose_level, affected, severity_grade_counts), ...] for MI findings."""
    path = GENERATED / study / "unified_findings.json"
    if not path.exists():
        pytest.skip(f"{study} not generated")
    with path.open() as f:
        data = json.load(f)
    rows = []
    for finding in data.get("findings", []):
        if finding.get("domain") != "MI":
            continue
        label = finding.get("endpoint_label", "")
        for gs in finding.get("group_stats", []) or []:
            rows.append((
                label,
                gs.get("dose_level"),
                gs.get("affected", 0),
                gs.get("severity_grade_counts"),
            ))
    return rows


@pytest.mark.parametrize("study", ["PointCross", "Nimble"])
def test_severity_grade_counts_does_not_exceed_affected(study: str) -> None:
    """sum(sgc) > affected is a per-subject double-count bug (GAP-242)."""
    over_counts = []
    for label, dose_level, affected, sgc in _load_mi_groups(study):
        if not sgc:
            continue
        sgc_sum = sum(sgc.values())
        if sgc_sum > affected:
            over_counts.append((label, dose_level, sgc_sum, affected, sgc))
    assert not over_counts, (
        f"GAP-242 regression in {study}: {len(over_counts)} (finding, dose_level) "
        f"groups have severity_grade_counts summing above affected. "
        f"First few: {over_counts[:3]}"
    )


@pytest.mark.parametrize("study", ["PointCross", "Nimble"])
def test_severity_grade_counts_keys_are_severity_integers(study: str) -> None:
    """Keys in sgc must be string-encoded integers in the 1..5 severity range."""
    bad = []
    for label, dose_level, _affected, sgc in _load_mi_groups(study):
        if not sgc:
            continue
        for k in sgc.keys():
            try:
                grade = int(k)
            except (ValueError, TypeError):
                bad.append((label, dose_level, k))
                continue
            if grade < 1 or grade > 5:
                bad.append((label, dose_level, k))
    assert not bad, f"Non-1..5 severity keys in {study}: {bad[:5]}"
