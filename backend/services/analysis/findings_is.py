"""IS (Immunogenicity) domain findings: GMT kinetics, seroconversion, peak dose-response.

Immunogenicity endpoints use geometric mean titers (GMT) on log₁₀ scale,
BLQ substitution at LLOQ/2, and seroconversion rates (% seropositive,
% ≥4-fold rise from baseline).  These findings flow into FindingsView
as continuous endpoints with IS-specific visualization data attached.
"""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import dunnett_pairwise, compute_effect_size, trend_test


def compute_is_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
) -> list[dict]:
    """Compute findings from IS domain (immunogenicity)."""
    if "is" not in study.xpt_files:
        return []

    is_df, _ = read_xpt(study.xpt_files["is"])
    is_df.columns = [c.upper() for c in is_df.columns]

    # Use raw titer rows only (not log10 transformed)
    if "ISSCAT" in is_df.columns:
        titer_mask = is_df["ISSCAT"].astype(str).str.strip().str.upper().isin(
            {"TITER", ""}
        )
        # If ISSCAT distinguishes titer from log10, filter; otherwise use all
        if titer_mask.any() and not titer_mask.all():
            is_df = is_df[titer_mask].copy()

    # Merge with subjects (main + recovery, exclude TK)
    treatment_subs = subjects[~subjects["is_satellite"]].copy()
    is_df = is_df.merge(
        treatment_subs[["USUBJID", "SEX", "dose_level", "is_recovery"]],
        on="USUBJID", how="inner",
    )

    if len(is_df) == 0:
        return []

    # Parse numeric columns — use column check, not df.get() with scalar default,
    # because scalar defaults don't support Series methods (.astype, .str).
    is_df["value"] = pd.to_numeric(
        is_df["ISSTRESN"] if "ISSTRESN" in is_df.columns else pd.Series(dtype=float, index=is_df.index),
        errors="coerce",
    )
    is_df["day"] = pd.to_numeric(
        is_df["ISDY"] if "ISDY" in is_df.columns else pd.Series(dtype=float, index=is_df.index),
        errors="coerce",
    )
    is_df["blq"] = (
        is_df["ISLOBXFL"].astype(str).str.strip().str.upper() == "Y"
        if "ISLOBXFL" in is_df.columns
        else False
    )
    is_df["baseline"] = (
        is_df["ISBLFL"].astype(str).str.strip().str.upper() == "Y"
        if "ISBLFL" in is_df.columns
        else False
    )

    # Derive LLOQ: use ISLLOQ if available, else estimate from data
    lloq = _derive_lloq(is_df)

    # Substitute BLQ values: use LLOQ/2 when numeric value is missing
    blq_sub = lloq / 2 if lloq else 1.0
    is_df["titer"] = is_df["value"].copy()
    blq_missing = is_df["blq"] & is_df["titer"].isna()
    is_df.loc[blq_missing, "titer"] = blq_sub

    test_col = "ISTESTCD" if "ISTESTCD" in is_df.columns else None
    name_col = "ISTEST" if "ISTEST" in is_df.columns else None
    unit_col = "ISSTRESU" if "ISSTRESU" in is_df.columns else None

    test_codes = is_df[test_col].unique() if test_col else ["IS"]
    all_dose_levels = sorted(treatment_subs[~treatment_subs["is_recovery"]]["dose_level"].unique())
    all_days = sorted(is_df["day"].dropna().unique())

    findings = []

    for tc in test_codes:
        tc_str = str(tc).strip()
        tc_df = is_df[is_df[test_col] == tc] if test_col else is_df
        test_name = str(tc_df[name_col].iloc[0]).strip() if name_col and len(tc_df) > 0 else tc_str
        unit = str(tc_df[unit_col].iloc[0]).strip() if unit_col and len(tc_df) > 0 else None

        for sex in sorted(tc_df["SEX"].unique()):
            sex_df = tc_df[tc_df["SEX"] == sex]

            # Build per-subject baseline map (for 4-fold rise calculation)
            baseline_map = _build_baseline_map(sex_df, blq_sub)

            # Time-course data (all timepoints, all groups including recovery)
            time_course = _build_time_course(
                sex_df, all_dose_levels, all_days, lloq, blq_sub,
            )

            # Seroconversion table
            seroconversion = _build_seroconversion(
                sex_df, all_dose_levels, all_days, lloq, baseline_map,
            )

            # Identify peak timepoint (highest GMT across treated groups)
            peak_day = _find_peak_day(time_course, all_dose_levels)

            # Standard group_stats at peak timepoint for FindingsView integration
            group_stats, pairwise_results = _compute_peak_stats(
                sex_df, all_dose_levels, peak_day, blq_sub,
            )

            # Overall BLQ stats
            n_total = len(sex_df)
            n_blq = int(sex_df["blq"].sum())

            # Trend test on peak GMT
            peak_data = sex_df[sex_df["day"] == peak_day] if peak_day else sex_df
            trend_result = _compute_trend(peak_data, all_dose_levels, blq_sub)

            # Direction
            direction = _compute_direction(group_stats)

            # Min p-value
            min_p = None
            for pw in pairwise_results:
                p = pw.get("p_value")
                if p is not None and (min_p is None or p < min_p):
                    min_p = p

            findings.append({
                "domain": "IS",
                "test_code": tc_str,
                "test_name": test_name,
                "specimen": "SERUM",
                "finding": test_name,
                "day": peak_day,
                "sex": str(sex),
                "unit": unit,
                "data_type": "continuous",
                "group_stats": group_stats,
                "pairwise": pairwise_results,
                "trend_p": trend_result.get("p_value"),
                "trend_stat": trend_result.get("statistic"),
                "direction": direction,
                "max_effect_size": _max_effect_size(pairwise_results),
                "min_p_adj": min_p,
                # IS-specific visualization data
                "is_time_course": time_course,
                "is_seroconversion": seroconversion,
                "is_lloq": lloq,
                "is_blq_pct": round(n_blq / n_total * 100, 1) if n_total > 0 else 0,
                "is_blq_substitution": blq_sub,
                "is_peak_day": peak_day,
            })

    return findings


