"""Pure rule functions for classifying findings severity, dose-response patterns,
treatment-relatedness, and ECETOC per-finding adversity assessment.

Tier 2 additions: organ-specific two-gate OM classification, adaptive decision trees,
and context-aware assessment using ConcurrentFindingIndex.

Tier 3A: A-3 factor — historical control data (HCD) reference range check.
Tier 3B: B-6 factor — progression chain evaluation (14 organ-specific chains).

Designed for later extraction to configurable scripts."""

from __future__ import annotations

import logging
import math

from services.analysis.adversity_dictionary import lookup_intrinsic_adversity
from services.analysis.organ_thresholds import get_organ_threshold, get_default_om_threshold

log = logging.getLogger(__name__)


def classify_severity(
    finding: dict,
    threshold: str = "grade-ge-2-or-dose-dep",
) -> str:
    """Classify a finding as 'adverse', 'warning', or 'normal'.

    Threshold modes (continuous endpoints only — incidence is unchanged):
    - grade-ge-2-or-dose-dep: default. p < 0.05 AND |d| >= 0.5, or trend-driven.
    - grade-ge-1: any significant pairwise → adverse (no effect size gate).
    - grade-ge-2: p < 0.05 AND |d| >= 0.5 → adverse (no trend consideration).
    """
    from services.analysis.send_knowledge import get_effect_size as _get_es
    min_p = finding.get("min_p_adj")
    max_d = _get_es(finding)  # Cohen's d for continuous, None for incidence
    trend_p = finding.get("trend_p")
    data_type = finding.get("data_type", "continuous")

    if data_type == "continuous":
        if threshold == "grade-ge-1":
            # Any significant pairwise → adverse
            if min_p is not None and min_p < 0.05:
                return "adverse"
            if trend_p is not None and trend_p < 0.05:
                return "warning"
            if max_d is not None and abs(max_d) >= 1.0:
                return "warning"
            return "normal"

        if threshold == "grade-ge-2":
            # Significant AND meaningful effect size — no trend consideration
            if min_p is not None and min_p < 0.05:
                if max_d is not None and abs(max_d) >= 0.5:
                    return "adverse"
                return "warning"
            if max_d is not None and abs(max_d) >= 1.0:
                return "warning"
            return "normal"

        # Default: grade-ge-2-or-dose-dep (original behavior)
        if min_p is not None and min_p < 0.05:
            if max_d is not None and abs(max_d) >= 0.5:
                return "adverse"
            return "warning"
        if trend_p is not None and trend_p < 0.05:
            if max_d is not None and abs(max_d) >= 0.8:
                return "adverse"
            return "warning"
        if max_d is not None and abs(max_d) >= 1.0:
            return "warning"
        return "normal"
    else:
        # Incidence endpoints: classification unchanged across thresholds
        direction = finding.get("direction", "none")
        if direction == "down":
            if min_p is not None and min_p < 0.05:
                return "warning"
            if trend_p is not None and trend_p < 0.05:
                return "warning"
            return "normal"
        if min_p is not None and min_p < 0.05:
            return "adverse"
        if trend_p is not None and trend_p < 0.05:
            return "warning"
        if min_p is not None and min_p < 0.1:
            return "warning"
        return "normal"


# Fraction of pooled SD used as equivalence band (0.5 SD ≈ negligible Cohen's d)
_EQUIVALENCE_FRACTION = 0.5
_MIN_POOLED_SD = 0.001


def _pooled_sd(group_stats: list[dict]) -> float:
    """Compute pooled SD across all dose groups (RMS of per-group SDs).

    Including control stabilises the estimate when treatment compresses
    or inflates variability at high doses.  Matches EFSA pooled-all approach.
    """
    sds = [g["sd"] for g in group_stats if g.get("sd") is not None and g["sd"] > 0]
    if sds:
        return math.sqrt(sum(s ** 2 for s in sds) / len(sds))
    # Fallback: SD of all group means
    means = [g["mean"] for g in group_stats if g.get("mean") is not None]
    if len(means) >= 2:
        avg = sum(means) / len(means)
        return math.sqrt(sum((m - avg) ** 2 for m in means) / (len(means) - 1))
    return 0.0


# ---------------------------------------------------------------------------
# Tiered CV%-based equivalence fractions
# ---------------------------------------------------------------------------
# Three-tier system from deep-research brief 9, based on biological variability:
#   Tier 1 (CV < 10%):  0.5 SD — tight band, high sensitivity
#   Tier 2 (CV 10-20%): 0.5 SD — same fraction as Tier 1 (intentional)
#   Tier 3 (CV > 20%):  0.75 SD — wider band absorbs intrinsic noise
#
# Design note (reviewer audit 2026-03): Tier 1 and Tier 2 share the same
# 0.5 SD equivalence fraction. This is intentional — the differentiation
# happens downstream in the GRADE confidence scoring system (confidence.py):
# Tier 2 endpoints receive a D6 penalty (-1) when the max step falls in
# the 0.75–1.0 SD equivocal zone, flagging genuine-but-marginal effects
# without changing the dose-response pattern classification itself.

_TIER_FRACTIONS = {1: 0.5, 2: 0.5, 3: 0.75}

# Tier 3: high-variability LB test codes (CV > 20%)
_HIGH_CV_TESTS = {
    "WBC", "EOS", "BASO",                          # hematology
    "TRIG", "BILI", "TBILI", "GGT",                # clinical chemistry
    "VOLUME",                                       # urinalysis
    "KETONES",                                      # urinalysis (ordinal, but continuous path)
    "LYM", "MONO", "NEUT",                         # differential WBC (high CV)
    "RETI",                                         # reticulocytes (high CV)
}

# Tier 2: moderate-variability LB test codes (CV 10-20%)
_MODERATE_CV_TESTS = {
    "ALT", "AST", "GLUC", "PLAT",                  # clinical chemistry / hematology
    "CREAT", "CHOL", "ALP",                        # clinical chemistry
    "FIBRINO", "APTT", "PT",                       # coagulation
}

