"""Parameterized analysis pipeline — runs the full computation with configurable settings.

The 3-pass statistical computation (all animals, scheduled-only, main-only)
runs once via compute_all_findings(). Settings are applied as post-processing
transforms on the enriched findings before view assembly.
"""

import logging
import math

from services.study_discovery import StudyInfo
from services.analysis.analysis_settings import AnalysisSettings
from services.analysis.findings_pipeline import (
    SCHEDULED_DOMAINS,
    enrich_findings,
    _assess_all_findings,
    finding_key,
)
from services.analysis.phase_filter import IN_LIFE_DOMAINS
from services.analysis.corroboration import compute_corroboration, compute_chain_detection
from services.analysis.confidence import compute_all_confidence
from generator.domain_stats import compute_all_findings
from generator.view_dataframes import (
    build_study_signal_summary,
    build_target_organ_summary,
    build_dose_response_metrics,
    build_organ_evidence_detail,
    build_lesion_severity_summary,
    build_adverse_effect_summary,
    build_noael_summary,
    build_finding_dose_trends,
)
from generator.scores_and_rules import evaluate_rules

log = logging.getLogger(__name__)


class ParameterizedAnalysisPipeline:
    """Runs the full analysis pipeline with configurable settings.

    The 3-pass statistical computation (all animals, scheduled-only,
    main-only) runs once. Settings are applied as post-processing
    transforms before view assembly.
    """

    def __init__(self, study: StudyInfo):
        self.study = study

    def run(
        self,
        settings: AnalysisSettings,
        early_death_subjects: dict | None = None,
        last_dosing_day_override: int | None = None,
        mortality: dict | None = None,
        precomputed_findings: list[dict] | None = None,
        precomputed_dose_groups: list[dict] | None = None,
    ) -> dict[str, list | dict]:
        """Run pipeline and return all view JSONs.

        Args:
            precomputed_findings: If provided, skip compute_all_findings and
                use these findings directly. Used by the generator to avoid
                re-running the expensive 3-pass computation.
            precomputed_dose_groups: Required when precomputed_findings is provided.

        Returns dict mapping view_name (underscore form) to JSON data.
        """
        if precomputed_findings is not None:
            findings = precomputed_findings
            dose_groups = precomputed_dose_groups
        else:
            # Run full 3-pass pipeline
            findings, dg_data = compute_all_findings(
                self.study,
                early_death_subjects=early_death_subjects,
                last_dosing_day_override=last_dosing_day_override,
            )
            dose_groups = dg_data["dose_groups"]

        # 2. Apply settings transforms (post-processing)
        findings = apply_settings_transforms(findings, settings)

        # 3. Build all view JSONs (order matters: rules need target_organs + noael)
        signal_summary = build_study_signal_summary(findings, dose_groups)
        target_organs = build_target_organ_summary(findings)
        noael = build_noael_summary(findings, dose_groups, mortality=mortality)
        rules = evaluate_rules(findings, target_organs, noael, dose_groups)

        return {
            "study_signal_summary": signal_summary,
            "target_organ_summary": target_organs,
            "dose_response_metrics": build_dose_response_metrics(findings, dose_groups),
            "organ_evidence_detail": build_organ_evidence_detail(findings, dose_groups),
            "lesion_severity_summary": build_lesion_severity_summary(findings, dose_groups),
            "adverse_effect_summary": build_adverse_effect_summary(findings, dose_groups),
            "noael_summary": noael,
            "finding_dose_trends": build_finding_dose_trends(findings, dose_groups),
            "rule_results": rules,
        }


# ---------------------------------------------------------------------------
# Settings transforms
# ---------------------------------------------------------------------------

def apply_settings_transforms(
    findings: list[dict],
    settings: AnalysisSettings,
) -> list[dict]:
    """Apply all active settings transforms, then re-derive enrichment if needed.

    For default settings, this is a no-op — findings pass through unchanged.
    """
    if settings.is_default():
        return findings

    changed = False

    if settings.scheduled_only:
        findings = apply_scheduled_only(findings)
        changed = True

    if settings.recovery_pooling == "separate":
        findings = apply_recovery_separate(findings)
        changed = True

    if settings.effect_size != "hedges-g":
        apply_effect_size_method(findings, settings.effect_size)
        changed = True

    if settings.multiplicity != "dunnett-fwer":
        apply_multiplicity_method(findings, settings.multiplicity)
        changed = True

    if changed:
        findings = rederive_enrichment(findings)

    return findings


def apply_scheduled_only(findings: list[dict]) -> list[dict]:
    """For SCHEDULED_DOMAINS findings, swap scheduled stats into primary slots.

    Findings with empty scheduled_group_stats are filtered out (all subjects
    were early deaths for that endpoint).
    """
    result = []
    for f in findings:
        if f["domain"] not in SCHEDULED_DOMAINS:
            result.append(f)
            continue

        sched_gs = f.get("scheduled_group_stats")
        if not sched_gs:
            # No scheduled data — drop this finding
            continue

        # Swap scheduled stats into primary slots
        f["group_stats"] = sched_gs
        f["pairwise"] = f.get("scheduled_pairwise", [])
        f["direction"] = f.get("scheduled_direction")
        f["min_p_adj"] = f.get("scheduled_min_p_adj")
        f["max_effect_size"] = f.get("scheduled_max_effect_size")
        f["trend_p"] = f.get("scheduled_trend_p")
        result.append(f)

    return result