# ---------------------------------------------------------------------------
# LLOQ derivation
# ---------------------------------------------------------------------------

def _derive_lloq(is_df: pd.DataFrame) -> float | None:
    """Derive LLOQ from ISLLOQ column or estimate from BLQ data."""
    # Try explicit ISLLOQ
    if "ISLLOQ" in is_df.columns:
        lloq_vals = pd.to_numeric(is_df["ISLLOQ"], errors="coerce").dropna()
        if len(lloq_vals) > 0:
            return float(lloq_vals.iloc[0])

    # Estimate: use the minimum non-BLQ value as the LLOQ proxy.
    # BLQ samples may have background readings above the assay LLOQ
    # (flagged BLQ by the lab despite numeric value), so max(BLQ) is unreliable.
    non_blq = is_df[~is_df["blq"]]
    non_blq_vals = non_blq["value"].dropna()

    if len(non_blq_vals) > 0:
        return float(non_blq_vals.min())
    # All values are BLQ — use median of available BLQ values
    blq_vals = is_df[is_df["blq"]]["value"].dropna()
    if len(blq_vals) > 0:
        return float(blq_vals.median())
    return None


# ---------------------------------------------------------------------------
# Baseline map
# ---------------------------------------------------------------------------

def _build_baseline_map(sex_df: pd.DataFrame, blq_sub: float) -> dict[str, float]:
    """Build {USUBJID: baseline_titer} for 4-fold rise calculation."""
    baseline = sex_df[sex_df["baseline"]]
    if len(baseline) == 0:
        # Fallback: use earliest timepoint
        min_day = sex_df["day"].min()
        baseline = sex_df[sex_df["day"] == min_day]

    result: dict[str, float] = {}
    for _, row in baseline.iterrows():
        subj = str(row["USUBJID"]).strip()
        titer = row["titer"]
        if pd.notna(titer) and titer > 0:
            result[subj] = float(titer)
        else:
            result[subj] = blq_sub
    return result


# ---------------------------------------------------------------------------
# Time-course (GMT kinetics)
# ---------------------------------------------------------------------------