# Tier 1: confirmed low-variability test codes (CV < 10%)
_KNOWN_TIER1_TESTS = {
    "BW", "BWSTRESN", "BWGAIN",                    # body weight
    "RBC", "HGB", "HCT", "MCV", "MCH", "MCHC",   # RBC parameters
    "TP", "PROT", "ALB",                           # total protein / albumin
    "RDW",                                          # red cell distribution width
    "ALBGLOB", "GLOBUL",                           # protein fractions
    "CA", "SODIUM", "K", "CL", "PHOS",            # electrolytes (tightly regulated)
    "UREAN",                                        # BUN
}

# Tier 3: high-variability OM specimens (CV > 20%)
_HIGH_CV_SPECIMENS = {
    "SPLEEN", "THYMUS",
    "GLAND, ADRENAL", "ADRENAL", "ADRENALS",
    "UTERUS", "OVARY", "OVARIES",
    "TESTIS", "TESTES",
    "EPIDIDYMIS",
}

# Tier 2: moderate-variability OM specimens (CV 10-20%)
_MODERATE_CV_SPECIMENS = {
    "LIVER", "KIDNEY", "KIDNEYS",
    "LUNG", "LUNGS",
    "LYMPH NODE", "LYMPH NODE, MESENTERIC",
}


def _equivalence_tier(test_code: str, specimen: str | None = None,
                      domain: str | None = None) -> int:
    """Determine CV% tier for equivalence band width.

    For OM domain, uses specimen (organ) instead of test_code since all OM
    findings share test_code='WEIGHT'.
    """
    # OM domain: tier by specimen (organ), not test_code
    if domain == "OM" and specimen:
        spec_upper = specimen.upper()
        for high in _HIGH_CV_SPECIMENS:
            if high in spec_upper:
                return 3
        for mod in _MODERATE_CV_SPECIMENS:
            if mod in spec_upper:
                return 2
        # Brain, heart → Tier 1
        return 1

    tc = (test_code or "").upper()
    if tc in _HIGH_CV_TESTS:
        return 3
    if tc in _MODERATE_CV_TESTS:
        return 2
    if tc and tc not in _KNOWN_TIER1_TESTS:
        log.info("Unknown test_code '%s' defaulting to Tier 1 (0.5 SD)", tc)
    return 1


def _equivalence_fraction(test_code: str, specimen: str | None = None,
                          domain: str | None = None) -> float:
    """Get equivalence band fraction for the given endpoint."""
    return _TIER_FRACTIONS[_equivalence_tier(test_code, specimen, domain)]


_MIN_INCIDENCE_TOLERANCE = 0.02  # floor at 2pp, matching client-side


def _binomial_tolerance(n: int, p: float) -> float:
    """Binomial SE-based tolerance for incidence data.

    Wider for high-incidence groups with small n — absorbs sampling noise.
    Floor at 2pp to match client-side pattern-classification.ts.
    """
    if n <= 0 or p <= 0 or p >= 1:
        return _MIN_INCIDENCE_TOLERANCE
    se = math.sqrt(p * (1 - p) / n)
    return max(1.5 * se, _MIN_INCIDENCE_TOLERANCE)


def _step_direction(val_from: float, val_to: float, band: float) -> str:
    """Classify a single step as 'up', 'down', or 'flat' using equivalence band."""
    if abs(val_to - val_from) <= band:
        return "flat"
    return "up" if val_to > val_from else "down"


def _classify_from_steps(steps: list[str]) -> str:
    """Map a step sequence to a pattern label."""
    non_flat = [s for s in steps if s != "flat"]
    directions = set(non_flat)

    if len(non_flat) == 0:
        return "flat"

    if len(directions) == 1:
        d = non_flat[0]
        has_flat = "flat" in steps
        if not has_flat:
            return "monotonic_increase" if d == "up" else "monotonic_decrease"
        else:
            return "threshold_increase" if d == "up" else "threshold_decrease"

    # Mixed directions
    return "non_monotonic"


def _compute_confidence(steps: list[str], means: list[float], pooled_sd: float) -> str:
    """Pattern-specific confidence: how clean is the classification?

    Factors:
    1. Max effect magnitude (Cohen's d from control)
    2. Raw step cleanliness (without equivalence band)

    Returns HIGH, MODERATE, or LOW.
    """
    control = means[0]
    treated = means[1:]
    sd = pooled_sd if pooled_sd > 0 else 1

    # Factor 1: max effect magnitude (Cohen's d)
    max_d = max(abs(t - control) / sd for t in treated) if treated else 0
    score = 0
    if max_d >= 2.0:
        score += 2
    elif max_d >= 0.8:
        score += 1

    # Factor 2: raw step cleanliness (without equivalence band)
    raw_steps = []
    for i in range(len(means) - 1):
        if means[i + 1] > means[i]:
            raw_steps.append("up")
        elif means[i + 1] < means[i]:
            raw_steps.append("down")
        else:
            raw_steps.append("flat")
    raw_non_flat = [s for s in raw_steps if s != "flat"]
    raw_dirs = set(raw_non_flat)
    if len(raw_dirs) <= 1:
        score += 1  # naturally monotonic even without band

    if score >= 3:
        return "HIGH"
    if score >= 1:
        return "MODERATE"
    return "LOW"


def _find_onset_dose_level(steps: list[str]) -> int | None:
    """Find dose_level of the first non-flat step (onset of effect).

    Steps[0] = control→dose_level 1, Steps[1] = dose_level 1→dose_level 2, etc.
    Returns the dose_level (1-based group index) where the effect first appears.
    Returns None if all flat.
    """
    for i, s in enumerate(steps):
        if s != "flat":
            return i + 1  # dose_level of the target group
    return None


