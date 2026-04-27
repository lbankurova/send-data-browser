"""Per-endpoint multi-timepoint LOAEL aggregation policies (F2).

Five policies dispatched by endpoint class:

============================  ============================================
Policy                        Endpoint classes
============================  ============================================
p3_terminal_primary           BW (OECD TG 408 Sec 31 mandatory)
p2_sustained_consecutive      LB-multi, FW with N_timepoints >= 3
m1_tightened_c2b              LB-multi, FW with N_timepoints <= 2;
                              LB-single; FW-single; 1-timepoint LB at any N
                              (per F-S1 dispatch correction)
cumulative_incidence          CL, DS
single_timepoint              MI, MA, OM (terminal sacrifice;
                              tightened-C2b at small N)
============================  ============================================

Aggregation operates on a single (endpoint_label, sex) group and returns a
per-dose-level LOAEL decision: ``{fired, policy, fired_timepoints,
suspended, suspended_reason, firing_timepoint_position}`` per AC-F1-10
``endpoint_loael_aggregated`` shape.

C6 (direction-consistency across timepoints) lives in
``p2_sustained_consecutive`` only — at N_timepoints <= 2 C6 is degenerate
and m1_tightened_c2b applies a tighter effect threshold instead, per
synthesis F1c suspension cases.

This module is pure-functional (no side effects on inputs; idempotent).
F2c wiring into ``view_dataframes.py::_build_noael_for_groups`` is a
separate slice; until then this module has no production consumers.

Trace: synthesis F2 (NOAEL-ALG-synthesis.md §F2 — Multi-timepoint
aggregation) and F1c (C6 direction-consistency).
"""

from __future__ import annotations

from typing import Any

from services.analysis.analysis_settings import ScoringParams
from services.analysis.endpoint_adverse_direction import (
    is_direction_canonical_adverse,
    primary_adverse_direction,
)


# --- public dispatch -----------------------------------------------------

def aggregate_loael_drivers(
    findings: list[dict],
    dose_level: int,
    endpoint_class: str,
    n_per_group: int,
    params: ScoringParams,
) -> dict[str, Any]:
    """Per-(endpoint_label, sex, dose_level) LOAEL aggregation decision.

    `findings` is a list of unified-findings rows sharing an endpoint_label
    and sex; each row corresponds to a different timepoint (day_start). The
    function returns the aggregated decision shape consumed by F1a's
    ``endpoint_loael_summary`` emission.
    """
    n_timepoints = len(findings)
    if endpoint_class == "BW":
        return _wrap("p3_terminal_primary", _p3_terminal_primary(findings, dose_level, n_per_group, params))
    if endpoint_class in ("LB-multi", "FW") and n_timepoints >= 3:
        return _wrap("p2_sustained_consecutive", _p2_sustained_consecutive(findings, dose_level, n_per_group, params, M=params.sustained_M))
    if endpoint_class in ("LB-multi", "FW") and n_timepoints == 2:
        return _wrap("m1_tightened_c2b", _m1_tightened_c2b(findings, dose_level, n_per_group, params))
    # F-S1 dispatch correction: 1-timepoint LB at any N is MORE fragile, not
    # less; route to m1_tightened_c2b regardless of timepoint count.
    if endpoint_class in ("LB-single", "FW-single") or (
        endpoint_class in ("LB-multi", "FW") and n_timepoints == 1
    ):
        return _wrap("m1_tightened_c2b", _m1_tightened_c2b(findings, dose_level, n_per_group, params))
    if endpoint_class in ("CL", "DS"):
        return _wrap("single_timepoint_incidence", _single_timepoint_incidence(findings, dose_level, n_per_group, params))
    if endpoint_class in ("MI", "MA", "OM"):
        return _wrap("single_timepoint", _single_timepoint(findings, dose_level, n_per_group, params))
    # Safe default: single_timepoint with tightened-at-small-N
    return _wrap("single_timepoint", _single_timepoint(findings, dose_level, n_per_group, params))


def classify_endpoint(finding: dict, n_timepoints_for_endpoint: int) -> str:
    """Classify a finding's endpoint into one of the F2b classes.

    Per F2b: classification is per-(endpoint_label, study, sex) using
    max(timepoints) for the triple. The caller pre-computes
    ``n_timepoints_for_endpoint`` from the grouping context.
    """
    domain = (finding.get("domain") or "").upper()
    # BWGAIN (domain=BG) is regulatorily co-evaluated with BW per OECD TG 408
    # §22 — route to BW class so P3 terminal-primary applies. Peer review
    # finding A8 (NOAEL-ALG-path-c-backend-review.md).
    if domain in ("BW", "BG"):
        return "BW"
    if domain == "FW":
        return "FW-single" if n_timepoints_for_endpoint == 1 else "FW"
    if domain == "LB":
        return "LB-single" if n_timepoints_for_endpoint == 1 else "LB-multi"
    if domain == "CL":
        return "CL"
    if domain == "DS":
        return "DS"
    if domain == "MI":
        return "MI"
    if domain == "MA":
        return "MA"
    if domain == "OM":
        return "OM"
    # Unknown domain — safe default routes to single_timepoint with
    # tightened-at-small-N
    return "OTHER"


