"""F5 α-cell machinery tests (flag-ON paths).

Covers:
  AC-F5-2: flag ON + C14 + 30% HCD background + N=200 -> alpha_applies True,
           alpha_scaled_threshold=11, reason populated.
  AC-F5-3: tr_adverse + flag ON + C14 -> α cannot override (floor holds).
  AC-F5-4: cell-N below 100 -> α skipped.

Spec: docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md F5
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.clinical_catalog import (  # noqa: E402
    _apply_alpha_cell_scaling,
)
from services.analysis.hcd_evidence import empty_hcd_evidence  # noqa: E402


def _c14_match(alpha_eligible: bool = True) -> dict:
    return {
        "id": "C14", "clinical_class": "ModerateConcern",
        "min_n_affected": 3, "alpha_eligible": alpha_eligible,
    }


def _hcd_with_bg(bg: float, n_animals: int) -> dict:
    ev = empty_hcd_evidence()
    ev["background_rate"] = bg
    ev["background_n_animals"] = n_animals
    ev["source"] = "Giknis/Clifford 2019"
    return ev


# AC-F5-2: flag ON + C14 + 30% HCD background + 200 animals -> scaling fires.
def test_alpha_fires_on_c14_high_background():
    params = {"n_affected": 5, "n_total": 50}
    hcd = _hcd_with_bg(0.30, 200)
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    assert hcd["alpha_applies"] is True
    # effective_min_n = ceil(3 + 0.5 * 50 * 0.30) = ceil(3 + 7.5) = 11
    assert hcd["alpha_scaled_threshold"] == 11
    assert hcd["reason"] is not None
    assert "30% HCD background" in hcd["reason"]
    assert "Giknis/Clifford 2019" in hcd["reason"]


# AC-F5-3: tr_adverse + flag ON on C14 -> α skipped (floor holds).
def test_alpha_skipped_when_finding_class_tr_adverse():
    params = {"n_affected": 5, "n_total": 50, "finding_class": "tr_adverse"}
    hcd = _hcd_with_bg(0.30, 200)
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    assert hcd["alpha_applies"] is False
    assert hcd["alpha_scaled_threshold"] is None
    assert hcd["reason"] is None


# AC-F5-4: cell-N below 100 -> α skipped.
def test_alpha_skipped_when_cell_n_below_reliability_threshold():
    params = {"n_affected": 5, "n_total": 50}
    hcd = _hcd_with_bg(0.30, 80)  # < 100
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    assert hcd["alpha_applies"] is False
    assert hcd["alpha_scaled_threshold"] is None


# AC-F5-1: flag OFF -> dead code path (even on C14 with high HCD).
def test_alpha_dead_when_flag_off():
    params = {"n_affected": 5, "n_total": 50}
    hcd = _hcd_with_bg(0.30, 200)
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=False,
    )
    assert hcd["alpha_applies"] is False
    assert hcd["alpha_scaled_threshold"] is None


# α skipped on non-eligible catalog (C01..C13 all have alpha_eligible=False).
def test_alpha_skipped_on_non_eligible_catalog():
    params = {"n_affected": 5, "n_total": 50}
    hcd = _hcd_with_bg(0.30, 200)
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(alpha_eligible=False), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    assert hcd["alpha_applies"] is False


# α skipped when background rate is below the high-background threshold.
def test_alpha_skipped_when_background_not_high():
    params = {"n_affected": 5, "n_total": 50}
    hcd = _hcd_with_bg(0.10, 200)  # below 25% threshold
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    assert hcd["alpha_applies"] is False


# α does NOT fire when observed n_affected already meets or exceeds the
# scaled threshold (promotion proceeds normally).
def test_alpha_does_not_suppress_when_affected_meets_scaled_threshold():
    params = {"n_affected": 15, "n_total": 50}  # above scaled=11
    hcd = _hcd_with_bg(0.30, 200)
    _apply_alpha_cell_scaling(
        catalog_match=_c14_match(), params=params,
        hcd_evidence=hcd, enable_alpha=True,
    )
    # Machinery does NOT emit alpha_applies=True when n_affected already
    # meets the scaled threshold (severity promotion unaffected).
    assert hcd["alpha_applies"] is False
