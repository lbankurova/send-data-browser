"""LB (Laboratory) domain findings: per (LBTESTCD, LBDY, SEX) → group stats."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    welch_t_test, cohens_d, trend_test, bonferroni_correct,
)


def compute_lb_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from LB domain."""
    if "lb" not in study.xpt_files:
        return []

    lb_df, _ = read_xpt(study.xpt_files["lb"])
    lb_df.columns = [c.upper() for c in lb_df.columns]

    # Merge with subject info (main study only)
    main_subs = subjects[~subjects["is_recovery"]].copy()
    lb_df = lb_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Parse numeric result
    if "LBSTRESN" in lb_df.columns:
        lb_df["value"] = pd.to_numeric(lb_df["LBSTRESN"], errors="coerce")
    elif "LBORRES" in lb_df.columns:
        lb_df["value"] = pd.to_numeric(lb_df["LBORRES"], errors="coerce")
    else:
        return []

    # Get timepoint column
    day_col = "LBDY" if "LBDY" in lb_df.columns else None
    if day_col is None:
        lb_df["LBDY"] = 1
        day_col = "LBDY"

    lb_df["LBDY"] = pd.to_numeric(lb_df["LBDY"], errors="coerce")

    # Get test code and unit
    test_col = "LBTESTCD" if "LBTESTCD" in lb_df.columns else None
    test_name_col = "LBTEST" if "LBTEST" in lb_df.columns else None
    unit_col = "LBSTRESU" if "LBSTRESU" in lb_df.columns else None

    if test_col is None:
        return []

    findings = []
    grouped = lb_df.groupby([test_col, "LBDY", "SEX"])

    for (testcd, day, sex), grp in grouped:
        if grp["value"].isna().all():
            continue

        day_val = int(day) if not np.isnan(day) else None
        test_name = grp[test_name_col].iloc[0] if test_name_col and test_name_col in grp.columns else str(testcd)
        unit = str(grp[unit_col].iloc[0]) if unit_col and unit_col in grp.columns else ""
        if unit == "nan":
            unit = ""

        # Group stats: per dose level
        group_stats = []
        control_values = None
        dose_groups_values = []

        for dose_level in sorted(grp["dose_level"].unique()):
            vals = grp[grp["dose_level"] == dose_level]["value"].dropna().values
            if len(vals) == 0:
                group_stats.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                })
                dose_groups_values.append(np.array([]))
                continue

            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 4),
                "sd": round(float(np.std(vals, ddof=1)), 4) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 4),
            })
            dose_groups_values.append(vals)
            if dose_level == 0:
                control_values = vals

        # Pairwise tests (each dose vs control)
        pairwise = []
        raw_p_values = []
        if control_values is not None and len(control_values) >= 2:
            for dose_level in sorted(grp["dose_level"].unique()):
                if dose_level == 0:
                    continue
                treat_vals = grp[grp["dose_level"] == dose_level]["value"].dropna().values
                result = welch_t_test(treat_vals, control_values)
                d = cohens_d(treat_vals, control_values)
                raw_p_values.append(result["p_value"])
                pairwise.append({
                    "dose_level": int(dose_level),
                    "p_value": result["p_value"],
                    "statistic": result["statistic"],
                    "cohens_d": round(d, 4) if d is not None else None,
                })

        # Bonferroni correction
        corrected = bonferroni_correct(raw_p_values)
        for i, pw in enumerate(pairwise):
            pw["p_value_adj"] = round(corrected[i], 6) if corrected[i] is not None else None

        # Trend test
        trend_result = trend_test(dose_groups_values) if len(dose_groups_values) >= 2 else {"statistic": None, "p_value": None}

        # Direction: compare high dose mean to control mean
        direction = None
        if control_values is not None and len(control_values) > 0 and len(dose_groups_values) > 0:
            high_dose_vals = dose_groups_values[-1]
            if len(high_dose_vals) > 0:
                ctrl_mean = float(np.mean(control_values))
                high_mean = float(np.mean(high_dose_vals))
                if ctrl_mean != 0:
                    pct_change = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
                    direction = "up" if pct_change > 0 else "down" if pct_change < 0 else "none"
                else:
                    direction = "up" if high_mean > 0 else "down" if high_mean < 0 else "none"

        # Max effect size across pairwise
        max_d = None
        for pw in pairwise:
            if pw["cohens_d"] is not None:
                if max_d is None or abs(pw["cohens_d"]) > abs(max_d):
                    max_d = pw["cohens_d"]

        # Min adjusted p-value
        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "LB",
            "test_code": str(testcd),
            "test_name": str(test_name),
            "specimen": None,
            "finding": str(test_name),
            "day": day_val,
            "sex": str(sex),
            "unit": unit,
            "data_type": "continuous",
            "group_stats": group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": max_d,
            "min_p_adj": min_p,
        })

    return findings
