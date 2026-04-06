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


def incidence_exact_test(
    table: list[list[int]],
    method: str = "boschloo",
) -> dict:
    """Exact test on 2x2 contingency table for incidence data.

    table = [[a, b], [c, d]] where a=affected_treatment, b=unaffected_treatment,
    c=affected_control, d=unaffected_control.

    Methods:
        "boschloo" (default) — Boschloo's unconditional exact test. Uniformly
            more powerful than Fisher's. Conditions only on the fixed margin
            (group sizes), matching the one-margin-fixed design of preclinical
            trials. Uses Fisher's p-value as the test statistic and maximizes
            over the nuisance parameter. [scipy.stats.boschloo_exact]
        "fisher" — Fisher's conditional exact test. Conditions on both margins.
            Available as an override for comparability with legacy analyses.
            [scipy.stats.fisher_exact]
    """
    # Compute odds ratio and OR_lower from the table directly
    a, b = table[0]
    c, d = table[1]
    odds_ratio: float | None
    or_lower: float | None = None
    if b > 0 and c > 0:
        odds_ratio = round(float((a * d) / (b * c)), 6)
        # R10: lower confidence bound of OR via log-OR normal approximation
        # SE(ln(OR)) = sqrt(1/a + 1/b + 1/c + 1/d) with Haldane correction for zero cells
        import math
        a_h = a + 0.5 if a == 0 else a
        b_h = b + 0.5 if b == 0 else b
        c_h = c + 0.5 if c == 0 else c
        d_h = d + 0.5 if d == 0 else d
        ln_or = math.log(max(odds_ratio, 1e-10))
        se_ln_or = math.sqrt(1/a_h + 1/b_h + 1/c_h + 1/d_h)
        # 80% one-sided = z=0.842
        z_80 = 0.842
        or_lower = round(float(math.exp(ln_or - z_80 * se_ln_or)), 6)
    elif a == 0 and c == 0:
        odds_ratio = None
    else:
        odds_ratio = None  # inf not JSON-serializable; callers check incidence rates directly

    # Cohen's h and its lower bound (80% one-sided) for effect-size-first decision gates
    import math
    n_treat = a + b
    n_ctrl = c + d
    cohens_h: float | None = None
    if n_treat > 0 and n_ctrl > 0:
        p1 = a / n_treat
        p2 = c / n_ctrl
        cohens_h = round(2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(p2)), 6)
    h_lower = compute_h_lower_abs(a, n_treat, c, n_ctrl)

    try:
        if method == "fisher":
            _, p_val = stats.fisher_exact(table)
        else:
            result = stats.boschloo_exact(table, alternative="two-sided")
            p_val = result.pvalue
        # Guard against NaN (e.g. Boschloo on degenerate tables like [[0,n],[0,m]])
        if np.isnan(p_val):
            p_val = 1.0
        return {
            "odds_ratio": odds_ratio,
            "or_lower": or_lower,
            "p_value": float(p_val),
            "test_method": method,
            "cohens_h": cohens_h,
            "h_lower": round(h_lower, 4) if h_lower is not None else None,
        }
    except ValueError:
        return {"odds_ratio": None, "or_lower": None, "p_value": None, "test_method": method, "cohens_h": None, "h_lower": None}


def incidence_exact_both(table: list[list[int]]) -> dict:
    """Compute both Boschloo and Fisher p-values for a 2x2 table.

    Returns the Boschloo result as primary (p_value, odds_ratio) plus
    p_value_fisher for the settings override swap — same pattern as
    storing p_value_welch alongside Dunnett for continuous endpoints.
    """
    primary = incidence_exact_test(table, method="boschloo")
    try:
        _, fisher_p = stats.fisher_exact(table)
        if np.isnan(fisher_p):
            fisher_p = 1.0
        primary["p_value_fisher"] = float(fisher_p)
    except ValueError:
        primary["p_value_fisher"] = None
    return primary


# Backwards-compatible alias
fisher_exact_2x2 = incidence_exact_test


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


