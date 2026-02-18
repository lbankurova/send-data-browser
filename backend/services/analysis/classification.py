"""Pure rule functions for classifying findings severity, dose-response patterns,
and treatment-relatedness. Designed for later extraction to configurable scripts."""

import math


def classify_severity(finding: dict) -> str:
    """Classify a finding as 'adverse', 'warning', or 'normal'.

    Rules (pure function — swappable):
    - adverse: statistically significant (p_adj < 0.05) AND meaningful effect size
    - warning: borderline significance OR moderate effect
    - normal: not significant, small effect
    """
    min_p = finding.get("min_p_adj")
    max_d = finding.get("max_effect_size")
    trend_p = finding.get("trend_p")
    data_type = finding.get("data_type", "continuous")

    if data_type == "continuous":
        # Continuous endpoints: use p-value + effect size
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
        # Incidence endpoints: use p-value + direction
        # A significant DECREASE from control is not adverse — it may be
        # a background finding reduced by treatment (potential protective effect).
        direction = finding.get("direction", "none")
        if direction == "down":
            # Significant decrease: not adverse, but flag as noteworthy
            if min_p is not None and min_p < 0.05:
                return "warning"
            if trend_p is not None and trend_p < 0.05:
                return "warning"
            return "normal"
        # Direction is "up" or "none" — standard classification
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


def compute_max_fold_change(group_stats: list[dict]) -> float | None:
    """Max fold change magnitude (always >= 1) across treated groups vs control.

    Returns max(treated/control, control/treated) for the dose group with the
    largest deviation from control. Returns None for insufficient data or
    zero control mean.
    """
    if not group_stats or len(group_stats) < 2:
        return None
    control_mean = group_stats[0].get("mean")
    if control_mean is None or abs(control_mean) < 1e-10:
        return None
    max_fc = 1.0
    for gs in group_stats[1:]:
        treated_mean = gs.get("mean")
        if treated_mean is None:
            continue
        ratio = treated_mean / control_mean
        magnitude = max(ratio, 1.0 / ratio) if ratio > 0 else abs(ratio)
        if magnitude > max_fc:
            max_fc = magnitude
    return round(max_fc, 2) if max_fc > 1.0 else None


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
