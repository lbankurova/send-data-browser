"""Pure function wrappers for statistical tests."""

import numpy as np
from scipy import stats


def welch_t_test(group1: list | np.ndarray, group2: list | np.ndarray) -> dict:
    """Welch's t-test (unequal variance). Returns t-statistic and p-value."""
    a1 = np.array(group1, dtype=float)
    a2 = np.array(group2, dtype=float)
    a1 = a1[~np.isnan(a1)]
    a2 = a2[~np.isnan(a2)]
    if len(a1) < 2 or len(a2) < 2:
        return {"statistic": None, "p_value": None}
    t_stat, p_val = stats.ttest_ind(a1, a2, equal_var=False)
    return {"statistic": float(t_stat), "p_value": float(p_val)}


def mann_whitney_u(group1: list | np.ndarray, group2: list | np.ndarray) -> dict:
    """Mann-Whitney U test for non-parametric comparison."""
    a1 = np.array(group1, dtype=float)
    a2 = np.array(group2, dtype=float)
    a1 = a1[~np.isnan(a1)]
    a2 = a2[~np.isnan(a2)]
    if len(a1) < 1 or len(a2) < 1:
        return {"statistic": None, "p_value": None}
    try:
        u_stat, p_val = stats.mannwhitneyu(a1, a2, alternative="two-sided")
        return {"statistic": float(u_stat), "p_value": float(p_val)}
    except ValueError:
        return {"statistic": None, "p_value": None}


def fisher_exact_2x2(table: list[list[int]]) -> dict:
    """Fisher's exact test on 2x2 contingency table.
    table = [[a, b], [c, d]] where a=affected_treatment, b=unaffected_treatment,
    c=affected_control, d=unaffected_control.
    """
    try:
        odds_ratio, p_val = stats.fisher_exact(table)
        return {"odds_ratio": float(odds_ratio), "p_value": float(p_val)}
    except ValueError:
        return {"odds_ratio": None, "p_value": None}


def trend_test(groups: list[np.ndarray]) -> dict:
    """Jonckheere-Terpstra trend test for ordered independent groups.

    REM-29: Proper JT test replacing the Spearman correlation proxy.
    Tests H0: identical distributions across groups vs H1: ordered alternative
    (F_1 ≤ F_2 ≤ ... ≤ F_k, with at least one strict inequality).

    The JT statistic sums Mann-Whitney U counts across all ordered pairs of
    groups. P-value uses normal approximation (Lehmann, "Nonparametrics", 2006).

    Parameters:
        groups: List of arrays, one per dose level (ordered low to high).
    Returns dict with: statistic (standardized Z), p_value (two-sided).
    """
    cleaned = []
    for g in groups:
        arr = np.array(g, dtype=float)
        arr = arr[~np.isnan(arr)]
        cleaned.append(arr)

    k = len(cleaned)
    ns = [len(g) for g in cleaned]
    N = sum(ns)
    if k < 2 or N < 4:
        return {"statistic": None, "p_value": None}

    # JT statistic: J = Σ_{i<j} U_ij where U_ij counts pairs (a,b) with
    # a ∈ group_i, b ∈ group_j, b > a (ties count 0.5)
    J = 0.0
    for i in range(k):
        if ns[i] == 0:
            continue
        for j in range(i + 1, k):
            if ns[j] == 0:
                continue
            diff = cleaned[j][:, None] - cleaned[i][None, :]
            J += float(np.sum(diff > 0)) + 0.5 * float(np.sum(diff == 0))

    # H0 moments
    E_J = (N * N - sum(n * n for n in ns)) / 4.0
    Var_J = (N * N * (2 * N + 3) - sum(n * n * (2 * n + 3) for n in ns)) / 72.0

    if Var_J <= 0:
        return {"statistic": None, "p_value": None}

    Z = (J - E_J) / np.sqrt(Var_J)
    p_val = 2.0 * (1.0 - stats.norm.cdf(abs(Z)))

    return {"statistic": float(Z), "p_value": float(p_val)}


