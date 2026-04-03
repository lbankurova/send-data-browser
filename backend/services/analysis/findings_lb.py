"""LB (Laboratory) domain findings: per (LBTESTCD, LBDY, SEX) -> group stats."""

import numpy as np
import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    dunnett_pairwise, welch_pairwise, compute_effect_size, trend_test,
)
from services.analysis.pl_utils import (
    read_xpt_as_polars, subjects_to_polars,
    get_treatment_subjects_pl, filter_treatment_period_records_pl,
)


def compute_lb_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from LB domain."""
    if "lb" not in study.xpt_files:
        return []

    lb_df = read_xpt_as_polars(study.xpt_files["lb"])
    subs = subjects_to_polars(subjects)

    # Merge with treatment-period subjects (main + recovery, exclude TK satellites)
    treatment_subs = get_treatment_subjects_pl(subs).select(["USUBJID", "SEX", "dose_level"])
    lb_df = lb_df.join(treatment_subs, on="USUBJID", how="inner")

    # LB special case: only exclude early-death subjects from their terminal timepoint
    # (max LBDY per subject), not from earlier longitudinal visits
    if "LBDY" in lb_df.columns:
        lb_df = lb_df.with_columns(pl.col("LBDY").cast(pl.Float64, strict=False))
    else:
        lb_df = lb_df.with_columns(pl.lit(1.0).alias("LBDY"))

    if excluded_subjects:
        lb_df = lb_df.with_columns(
            pl.col("LBDY").max().over("USUBJID").alias("_max_day")
        )
        terminal_and_excluded = (
            (pl.col("LBDY") == pl.col("_max_day"))
            & pl.col("USUBJID").is_in(list(excluded_subjects))
        )
        lb_df = lb_df.filter(~terminal_and_excluded).drop("_max_day")

    # Filter recovery animals' records to treatment period only
    lb_df = filter_treatment_period_records_pl(lb_df, subs, "LBDY", last_dosing_day)

    # Parse numeric result
    if "LBSTRESN" in lb_df.columns:
        lb_df = lb_df.with_columns(pl.col("LBSTRESN").cast(pl.Float64, strict=False).alias("value"))
    elif "LBORRES" in lb_df.columns:
        lb_df = lb_df.with_columns(pl.col("LBORRES").cast(pl.Float64, strict=False).alias("value"))
    else:
        return []

    # Apply SUPPLB LBCALCN imputation for missing numeric values
    if lb_df["value"].null_count() > 0 and "supplb" in study.xpt_files and "LBSEQ" in lb_df.columns:
        try:
            supp_df, _ = read_xpt(study.xpt_files["supplb"])
            supp_df.columns = [c.upper() for c in supp_df.columns]
            calcn = supp_df[supp_df["QNAM"].astype(str).str.strip().str.upper() == "LBCALCN"]
            if len(calcn) > 0:
                calcn_map: dict[tuple[str, int], float | None] = {}
                for _, r in calcn.iterrows():
                    key = (str(r["USUBJID"]).strip(), int(float(r["IDVARVAL"])))
                    calcn_map[key] = pd.to_numeric(r["QVAL"], errors="coerce")
                # Apply via Polars: build a small lookup DataFrame
                if calcn_map:
                    lookup_rows = [
                        {"_lookup_subj": k[0], "_lookup_seq": k[1], "_imputed": v}
                        for k, v in calcn_map.items() if v is not None and not np.isnan(v)
                    ]
                    if lookup_rows:
                        lookup_df = pl.DataFrame(lookup_rows)
                        lb_df = lb_df.with_columns(
                            pl.col("LBSEQ").cast(pl.Float64, strict=False).cast(pl.Int64, strict=False).alias("_seq_int")
                        )
                        lb_df = lb_df.join(
                            lookup_df,
                            left_on=["USUBJID", "_seq_int"],
                            right_on=["_lookup_subj", "_lookup_seq"],
                            how="left",
                        )
                        lb_df = lb_df.with_columns(
                            pl.when(pl.col("value").is_null())
                            .then(pl.col("_imputed"))
                            .otherwise(pl.col("value"))
                            .alias("value")
                        ).drop(["_seq_int", "_imputed"])
        except Exception:
            pass  # SUPPLB parsing failed -- proceed without imputation

    # Test code and unit
    has_testcd = "LBTESTCD" in lb_df.columns
    if not has_testcd:
        return []
    has_test_name = "LBTEST" in lb_df.columns
    unit_col = "LBSTRESU" if "LBSTRESU" in lb_df.columns else None

    findings = []

    for (testcd, day, sex), grp in lb_df.group_by(["LBTESTCD", "LBDY", "SEX"], maintain_order=True):
        vals_series = grp["value"].drop_nulls()
        if vals_series.len() == 0:
            continue

        day_val = int(day) if day is not None and not np.isnan(day) else None
        test_name = str(grp["LBTEST"][0]) if has_test_name else str(testcd)
        unit = str(grp[unit_col][0]) if unit_col and unit_col in grp.columns else ""
        if unit in ("None", "null", "nan"):
            unit = ""

        group_stats = []
        control_values = None
        dose_groups_values = []
        dose_groups_subj = []

        for dose_level in sorted(grp["dose_level"].unique().to_list()):
            dose_data = grp.filter(
                (pl.col("dose_level") == dose_level) & pl.col("value").is_not_null()
            )
            vals = dose_data["value"].to_numpy()
            subj_vals = dict(zip(dose_data["USUBJID"].to_list(), vals.astype(float)))

            if len(vals) == 0:
                group_stats.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                })
                dose_groups_values.append(np.array([]))
                dose_groups_subj.append({})
                continue

            # 4-decimal precision: LB values from analytical instruments
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

        # REM-28: Dunnett's test
        pairwise = []
        if control_values is not None and len(control_values) >= 2:
            treated = [
                (int(dl), grp.filter(
                    (pl.col("dose_level") == dl) & pl.col("value").is_not_null()
                )["value"].to_numpy())
                for dl in sorted(grp["dose_level"].unique().to_list()) if dl > 0
            ]
            # LOO influential subject: pass USUBJID lists for index-to-ID mapping
            all_dls = sorted(grp["dose_level"].unique().to_list())
            ctrl_ids = list(dose_groups_subj[0].keys()) if dose_groups_subj and dose_groups_subj[0] else None
            t_ids: dict[int, list[str]] = {}
            for j, dl in enumerate(all_dls):
                if dl > 0 and j < len(dose_groups_subj) and dose_groups_subj[j]:
                    t_ids[int(dl)] = list(dose_groups_subj[j].keys())
            pairwise = dunnett_pairwise(control_values, treated, control_ids=ctrl_ids, treated_ids=t_ids or None)
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
                else:
                    direction = "up" if high_mean > 0 else "down" if high_mean < 0 else "none"

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