def _build_time_course(
    sex_df: pd.DataFrame,
    dose_levels: list[int],
    all_days: list[float],
    lloq: float | None,
    blq_sub: float,
) -> list[dict]:
    """Build time-course array: [{day, epoch, groups: [{dose_level, gmt, ci_lower, ci_upper, n, n_blq}]}]."""
    result = []
    for day in all_days:
        day_df = sex_df[sex_df["day"] == day]
        epoch = None
        if "EPOCH" in day_df.columns and len(day_df) > 0:
            epoch = str(day_df["EPOCH"].iloc[0]).strip()

        groups = []
        for dl in dose_levels:
            grp = day_df[day_df["dose_level"] == dl]
            titers = grp["titer"].dropna()
            # For BLQ-only groups with no numeric titer, substitute
            if len(titers) == 0 and len(grp) > 0:
                titers = pd.Series([blq_sub] * len(grp))

            n = int(len(grp))
            n_blq = int(grp["blq"].sum())

            if len(titers) > 0:
                log_titers = np.log10(titers.clip(lower=1e-10))
                gmt = float(10 ** log_titers.mean())
                if len(log_titers) >= 2:
                    se = float(log_titers.std() / np.sqrt(len(log_titers)))
                    ci_lower = float(10 ** (log_titers.mean() - 1.96 * se))
                    ci_upper = float(10 ** (log_titers.mean() + 1.96 * se))
                else:
                    ci_lower = gmt
                    ci_upper = gmt
            else:
                gmt = None
                ci_lower = None
                ci_upper = None

            groups.append({
                "dose_level": dl,
                "gmt": round(gmt, 2) if gmt is not None else None,
                "ci_lower": round(ci_lower, 2) if ci_lower is not None else None,
                "ci_upper": round(ci_upper, 2) if ci_upper is not None else None,
                "n": n,
                "n_blq": n_blq,
            })

        # Also include recovery groups at this timepoint
        rec_df = day_df[day_df["is_recovery"]]
        for dl in dose_levels:
            rec_grp = rec_df[rec_df["dose_level"] == dl]
            if len(rec_grp) == 0:
                continue
            titers = rec_grp["titer"].dropna()
            if len(titers) == 0:
                titers = pd.Series([blq_sub] * len(rec_grp))
            n = int(len(rec_grp))
            n_blq = int(rec_grp["blq"].sum())
            log_titers = np.log10(titers.clip(lower=1e-10))
            gmt = float(10 ** log_titers.mean())
            se = float(log_titers.std() / np.sqrt(len(log_titers))) if len(log_titers) >= 2 else 0
            # Mark recovery groups with is_recovery flag
            groups.append({
                "dose_level": dl,
                "gmt": round(gmt, 2),
                "ci_lower": round(10 ** (log_titers.mean() - 1.96 * se), 2) if se > 0 else round(gmt, 2),
                "ci_upper": round(10 ** (log_titers.mean() + 1.96 * se), 2) if se > 0 else round(gmt, 2),
                "n": n,
                "n_blq": n_blq,
                "is_recovery": True,
            })

        result.append({
            "day": int(day) if pd.notna(day) else None,
            "epoch": epoch,
            "groups": groups,
        })

    return result


# ---------------------------------------------------------------------------
# Seroconversion
# ---------------------------------------------------------------------------

def _build_seroconversion(
    sex_df: pd.DataFrame,
    dose_levels: list[int],
    all_days: list[float],
    lloq: float | None,
    baseline_map: dict[str, float],
) -> list[dict]:
    """Build seroconversion array: [{day, groups: [{dose_level, pct_seropositive, pct_4fold_rise, n}]}]."""
    result = []
    for day in all_days:
        day_df = sex_df[sex_df["day"] == day]
        groups = []
        for dl in dose_levels:
            grp = day_df[day_df["dose_level"] == dl]
            n = int(len(grp))
            if n == 0:
                groups.append({"dose_level": dl, "pct_seropositive": None, "pct_4fold_rise": None, "n": 0})
                continue

            # % seropositive: above LLOQ
            n_seropositive = int((~grp["blq"]).sum())

            # % ≥4-fold rise from baseline
            n_4fold = 0
            for _, row in grp.iterrows():
                subj = str(row["USUBJID"]).strip()
                titer = row["titer"]
                bl = baseline_map.get(subj)
                if pd.notna(titer) and bl is not None and bl > 0:
                    if titer >= 4 * bl:
                        n_4fold += 1

            groups.append({
                "dose_level": dl,
                "pct_seropositive": round(n_seropositive / n * 100, 1) if n > 0 else None,
                "pct_4fold_rise": round(n_4fold / n * 100, 1) if n > 0 else None,
                "n": n,
            })

        result.append({
            "day": int(day) if pd.notna(day) else None,
            "groups": groups,
        })

    return result


# ---------------------------------------------------------------------------
# Peak detection & standard stats
# ---------------------------------------------------------------------------

