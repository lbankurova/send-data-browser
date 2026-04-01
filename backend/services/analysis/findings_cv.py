"""CV (Cardiovascular) domain findings: per (CVTESTCD, CVDY, SEX) -> group stats + pairwise tests."""

import numpy as np
import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.analysis.statistics import (
    dunnett_pairwise, welch_pairwise, compute_effect_size, trend_test,
)
from services.analysis.pl_utils import (
    read_xpt_as_polars, subjects_to_polars,
    get_treatment_subjects_pl, filter_treatment_period_records_pl,
)


def compute_cv_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from CV domain (cardiovascular hemodynamic telemetry)."""
    if "cv" not in study.xpt_files:
        return []

    cv_df = read_xpt_as_polars(study.xpt_files["cv"])
    subs = subjects_to_polars(subjects)

    # Merge with treatment-period subjects (main + recovery, exclude TK satellites)
    treatment_subs = get_treatment_subjects_pl(subs).select(["USUBJID", "SEX", "dose_level"])
    cv_df = cv_df.join(treatment_subs, on="USUBJID", how="inner")

    # Parse numeric result
    if "CVSTRESN" in cv_df.columns:
        cv_df = cv_df.with_columns(pl.col("CVSTRESN").cast(pl.Float64, strict=False).alias("value"))
    elif "CVORRES" in cv_df.columns:
        cv_df = cv_df.with_columns(pl.col("CVORRES").cast(pl.Float64, strict=False).alias("value"))
    else:
        return []

    # Day column: CVDY preferred, VISITDY fallback
    day_col = "CVDY" if "CVDY" in cv_df.columns else ("VISITDY" if "VISITDY" in cv_df.columns else None)
    if day_col and day_col in cv_df.columns:
        cv_df = cv_df.with_columns(pl.col(day_col).cast(pl.Float64, strict=False).alias("CVDY"))
    else:
        cv_df = cv_df.with_columns(pl.lit(1.0).alias("CVDY"))

    # Filter recovery animals' records to treatment period only
    cv_df = filter_treatment_period_records_pl(cv_df, subs, "CVDY", last_dosing_day)

    # Test code / test name
    has_testcd = "CVTESTCD" in cv_df.columns
    if not has_testcd:
        cv_df = cv_df.with_columns(pl.lit("CV").alias("CVTESTCD"))
    has_test = "CVTEST" in cv_df.columns

    unit_col = "CVSTRESU" if "CVSTRESU" in cv_df.columns else (
        "CVORRESU" if "CVORRESU" in cv_df.columns else None
    )

    findings = []

    for (testcd, day, sex), grp in cv_df.group_by(["CVTESTCD", "CVDY", "SEX"], maintain_order=True):

        vals_series = grp["value"].drop_nulls()
        if vals_series.len() == 0:
            continue

        day_val = int(day) if day is not None and not np.isnan(day) else None
        unit = str(grp[unit_col][0]) if unit_col and unit_col in grp.columns else None
        if unit in ("None", "null", "nan"):
            unit = None

        test_name = str(grp["CVTEST"][0]) if has_test else str(testcd)

        group_stats = []
        control_values = None
        dose_groups_values = []
        dose_groups_subj = []

        for dose_level in sorted(grp["dose_level"].unique().to_list()):
            dose_data = grp.filter(
                (pl.col("dose_level") == dose_level) & pl.col("value").is_not_null()
            )
            vals = dose_data["value"].to_numpy()
            subj_ids = dose_data["USUBJID"].to_list()
            subj_vals = dict(zip(subj_ids, vals.astype(float)))

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

        # Dunnett's test (each dose vs control, FWER-controlled)
        pairwise = []
        if control_values is not None and len(control_values) >= 2:
            treated = [
                (int(dl), grp.filter(
                    (pl.col("dose_level") == dl) & pl.col("value").is_not_null()
                )["value"].to_numpy())
                for dl in sorted(grp["dose_level"].unique().to_list()) if dl > 0
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
            "domain": "CV",
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