def compute_effect_size(group1: list | np.ndarray, group2: list | np.ndarray) -> float | None:
    """Hedges' g effect size (bias-corrected Cohen's d for small samples).

    REM-05: Applies Hedges' correction factor J = 1 - 3/(4*df - 1) to
    reduce upward bias in Cohen's d when sample sizes are small (< 20).
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


def _nct_effect_lower(
    abs_effect: float, df: int, scale: float, confidence_level: float,
) -> float:
    """Core bisection for lower CI bound on |effect size| via non-central t.

    Shared by between-subject (Hedges' g) and within-subject (paired d_z).
    The non-centrality parameter lambda = |effect| * scale, and the observed
    t-statistic equals lambda by construction.

    Returns lower bound of |effect|, floored at 0.
    """
    lam = abs_effect * scale

    if lam < 0.01:
        return 0.0

    target = confidence_level
    delta_lo = 0.0
    delta_hi = lam * 2 + 5

    for _ in range(100):
        delta_mid = (delta_lo + delta_hi) / 2
        cdf = float(stats.nct.cdf(lam, df, delta_mid))
        if abs(cdf - target) < 1e-8:
            return max(0.0, round(delta_mid / scale, 6))
        if cdf > target:
            delta_lo = delta_mid
        else:
            delta_hi = delta_mid
        if delta_hi - delta_lo < 1e-8:
            return max(0.0, round(delta_mid / scale, 6))

    return max(0.0, round((delta_lo + delta_hi) / 2 / scale, 6))


def compute_loo_stability(
    control: np.ndarray, treated: np.ndarray,
    g_lower_full: float, confidence_level: float = 0.80,
) -> dict | None:
    """Bidirectional leave-one-out stability: median(LOO-gLower / gLower).

    For each treated animal AND each control animal, remove it, recompute
    Hedges' g and gLower. The median ratio tells how much a typical
    single-animal removal shrinks gLower:
      >= 1.0: stable (typical removal does not reduce the signal)
      < 1.0: fragile (typical removal reduces gLower by this fraction)
      0.0: extremely fragile (most removals kill the signal)

    Uses median (not min) for scoring because the min is a non-smooth
    functional where delete-1 jackknife theory breaks down (Shao & Tu
    1995), producing a bimodal distribution ill-suited for the sigmoid
    multiplier.  The min is retained via influential_*_idx for per-animal
    diagnostics ("which animal is most influential?").

    Returns dict with overall, treated, control stability, control_fragile flag,
    and influential animal indices (into the input arrays).
    Returns None when g_lower_full <= 0 (no signal to test).
    """
    if g_lower_full is None or g_lower_full <= 0:
        return None  # no signal to be fragile about

    def _side_stability(base: np.ndarray, other: np.ndarray, remove_from_first: bool) -> tuple[float, int, list[tuple[int, float]]]:
        """Compute median LOO-gLower ratio for scoring, min index for diagnostics.

        remove_from_first=True: iterate over base (removing from group 1 in effect_size call)
        remove_from_first=False: iterate over base (removing from group 2)

        Returns (median_stability_ratio, most_influential_index, per_animal_ratios).
        per_animal_ratios: list of (index, ratio) for every animal in the loop.
        Most-influential index: animal whose removal causes the largest gLower drop (min ratio).
        """
        n = len(base)
        if n <= 2:
            return 0.0, 0, [(i, 0.0) for i in range(n)]
        min_ratio_val = float("inf")
        min_idx = 0
        per_animal: list[tuple[int, float]] = []
        for i in range(n):
            loo_base = np.delete(base, i)
            if remove_from_first:
                loo_g = compute_effect_size(loo_base, other)
                loo_gl = compute_g_lower(loo_g, len(other), len(loo_base), confidence_level) if loo_g is not None else None
            else:
                loo_g = compute_effect_size(other, loo_base)
                loo_gl = compute_g_lower(loo_g, len(loo_base), len(other), confidence_level) if loo_g is not None else None
            if loo_g is None:
                per_animal.append((i, 0.0))
                return 0.0, i, per_animal  # degenerate (zero variance after removal)
            if loo_gl is None or loo_gl <= 0:
                per_animal.append((i, 0.0))
                return 0.0, i, per_animal
            ratio = round(loo_gl / g_lower_full, 4)
            per_animal.append((i, ratio))
            if ratio < min_ratio_val:
                min_ratio_val = ratio
                min_idx = i
        if not per_animal:
            return 1.0, 0, per_animal
        ratios = [r for _, r in per_animal]
        median_ratio = float(np.median(ratios))
        return round(median_ratio, 4), min_idx, per_animal

    # Treated-side: remove each treated animal, compute effect_size(loo_treated, control)
    treated_stab, treated_idx, treated_per_animal = _side_stability(treated, control, remove_from_first=True)
    # Control-side: remove each control animal, compute effect_size(treated, loo_control)
    control_stab, control_idx, control_per_animal = _side_stability(control, treated, remove_from_first=False)

    overall = min(treated_stab, control_stab)
    control_fragile = control_stab < treated_stab if not (control_stab == 0.0 and treated_stab == 0.0) else False

    return {
        "overall": overall,
        "treated": treated_stab,
        "control": control_stab,
        "control_fragile": control_fragile,
        "influential_treated_idx": treated_idx,
        "influential_control_idx": control_idx,
        "treated_per_animal": treated_per_animal,
        "control_per_animal": control_per_animal,
    }


def compute_g_lower(
    g: float, n1: int, n2: int, confidence_level: float = 0.80,
) -> float | None:
    """Lower confidence bound of |Hedges' g| via non-central t distribution.

    For between-subject (independent group) designs.
    df = n1 + n2 - 2, scale = sqrt(n1*n2/(n1+n2)).

    Port of frontend g-lower.ts:computeGLower.
    """
    if g is None or n1 < 2 or n2 < 2:
        return None
    if confidence_level <= 0:
        return abs(g)

    df = n1 + n2 - 2
    scale = np.sqrt(n1 * n2 / (n1 + n2))
    return _nct_effect_lower(abs(g), df, scale, confidence_level)


def compute_g_lower_paired(
    d_z: float, n_pairs: int, confidence_level: float = 0.80,
) -> float | None:
    """Lower confidence bound of |paired d_z| via non-central t distribution.

    For within-subject (crossover/paired) designs.
    df = n_pairs - 1, scale = sqrt(n_pairs).
    """
    if d_z is None or n_pairs < 2:
        return None
    if confidence_level <= 0:
        return abs(d_z)

    df = n_pairs - 1
    scale = np.sqrt(n_pairs)
    return _nct_effect_lower(abs(d_z), df, scale, confidence_level)


def compute_h_lower_abs(
    affected_treated: int, n_treated: int,
    affected_control: int, n_control: int,
    confidence_level: float = 0.80,
) -> float | None:
    """Lower confidence bound of |Cohen's h| at one-sided confidence level.

    Analogous to compute_g_lower for continuous endpoints. Uses Wilson score
    CI on each proportion with alpha calibrated to the one-sided level, then
    arcsine-transforms to get h bounds.

    Parameters:
        affected_treated: Number affected in treated group.
        n_treated: Total in treated group.
        affected_control: Number affected in control group.
        n_control: Total in control group.
        confidence_level: One-sided confidence (default 0.80).
    Returns:
        Lower bound of |h|, floored at 0. None if inputs are degenerate.
    """
    if n_treated == 0 or n_control == 0:
        return None

    # One-sided confidence -> two-sided alpha for Wilson CI
    alpha = 2 * (1 - confidence_level)

    result = compute_cohens_h(
        affected_treated, n_treated,
        affected_control, n_control,
        alpha=alpha,
    )
    if result["cohens_h"] is None:
        return None

    h = result["cohens_h"]
    h_lower = result["h_ci_lower"]
    h_upper = result["h_ci_upper"]

    # Lower bound of |h|: if CI doesn't cross zero, use closer-to-zero bound
    if h >= 0:
        return max(0.0, round(h_lower, 6))
    else:
        return max(0.0, round(-h_upper, 6))


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
    control_ids: list[str] | None = None,
    treated_ids: dict[int, list[str]] | None = None,
) -> list[dict]:
    """Dunnett's test: each treated group vs control (FWER-controlled).

    REM-28: Replaces Welch's t-test + Bonferroni as the primary pairwise method.
    Dunnett's test inherently controls the family-wise error rate, so no
    additional Bonferroni correction is needed.

    Parameters:
        control: Control group values.
        treated_groups: List of (dose_level, values) tuples for treated groups.
        control_ids: Optional USUBJIDs parallel to control array (pre-NaN-cleaned).
        treated_ids: Optional {dose_level: [USUBJIDs]} parallel to treated arrays.

    Returns list of dicts with: dose_level, p_value, p_value_adj, statistic, effect_size.
    """
    ctrl = np.array(control, dtype=float)
    # NaN-alignment contract: apply same mask to both values and IDs
    nan_mask = ~np.isnan(ctrl)
    ctrl = ctrl[nan_mask]
    ctrl_ids_clean: list[str] | None = None
    if control_ids is not None:
        ctrl_ids_clean = [uid for uid, keep in zip(control_ids, nan_mask) if keep]
    if len(ctrl) < 2 or not treated_groups:
        return []

    # Prepare arrays and track which indices are valid
    dose_levels = []
    valid_arrays = []
    valid_indices = []
    all_effect_sizes = []
    all_treated_sizes = []
    all_cleaned_arrays = []  # kept for LOO stability computation
    all_cleaned_ids: list[list[str] | None] = []  # parallel USUBJID lists

    for i, (dose_level, vals) in enumerate(treated_groups):
        arr = np.array(vals, dtype=float)
        t_nan_mask = ~np.isnan(arr)
        arr = arr[t_nan_mask]
        # Clean treated IDs with same NaN mask
        t_ids: list[str] | None = None
        if treated_ids is not None and dose_level in treated_ids:
            raw_ids = treated_ids[dose_level]
            t_ids = [uid for uid, keep in zip(raw_ids, t_nan_mask) if keep]
        dose_levels.append(dose_level)
        all_effect_sizes.append(compute_effect_size(arr, ctrl))
        all_treated_sizes.append(len(arr))
        all_cleaned_arrays.append(arr)
        all_cleaned_ids.append(t_ids)
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
    n1 = len(ctrl)
    for i, dose_level in enumerate(dose_levels):
        p = dunnett_p[i]
        d = all_effect_sizes[i]
        n2 = all_treated_sizes[i]
        gl = compute_g_lower(d, n1, n2) if d is not None else None
        loo_result = compute_loo_stability(ctrl, all_cleaned_arrays[i], gl) if gl is not None and gl > 0 else None

        # Map influential animal index to USUBJID
        loo_subject: str | None = None
        loo_per_subject: dict[str, dict] | None = None
        if loo_result is not None:
            if loo_result["control_fragile"] and ctrl_ids_clean is not None:
                idx = loo_result["influential_control_idx"]
                if idx < len(ctrl_ids_clean):
                    loo_subject = ctrl_ids_clean[idx]
            elif not loo_result["control_fragile"] and all_cleaned_ids[i] is not None:
                idx = loo_result["influential_treated_idx"]
                t_ids_list = all_cleaned_ids[i]
                if t_ids_list is not None and idx < len(t_ids_list):
                    loo_subject = t_ids_list[idx]

            # Map per-animal LOO ratios to USUBJIDs (both sides)
            # Each entry carries ratio + dose_level so the frontend can color-code
            # by dose group without reverse-engineering group membership.
            loo_per_subject = {}
            t_ids = all_cleaned_ids[i]
            for arr_idx, ratio in loo_result.get("treated_per_animal", []):
                if t_ids is not None and arr_idx < len(t_ids):
                    loo_per_subject[t_ids[arr_idx]] = {"ratio": ratio, "dose_level": int(dose_level)}
            if ctrl_ids_clean is not None:
                for arr_idx, ratio in loo_result.get("control_per_animal", []):
                    if arr_idx < len(ctrl_ids_clean):
                        loo_per_subject[ctrl_ids_clean[arr_idx]] = {"ratio": ratio, "dose_level": 0}

        pairwise.append({
            "dose_level": int(dose_level),
            "p_value": round(p, 6) if p is not None else None,
            # Dunnett's p-values are already FWER-controlled -- p_value_adj = p_value
            "p_value_adj": round(p, 6) if p is not None else None,
            "statistic": None,  # Dunnett's doesn't provide per-comparison test statistics
            "effect_size": round(d, 4) if d is not None else None,
            "g_lower": round(gl, 4) if gl is not None else None,
            "loo_stability": loo_result["overall"] if loo_result else None,
            "loo_treated": loo_result["treated"] if loo_result else None,
            "loo_control": loo_result["control"] if loo_result else None,
            "loo_control_fragile": loo_result["control_fragile"] if loo_result else None,
            "loo_influential_subject": loo_subject,
            "loo_per_subject": loo_per_subject,
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


# ── Effect size metrics for incidence endpoints ───────────────


def _wilson_score_ci(x: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Wilson score confidence interval for a single proportion.

    Well-defined at p=0 and p=1 (does not collapse to a point).
    Reference: Wilson EB (1927), JASA 22(158):209-212.
    """
    if n == 0:
        return (0.0, 1.0)
    p_hat = x / n
    z = stats.norm.ppf(1 - alpha / 2)
    z2 = z * z
    denom = 1 + z2 / n
    center = (p_hat + z2 / (2 * n)) / denom
    half_width = (z / denom) * np.sqrt(p_hat * (1 - p_hat) / n + z2 / (4 * n * n))
    return (max(0.0, center - half_width), min(1.0, center + half_width))


def compute_risk_difference(
    affected_treated: int, n_treated: int,
    affected_control: int, n_control: int,
    alpha: float = 0.05,
) -> dict:
    """Risk difference with Newcombe's Method 10 confidence interval.

    RD = p_treated - p_control. CI via Wilson score intervals on each
    proportion, combined per Newcombe (1998, Stat Med 17(8):873-890).
    Recommended for small n by Fagerland, Lydersen & Laake (2015,
    Stat Methods Med Res 24(2):224-254).
    """
    if n_treated == 0 or n_control == 0:
        return {"risk_difference": None, "rd_ci_lower": None, "rd_ci_upper": None}

    p1 = affected_treated / n_treated
    p2 = affected_control / n_control
    rd = round(p1 - p2, 6)

    # Wilson score CIs for each proportion
    l1, u1 = _wilson_score_ci(affected_treated, n_treated, alpha)
    l2, u2 = _wilson_score_ci(affected_control, n_control, alpha)

    # Newcombe Method 10: CI for difference
    lower = rd - np.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    upper = rd + np.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)

    return {
        "risk_difference": rd,
        "rd_ci_lower": round(float(max(-1.0, lower)), 6),
        "rd_ci_upper": round(float(min(1.0, upper)), 6),
    }


