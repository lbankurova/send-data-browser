"""OM (Organ Measurement) domain findings: per (OMSPEC, SEX) → absolute + relative weight stats."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    welch_t_test, cohens_d, trend_test, bonferroni_correct,
)


def compute_om_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from OM domain (organ weights)."""
    if "om" not in study.xpt_files:
        return []

    om_df, _ = read_xpt(study.xpt_files["om"])
    om_df.columns = [c.upper() for c in om_df.columns]

    main_subs = subjects[~subjects["is_recovery"]].copy()
    om_df = om_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    if "OMSTRESN" in om_df.columns:
        om_df["value"] = pd.to_numeric(om_df["OMSTRESN"], errors="coerce")
    elif "OMORRES" in om_df.columns:
        om_df["value"] = pd.to_numeric(om_df["OMORRES"], errors="coerce")
    else:
        return []

    spec_col = "OMSPEC" if "OMSPEC" in om_df.columns else None
    if spec_col is None:
        return []

    # Get terminal body weights for relative organ weight computation
    terminal_bw = {}
    if "bw" in study.xpt_files:
        bw_df, _ = read_xpt(study.xpt_files["bw"])
        bw_df.columns = [c.upper() for c in bw_df.columns]
        if "BWSTRESN" in bw_df.columns:
            bw_df["bw_val"] = pd.to_numeric(bw_df["BWSTRESN"], errors="coerce")
        elif "BWORRES" in bw_df.columns:
            bw_df["bw_val"] = pd.to_numeric(bw_df["BWORRES"], errors="coerce")
        else:
            bw_df["bw_val"] = np.nan
        if "BWDY" in bw_df.columns:
            bw_df["BWDY"] = pd.to_numeric(bw_df["BWDY"], errors="coerce")
            # Terminal = last timepoint per subject
            terminal = bw_df.sort_values("BWDY").groupby("USUBJID").last()
            terminal_bw = terminal["bw_val"].to_dict()

    unit_col = "OMSTRESU" if "OMSTRESU" in om_df.columns else None
    test_col = "OMTESTCD" if "OMTESTCD" in om_df.columns else None

    findings = []

    # Group by specimen and sex; also separate by test code if available (absolute vs relative)
    group_cols = [spec_col, "SEX"]
    if test_col:
        group_cols.insert(1, test_col)

    grouped = om_df.groupby(group_cols)

    for keys, grp in grouped:
        if test_col:
            specimen, testcd, sex = keys
        else:
            specimen, sex = keys
            testcd = "OMWT"

        if grp["value"].isna().all():
            continue

        unit = str(grp[unit_col].iloc[0]) if unit_col and unit_col in grp.columns else "g"
        if unit == "nan":
            unit = "g"

        # Also compute relative organ weight (organ/body weight ratio × 100)
        if terminal_bw:
            grp = grp.copy()
            grp["tbw"] = grp["USUBJID"].map(terminal_bw)
            grp["relative"] = np.where(
                grp["tbw"] > 0,
                (grp["value"] / grp["tbw"]) * 100,
                np.nan,
            )
        else:
            grp = grp.copy()
            grp["relative"] = np.nan

        group_stats = []
        control_values = None
        dose_groups_values = []

        for dose_level in sorted(grp["dose_level"].unique()):
            dose_grp = grp[grp["dose_level"] == dose_level]
            vals = dose_grp["value"].dropna().values
            rel_vals = dose_grp["relative"].dropna().values

            if len(vals) == 0:
                group_stats.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                    "mean_relative": None,
                })
                dose_groups_values.append(np.array([]))
                continue

            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 4),
                "sd": round(float(np.std(vals, ddof=1)), 4) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 4),
                "mean_relative": round(float(np.mean(rel_vals)), 4) if len(rel_vals) > 0 else None,
            })
            dose_groups_values.append(vals)
            if dose_level == 0:
                control_values = vals

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
                    pct = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
                    direction = "up" if pct > 0 else "down" if pct < 0 else "none"

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

        finding_name = f"{specimen} ({testcd})" if testcd != "OMWT" else str(specimen)

        findings.append({
            "domain": "OM",
            "test_code": str(testcd),
            "test_name": finding_name,
            "specimen": str(specimen),
            "finding": finding_name,
            "day": None,
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
