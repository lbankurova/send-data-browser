"""Williams' step-down trend test with PAVA isotonic regression.

Implements Williams' test (Williams 1971, 1972) for dose-response trend assessment.
Complements the Jonckheere-Terpstra rank-based trend test — Williams' operates on
means and enforces monotonicity via isotonic regression, making it naturally resistant
to non-monotonic artifacts that can inflate JT significance.

Used in two contexts:
1. Pre-computation in findings_om.py (stored alongside Dunnett results)
2. Post-processing transform in parameterized_pipeline.py (Phase 3 settings)

Statistical validity note — ratio-normalized organ weights:
    When the user selects organ_weight_method="ratio-bw" or "ratio-brain", Williams'
    test runs on ratio-normalized data (organ_weight / body_weight). Williams' test
    assumes normal-theory comparisons with pooled within-group variance. Ratio data
    can exhibit heteroscedasticity and non-normality (especially ratio-to-BW when BW
    varies across dose groups due to treatment effects). Results on ratio-normalized
    organ weights should be interpreted with caution. For definitive inference on OM
    endpoints, ANCOVA with BW as covariate is preferred (available in the ANCOVA
    results when present).

References:
    Williams DA. Biometrics 1971;27(1):103–117.
    Williams DA. Biometrics 1972;28(2):519–531.
    Bretz F. Comput Stat Data Anal 2006;50(7):1735–1748.
    Barlow RE et al. Statistical Inference Under Order Restrictions. Wiley, 1972.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

import numpy as np
from scipy import stats as sp_stats


# ──────────────────────────────────────────────────────────────
# PAVA — Pool-Adjacent-Violators Algorithm
# ──────────────────────────────────────────────────────────────

def pava_increasing(
    values: np.ndarray,
    weights: np.ndarray,
) -> np.ndarray:
    """Isotonic regression under non-decreasing constraint.

    Uses the stack-based pool-adjacent-violators algorithm: elements are
    processed left-to-right, and when a violation is found, blocks are
    merged backward until monotonicity is restored.

    Args:
        values:  array of observed values (e.g., group means)
        weights: array of weights (e.g., group sizes)

    Returns:
        array of isotonically constrained values
    """
    n = len(values)
    if n <= 1:
        return values.astype(float).copy()

    # Stack-based approach: track blocks as (value, total_weight, count)
    block_values: list[float] = []
    block_weights: list[float] = []
    block_sizes: list[int] = []

    for i in range(n):
        block_values.append(float(values[i]))
        block_weights.append(float(weights[i]))
        block_sizes.append(1)

        # Merge backward while violation exists
        while len(block_values) >= 2 and block_values[-2] > block_values[-1]:
            w1, w2 = block_weights[-2], block_weights[-1]
            pooled = (w1 * block_values[-2] + w2 * block_values[-1]) / (w1 + w2)
            s = block_sizes[-2] + block_sizes[-1]
            block_values.pop()
            block_weights.pop()
            block_sizes.pop()
            block_values[-1] = pooled
            block_weights[-1] = w1 + w2
            block_sizes[-1] = s

    # Expand blocks to result array
    result = np.zeros(n)
    idx = 0
    for val, _, size in zip(block_values, block_weights, block_sizes):
        for _ in range(size):
            result[idx] = val
            idx += 1

    return result


def pava_decreasing(
    values: np.ndarray,
    weights: np.ndarray,
) -> np.ndarray:
    """Isotonic regression under non-increasing constraint."""
    return -pava_increasing(-values, weights)


# ──────────────────────────────────────────────────────────────
# Williams' Critical Value Tables + Simulation
# ──────────────────────────────────────────────────────────────

# Verified critical values for equal group sizes (one-sided alpha=0.05).
# Generated via Monte Carlo simulation (10M iterations, seed=42, n_per_group=10)
# using the PAVA-constrained Williams' t-bar distribution (scale-equivariant:
# CV is independent of n for equal group sizes). Cross-validated for
# monotonicity in both k and df dimensions.
# Generated: 2026-04-03, scripts/generate_williams_cv.py
# Audit trail: scripts/williams_cv_audit.json
# Previous values (pre-2026-04-03) had systematic upward bias (+0.01 to +0.12)
# from corrupted chimeric sourcing. See: docs/_internal/research/peer-reviews/williams-test-audit-review.md
#
# Key: (k, df) -> critical_value at alpha=0.05
# k = number of dose groups (excluding control)
# Values are for dose_index = k (highest dose); when group sizes are equal,
# the same critical value applies to all step-down levels (Williams 1972, Thm 2).
_WILLIAMS_CV_005: dict[tuple[int, int], float] = {
    # k=2 (2 dose groups + control = 3 groups total)
    (2,   5): 2.14,
    (2,   6): 2.06,
    (2,   7): 2.00,
    (2,   8): 1.96,
    (2,   9): 1.93,
    (2,  10): 1.91,
    (2,  12): 1.87,
    (2,  15): 1.84,
    (2,  20): 1.81,
    (2,  30): 1.77,
    (2,  40): 1.76,
    (2,  60): 1.74,
    (2, 120): 1.73,
    # k=3 (3 dose groups + control = 4 groups total)
    (3,   5): 2.19,
    (3,   6): 2.10,
    (3,   7): 2.04,
    (3,   8): 1.99,
    (3,   9): 1.96,
    (3,  10): 1.94,
    (3,  12): 1.90,
    (3,  15): 1.87,
    (3,  20): 1.83,
    (3,  30): 1.80,
    (3,  40): 1.79,
    (3,  60): 1.77,
    (3, 120): 1.75,
    # k=4 (4 dose groups + control = 5 groups total)
    (4,   5): 2.21,
    (4,   6): 2.12,
    (4,   7): 2.06,
    (4,   8): 2.01,
    (4,   9): 1.98,
    (4,  10): 1.96,
    (4,  12): 1.92,
    (4,  15): 1.88,
    (4,  20): 1.85,
    (4,  30): 1.81,
    (4,  40): 1.80,
    (4,  60): 1.78,
    (4, 120): 1.77,
    # k=5 (5 dose groups + control = 6 groups total)
    (5,   5): 2.22,
    (5,   6): 2.13,
    (5,   7): 2.07,
    (5,   8): 2.02,
    (5,   9): 1.99,
    (5,  10): 1.97,
    (5,  12): 1.93,
    (5,  15): 1.89,
    (5,  20): 1.86,
    (5,  30): 1.82,
    (5,  40): 1.80,
    (5,  60): 1.79,
    (5, 120): 1.77,
}


def _lookup_williams_table(
    k: int,
    dose_index: int,
    df: int,
    alpha: float,
) -> Optional[float]:
    """Look up critical value from published tables.

    Returns None if not found (triggers Monte Carlo fallback).
    Only alpha=0.05 is supported — alpha=0.01 values were removed due to
    confirmed corruption (errors up to -0.48).

    For equal group sizes, published critical values for dose_index = k (highest)
    also apply to lower dose indices in step-down (Williams 1972, Thm 2).
    """
    if alpha != 0.05:
        return None  # Only alpha=0.05 is validated

    available_dfs = [d for (kk, d) in _WILLIAMS_CV_005 if kk == k]
    if not available_dfs:
        return None

    # Find closest df, rounding down for conservatism
    candidates = [d for d in available_dfs if d <= df]
    if not candidates:
        return None
    closest_df = max(candidates)

    return _WILLIAMS_CV_005.get((k, closest_df))


def williams_critical_value(
    k: int,
    dose_index: int,
    df: int,
    ns: np.ndarray,
    alpha: float = 0.05,
    n_sim: int = 100_000,
) -> tuple[float, str]:
    """Compute Williams' critical value.

    First checks published tables (for common equal-n designs). Falls back
    to Monte Carlo simulation for unequal group sizes or unlisted df.

    Args:
        k:          number of dose groups (excluding control)
        dose_index: which dose group being tested (1..k)
        df:         pooled variance degrees of freedom
        ns:         array of group sizes [control, dose1, ..., dosek]
        alpha:      significance level
        n_sim:      number of Monte Carlo iterations for fallback

    Returns:
        (critical_value, source) where source is "table" or "mc"
    """
    # Try published table first for equal-n
    if np.all(ns == ns[0]):
        table_cv = _lookup_williams_table(k, dose_index, df, alpha)
        if table_cv is not None:
            return table_cv, "table"

    # Monte Carlo simulation under H0
    rng = np.random.default_rng(42)
    ns_sub = ns[:dose_index + 1].astype(float)
    max_stats = np.zeros(n_sim)

    for sim in range(n_sim):
        # Simulate pooled variance (chi-squared scaling)
        s2 = rng.chisquare(df) / df
        s = np.sqrt(s2)

        # Group means under H0 (all equal = 0) — restricted to groups 0..dose_index
        z = rng.standard_normal(dose_index + 1)
        x_bar = z / np.sqrt(ns_sub)

        # Isotonic regression on groups 0..dose_index only
        constrained = pava_increasing(x_bar, ns[:dose_index + 1])

        # Test statistic for dose_index
        se = s * np.sqrt(1.0 / ns_sub[0] + 1.0 / ns_sub[dose_index])
        if se > 0:
            t_stat = (constrained[dose_index] - x_bar[0]) / se
        else:
            t_stat = 0.0
        max_stats[sim] = t_stat

    return float(np.quantile(max_stats, 1 - alpha)), "mc"


# ──────────────────────────────────────────────────────────────
# Williams' Test — Core Implementation
# ──────────────────────────────────────────────────────────────

@dataclass
class WilliamsResult:
    """Result of Williams' test for a single dose group in step-down."""
    dose_label: str
    dose_index: int
    constrained_mean: float
    control_mean: float
    test_statistic: float
    critical_value: float
    critical_value_source: str  # "table" or "mc"
    p_value: float
    significant: bool
    alpha: float


