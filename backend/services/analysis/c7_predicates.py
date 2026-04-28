"""C7 named-predicate registry for direction_exception evaluation.

Resolves the opaque-string keys in
``shared/rules/endpoint-adverse-direction.json::direction_exceptions.all_of``
to concrete predicate evaluators against a finding-bundle context. Used by
``c7_corroboration.evaluate_c7_corroboration`` to test whether a registered
direction-exception (e.g., ``palatability_rebound``) suppresses LOAEL-driving
for a finding that would otherwise fire C1-C5.

DATA-GAP-NOAEL-ALG-02 A3/A4 adjudication (2026-04-28):

- ``FW_down_at_early_timepoint``: "early" = first 2 scheduled FW collection
  days for the sex AND day <= 14 calendar days. Schedule-relative + absolute
  cap, both conditions required (handles studies with sparse early
  collection where collection day 2 is at week 4+).
- A4 reframe: predicate-positive does NOT change ``finding_class``. Caller
  emits ``c7_suppression_reason`` audit-trail field; the finding's adversity
  classification is unchanged.

Conservative defaults: when data is missing or cannot be evaluated
affirmatively, predicates return False. The all_of conjunction therefore
only suppresses when EVERY listed condition is positively confirmed.

Public API:

- :func:`evaluate_predicate` -- look up by name, evaluate against context.
- :func:`evaluate_all_of` -- evaluate a list of predicates with AND
  semantics (all must return True for the exception to fire).
- :func:`known_predicates` -- registered predicate names; used by
  ``c7_corroboration`` to detect unknown predicate references in registry
  data and fail-safe (treat unknown as False).

Trace: synthesis F1d/F1e (NOAEL-ALG-synthesis.md), DATA-GAP-NOAEL-ALG-02
coverage audit at ``research/data-gap-noael-alg-02-coverage-audit.md``.
"""

from __future__ import annotations

from typing import Callable

from services.analysis.endpoint_adverse_direction import lookup_endpoint_class


# --- helpers -------------------------------------------------------------


def _record_day(record: dict) -> int | None:
    """Extract day from finding OR pairwise dict, production-first fallback.

    Mirrors ``noael_aggregation._safe_day_start`` semantics (BUG-032 fix
    2026-04-28 -- the production field is ``day``; ``day_start`` is FW
    synthetic; ``--DY`` is raw SEND passthrough). Returns None when no
    field is populated, so callers can distinguish "missing" from day=0.
    """
    val = record.get("day")
    if val is None:
        val = record.get("day_start")
    if val is None:
        val = record.get("--DY")
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _endpoint_class_of(finding: dict) -> str | None:
    """Resolve the endpoint class for a finding via label + SEND domain."""
    return lookup_endpoint_class(
        finding.get("endpoint_label"),
        send_domain=finding.get("domain"),
    )


def _findings_in_class(sex_findings: list[dict], target_class: str) -> list[dict]:
    """Filter sex-filtered findings to those whose endpoint class matches."""
    return [f for f in sex_findings if _endpoint_class_of(f) == target_class]


def _pairwise_at(finding: dict, dose_level: int) -> dict | None:
    """Return the pairwise dict at dose_level, or None when absent."""
    for pw in finding.get("pairwise", []):
        if pw.get("dose_level") == dose_level:
            return pw
    return None


def _early_fw_days_for_sex(sex_findings: list[dict]) -> set[int]:
    """A3 adjudication: 'early' = first 2 scheduled FW collection days
    for the sex AND <= 14 calendar days.

    Each FW finding represents one timepoint (one day) for the sex. Sort
    distinct days; take the first 2; intersect with day <= 14.
    """
    fw_days = sorted({
        d for d in (_record_day(f) for f in _findings_in_class(sex_findings, "FW"))
        if d is not None
    })
    candidates = fw_days[:2]
    return {d for d in candidates if d <= 14}


# --- predicates ----------------------------------------------------------


def _fw_down_at_early_timepoint(
    finding: dict, dose_level: int, sex_findings: list[dict],
) -> bool:
    """True when *finding* is FW AND its day is in the early window AND its
    pairwise at *dose_level* has down direction (effect_size < 0).

    Conservative on missing data: returns False if class is not FW, day
    can't be extracted, or no pairwise exists at the dose level.
    """
    if _endpoint_class_of(finding) != "FW":
        return False
    day = _record_day(finding)
    if day is None:
        return False
    if day not in _early_fw_days_for_sex(sex_findings):
        return False
    pw = _pairwise_at(finding, dose_level)
    if not pw:
        return False
    effect = pw.get("effect_size")
    return effect is not None and effect < 0