def compute_cohens_h(
    affected_treated: int, n_treated: int,
    affected_control: int, n_control: int,
    alpha: float = 0.05,
) -> dict:
    """Cohen's h (arcsine effect size for incidence) with hybrid CI.

    h = 2*arcsin(sqrt(p_treated)) - 2*arcsin(sqrt(p_control))

    CI method: Wilson score CI on each proportion, then arcsine-transform
    the CI bounds. NOT delta method (undefined at p=0 and p=1 -- the most
    common scenario for treatment-related histopathology findings).
    Delta method failure documented in Lin & Xu 2020 (PMC7384291).
    Hybrid method is a pragmatic construction from Wilson (1927) + Cohen (1988).
    """
    import math

    if n_treated == 0 or n_control == 0:
        return {"cohens_h": None, "h_ci_lower": None, "h_ci_upper": None}

    p1 = affected_treated / n_treated
    p2 = affected_control / n_control

    h = 2 * math.asin(math.sqrt(p1)) - 2 * math.asin(math.sqrt(p2))

    # Wilson score CIs for each proportion
    l1, u1 = _wilson_score_ci(affected_treated, n_treated, alpha)
    l2, u2 = _wilson_score_ci(affected_control, n_control, alpha)

    # Arcsine-transform the Wilson bounds
    # Lower bound of h: smallest plausible p1 arcsine minus largest plausible p2 arcsine
    h_lower = 2 * math.asin(math.sqrt(l1)) - 2 * math.asin(math.sqrt(u2))
    # Upper bound of h: largest plausible p1 arcsine minus smallest plausible p2 arcsine
    h_upper = 2 * math.asin(math.sqrt(u1)) - 2 * math.asin(math.sqrt(l2))

    return {
        "cohens_h": round(h, 6),
        "h_ci_lower": round(h_lower, 6),
        "h_ci_upper": round(h_upper, 6),
    }


