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
            return "threshold"

    # Mixed directions
    return "non_monotonic"


def classify_dose_response(group_stats: list[dict], data_type: str = "continuous") -> str:
    """Classify dose-response pattern using equivalence-band noise tolerance.

    For continuous data, differences within 0.5× pooled SD are treated as
    equivalent ("flat") rather than directional, preventing sampling noise
    from producing false non-monotonic classifications.

    Returns one of: 'monotonic_increase', 'monotonic_decrease',
    'threshold', 'non_monotonic', 'flat', 'insufficient_data'.
    """
    if not group_stats or len(group_stats) < 2:
        return "insufficient_data"

    if data_type == "continuous":
        means = [g.get("mean") for g in group_stats]
        if any(m is None for m in means) or len(means) < 2:
            return "insufficient_data"

        pooled = max(_pooled_sd(group_stats), _MIN_POOLED_SD)
        band = _EQUIVALENCE_FRACTION * pooled

        # Build step sequence: control → dose1 → dose2 → ...
        steps = []
        for i in range(len(means) - 1):
            steps.append(_step_direction(means[i], means[i + 1], band))

        return _classify_from_steps(steps)
    else:
        # Categorical/incidence data: use original consecutive-diff approach
        # (no SD available; 1% control threshold is appropriate for proportions)
        values = [g.get("incidence", g.get("affected", 0)) for g in group_stats]
        if len(values) < 2:
            return "insufficient_data"

        control_val = values[0] if values[0] is not None else 0
        min_threshold = abs(control_val) * 0.01 if abs(control_val) > 1e-10 else 1e-10

        diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]

        if all(abs(d) <= min_threshold for d in diffs):
            return "flat"
        if all(d > min_threshold for d in diffs):
            return "monotonic_increase"
        if all(d < -min_threshold for d in diffs):
            return "monotonic_decrease"

        # Check for threshold: flat then increase/decrease
        if len(diffs) >= 2:
            first_nonzero = next(
                (i for i, d in enumerate(diffs) if abs(d) > min_threshold), None
            )
            if first_nonzero is not None and first_nonzero > 0:
                remaining = diffs[first_nonzero:]
                if all(d > min_threshold for d in remaining) or all(
                    d < -min_threshold for d in remaining
                ):
                    return "threshold"

        return "non_monotonic"


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
