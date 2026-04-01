"""Within-subject statistics for crossover/escalation designs.

Replaces between-group tests (Dunnett's, JT) with within-subject methods:
  - Paired t-test (each dose vs vehicle within subjects)
  - Repeated-measures omnibus (Friedman chi-square)
  - Page's L trend test (ordered dose-response within subjects)
  - Cohen's d_z (paired effect size with Hedges correction for small N)
  - Holm-Bonferroni multiplicity adjustment
  - Carryover test (vehicle-period baseline comparison across periods)
  - McNemar's test (paired incidence for CL domain)
"""

from __future__ import annotations

import logging

import numpy as np
from scipy import stats as sp_stats

log = logging.getLogger(__name__)


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (ValueError, TypeError):
        return None


def paired_ttest(
    vehicle_values: dict[str, float],
    treated_values: dict[str, float],
) -> dict:
    """Paired t-test on matched subject values.

    Args:
        vehicle_values: {subject_id: mean_cfb_at_vehicle}
        treated_values: {subject_id: mean_cfb_at_dose}

    Returns:
        {"p_value": float, "t_stat": float, "n_pairs": int, "mean_diff": float, "sd_diff": float}
    """
    common = sorted(set(vehicle_values) & set(treated_values))
    if len(common) < 2:
        return {"p_value": None, "t_stat": None, "n_pairs": len(common),
                "mean_diff": None, "sd_diff": None}

    v = np.array([vehicle_values[s] for s in common])
    t = np.array([treated_values[s] for s in common])
    diffs = t - v

    try:
        result = sp_stats.ttest_rel(t, v)
        return {
            "p_value": _safe_float(result.pvalue),
            "t_stat": _safe_float(result.statistic),
            "n_pairs": len(common),
            "mean_diff": _safe_float(float(np.mean(diffs))),
            "sd_diff": _safe_float(float(np.std(diffs, ddof=1))) if len(common) > 1 else None,
        }
    except Exception as e:
        log.warning("Paired t-test failed: %s", e)
        return {"p_value": None, "t_stat": None, "n_pairs": len(common),
                "mean_diff": _safe_float(float(np.mean(diffs))),
                "sd_diff": _safe_float(float(np.std(diffs, ddof=1))) if len(common) > 1 else None}


def cohens_dz(
    vehicle_values: dict[str, float],
    treated_values: dict[str, float],
) -> float | None:
    """Cohen's d_z (paired effect size) with Hedges correction for small N.

    d_z = mean(diff) / sd(diff)
    Hedges correction: d_z * (1 - 3 / (4*(n-1) - 1))
    """
    common = sorted(set(vehicle_values) & set(treated_values))
    if len(common) < 2:
        return None

    v = np.array([vehicle_values[s] for s in common])
    t = np.array([treated_values[s] for s in common])
    diffs = t - v

    sd = float(np.std(diffs, ddof=1))
    if sd < 1e-12:
        return 0.0

    d = float(np.mean(diffs)) / sd
    n = len(common)

    # Hedges correction for small samples
    correction = 1 - 3 / (4 * (n - 1) - 1) if n > 2 else 1.0
    return _safe_float(d * correction)


def holm_adjust(p_values: list[float | None]) -> list[float | None]:
    """Holm-Bonferroni step-down multiplicity adjustment.

    More powerful than Bonferroni, suitable for small number of comparisons.
    """
    n = len(p_values)
    if n == 0:
        return []

    # Track original indices for non-None values
    valid = [(i, p) for i, p in enumerate(p_values) if p is not None]
    if not valid:
        return p_values[:]

    # Sort by p-value
    valid.sort(key=lambda x: x[1])

    adjusted = [None] * n
    max_so_far = 0.0
    for rank, (orig_idx, p) in enumerate(valid):
        adj_p = p * (len(valid) - rank)
        adj_p = min(adj_p, 1.0)
        adj_p = max(adj_p, max_so_far)  # monotonicity
        max_so_far = adj_p
        adjusted[orig_idx] = _safe_float(adj_p)

    return adjusted