def classify_dose_response(
    group_stats: list[dict],
    data_type: str = "continuous",
    test_code: str | None = None,
    specimen: str | None = None,
    domain: str | None = None,
) -> dict:
    """Classify dose-response pattern using equivalence-band noise tolerance.

    For continuous data, differences within the tiered equivalence fraction
    of pooled SD are treated as equivalent ("flat") rather than directional,
    preventing sampling noise from producing false non-monotonic classifications.

    The equivalence fraction is determined by endpoint variability tier:
      Tier 1 (CV < 10%): 0.5 SD — BW, brain, heart, RBC, total protein
      Tier 2 (CV 10-20%): 0.5 SD — liver, kidney, ALT, AST, glucose
      Tier 3 (CV > 20%): 0.75 SD — spleen, thymus, WBC, triglycerides

    Returns dict with:
      pattern: one of 'monotonic_increase', 'monotonic_decrease',
               'threshold_increase', 'threshold_decrease',
               'non_monotonic', 'flat', 'insufficient_data'
      confidence: 'HIGH', 'MODERATE', 'LOW', or None (categorical)
      onset_dose_level: int or None (threshold patterns only)
    """
    if not group_stats or len(group_stats) < 2:
        return {"pattern": "insufficient_data", "confidence": None, "onset_dose_level": None}

    if data_type == "continuous":
        means = [g.get("mean") for g in group_stats]
        if any(m is None for m in means) or len(means) < 2:
            return {"pattern": "insufficient_data", "confidence": None, "onset_dose_level": None}

        pooled = max(_pooled_sd(group_stats), _MIN_POOLED_SD)
        frac = _equivalence_fraction(test_code or "", specimen, domain)
        band = frac * pooled

        # Build step sequence: control → dose1 → dose2 → ...
        steps = []
        for i in range(len(means) - 1):
            steps.append(_step_direction(means[i], means[i + 1], band))

        pattern = _classify_from_steps(steps)
        confidence = _compute_confidence(steps, means, pooled)
        onset = _find_onset_dose_level(steps) if pattern.startswith("threshold") else None

        return {"pattern": pattern, "confidence": confidence, "onset_dose_level": onset}
    else:
        # Categorical/incidence data: use binomial SE-based tolerance
        # to absorb sampling noise in proportions
        values = [g.get("incidence", g.get("affected", 0)) for g in group_stats]
        ns = [g.get("n", 15) for g in group_stats]
        if len(values) < 2:
            return {"pattern": "insufficient_data", "confidence": None, "onset_dose_level": None}

        # Build step sequence using binomial-aware tolerance
        steps = []
        for i in range(len(values) - 1):
            n_pair = min(ns[i], ns[i + 1]) if ns[i] > 0 and ns[i + 1] > 0 else 15
            p_avg = (values[i] + values[i + 1]) / 2
            band = _binomial_tolerance(n_pair, p_avg)
            steps.append(_step_direction(values[i], values[i + 1], band))

        pattern = _classify_from_steps(steps)
        onset = _find_onset_dose_level(steps) if pattern.startswith("threshold") else None

        return {"pattern": pattern, "confidence": None, "onset_dose_level": onset}


def compute_max_fold_change(group_stats: list[dict], direction: str | None = None) -> float | None:
    """Direction-aligned fold change (treated/control) for the dose with largest deviation.

    When direction is provided, only considers deviations in the expected direction:
      - "down": only decreases (ratio < 1.0)
      - "up":   only increases (ratio > 1.0)
      - None:   largest absolute deviation (original behavior)

    Returns treated_mean / control_mean:
      > 1.0 for increases (e.g. 1.51×)
      < 1.0 for decreases (e.g. 0.66×)
    Returns None for insufficient data or zero control mean.
    """
    if not group_stats or len(group_stats) < 2:
        return None
    control_mean = group_stats[0].get("mean")
    if control_mean is None or abs(control_mean) < 1e-10:
        return None
    max_dev = 0.0
    best_ratio: float | None = None
    for gs in group_stats[1:]:
        treated_mean = gs.get("mean")
        if treated_mean is None:
            continue
        ratio = treated_mean / control_mean
        if direction == "down":
            deviation = max(0.0, 1.0 - ratio)
        elif direction == "up":
            deviation = max(0.0, ratio - 1.0)
        else:
            deviation = abs(ratio - 1.0)
        if deviation > max_dev:
            max_dev = deviation
            best_ratio = ratio
    if best_ratio is None or max_dev < 1e-10:
        return None
    return round(best_ratio, 2)


def determine_treatment_related(
    finding: dict,
    effect_relevance_threshold: float = 0.3,
) -> bool:
    """Determine if a finding is treatment-related.

    Criteria (pure function -- conservative approach):
    - Confident effect size (gLower/hLower > threshold) in pairwise comparison
    - AND significant trend (< 0.05)
    - OR: very strong effect (adverse severity + dose-response)

    The pairwise gate uses max_effect_lower (the maximum gLower or |hLower|
    across dose levels) instead of min_p_adj < 0.05. This is sample-size
    invariant: a large effect at N=3 is caught without needing p < 0.05.
    The trend gate stays p-based (different question: monotonic D-R).
    """
    severity = finding.get("severity", "normal")
    max_el = finding.get("max_effect_lower")
    trend_p = finding.get("trend_p")
    dose_response = finding.get("dose_response_pattern", "")

    # Strong evidence: confident effect size + trend
    if max_el is not None and max_el > effect_relevance_threshold and trend_p is not None and trend_p < 0.05:
        return True

    # Adverse with monotonic dose-response
    if severity == "adverse" and dose_response in ("monotonic_increase", "monotonic_decrease"):
        return True

    # Very significant pairwise only — with effect size floor for continuous
    # endpoints to prevent declaring trivially small effects treatment-related
    # purely on statistical power in well-powered studies (reviewer audit 2026-03).
    min_p = finding.get("min_p_adj")
    if min_p is not None and min_p < 0.01:
        from services.analysis.send_knowledge import get_effect_size as _get_es
        max_d = _get_es(finding)
        # Incidence endpoints have no effect size — p < 0.01 alone is sufficient
        if max_d is None:
            return True
        # Continuous: require minimum biological signal (|d| >= 0.2)
        if abs(max_d) >= 0.2:
            return True

    return False


