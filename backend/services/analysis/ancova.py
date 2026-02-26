"""ANCOVA (Analysis of Covariance) for organ weight normalization.

Phase 2 of the organ_weight_normalization_spec.

Removes body weight confounding from organ weight comparisons by fitting:
    organ_weight ~ C(dose_group) + body_weight

Produces adjusted (LS) means, pairwise comparisons vs control,
slope homogeneity test, and effect decomposition (total/direct/indirect).

Uses only numpy + scipy (no statsmodels dependency).

References:
    Lazic SE et al. Sci Rep 2020;10:6625
    Bailey SA et al. Toxicol Pathol 2004;32:448
"""

from __future__ import annotations

import numpy as np
from scipy import stats


# ──────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────

def _fit_ols(
    X: np.ndarray, y: np.ndarray,
) -> tuple[np.ndarray, float, int, np.ndarray]:
    """Ordinary least-squares: y = Xβ + ε.

    Returns (coefficients, RSS, df_residual, vcov_beta).
    """
    n, p = X.shape
    beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    rss = float(np.sum(resid ** 2))
    df = n - p
    mse = rss / df if df > 0 else np.inf
    try:
        XtX_inv = np.linalg.inv(X.T @ X)
    except np.linalg.LinAlgError:
        XtX_inv = np.linalg.pinv(X.T @ X)
    vcov = mse * XtX_inv
    return beta, rss, df, vcov


def _f_compare(
    rss_r: float, df_r: int, rss_f: float, df_f: int,
) -> tuple[float | None, float | None]:
    """F-test comparing nested models (reduced vs full)."""
    df_diff = df_r - df_f
    if df_diff <= 0 or df_f <= 0 or rss_f <= 0:
        return None, None
    f_stat = ((rss_r - rss_f) / df_diff) / (rss_f / df_f)
    p_value = float(1 - stats.f.cdf(f_stat, df_diff, df_f))
    return float(f_stat), p_value


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def run_ancova(
    organ_values: np.ndarray,
    body_weights: np.ndarray,
    groups: np.ndarray,
    control_group: int = 0,
    use_organ_free_bw: bool = False,
    alpha: float = 0.05,
) -> dict | None:
    """One-way ANCOVA: organ_weight ~ C(dose_group) + body_weight.

    Parameters:
        organ_values:     Subject-level organ weights (n,).
        body_weights:     Subject-level terminal body weights (n,).
        groups:           Dose group codes (n,) — integers.
        control_group:    Control group code (default 0).
        use_organ_free_bw: If True, covariate = BW - organ_weight (Lazic 2020).
        alpha:            Significance level for tests.

    Returns dict with adjusted_means, pairwise, slope, slope_homogeneity,
    effect_decomposition, model_r_squared, mse. None if insufficient data.
    """
    mask = ~(np.isnan(organ_values) | np.isnan(body_weights))
    ov = organ_values[mask].astype(float)
    bw = body_weights[mask].astype(float)
    gp = groups[mask].astype(int)

    unique_groups = sorted(set(gp))
    k = len(unique_groups)
    n = len(ov)

    if n < k + 2 or k < 2:
        return None

    # Covariate
    cov = (bw - ov) if use_organ_free_bw else bw.copy()
    cov_mean = float(np.mean(cov))

    # ── ANCOVA design matrix: Y = β₀ + Σβᵢ·Gᵢ + β_bw·X ──
    # Treatment coding: control is reference (absorbed into intercept)
    treated = [g for g in unique_groups if g != control_group]
    p_a = 1 + len(treated) + 1  # intercept + (k-1) indicators + covariate

    X_a = np.zeros((n, p_a))
    X_a[:, 0] = 1
    for j, g in enumerate(treated):
        X_a[:, 1 + j] = (gp == g).astype(float)
    X_a[:, -1] = cov

    beta_a, rss_a, df_a, vcov_a = _fit_ols(X_a, ov)
    if df_a <= 0:
        return None

    mse = rss_a / df_a

    # ── Interaction model for slope homogeneity test ──
    p_int = p_a + len(treated)
    X_int = np.zeros((n, p_int))
    X_int[:, :p_a] = X_a
    for j, g in enumerate(treated):
        X_int[:, p_a + j] = X_a[:, 1 + j] * cov

    _, rss_int, df_int, _ = _fit_ols(X_int, ov)
    f_hom, p_hom = _f_compare(rss_a, df_a, rss_int, df_int)
    homogeneous = p_hom is None or p_hom >= alpha

    # ── Slope stats ──
    slope_est = float(beta_a[-1])
    slope_se = float(np.sqrt(max(0, vcov_a[-1, -1])))
    slope_t = slope_est / slope_se if slope_se > 0 else 0.0
    slope_p = float(2 * (1 - stats.t.cdf(abs(slope_t), df_a)))

    # R²
    tss = float(np.sum((ov - np.mean(ov)) ** 2))
    r_sq = 1 - rss_a / tss if tss > 0 else 0.0

    # ── Adjusted (LS) means ──
    adjusted_means = []
    raw_means: dict[int, float] = {}

    for g in unique_groups:
        g_mask = gp == g
        g_vals = ov[g_mask]
        raw_mean = float(np.mean(g_vals))
        raw_means[g] = raw_mean
        g_n = int(np.sum(g_mask))

        # Predicted Y at group g with covariate at overall mean
        x_pred = np.zeros(p_a)
        x_pred[0] = 1
        if g in treated:
            x_pred[1 + treated.index(g)] = 1
        x_pred[-1] = cov_mean

        adj_mean = float(x_pred @ beta_a)
        adj_se = float(np.sqrt(max(0, x_pred @ vcov_a @ x_pred)))

        adjusted_means.append({
            "group": int(g),
            "raw_mean": round(raw_mean, 4),
            "adjusted_mean": round(adj_mean, 4),
            "n": g_n,
            "se": round(adj_se, 4),
        })

    # ── Pairwise: each treated group vs control ──
    pairwise = []
    for g in treated:
        j = treated.index(g)
        # Contrast vector: β_g (control is reference, so this gives treated - control)
        c_vec = np.zeros(p_a)
        c_vec[1 + j] = 1

        diff = float(c_vec @ beta_a)
        se_diff = float(np.sqrt(max(0, c_vec @ vcov_a @ c_vec)))
        t_stat = diff / se_diff if se_diff > 0 else 0.0
        p_val = float(2 * (1 - stats.t.cdf(abs(t_stat), df_a)))

        pairwise.append({
            "group": int(g),
            "difference": round(diff, 4),
            "se": round(se_diff, 4),
            "t_statistic": round(t_stat, 4),
            "p_value": round(p_val, 6),
            "significant": p_val < alpha,
        })

    # ── Effect decomposition: total / direct / indirect ──
    sqrt_mse = float(np.sqrt(mse)) if mse > 0 else 1.0
    ctrl_raw = raw_means.get(control_group, 0.0)
    effect_decomp = []

    for pw in pairwise:
        g = pw["group"]
        total = raw_means[g] - ctrl_raw
        direct = pw["difference"]
        indirect = total - direct
        prop_direct = direct / total if abs(total) > 1e-10 else 1.0

        # Hedges' g for the direct (BW-adjusted) effect
        direct_d = direct / sqrt_mse if sqrt_mse > 0 else 0.0
        j_corr = 1 - 3 / (4 * df_a - 1) if df_a > 1 else 1.0
        direct_g = abs(direct_d * j_corr)

        effect_decomp.append({
            "group": int(g),
            "total_effect": round(total, 4),
            "direct_effect": round(direct, 4),
            "indirect_effect": round(indirect, 4),
            "proportion_direct": round(prop_direct, 4),
            "direct_g": round(direct_g, 4),
            "direct_p": pw["p_value"],
        })

    return {
        "adjusted_means": adjusted_means,
        "pairwise": pairwise,
        "slope": {
            "estimate": round(slope_est, 6),
            "se": round(slope_se, 6),
            "t_statistic": round(slope_t, 4),
            "p_value": round(slope_p, 6),
        },
        "slope_homogeneity": {
            "f_statistic": round(f_hom, 4) if f_hom is not None else None,
            "p_value": round(p_hom, 6) if p_hom is not None else None,
            "homogeneous": homogeneous,
        },
        "effect_decomposition": effect_decomp,
        "model_r_squared": round(r_sq, 4),
        "mse": round(mse, 6),
        "use_organ_free_bw": use_organ_free_bw,
        "covariate_mean": round(cov_mean, 4),
    }