def pages_trend_test(
    subject_values_by_dose: dict[float, dict[str, float]],
    dose_levels: list[float],
) -> dict:
    """Page's L trend test for within-subject ordered alternatives.

    Tests whether there is an increasing/decreasing trend across ordered
    dose levels within subjects. Extension of Friedman test for ordered
    alternatives.

    Args:
        subject_values_by_dose: {dose_value: {subject_id: mean_cfb}}
        dose_levels: ordered list of dose values

    Returns:
        {"statistic": float, "p_value": float, "method": str}
    """
    if len(dose_levels) < 3:
        return {"statistic": None, "p_value": None, "method": "pages"}

    # Find subjects with data at all dose levels
    subject_ids = None
    for dose in dose_levels:
        subj_set = set(subject_values_by_dose.get(dose, {}).keys())
        if subject_ids is None:
            subject_ids = subj_set
        else:
            subject_ids &= subj_set

    if not subject_ids or len(subject_ids) < 3:
        # Fallback to Friedman test (doesn't require ordered alternatives)
        return _friedman_test(subject_values_by_dose, dose_levels, subject_ids or set())

    subject_ids = sorted(subject_ids)
    k = len(dose_levels)
    n = len(subject_ids)

    # Build data matrix: subjects x doses
    data = np.zeros((n, k))
    for j, dose in enumerate(dose_levels):
        vals = subject_values_by_dose[dose]
        for i, subj in enumerate(subject_ids):
            data[i, j] = vals[subj]

    # Rank within each subject (row)
    ranks = np.zeros_like(data)
    for i in range(n):
        ranks[i] = sp_stats.rankdata(data[i])

    # Page's L = sum over j of (j+1) * sum over i of R_ij
    # where j is the predicted rank order (1, 2, ..., k)
    L = 0.0
    for j in range(k):
        L += (j + 1) * np.sum(ranks[:, j])

    # Under H0, E(L) = n * k * (k+1)^2 / 4
    E_L = n * k * (k + 1) ** 2 / 4

    # Var(L) = n * k^2 * (k+1)^2 * (k-1) / 144
    Var_L = n * k ** 2 * (k + 1) ** 2 * (k - 1) / 144

    if Var_L < 1e-12:
        return {"statistic": _safe_float(L), "p_value": None, "method": "pages"}

    # Normal approximation (valid for n >= 3, k >= 3)
    z = (L - E_L) / np.sqrt(Var_L)
    p_value = 1 - sp_stats.norm.cdf(z)  # one-sided (increasing trend)

    return {
        "statistic": _safe_float(L),
        "p_value": _safe_float(p_value),
        "z": _safe_float(z),
        "method": "pages",
    }


def _friedman_test(
    subject_values_by_dose: dict[float, dict[str, float]],
    dose_levels: list[float],
    subject_ids: set[str],
) -> dict:
    """Friedman test fallback for when Page's L cannot be applied."""
    if len(subject_ids) < 3 or len(dose_levels) < 3:
        return {"statistic": None, "p_value": None, "method": "friedman_insufficient"}

    subjects = sorted(subject_ids)
    groups = []
    for dose in dose_levels:
        vals = subject_values_by_dose.get(dose, {})
        groups.append([vals.get(s, np.nan) for s in subjects])

    try:
        stat, p = sp_stats.friedmanchisquare(*groups)
        return {"statistic": _safe_float(stat), "p_value": _safe_float(p), "method": "friedman"}
    except Exception as e:
        log.warning("Friedman test failed: %s", e)
        return {"statistic": None, "p_value": None, "method": "friedman_error"}


