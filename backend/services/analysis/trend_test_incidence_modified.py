"""
Cochran-Armitage trend test for incidence (proportion) data.

Modifications informed by:
  - Zhou et al. (2017) Ann Hum Genet — location vs dispersion decomposition
  - Tang et al. (2006) J Stat Comput Simul — exact conditional/unconditional tests
  - Buonaccorsi et al. (2014) Stat Methods Med Res — power, modified CA test
  - Young (1985) Risk Assessment and Management — score sensitivity, thresholds
  - SAS PROC FREQ, R prop.trend.test, statsmodels documentation
"""

import numpy as np
from scipy import stats


def trend_test_incidence(
    counts,
    totals,
    scores=None,
    alternative="two-sided",
    variance="binomial",
    modified=False,
):
    """Cochran-Armitage trend test for incidence data.

    Parameters
    ----------
    counts : list[int]
        Number of events (successes) per dose group.
    totals : list[int]
        Number of subjects per dose group.
    scores : list[float] | None
        Dose-level scores.  None → 0, 1, …, k-1 (additive model).
        Young (1985) shows that score choice can shift p-values by
        orders of magnitude — pass actual doses or log-doses when
        appropriate.  The test is invariant to affine transformations
        of scores (a + b·d_i), so 0-based and 1-based give identical Z.
    alternative : str
        "two-sided" (default), "increasing", or "decreasing".
        • FDA/NTP toxicology convention → "increasing"
        • Genetic GWAS convention  → "two-sided"
    variance : str
        Denominator convention.
        • "binomial" (default) — divides by N; matches SAS PROC FREQ,
          original Cochran (1954) / Armitage (1955).
        • "hypergeometric"       — divides by N-1; matches statsmodels
          and R's prop.trend.test.
        The ratio between the two Z² values is exactly N/(N-1).
    modified : bool
        If True, additionally compute the *modified* CA statistic
        Tₘ = U / s  (Buonaccorsi et al. §2.2; Zheng & Gastwirth 2006),
        where s² estimates V(U) *without* invoking H₀.
        This can have higher power in unbalanced designs.

    Returns
    -------
    dict with keys:
        "z_statistic"       — Z (signed); positive = increasing trend
        "chi2_statistic"    — Z²; comparable to R's prop.trend.test output
        "p_value"           — based on `alternative`
        "alternative"       — echo of the alternative used
        "variance_method"   — "binomial" or "hypergeometric"
        "scores"            — scores actually used
        "p_bar"             — pooled proportion
        "n_groups"          — number of dose groups
        "z_modified"        — Z from modified test (if modified=True)
        "p_value_modified"  — p-value from modified test (if modified=True)
    """

    counts = np.asarray(counts, dtype=np.float64)
    totals = np.asarray(totals, dtype=np.float64)

    if counts.ndim != 1 or totals.ndim != 1:
        raise ValueError("counts and totals must be 1-D sequences.")
    if len(counts) != len(totals):
        raise ValueError("counts and totals must have the same length.")

    k = len(counts)
    if k < 2:
        raise ValueError(f"Need at least 2 groups, got {k}.")
    if np.any(counts < 0) or np.any(totals < 0):
        raise ValueError("counts and totals must be non-negative.")
    if np.any(counts > totals):
        raise ValueError("Each count must be <= the corresponding total.")

    n = totals.sum()
    if n == 0:
        raise ValueError("Total sample size is 0.")

    # ---- scores ----------------------------------------------------------
    if scores is not None:
        d = np.asarray(scores, dtype=np.float64)
        if len(d) != k:
            raise ValueError(
                f"scores length ({len(d)}) != number of groups ({k})."
            )
    else:
        d = np.arange(k, dtype=np.float64)

    # ---- pooled proportion -----------------------------------------------
    p_bar = counts.sum() / n
    q_bar = 1.0 - p_bar

    if p_bar == 0.0 or p_bar == 1.0:
        return _degenerate_result(d, p_bar, k, alternative, variance)

    # ---- numerator: Σ dᵢ·countᵢ − p̄·Σ dᵢ·nᵢ ----------------------------
    num = d @ counts - p_bar * (d @ totals)

    # ---- denominator: centered form for numerical stability --------------
    d_bar = (d @ totals) / n
    deviations = d - d_bar
    weighted_score_var = totals @ (deviations ** 2)  # Sxx

    if weighted_score_var <= 0.0:
        return _degenerate_result(d, p_bar, k, alternative, variance)

    # ---- denominator² under H₀ -------------------------------------------
    if variance == "binomial":
        denom_sq = p_bar * q_bar * weighted_score_var
    elif variance == "hypergeometric":
        denom_sq = p_bar * q_bar * weighted_score_var * n / (n - 1)
    else:
        raise ValueError(
            f"variance must be 'binomial' or 'hypergeometric', got '{variance}'."
        )

    z = num / np.sqrt(denom_sq)
    chi2 = z ** 2
    p_val = _p_from_z(z, alternative)

    result = {
        "z_statistic": float(z),
        "chi2_statistic": float(chi2),
        "p_value": float(p_val),
        "alternative": alternative,
        "variance_method": variance,
        "scores": d.tolist(),
        "p_bar": float(p_bar),
        "n_groups": k,
    }

    if modified:
        z_mod, p_mod = _modified_test(counts, totals, d, num, alternative)
        result["z_modified"] = float(z_mod)
        result["p_value_modified"] = float(p_mod)

    return result


