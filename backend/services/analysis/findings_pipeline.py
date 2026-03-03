"""Shared enrichment pipeline for findings — used by both generator and live API.

Extracts the common enrichment logic that was duplicated between
``generator.domain_stats.compute_all_findings()`` and
``services.analysis.unified_findings.compute_adverse_effects()``.

Both callers collect raw findings from domain modules (Pass 1), optionally
build scheduled-only (Pass 2) and separate/main-only (Pass 3) maps, then
hand everything to ``process_findings()`` for merging and enrichment.

Caller-specific enrichment (ANOVA/Dunnett/JT in the generator, ID generation
in the live API) happens before or after ``process_findings()``.
"""

import logging

from services.analysis.classification import (
    classify_severity,
    classify_dose_response,
    determine_treatment_related,
    compute_max_fold_change,
    assess_finding_with_context,
)
from services.analysis.corroboration import compute_corroboration, compute_chain_detection
from services.analysis.confidence import compute_all_confidence
from generator.organ_map import get_organ_system
from services.analysis.phase_filter import IN_LIFE_DOMAINS

log = logging.getLogger(__name__)

TERMINAL_DOMAINS = {"MI", "MA", "OM", "TF", "DS"}
LB_DOMAIN = "LB"
SCHEDULED_DOMAINS = TERMINAL_DOMAINS | {LB_DOMAIN}


# ---------------------------------------------------------------------------
# Key / map utilities
# ---------------------------------------------------------------------------

def finding_key(f: dict) -> tuple:
    """Unique merge key for a finding across pass variants.

    Terminal domains (MI, MA, OM, TF, DS) include specimen because they
    share test_code across organs (e.g. all OM endpoints have test_code="WEIGHT").
    """
    base = (f["domain"], f.get("test_code"), f["sex"], f.get("day"))
    if f["domain"] in TERMINAL_DOMAINS:
        return base + (f.get("specimen"),)
    return base


def build_findings_map(
    findings: list[dict],
    label: str = "",
) -> dict[tuple, dict]:
    """Build key -> finding lookup with collision detection.

    Args:
        findings: List of finding dicts from a domain compute function.
        label: Human-readable label for collision warnings
               (e.g. "scheduled", "separate").

    Returns:
        Dict mapping finding_key -> finding dict. Last-write-wins on collision.
    """
    result: dict[tuple, dict] = {}
    collisions: list[tuple] = []
    for f in findings:
        key = finding_key(f)
        if key in result:
            collisions.append(key)
        result[key] = f
    if collisions:
        log.warning(
            "%s: %d key collision(s). First: %s",
            label or "build_findings_map",
            len(collisions),
            collisions[0],
        )
    return result


# ---------------------------------------------------------------------------
# Per-finding enrichment
# ---------------------------------------------------------------------------

def _with_defaults(f: dict) -> dict:
    """Set safe defaults for all enriched fields.

    Called before enrichment so that if ``_enrich_finding`` raises per-finding,
    the finding is still structurally valid (severity="normal", etc.).
    """
    f.setdefault("severity", "normal")
    f.setdefault("dose_response_pattern", "insufficient_data")
    f.setdefault("pattern_confidence", None)
    f.setdefault("onset_dose_level", None)
    f.setdefault("treatment_related", False)
    f.setdefault("finding_class", "not_treatment_related")
    f.setdefault("max_fold_change", None)
    f.setdefault("max_incidence", None)
    f.setdefault("organ_system", "general")
    f.setdefault("endpoint_label", f.get("test_name", f.get("test_code", "")))
    return f


