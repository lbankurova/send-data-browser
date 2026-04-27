"""F2 multi-timepoint aggregation tests (synthesis F2a).

Run:
    cd backend && C:/pg/pcc/backend/venv/Scripts/python.exe tests/test_noael_aggregation.py

Covers:
- classify_endpoint per F2b
- p3_terminal_primary (BW)
- p2_sustained_consecutive (LB-multi N>=3) including C6 direction-consistency
- m1_tightened_c2b (LB N<=2; LB-single; FW-single; 1-timepoint LB at any N per F-S1)
- cumulative_incidence (CL/DS)
- single_timepoint (MI/MA/OM)
- Dispatcher routing per AC-F2 acceptance criteria
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.analysis_settings import ScoringParams  # noqa: E402
from services.analysis.noael_aggregation import (  # noqa: E402
    aggregate_loael_drivers,
    classify_endpoint,
)


# --- fixtures ------------------------------------------------------------

def _mk_finding(
    *,
    domain: str,
    day_start: int,
    dose_level: int,
    g_lower: float | None = None,
    p_value: float | None = None,
    effect_size: float = 0.0,
    finding_class: str = "tr_adverse",
    trend_p: float | None = None,
    corroboration_status: str | None = None,
    finding: str = "synthetic",
    data_type: str = "continuous",
    direction: str | None = None,
    is_recovery: bool = False,
) -> dict:
    pw = {
        "dose_level": dose_level,
        "g_lower": g_lower,
        "p_value": p_value,
        "p_value_adj": p_value,
        "effect_size": effect_size,
    }
    return {
        "domain": domain,
        "day_start": day_start,
        "pairwise": [pw],
        "finding_class": finding_class,
        "trend_p": trend_p,
        "corroboration_status": corroboration_status,
        "finding": finding,
        "data_type": data_type,
        "direction": direction,
        "is_recovery": is_recovery,
        "endpoint_label": f"{domain}_endpoint",
        "sex": "M",
    }


# --- classify_endpoint ---------------------------------------------------

def test_classify_endpoint_BW():
    f = _mk_finding(domain="BW", day_start=14, dose_level=3, g_lower=0.5)
    assert classify_endpoint(f, n_timepoints_for_endpoint=29) == "BW"


def test_classify_endpoint_LB_multi_vs_single():
    f = _mk_finding(domain="LB", day_start=7, dose_level=3)
    assert classify_endpoint(f, n_timepoints_for_endpoint=2) == "LB-multi"
    assert classify_endpoint(f, n_timepoints_for_endpoint=1) == "LB-single"
    assert classify_endpoint(f, n_timepoints_for_endpoint=4) == "LB-multi"


def test_classify_endpoint_FW_multi_vs_single():
    f = _mk_finding(domain="FW", day_start=7, dose_level=3)
    assert classify_endpoint(f, n_timepoints_for_endpoint=1) == "FW-single"
    assert classify_endpoint(f, n_timepoints_for_endpoint=4) == "FW"


def test_classify_endpoint_incidence_and_terminal():
    for dom, expected in [("CL", "CL"), ("DS", "DS"), ("MI", "MI"), ("MA", "MA"), ("OM", "OM")]:
        f = _mk_finding(domain=dom, day_start=28, dose_level=3)
        assert classify_endpoint(f, n_timepoints_for_endpoint=1) == expected


def test_classify_endpoint_unknown_domain():
    f = _mk_finding(domain="ZZ", day_start=7, dose_level=3)
    assert classify_endpoint(f, n_timepoints_for_endpoint=1) == "OTHER"


# --- p3_terminal_primary -------------------------------------------------

def test_p3_terminal_fires_when_terminal_value_clears_gate():
    """AC-F2-1 essence: BW terminal-primary; per-week supportive only."""
    findings = [
        _mk_finding(domain="BW", day_start=7, dose_level=3, g_lower=0.10, effect_size=-0.2, direction="down"),  # NS
        _mk_finding(domain="BW", day_start=14, dose_level=3, g_lower=0.10, effect_size=-0.2, direction="down"),  # NS
        _mk_finding(domain="BW", day_start=28, dose_level=3, g_lower=0.50, effect_size=-1.0, direction="down"),  # adverse
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="BW", n_per_group=10, params=ScoringParams())
    assert out["policy"] == "p3_terminal_primary"
    assert out["fired"] is True
    assert out["fired_timepoints"] == [28]
    assert out["firing_timepoint_position"] == "terminal"


def test_p3_terminal_does_not_fire_on_per_week_noise_blip():
    """AC-F2-4 essence: single-week noise blip does NOT fire LOAEL via P3."""
    findings = [
        _mk_finding(domain="BW", day_start=7, dose_level=3, g_lower=0.50, effect_size=-1.0, direction="down"),  # adverse mid-study
        _mk_finding(domain="BW", day_start=14, dose_level=3, g_lower=0.10, effect_size=-0.2, direction="down"),
        _mk_finding(domain="BW", day_start=28, dose_level=3, g_lower=0.10, effect_size=-0.2, direction="down"),  # NS at terminal
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="BW", n_per_group=10, params=ScoringParams())
    assert out["fired"] is False, "P3 should ignore per-week blips when terminal does not clear"


def test_p3_excludes_recovery_period_findings():
    findings = [
        _mk_finding(domain="BW", day_start=28, dose_level=3, g_lower=0.50, effect_size=-1.0, direction="down"),  # terminal dosing
        _mk_finding(domain="BW", day_start=42, dose_level=3, g_lower=0.10, effect_size=-0.2, direction="down", is_recovery=True),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="BW", n_per_group=10, params=ScoringParams())
    assert out["fired"] is True
    assert out["fired_timepoints"] == [28], "recovery findings must not be selected as terminal"


# --- p2_sustained_consecutive --------------------------------------------

def test_p2_fires_with_M2_consecutive_adverse_direction():
    """AC-F2-5 essence: sustained 2+ consecutive direction-consistent firing."""
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="LB", day_start=14, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.10, effect_size=0.2, direction="up"),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=10, params=ScoringParams())
    assert out["policy"] == "p2_sustained_consecutive"
    assert out["fired"] is True
    assert out["fired_timepoints"] == [7, 14]


def test_p2_does_not_fire_on_isolated_single_timepoint():
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="LB", day_start=14, dose_level=3, g_lower=0.10, effect_size=0.2, direction="up"),
        _mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.10, effect_size=0.2, direction="up"),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=10, params=ScoringParams())
    assert out["fired"] is False, "isolated single-timepoint hit must not fire P2"


def test_p2_C6_suspends_on_inconsistent_direction_within_run():
    """C6 direction-consistency: a run of firing timepoints that flips direction suspends."""
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="LB", day_start=14, dose_level=3, g_lower=0.50, effect_size=-1.0, direction="down"),
        _mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.10, effect_size=0.2, direction="up"),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=10, params=ScoringParams())
    assert out["fired"] is False
    assert out["suspended"] is True
    assert out["suspended_reason"] == "C6_direction_inconsistent_across_run"


def test_p2_FW_C6_opposes_primary_adverse_suspends():
    """FW primary adverse direction is 'down'; consistent up-direction firing
    triggers C6 suspension via the registry-keyed primary-adverse path
    (peer review finding A6 — the dead BW-branch was removed; FW is the
    production case where primary-adverse is registered)."""
    findings = [
        _mk_finding(domain="FW", day_start=7, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="FW", day_start=14, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
        _mk_finding(domain="FW", day_start=28, dose_level=3, g_lower=0.50, effect_size=1.0, direction="up"),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="FW", n_per_group=10, params=ScoringParams())
    assert out["fired"] is False
    assert out["suspended"] is True
    assert out["suspended_reason"] == "C6_direction_opposes_primary_adverse"


# --- m1_tightened_c2b ----------------------------------------------------

def test_m1_fires_at_terminal_with_tightened_threshold():
    """AC-F2-2 essence: 2-timepoint LB late-onset signal fires under M=1+tightened-C2b."""
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.30, effect_size=0.5, direction="up"),  # below tightened
        _mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.45, effect_size=1.0, direction="up"),  # above tightened
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=4, params=ScoringParams())
    assert out["policy"] == "m1_tightened_c2b"
    assert out["fired"] is True
    assert 28 in out["fired_timepoints"]


def test_m1_fires_at_interim_for_adaptive_resolution():
    """AC-F2-3 essence: 2-timepoint LB adaptive-resolution (interim hit, terminal NS) fires at interim."""
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.50, effect_size=1.2, direction="up"),  # interim adverse
        _mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.10, effect_size=0.2, direction="up"),  # terminal NS
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=4, params=ScoringParams())
    assert out["fired"] is True
    assert 7 in out["fired_timepoints"]


def test_m1_routes_1_timepoint_LB_per_F_S1_correction():
    """F-S1: 1-timepoint LB at any N routes to m1_tightened_c2b (more fragile, not less)."""
    findings = [_mk_finding(domain="LB", day_start=28, dose_level=3, g_lower=0.45, effect_size=1.0, direction="up")]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=4, params=ScoringParams())
    assert out["policy"] == "m1_tightened_c2b"
    assert out["fired"] is True


def test_m1_uses_default_threshold_at_large_N():
    """At n_per_group > 5 the looser default threshold applies (tightening unnecessary)."""
    findings = [
        _mk_finding(domain="LB", day_start=7, dose_level=3, g_lower=0.35, effect_size=0.7, direction="up"),
    ]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="LB-multi", n_per_group=10, params=ScoringParams())
    assert out["fired"] is True, "0.35 > 0.30 default at N=10 should fire"


# --- cumulative_incidence ------------------------------------------------

def test_single_timepoint_incidence_routes_CL_and_DS():
    findings = [
        _mk_finding(domain="CL", day_start=14, dose_level=3, g_lower=0.50, effect_size=1.0, finding_class="tr_adverse", data_type="incidence"),
    ]
    out_cl = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="CL", n_per_group=10, params=ScoringParams())
    assert out_cl["policy"] == "single_timepoint_incidence"
    out_ds = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="DS", n_per_group=10, params=ScoringParams())
    assert out_ds["policy"] == "single_timepoint_incidence"


# --- single_timepoint ----------------------------------------------------

def test_single_timepoint_routes_MI_MA_OM():
    findings = [_mk_finding(domain="MI", day_start=28, dose_level=3, g_lower=0.50, effect_size=1.0)]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="MI", n_per_group=10, params=ScoringParams())
    assert out["policy"] == "single_timepoint"


def test_single_timepoint_unknown_endpoint_class_falls_back():
    findings = [_mk_finding(domain="ZZ", day_start=28, dose_level=3, g_lower=0.50, effect_size=1.0)]
    out = aggregate_loael_drivers(findings, dose_level=3, endpoint_class="OTHER", n_per_group=10, params=ScoringParams())
    assert out["policy"] == "single_timepoint", "unknown endpoint class must default to single_timepoint"


# --- Empty findings ------------------------------------------------------

def test_empty_findings_returns_not_fired():
    out = aggregate_loael_drivers([], dose_level=3, endpoint_class="BW", n_per_group=10, params=ScoringParams())
    assert out["fired"] is False
    assert out["policy"] == "p3_terminal_primary"
    assert out["firing_timepoint_position"] == "n/a"


# --- harness --------------------------------------------------------------

def main() -> int:
    tests = [
        test_classify_endpoint_BW,
        test_classify_endpoint_LB_multi_vs_single,
        test_classify_endpoint_FW_multi_vs_single,
        test_classify_endpoint_incidence_and_terminal,
        test_classify_endpoint_unknown_domain,
        test_p3_terminal_fires_when_terminal_value_clears_gate,
        test_p3_terminal_does_not_fire_on_per_week_noise_blip,
        test_p3_excludes_recovery_period_findings,
        test_p2_fires_with_M2_consecutive_adverse_direction,
        test_p2_does_not_fire_on_isolated_single_timepoint,
        test_p2_C6_suspends_on_inconsistent_direction_within_run,
        test_p2_FW_C6_opposes_primary_adverse_suspends,
        test_m1_fires_at_terminal_with_tightened_threshold,
        test_m1_fires_at_interim_for_adaptive_resolution,
        test_m1_routes_1_timepoint_LB_per_F_S1_correction,
        test_m1_uses_default_threshold_at_large_N,
        test_single_timepoint_incidence_routes_CL_and_DS,
        test_single_timepoint_routes_MI_MA_OM,
        test_single_timepoint_unknown_endpoint_class_falls_back,
        test_empty_findings_returns_not_fired,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {t.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