def _find_peak_day(time_course: list[dict], dose_levels: list[int]) -> float | None:
    """Find the timepoint with highest GMT across treated groups."""
    best_day = None
    best_gmt = 0
    for tp in time_course:
        for grp in tp["groups"]:
            if grp["dose_level"] == 0 or grp.get("is_recovery"):
                continue
            gmt = grp.get("gmt") or 0
            if gmt > best_gmt:
                best_gmt = gmt
                best_day = tp["day"]
    return best_day


def _compute_peak_stats(
    sex_df: pd.DataFrame,
    dose_levels: list[int],
    peak_day: float | None,
    blq_sub: float,
) -> tuple[list[dict], list[dict]]:
    """Compute standard group_stats and pairwise at peak timepoint."""
    if peak_day is None:
        return [], []

    peak_df = sex_df[sex_df["day"] == peak_day]
    # Use main study subjects only for the standard comparison
    main_df = peak_df[~peak_df["is_recovery"]]

    group_stats = []
    group_log_values: dict[int, np.ndarray] = {}

    for dl in dose_levels:
        grp = main_df[main_df["dose_level"] == dl]
        titers = grp["titer"].dropna()
        if len(titers) == 0 and len(grp) > 0:
            titers = pd.Series([blq_sub] * len(grp))

        n = int(len(grp))
        if len(titers) > 0:
            log_t = np.log10(titers.clip(lower=1e-10).values)
            group_log_values[dl] = log_t
            gmt = float(10 ** log_t.mean())
            geo_sd = float(10 ** log_t.std()) if len(log_t) >= 2 else None
            group_stats.append({
                "dose_level": dl,
                "n": n,
                "mean": round(gmt, 2),
                "sd": round(geo_sd, 4) if geo_sd is not None else None,
                "median": round(float(10 ** np.median(log_t)), 2),
            })
        else:
            group_stats.append({"dose_level": dl, "n": n, "mean": None, "sd": None, "median": None})

    # Pairwise: Dunnett's on log-transformed values
    control_dl = dose_levels[0] if dose_levels else 0
    control_vals = group_log_values.get(control_dl)
    pairwise = []
    if control_vals is not None and len(control_vals) >= 2:
        treated_groups = [
            (dl, group_log_values[dl])
            for dl in dose_levels
            if dl != control_dl and dl in group_log_values and len(group_log_values[dl]) >= 2
        ]
        if treated_groups:
            pw_results = dunnett_pairwise(control_vals, treated_groups)
            for pw in pw_results:
                dl = pw["dose_level"]
                tv = group_log_values.get(dl)
                es = compute_effect_size(control_vals, tv) if tv is not None else None
                pairwise.append({
                    "dose_level": dl,
                    "p_value": pw.get("p_value"),
                    "p_value_adj": pw.get("p_value_adj") or pw.get("p_value"),
                    "statistic": pw.get("statistic"),
                    "effect_size": round(es, 4) if es is not None else None,
                })

    return group_stats, pairwise


def _compute_trend(
    peak_df: pd.DataFrame, dose_levels: list[int], blq_sub: float,
) -> dict:
    """Trend test on log-transformed titers at peak."""
    main_df = peak_df[~peak_df["is_recovery"]]
    groups = []
    for dl in dose_levels:
        grp = main_df[main_df["dose_level"] == dl]
        titers = grp["titer"].dropna()
        if len(titers) == 0 and len(grp) > 0:
            titers = pd.Series([blq_sub] * len(grp))
        if len(titers) > 0:
            groups.append(np.log10(titers.clip(lower=1e-10).values))
        else:
            groups.append(np.array([]))
    return trend_test(groups)


def _compute_direction(group_stats: list[dict]) -> str | None:
    """Direction based on control vs highest dose GMT."""
    if len(group_stats) < 2:
        return "none"
    ctrl = group_stats[0].get("mean")
    high = group_stats[-1].get("mean")
    if ctrl is None or high is None:
        return "none"
    if high > ctrl:
        return "up"
    if high < ctrl:
        return "down"
    return "none"


def _max_effect_size(pairwise: list[dict]) -> float | None:
    """Max absolute effect size from pairwise results."""
    best = None
    for pw in pairwise:
        es = pw.get("effect_size")
        if es is not None:
            if best is None or abs(es) > abs(best):
                best = es
    return best
