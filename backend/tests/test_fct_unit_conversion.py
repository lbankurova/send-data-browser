"""F5 unit-conversion tests for compute_fct_payload.

Covers AC-F5-1 through AC-F5-5 from
docs/_internal/incoming/fct-lb-bw-band-values-synthesis.md:

  AC-F5-1: fold + up direction converts pct -> fold_ratio and the
           ladder fires the expected tier at boundary/above-floor values.
  AC-F5-2: fold + down direction pre-transforms band floors to
           distance-from-1.0 via transform_bands_for_down_fold(); the
           ladder fires the expected tier at each of the 4 floors plus
           boundary cases. Six test cases covering all tiers.
  AC-F5-3: pct_change units continue to produce identical verdicts to
           the pre-F5 shipped path (OM backward compatibility).
  AC-F5-4: _bands_payload retains the native fold values in
           fct_reliance.bands_used, not the transformed distances.
  AC-F5-5: unsupported units (absolute, sd) raise NotImplementedError
           with a clear message.

Run: cd backend && python -m pytest tests/test_fct_unit_conversion.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis import classification, fct_registry  # noqa: E402
from services.analysis.fct_registry import FctBands  # noqa: E402


# ---------------------------------------------------------------------------
# FctBands fixture helpers (avoid coupling to live registry state so the
# tests run deterministically regardless of which entries have shipped)
# ---------------------------------------------------------------------------


def _bands(
    variation_ceiling: float | None,
    concern_floor: float | None,
    adverse_floor: float | None,
    strong_adverse_floor: float | None,
    units: str,
    *,
    any_significant: bool = False,
    coverage: str = "partial",
    provenance: str = "regulatory",
    entry_ref: str = "TEST.ENDPOINT.up",
) -> FctBands:
    return FctBands(
        variation_ceiling=variation_ceiling,
        concern_floor=concern_floor,
        adverse_floor=adverse_floor,
        strong_adverse_floor=strong_adverse_floor,
        units=units,
        any_significant=any_significant,
        coverage=coverage,
        provenance=provenance,
        fallback_used=False,
        entry_ref=entry_ref,
        threshold_reliability="moderate",
        nhp_tier=None,
        special_flags=(),
        cross_organ_link=None,
        notes=None,
        raw_entry={},
    )


def _finding(pct: float | None, direction: str, domain: str = "LB", test_code: str = "ALT") -> dict:
    """Minimal finding shaped so _compute_pct_change_simple returns `pct`."""
    if pct is None:
        group_stats = [{"mean": None}, {"mean": None}]
    else:
        ctrl_mean = 100.0
        high_mean = ctrl_mean * (1.0 + pct / 100.0)
        group_stats = [{"mean": ctrl_mean}, {"mean": high_mean}]
    return {
        "domain": domain,
        "test_code": test_code,
        "direction": direction,
        "data_type": "continuous",
        "group_stats": group_stats,
    }


def _compute_verdict(pct: float | None, direction: str, bands: FctBands, species: str = "rat", **finding_overrides) -> dict:
    """Exercise compute_fct_payload with injected bands (monkeypatch get_fct)."""
    finding = _finding(pct, direction)
    finding.update(finding_overrides)

    # Capture the 'bands' lookup so we can inject the test fixture.
    original_get_fct = fct_registry.get_fct
    def stub_get_fct(domain, endpoint, species=None, direction="both", sex=None):
        return bands
    fct_registry.get_fct = stub_get_fct
    try:
        payload = classification.compute_fct_payload(finding, species=species)
    finally:
        fct_registry.get_fct = original_get_fct
    return payload


# ---------------------------------------------------------------------------
# AC-F5-1: Up direction with fold units
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "pct,expected_verdict,description",
    [
        # LB.ALT.up-shaped bands (1.5 / 2.0 / 3.0 / 5.0 fold)
        (10, "variation", "10% -> 1.1 fold < 1.5 variation_ceiling"),
        (50, "concern",   "50% -> 1.5 fold sits between ceiling and concern 2.0"),
        (100, "concern",  "100% -> 2.0 fold == concern_floor; boundary fires concern"),
        (150, "concern",  "150% -> 2.5 fold between concern 2.0 and adverse 3.0"),
        (200, "adverse",  "200% -> 3.0 fold == adverse_floor; boundary fires adverse"),
        (350, "adverse",  "350% -> 4.5 fold between adverse 3.0 and strong 5.0"),
        (400, "strong_adverse", "400% -> 5.0 fold == strong_adverse_floor"),
        (1000, "strong_adverse", "1000% -> 11.0 fold well above strong_adverse"),
    ],
)
def test_ac_f5_1_up_fold_conversion(pct, expected_verdict, description):
    bands = _bands(
        variation_ceiling=1.5,
        concern_floor=2.0,
        adverse_floor=3.0,
        strong_adverse_floor=5.0,
        units="fold",
        entry_ref="LB.ALT.up",
    )
    payload = _compute_verdict(pct, direction="up", bands=bands)
    assert payload["verdict"] == expected_verdict, (
        f"pct={pct} ({description}): expected {expected_verdict}, got {payload['verdict']}"
    )


# ---------------------------------------------------------------------------
# AC-F5-2: Down direction with fold units -- 6 ladder-tier tests
# ---------------------------------------------------------------------------
#
# LB.TP.down-shaped bands: variation 0.95 / concern 0.90 / adverse 0.85 /
# strong_adverse 0.75 (fold). After transform_bands_for_down_fold():
# distances 0.05 / 0.10 / 0.15 / 0.25. Magnitude = abs(1.0 - fold_ratio).


TP_DOWN_BANDS = dict(
    variation_ceiling=0.95,
    concern_floor=0.90,
    adverse_floor=0.85,
    strong_adverse_floor=0.75,
    units="fold",
)


@pytest.mark.parametrize(
    "pct,fold_ratio,distance,expected_verdict,description",
    [
        # Test 1 (far-below-variation): pct=-3 -> fold=0.97 -> distance=0.03 < 0.05
        (-3, 0.97, 0.03, "variation", "distance 0.03 below variation_ceiling 0.05"),
        # Test 2 (sub-variation just below ceiling): pct=-4 -> fold=0.96 -> distance=0.04 < 0.05
        (-4, 0.96, 0.04, "variation", "distance 0.04 just below variation_ceiling"),
        # Test 3 (at concern floor boundary): pct=-10 -> fold=0.90 -> distance=0.10
        (-10, 0.90, 0.10, "concern", "distance 0.10 at concern_floor; boundary fires concern"),
        # Test 4 (at adverse floor boundary): pct=-15 -> fold=0.85 -> distance=0.15
        (-15, 0.85, 0.15, "adverse", "distance 0.15 at adverse_floor; boundary fires adverse"),
        # Test 5 (at strong_adverse floor boundary): pct=-25 -> fold=0.75 -> distance=0.25
        (-25, 0.75, 0.25, "strong_adverse", "distance 0.25 at strong_adverse_floor"),
        # Test 6 (between concern and adverse): pct=-12 -> fold=0.88 -> distance=0.12
        (-12, 0.88, 0.12, "concern", "distance 0.12 between concern 0.10 and adverse 0.15"),
    ],
)
def test_ac_f5_2_down_fold_conversion(pct, fold_ratio, distance, expected_verdict, description):
    bands = _bands(**TP_DOWN_BANDS, entry_ref="LB.TP.down")
    payload = _compute_verdict(pct, direction="down", bands=bands)
    assert payload["verdict"] == expected_verdict, (
        f"pct={pct} fold={fold_ratio} distance={distance} ({description}): "
        f"expected {expected_verdict}, got {payload['verdict']}"
    )


def test_ac_f5_2_down_fold_transform_preserves_ordering():
    """The transform must produce ASCENDING distance floors identical in
    polarity to up-direction ordering so the ladder is polarity-invariant.
    """
    bands = _bands(**TP_DOWN_BANDS, entry_ref="LB.TP.down")
    transformed = fct_registry.transform_bands_for_down_fold(bands)
    # 1.0 - {0.95, 0.90, 0.85, 0.75} = {0.05, 0.10, 0.15, 0.25}
    assert transformed.variation_ceiling == pytest.approx(0.05)
    assert transformed.concern_floor == pytest.approx(0.10)
    assert transformed.adverse_floor == pytest.approx(0.15)
    assert transformed.strong_adverse_floor == pytest.approx(0.25)
    # Ascending order (same polarity as up-fold ladder 1.5 < 2.0 < 3.0 < 5.0)
    assert transformed.variation_ceiling < transformed.concern_floor
    assert transformed.concern_floor < transformed.adverse_floor
    assert transformed.adverse_floor < transformed.strong_adverse_floor


def test_ac_f5_2_down_fold_transform_handles_null_floors():
    """Null band floors (e.g., concern_floor absent for OM-shaped 3-tier ladders)
    survive the transform as None.
    """
    bands = _bands(
        variation_ceiling=0.95,
        concern_floor=None,
        adverse_floor=0.85,
        strong_adverse_floor=None,
        units="fold",
    )
    transformed = fct_registry.transform_bands_for_down_fold(bands)
    assert transformed.variation_ceiling == pytest.approx(0.05)
    assert transformed.concern_floor is None
    assert transformed.adverse_floor == pytest.approx(0.15)
    assert transformed.strong_adverse_floor is None


# ---------------------------------------------------------------------------
# AC-F5-3: pct_change (OM) backward compatibility
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "pct,expected_verdict,description",
    [
        # OM.LIVER.both-shaped rat bands: variation 5 / adverse 10 / strong 25 (pct_change)
        (3, "variation", "pct 3 < variation_ceiling 5"),
        (7, "concern",   "pct 7 between variation 5 and adverse 10"),
        (12, "adverse",  "pct 12 >= adverse_floor 10"),
        (30, "strong_adverse", "pct 30 >= strong_adverse_floor 25"),
        # Below-baseline (down-direction magnitude): abs(pct)
        (-12, "adverse", "|pct -12| >= adverse_floor 10 (magnitude)"),
    ],
)
def test_ac_f5_3_pct_change_backward_compat(pct, expected_verdict, description):
    bands = _bands(
        variation_ceiling=5,
        concern_floor=None,
        adverse_floor=10,
        strong_adverse_floor=25,
        units="pct_change",
        entry_ref="OM.LIVER.both",
    )
    payload = _compute_verdict(pct, direction="both", bands=bands)
    assert payload["verdict"] == expected_verdict, (
        f"pct={pct} ({description}): expected {expected_verdict}, got {payload['verdict']}"
    )


# ---------------------------------------------------------------------------
# AC-F5-4: _bands_payload preserves native fold values
# ---------------------------------------------------------------------------


def test_ac_f5_4_bands_used_payload_preserves_fold():
    """For a down-fold band, fct_reliance.bands_used MUST show the native
    fold values (0.95/0.90/0.85/0.75), NOT the classifier's internal
    distances (0.05/0.10/0.15/0.25). The payload is the UI-facing contract.
    """
    bands = _bands(**TP_DOWN_BANDS, entry_ref="LB.TP.down")
    payload = _compute_verdict(-15, direction="down", bands=bands)
    bands_used = payload["fct_reliance"]["bands_used"]
    assert bands_used["variation_ceiling"] == pytest.approx(0.95)
    assert bands_used["concern_floor"] == pytest.approx(0.90)
    assert bands_used["adverse_floor"] == pytest.approx(0.85)
    assert bands_used["strong_adverse_floor"] == pytest.approx(0.75)
    assert bands_used["units"] == "fold"


def test_ac_f5_4_bands_used_payload_up_fold_unchanged():
    """Up-fold bands already use fold values in both the ladder and payload;
    confirm _bands_payload still round-trips them cleanly.
    """
    bands = _bands(
        variation_ceiling=1.5,
        concern_floor=2.0,
        adverse_floor=3.0,
        strong_adverse_floor=5.0,
        units="fold",
        entry_ref="LB.ALT.up",
    )
    payload = _compute_verdict(200, direction="up", bands=bands)
    bands_used = payload["fct_reliance"]["bands_used"]
    assert bands_used["variation_ceiling"] == pytest.approx(1.5)
    assert bands_used["adverse_floor"] == pytest.approx(3.0)
    assert bands_used["units"] == "fold"


# ---------------------------------------------------------------------------
# AC-F5-5: Unsupported units raise NotImplementedError
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("units", ["absolute", "sd"])
def test_ac_f5_5_unsupported_units_raise(units):
    bands = _bands(
        variation_ceiling=1.0,
        concern_floor=2.0,
        adverse_floor=3.0,
        strong_adverse_floor=5.0,
        units=units,
        entry_ref=f"TEST.ENDPOINT.up_{units}",
    )
    with pytest.raises(NotImplementedError, match="not supported"):
        _compute_verdict(100, direction="up", bands=bands)


# ---------------------------------------------------------------------------
# Edge-case: missing pct path (magnitude None) still produces legacy fallback
# for fold units -- exercises the stat-unavailable branch that preceded F5.
# ---------------------------------------------------------------------------


def test_f5_sign_mismatch_down_direction_emits_variation():
    """D6 guard (from decision audit): when a finding has direction='down' but
    pct > 0 (positive change, semantically contradicting the direction), the
    classifier emits magnitude=0 so the ladder fires 'variation' rather than
    fabricating a distance from the wrong sign (e.g., 1.5 fold -> abs(0.5) ->
    strong_adverse was the old behavior). Logs a warning.
    """
    bands = _bands(**TP_DOWN_BANDS, entry_ref="LB.TP.down")
    # +50% pct (1.5 fold = INCREASE) on a down-direction band should NOT fire adverse
    payload = _compute_verdict(50, direction="down", bands=bands)
    assert payload["verdict"] == "variation", (
        f"sign-mismatch (+50% on down-entry) must fire variation, got {payload['verdict']}"
    )


def test_f5_none_pct_falls_through_for_fold():
    """When pct cannot be computed (e.g., missing group stats), the classifier
    falls through to the legacy |g| ladder. Confirm that the fold branch
    doesn't raise and produces a coherent coverage state.
    """
    bands = _bands(
        variation_ceiling=1.5,
        concern_floor=2.0,
        adverse_floor=3.0,
        strong_adverse_floor=5.0,
        units="fold",
        entry_ref="LB.ALT.up",
    )
    payload = _compute_verdict(None, direction="up", bands=bands)
    # No pct AND no |g| -> provisional verdict with stat-unavailable coverage
    assert payload["verdict"] == "provisional"
    assert payload["coverage"] == "stat-unavailable"
    assert payload["fallback_used"] is True


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
