"""F2: γ-primary contribution into compute_clinical_confidence.

Covers AC-F2-1 (flag-OFF regression), AC-F2-2 (+1 promotes Medium->High),
AC-F2-6 (Low->Medium boundary), AC-F2-7 (tier-cap interaction preserves
counter-intuitive outcome).

Spec: docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md F2
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.clinical_catalog import compute_clinical_confidence  # noqa: E402
from services.analysis.hcd_evidence import empty_hcd_evidence  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _low_score_params() -> dict:
    """Params that score exactly 2 pre-γ (Low boundary, HighConcern match).

    n_affected=1 < min_n=3 -> +0; threshold pattern -> +1; HighConcern -> +1;
    no significance boost. Total 2.
    """
    return {"n_affected": 1, "dose_response_pattern": "threshold", "p_value": 0.2}


def _match_high_concern() -> dict:
    return {"min_n_affected": 3, "clinical_class": "HighConcern"}


def _match_moderate() -> dict:
    return {"min_n_affected": 3, "clinical_class": "ModerateConcern"}


def _match_sentinel() -> dict:
    return {"min_n_affected": 1, "clinical_class": "Sentinel"}


# ---------------------------------------------------------------------------
# AC-F2-1: flag-OFF / no HCD -> pre-change behavior byte-equal
# ---------------------------------------------------------------------------

def test_no_hcd_evidence_preserves_pre_change_score():
    params = {"n_affected": 5, "dose_response_pattern": "monotonic_increase",
              "p_value": 0.001}
    match = _match_sentinel()
    # Pre-change: n_affected=5 >= min_n*3=3 -> +3; monotonic -> +2; Sentinel ->
    # +2; p<0.01 -> +1. Total 8 -> High.
    assert compute_clinical_confidence(params, match, hcd_evidence=None) == "High"
    # Passing no hcd_evidence arg at all (default None) also preserves behavior
    assert compute_clinical_confidence(params, match) == "High"


# ---------------------------------------------------------------------------
# AC-F2-2: +1 promotes score-5 Medium to High
# ---------------------------------------------------------------------------

def test_gamma_plus_1_promotes_medium_to_high():
    # Construct a score-5 input via HighConcern (min_n=3):
    # n_aff=6 >= min_n*2=6 -> +2; monotonic -> +2; HighConcern -> +1. Total 5 -> Medium.
    params = {"n_affected": 6, "dose_response_pattern": "monotonic_increase",
              "p_value": 0.5}
    match = _match_high_concern()
    # With no HCD -> Medium
    assert compute_clinical_confidence(params, match) == "Medium"

    hcd = empty_hcd_evidence()
    hcd["confidence_contribution"] = 1
    # +1 -> score 6 -> High
    assert compute_clinical_confidence(params, match, hcd_evidence=hcd) == "High"


# ---------------------------------------------------------------------------
# AC-F2-6: score-2 + γ+1 -> Medium; same + γ+0 stays Low
# ---------------------------------------------------------------------------

def test_low_to_medium_boundary():
    params = _low_score_params()
    match = _match_high_concern()
    # Baseline: 2 -> Low
    assert compute_clinical_confidence(params, match) == "Low"

    hcd_plus_1 = empty_hcd_evidence()
    hcd_plus_1["confidence_contribution"] = 1
    assert compute_clinical_confidence(params, match, hcd_evidence=hcd_plus_1) == "Medium"

    hcd_zero = empty_hcd_evidence()
    hcd_zero["confidence_contribution"] = 0
    assert compute_clinical_confidence(params, match, hcd_evidence=hcd_zero) == "Low"


# ---------------------------------------------------------------------------
# AC-F2-7: tier-cap interaction -- tier-3 capped to +1 stays Medium;
# same raw at tier-1 (+3) promotes to High on a score-4 input.
# ---------------------------------------------------------------------------

def _score_4_params_and_match():
    # n_aff=3 >= min_n=3 -> +1; monotonic -> +2; HighConcern -> +1. Total 4 -> Medium.
    params = {"n_affected": 3, "dose_response_pattern": "monotonic_increase",
              "p_value": 0.5}
    match = _match_high_concern()
    return params, match


def test_tier_3_capped_stays_medium_on_score_4():
    params, match = _score_4_params_and_match()
    hcd_capped = empty_hcd_evidence()
    hcd_capped["confidence_contribution"] = 1  # post-cap from tier-3
    hcd_capped["contribution_components"]["tier_cap_applied"] = True
    # 4 + 1 = 5 -> Medium
    assert compute_clinical_confidence(params, match, hcd_evidence=hcd_capped) == "Medium"


def test_tier_1_uncapped_promotes_score_4_to_high():
    params, match = _score_4_params_and_match()
    hcd_full = empty_hcd_evidence()
    hcd_full["confidence_contribution"] = 3  # tier-1 raw = +3
    # 4 + 3 = 7 -> High
    assert compute_clinical_confidence(params, match, hcd_evidence=hcd_full) == "High"


# ---------------------------------------------------------------------------
# AC-F2-3: regression with None hcd_evidence matches None default
# ---------------------------------------------------------------------------

def test_explicit_none_equals_default_none():
    params = {"n_affected": 2, "dose_response_pattern": "threshold", "p_value": None}
    match = _match_moderate()
    assert (
        compute_clinical_confidence(params, match)
        == compute_clinical_confidence(params, match, hcd_evidence=None)
    )