@dataclass
class WilliamsTestOutput:
    """Complete output from Williams' step-down procedure."""
    direction: str                            # 'increase' or 'decrease'
    pooled_variance: float
    pooled_df: int
    constrained_means: list[float]
    step_down_results: list[WilliamsResult]
    minimum_effective_dose: Optional[str]
    minimum_effective_index: Optional[int]
    all_groups_tested: bool

    def to_dict(self) -> dict:
        """Serialize for JSON output."""
        d = asdict(self)
        return d


def williams_test(
    means: np.ndarray,
    sds: np.ndarray,
    ns: np.ndarray,
    dose_labels: list[str],
    direction: str = "auto",
    alpha: float = 0.05,
) -> WilliamsTestOutput:
    """Williams' step-down test for dose-response trend.

    Args:
        means:       array of group means, [control, low, ..., high]
        sds:         array of group standard deviations
        ns:          array of group sizes
        dose_labels: labels for each group
        direction:   'increase', 'decrease', or 'auto'
        alpha:       significance level

    Returns:
        WilliamsTestOutput with step-down results
    """
    k = len(means) - 1  # number of dose groups (excluding control)
    N = int(ns.sum())
    df_pooled = N - k - 1

    if k < 1 or df_pooled < 1:
        return WilliamsTestOutput(
            direction=direction if direction != "auto" else "increase",
            pooled_variance=0.0,
            pooled_df=max(df_pooled, 0),
            constrained_means=means.tolist(),
            step_down_results=[],
            minimum_effective_dose=None,
            minimum_effective_index=None,
            all_groups_tested=False,
        )

    # Pooled within-group variance
    ss_within = float(np.sum((ns - 1) * sds ** 2))
    s2_pooled = ss_within / df_pooled
    s_pooled = np.sqrt(s2_pooled)

    # Auto-detect direction from highest dose vs control
    if direction == "auto":
        direction = "increase" if means[-1] > means[0] else "decrease"

    # Isotonic regression
    if direction == "increase":
        constrained = pava_increasing(means.astype(float), ns.astype(float))
    else:
        constrained = pava_decreasing(means.astype(float), ns.astype(float))

    # Step-down procedure: start at highest dose
    results: list[WilliamsResult] = []
    for i in range(k, 0, -1):
        se = s_pooled * np.sqrt(1.0 / ns[0] + 1.0 / ns[i])
        if se <= 0:
            break

        if direction == "increase":
            t_williams = float((constrained[i] - means[0]) / se)
        else:
            t_williams = float((means[0] - constrained[i]) / se)

        cv, cv_source = williams_critical_value(k, i, df_pooled, ns, alpha)

        sig = t_williams > cv

        # Approximate p-value (uses standard t-distribution — conservative at
        # lower doses but liberal at dose_index=k where Williams distribution
        # is wider than standard t)
        p_approx = float(1.0 - sp_stats.t.cdf(t_williams, df_pooled))

        results.append(WilliamsResult(
            dose_label=dose_labels[i],
            dose_index=i,
            constrained_mean=float(constrained[i]),
            control_mean=float(means[0]),
            test_statistic=round(t_williams, 4),
            critical_value=round(cv, 4),
            critical_value_source=cv_source,
            p_value=round(max(p_approx, 0.0), 6),
            significant=sig,
            alpha=alpha,
        ))

        # Step-down: stop if this dose is not significant
        if not sig:
            break

    # Minimum effective dose
    significant_results = [r for r in results if r.significant]
    if significant_results:
        med = significant_results[-1]  # lowest dose that was significant
        med_label = med.dose_label
        med_index = med.dose_index
    else:
        med_label = None
        med_index = None

    return WilliamsTestOutput(
        direction=direction,
        pooled_variance=round(s2_pooled, 6),
        pooled_df=df_pooled,
        constrained_means=[round(v, 6) for v in constrained.tolist()],
        step_down_results=results,
        minimum_effective_dose=med_label,
        minimum_effective_index=med_index,
        all_groups_tested=(len(results) == k),
    )


