"""Williams' step-down trend test with PAVA isotonic regression.

Implements Williams' test (Williams 1971, 1972) for dose-response trend assessment.
Complements the Jonckheere-Terpstra rank-based trend test — Williams' operates on
means and enforces monotonicity via isotonic regression, making it naturally resistant
to non-monotonic artifacts that can inflate JT significance.

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

# Published critical values for equal group sizes (one-sided α).
# Source: Williams (1971, 1972), Bretz (2006).
# Key: (k, df) → {alpha: critical_value}
# k = number of dose groups (excluding control)
# Values are for dose_index = k (highest dose); when group sizes are equal,
# the same critical value applies to all step-down levels (Williams 1972, Thm 2).
WILLIAMS_TABLE: dict[tuple[int, int], dict[float, float]] = {
    # k=2 (2 dose groups + control = 3 groups total)
    (2, 5):   {0.05: 2.13, 0.01: 3.02},
    (2, 6):   {0.05: 2.07, 0.01: 2.87},
    (2, 7):   {0.05: 2.03, 0.01: 2.76},
    (2, 8):   {0.05: 1.99, 0.01: 2.68},
    (2, 9):   {0.05: 1.97, 0.01: 2.62},
    (2, 10):  {0.05: 1.95, 0.01: 2.57},
    (2, 12):  {0.05: 1.92, 0.01: 2.50},
    (2, 15):  {0.05: 1.89, 0.01: 2.44},
    (2, 20):  {0.05: 1.87, 0.01: 2.46},
    (2, 30):  {0.05: 1.83, 0.01: 2.39},
    (2, 40):  {0.05: 1.81, 0.01: 2.35},
    (2, 60):  {0.05: 1.79, 0.01: 2.32},
    (2, 120): {0.05: 1.77, 0.01: 2.29},
    # k=3 (3 dose groups + control = 4 groups total)
    (3, 5):   {0.05: 2.18, 0.01: 3.08},
    (3, 6):   {0.05: 2.12, 0.01: 2.92},
    (3, 7):   {0.05: 2.07, 0.01: 2.81},
    (3, 8):   {0.05: 2.04, 0.01: 2.73},
    (3, 9):   {0.05: 2.01, 0.01: 2.67},
    (3, 10):  {0.05: 1.99, 0.01: 2.62},
    (3, 12):  {0.05: 1.96, 0.01: 2.55},
    (3, 15):  {0.05: 1.93, 0.01: 2.49},
    (3, 20):  {0.05: 1.93, 0.01: 2.54},
    (3, 30):  {0.05: 1.89, 0.01: 2.46},
    (3, 40):  {0.05: 1.87, 0.01: 2.42},
    (3, 60):  {0.05: 1.85, 0.01: 2.39},
    (3, 120): {0.05: 1.83, 0.01: 2.36},
    # k=4 (4 dose groups + control = 5 groups total)
    (4, 5):   {0.05: 2.22, 0.01: 3.13},
    (4, 6):   {0.05: 2.15, 0.01: 2.97},
    (4, 7):   {0.05: 2.10, 0.01: 2.86},
    (4, 8):   {0.05: 2.07, 0.01: 2.77},
    (4, 9):   {0.05: 2.04, 0.01: 2.71},
    (4, 10):  {0.05: 2.02, 0.01: 2.66},
    (4, 12):  {0.05: 1.99, 0.01: 2.59},
    (4, 15):  {0.05: 1.96, 0.01: 2.53},
    (4, 20):  {0.05: 1.96, 0.01: 2.57},
    (4, 30):  {0.05: 1.92, 0.01: 2.50},
    (4, 40):  {0.05: 1.90, 0.01: 2.46},
    (4, 60):  {0.05: 1.88, 0.01: 2.43},
    (4, 120): {0.05: 1.86, 0.01: 2.39},
    # k=5 (5 dose groups + control = 6 groups total)
    (5, 20):  {0.05: 1.98, 0.01: 2.60},
    (5, 30):  {0.05: 1.94, 0.01: 2.52},
    (5, 40):  {0.05: 1.92, 0.01: 2.48},
    (5, 60):  {0.05: 1.90, 0.01: 2.45},
    (5, 120): {0.05: 1.88, 0.01: 2.41},
}


def _lookup_williams_table(
    k: int,
    dose_index: int,
    df: int,
    alpha: float,
) -> Optional[float]:
    """Look up critical value from published tables.

    Returns None if not found (triggers Monte Carlo fallback).

    For equal group sizes, published critical values for dose_index = k (highest)
    also apply to lower dose indices in step-down (Williams 1972, Thm 2).
    """
    available_dfs = [d for (kk, d) in WILLIAMS_TABLE if kk == k]
    if not available_dfs:
        return None

    # Find closest df, rounding down for conservatism
    candidates = [d for d in available_dfs if d <= df]
    if not candidates:
        return None
    closest_df = max(candidates)

    entry = WILLIAMS_TABLE.get((k, closest_df))
    if entry is None:
        return None

    return entry.get(alpha)


def williams_critical_value(
    k: int,
    dose_index: int,
    df: int,
    ns: np.ndarray,
    alpha: float = 0.05,
    n_sim: int = 100_000,
) -> float:
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
        critical value (one-sided)
    """
    # Try published table first for equal-n
    if np.all(ns == ns[0]):
        table_cv = _lookup_williams_table(k, dose_index, df, alpha)
        if table_cv is not None:
            return table_cv

    # Monte Carlo simulation under H0
    rng = np.random.default_rng(42)
    ns_float = ns.astype(float)
    max_stats = np.zeros(n_sim)

    for sim in range(n_sim):
        # Simulate pooled variance (chi-squared scaling)
        s2 = rng.chisquare(df) / df
        s = np.sqrt(s2)

        # Group means under H0 (all equal = 0)
        z = rng.standard_normal(k + 1)
        x_bar = z / np.sqrt(ns_float)

        # Isotonic regression
        constrained = pava_increasing(x_bar, ns)

        # Test statistic for dose_index
        se = s * np.sqrt(1.0 / ns_float[0] + 1.0 / ns_float[dose_index])
        if se > 0:
            t_stat = (constrained[dose_index] - x_bar[0]) / se
        else:
            t_stat = 0.0
        max_stats[sim] = t_stat

    return float(np.quantile(max_stats, 1 - alpha))


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

        cv = williams_critical_value(k, i, df_pooled, ns, alpha)

        sig = t_williams > cv

        # Approximate p-value (conservative — uses t-distribution)
        p_approx = float(1.0 - sp_stats.t.cdf(t_williams, df_pooled))

        results.append(WilliamsResult(
            dose_label=dose_labels[i],
            dose_index=i,
            constrained_mean=float(constrained[i]),
            control_mean=float(means[0]),
            test_statistic=round(t_williams, 4),
            critical_value=round(cv, 4),
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