# ---------------------------------------------------------------------------
# ECETOC per-finding adversity assessment
# ---------------------------------------------------------------------------
# Returns one of five categories:
#   not_treatment_related — no statistical evidence
#   tr_non_adverse        — treatment-related, small magnitude, no adversity markers
#   tr_adaptive           — treatment-related, context-dependent term (hypertrophy etc.)
#   tr_adverse            — treatment-related adverse (intrinsic adversity OR large magnitude)
#   equivocal             — mixed evidence, needs human review

_HISTOPATH_DOMAINS = {"MI", "MA", "TF"}

# Import the canonical Category 3 term list from adaptive_trees (single source of truth)
from services.analysis.adaptive_trees import (  # noqa: E402 — domain-critical shared constant
    _CONCURRENT_ADVERSE_TERMS,
)


def _get_max_avg_severity(finding: dict) -> float:
    """Extract the maximum avg_severity across dose groups from a finding.

    Returns 0.0 if severity data is not available. Used for severity-dependent
    adversity gating per STP/ESTP framework (Gopinath & Mowat 2019).

    NOTE on missing data: 0.0 means "no severity data available", NOT "grade 0".
    The caller treats 0.0 the same as grade 1-2 (-> equivocal). This is a
    conservative-in-safety choice: missing severity data produces equivocal
    rather than tr_adverse, prompting pathologist review. The alternative
    (assume moderate -> tr_adverse) would mask data quality issues. If this
    fallback fires frequently for a study, the data quality should be flagged.
    """
    # Direct avg_severity field (set by findings_mi.py)
    avg = finding.get("avg_severity")
    if avg is not None and avg > 0:
        return float(avg)
    # Try group_stats max (more granular)
    gs = finding.get("group_stats", [])
    max_sev = 0.0
    for g in gs:
        s = g.get("avg_severity")
        if s is not None and s > max_sev:
            max_sev = s
    return max_sev


def _has_concurrent_adverse_in_organ(finding: dict, specimen: str) -> bool:
    """Check if there are concurrent always_adverse findings in the same organ.

    Implements Gopinath & Mowat 2019 Category 3: non-adverse findings become
    adverse when co-occurring with necrosis/fibrosis/inflammation in same organ.

    NOTE: The primary implementation of Category 3 combination detection is in
    adaptive_trees.check_concurrent_adverse(), which has access to the full
    ConcurrentFindingIndex. This function is a secondary path that checks the
    finding's _histopath_context if populated by _classify_histopath().
    Returns False when context data is unavailable — the adaptive trees path
    handles the full combination check for context_dependent findings.
    """
    # Check _histopath_context populated by _classify_histopath
    context = finding.get("_histopath_context", [])
    if not context:
        return False
    specimen_upper = specimen.upper()
    for cf in context:
        cf_spec = (cf.get("specimen") or "").upper()
        if cf_spec != specimen_upper:
            continue
        cf_text = (cf.get("finding") or "").lower()
        if cf.get("treatment_related", False):
            for term in _CONCURRENT_ADVERSE_TERMS:
                if term in cf_text:
                    return True
    return False


def _score_treatment_relatedness(finding: dict, a3_score: float = 0.0, effect_threshold: float = 0.3) -> float:
    """A-factor scoring for treatment-relatedness (0-4 scale, may shift ±0.5 with A-3).

    A-1: Dose-response pattern (0-2 pts)
    A-2: Concordance via corroboration_status (0-1 pt)
    A-3: Historical control data — within_hcd=-0.5, outside_hcd=+0.5, no_hcd=0
    A-6: Statistics (0-1 pt)
    """
    score = 0.0

    # A-1: Dose-response pattern
    pattern = finding.get("dose_response_pattern", "")
    if pattern in ("monotonic_increase", "monotonic_decrease"):
        score += 2.0
    elif pattern.startswith("threshold"):
        score += 1.5
    elif pattern in ("non_monotonic", "u_shaped"):
        score += 0.5

    # A-2: Concordance — corroboration from other domains.
    # Gate: corroboration is an amplifier, not a promoter.  A-2 bonus applies
    # only when the finding has at least minimal evidence of a signal.
    # Zero-evidence corroboration (RELREC or syndrome) records the linkage
    # truthfully but doesn't move the classification needle.
    corr = finding.get("corroboration_status", "not_applicable")
    if corr == "corroborated":
        sev = finding.get("severity", "normal")
        p = finding.get("min_p_adj")
        tp = finding.get("trend_p")
        mel = finding.get("max_effect_lower")
        has_signal = (
            sev != "normal"
            or (mel is not None and mel > effect_threshold)
            or (p is not None and p < 0.10)
            or (tp is not None and tp < 0.10)
        )
        if has_signal:
            score += 1.0

    # A-3: Historical control data (HCD)
    score += a3_score

    # A-6: Statistical evidence — effect relevance OR p-value significance
    # Primary: confident effect size (gLower/hLower > 0.3) — sample-size-invariant
    # Fallback: p-value for endpoints without CI bounds
    min_p = finding.get("min_p_adj")
    trend_p = finding.get("trend_p")
    a6_mel = finding.get("max_effect_lower")
    if a6_mel is not None and a6_mel > effect_threshold:
        score += 1.0
    elif min_p is not None and min_p < 0.05:
        score += 1.0
    elif trend_p is not None and trend_p < 0.05:
        score += 0.5

    return score