def trend_test_incidence(counts: list[int], totals: list[int]) -> dict:
    """Cochran-Armitage-like trend test for incidence data.
    Uses a chi-square trend approximation.
    counts = incidence per dose group, totals = n per dose group.
    """
    k = len(counts)
    if k < 2 or sum(totals) == 0:
        return {"statistic": None, "p_value": None}

    scores = list(range(k))  # dose levels as scores
    n = sum(totals)
    p_bar = sum(counts) / n

    if p_bar == 0 or p_bar == 1:
        return {"statistic": None, "p_value": None}

    # Numerator: sum(score_i * count_i) - (sum(score_i * n_i) * p_bar)
    num = sum(s * c for s, c in zip(scores, counts)) - p_bar * sum(s * t for s, t in zip(scores, totals))
    # Denominator
    denom_sq = p_bar * (1 - p_bar) * (
        sum(s * s * t for s, t in zip(scores, totals))
        - (sum(s * t for s, t in zip(scores, totals)) ** 2) / n
    )
    if denom_sq <= 0:
        return {"statistic": None, "p_value": None}

    z = num / np.sqrt(denom_sq)
    p_val = 2 * (1 - stats.norm.cdf(abs(z)))
    return {"statistic": float(z), "p_value": float(p_val)}


def cohens_d(group1: list | np.ndarray, group2: list | np.ndarray) -> float | None:
    """Hedges' g effect size (bias-corrected Cohen's d for small samples).

    REM-05: Applies Hedges' correction factor J = 1 - 3/(4*df - 1) to
    reduce upward bias in Cohen's d when sample sizes are small (< 20).
    The JSON field name is kept as 'cohens_d' for backwards compatibility.
    """
    a1 = np.array(group1, dtype=float)
    a2 = np.array(group2, dtype=float)
    a1 = a1[~np.isnan(a1)]
    a2 = a2[~np.isnan(a2)]
    if len(a1) < 2 or len(a2) < 2:
        return None
    pooled_std = np.sqrt(((len(a1) - 1) * np.var(a1, ddof=1) +
                          (len(a2) - 1) * np.var(a2, ddof=1)) /
                         (len(a1) + len(a2) - 2))
    if pooled_std == 0:
        return None
    d = float((np.mean(a1) - np.mean(a2)) / pooled_std)
    # Hedges' correction: J ≈ 1 - 3/(4*df - 1) where df = n1 + n2 - 2
    df = len(a1) + len(a2) - 2
    j = 1 - 3 / (4 * df - 1)
    return d * j


def spearman_correlation(x: list | np.ndarray, y: list | np.ndarray) -> dict:
    """Spearman rank correlation."""
    ax = np.array(x, dtype=float)
    ay = np.array(y, dtype=float)
    mask = ~(np.isnan(ax) | np.isnan(ay))
    ax, ay = ax[mask], ay[mask]
    if len(ax) < 3:
        return {"rho": None, "p_value": None}
    rho, p_val = stats.spearmanr(ax, ay)
    return {"rho": float(rho), "p_value": float(p_val)}


def severity_trend(dose_levels: list, avg_severities: list) -> dict:
    """Spearman correlation of avg_severity × dose level.

    Returns {rho, p_value}, or {None, None} if fewer than 3 non-null pairs
    or if severity is constant across doses.
    """
    dl = np.array(dose_levels, dtype=float)
    sev = np.array(avg_severities, dtype=float)
    mask = ~(np.isnan(dl) | np.isnan(sev))
    dl, sev = dl[mask], sev[mask]
    if len(dl) < 3:
        return {"rho": None, "p_value": None}
    # Constant input → correlation undefined
    if np.all(sev == sev[0]):
        return {"rho": None, "p_value": None}
    rho, p_val = stats.spearmanr(dl, sev)
    return {"rho": float(rho), "p_value": float(p_val)}