def _fw_recovers_to_baseline_or_above_at_later_timepoint(
    finding: dict, dose_level: int, sex_findings: list[dict],
) -> bool:
    """True when at least one OTHER FW finding for the same sex at a later
    day shows non-down recovery at *dose_level*: effect_size >= 0 OR
    p_value not significant (>= 0.05).

    "Later" = strictly greater day than *finding*'s day. Conservative: if
    no later FW finding exists OR none has interpretable pairwise data,
    returns False (cannot confirm recovery -- don't suppress).
    """
    if _endpoint_class_of(finding) != "FW":
        return False
    current_day = _record_day(finding)
    if current_day is None:
        return False
    fw_findings = _findings_in_class(sex_findings, "FW")
    for f in fw_findings:
        d = _record_day(f)
        if d is None or d <= current_day:
            continue
        pw = _pairwise_at(f, dose_level)
        if not pw:
            continue
        effect = pw.get("effect_size")
        p = pw.get("p_value_adj") or pw.get("p_value")
        recovered_by_effect = effect is not None and effect >= 0
        recovered_by_significance = p is not None and p >= 0.05
        if recovered_by_effect or recovered_by_significance:
            return True
    return False


def _no_concurrent_bw_down_at_terminal(
    finding: dict, dose_level: int, sex_findings: list[dict],
) -> bool:
    """True when the terminal BW finding for the same sex shows no
    significant down at *dose_level* (effect_size >= 0 OR p >= 0.05),
    OR when no BW finding exists at all (no contradicting evidence).

    "Terminal" = the BW finding with the largest day. Conservative: if
    BW exists at terminal AND shows significant down, returns False
    (concurrent toxicity present -- not palatability).
    """
    bw_findings = _findings_in_class(sex_findings, "BW")
    if not bw_findings:
        return True  # no BW evidence to contradict
    days_with_findings = [
        (d, f) for f in bw_findings if (d := _record_day(f)) is not None
    ]
    if not days_with_findings:
        return True  # BW present but no day metadata -- can't establish concurrence
    _, terminal_bw = max(days_with_findings, key=lambda item: item[0])
    pw = _pairwise_at(terminal_bw, dose_level)
    if not pw:
        return True  # no pairwise at this dose -- no concurrent down
    effect = pw.get("effect_size")
    p = pw.get("p_value_adj") or pw.get("p_value")
    if effect is None:
        return True
    if effect >= 0:
        return True
    if p is not None and p >= 0.05:
        return True
    return False


_GI_CL_KEYWORDS = (
    "emesis", "vomit", "diarrhea", "diarrhoea", "loose stool", "loose feces",
    "soft stool", "soft feces", "salivation", "regurgitation",
)


def _no_corroborating_cl_signs_gi_emesis_diarrhea(
    finding: dict, dose_level: int, sex_findings: list[dict],
) -> bool:
    """True when no CL finding at the same sex with a GI/emesis/diarrhea
    keyword has nonzero incidence at *dose_level*.

    Conservative: if a matching CL finding exists with incidence > 0 at
    the dose, returns False (corroborating GI signs present -- the
    FW-down is consistent with active GI toxicity, not palatability).
    """
    cl_findings = _findings_in_class(sex_findings, "CL_incidence")
    for f in cl_findings:
        label = ((f.get("finding") or "") + " " + (f.get("finding_term") or "")).lower()
        if not any(kw in label for kw in _GI_CL_KEYWORDS):
            continue
        for gs in f.get("group_stats", []):
            if gs.get("dose_level") != dose_level:
                continue
            incidence = gs.get("incidence")
            if incidence is not None and incidence > 0:
                return False
    return True


# --- registry ------------------------------------------------------------


_PREDICATES: dict[str, Callable[[dict, int, list[dict]], bool]] = {
    "FW_down_at_early_timepoint": _fw_down_at_early_timepoint,
    "FW_recovers_to_baseline_or_above_at_later_timepoint":
        _fw_recovers_to_baseline_or_above_at_later_timepoint,
    "no_concurrent_BW_down_at_terminal": _no_concurrent_bw_down_at_terminal,
    "no_corroborating_CL_signs_GI_emesis_diarrhea":
        _no_corroborating_cl_signs_gi_emesis_diarrhea,
}


def known_predicates() -> set[str]:
    """Set of registered predicate names. Caller uses this to detect
    unknown predicate references in registry data (treat unknown as
    False per fail-safe convention).
    """
    return set(_PREDICATES.keys())


def evaluate_predicate(
    name: str,
    finding: dict,
    dose_level: int,
    sex_findings: list[dict],
) -> bool:
    """Evaluate a single named predicate. Unknown name returns False
    (fail-safe -- never suppresses on a typo or unimplemented predicate).
    """
    fn = _PREDICATES.get(name)
    if fn is None:
        return False
    return fn(finding, dose_level, sex_findings)


def evaluate_all_of(
    predicate_names: list[str],
    finding: dict,
    dose_level: int,
    sex_findings: list[dict],
) -> bool:
    """Evaluate predicates with AND semantics. Returns True only when
    every named predicate returns True. Empty list returns False (an
    exception with no predicates cannot fire).
    """
    if not predicate_names:
        return False
    return all(
        evaluate_predicate(name, finding, dose_level, sex_findings)
        for name in predicate_names
    )