def bayesian_incidence_posterior(
    affected_treat: int, n_treat: int,
    affected_ctrl: int, n_ctrl: int,
) -> float:
    """P(p_treat > p_ctrl | data) via Beta-Binomial conjugate with uniform prior.

    Uses Beta(1,1) (uniform) prior on both groups. Posterior for each group
    is Beta(affected + 1, n - affected + 1). The probability that the treated
    rate exceeds control is computed via numerical integration of the joint
    posterior.

    At 2/3 vs 0/3 this returns 0.929 — exposing the signal that Fisher's
    exact (p=0.40) cannot detect at N=3.
    """
    from scipy.stats import beta as beta_dist

    # Posterior parameters (uniform prior: alpha=1, beta=1)
    a_t, b_t = affected_treat + 1, n_treat - affected_treat + 1
    a_c, b_c = affected_ctrl + 1, n_ctrl - affected_ctrl + 1

    # P(p_t > p_c) via Monte Carlo (fast, accurate to ~0.001 at 100k samples)
    rng = np.random.default_rng(42)
    samples_t = beta_dist.rvs(a_t, b_t, size=100_000, random_state=rng)
    samples_c = beta_dist.rvs(a_c, b_c, size=100_000, random_state=rng)
    return round(float(np.mean(samples_t > samples_c)), 4)


