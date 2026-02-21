"""EG (Electrocardiogram) domain findings: per (EGTESTCD, EGDY, SEX) → group stats + pairwise tests."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    dunnett_pairwise, cohens_d, trend_test,
)


def compute_eg_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from EG domain."""
    if "eg" not in study.xpt_files:
        return []

    eg_df, _ = read_xpt(study.xpt_files["eg"])
    eg_df.columns = [c.upper() for c in eg_df.columns]

    # Merge with subject info (main study only, exclude TK satellites)
    main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
    eg_df = eg_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Parse numeric result
    if "EGSTRESN" in eg_df.columns:
        eg_df["value"] = pd.to_numeric(eg_df["EGSTRESN"], errors="coerce")
    elif "EGORRES" in eg_df.columns:
        eg_df["value"] = pd.to_numeric(eg_df["EGORRES"], errors="coerce")
    else:
        return []

    # Day column
    if "EGDY" in eg_df.columns:
        eg_df["EGDY"] = pd.to_numeric(eg_df["EGDY"], errors="coerce")
    else:
        eg_df["EGDY"] = 1

    # Test code / test name
    has_testcd = "EGTESTCD" in eg_df.columns
    if not has_testcd:
        eg_df["EGTESTCD"] = "EG"
    has_test = "EGTEST" in eg_df.columns

    unit_col = "EGSTRESU" if "EGSTRESU" in eg_df.columns else (
        "EGORRESU" if "EGORRESU" in eg_df.columns else None
    )

    findings = []
    grouped = eg_df.groupby(["EGTESTCD", "EGDY", "SEX"])

    for (testcd, day, sex), grp in grouped:
        if grp["value"].isna().all():
            continue

        day_val = int(day) if not np.isnan(day) else None
        unit = str(grp[unit_col].iloc[0]) if unit_col and unit_col in grp.columns else "ms"
        if unit == "nan":
            unit = "ms"

        test_name = str(grp["EGTEST"].iloc[0]) if has_test else str(testcd)

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
                for dl in sorted(grp["dose_level"].unique()) if dl != 0
            ]
            pairwise = dunnett_pairwise(control_values, treated)

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
            if pw["cohens_d"] is not None:
                if max_d is None or abs(pw["cohens_d"]) > abs(max_d):
                    max_d = pw["cohens_d"]

        if max_d is not None and abs(max_d) > 0.01:
            direction = "up" if max_d > 0 else "down"

        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "EG",
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