def assess_finding(finding: dict, a3_score: float = 0.0, effect_threshold: float = 0.3) -> str:
    """ECETOC-style per-finding adversity assessment.

    Steps:
      0. Intrinsic adversity override (MI/MA/TF only)
      1. Treatment-relatedness via A-factor scoring (includes A-3 HCD)
      2. Adversity via B-factor logic (only if treatment-related)

    Returns one of: not_treatment_related, tr_non_adverse, tr_adaptive,
    tr_adverse, equivocal.
    """
    from services.analysis.send_knowledge import get_effect_size, DOMAIN_EFFECT_TYPE

    domain = finding.get("domain", "")
    finding_text = finding.get("finding", "")
    data_type = finding.get("data_type", "continuous")

    # -- Step 0: Intrinsic adversity override (histopath domains only) --
    if domain in _HISTOPATH_DOMAINS and finding_text:
        intrinsic = lookup_intrinsic_adversity(finding_text)
        if intrinsic == "always_adverse":
            # Any statistical signal → adverse; no signal → equivocal
            tr_score = _score_treatment_relatedness(finding, a3_score, effect_threshold)
            return "tr_adverse" if tr_score >= 1.0 else "equivocal"

    # -- Step 1: Treatment-relatedness (A-factors) --
    tr_score = _score_treatment_relatedness(finding, a3_score, effect_threshold)
    if tr_score < 1.0:
        return "not_treatment_related"

    # -- Step 2: Adversity (B-factors, only reached if treatment-related) --

    # SLA-05: Branch on data_type BEFORE B-factor gates
    if data_type != "continuous" and DOMAIN_EFFECT_TYPE.get(domain) != "effect_size":
        # Incidence domains (CL, DS) and MI fallback path:
        # No magnitude scalar exists for CL/DS. MI severity grade is not
        # comparable to Cohen's d for B-factor gating.
        if domain == "MI":
            # MI fallback (when adaptive trees in _classify_histopath don't match):
            # Default to equivocal — adversity depends on finding type, not just grade.
            return "equivocal"
        # CL/DS: Adversity from statistical evidence + dose-response pattern
        # Uses max_effect_lower (gLower/hLower) as primary, p-value as fallback
        min_p_adj = finding.get("min_p_adj")
        cl_mel = finding.get("max_effect_lower")
        pattern = finding.get("dose_response_pattern", "")
        has_stat_evidence = (
            (cl_mel is not None and cl_mel > effect_threshold)
            or (min_p_adj is not None and min_p_adj < 0.05)
        )
        if tr_score >= 1.0 and has_stat_evidence:
            if pattern in ("monotonic_increase", "monotonic_decrease", "threshold",
                           "threshold_increase", "threshold_decrease"):
                return "tr_adverse"
            return "equivocal"
        elif tr_score >= 1.0:
            return "equivocal"
        return "tr_non_adverse"

    # B-0: Dictionary override for likely_adverse / context_dependent
    d = get_effect_size(finding)
    abs_d = abs(d) if d is not None else 0.0

    if domain in _HISTOPATH_DOMAINS and finding_text:
        intrinsic = lookup_intrinsic_adversity(finding_text)
        if intrinsic == "likely_adverse":
            # STP/ESTP severity gate (Gopinath & Mowat 2019, Category 2/4):
            # Low-grade degenerative changes (atrophy, degeneration, hemorrhage)
            # at MISEV 1-2 may be non-adverse per "Test Substance-Related Lesions
            # of Low Severity, With No Functional Disturbance." Require avg_severity
            # >= 3 (moderate) for adverse classification; grade 1-2 -> equivocal.
            avg_sev = _get_max_avg_severity(finding)
            if avg_sev >= 3.0:
                return "tr_adverse"
            return "equivocal"
        if intrinsic == "context_dependent":
            # Phospholipidosis-aware vacuolation escalation (Gopinath & Mowat
            # 2019 pp.572-573; Kerlin 2016): vacuolation in liver/kidney/lung/
            # choroid plexus with cationic amphiphilic compound -> irreversible.
            # Check for co-occurring adverse MI findings in same organ as a
            # proxy for combination-driven adversity (Gopinath Category 3).
            if "vacuol" in finding_text.lower():
                specimen = (finding.get("specimen") or "").upper()
                if _has_concurrent_adverse_in_organ(finding, specimen):
                    return "tr_adverse"
            # Context-dependent: large magnitude escalates, otherwise adaptive
            if abs_d >= 1.5:
                return "tr_adverse"
            return "tr_adaptive"

    # B-1: Large magnitude → adverse (continuous only)
    # Thresholds (0.5 / 0.8 / 1.5) are intentionally shifted upward from
    # Cohen's canonical benchmarks (0.2 / 0.5 / 0.8). In preclinical tox,
    # biological variability and small group sizes inflate effect estimates —
    # higher thresholds reduce false-positive adverse calls. This is a
    # deliberate conservatism choice, not an oversight (reviewer audit 2026-03).
    if abs_d >= 1.5:
        return "tr_adverse"

    # B-2: Moderate magnitude + corroborated → adverse
    corr = finding.get("corroboration_status", "not_applicable")
    if abs_d >= 0.8 and corr == "corroborated":
        return "tr_adverse"

    # B-3: Small effect → non-adverse
    if abs_d < 0.5:
        return "tr_non_adverse"

    # B-4: Equivocal fallback (moderate effect, not corroborated)
    return "equivocal"


def assess_finding_safety_pharm(finding: dict) -> str:
    """NOEL-mode classification for safety pharmacology studies.

    No adversity judgment -- safety pharmacology endpoints are continuous
    pharmacological measurements that do not fit a toxic/non-toxic rubric
    (Pugsley 2020, Baird 2019, ICH S7A).

    Returns: not_treatment_related, equivocal, treatment_related,
             treatment_related_concerning.
    """
    # Treatment-relatedness: any statistical evidence of effect
    min_p = finding.get("min_p_adj")
    trend_p = finding.get("trend_p")
    has_sig_pairwise = min_p is not None and min_p < 0.05
    has_sig_trend = trend_p is not None and trend_p < 0.05
    # Bayesian posterior for small-N incidence (M1): P(p_treat > p_ctrl) >= 0.9
    has_bayesian_signal = (finding.get("bayesian_posterior") or 0) >= 0.9

    if has_sig_pairwise or has_sig_trend or has_bayesian_signal:
        # Concern threshold check (QTc >= 10ms, MAP >= 10mmHg, HR >= 10bpm)
        gs = finding.get("group_stats", [])
        ctrl = next((g for g in gs if g.get("dose_level") == 0), None)
        treated = [g for g in gs if g.get("dose_level", 0) > 0
                   and g.get("mean") is not None]
        if ctrl and ctrl.get("mean") is not None and treated:
            max_abs_diff = max(abs(g["mean"] - ctrl["mean"]) for g in treated)
            tc = (finding.get("test_code") or "").upper()
            threshold = _CONCERN_THRESHOLDS.get(tc)
            if threshold is not None and max_abs_diff >= threshold:
                return "treatment_related_concerning"
        return "treatment_related"

    # Equivocal gate: suggestive but non-significant evidence
    if _is_equivocal_safety_pharm(finding):
        return "equivocal"

    return "not_treatment_related"


