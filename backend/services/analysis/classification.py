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
    min_p = finding.get("min_p_adj")
    max_d = finding.get("max_effect_size")
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
    """Compute pooled SD across treated groups (exclude control at index 0).

    Uses per-group SDs when available; falls back to SD of group means.
    """
    treated = group_stats[1:]  # skip control
    sds = [g["sd"] for g in treated if g.get("sd") is not None and g["sd"] > 0]
    if sds:
        return math.sqrt(sum(s ** 2 for s in sds) / len(sds))
    # Fallback: SD of treated group means
    means = [g["mean"] for g in treated if g.get("mean") is not None]
    if len(means) >= 2:
        avg = sum(means) / len(means)
        return math.sqrt(sum((m - avg) ** 2 for m in means) / (len(means) - 1))
    return 0.0


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


def classify_dose_response(group_stats: list[dict], data_type: str = "continuous") -> dict:
    """Classify dose-response pattern using equivalence-band noise tolerance.

    For continuous data, differences within 0.5× pooled SD are treated as
    equivalent ("flat") rather than directional, preventing sampling noise
    from producing false non-monotonic classifications.

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
        band = _EQUIVALENCE_FRACTION * pooled

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


def determine_treatment_related(finding: dict) -> bool:
    """Determine if a finding is treatment-related.

    Criteria (pure function — conservative approach):
    - Significant p-value (< 0.05) in pairwise comparison
    - AND significant trend (< 0.05)
    - OR: very strong effect (adverse severity + dose-response)
    """
    severity = finding.get("severity", "normal")
    min_p = finding.get("min_p_adj")
    trend_p = finding.get("trend_p")
    dose_response = finding.get("dose_response_pattern", "")

    # Strong evidence: both pairwise and trend significant
    if min_p is not None and min_p < 0.05 and trend_p is not None and trend_p < 0.05:
        return True

    # Adverse with monotonic dose-response
    if severity == "adverse" and dose_response in ("monotonic_increase", "monotonic_decrease"):
        return True

    # Very significant pairwise only
    if min_p is not None and min_p < 0.01:
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


def _score_treatment_relatedness(finding: dict, a3_score: float = 0.0) -> float:
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
    elif pattern == "non_monotonic":
        score += 0.5

    # A-2: Concordance — corroboration from other domains
    corr = finding.get("corroboration_status", "not_applicable")
    if corr == "corroborated":
        score += 1.0

    # A-3: Historical control data (HCD)
    score += a3_score

    # A-6: Statistical significance
    min_p = finding.get("min_p_adj")
    trend_p = finding.get("trend_p")
    if min_p is not None and min_p < 0.05:
        score += 1.0
    elif trend_p is not None and trend_p < 0.05:
        score += 0.5

    return score


def assess_finding(finding: dict, a3_score: float = 0.0) -> str:
    """ECETOC-style per-finding adversity assessment.

    Steps:
      0. Intrinsic adversity override (MI/MA/TF only)
      1. Treatment-relatedness via A-factor scoring (includes A-3 HCD)
      2. Adversity via B-factor logic (only if treatment-related)

    Returns one of: not_treatment_related, tr_non_adverse, tr_adaptive,
    tr_adverse, equivocal.
    """
    domain = finding.get("domain", "")
    finding_text = finding.get("finding", "")
    max_d = finding.get("max_effect_size")
    abs_d = abs(max_d) if max_d is not None else 0.0

    # -- Step 0: Intrinsic adversity override (histopath domains only) --
    if domain in _HISTOPATH_DOMAINS and finding_text:
        intrinsic = lookup_intrinsic_adversity(finding_text)
        if intrinsic == "always_adverse":
            # Any statistical signal → adverse; no signal → equivocal
            tr_score = _score_treatment_relatedness(finding, a3_score)
            return "tr_adverse" if tr_score >= 1.0 else "equivocal"

    # -- Step 1: Treatment-relatedness (A-factors) --
    tr_score = _score_treatment_relatedness(finding, a3_score)
    if tr_score < 1.0:
        return "not_treatment_related"

    # -- Step 2: Adversity (B-factors, only reached if treatment-related) --

    # B-0: Dictionary override for likely_adverse
    if domain in _HISTOPATH_DOMAINS and finding_text:
        intrinsic = lookup_intrinsic_adversity(finding_text)
        if intrinsic == "likely_adverse":
            return "tr_adverse"
        if intrinsic == "context_dependent":
            # Context-dependent: large magnitude escalates, otherwise adaptive
            if abs_d >= 1.5:
                return "tr_adverse"
            return "tr_adaptive"

    # B-1: Large magnitude → adverse
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
) -> dict:
    """Compute A-3 (HCD) score for an OM finding.

    Compares the highest-dose group mean against the HCD reference range
    for the matching strain/sex/duration/organ.
    """
    from services.analysis.hcd import assess_a3

    # Get highest-dose group mean (absolute organ weight)
    gs = finding.get("group_stats", [])
    treated_mean = None
    if gs:
        treated_mean = gs[-1].get("mean")

    specimen = finding.get("specimen", "")
    sex = finding.get("sex", "")
    return assess_a3(treated_mean, specimen, sex, strain, duration_days,
                     route=route, vehicle=vehicle)


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

    A-3 (HCD) is computed for OM findings and annotated on the finding.

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
                                        route=route, vehicle=vehicle)
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

    # Everything else → base ECETOC assessment
    return assess_finding(finding)


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