def _enrich_finding(f: dict, threshold: str = "grade-ge-2-or-dose-dep") -> dict:
    """Core enrichment: classification, fold change, incidence, organ system, label.

    Pipeline-style: finding in -> enriched finding out.
    Shared between generator (domain_stats) and live API (unified_findings).
    """
    # Classification
    f["severity"] = classify_severity(f, threshold=threshold)
    dr_result = classify_dose_response(
        f.get("group_stats", []),
        f.get("data_type", "continuous"),
    )
    f["dose_response_pattern"] = dr_result["pattern"]
    f["pattern_confidence"] = dr_result.get("confidence")
    f["onset_dose_level"] = dr_result.get("onset_dose_level")
    f["treatment_related"] = determine_treatment_related(f)

    # Fold change (continuous endpoints only) — direction-aligned
    if f.get("data_type") == "continuous":
        f["max_fold_change"] = compute_max_fold_change(
            f.get("group_stats", []),
            direction=f.get("direction"),
        )
    else:
        f["max_fold_change"] = None

    # Max incidence across treated dose groups (incidence endpoints only)
    if f.get("data_type") == "incidence":
        treated_gs = [
            gs for gs in f.get("group_stats", [])
            if gs.get("dose_level", 0) > 0
        ]
        incidences = [
            gs["incidence"] for gs in treated_gs
            if gs.get("incidence") is not None
        ]
        f["max_incidence"] = round(max(incidences), 4) if incidences else None
    else:
        f["max_incidence"] = None

    # Organ system
    f["organ_system"] = get_organ_system(
        f.get("specimen"),
        f.get("test_code"),
        f.get("domain"),
    )

    # Endpoint label
    test_name = f.get("test_name", f.get("test_code", ""))
    specimen = f.get("specimen")
    if specimen and f.get("domain") in ("MI", "MA", "CL", "OM", "TF"):
        f["endpoint_label"] = f"{specimen} \u2014 {test_name}"
    else:
        f["endpoint_label"] = test_name

    return f


def enrich_findings(
    findings: list[dict],
    threshold: str = "grade-ge-2-or-dose-dep",
) -> list[dict]:
    """Enrich all findings with safe per-finding error handling.

    Each finding gets safe defaults via ``_with_defaults()`` before enrichment.
    If ``_enrich_finding()`` raises for a specific finding, that finding keeps
    its defaults and gets an ``_enrichment_error`` field — structurally valid
    but flagged.
    """
    result = []
    for f in findings:
        f = _with_defaults(f)
        try:
            f = _enrich_finding(f, threshold=threshold)
        except Exception as e:
            f["_enrichment_error"] = str(e)
            log.warning("Enrichment failed for %s: %s", finding_key(f), e)
        result.append(f)
    return result


# ---------------------------------------------------------------------------
# Pass merging
# ---------------------------------------------------------------------------

def attach_scheduled_stats(
    findings: list[dict],
    scheduled_map: dict[tuple, dict],
    n_excluded: int,
) -> list[dict]:
    """Merge Pass 2 (scheduled-only, early-death-excluded) stats into base findings.

    Only terminal domains (MI, MA, OM, TF, DS) and LB are eligible. If a finding
    exists in Pass 1 but not Pass 2 (all subjects were early deaths), empty arrays
    are attached so consumers know "no data under scheduled-only".
    """
    for f in findings:
        if f["domain"] not in SCHEDULED_DOMAINS:
            continue
        key = finding_key(f)
        sched = scheduled_map.get(key)
        if sched:
            f["scheduled_group_stats"] = sched["group_stats"]
            f["scheduled_pairwise"] = sched["pairwise"]
            f["scheduled_direction"] = sched.get("direction")
            f["n_excluded"] = n_excluded
        else:
            f["scheduled_group_stats"] = []
            f["scheduled_pairwise"] = []
            f["scheduled_direction"] = None
            f["n_excluded"] = n_excluded
    return findings


