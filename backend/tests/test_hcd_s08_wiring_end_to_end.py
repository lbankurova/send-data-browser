"""F11 end-to-end regression: assert AC-F1-1 / AC-F9-2 on real generated output.

Runs against `backend/generated/PointCross/rule_results.json` (fixture
pattern from Verify empirical claims, CLAUDE.md rule 16). Mirror-pattern
tests do not satisfy AC-F1-1 -- this file checks the actual emitted record
shape.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

_GENERATED = _BACKEND / "generated" / "PointCross" / "rule_results.json"

pytestmark = pytest.mark.skipif(
    not _GENERATED.exists() or _GENERATED.stat().st_size == 0,
    reason="PointCross rule_results.json not generated",
)


def _load_rules() -> list[dict]:
    with open(_GENERATED) as f:
        return json.load(f)


# Required inner keys on every hcd_evidence record (AC-F1-1).
_REQUIRED_KEYS = {
    "background_rate", "background_n_animals", "background_n_studies",
    "source", "year_range", "match_tier", "match_confidence",
    "percentile_of_observed", "fisher_p_vs_hcd", "drift_flag",
    "confidence_contribution", "contribution_components",
    "alpha_applies", "reason", "alpha_scaled_threshold",
    "noael_floor_applied", "cell_n_below_reliability_threshold",
}


def test_every_catalog_matched_has_hcd_evidence():
    """AC-F1-1 + AC-F9-2: every MI/MA catalog-matched rule result carries a
    complete hcd_evidence record (no silent absence)."""
    rules = _load_rules()
    matched = [
        r for r in rules
        if r.get("scope") == "endpoint"
        and r.get("params", {}).get("catalog_id")
        and r.get("params", {}).get("domain") in {"MI", "MA"}
    ]
    assert matched, "expected at least one MI catalog-matched rule on PointCross"
    missing = [r for r in matched if "hcd_evidence" not in r.get("params", {})]
    assert not missing, f"{len(missing)} catalog-matched rules missing hcd_evidence"


def test_every_hcd_evidence_has_required_keys():
    """AC-F1-1: every emitted hcd_evidence has the full 17-field shape."""
    rules = _load_rules()
    records = [
        r["params"]["hcd_evidence"]
        for r in rules
        if r.get("params", {}).get("hcd_evidence")
    ]
    assert records, "expected at least one hcd_evidence record"
    for rec in records:
        keys = set(rec.keys())
        missing = _REQUIRED_KEYS - keys
        assert not missing, f"hcd_evidence missing keys: {missing}"


def test_noael_floor_applied_agrees_with_clinical_class():
    """AC-F3-1: Sentinel + HighConcern => noael_floor_applied True; others False."""
    rules = _load_rules()
    for r in rules:
        params = r.get("params") or {}
        hcd = params.get("hcd_evidence")
        if not hcd:
            continue
        cls = params.get("clinical_class")
        expected = cls in {"Sentinel", "HighConcern"}
        assert hcd["noael_floor_applied"] is expected, (
            f"rule {r.get('rule_id')} catalog={params.get('catalog_id')} "
            f"clinical_class={cls} floor={hcd['noael_floor_applied']}"
        )


def test_flag_off_alpha_applies_is_false_everywhere():
    """AC-F5-1: α-cell flag OFF -> alpha_applies == False on all records."""
    rules = _load_rules()
    violations = [
        r for r in rules
        if (r.get("params") or {}).get("hcd_evidence", {}).get("alpha_applies")
    ]
    assert not violations, (
        f"{len(violations)} rule results have alpha_applies=True with flag OFF"
    )


def test_contribution_components_keys_always_present():
    """AC-F2-3: contribution_components dict is always complete (audit-grep)."""
    rules = _load_rules()
    required = {
        "gt_95th_percentile", "gt_99th_percentile",
        "below_5th_down_direction", "ultra_rare_any_occurrence",
        "tier_cap_applied", "hcd_discordant_protective",
    }
    for r in rules:
        hcd = (r.get("params") or {}).get("hcd_evidence")
        if not hcd:
            continue
        components = hcd.get("contribution_components") or {}
        missing = required - set(components.keys())
        assert not missing, (
            f"rule {r.get('rule_id')} hcd_evidence.contribution_components "
            f"missing keys {missing}"
        )