# --- policy implementations ----------------------------------------------

def _p3_terminal_primary(
    findings: list[dict],
    dose_level: int,
    n_per_group: int,
    params: ScoringParams,
) -> dict[str, Any]:
    """OECD TG 408 §31 BW: terminal value drives LOAEL; per-week supportive only.

    Selects the latest dosing-period finding (max ``day_start`` excluding any
    rows flagged ``is_recovery=True``) and applies the standard WoE gate.
    """
    from generator.view_dataframes import _is_loael_driving_woe

    dosing = [f for f in findings if not f.get("is_recovery")]
    if not dosing:
        return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}
    terminal = max(dosing, key=lambda f: _safe_day_start(f))
    if _is_loael_driving_woe(terminal, dose_level, n_per_group, params.effect_relevance_threshold):
        return {
            "fired": True,
            "fired_timepoints": [_safe_day_start(terminal)],
            "suspended": False,
            "suspended_reason": None,
            "firing_timepoint_position": "terminal",
        }
    return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}


def _p2_sustained_consecutive(
    findings: list[dict],
    dose_level: int,
    n_per_group: int,
    params: ScoringParams,
    *,
    M: int = 2,
) -> dict[str, Any]:
    """LB-multi / FW with N_timepoints >= 3: M consecutive firing timepoints.

    Applies C6 direction-consistency: the M consecutive firing timepoints
    must all share an effect direction matching the endpoint's primary
    adverse direction. C6 SUSPENSION cases (degenerate or hormetic) are
    handled at the dispatcher boundary; this policy enforces consistency.
    """
    from generator.view_dataframes import _is_loael_driving_woe

    sorted_findings = sorted(findings, key=_safe_day_start)
    fired_flags = [
        _is_loael_driving_woe(f, dose_level, n_per_group, params.effect_relevance_threshold)
        for f in sorted_findings
    ]
    fired_timepoints: list[int] = []
    run_start: int | None = None
    longest_run: list[int] = []
    for i, fired in enumerate(fired_flags):
        if fired:
            if run_start is None:
                run_start = i
            run_length = i - run_start + 1
            if run_length >= M:
                fired_timepoints = [_safe_day_start(sorted_findings[j]) for j in range(run_start, i + 1)]
                if len(fired_timepoints) > len(longest_run):
                    longest_run = fired_timepoints
        else:
            run_start = None
    if not longest_run:
        return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}

    # C6 direction-consistency: all firing timepoints in the run must agree
    # on direction. Peer review finding A6 noted the BW-domain branch here
    # is unreachable in production (BW dispatches to P3, never P2), so the
    # explicit BW path was removed; per-analyte direction-consistency is
    # checked against the observed direction of the first firing timepoint.
    # When the FW or LB endpoint registry has a primary_adverse_direction
    # configured, the registry value supersedes "first firing wins" — only
    # firings in the primary adverse direction count toward consistency.
    domain_upper = (sorted_findings[0].get("domain") or "").upper()
    primary = primary_adverse_direction("FW") if domain_upper == "FW" else None
    if primary in ("up", "down"):
        for j, fired in enumerate(fired_flags):
            if not fired:
                continue
            obs = _firing_direction(sorted_findings[j], dose_level)
            if obs not in (None, primary):
                return {
                    "fired": False,
                    "fired_timepoints": [],
                    "suspended": True,
                    "suspended_reason": "C6_direction_opposes_primary_adverse",
                    "firing_timepoint_position": "n/a",
                }
    else:
        run_directions = [
            _firing_direction(sorted_findings[j], dose_level)
            for j in range(len(sorted_findings))
            if fired_flags[j]
        ]
        run_directions = [d for d in run_directions if d in ("up", "down")]
        if len(set(run_directions)) > 1:
            return {
                "fired": False,
                "fired_timepoints": [],
                "suspended": True,
                "suspended_reason": "C6_direction_inconsistent_across_run",
                "firing_timepoint_position": "n/a",
            }
    position = _firing_position(longest_run, sorted_findings)
    return {
        "fired": True,
        "fired_timepoints": longest_run,
        "suspended": False,
        "suspended_reason": None,
        "firing_timepoint_position": position,
    }


def _m1_tightened_c2b(
    findings: list[dict],
    dose_level: int,
    n_per_group: int,
    params: ScoringParams,
) -> dict[str, Any]:
    """N_timepoints <= 2 (or single): any timepoint fires under TIGHTENED threshold.

    Compensates for low temporal corroboration with a higher effect
    threshold. C6 is NOT enforced (degenerate at N <= 2 per F1c).
    """
    from generator.view_dataframes import _is_loael_driving_woe

    threshold = params.c2b_tightened_threshold_smallN if n_per_group <= 5 else params.effect_relevance_threshold
    fired_timepoints: list[int] = []
    sorted_findings = sorted(findings, key=_safe_day_start)
    for f in sorted_findings:
        if _is_loael_driving_woe(f, dose_level, n_per_group, threshold):
            fired_timepoints.append(_safe_day_start(f))
    if not fired_timepoints:
        return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}
    position = _firing_position(fired_timepoints, sorted_findings)
    return {
        "fired": True,
        "fired_timepoints": fired_timepoints,
        "suspended": False,
        "suspended_reason": None,
        "firing_timepoint_position": position,
    }