def incidence_detection_limited(n_treat: int, n_ctrl: int) -> bool:
    """True when the most extreme 2x2 table cannot reach p < 0.05.

    At N=3, Fisher's exact gives p=0.10 for 3/3 vs 0/3 (two-sided).
    At N=4, Fisher's gives p=0.029 for 4/4 vs 0/4.
    """
    if n_treat < 1 or n_ctrl < 1:
        return True
    try:
        _, p = stats.fisher_exact([[n_treat, 0], [0, n_ctrl]])
        return float(p) > 0.05
    except ValueError:
        return True


# ─── Robust scale estimator ──────────────────────────────────────────────


# Qn finite-sample correction factors d_n (Rousseeuw & Croux 1993, Table 1)
_QN_DN: dict[int, float] = {
    2: 0.3994, 3: 0.9939, 4: 0.5119, 5: 0.8440,
    6: 0.6113, 7: 0.8574, 8: 0.6693, 9: 0.8728,
}
_QN_DN_ASYMPTOTIC = 2.2219


def qn_scale(x: list[float]) -> float:
    """Qn robust scale estimator (Rousseeuw & Croux 1993).

    82% Gaussian efficiency vs MAD's 37%, same 50% breakdown point.
    Returns scale estimate (analogous to SD). Returns 0.0 for N < 2.

    Computes the k-th order statistic of all |x_i - x_j| pairwise
    differences, where k = C(h, 2) and h = floor(N/2) + 1.
    """
    n = len(x)
    if n < 2:
        return 0.0

    # All pairwise absolute differences
    diffs = sorted(abs(x[i] - x[j]) for i in range(n) for j in range(i + 1, n))

    h = n // 2 + 1
    k = h * (h - 1) // 2  # C(h, 2)
    # k is 1-indexed order statistic, diffs is 0-indexed
    idx = min(k - 1, len(diffs) - 1)
    raw = diffs[idx]

    d_n = _QN_DN.get(n, _QN_DN_ASYMPTOTIC)
    return raw * d_n


