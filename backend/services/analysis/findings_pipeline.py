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
from services.analysis.send_knowledge import (
    BIOMARKER_MAP,
    assess_finding_recognition,
    assess_organ_recognition,
    assess_test_code_recognition,
    get_direction_of_concern,
)

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
    Interval domains (BG, FW) include day_start to disambiguate intervals
    sharing the same end day. Multi-compound studies include compound_id.
    """
    base = (f["domain"], f.get("test_code"), f["sex"], f.get("day"))
    if f["domain"] in TERMINAL_DOMAINS:
        base = base + (f.get("specimen"),)
    if f.get("day_start") is not None:
        base = base + (f.get("day_start"),)
    if f.get("compound_id"):
        base = base + (f.get("compound_id"),)
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
# Trend-test suppression helper
# ---------------------------------------------------------------------------

def _suppress_trend_fields(f: dict, *, save_originals: bool = False) -> None:
    """Nullify trend_p, trend_stat, and jt_p on a finding.

    Called from all suppression paths (no-control RC-7, multi-compound RC-8,
    single-dose RC-8 PS2c). Keeping this in one place enforces the C6
    invariant: trend_p and trend_stat must both be present or both absent.

    When save_originals=True, stashes current values as _original_* fields
    for audit provenance before nullifying.
    """
    if save_originals:
        if f.get("trend_p") is not None:
            f["_original_trend_p"] = f["trend_p"]
        if f.get("trend_stat") is not None:
            f["_original_trend_stat"] = f["trend_stat"]
        if f.get("jt_p") is not None:
            f["_original_jt_p"] = f["jt_p"]
    f["trend_p"] = None
    f["trend_stat"] = None
    if f.get("jt_p") is not None or save_originals:
        f["jt_p"] = None


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
    f.setdefault("is_derived", False)
    f.setdefault("canonical_testcd", None)
    # Phase A term recognition (unrecognized-term-flagging). Seeded to None
    # before enrichment so that if _enrich_finding raises mid-call, downstream
    # consumers still see the keys (R1 F10 ordering).
    f.setdefault("test_code_recognition_level", None)
    f.setdefault("test_code_recognition_reason", None)
    f.setdefault("organ_recognition_level", None)
    f.setdefault("organ_norm_tier", None)
    # Phase B/C term recognition (etransafe-send-snomed-integration cycle).
    # canonical_base_finding + canonical_qualifier are populated only when the
    # MI/MA dispatcher resolves a finding at level 3 (base-concept extraction).
    # test_code_recognition_source carries the BFIELD-149 provenance list of
    # source tags (subset of NONNEO/NEOPLASM/MARES/CLOBS/sendigR/eTRANSAFE).
    f.setdefault("canonical_base_finding", None)
    f.setdefault("canonical_qualifier", None)
    f.setdefault("test_code_recognition_source", None)
    f.setdefault("severity_grade_5pt", None)
    return f


def _enrich_finding(
    f: dict,
    threshold: str = "grade-ge-2-or-dose-dep",
    effect_relevance_threshold: float = 0.3,
) -> dict:
    """Core enrichment: classification, fold change, incidence, organ system, label.

    Pipeline-style: finding in -> enriched finding out.
    Shared between generator (domain_stats) and live API (unified_findings).
    """
    # Compute max_effect_lower from pairwise g_lower (before treatment_related).
    # Incidence endpoints: h_lower (Cohen's h CI) is excluded from decision gates
    # because it is degenerate at preclinical N<=5 (hCiLower = 0 for all patterns).
    # Incidence findings fall to p-value paths in all downstream consumers (TR gate,
    # ECETOC A-6, CL/DS adversity, corroboration). h_lower is retained on pairwise
    # records for display (forest plots). See research/cohens-h-commensurability-analysis.md.
    _max_el = 0.0
    _max_el_loo = None  # LOO stability of the pairwise driving max_effect_lower
    _max_el_loo_ctrl_fragile = None  # control-fragile flag from the driving pairwise
    _max_el_loo_control = None  # control-side LOO stability from the driving pairwise
    _max_el_loo_subject = None  # influential animal USUBJID from the driving pairwise
    _max_el_loo_per_subject = None  # per-animal LOO ratios from the driving pairwise
    is_incidence = f.get("data_type") == "incidence"
    for pw in f.get("pairwise", []):
        gl = pw.get("g_lower")
        if gl is not None and gl > _max_el:
            _max_el = gl
            _max_el_loo = pw.get("loo_stability")
            _max_el_loo_ctrl_fragile = pw.get("loo_control_fragile")
            _max_el_loo_control = pw.get("loo_control")
            _max_el_loo_subject = pw.get("loo_influential_subject")
            _max_el_loo_per_subject = pw.get("loo_per_subject")
        if not is_incidence:
            hl = pw.get("h_lower")
            if hl is not None and hl > _max_el:
                _max_el = hl
                _max_el_loo = None  # h_lower pairwise has no LOO
                _max_el_loo_ctrl_fragile = None
                _max_el_loo_control = None
                _max_el_loo_subject = None
                _max_el_loo_per_subject = None
    f["max_effect_lower"] = round(_max_el, 4) if _max_el > 0 else None
    f["loo_stability"] = _max_el_loo
    f["loo_control_fragile"] = _max_el_loo_ctrl_fragile
    f["loo_control"] = _max_el_loo_control
    f["loo_influential_subject"] = _max_el_loo_subject
    # Per-subject LOO ratios: generation-time field (distinct from serve-time
    # _pattern_override / _system_dose_level which are applied in _apply_overrides).
    # Baked into generated JSON, consumed by frontend LooSensitivityPane.
    f["loo_per_subject"] = _max_el_loo_per_subject

    # Control group CV% (F2: data-driven CV for species-aware tier assignment).
    # Computed on original scale (sd/mean * 100) for ALL endpoints including
    # lognormal (R1-F3: no scale mixing with population CV reference table).
    if f.get("data_type") == "continuous" and not f.get("compound_id"):
        ctrl_gs = next((gs for gs in f.get("group_stats", []) if gs.get("dose_level", -1) == 0), None)
        if ctrl_gs and ctrl_gs.get("mean") and ctrl_gs["mean"] != 0 and ctrl_gs.get("sd") is not None:
            f["control_cv_pct"] = round(abs(ctrl_gs["sd"] / ctrl_gs["mean"]) * 100, 1)
            f["n_control"] = ctrl_gs.get("n")
        else:
            f["control_cv_pct"] = None
            f["n_control"] = ctrl_gs.get("n") if ctrl_gs else None
    else:
        f["control_cv_pct"] = None
        f["n_control"] = None
    f["cv_scale"] = "original"

    # Detection power annotation (F4: pMDD per pairwise comparison).
    # Computes MDD as % of control mean using Bonferroni-corrected t with
    # Dunnett pooled df. Annotation-only — does not affect scoring or NOAEL.
    f["detection_mdd_pct"] = None
    f["detection_mdd_pct_median"] = None
    f["detection_mdd_driven_by"] = None
    f["detection_underpowered"] = None
    if f.get("data_type") == "continuous" and f.get("control_cv_pct") is not None:
        from services.analysis.statistics import compute_pmdd
        group_stats = f.get("group_stats", [])
        ctrl_gs = next((gs for gs in group_stats if gs.get("dose_level", -1) == 0), None)
        treated_gs = [gs for gs in group_stats if gs.get("dose_level", 0) > 0]
        if ctrl_gs and ctrl_gs.get("sd") is not None and ctrl_gs.get("mean") and treated_gs:
            n_total = sum(gs.get("n", 0) for gs in group_stats)
            k_groups = len(group_stats)
            pmdd_values = []
            max_pmdd = None
            max_pmdd_dl = None
            for tgs in treated_gs:
                n_t = tgs.get("n", 0)
                pmdd = compute_pmdd(
                    ctrl_gs["sd"], ctrl_gs["mean"],
                    ctrl_gs.get("n", 0), n_t, k_groups, n_total,
                )
                if pmdd is not None:
                    pmdd_values.append(pmdd)
                    if max_pmdd is None or pmdd > max_pmdd:
                        max_pmdd = pmdd
                        max_pmdd_dl = tgs.get("dose_level")
            if pmdd_values:
                import statistics as _stat
                f["detection_mdd_pct"] = max_pmdd
                f["detection_mdd_pct_median"] = round(_stat.median(pmdd_values), 1)
                if max_pmdd_dl is not None:
                    n_at_max = next((gs.get("n", 0) for gs in treated_gs if gs.get("dose_level") == max_pmdd_dl), None)
                    f["detection_mdd_driven_by"] = f"dose level {max_pmdd_dl}, N={n_at_max}"

                # Underpowered flag: compare max pMDD against meaningful threshold
                threshold_pct = None
                domain = f.get("domain", "")
                if domain == "OM":
                    from services.analysis.organ_thresholds import get_organ_threshold
                    ot = get_organ_threshold(f.get("specimen", ""), f.get("_study_species"))
                    if ot and ot.get("adverse_floor_pct") is not None:
                        threshold_pct = ot["adverse_floor_pct"]
                    if ot and ot.get("threshold_provisional"):
                        f["threshold_provisional"] = True
                elif domain in ("LB", "BW"):
                    # Use fold-change threshold from lab-clinical-rules (R2-NEW3)
                    from services.analysis.send_knowledge import get_lab_fold_threshold
                    fold = get_lab_fold_threshold(f.get("test_code", ""))
                    if fold is not None:
                        threshold_pct = (fold - 1) * 100  # e.g. 2-fold = 100%
                if threshold_pct is not None and max_pmdd is not None and max_pmdd > threshold_pct:
                    f["detection_underpowered"] = True

    # Classification
    f["severity"] = classify_severity(f, threshold=threshold)
    # FCT verdict + uncertainty-first payload (species-magnitude-thresholds-dog-nhp
    # Phase B, F3/F3b). Every classified finding carries verdict/coverage/
    # fallback_used/provenance/entry_ref/fct_reliance as schema-enforced fields
    # regardless of whether a populated FCT band was resolved.
    from services.analysis.classification import compute_fct_payload as _compute_fct
    _fct = _compute_fct(f, f.get("_study_species"))
    f["verdict"] = _fct["verdict"]
    f["coverage"] = _fct["coverage"]
    f["fallback_used"] = _fct["fallback_used"]
    f["provenance"] = _fct["provenance"]
    f["entry_ref"] = _fct["entry_ref"]
    f["fct_reliance"] = _fct["fct_reliance"]
    dr_result = classify_dose_response(
        f.get("group_stats", []),
        f.get("data_type", "continuous"),
        test_code=f.get("test_code"),
        specimen=f.get("specimen"),
        domain=f.get("domain"),
        species=f.get("_study_species"),
        computed_cv=f.get("control_cv_pct"),
        n_control=f.get("n_control"),
    )
    f["dose_response_pattern"] = dr_result["pattern"]
    f["pattern_confidence"] = dr_result.get("confidence")
    f["onset_dose_level"] = dr_result.get("onset_dose_level")
    f["treatment_related"] = determine_treatment_related(f, effect_relevance_threshold=effect_relevance_threshold)

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

        # Bayesian posterior and detection limit for small-N incidence (M1)
        ctrl_gs = next((gs for gs in f.get("group_stats", []) if gs.get("dose_level", -1) == 0), None)
        high_gs = treated_gs[-1] if treated_gs else None
        if ctrl_gs and high_gs and ctrl_gs.get("n", 0) > 0 and high_gs.get("n", 0) > 0:
            from services.analysis.statistics import (
                bayesian_incidence_posterior, incidence_detection_limited,
            )
            f["detection_limited"] = incidence_detection_limited(high_gs["n"], ctrl_gs["n"])
            f["bayesian_posterior"] = bayesian_incidence_posterior(
                high_gs.get("affected", 0), high_gs["n"],
                ctrl_gs.get("affected", 0), ctrl_gs["n"],
            )
        else:
            f["detection_limited"] = None
            f["bayesian_posterior"] = None
    else:
        f["max_incidence"] = None

    # Organ system
    f["organ_system"] = get_organ_system(
        f.get("specimen"),
        f.get("test_code"),
        f.get("domain"),
    )

    # Canonical test code + recognition tier. Phase A LB/BW/FW/EG/VS/BG path
    # unchanged; Phase B/C MI/MA/CL path dispatches to assess_finding_recognition
    # which ALSO returns (base_concept, qualifier, source) so _enrich_finding
    # does not need to call extract_base_concept separately (architect ADVISORY-2)
    # and does not need a second pass for per-source telemetry (R1 F8).
    #
    # CRITICAL: For MI/MA findings, the actual finding name lives in the
    # `test_name` field. The `test_code` for MI/MA is the composite
    # "{specimen}_{test_name}" produced by the generator. Dispatching on
    # test_code directly would never resolve aliases like RETINAL FOLD(S).
    # CL findings have test_name == test_code (no specimen), so either
    # works for CL.
    tc = f.get("test_code", "")
    domain = f.get("domain", "")
    if tc:
        if domain in ("MI", "MA", "CL"):
            # Use test_name for MI/MA/CL — the actual finding name without
            # the specimen prefix. Dispatcher resolves at levels 1/2/3/6 and
            # returns base_concept/qualifier/source telemetry.
            finding_term = f.get("test_name") or tc
            (canonical, tc_level, tc_reason,
             base_concept, qualifier, source_list) = (
                assess_finding_recognition(domain, finding_term)
            )
            f["canonical_base_finding"] = base_concept
            f["canonical_qualifier"] = qualifier
            f["test_code_recognition_source"] = source_list
        else:
            canonical, tc_level, tc_reason = assess_test_code_recognition(domain, tc)
            f["canonical_base_finding"] = None
            f["canonical_qualifier"] = None
            f["test_code_recognition_source"] = None
        f["canonical_testcd"] = canonical
        f["test_code_recognition_level"] = tc_level
        f["test_code_recognition_reason"] = tc_reason
    else:
        f["canonical_testcd"] = None
        f["test_code_recognition_level"] = None
        f["test_code_recognition_reason"] = None
        f["canonical_base_finding"] = None
        f["canonical_qualifier"] = None
        f["test_code_recognition_source"] = None

    # Organ recognition tier and normalization tier label (feeds Phase C scope
    # confidence gate). organ_norm_tier is populated ONLY for level 6 per
    # R1 F9 -- level 1/2 would just mirror "exact"/"alias" with no extra info.
    specimen = f.get("specimen", "")
    if specimen:
        _canonical_organ, organ_level, organ_tier = assess_organ_recognition(specimen)
        f["organ_recognition_level"] = organ_level
        f["organ_norm_tier"] = organ_tier if organ_level == 6 else None
    else:
        f["organ_recognition_level"] = None
        f["organ_norm_tier"] = None

    # Severity grade (5-point scale) for incidence findings with grading.
    # None-safety (GAP-244): both the outer gs entry and severity_grade_counts
    # may be present-but-None (dict.get default only triggers on missing key).
    # Prior to the guards below, this block crashed on 463 MI findings across
    # 12 studies with TypeError: 'NoneType' object is not iterable, which was
    # silently swallowed upstream and left endpoint_label unprefixed.
    if f.get("data_type") == "incidence":
        max_grade = 0
        for gs in f.get("group_stats", []):
            if gs is None:
                continue
            if gs.get("dose_level", 0) > 0:  # treated groups only
                sgc = gs.get("severity_grade_counts") or {}
                for grade_str in sgc:
                    try:
                        g = int(grade_str)
                    except (ValueError, TypeError):
                        continue
                    if g > max_grade:
                        max_grade = g
        f["severity_grade_5pt"] = max_grade if max_grade > 0 else None
    else:
        f["severity_grade_5pt"] = None

    # Derived endpoint flag — calculated ratios/indices create tautological
    # correlations with their source components.  Consumers (correlation engine,
    # volcano percentile, NOAEL) can filter on this.
    tc = f.get("test_code", "")
    bio = BIOMARKER_MAP.get(tc)
    f["is_derived"] = bool(bio and bio.get("derived"))

    # Direction of concern — expected toxicological direction for this endpoint.
    # Wires BIOMARKER_MAP metadata into findings (GAP-117, reviewer audit 2026-03).
    concern_dir = get_direction_of_concern(f)
    f["direction_of_concern"] = concern_dir
    observed_dir = f.get("direction")
    if concern_dir and observed_dir and observed_dir != "none":
        f["direction_aligns_with_concern"] = (observed_dir == concern_dir)
    else:
        f["direction_aligns_with_concern"] = None  # no concern direction or no observed direction

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
    effect_relevance_threshold: float = 0.3,
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
            f = _enrich_finding(f, threshold=threshold, effect_relevance_threshold=effect_relevance_threshold)
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
            f["separate_trend_stat"] = sep.get("trend_stat")
        else:
            f["separate_group_stats"] = []
            f["separate_pairwise"] = []
            f["separate_direction"] = None
            f["separate_min_p_adj"] = None
            f["separate_max_effect_size"] = None
            f["separate_trend_p"] = None
            f["separate_trend_stat"] = None
    return findings


# ---------------------------------------------------------------------------
# Pre-exclusion statistics preservation
# ---------------------------------------------------------------------------

def _stash_pre_exclusion_stats(findings: list[dict]) -> list[dict]:
    """Stash base-pass (pre-exclusion) driving metrics on findings with scheduled stats.

    When animal exclusions are active, the base-pass pairwise represents the
    pre-exclusion world. The scheduled_pairwise represents the post-exclusion
    world. This function copies the base-pass driving metrics into
    ``_pre_exclusion_*`` fields for regulatory audit trail.

    Only fires on findings that have ``scheduled_pairwise`` data (i.e., findings
    in SCHEDULED_DOMAINS where the dual-pass ran).
    """
    for f in findings:
        sched_pw = f.get("scheduled_pairwise")
        if not sched_pw:
            continue
        # Base-pass driving metrics are already on the finding via _enrich_finding():
        #   max_effect_lower (from f["pairwise"]), and the raw pairwise values.
        # Extract the pre-exclusion effect_size and p_value from the driving pairwise
        # (the one that produced max_effect_lower).
        base_pw = f.get("pairwise", [])
        pre_g_lower = None
        pre_effect_size = None
        pre_p_value = None
        best_gl = 0.0
        for pw in base_pw:
            gl = pw.get("g_lower")
            if gl is not None and gl > best_gl:
                best_gl = gl
                pre_g_lower = gl
                pre_effect_size = pw.get("effect_size")
                pre_p_value = pw.get("p_value_adj")

        f["_pre_exclusion_g_lower"] = pre_g_lower
        f["_pre_exclusion_effect_size"] = pre_effect_size
        f["_pre_exclusion_p_value"] = pre_p_value
    return findings


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

# Organ systems with mechanistically specific concordance for Track 2 criterion B
# (R1-F5 fix). Broad systems like hematologic/general excluded because directional
# concordance within them does not imply mechanistic relatedness.
_CONCORDANCE_ORGAN_SYSTEMS = frozenset({
    "hepatic", "renal", "thyroid", "adrenal", "cardiac", "gastric",
})


def _annotate_track2(findings: list[dict]) -> None:
    """Annotate findings that fail gLower 0.3 gate but meet secondary evidence criteria.

    Track 2 criterion A: magnitude + pattern (gLower > 0.10 AND magnitude > threshold
      AND dose_response_pattern not flat/insufficient)
    Track 2 criterion B: cross-domain concordance (gLower > 0.10 AND 2+ concordant
      findings in same organ system with same direction)

    Modifies findings in-place (annotation-only).
    """
    from services.analysis.organ_thresholds import get_organ_threshold
    from services.analysis.send_knowledge import get_lab_fold_threshold

    # Build organ_system concordance index for criterion B
    for f in findings:
        if f.get("treatment_related") or f.get("max_effect_lower") is None:
            continue
        mel = f["max_effect_lower"]
        if mel >= 0.3 or mel <= 0.10:
            continue  # Not in Track 2 range (0.10 < gLower < 0.30)

        # Track 2 criterion A: magnitude + pattern
        pattern = f.get("dose_response_pattern", "")
        if pattern not in ("flat", "insufficient_data"):
            domain = f.get("domain", "")
            threshold_pct = None
            if domain == "OM":
                ot = get_organ_threshold(f.get("specimen", ""), f.get("_study_species"))
                if ot and ot.get("adverse_floor_pct") is not None:
                    threshold_pct = ot["adverse_floor_pct"]
            elif domain in ("LB", "BW"):
                fold = get_lab_fold_threshold(f.get("test_code", ""))
                if fold is not None:
                    threshold_pct = (fold - 1) * 100

            if threshold_pct is not None:
                # Use max_fold_change (captures peak across all doses, not just highest)
                mfc = f.get("max_fold_change")
                pct_change = abs(mfc - 1) * 100 if mfc is not None else None
                if pct_change is not None and pct_change > threshold_pct:
                    f["gate_suppressed_notable"] = True
                    f["gate_suppressed_reason"] = "magnitude_and_pattern"
                    continue

        # Track 2 criterion B: cross-domain concordance (restricted organ systems)
        organ_sys = (f.get("organ_system") or "").lower()
        direction = f.get("direction")
        if organ_sys not in _CONCORDANCE_ORGAN_SYSTEMS or not direction or direction == "none":
            continue
        concordant_count = 0
        for other in findings:
            if other is f:
                continue
            if (other.get("organ_system") or "").lower() != organ_sys:
                continue
            if other.get("direction") != direction:
                continue
            other_p = other.get("min_p_adj")
            other_inc = None
            if other.get("data_type") == "incidence":
                tgs = [gs for gs in other.get("group_stats", []) if gs.get("dose_level", 0) > 0]
                other_inc = max((gs.get("affected", 0) for gs in tgs), default=0)
            if (other_p is not None and other_p < 0.10) or (other_inc is not None and other_inc >= 2):
                concordant_count += 1
        if concordant_count >= 2:
            f["gate_suppressed_notable"] = True
            f["gate_suppressed_reason"] = "cross_domain_concordance"


def process_findings(
    base_findings: list[dict],
    scheduled_map: dict[tuple, dict] | None = None,
    separate_map: dict[tuple, dict] | None = None,
    n_excluded: int = 0,
    species: str | None = None,
    strain: str | None = None,
    duration_days: int | None = None,
    relrec_links: dict[tuple, list[tuple]] | None = None,
    route: str | None = None,
    vehicle: str | None = None,
    classification_framework: str | None = None,
    has_concurrent_control: bool = True,
    is_multi_compound: bool = False,
    expected_profile: dict | None = None,
    study_meta: dict | None = None,
    effect_relevance_threshold: float = 0.3,
) -> list[dict]:
    """Shared enrichment pipeline: merge pass variants, then classify.

    Order:
      1. Merge scheduled-only stats (Pass 2) if provided
      2. Merge separate/main-only stats (Pass 3) if provided
      3. Enrich all findings (classification, fold change, labels, etc.)

    Pattern overrides are applied at the endpoint level (analysis_views.py)
    so they work for both static file serving and parameterized pipeline paths.

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
        has_concurrent_control: Whether the study has a concurrent control group.
            When False, adversity classification is suppressed (RC-7).
    """
    # Stamp study-level metadata on findings so _enrich_finding() can use them
    # for species-aware tier assignment (F3) and detection power (F4).
    if species:
        for f in base_findings:
            f["_study_species"] = species

    if scheduled_map is not None:
        base_findings = attach_scheduled_stats(
            base_findings, scheduled_map, n_excluded,
        )
    if separate_map is not None:
        base_findings = attach_separate_stats(base_findings, separate_map)
    enriched = enrich_findings(base_findings)

    # Pre-exclusion statistics preservation: when animal exclusions are active,
    # the base-pass pairwise (f["pairwise"]) contains ALL animals (pre-exclusion)
    # while scheduled_pairwise contains post-exclusion stats. Stash the base-pass
    # driving metrics so the frontend can show "before vs after" for audit.
    # _pre_exclusion_* fields are generation-time (baked into JSON when exclusions
    # active), distinct from _pattern_override which is serve-time.
    if n_excluded > 0:
        enriched = _stash_pre_exclusion_stats(enriched)

    # No-control suppression (RC-7, control-groups-model §3): without a concurrent
    # control, Dunnett's pairwise and trend tests are scientifically meaningless.
    # Strip them so consumers see descriptive group_stats only.
    if not has_concurrent_control:
        for f in enriched:
            f["pairwise"] = []
            f["min_p_adj"] = None
            f["max_effect_size"] = None
            _suppress_trend_fields(f)
        log.info(
            "No concurrent control: pairwise/trend stripped from %d findings.",
            len(enriched),
        )

    # Multi-compound trend suppression (RC-8): when domain stats were run
    # per-compound partition (Phase A), trend tests are already compound-scoped
    # and valid. Only suppress if findings lack compound_id (legacy/fallback).
    if is_multi_compound:
        unpartitioned = [f for f in enriched if not f.get("compound_id")]
        if unpartitioned:
            for f in unpartitioned:
                _suppress_trend_fields(f, save_originals=True)
                f["_multi_compound_suppressed"] = True
            log.info(
                "Multi-compound: trend tests suppressed for %d unpartitioned findings",
                len(unpartitioned),
            )
        else:
            log.info(
                "Multi-compound: %d findings have compound_id (per-compound stats, trends valid)",
                len(enriched),
            )

    # Single-dose compound annotation (RC-8 PS2c): when a compound has only
    # one dose level, trend tests are not applicable. Annotate findings so the
    # frontend can display "Single dose -- trend test not applicable".
    single_dose_findings = [f for f in enriched if f.get("_compound_dose_count") == 1]
    if single_dose_findings:
        for f in single_dose_findings:
            f["_single_dose_compound"] = True
            # Trend tests should already be null (k<2 graceful degradation),
            # but make suppression explicit with provenance
            _suppress_trend_fields(f, save_originals=True)
        log.info(
            "Single-dose compound: %d findings annotated, trend tests suppressed",
            len(single_dose_findings),
        )

    # Pattern overrides applied at endpoint level (analysis_views.py) so they
    # work for both static file serving and parameterized pipeline results
    # Cross-domain corroboration (requires all enriched findings present)
    # effect_threshold allows large-effect findings to corroborate without p < 0.05
    enriched = compute_corroboration(enriched, relrec_links=relrec_links, effect_threshold=effect_relevance_threshold)
    # Cross-organ chain detection (requires all enriched findings present)
    enriched = compute_chain_detection(enriched, effect_threshold=effect_relevance_threshold)
    # ECETOC per-finding adversity assessment (requires corroboration_status)
    enriched = _assess_all_findings(
        enriched, species=species, strain=strain, duration_days=duration_days,
        route=route, vehicle=vehicle,
        has_concurrent_control=has_concurrent_control,
        classification_framework=classification_framework,
    )
    # Reconcile severity/treatment_related with finding_class.
    # finding_class is a higher-order judgment that uses biological context
    # (corroboration, dose-response pattern, neoplastic flag) beyond raw
    # statistics.  When it says tr_adverse but severity is still normal
    # (e.g., rare tumors with n too small for Fisher's exact), promote.
    for f in enriched:
        fc = f.get("finding_class", "")
        if fc in ("tr_adverse", "tr_nonadverse") and not f.get("treatment_related"):
            f["treatment_related"] = True
        if fc == "tr_adverse" and f.get("severity") == "normal":
            f["severity"] = "adverse"
    # GRADE-style confidence scoring (requires finding_class, _hcd_assessment, corroboration_status)
    enriched = compute_all_confidence(
        enriched, expected_profile=expected_profile, study_meta=study_meta,
    )
    # F6: Track 2 gLower transparency annotations.
    # Findings that fail the gLower 0.3 gate (treatment_related=False) but meet
    # secondary evidence criteria are annotated as "suppressed but notable."
    # INVARIANT X3: gate_suppressed_notable is annotation-only. Do NOT condition
    # scoring on this field.
    _annotate_track2(enriched)
    assert not any(
        f.get("gate_suppressed_notable") and f.get("treatment_related")
        for f in enriched
    ), "Track 2 invariant violated: gate_suppressed_notable and treatment_related are mutually exclusive"
    return enriched


def _assess_all_findings(
    findings: list[dict],
    species: str | None = None,
    strain: str | None = None,
    duration_days: int | None = None,
    route: str | None = None,
    vehicle: str | None = None,
    has_concurrent_control: bool = True,
    classification_framework: str | None = None,
) -> list[dict]:
    """Run ECETOC per-finding adversity assessment on all findings.

    Must be called AFTER ``compute_corroboration()`` since the assessment
    uses ``corroboration_status`` as an input (A-2 concordance factor and
    B-2 moderate-magnitude escalation).

    When has_concurrent_control=False, adversity classification is suppressed:
    all findings get finding_class="not_assessed" and severity="not_assessed"
    with a _no_control_suppressed flag. Without a concurrent control, adversity
    calls are scientifically meaningless.
    (RC-7, control-groups-model-29mar2026.md §3)

    Tier 2: builds ConcurrentFindingIndex for cross-finding lookups and
    uses assess_finding_with_context() for organ-specific thresholds and
    adaptive decision trees.
    Tier 3A: passes strain + duration for A-3 HCD assessment.
    """
    if not has_concurrent_control:
        for f in findings:
            f["finding_class"] = "not_assessed"
            f["_no_control_suppressed"] = True
            f["severity"] = "not_assessed"
            # GAP-271 Phase 2: documented reason for the not_assessed severity.
            # Authoritative source for the BFIELD-92 invariant. Future emission
            # paths (failed QC, insufficient data) should add new allowed values
            # to ALLOWED_NOT_ASSESSED_REASONS rather than reusing this constant.
            f["not_assessed_reason"] = "no_concurrent_control"
            f["treatment_related"] = False
            # Phase B (AC-F3b-1): every classified finding carries the FCT
            # uncertainty-first payload even when adversity classification
            # is suppressed. The verdict is 'provisional' (no reference
            # for classification) with a distinct reliance block.
            f.setdefault("verdict", "provisional")
            f.setdefault("coverage", "none")
            f.setdefault("fallback_used", True)
            f.setdefault("provenance", "extrapolated")
            f.setdefault("entry_ref", None)
            f.setdefault("fct_reliance", {
                "coverage": "none",
                "fallback_used": True,
                "provenance": "extrapolated",
                "bands_used": None,
            })
        log.info(
            "No concurrent control -- adversity classification suppressed for %d findings. "
            "Descriptive statistics retained.",
            len(findings),
        )
        return findings

    # NOEL framework for safety pharmacology (B5, Pugsley 2020, ICH S7A)
    if classification_framework == "noel":
        from services.analysis.classification import (
            assess_finding_safety_pharm, _CONCERN_THRESHOLDS,
        )
        for f in findings:
            try:
                f["finding_class"] = assess_finding_safety_pharm(f)
            except Exception as e:
                log.warning("assess_finding_safety_pharm failed for %s: %s", finding_key(f), e)
                f["finding_class"] = "not_treatment_related"
            # BP-C3: Attach concern threshold so frontend can render reference lines
            tc = (f.get("test_code") or "").upper()
            ct = _CONCERN_THRESHOLDS.get(tc)
            if ct is not None:
                f["_concern_threshold"] = ct
        log.info(
            "NOEL framework: %d findings classified (no adversity judgment)",
            len(findings),
        )
        return findings

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