def compute_within_subject_pairwise(
    subject_cfb_by_dose: dict[float, dict[str, float]],
    dose_levels: list[float],
    control_dose: float = 0.0,
) -> list[dict]:
    """Compute pairwise within-subject comparisons: each dose vs control.

    Returns list of PairwiseStat-compatible dicts with Holm adjustment.
    """
    vehicle_vals = subject_cfb_by_dose.get(control_dose, {})
    if not vehicle_vals:
        return []

    raw_results = []
    for dose_idx, dose in enumerate(dose_levels):
        if dose == control_dose:
            continue

        treated_vals = subject_cfb_by_dose.get(dose, {})
        tt = paired_ttest(vehicle_vals, treated_vals)
        dz = cohens_dz(vehicle_vals, treated_vals)

        # g_lower for paired design: df = n_pairs - 1, scale = sqrt(n_pairs)
        from services.analysis.statistics import compute_g_lower_paired
        gl = compute_g_lower_paired(dz, tt["n_pairs"]) if dz is not None else None

        raw_results.append({
            "dose_level": dose_idx,
            "dose_value": dose,
            "p_value": tt["p_value"],
            "effect_size": dz,
            "g_lower": round(gl, 4) if gl is not None else None,
            "se_diff": tt.get("sd_diff"),
            "n_pairs": tt["n_pairs"],
            "mean_diff": tt["mean_diff"],
        })

    # Holm adjustment across all pairwise comparisons
    raw_p = [r["p_value"] for r in raw_results]
    adj_p = holm_adjust(raw_p)

    for i, result in enumerate(raw_results):
        result["p_value_adj"] = adj_p[i]

    return raw_results


def repeated_measures_omnibus(
    subject_values_by_dose: dict[float, dict[str, float]],
    dose_levels: list[float],
) -> dict:
    """Friedman chi-square test — non-parametric repeated-measures omnibus.

    Tests whether any dose level differs from any other (no ordering assumption).
    Analogous to one-way ANOVA for between-group designs.

    Requires >= 3 dose levels and >= 3 subjects with data at all levels.
    """
    if len(dose_levels) < 3:
        return {"statistic": None, "p_value": None, "method": "friedman_insufficient"}

    # Find subjects with data at all dose levels
    subject_ids: set[str] | None = None
    for dose in dose_levels:
        subj_set = set(subject_values_by_dose.get(dose, {}).keys())
        if subject_ids is None:
            subject_ids = subj_set
        else:
            subject_ids &= subj_set

    if not subject_ids or len(subject_ids) < 3:
        return {"statistic": None, "p_value": None, "method": "friedman_insufficient"}

    subjects = sorted(subject_ids)
    groups = []
    for dose in dose_levels:
        vals = subject_values_by_dose[dose]
        groups.append([vals[s] for s in subjects])

    try:
        stat, p = sp_stats.friedmanchisquare(*groups)
        return {"statistic": _safe_float(stat), "p_value": _safe_float(p), "method": "friedman"}
    except Exception as e:
        log.warning("Friedman omnibus test failed: %s", e)
        return {"statistic": None, "p_value": None, "method": "friedman_error"}