# ──────────────────────────────────────────────────────────────
# Convenience Wrapper for SEND Browser Integration
# ──────────────────────────────────────────────────────────────

def williams_from_dose_groups(
    dose_groups: list[dict],
    alpha: float = 0.05,
) -> WilliamsTestOutput | None:
    """Run Williams' test from SEND Browser dose group summary data.

    Args:
        dose_groups: list of dicts with keys: label, mean, sd, n
        alpha: significance level

    Returns:
        WilliamsTestOutput, or None if insufficient data.
    """
    # Need at least 2 groups (control + 1 treated)
    valid = [g for g in dose_groups if g.get("mean") is not None and g.get("n", 0) >= 2]
    if len(valid) < 2:
        return None

    means = np.array([g["mean"] for g in valid])
    sds = np.array([g.get("sd", 0) or 0 for g in valid])
    ns = np.array([g["n"] for g in valid])
    labels = [str(g.get("label", g.get("dose_level", i))) for i, g in enumerate(valid)]

    return williams_test(means, sds, ns, labels, direction="auto", alpha=alpha)


def williams_from_group_stats(
    group_stats: list[dict],
    alpha: float = 0.05,
) -> WilliamsTestOutput | None:
    """Run Williams' test from findings_om group_stats format.

    Args:
        group_stats: list of dicts with keys: dose_level, mean, sd, n
        alpha: significance level

    Returns:
        WilliamsTestOutput, or None if insufficient data.
    """
    valid = [g for g in group_stats if g.get("mean") is not None and (g.get("n") or 0) >= 2]
    if len(valid) < 2:
        return None

    # Sort by dose_level to ensure control is first
    valid = sorted(valid, key=lambda g: g["dose_level"])

    dose_groups = [
        {"label": str(g["dose_level"]), "mean": g["mean"], "sd": g.get("sd") or 0, "n": g["n"]}
        for g in valid
    ]
    return williams_from_dose_groups(dose_groups, alpha=alpha)
