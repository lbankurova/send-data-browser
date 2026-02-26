"""Per-domain derived columns and statistics for the generator pipeline.

Reuses existing findings modules to extract per-endpoint statistics,
then enriches with ANOVA, Dunnett's, and Jonckheere-Terpstra tests.
"""

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from services.study_discovery import StudyInfo
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_lb import compute_lb_findings
from services.analysis.findings_bw import compute_bw_findings
from services.analysis.findings_om import compute_om_findings
from services.analysis.findings_mi import compute_mi_findings
from services.analysis.findings_ma import compute_ma_findings
from services.analysis.findings_tf import compute_tf_findings
from services.analysis.findings_cl import compute_cl_findings
from services.analysis.findings_ds import compute_ds_findings
from services.analysis.findings_eg import compute_eg_findings
from services.analysis.findings_vs import compute_vs_findings
from services.analysis.findings_bg import compute_bg_findings
from generator.organ_map import get_organ_name
from services.analysis.phase_filter import (
    compute_last_dosing_day, get_treatment_subjects, filter_treatment_period_records,
    get_terminal_subjects,
)
from services.analysis.findings_pipeline import (
    process_findings, finding_key, build_findings_map,
    SCHEDULED_DOMAINS,
)


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (ValueError, TypeError):
        return None


def _anova_p(group_values: list[np.ndarray]) -> float | None:
    """One-way ANOVA F-test p-value. Needs >=2 groups with >=2 obs each."""
    valid = [g for g in group_values if len(g) >= 2]
    if len(valid) < 2:
        return None
    try:
        _, p = sp_stats.f_oneway(*valid)
        return _safe_float(p)
    except Exception:
        return None


def _dunnett_p(control: np.ndarray, treated_groups: list[np.ndarray]) -> list[float | None]:
    """Dunnett's test: each treated group vs control. Returns list of p-values."""
    if len(control) < 2:
        return [None] * len(treated_groups)
    valid_treated = []
    indices = []
    for i, g in enumerate(treated_groups):
        if len(g) >= 2:
            valid_treated.append(g)
            indices.append(i)
    if not valid_treated:
        return [None] * len(treated_groups)
    try:
        result = sp_stats.dunnett(*valid_treated, control=control)
        out = [None] * len(treated_groups)
        for j, idx in enumerate(indices):
            out[idx] = _safe_float(result.pvalue[j])
        return out
    except Exception:
        return [None] * len(treated_groups)


def _jonckheere_terpstra_p(group_values: list[np.ndarray]) -> float | None:
    """Jonckheere-Terpstra trend test p-value. Delegates to statistics module.

    REM-29: Uses proper JT test instead of Spearman proxy.
    """
    from services.analysis.statistics import trend_test
    result = trend_test(group_values)
    return _safe_float(result["p_value"])


def _kruskal_p(group_values: list[np.ndarray]) -> float | None:
    """Kruskal-Wallis test p-value for ordinal/severity data."""
    valid = [g for g in group_values if len(g) >= 1]
    if len(valid) < 2:
        return None
    try:
        _, p = sp_stats.kruskal(*valid)
        return _safe_float(p)
    except Exception:
        return None