# Dose-response patterns considered suggestive evidence for equivocal gate
_SUGGESTIVE_DR_PATTERNS = frozenset({
    "monotonic_increase", "monotonic_decrease",
    "threshold_increase", "threshold_decrease",
})


def _is_equivocal_safety_pharm(finding: dict) -> bool:
    """Equivocal gate for safety pharmacology findings.

    Returns True when a finding has suggestive but non-significant evidence
    of a treatment effect. Five independently testable criteria (E1-E5),
    any one sufficient.

    Ref: docs/_internal/research/peer-review-noel-classification.md
    """
    min_p = finding.get("min_p_adj")
    max_el = finding.get("max_effect_lower")
    pattern = finding.get("dose_response_pattern", "")
    data_type = finding.get("data_type", "continuous")
    domain = finding.get("domain", "")

    # E1: Sub-threshold statistics + confident effect size
    # p_adj < 0.10 with g_lower > 0.3 = underpowered, not absent
    if (min_p is not None and min_p < 0.10
            and max_el is not None and max_el > 0.3):
        return True

    # E2: Dose-response pattern + meaningful observed effect size
    # Monotonic/threshold D-R with |d| >= 0.5 (medium effect)
    if pattern in _SUGGESTIVE_DR_PATTERNS:
        from services.analysis.send_knowledge import get_effect_size
        d = get_effect_size(finding)
        if d is not None and abs(d) >= 0.5:
            return True

    # E3: Sub-threshold statistics + concern threshold exceeded
    # Wider p window (0.15) justified by independent magnitude evidence
    if min_p is not None and min_p < 0.15:
        gs = finding.get("group_stats", [])
        ctrl = next((g for g in gs if g.get("dose_level") == 0), None)
        treated = [g for g in gs if g.get("dose_level", 0) > 0
                   and g.get("mean") is not None]
        if ctrl and ctrl.get("mean") is not None and treated:
            tc = (finding.get("test_code") or "").upper()
            threshold = _CONCERN_THRESHOLDS.get(tc)
            if threshold is not None:
                max_diff = max(abs(g["mean"] - ctrl["mean"]) for g in treated)
                if max_diff >= threshold:
                    return True

    # E4: Incidence with suggestive dose-response (CL/DS domains)
    # No statistical gate -- within-subject exact tests have zero power
    # at N=4-8 for incidence endpoints (peer review section 6)
    if (data_type == "incidence"
            and domain in ("CL", "DS")
            and pattern in _SUGGESTIVE_DR_PATTERNS):
        return True

    # E5: Bayesian posterior in detection-limited incidence
    # 0.85 threshold (below 0.90 treatment_related gate); raised from 0.80
    # after Jeffreys prior migration to exclude N=2 single-animal noise
    if (finding.get("detection_limited") is True
            and (finding.get("bayesian_posterior") or 0) >= 0.85):
        return True

    return False


# Concern thresholds for safety pharmacology endpoints (ICH E14/S7B Q&A,
# working consensus). These are signal detection thresholds, not adversity
# gates -- they flag findings warranting attention in integrated assessment.
_CONCERN_THRESHOLDS: dict[str, float] = {
    "QTCBAG": 10.0, "QTCFAG": 10.0, "QTCVAG": 10.0, "QTCAG": 10.0,
    "QTCSAG": 10.0,
    "QTC": 10.0, "QTCB": 10.0, "QTCF": 10.0, "QTCVDW": 10.0,
    "MAP": 10.0, "SYSBP": 15.0, "DIABP": 10.0,
    "HR": 10.0,
}


# ---------------------------------------------------------------------------
# Tier 2: Context-aware assessment (organ thresholds + adaptive trees)
# ---------------------------------------------------------------------------

def _compute_pct_change(finding: dict) -> float | None:
    """Compute percentage change at highest dose vs control.

    Baseline selection (critical — avoids BW contamination):
    - ANCOVA-adjusted means when available (already BW-corrected)
    - Absolute means otherwise (never ratio-to-BW when BW is confounded)

    Returns signed percentage (positive = increase, negative = decrease).
    Returns None if data insufficient or control mean near zero.
    """
    # Prefer ANCOVA-adjusted means
    ancova = finding.get("ancova")
    if ancova and isinstance(ancova, dict):
        adj_means = ancova.get("adjusted_means")
        if adj_means and isinstance(adj_means, dict):
            # adjusted_means is {dose_label: value} — use first and last
            values = list(adj_means.values())
            if len(values) >= 2:
                ctrl = values[0]
                high = values[-1]
                if ctrl is not None and high is not None and abs(ctrl) > 1e-10:
                    return ((high - ctrl) / abs(ctrl)) * 100

    # Fallback: absolute group means
    gs = finding.get("group_stats", [])
    if len(gs) < 2:
        return None
    ctrl_mean = gs[0].get("mean")
    high_mean = gs[-1].get("mean")
    if ctrl_mean is None or high_mean is None or abs(ctrl_mean) < 1e-10:
        return None
    return ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100