# ─── Hamada dose-response studentized residuals ──────────────────────────


def hamada_studentized_residuals(
    groups: dict[int, list[float]],
    dose_levels: list[int],
) -> dict[tuple[int, int], float]:
    """Dose-response studentized residuals per Hamada et al. 1998.

    Fits linear regression across all dose groups pooled. Returns
    per-animal externally studentized residuals (leave-one-out variance).

    When Brown-Forsythe rejects variance homogeneity (p < 0.05) AND N >= 10,
    falls back to within-group residuals. At N < 10, ALWAYS uses within-group
    residuals (Brown-Forsythe has <25% power at N=5, Gastwirth 2009).

    Returns dict mapping (dose_level, animal_index) -> studentized residual.
    """
    total_n = sum(len(v) for v in groups.values())

    # At N < 10 per group, always use within-group residuals
    use_within_group = any(len(v) < 10 for v in groups.values() if v)

    if not use_within_group and total_n >= 10:
        # Brown-Forsythe test for variance homogeneity
        ordered_groups = [groups[dl] for dl in dose_levels if dl in groups and len(groups[dl]) >= 2]
        if len(ordered_groups) >= 2:
            try:
                _, bf_p = stats.levene(*ordered_groups, center='median')
                if bf_p < 0.05:
                    use_within_group = True
            except Exception:
                use_within_group = True

    result: dict[tuple[int, int], float] = {}

    if use_within_group:
        # Within-group studentized residuals
        for dl in dose_levels:
            vals = groups.get(dl, [])
            if len(vals) < 3:
                for i in range(len(vals)):
                    result[(dl, i)] = 0.0
                continue
            arr = np.array(vals, dtype=float)
            mean = np.mean(arr)
            for i, v in enumerate(vals):
                # Leave-one-out variance
                loo = np.delete(arr, i)
                loo_var = np.var(loo, ddof=1)
                if loo_var > 0:
                    result[(dl, i)] = float((v - mean) / np.sqrt(loo_var))
                else:
                    result[(dl, i)] = 0.0
    else:
        # Pooled regression: Y ~ dose_level (linear)
        all_x = []
        all_y = []
        animal_map: list[tuple[int, int]] = []  # (dose_level, index)
        for dl in dose_levels:
            vals = groups.get(dl, [])
            for i, v in enumerate(vals):
                all_x.append(float(dl))
                all_y.append(v)
                animal_map.append((dl, i))

        if len(all_x) < 3:
            return {key: 0.0 for key in animal_map}

        x_arr = np.array(all_x)
        y_arr = np.array(all_y)
        n = len(x_arr)

        # OLS fit: y = a + b*x
        x_mean = np.mean(x_arr)
        y_mean = np.mean(y_arr)
        ss_xx = np.sum((x_arr - x_mean) ** 2)
        if ss_xx == 0:
            return {key: 0.0 for key in animal_map}
        b = np.sum((x_arr - x_mean) * (y_arr - y_mean)) / ss_xx
        a = y_mean - b * x_mean

        residuals = y_arr - (a + b * x_arr)
        hat = 1.0 / n + (x_arr - x_mean) ** 2 / ss_xx
        mse = np.sum(residuals ** 2) / (n - 2) if n > 2 else 1.0

        for j, (dl, idx) in enumerate(animal_map):
            # Externally studentized: leave-one-out variance
            h_j = hat[j]
            e_j = residuals[j]
            loo_mse = ((n - 2) * mse - e_j ** 2 / (1 - h_j)) / (n - 3) if n > 3 and (1 - h_j) > 1e-10 else mse
            denom = np.sqrt(max(loo_mse * (1 - h_j), 1e-10))
            result[(dl, idx)] = float(e_j / denom)

    return result