def compute_all_findings(
    study: StudyInfo,
    early_death_subjects: dict[str, str] | None = None,
    last_dosing_day_override: int | None = None,
) -> tuple[list[dict], dict]:
    """Run all domain findings modules and enrich with additional tests.

    When early_death_subjects is provided, runs a dual-pass for terminal domains:
    pass 1 = all animals (base stats), pass 2 = scheduled-only (excluded early deaths).
    Longitudinal domains (BW, FW, CL) are never affected.

    When last_dosing_day_override is provided, it replaces the auto-detected
    last dosing day for treatment/recovery phase boundary classification.

    Returns (enriched_findings, dose_group_data).
    """
    dg_data = build_dose_groups(study)
    subjects = dg_data["subjects"]
    dose_groups = dg_data["dose_groups"]

    # Compute last dosing day for recovery animal treatment-period pooling
    last_dosing_day = compute_last_dosing_day(study, override=last_dosing_day_override)

    excluded_set = set(early_death_subjects.keys()) if early_death_subjects else None
    n_excluded = len(excluded_set) if excluded_set else 0

    # Collect all findings from existing modules (pass 1 — all animals)
    # In-life domains receive last_dosing_day for recovery pooling;
    # terminal domains (MI, MA, OM, TF) and DS are main-study-only.
    all_findings = []
    all_findings.extend(compute_lb_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_bw_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_om_findings(study, subjects))
    all_findings.extend(compute_mi_findings(study, subjects))
    all_findings.extend(compute_ma_findings(study, subjects))
    all_findings.extend(compute_tf_findings(study, subjects))
    all_findings.extend(compute_cl_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_ds_findings(study, subjects))
    all_findings.extend(compute_eg_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_vs_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_bg_findings(study, subjects, last_dosing_day=last_dosing_day))

    # Pass 2 — build scheduled-only map for terminal + LB domains
    scheduled_map = None
    if excluded_set:
        sched_findings = []
        sched_findings.extend(compute_mi_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_ma_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_om_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_tf_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_lb_findings(study, subjects, excluded_subjects=excluded_set, last_dosing_day=last_dosing_day))
        sched_findings.extend(compute_ds_findings(study, subjects, excluded_subjects=excluded_set))
        scheduled_map = build_findings_map(sched_findings, "scheduled")

    # Try FW domain (food/water consumption) — mirrors BW pattern
    if "fw" in study.xpt_files:
        all_findings.extend(_compute_fw_findings(study, subjects, last_dosing_day=last_dosing_day))

    # Pass 3 — build separate (main-only) map for in-life domains
    separate_map = None
    has_recovery = subjects["is_recovery"].any()
    if has_recovery:
        main_only_subs = get_terminal_subjects(subjects)
        sep_findings = []
        sep_findings.extend(compute_bw_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        sep_findings.extend(compute_lb_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        sep_findings.extend(compute_cl_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        sep_findings.extend(compute_eg_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        sep_findings.extend(compute_vs_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        sep_findings.extend(compute_bg_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        if "fw" in study.xpt_files:
            sep_findings.extend(_compute_fw_findings(study, main_only_subs, last_dosing_day=last_dosing_day))
        separate_map = build_findings_map(sep_findings, "separate")

    # Shared enrichment pipeline (classification, fold change, labels, etc.)
    all_findings = process_findings(all_findings, scheduled_map, separate_map, n_excluded)

    # Generator-specific: attach scheduled extras (min_p_adj, max_effect_size, trend_p)
    if scheduled_map:
        for finding in all_findings:
            if finding["domain"] in SCHEDULED_DOMAINS:
                key = finding_key(finding)
                sched = scheduled_map.get(key)
                if sched:
                    finding["scheduled_min_p_adj"] = sched.get("min_p_adj")
                    finding["scheduled_max_effect_size"] = sched.get("max_effect_size")
                    finding["scheduled_trend_p"] = sched.get("trend_p")
                elif finding.get("n_excluded"):
                    finding["scheduled_min_p_adj"] = None
                    finding["scheduled_max_effect_size"] = None
                    finding["scheduled_trend_p"] = None

    # Generator-specific: ANOVA, Dunnett's, JT, organ_name, endpoint_type
    for finding in all_findings:
        finding["organ_name"] = get_organ_name(
            finding.get("specimen"),
            finding.get("test_code"),
        )

        if finding.get("data_type") == "continuous":
            raw_values = finding.get("raw_values")
            if raw_values and len(raw_values) >= 2:
                finding["anova_p"] = _anova_p(raw_values)
                control = raw_values[0]
                treated = raw_values[1:]
                if len(control) >= 2 and treated:
                    dunnett_pvals = _dunnett_p(control, treated)
                    finding["dunnett_p"] = [_safe_float(p) for p in dunnett_pvals]
                else:
                    finding["dunnett_p"] = None
                finding["jt_p"] = _jonckheere_terpstra_p(raw_values)
            else:
                finding["anova_p"] = _safe_float(finding.get("min_p_adj"))
                finding["dunnett_p"] = None
                finding["jt_p"] = _safe_float(finding.get("trend_p"))
            finding.pop("raw_values", None)
        else:
            finding["anova_p"] = None
            finding["jt_p"] = _safe_float(finding.get("trend_p"))

        finding["endpoint_type"] = _classify_endpoint_type(
            finding.get("domain", ""), finding.get("test_code"),
        )

    return all_findings, dg_data


def _classify_endpoint_type(domain: str, test_code: str | None = None) -> str:
    """Classify finding into an endpoint type category."""
    mapping = {
        "BW": "body_weight",
        "FW": "food_water",
        "LB": "clinical_chemistry",
        "MI": "histopathology",
        "MA": "gross_pathology",
        "OM": "organ_weight",
        "CL": "clinical_observation",
        "TF": "tumor",
        "PM": "palpable_mass",
        "EG": "electrocardiogram",
        "VS": "vital_signs",
        "BG": "body_weight_gain",
    }
    return mapping.get(domain, "other")


def _compute_fw_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from FW domain — mirrors BW pattern."""
    from services.xpt_processor import read_xpt
    from services.analysis.statistics import dunnett_pairwise, cohens_d, trend_test

    if "fw" not in study.xpt_files:
        return []

    fw_df, _ = read_xpt(study.xpt_files["fw"])
    fw_df.columns = [c.upper() for c in fw_df.columns]

    # Include recovery animals for treatment-period pooling
    treatment_subs = get_treatment_subjects(subjects)
    fw_df = fw_df.merge(treatment_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    if "FWSTRESN" in fw_df.columns:
        fw_df["value"] = pd.to_numeric(fw_df["FWSTRESN"], errors="coerce")
    elif "FWORRES" in fw_df.columns:
        fw_df["value"] = pd.to_numeric(fw_df["FWORRES"], errors="coerce")
    else:
        return []

    day_col = "FWDY" if "FWDY" in fw_df.columns else None
    if day_col is None:
        fw_df["FWDY"] = 1
    fw_df["FWDY"] = pd.to_numeric(fw_df["FWDY"], errors="coerce")

    # Filter recovery animals' records to treatment period only
    fw_df = filter_treatment_period_records(fw_df, subjects, "FWDY", last_dosing_day)

    unit_col = "FWSTRESU" if "FWSTRESU" in fw_df.columns else None
    test_col = "FWTESTCD" if "FWTESTCD" in fw_df.columns else None

    findings = []
    group_by = [test_col, "FWDY", "SEX"] if test_col else ["FWDY", "SEX"]
    grouped = fw_df.groupby(group_by)

    for keys, grp in grouped:
        if test_col:
            testcd, day, sex = keys
        else:
            day, sex = keys
            testcd = "FW"

        if grp["value"].isna().all():
            continue

        day_val = int(day) if not np.isnan(day) else None
        unit = str(grp[unit_col].iloc[0]) if unit_col else "g"
        if unit == "nan":
            unit = "g"

        group_stats = []
        control_values = None
        dose_groups_values = []

        for dose_level in sorted(grp["dose_level"].unique()):
            vals = grp[grp["dose_level"] == dose_level]["value"].dropna().values
            if len(vals) == 0:
                group_stats.append({"dose_level": int(dose_level), "n": 0, "mean": None, "sd": None, "median": None})
                dose_groups_values.append(np.array([]))
                continue
            group_stats.append({
                "dose_level": int(dose_level),
                "n": int(len(vals)),
                "mean": round(float(np.mean(vals)), 2),
                "sd": round(float(np.std(vals, ddof=1)), 2) if len(vals) > 1 else None,
                "median": round(float(np.median(vals)), 2),
            })
            dose_groups_values.append(vals)
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
        if control_values is not None and len(control_values) > 0 and dose_groups_values:
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

        # Override direction with max_d sign
        if max_d is not None and abs(max_d) > 0.01:
            direction = "up" if max_d > 0 else "down"

        min_p = None
        for pw in pairwise:
            if pw["p_value_adj"] is not None:
                if min_p is None or pw["p_value_adj"] < min_p:
                    min_p = pw["p_value_adj"]

        findings.append({
            "domain": "FW",
            "test_code": str(testcd),
            "test_name": f"Food/Water ({testcd})" if testcd != "FW" else "Food/Water Consumption",
            "specimen": None,
            "finding": f"Food/Water ({testcd})" if testcd != "FW" else "Food/Water Consumption",
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