def threshold_test(counts, totals, alpha=0.05, adjust_alpha=True):
    """Williams-type sequential threshold test for proportions (Young 1985).

    Starting from the lowest dose, each group is compared against the
    pooled "control" (all previously non-significant groups).  When a
    group first shows significance, it becomes the Effect Level (EL)
    and all prior groups are declared NOELs.

    Parameters
    ----------
    counts, totals : lists of ints
        Group 0 = control, groups 1..k-1 = ascending doses.
    alpha : float
        Per-comparison significance level before adjustment.
    adjust_alpha : bool
        If True, use Šidák correction for k-1 comparisons.

    Returns
    -------
    list[dict]
        One entry per comparison with keys: test, control_count,
        control_total, treated_count, treated_total, z, p,
        significant, noel_groups, effect_group.
    """
    counts = list(counts)
    totals = list(totals)
    k = len(counts)

    if k < 2:
        raise ValueError("Need at least 2 groups (control + 1 dose).")

    n_comparisons = k - 1
    if adjust_alpha:
        alpha_adj = 1.0 - (1.0 - alpha) ** (1.0 / n_comparisons)
    else:
        alpha_adj = alpha

    results = []
    pool_count = counts[0]
    pool_total = totals[0]

    for i in range(1, k):
        res = trend_test_incidence(
            [pool_count, counts[i]],
            [pool_total, totals[i]],
            scores=[0, 1],
            alternative="increasing",
        )

        sig = res["p_value"] <= alpha_adj

        entry = {
            "test": f"groups {list(range(i))} vs group {i}",
            "control_count": pool_count,
            "control_total": pool_total,
            "control_pct": pool_count / pool_total * 100 if pool_total else 0,
            "treated_count": counts[i],
            "treated_total": totals[i],
            "treated_pct": counts[i] / totals[i] * 100 if totals[i] else 0,
            "z": res["z_statistic"],
            "p": res["p_value"],
            "alpha_adj": alpha_adj,
            "significant": sig,
        }

        if sig:
            entry["effect_group"] = i
            entry["noel_groups"] = list(range(i))
            results.append(entry)
            break

        pool_count += counts[i]
        pool_total += totals[i]
        results.append(entry)
    else:
        results[-1]["noel_groups"] = list(range(k))
        results[-1]["effect_group"] = None

    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _modified_test(counts, totals, d, numerator, alternative):
    """Modified CA test Tₘ = U / s (Buonaccorsi et al. 2014, eq. 15)."""
    n = totals.sum()
    d_bar = (d @ totals) / n
    deviations = d - d_bar

    p_hat = np.divide(
        counts, totals, out=np.zeros_like(counts), where=totals > 0
    )
    group_var = p_hat * (1.0 - p_hat)
    sigma2_m = totals @ (deviations ** 2 * group_var)

    if sigma2_m <= 0.0:
        return (0.0, 1.0)

    z_m = numerator / np.sqrt(sigma2_m)
    p_m = _p_from_z(z_m, alternative)
    return (z_m, p_m)


def _p_from_z(z, alternative):
    """Compute p-value from Z for the given alternative."""
    if alternative == "two-sided":
        return float(2.0 * stats.norm.sf(abs(z)))
    elif alternative == "increasing":
        return float(stats.norm.sf(z))
    elif alternative == "decreasing":
        return float(stats.norm.cdf(z))
    raise ValueError(
        f"alternative must be 'two-sided', 'increasing', or 'decreasing', "
        f"got '{alternative}'."
    )


def _degenerate_result(scores, p_bar, k, alternative, variance):
    """Return a well-defined result for degenerate inputs."""
    return {
        "z_statistic": 0.0,
        "chi2_statistic": 0.0,
        "p_value": 1.0,
        "alternative": alternative,
        "variance_method": variance,
        "scores": scores.tolist(),
        "p_bar": float(p_bar),
        "n_groups": k,
    }