def _assess_om_two_gate(
    finding: dict,
    species: str | None = None,
    a3_score: float = 0.0,
) -> str:
    """Two-gate OM classification: statistical gate × magnitude gate × A-3 HCD.

    Gate 1 (stats): min_p_adj < 0.05
    Gate 2 (magnitude): |pct_change| >= organ-specific adverse_floor_pct
    A-3 modifier: within_hcd can downgrade tr_adverse→equivocal;
                  outside_hcd can upgrade tr_non_adverse→equivocal.

    Returns finding_class and annotates finding with _assessment_detail.
    """
    specimen = finding.get("specimen", "")
    min_p = finding.get("min_p_adj")
    trend_p = finding.get("trend_p")

    pct = _compute_pct_change(finding)
    abs_pct = abs(pct) if pct is not None else None

    # Get organ-specific thresholds
    threshold = get_organ_threshold(specimen, species)
    if threshold:
        ceiling = threshold["variation_ceiling_pct"]
        floor = threshold["adverse_floor_pct"]
        strong = threshold["strong_adverse_pct"]
        method = f"organ_specific:{threshold['config_key']}"
    else:
        # Fallback to default
        ceiling = 5
        floor = get_default_om_threshold()
        strong = floor * 2
        method = "default"

    # Gate results
    stat_gate = min_p is not None and min_p < 0.05
    trend_sig = trend_p is not None and trend_p < 0.05
    marginal_stats = min_p is not None and 0.05 <= min_p < 0.10

    # Annotate assessment detail
    hcd_info = finding.get("_hcd_assessment", {})
    detail = {
        "method": method,
        "stat_gate": stat_gate,
        "pct_change": round(pct, 1) if pct is not None else None,
        "organ_threshold": floor,
        "ceiling": ceiling,
        "baseline": "ancova" if (finding.get("ancova") and
                                  isinstance(finding.get("ancova"), dict) and
                                  finding["ancova"].get("adjusted_means")) else "absolute",
        "hcd_result": hcd_info.get("result", "no_hcd"),
    }
    finding["_assessment_detail"] = detail

    # pct_change unavailable → fall through to base assess_finding
    if abs_pct is None:
        detail["mag_gate"] = None
        return assess_finding(finding)

    # Brain special case: any_significant policy (floor = 0)
    if floor == 0:
        detail["mag_gate"] = stat_gate
        if stat_gate:
            return "tr_adverse"
        if trend_sig:
            return "equivocal"
        return "not_treatment_related"

    within_hcd = a3_score < 0  # -0.5 = within HCD range
    outside_hcd = a3_score > 0  # +0.5 = outside HCD range

    # Strong adverse: always adverse if stats pass (HCD cannot override strong signal)
    if abs_pct >= strong and stat_gate:
        detail["mag_gate"] = True
        return "tr_adverse"

    # Two-gate classification
    mag_above_floor = abs_pct >= floor
    mag_above_ceiling = abs_pct >= ceiling
    detail["mag_gate"] = mag_above_floor

    if stat_gate and mag_above_floor:
        # Both gates pass → adverse, UNLESS within HCD (downgrade to equivocal)
        if within_hcd:
            detail["hcd_downgrade"] = True
            return "equivocal"
        return "tr_adverse"

    if stat_gate and mag_above_ceiling and not mag_above_floor:
        # Real, moderate → equivocal (needs corroboration/histopath)
        return "equivocal"

    if stat_gate and not mag_above_ceiling:
        # Real but trivially small → non-adverse
        # Exception: very significant + above half ceiling → equivocal
        if min_p is not None and min_p < 0.001 and abs_pct > ceiling / 2:
            return "equivocal"
        # Exception: outside HCD → escalate to equivocal (value exceeds normal variation)
        if outside_hcd:
            detail["hcd_upgrade"] = True
            return "equivocal"
        return "tr_non_adverse"

    if not stat_gate and mag_above_floor:
        # Meaningful magnitude, insufficient stats → equivocal
        # Trend tiebreaker
        if trend_sig:
            detail["trend_tiebreaker"] = True
        return "equivocal"

    if marginal_stats and mag_above_floor and trend_sig:
        # Marginal stats + meaningful magnitude + significant trend → equivocal
        return "equivocal"

    if not stat_gate and not mag_above_floor:
        # Neither gate passes
        if trend_sig and mag_above_ceiling:
            return "equivocal"
        return "not_treatment_related"

    # Fallback
    return "not_treatment_related"


def _compute_a3_for_om(
    finding: dict,
    strain: str | None,
    duration_days: int | None,
    *,
    route: str | None = None,
    vehicle: str | None = None,
    species: str | None = None,
) -> dict:
    """Compute A-3 (HCD) score for an OM finding.

    Compares the highest-dose group mean against the HCD reference range
    for the matching strain/sex/duration/organ. For dogs, uses age-based
    lookup instead of duration-category.
    """
    from services.analysis.hcd import assess_a3

    # Get highest-dose and control group means (absolute organ weight)
    gs = finding.get("group_stats", [])
    treated_mean = None
    control_mean = None
    if gs:
        treated_mean = gs[-1].get("mean")
        control_mean = gs[0].get("mean")  # dose_level 0 = vehicle control

    specimen = finding.get("specimen", "")
    sex = finding.get("sex", "")
    return assess_a3(treated_mean, specimen, sex, strain, duration_days,
                     route=route, vehicle=vehicle,
                     control_group_mean=control_mean,
                     species=species)


def _compute_a3_for_lb(
    finding: dict,
    species: str | None,
    strain: str | None,
    duration_days: int | None,
) -> dict:
    """Compute A-3 (HCD) score for an LB (clinical pathology) finding.

    Compares the highest-dose group mean against the LB HCD reference range
    for the matching species/sex/test_code/duration.
    """
    from services.analysis.hcd import assess_a3_lb

    # Get highest-dose and control group means
    gs = finding.get("group_stats", [])
    treated_mean = None
    control_mean = None
    if gs:
        treated_mean = gs[-1].get("mean")
        control_mean = gs[0].get("mean")  # dose_level 0 = vehicle control

    test_code = finding.get("test_code", "")
    sex = finding.get("sex", "")

    return assess_a3_lb(
        treated_mean, test_code, sex, species, strain, duration_days,
        control_group_mean=control_mean,
    )