def _single_timepoint_incidence(
    findings: list[dict],
    dose_level: int,
    n_per_group: int,
    params: ScoringParams,
) -> dict[str, Any]:
    """CL / DS: any timepoint's incidence finding above the WoE gate fires.

    The synthesis F2a calls for cumulative-across-timepoints aggregation
    (sum incidences with denominator handling). Peer review (Finding A7,
    NOAEL-ALG-path-c-backend-review.md) noted the original implementation
    was named ``cumulative_incidence`` but functionally identical to
    ``single_timepoint`` — the policy was renamed to match behavior.
    AC-F2-6 (vomitus 0/3, 1/3, 2/4 firing at HD) clears via per-finding
    WoE C5 high-incidence gate, not via cross-timepoint accumulation.
    True cumulative aggregation (sum num/denom across timepoints, then
    apply WoE) is deferred to a follow-on slice with its own AC.
    """
    from generator.view_dataframes import _is_loael_driving_woe

    fired_timepoints: list[int] = []
    sorted_findings = sorted(findings, key=_safe_day_start)
    for f in sorted_findings:
        if _is_loael_driving_woe(f, dose_level, n_per_group, params.effect_relevance_threshold):
            fired_timepoints.append(_safe_day_start(f))
    if not fired_timepoints:
        return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}
    return {
        "fired": True,
        "fired_timepoints": fired_timepoints,
        "suspended": False,
        "suspended_reason": None,
        "firing_timepoint_position": _firing_position(fired_timepoints, sorted_findings),
    }


def _single_timepoint(
    findings: list[dict],
    dose_level: int,
    n_per_group: int,
    params: ScoringParams,
) -> dict[str, Any]:
    """MI / MA / OM (terminal sacrifice) and unknown-domain default.

    Applies tightened C2b at small N; otherwise the default WoE threshold.
    """
    from generator.view_dataframes import _is_loael_driving_woe

    threshold = params.c2b_tightened_threshold_smallN if n_per_group <= 5 else params.effect_relevance_threshold
    fired_timepoints: list[int] = []
    sorted_findings = sorted(findings, key=_safe_day_start)
    for f in sorted_findings:
        if _is_loael_driving_woe(f, dose_level, n_per_group, threshold):
            fired_timepoints.append(_safe_day_start(f))
    if not fired_timepoints:
        return {"fired": False, "fired_timepoints": [], "suspended": False, "suspended_reason": None, "firing_timepoint_position": "n/a"}
    return {
        "fired": True,
        "fired_timepoints": fired_timepoints,
        "suspended": False,
        "suspended_reason": None,
        "firing_timepoint_position": _firing_position(fired_timepoints, sorted_findings),
    }


# --- helpers -------------------------------------------------------------

def _wrap(policy: str, decision: dict[str, Any]) -> dict[str, Any]:
    out = {"policy": policy}
    out.update(decision)
    return out


def _safe_day_start(finding: dict) -> int:
    val = finding.get("day_start")
    if val is None:
        val = finding.get("--DY")
    try:
        return int(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0


def _firing_direction(finding: dict, dose_level: int) -> str | None:
    """Effect direction for the pairwise at *dose_level* (sign of effect_size)."""
    pw = next((p for p in finding.get("pairwise", []) if p.get("dose_level") == dose_level), None)
    if not pw:
        return finding.get("direction")
    eff = pw.get("effect_size")
    if eff is None:
        return finding.get("direction")
    if eff > 0:
        return "up"
    if eff < 0:
        return "down"
    return None


def _firing_position(fired_timepoints: list[int], sorted_findings: list[dict]) -> str:
    if not fired_timepoints:
        return "n/a"
    days = [_safe_day_start(f) for f in sorted_findings]
    if not days:
        return "n/a"
    terminal_day = max(days)
    interim_days = [d for d in days if d < terminal_day]
    fired_set = set(fired_timepoints)
    fires_at_terminal = terminal_day in fired_set
    fires_at_interim = bool(interim_days) and any(d in fired_set for d in interim_days)
    if fires_at_terminal and fires_at_interim:
        return "both"
    if fires_at_terminal:
        return "terminal"
    if fires_at_interim:
        return "interim"
    return "n/a"


# Re-export the canonical-adverse helper so callers needing direction
# context for non-aggregation purposes do not need to import from two
# modules.
__all__ = [
    "aggregate_loael_drivers",
    "classify_endpoint",
    "is_direction_canonical_adverse",
]
