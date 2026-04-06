"""OM (Organ Measurement) domain findings: per (OMSPEC, SEX) -> absolute + relative weight stats.

Normalization-aware pipeline: stats run on the biologically recommended metric
per organ category (absolute, ratio-to-BW, ratio-to-brain), with alternatives
computed for all available metrics. Williams' step-down test runs alongside
JT and Dunnett's for trend concordance checking.

Root fix: SPEC-NST-AMD-000 -- previously all stats ran on absolute values
regardless of organ type.
"""

import numpy as np
import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    dunnett_pairwise, welch_pairwise, compute_effect_size, trend_test,
)
from services.analysis.williams import williams_from_group_stats
from services.analysis.normalization import (
    get_organ_category, decide_metric, compute_hedges_g, compute_bw_tier,
)
from services.analysis.ancova import ancova_from_dose_groups
from services.analysis.day_utils import mode_day
from services.analysis.pl_utils import read_xpt_as_polars, subjects_to_polars
from services.analysis.organ_thresholds import get_species, _resolve_species_category


# Dog organs with CV > 20% where percentage thresholds are unreliable (Choi 2011).
# Maps organ -> approximate CV description for the alert message.
_DOG_HIGH_CV_ORGANS_ALL: dict[str, str] = {
    "PROSTATE": "CV > 60%",
    "OVARIES": "CV > 60%",
    "UTERUS": "CV > 60%",
    "THYMUS": "CV > 25%",
    "TESTES": "CV > 20%",
}
_DOG_HIGH_CV_ORGANS_FEMALE: dict[str, str] = {
    "LIVER": "CV > 20%",
    "KIDNEY": "CV > 20%",
}


def _get_threshold_reliability(
    specimen: str, sex: str, species_cat: str | None,
) -> dict | None:
    """Return threshold_reliability alert for high-CV dog organs, or None."""
    if species_cat != "dog":
        return None
    spec_upper = specimen.strip().upper()
    is_female = sex.strip().upper() == "F"
    if spec_upper in _DOG_HIGH_CV_ORGANS_ALL:
        cv_desc = _DOG_HIGH_CV_ORGANS_ALL[spec_upper]
        return {
            "level": "low",
            "message": f"{cv_desc} in beagle -- ANCOVA recommended over percentage thresholds",
        }
    if is_female and spec_upper in _DOG_HIGH_CV_ORGANS_FEMALE:
        cv_desc = _DOG_HIGH_CV_ORGANS_FEMALE[spec_upper]
        return {
            "level": "low",
            "message": f"{cv_desc} in female beagle -- ANCOVA recommended over percentage thresholds",
        }
    return None


def _compute_metric_stats(
    dose_groups_values: list[np.ndarray],
    dose_levels: list[int],
    dose_groups_subj: list[dict] | None = None,
) -> tuple[list[dict], list[dict], dict]:
    """Run Dunnett's + Welch + JT + Hedges' g on a set of dose-group arrays.

    Returns: (pairwise, group_stats_summary, trend_result)
    """
    control_values = None
    group_stats = []

    for i, (dl, vals) in enumerate(zip(dose_levels, dose_groups_values)):
        vals_clean = vals[~np.isnan(vals)] if len(vals) > 0 else vals
        if dl == 0 or i == 0:
            control_values = vals_clean

        if len(vals_clean) == 0:
            group_stats.append({
                "dose_level": int(dl), "n": 0,
                "mean": None, "sd": None, "median": None,
            })
        else:
            group_stats.append({
                "dose_level": int(dl),
                "n": int(len(vals_clean)),
                "mean": round(float(np.mean(vals_clean)), 4),
                "sd": round(float(np.std(vals_clean, ddof=1)), 4) if len(vals_clean) > 1 else None,
                "median": round(float(np.median(vals_clean)), 4),
            })

    pairwise = []
    if control_values is not None and len(control_values) >= 2:
        treated = [
            (int(dl), vals[~np.isnan(vals)] if len(vals) > 0 else vals)
            for dl, vals in zip(dose_levels, dose_groups_values) if dl > 0
        ]
        treated = [(dl, v) for dl, v in treated if len(v) >= 1]
        if treated:
            # LOO influential subject: pass USUBJID lists if available
            ctrl_ids: list[str] | None = None
            t_ids: dict[int, list[str]] | None = None
            if dose_groups_subj:
                ctrl_ids = list(dose_groups_subj[0].keys()) if dose_groups_subj[0] else None
                t_ids_map: dict[int, list[str]] = {}
                for j, dl in enumerate(dose_levels):
                    if dl > 0 and j < len(dose_groups_subj) and dose_groups_subj[j]:
                        t_ids_map[int(dl)] = list(dose_groups_subj[j].keys())
                t_ids = t_ids_map or None
            pairwise = dunnett_pairwise(control_values, treated, control_ids=ctrl_ids, treated_ids=t_ids)
            welch = welch_pairwise(control_values, treated)
            welch_map = {w["dose_level"]: w for w in welch}
            for pw in pairwise:
                pw["p_value_welch"] = welch_map.get(pw["dose_level"], {}).get("p_value_welch")

    trend_result = (
        trend_test(dose_groups_values)
        if len(dose_groups_values) >= 2
        else {"statistic": None, "p_value": None}
    )

    return pairwise, group_stats, trend_result