def dunnett_pairwise(
    control: np.ndarray,
    treated_groups: list[tuple[int, np.ndarray]],
) -> list[dict]:
    """Dunnett's test: each treated group vs control (FWER-controlled).

    REM-28: Replaces Welch's t-test + Bonferroni as the primary pairwise method.
    Dunnett's test inherently controls the family-wise error rate, so no
    additional Bonferroni correction is needed.

    Parameters:
        control: Control group values.
        treated_groups: List of (dose_level, values) tuples for treated groups.

    Returns list of dicts with: dose_level, p_value, p_value_adj, statistic, cohens_d.
    """
    ctrl = np.array(control, dtype=float)
    ctrl = ctrl[~np.isnan(ctrl)]
    if len(ctrl) < 2 or not treated_groups:
        return []

    # Prepare arrays and track which indices are valid
    dose_levels = []
    valid_arrays = []
    valid_indices = []
    all_effect_sizes = []

    for i, (dose_level, vals) in enumerate(treated_groups):
        arr = np.array(vals, dtype=float)
        arr = arr[~np.isnan(arr)]
        dose_levels.append(dose_level)
        all_effect_sizes.append(cohens_d(arr, ctrl))
        if len(arr) >= 2:
            valid_arrays.append(arr)
            valid_indices.append(i)

    # Run Dunnett's test on valid groups
    dunnett_p = [None] * len(treated_groups)
    if valid_arrays:
        try:
            result = stats.dunnett(*valid_arrays, control=ctrl)
            for j, idx in enumerate(valid_indices):
                dunnett_p[idx] = float(result.pvalue[j])
        except Exception:
            # Fallback: use Welch's + Bonferroni if Dunnett fails
            n_valid = len(valid_arrays)
            for j, idx in enumerate(valid_indices):
                t_result = welch_t_test(valid_arrays[j], ctrl)
                raw_p = t_result["p_value"]
                dunnett_p[idx] = min(raw_p * n_valid, 1.0) if raw_p is not None else None

    pairwise = []
    for i, dose_level in enumerate(dose_levels):
        p = dunnett_p[i]
        d = all_effect_sizes[i]
        pairwise.append({
            "dose_level": int(dose_level),
            "p_value": round(p, 6) if p is not None else None,
            # Dunnett's p-values are already FWER-controlled — p_value_adj = p_value
            "p_value_adj": round(p, 6) if p is not None else None,
            "statistic": None,  # Dunnett's doesn't provide per-comparison test statistics
            "cohens_d": round(d, 4) if d is not None else None,
        })
    return pairwise


def welch_pairwise(
    control: np.ndarray,
    treated_groups: list[tuple[int, np.ndarray]],
) -> list[dict]:
    """Welch's t-test for each treated group vs control.

    Returns raw (uncorrected) p-values for use with client-side multiplicity
    correction methods (e.g. Bonferroni). Each entry contains:
    dose_level, p_value_welch.
    """
    ctrl = np.array(control, dtype=float)
    ctrl = ctrl[~np.isnan(ctrl)]
    if len(ctrl) < 2 or not treated_groups:
        return []

    results = []
    for dose_level, vals in treated_groups:
        arr = np.array(vals, dtype=float)
        arr = arr[~np.isnan(arr)]
        t_result = welch_t_test(arr, ctrl)
        results.append({
            "dose_level": int(dose_level),
            "p_value_welch": round(t_result["p_value"], 6) if t_result["p_value"] is not None else None,
        })
    return results


def bonferroni_correct(p_values: list[float | None], n_tests: int | None = None) -> list[float | None]:
    """Apply Bonferroni correction to a list of p-values."""
    if n_tests is None:
        n_tests = len([p for p in p_values if p is not None])
    if n_tests == 0:
        return p_values
    return [min(p * n_tests, 1.0) if p is not None else None for p in p_values]