def ancova_from_dose_groups(
    dose_groups_subj: list[dict[str, float]],
    dose_levels: list[int],
    terminal_bw: dict[str, float],
    use_organ_free_bw: bool = False,
    alpha: float = 0.05,
) -> dict | None:
    """Convenience wrapper matching findings_om.py data structures.

    Parameters:
        dose_groups_subj: [{USUBJID: organ_value, ...}, ...] per dose level.
        dose_levels:      [0, 30, 100, 300] matching dose_groups_subj order.
        terminal_bw:      {USUBJID: terminal_bw_value}.
        use_organ_free_bw: Covariate = BW - organ (Lazic 2020).
        alpha:            Significance level.

    Returns ANCOVA result dict or None.
    """
    ov_list: list[float] = []
    bw_list: list[float] = []
    gp_list: list[int] = []

    for dl, subj_dict in zip(dose_levels, dose_groups_subj):
        for subj_id, organ_val in subj_dict.items():
            if np.isnan(organ_val):
                continue
            bw_val = terminal_bw.get(subj_id)
            if bw_val is None or np.isnan(bw_val):
                continue
            ov_list.append(float(organ_val))
            bw_list.append(float(bw_val))
            gp_list.append(int(dl))

    if len(ov_list) < len(set(gp_list)) + 2:
        return None

    return run_ancova(
        organ_values=np.array(ov_list),
        body_weights=np.array(bw_list),
        groups=np.array(gp_list),
        control_group=int(dose_levels[0]),
        use_organ_free_bw=use_organ_free_bw,
        alpha=alpha,
    )
