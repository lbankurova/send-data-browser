"""LB (Laboratory) domain findings: per (LBTESTCD, LBDY, SEX) → group stats."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    dunnett_pairwise, cohens_d, trend_test,
)


def compute_lb_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from LB domain."""
    if "lb" not in study.xpt_files:
        return []

    lb_df, _ = read_xpt(study.xpt_files["lb"])
    lb_df.columns = [c.upper() for c in lb_df.columns]

    # Merge with subject info (main study only, exclude TK satellites)
    main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
    lb_df = lb_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # LB special case: only exclude early-death subjects from their terminal timepoint
    # (max VISITDY per subject), not from earlier longitudinal visits
    if excluded_subjects:
        lb_df["LBDY"] = pd.to_numeric(lb_df.get("LBDY", pd.Series(dtype=float)), errors="coerce")
        max_day = lb_df.groupby("USUBJID")["LBDY"].transform("max")
        terminal_mask = lb_df["LBDY"] == max_day
        exclude_mask = terminal_mask & lb_df["USUBJID"].isin(excluded_subjects)
        lb_df = lb_df[~exclude_mask]

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
        dose_groups_subj = []

        for dose_level in sorted(grp["dose_level"].unique()):
            dose_data = grp[grp["dose_level"] == dose_level].dropna(subset=["value"])
            vals = dose_data["value"].values
            subj_vals = dict(zip(dose_data["USUBJID"].values, dose_data["value"].values.astype(float)))
            if len(vals) == 0:
                group_stats.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                })
                dose_groups_values.append(np.array([]))
                dose_groups_subj.append({})
                continue

            # 4-decimal precision: LB values from analytical instruments (chemistry analyzers)
            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 4),
                "sd": round(float(np.std(vals, ddof=1)), 4) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 4),
            })
            dose_groups_values.append(vals)
            dose_groups_subj.append(subj_vals)
            if dose_level == 0:
                control_values = vals

        # REM-28: Dunnett's test (each dose vs control, FWER-controlled)
        pairwise = []
        if control_values is not None and len(control_values) >= 2:
            treated = [
                (int(dl), grp[grp["dose_level"] == dl]["value"].dropna().values)
                for dl in sorted(grp["dose_level"].unique()) if dl != 0
            ]
            pairwise = dunnett_pairwise(control_values, treated)

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

        # Override direction with max_d sign — the strongest statistical signal
        # is more reliable than comparing high dose to control (which can be noise)
        if max_d is not None and abs(max_d) > 0.01:
            direction = "up" if max_d > 0 else "down"

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
            "raw_values": dose_groups_values,
            "raw_subject_values": dose_groups_subj,
        })

    return findings