def _compute_a3_for_bw(
    finding: dict,
    species: str | None,
    strain: str | None,
    duration_days: int | None,
) -> dict:
    """Compute A-3 (HCD) score for a BW (body weight) finding.

    Compares the highest-dose group mean against the BW HCD reference range
    for the matching strain/sex/duration.
    """
    from services.analysis.hcd import assess_a3_bw

    gs = finding.get("group_stats", [])
    treated_mean = None
    control_mean = None
    if gs:
        treated_mean = gs[-1].get("mean")
        control_mean = gs[0].get("mean")  # dose_level 0 = vehicle control

    sex = finding.get("sex", "")

    return assess_a3_bw(
        treated_mean, sex, strain, duration_days,
        control_group_mean=control_mean,
        species=species,
    )


def _evaluate_b6_for_finding(
    finding: dict,
    index,
    classification: str,
    species: str | None,
    strain: str | None,
) -> str:
    """Evaluate B-6 progression chains and potentially escalate classification.

    B-6 fires when a finding matches a documented progression chain AND meets
    firing conditions (obligate precursor or severity >= trigger). When B-6 fires
    on a finding not already tr_adverse, escalate to tr_adverse (the finding is a
    precursor to organ-level damage or neoplasia).

    Always annotates _b6_result on the finding, regardless of firing.
    """
    from services.analysis.progression_chains import evaluate_b6

    b6_result = evaluate_b6(finding, index=index, species=species, strain=strain)
    if b6_result is None:
        return classification

    # Annotate (always, even if B-6 doesn't fire)
    finding["_b6_result"] = b6_result.to_dict()

    # B-6 escalation: if fires AND not already tr_adverse, escalate
    if b6_result.fires and classification != "tr_adverse":
        # Only escalate treatment-related findings (A-score >= 1.0)
        if classification != "not_treatment_related":
            return "tr_adverse"

    return classification


def assess_finding_with_context(
    finding: dict,
    index,
    species: str | None = None,
    strain: str | None = None,
    duration_days: int | None = None,
    *,
    route: str | None = None,
    vehicle: str | None = None,
) -> str:
    """Context-aware ECETOC assessment using concurrent findings and organ thresholds.

    Dispatches to:
    1. Two-gate OM classification for organ weight findings
    2. Adaptive decision trees for context-dependent histopath findings
    3. Base assess_finding() for everything else

    After primary classification, evaluates B-6 progression chains for MI/MA/TF
    findings. B-6 can escalate non-adverse findings to tr_adverse when they
    match a documented progression chain.

    A-3 (HCD) is computed for OM, LB, and BW findings and annotated on the finding.

    Args:
        finding: The finding dict to assess.
        index: ConcurrentFindingIndex for cross-finding lookups.
        species: Study species string (from TS domain).
        strain: Study strain string (from TS domain).
        duration_days: Study dosing duration in days (from TS DOSDUR).
        route: Route of administration (from TS domain).
        vehicle: Treatment vehicle (from TS domain).
    """
    domain = finding.get("domain", "")

    # Compute A-3 for OM findings (absolute organ weight means vs HCD)
    a3_score = 0.0
    if domain == "OM":
        a3_result = _compute_a3_for_om(finding, strain, duration_days,
                                        route=route, vehicle=vehicle,
                                        species=species)
        a3_score = a3_result["score"]
        finding["_hcd_assessment"] = a3_result

    # Compute A-3 for LB findings (clinical pathology vs HCD reference ranges)
    if domain == "LB":
        a3_result = _compute_a3_for_lb(
            finding, species, strain, duration_days,
        )
        if a3_result["result"] != "no_hcd":
            finding["_hcd_assessment"] = a3_result

    # Compute A-3 for BW findings (body weight vs HCD reference ranges)
    if domain == "BW":
        a3_result = _compute_a3_for_bw(
            finding, species, strain, duration_days,
        )
        if a3_result["result"] != "no_hcd":
            a3_score = a3_result["score"]
            finding["_hcd_assessment"] = a3_result

    # OM domain → two-gate organ-specific classification
    if domain == "OM":
        return _assess_om_two_gate(finding, species, a3_score)

    # MI/MA/TF domain → primary classification then B-6 evaluation
    if domain in _HISTOPATH_DOMAINS:
        classification = _classify_histopath(finding, index, species)
        # B-6 progression chain evaluation (may escalate)
        classification = _evaluate_b6_for_finding(
            finding, index, classification, species, strain,
        )
        return classification

    # Everything else → base ECETOC assessment (a3_score may be non-zero for BW)
    return assess_finding(finding, a3_score)


def _classify_histopath(finding: dict, index, species: str | None) -> str:
    """Primary classification for MI/MA/TF findings (before B-6).

    context_dependent terms → adaptive trees.
    Everything else → base assess_finding().
    """
    finding_text = finding.get("finding", "")
    if finding_text:
        intrinsic = lookup_intrinsic_adversity(finding_text)
        if intrinsic == "context_dependent":
            from services.analysis.adaptive_trees import evaluate_adaptive_trees
            tree_result = evaluate_adaptive_trees(finding, index, species)
            if tree_result is not None:
                finding["_tree_result"] = tree_result.to_dict()
                return tree_result.classification
            # No tree matched → equivocal (never claim adaptive from magnitude alone)
            finding["_tree_result"] = {
                "tree_id": "none",
                "rationale": "No adaptive tree matched; context_dependent finding without biological context evidence",
            }
            # Fall through to base assess_finding but override tr_adaptive → equivocal
            base = assess_finding(finding)
            if base == "tr_adaptive":
                return "equivocal"
            return base

    return assess_finding(finding)
