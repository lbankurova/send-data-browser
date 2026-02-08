"""BW (Body Weight) domain findings: per (BWDY, SEX) → group stats + % change from baseline."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    welch_t_test, cohens_d, trend_test, bonferroni_correct,
)


def compute_bw_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from BW domain."""
    if "bw" not in study.xpt_files:
        return []

    bw_df, _ = read_xpt(study.xpt_files["bw"])
    bw_df.columns = [c.upper() for c in bw_df.columns]

    # Merge with subject info (main study only)
    main_subs = subjects[~subjects["is_recovery"]].copy()
    bw_df = bw_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Parse numeric result
    if "BWSTRESN" in bw_df.columns:
        bw_df["value"] = pd.to_numeric(bw_df["BWSTRESN"], errors="coerce")
    elif "BWORRES" in bw_df.columns:
        bw_df["value"] = pd.to_numeric(bw_df["BWORRES"], errors="coerce")
    else:
        return []

    day_col = "BWDY" if "BWDY" in bw_df.columns else None
    if day_col is None:
        bw_df["BWDY"] = 1
    bw_df["BWDY"] = pd.to_numeric(bw_df["BWDY"], errors="coerce")

    unit_col = "BWSTRESU" if "BWSTRESU" in bw_df.columns else None

    # Compute baseline per subject (first timepoint)
    baseline = bw_df.sort_values("BWDY").groupby("USUBJID")["value"].first().to_dict()
    bw_df["baseline"] = bw_df["USUBJID"].map(baseline)
    bw_df["pct_change"] = np.where(
        bw_df["baseline"] > 0,
        ((bw_df["value"] - bw_df["baseline"]) / bw_df["baseline"]) * 100,
        np.nan,
    )

    findings = []
    grouped = bw_df.groupby(["BWDY", "SEX"])

    for (day, sex), grp in grouped:
        if grp["value"].isna().all():
            continue

        day_val = int(day) if not np.isnan(day) else None
        unit = str(grp[unit_col].iloc[0]) if unit_col and unit_col in grp.columns else "g"
        if unit == "nan":
            unit = "g"

        group_stats = []
        control_values = None
        dose_groups_values = []

        for dose_level in sorted(grp["dose_level"].unique()):
            vals = grp[grp["dose_level"] == dose_level]["value"].dropna().values
            pct_vals = grp[grp["dose_level"] == dose_level]["pct_change"].dropna().values

            if len(vals) == 0:
                group_stats.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                    "mean_pct_change": None,
                })
                dose_groups_values.append(np.array([]))
                continue

            # 2-decimal precision: BW from balance measurement (grams)
            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 2),
                "sd": round(float(np.std(vals, ddof=1)), 2) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 2),
                "mean_pct_change": round(float(np.mean(pct_vals)), 2) if len(pct_vals) > 0 else None,
            })
            dose_groups_values.append(vals)
            if dose_level == 0:
                control_values = vals

        # Pairwise tests
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

        corrected = bonferroni_correct(raw_p_values)
        for i, pw in enumerate(pairwise):
            pw["p_value_adj"] = round(corrected[i], 6) if corrected[i] is not None else None

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

        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "BW",
            "test_code": "BW",
            "test_name": "Body Weight",
            "specimen": None,
            "finding": "Body Weight",
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
        })

    return findings