def compute_om_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from OM domain (organ weights)."""
    if "om" not in study.xpt_files:
        return []

    # Extract species for threshold reliability alerts
    raw_species = get_species(study)
    species_cat = _resolve_species_category(raw_species)

    om_pl = read_xpt_as_polars(study.xpt_files["om"])
    subs = subjects_to_polars(subjects)

    if "OMDY" in om_pl.columns:
        om_pl = om_pl.with_columns(pl.col("OMDY").cast(pl.Float64, strict=False))

    main_subs = subs.filter(~pl.col("is_recovery") & ~pl.col("is_satellite"))
    if excluded_subjects:
        main_subs = main_subs.filter(~pl.col("USUBJID").is_in(list(excluded_subjects)))
    om_pl = om_pl.join(main_subs.select(["USUBJID", "SEX", "dose_level"]), on="USUBJID", how="inner")

    if "OMSTRESN" in om_pl.columns:
        om_pl = om_pl.with_columns(pl.col("OMSTRESN").cast(pl.Float64, strict=False).alias("value"))
    elif "OMORRES" in om_pl.columns:
        om_pl = om_pl.with_columns(pl.col("OMORRES").cast(pl.Float64, strict=False).alias("value"))
    else:
        return []

    spec_col = "OMSPEC" if "OMSPEC" in om_pl.columns else None
    if spec_col is None:
        return []

    # Convert to pandas for the complex normalization + Williams' + ANCOVA logic
    om_df = om_pl.to_pandas()

    # ── Load terminal body weights ──
    terminal_bw: dict[str, float] = {}
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
            terminal = bw_df.sort_values("BWDY").groupby("USUBJID").last()
            terminal_bw = terminal["bw_val"].to_dict()

    # ── Load brain weights ──
    brain_weights: dict[str, float] = {}
    brain_om = om_df[om_df[spec_col].str.upper() == "BRAIN"]
    if not brain_om.empty:
        brain_subj = brain_om.dropna(subset=["value"])
        brain_weights = dict(zip(brain_subj["USUBJID"].values, brain_subj["value"].values.astype(float)))

    unit_col = "OMSTRESU" if "OMSTRESU" in om_df.columns else None
    test_col = "OMTESTCD" if "OMTESTCD" in om_df.columns else None

    findings = []

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

        # ── Compute subject-level values in all metrics ──
        grp = grp.copy()
        grp["tbw"] = grp["USUBJID"].map(terminal_bw)
        grp["brain_wt"] = grp["USUBJID"].map(brain_weights)

        grp["val_absolute"] = grp["value"]
        grp["val_ratio_bw"] = np.where(
            grp["tbw"] > 0,
            (grp["value"] / grp["tbw"]) * 100,
            np.nan,
        )
        grp["val_ratio_brain"] = np.where(
            grp["brain_wt"] > 0,
            grp["value"] / grp["brain_wt"],
            np.nan,
        )

        # ── Collect dose-group arrays for each metric ──
        dose_levels = sorted(grp["dose_level"].unique())
        abs_arrays: list[np.ndarray] = []
        bw_arrays: list[np.ndarray] = []
        brain_arrays: list[np.ndarray] = []
        dose_groups_subj: list[dict] = []
        group_stats_absolute: list[dict] = []

        for dose_level in dose_levels:
            dose_grp = grp[grp["dose_level"] == dose_level]
            dose_data = dose_grp.dropna(subset=["value"])
            abs_vals = dose_data["val_absolute"].values
            bw_vals = dose_data["val_ratio_bw"].dropna().values
            brain_vals = dose_data["val_ratio_brain"].dropna().values
            subj_vals = dict(zip(
                dose_data["USUBJID"].values,
                dose_data["value"].values.astype(float),
            ))

            abs_arrays.append(abs_vals)
            bw_arrays.append(bw_vals)
            brain_arrays.append(brain_vals)
            dose_groups_subj.append(subj_vals)

            if len(abs_vals) == 0:
                group_stats_absolute.append({
                    "dose_level": int(dose_level),
                    "n": 0, "mean": None, "sd": None, "median": None,
                    "mean_relative": None,
                })
            else:
                group_stats_absolute.append({
                    "dose_level": int(dose_level),
                    "n": int(len(abs_vals)),
                    "mean": round(float(np.mean(abs_vals)), 4),
                    "sd": round(float(np.std(abs_vals, ddof=1)), 4) if len(abs_vals) > 1 else None,
                    "median": round(float(np.median(abs_vals)), 4),
                    "mean_relative": round(float(np.mean(bw_vals)), 4) if len(bw_vals) > 0 else None,
                })

        # ── Compute BW and brain Hedges' g for normalization decision ──
        control_idx = 0
        bw_g = 0.0
        brain_g_val: float | None = None
        brain_affected = False

        if len(dose_levels) >= 2:
            for i, dl in enumerate(dose_levels):
                if dl == 0:
                    continue
                ctrl_bw = bw_arrays[control_idx]
                trt_bw = bw_arrays[i]
                g = compute_hedges_g(ctrl_bw, trt_bw) if len(ctrl_bw) >= 2 and len(trt_bw) >= 2 else None
                if g is not None and g > bw_g:
                    bw_g = g

            for i, dl in enumerate(dose_levels):
                if dl == 0:
                    continue
                ctrl_brain = brain_arrays[control_idx]
                trt_brain = brain_arrays[i]
                if len(ctrl_brain) >= 2 and len(trt_brain) >= 2:
                    bg = compute_hedges_g(ctrl_brain, trt_brain)
                    if bg is not None and (brain_g_val is None or bg > brain_g_val):
                        brain_g_val = bg

            if brain_g_val is not None and brain_g_val >= 1.0:
                brain_affected = True

        # ── Decide recommended metric ──
        norm_decision = decide_metric(
            specimen=str(specimen), bw_g=bw_g,
            brain_g=brain_g_val, brain_affected=brain_affected,
        )
        recommended_metric = norm_decision["metric"]

        if recommended_metric == "ratio_to_bw":
            primary_arrays = bw_arrays
        elif recommended_metric == "ratio_to_brain":
            has_brain = any(len(a) > 0 for a in brain_arrays)
            primary_arrays = brain_arrays if has_brain else abs_arrays
            if not has_brain:
                recommended_metric = "absolute"
                norm_decision["metric"] = "absolute"
        else:
            primary_arrays = abs_arrays

        # ── Run stats on recommended metric ──
        pairwise, primary_group_stats, trend_result = _compute_metric_stats(
            primary_arrays, [int(dl) for dl in dose_levels],
            dose_groups_subj=dose_groups_subj,
        )

        # ── Williams' test ──
        williams_dict = None
        williams_gs = []
        for i, dl in enumerate(dose_levels):
            vals = primary_arrays[i]
            vals_clean = vals[~np.isnan(vals)] if len(vals) > 0 else vals
            if len(vals_clean) > 0:
                williams_gs.append({
                    "dose_level": int(dl),
                    "mean": float(np.mean(vals_clean)),
                    "sd": float(np.std(vals_clean, ddof=1)) if len(vals_clean) > 1 else 0.0,
                    "n": int(len(vals_clean)),
                })
        williams_result = williams_from_group_stats(williams_gs)
        if williams_result is not None:
            williams_dict = {
                "direction": williams_result.direction,
                "constrained_means": williams_result.constrained_means,
                "step_down_results": [
                    {
                        "dose_label": r.dose_label,
                        "test_statistic": r.test_statistic,
                        "critical_value": r.critical_value,
                        "critical_value_source": r.critical_value_source,
                        "p_value": r.p_value,
                        "significant": r.significant,
                    }
                    for r in williams_result.step_down_results
                ],
                "minimum_effective_dose": williams_result.minimum_effective_dose,
                "pooled_variance": williams_result.pooled_variance,
                "pooled_df": williams_result.pooled_df,
            }

        # ── ANCOVA ──
        ancova_dict = None
        if norm_decision["tier"] >= 3 or brain_affected:
            ancova_result = ancova_from_dose_groups(
                dose_groups_subj=dose_groups_subj,
                dose_levels=[int(dl) for dl in dose_levels],
                terminal_bw=terminal_bw,
            )
            if ancova_result is not None:
                ancova_dict = ancova_result
                if norm_decision["tier"] >= 4:
                    norm_decision["metric"] = "ancova"

        # ── Alternatives ──
        alternatives: dict = {}
        metric_map = {"absolute": abs_arrays, "ratio_to_bw": bw_arrays}
        is_brain = get_organ_category(str(specimen)) == "brain"
        has_brain_data = any(len(a) > 0 for a in brain_arrays)
        if has_brain_data and not is_brain:
            metric_map["ratio_to_brain"] = brain_arrays

        for metric_name, metric_arrays in metric_map.items():
            if metric_name == recommended_metric:
                continue
            alt_pw, alt_gs, alt_trend = _compute_metric_stats(
                metric_arrays, [int(dl) for dl in dose_levels],
            )
            if metric_name == "absolute":
                for gs, gs_abs in zip(alt_gs, group_stats_absolute):
                    gs["mean_relative"] = gs_abs.get("mean_relative")
            alternatives[metric_name] = {
                "group_stats": alt_gs,
                "pairwise": alt_pw,
                "trend_p": alt_trend["p_value"],
                "trend_stat": alt_trend["statistic"],
            }

        assert recommended_metric in metric_map
        assert recommended_metric not in alternatives
        assert set(alternatives.keys()) == set(metric_map.keys()) - {recommended_metric}

        # ── Direction ──
        direction = None
        ctrl_arr = primary_arrays[control_idx] if len(primary_arrays) > 0 else np.array([])
        ctrl_clean = ctrl_arr[~np.isnan(ctrl_arr)] if len(ctrl_arr) > 0 else ctrl_arr
        if len(ctrl_clean) > 0 and len(primary_arrays) > 1:
            high_arr = primary_arrays[-1]
            high_clean = high_arr[~np.isnan(high_arr)] if len(high_arr) > 0 else high_arr
            if len(high_clean) > 0:
                ctrl_mean = float(np.mean(ctrl_clean))
                high_mean = float(np.mean(high_clean))
                if ctrl_mean != 0:
                    pct = ((high_mean - ctrl_mean) / abs(ctrl_mean)) * 100
                    direction = "up" if pct > 0 else "down" if pct < 0 else "none"

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

        finding_name = f"{specimen} ({testcd})" if testcd != "OMWT" else str(specimen)

        findings.append({
            "domain": "OM",
            "test_code": str(testcd),
            "test_name": finding_name,
            "specimen": str(specimen),
            "finding": finding_name,
            "day": mode_day(grp, "OMDY"),
            "sex": str(sex),
            "unit": unit,
            "data_type": "continuous",
            "group_stats": primary_group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": max_d,
            "min_p_adj": min_p,
            "raw_values": abs_arrays,
            "raw_subject_values": dose_groups_subj,
            "normalization": {
                "recommended_metric": norm_decision["metric"],
                "active_metric": recommended_metric,
                "organ_category": norm_decision["category"],
                "tier": norm_decision["tier"],
                "confidence": norm_decision["confidence"],
                "bw_hedges_g": round(bw_g, 4),
                "brain_hedges_g": round(brain_g_val, 4) if brain_g_val is not None else None,
            },
            "williams": williams_dict,
            "ancova": ancova_dict,
            "alternatives": alternatives if alternatives else None,
        })

        # Add threshold reliability alert for high-CV dog organs
        reliability = _get_threshold_reliability(str(specimen), str(sex), species_cat)
        if reliability:
            findings[-1]["threshold_reliability"] = reliability

    return findings