def attach_separate_stats(
    findings: list[dict],
    separate_map: dict[tuple, dict],
) -> list[dict]:
    """Merge Pass 3 (main-only, recovery-excluded) stats into in-life findings.

    Only in-life domains (BW, LB, CL, etc.) are eligible. Used when the frontend
    recovery pooling toggle is set to "separate".
    """
    for f in findings:
        if f["domain"] not in IN_LIFE_DOMAINS:
            continue
        key = finding_key(f)
        sep = separate_map.get(key)
        if sep:
            f["separate_group_stats"] = sep["group_stats"]
            f["separate_pairwise"] = sep["pairwise"]
            f["separate_direction"] = sep.get("direction")
            f["separate_min_p_adj"] = sep.get("min_p_adj")
            f["separate_max_effect_size"] = sep.get("max_effect_size")
            f["separate_trend_p"] = sep.get("trend_p")
        else:
            f["separate_group_stats"] = []
            f["separate_pairwise"] = []
            f["separate_direction"] = None
            f["separate_min_p_adj"] = None
            f["separate_max_effect_size"] = None
            f["separate_trend_p"] = None
    return findings


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def process_findings(
    base_findings: list[dict],
    scheduled_map: dict[tuple, dict] | None = None,
    separate_map: dict[tuple, dict] | None = None,
    n_excluded: int = 0,
    species: str | None = None,
    strain: str | None = None,
    duration_days: int | None = None,
    route: str | None = None,
    vehicle: str | None = None,
) -> list[dict]:
    """Shared enrichment pipeline: merge pass variants, then classify.

    Order:
      1. Merge scheduled-only stats (Pass 2) if provided
      2. Merge separate/main-only stats (Pass 3) if provided
      3. Enrich all findings (classification, fold change, labels, etc.)

    Callers are responsible for collecting base_findings (Pass 1) and building
    scheduled_map / separate_map via ``build_findings_map()``. This function
    handles only the shared enrichment — caller-specific enrichment (e.g.
    ANOVA/Dunnett/JT in the generator, ID generation in the live API) happens
    before or after this call.

    Args:
        species: Study species (from TS domain) for organ-specific thresholds.
        strain: Study strain (from TS domain) for HCD matching.
        duration_days: Study dosing duration in days (from TS DOSDUR) for HCD matching.
        route: Route of administration (from TS domain) for HCD matching.
        vehicle: Treatment vehicle (from TS domain) for HCD matching.
    """
    if scheduled_map is not None:
        base_findings = attach_scheduled_stats(
            base_findings, scheduled_map, n_excluded,
        )
    if separate_map is not None:
        base_findings = attach_separate_stats(base_findings, separate_map)
    enriched = enrich_findings(base_findings)
    # Cross-domain corroboration (requires all enriched findings present)
    enriched = compute_corroboration(enriched)
    # Cross-organ chain detection (requires all enriched findings present)
    enriched = compute_chain_detection(enriched)
    # ECETOC per-finding adversity assessment (requires corroboration_status)
    enriched = _assess_all_findings(
        enriched, species=species, strain=strain, duration_days=duration_days,
        route=route, vehicle=vehicle,
    )
    # GRADE-style confidence scoring (requires finding_class, _hcd_assessment, corroboration_status)
    enriched = compute_all_confidence(enriched)
    return enriched


def _assess_all_findings(
    findings: list[dict],
    species: str | None = None,
    strain: str | None = None,
    duration_days: int | None = None,
    route: str | None = None,
    vehicle: str | None = None,
) -> list[dict]:
    """Run ECETOC per-finding adversity assessment on all findings.

    Must be called AFTER ``compute_corroboration()`` since the assessment
    uses ``corroboration_status`` as an input (A-2 concordance factor and
    B-2 moderate-magnitude escalation).

    Tier 2: builds ConcurrentFindingIndex for cross-finding lookups and
    uses assess_finding_with_context() for organ-specific thresholds and
    adaptive decision trees.
    Tier 3A: passes strain + duration for A-3 HCD assessment.
    """
    from services.analysis.concurrent_findings import ConcurrentFindingIndex
    index = ConcurrentFindingIndex(findings)
    for f in findings:
        try:
            f["finding_class"] = assess_finding_with_context(
                f, index, species=species, strain=strain, duration_days=duration_days,
                route=route, vehicle=vehicle,
            )
        except Exception as e:
            log.warning("assess_finding_with_context failed for %s: %s", finding_key(f), e)
            f["finding_class"] = "not_treatment_related"
    return findings