def apply_recovery_separate(findings: list[dict]) -> list[dict]:
    """For IN_LIFE_DOMAINS findings with separate stats, swap into primary slots.

    Recomputes min_p_adj and max_effect_size from swapped pairwise since
    they may not be pre-stored (unlike scheduled which has them).
    """
    for f in findings:
        if f["domain"] not in IN_LIFE_DOMAINS:
            continue

        sep_gs = f.get("separate_group_stats")
        if not sep_gs:
            continue

        f["group_stats"] = sep_gs
        f["pairwise"] = f.get("separate_pairwise", [])
        f["direction"] = f.get("separate_direction")

        # Use pre-stored summary fields if available, otherwise recompute
        if f.get("separate_min_p_adj") is not None:
            f["min_p_adj"] = f["separate_min_p_adj"]
        else:
            f["min_p_adj"] = _recompute_min_p_adj(f["pairwise"])

        if f.get("separate_max_effect_size") is not None:
            f["max_effect_size"] = f["separate_max_effect_size"]
        else:
            f["max_effect_size"] = _recompute_max_effect_size(f["pairwise"])

        if f.get("separate_trend_p") is not None:
            f["trend_p"] = f["separate_trend_p"]

    return findings


def apply_effect_size_method(findings: list[dict], method: str):
    """Recompute cohens_d on each pairwise entry in-place.

    - hedges-g: no-op (current values are already Hedges' g)
    - cohens-d: reverse the Hedges correction J = 1 - 3/(4*df - 1)
    - glass-delta: recompute as (treated_mean - control_mean) / control_sd
    """
    if method == "hedges-g":
        return

    for f in findings:
        if f.get("data_type") != "continuous":
            continue

        pairwise = f.get("pairwise", [])
        group_stats = f.get("group_stats", [])
        control_gs = next((gs for gs in group_stats if gs.get("dose_level") == 0), None)

        for pw in pairwise:
            hedges_g = pw.get("cohens_d")
            if hedges_g is None:
                continue

            if method == "cohens-d":
                # Reverse Hedges correction: d = g / J where J = 1 - 3/(4*df - 1)
                n_ctrl = _get_n_for_dose(group_stats, 0)
                n_treat = _get_n_for_dose(group_stats, pw.get("dose_level"))
                if n_ctrl and n_treat and (n_ctrl + n_treat - 2) > 0:
                    df = n_ctrl + n_treat - 2
                    j = 1 - 3 / (4 * df - 1)
                    if j > 0:
                        pw["cohens_d"] = _safe_round(hedges_g / j)

            elif method == "glass-delta":
                # glass = (treated_mean - control_mean) / control_sd
                if control_gs:
                    ctrl_sd = control_gs.get("sd")
                    ctrl_mean = control_gs.get("mean")
                    treat_gs = next(
                        (gs for gs in group_stats if gs.get("dose_level") == pw.get("dose_level")),
                        None,
                    )
                    if treat_gs and ctrl_sd and ctrl_sd > 0 and ctrl_mean is not None:
                        treat_mean = treat_gs.get("mean")
                        if treat_mean is not None:
                            pw["cohens_d"] = _safe_round((treat_mean - ctrl_mean) / ctrl_sd)

        # Update max_effect_size from recomputed pairwise
        f["max_effect_size"] = _recompute_max_effect_size(pairwise)


def apply_multiplicity_method(findings: list[dict], method: str):
    """Recompute p_value_adj on each pairwise entry in-place.

    - dunnett-fwer: no-op (current values)
    - bonferroni: p_value_adj = min(p_value * n_comparisons, 1.0)
    """
    if method == "dunnett-fwer":
        return

    for f in findings:
        pairwise = f.get("pairwise", [])
        n_comparisons = len(pairwise)
        if n_comparisons == 0:
            continue

        for pw in pairwise:
            raw_p = pw.get("p_value")
            if raw_p is not None and method == "bonferroni":
                pw["p_value_adj"] = _safe_round(min(raw_p * n_comparisons, 1.0))

        # Update min_p_adj from recomputed pairwise
        f["min_p_adj"] = _recompute_min_p_adj(pairwise)


# ---------------------------------------------------------------------------
# Re-enrichment after transforms
# ---------------------------------------------------------------------------

def rederive_enrichment(findings: list[dict]) -> list[dict]:
    """Re-run full enrichment pipeline after settings transforms.

    Same sequence as findings_pipeline.process_findings() but applied to
    already-enriched findings after stats have been swapped/recomputed.
    """
    # Per-finding enrichment (classification, fold change, labels, organ system)
    findings = enrich_findings(findings)
    # Cross-domain corroboration
    findings = compute_corroboration(findings)
    # Cross-organ chain detection
    findings = compute_chain_detection(findings)
    # ECETOC per-finding adversity assessment
    findings = _assess_all_findings(findings)
    # GRADE-style confidence scoring
    findings = compute_all_confidence(findings)
    return findings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _recompute_min_p_adj(pairwise: list[dict]) -> float | None:
    """Recompute min adjusted p-value from pairwise entries."""
    p_vals = [pw["p_value_adj"] for pw in pairwise if pw.get("p_value_adj") is not None]
    return min(p_vals) if p_vals else None


def _recompute_max_effect_size(pairwise: list[dict]) -> float | None:
    """Recompute max effect size (absolute) from pairwise entries."""
    effects = [pw["cohens_d"] for pw in pairwise if pw.get("cohens_d") is not None]
    if not effects:
        return None
    # Return the value with the largest absolute magnitude, preserving sign
    return max(effects, key=abs)


def _get_n_for_dose(group_stats: list[dict], dose_level: int | None) -> int | None:
    """Get sample size for a dose level from group_stats."""
    if dose_level is None:
        return None
    for gs in group_stats:
        if gs.get("dose_level") == dose_level:
            return gs.get("n")
    return None


def _safe_round(val: float, digits: int = 6) -> float | None:
    """Round a value, returning None for NaN/Inf."""
    if val is None or math.isnan(val) or math.isinf(val):
        return None
    return round(val, digits)