def carryover_test(
    baselines: dict[str, dict[int, dict[str, float]]],
    subject_period_doses: dict[str, dict[int, float]],
    control_dose: float = 0.0,
) -> dict[str, dict]:
    """Test for period/carryover effects by comparing vehicle-period baselines across periods.

    For each endpoint, collects the baseline value at the vehicle period for each subject.
    If the vehicle period occurs at different calendar periods for different subjects
    (Latin square), tests whether the period number affects the baseline.

    For escalation designs where all subjects have vehicle in period 1, this test
    is not informative (no period variation) and returns None.

    Returns:
        {test_code: {"p_value": float, "method": str, "n_subjects": int, "detail": str}}
    """
    # Collect per-subject: which period had vehicle, and what was the baseline?
    vehicle_period_baselines: dict[str, dict[str, float]] = {}  # {test_code: {subj_id: baseline}}
    vehicle_periods: dict[str, int] = {}  # {subj_id: period_number}

    for subj_id, period_doses in subject_period_doses.items():
        subj_baselines = baselines.get(subj_id, {})
        for period, dose_val in period_doses.items():
            if dose_val == control_dose:
                vehicle_periods[subj_id] = period
                period_bl = subj_baselines.get(period, {})
                for testcd, bl_val in period_bl.items():
                    vehicle_period_baselines.setdefault(testcd, {})[subj_id] = bl_val
                break

    if not vehicle_periods:
        return {}

    # Check if there's period variation (Latin square: vehicle in different periods)
    unique_vehicle_periods = set(vehicle_periods.values())
    if len(unique_vehicle_periods) <= 1:
        # All subjects had vehicle in the same period — no carryover test possible
        return {tc: {"p_value": None, "method": "no_period_variation",
                     "n_subjects": len(vehicle_period_baselines.get(tc, {})),
                     "detail": f"All subjects had vehicle in period {next(iter(unique_vehicle_periods), '?')}"}
                for tc in vehicle_period_baselines}

    results: dict[str, dict] = {}
    for testcd, subj_vals in vehicle_period_baselines.items():
        # Group baselines by the period in which vehicle was administered
        period_groups: dict[int, list[float]] = {}
        for subj_id, bl_val in subj_vals.items():
            p = vehicle_periods.get(subj_id)
            if p is not None:
                period_groups.setdefault(p, []).append(bl_val)

        groups = [np.array(vals) for vals in period_groups.values() if len(vals) > 0]

        if len(groups) < 2:
            results[testcd] = {"p_value": None, "method": "insufficient_groups",
                               "n_subjects": len(subj_vals), "detail": "< 2 period groups"}
            continue

        # Kruskal-Wallis (non-parametric, works with small N per group)
        try:
            stat, p = sp_stats.kruskal(*groups)
            results[testcd] = {
                "p_value": _safe_float(p),
                "statistic": _safe_float(stat),
                "method": "kruskal_wallis",
                "n_subjects": len(subj_vals),
                "n_groups": len(groups),
                "detail": f"Vehicle baselines across {len(groups)} periods",
            }
        except Exception as e:
            log.warning("Carryover test failed for %s: %s", testcd, e)
            results[testcd] = {"p_value": None, "method": "error",
                               "n_subjects": len(subj_vals), "detail": str(e)}

    return results


def mcnemar_paired_incidence(
    subject_outcomes_vehicle: dict[str, bool],
    subject_outcomes_treated: dict[str, bool],
) -> dict:
    """McNemar's test for paired binary outcomes (crossover incidence).

    Compares whether the observation occurred at vehicle vs. treated dose
    within the same subjects.

    Returns:
        {"p_value": float, "statistic": float, "method": str,
         "n_discordant": int, "n_pairs": int}
    """
    common = sorted(set(subject_outcomes_vehicle) & set(subject_outcomes_treated))
    if len(common) < 2:
        return {"p_value": None, "statistic": None, "method": "mcnemar_insufficient",
                "n_discordant": 0, "n_pairs": len(common)}

    # Build 2x2 contingency: (vehicle-, treated-), (vehicle-, treated+),
    #                         (vehicle+, treated-), (vehicle+, treated+)
    b = 0  # vehicle=0, treated=1 (discordant: appeared only at treated)
    c = 0  # vehicle=1, treated=0 (discordant: appeared only at vehicle)
    for s in common:
        v = subject_outcomes_vehicle[s]
        t = subject_outcomes_treated[s]
        if not v and t:
            b += 1
        elif v and not t:
            c += 1

    n_discordant = b + c
    if n_discordant == 0:
        return {"p_value": 1.0, "statistic": 0.0, "method": "mcnemar_no_discordance",
                "n_discordant": 0, "n_pairs": len(common)}

    # Exact binomial test (better than chi-square approximation for small N)
    try:
        result = sp_stats.binomtest(b, n_discordant, 0.5)
        return {
            "p_value": _safe_float(result.pvalue),
            "statistic": _safe_float(float(b)),
            "method": "mcnemar_exact",
            "n_discordant": n_discordant,
            "n_pairs": len(common),
        }
    except Exception as e:
        log.warning("McNemar test failed: %s", e)
        return {"p_value": None, "statistic": None, "method": "mcnemar_error",
                "n_discordant": n_discordant, "n_pairs": len(common)}
