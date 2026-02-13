"""Pure rule functions for classifying findings severity, dose-response patterns,
and treatment-relatedness. Designed for later extraction to configurable scripts."""


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


def classify_dose_response(group_stats: list[dict], data_type: str = "continuous") -> str:
    """Classify dose-response pattern.

    Returns one of: 'monotonic_increase', 'monotonic_decrease',
    'threshold', 'non_monotonic', 'flat', 'insufficient_data'.
    """
    if not group_stats or len(group_stats) < 2:
        return "insufficient_data"

    if data_type == "continuous":
        means = [g.get("mean") for g in group_stats]
        means = [m for m in means if m is not None]
    else:
        means = [g.get("incidence", g.get("affected", 0)) for g in group_stats]

    if len(means) < 2:
        return "insufficient_data"

    # Minimum magnitude threshold: 1% of control mean (prevents noise classification)
    control_mean = means[0] if means[0] is not None else 0
    min_threshold = abs(control_mean) * 0.01 if abs(control_mean) > 1e-10 else 1e-10

    diffs = [means[i + 1] - means[i] for i in range(len(means) - 1)]

    all_positive = all(d > min_threshold for d in diffs)
    all_negative = all(d < -min_threshold for d in diffs)
    all_zero = all(abs(d) <= min_threshold for d in diffs)

    if all_zero:
        return "flat"
    if all_positive:
        return "monotonic_increase"
    if all_negative:
        return "monotonic_decrease"

    # Check for threshold: flat then increase/decrease
    if len(diffs) >= 2:
        first_nonzero = next((i for i, d in enumerate(diffs) if abs(d) > min_threshold), None)
        if first_nonzero is not None and first_nonzero > 0:
            remaining = diffs[first_nonzero:]
            if all(d > min_threshold for d in remaining) or all(d < -min_threshold for d in remaining):
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
