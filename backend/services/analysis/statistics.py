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
    """Jonckheere-Terpstra-like trend test approximation.
    Uses Spearman correlation between dose level and values as a proxy.
    groups = list of arrays, one per dose level (ordered).
    """
    dose_levels = []
    values = []
    for level, group in enumerate(groups):
        arr = np.array(group, dtype=float)
        arr = arr[~np.isnan(arr)]
        for v in arr:
            dose_levels.append(level)
            values.append(v)
    if len(values) < 4:
        return {"statistic": None, "p_value": None}
    rho, p_val = stats.spearmanr(dose_levels, values)
    return {"statistic": float(rho), "p_value": float(p_val)}


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
    """Cohen's d effect size (treatment vs control)."""
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
    return float((np.mean(a1) - np.mean(a2)) / pooled_std)


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


def bonferroni_correct(p_values: list[float | None], n_tests: int | None = None) -> list[float | None]:
    """Apply Bonferroni correction to a list of p-values."""
    if n_tests is None:
        n_tests = len([p for p in p_values if p is not None])
    if n_tests == 0:
        return p_values
    return [min(p * n_tests, 1.0) if p is not None else None for p in p_values]
