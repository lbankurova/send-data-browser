"""BG (Body Weight Gain) domain findings: per (BGTESTCD, BGDY, BGENDY, SEX) → group stats + pairwise tests.

BG records are interval-based: each row covers a (BGDY → BGENDY) period.
A single subject can have multiple records at the same BGDY (e.g., day 1→29
and day 1→92 for cumulative gain).  Grouping must include BGENDY to avoid
inflating N by counting multiple intervals per subject as separate observations.
"""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    dunnett_pairwise, welch_pairwise, compute_effect_size, trend_test,
)
from services.analysis.phase_filter import (
    get_treatment_subjects, filter_treatment_period_records,
)


def compute_bg_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from BG domain."""
    if "bg" not in study.xpt_files:
        return []

    bg_df, _ = read_xpt(study.xpt_files["bg"])
    bg_df.columns = [c.upper() for c in bg_df.columns]

    # Merge with treatment-period subjects (main + recovery, exclude TK satellites)
    treatment_subs = get_treatment_subjects(subjects)
    bg_df = bg_df.merge(treatment_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Parse numeric result
    if "BGSTRESN" in bg_df.columns:
        bg_df["value"] = pd.to_numeric(bg_df["BGSTRESN"], errors="coerce")
    elif "BGORRES" in bg_df.columns:
        bg_df["value"] = pd.to_numeric(bg_df["BGORRES"], errors="coerce")
    else:
        return []

    # Day columns — BG is interval-based (BGDY → BGENDY)
    if "BGDY" in bg_df.columns:
        bg_df["BGDY"] = pd.to_numeric(bg_df["BGDY"], errors="coerce")
    else:
        bg_df["BGDY"] = 1

    has_endy = "BGENDY" in bg_df.columns
    if has_endy:
        bg_df["BGENDY"] = pd.to_numeric(bg_df["BGENDY"], errors="coerce")

    # Filter recovery animals' records to treatment period only.
    # Use BGENDY (interval end) when available — a cumulative record ending
    # after last_dosing_day spans into the recovery period.
    filter_col = "BGENDY" if has_endy else "BGDY"
    bg_df = filter_treatment_period_records(bg_df, subjects, filter_col, last_dosing_day)

    # Drop cumulative intervals: when a subject has multiple records ending
    # on the same day (e.g., 1→92 cumulative AND 85→92 period), keep only
    # the adjacent-period record (latest BGDY for each BGENDY).
    if has_endy:
        bg_df = bg_df.sort_values("BGDY").drop_duplicates(
            subset=["USUBJID", "BGTESTCD", "BGENDY"],
            keep="last",
        )

    # Test code / test name
    has_testcd = "BGTESTCD" in bg_df.columns
    if not has_testcd:
        bg_df["BGTESTCD"] = "BWGAIN"
    has_test = "BGTEST" in bg_df.columns

    unit_col = "BGSTRESU" if "BGSTRESU" in bg_df.columns else (
        "BGORRESU" if "BGORRESU" in bg_df.columns else None
    )

    # Group by interval (BGDY, BGENDY) to avoid inflating N when a subject
    # has multiple intervals starting on the same day (e.g., day 1→29 and day 1→92).
    findings = []
    group_cols = ["BGTESTCD", "BGDY", "SEX"]
    if has_endy:
        group_cols = ["BGTESTCD", "BGDY", "BGENDY", "SEX"]
    grouped = bg_df.groupby(group_cols)

    for keys, grp in grouped:
        if has_endy:
            testcd, start_day, end_day, sex = keys
        else:
            testcd, start_day, sex = keys
            end_day = start_day

        if grp["value"].isna().all():
            continue

        # Use end day as the finding timepoint (meaningful for interval data)
        day_val = int(end_day) if not np.isnan(end_day) else None
        unit = str(grp[unit_col].iloc[0]) if unit_col and unit_col in grp.columns else "g"
        if unit == "nan":
            unit = "g"

        test_name = str(grp["BGTEST"].iloc[0]) if has_test else "Body Weight Gain"

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

            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 2),
                "sd": round(float(np.std(vals, ddof=1)), 2) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 2),
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
                for dl in sorted(grp["dose_level"].unique()) if dl > 0
            ]
            pairwise = dunnett_pairwise(control_values, treated)
            welch = welch_pairwise(control_values, treated)
            welch_map = {w["dose_level"]: w for w in welch}
            for pw in pairwise:
                pw["p_value_welch"] = welch_map.get(pw["dose_level"], {}).get("p_value_welch")

        trend_result = trend_test(dose_groups_values) if len(dose_groups_values) >= 2 else {"statistic": None, "p_value": None}

        direction = None
        if control_values is not None and len(control_values) > 0 and len(dose_groups_values) > 0:
            high_dose_vals = dose_groups_values[-1]
            if len(high_dose_vals) > 0:
                ctrl_mean = float(np.mean(control_values))
                high_mean = float(np.mean(high_dose_vals))
                if ctrl_mean != 0:
                    pct_change = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
                    direction = "up" if pct_change > 0 else "down" if pct_change < 0 else "none"

        max_d = None
        for pw in pairwise:
            if pw["effect_size"] is not None:
                if max_d is None or abs(pw["effect_size"]) > abs(max_d):
                    max_d = pw["effect_size"]

        if max_d is not None and abs(max_d) > 0.01:
            direction = "up" if max_d > 0 else "down"

        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "BG",
            "test_code": str(testcd),
            "test_name": test_name,
            "specimen": None,
            "finding": test_name,
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
