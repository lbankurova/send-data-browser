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

Critical values:
    Sourced from williams_tables.py which contains digitized tables from the original
    Williams (1971, 1972) papers.  The 1972 extrapolation formula with β coefficients
    handles unequal control replication (w = c/r):
        t̄_{i,α}(w) ≈ t̄_{i,α}(1) − 10⁻² · β · (1 − 1/√w)

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

from williams_tables import lookup_1971, lookup_1972


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
# Williams' Critical Value Lookup
# ──────────────────────────────────────────────────────────────

# Map one-sided α to the 1972 table α values.
# The 1972 tables cover α = 0.050, 0.025, 0.010, 0.005.
_ALPHA_1972 = {0.050: 0.050, 0.025: 0.025, 0.010: 0.010, 0.005: 0.005}

# The 1971 tables cover only α = 0.05 and 0.01.
_ALPHA_1971 = {0.05, 0.01}

# Dose levels available in the 1972 tables (i = 7, 9 are interpolated).
_DOSE_LEVELS_1972 = {2, 3, 4, 5, 6, 8, 10}


def _get_critical_value(
    dose_index: int,
    df: int,
    ns: np.ndarray,
    alpha: float,
) -> float:
    """Look up Williams' critical value from published tables.

    For the step-down procedure at dose level i, the critical value is
    t̄_{i,α} — based on the null distribution with i dose levels
    (Williams 1971, Section 5; 1972, Section 6).

    Strategy:
        - i = 1: Student's t (one-sided), no isotonic component.
        - Equal group sizes (w = 1) and α ∈ {0.05, 0.01}:
          lookup_1971(i, df, alpha).  Covers k = 1..10.
        - Otherwise (w > 1 or α ∈ {0.025, 0.005}):
          lookup_1972 with the extrapolation formula.
          Covers i = 2..10, α ∈ {0.050, 0.025, 0.010, 0.005}.
        - For i = 7 or 9 (not directly tabled in 1972): linear
          interpolation between the adjacent tabled dose levels.

    Args:
        dose_index: dose level being tested in the step-down (1..k).
        df:         error degrees of freedom.
        ns:         group sizes [control, dose1, ..., dosek].
        alpha:      one-sided significance level.

    Returns:
        Critical value t̄_{i,α}(w).
    """
    i = dose_index

    # ── i = 1: reduces to Student's t ──
    if i == 1:
        return float(sp_stats.t.ppf(1 - alpha, df))

    # ── Determine control-to-dose replication ratio ──
    n_control = float(ns[0])
    n_dose = float(ns[i])
    w = n_control / n_dose  # w = c/r

    # ── Equal replication + α available in 1971 tables ──
    if w <= 1.0 and alpha in _ALPHA_1971 and i <= 10:
        return lookup_1971(i, df, alpha)

    # ── Use 1972 tables (with extrapolation for w > 1) ──
    alpha_1972 = _ALPHA_1972.get(alpha)
    if alpha_1972 is not None and i <= 10:
        if i in _DOSE_LEVELS_1972:
            return lookup_1972(i, df, alpha_1972, w)

        # ── i = 7 or 9: interpolate between adjacent tabled values ──
        if i == 7:
            cv6 = lookup_1972(6, df, alpha_1972, w)
            cv8 = lookup_1972(8, df, alpha_1972, w)
            return round((cv6 + cv8) / 2, 3)
        if i == 9:
            cv8 = lookup_1972(8, df, alpha_1972, w)
            cv10 = lookup_1972(10, df, alpha_1972, w)
            return round((cv8 + cv10) / 2, 3)

        # i > 10: use i = 10 (critical values plateau; Williams 1971, §3)
        return lookup_1972(10, df, alpha_1972, w)

    # ── Fallback: Student's t (conservative) ──
    return float(sp_stats.t.ppf(1 - alpha, df))


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

    # Isotonic regression on dose groups only (indices 1..k).
    # Control (index 0) is NOT included — it enters only via the test
    # statistic as X₀ (unconstrained).  This matches the analytical ML
    # formula in Williams (1972):
    #   M̄ᵢ = max_{1≤u≤i} min_{i≤v≤k} Σ rⱼXⱼ / Σ rⱼ   (increase)
    #   m̂ᵢ = min_{1≤u≤i} max_{i≤v≤k} Σ rⱼXⱼ / Σ rⱼ   (decrease)
    dose_means = means[1:].astype(float)
    dose_ns = ns[1:].astype(float)
    if direction == "increase":
        dose_constrained = pava_increasing(dose_means, dose_ns)
    else:
        dose_constrained = pava_decreasing(dose_means, dose_ns)
    # Full array: control unchanged, doses constrained
    constrained = np.concatenate([[float(means[0])], dose_constrained])

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

        cv = _get_critical_value(i, df_pooled, ns, alpha)

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
