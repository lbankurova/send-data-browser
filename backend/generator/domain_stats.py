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
from services.analysis.classification import (
    classify_severity, classify_dose_response, determine_treatment_related,
    compute_max_fold_change,
)
from generator.organ_map import get_organ_system, get_organ_name
from services.analysis.phase_filter import (
    compute_last_dosing_day, get_treatment_subjects, filter_treatment_period_records,
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


TERMINAL_DOMAINS = {"MI", "MA", "OM", "TF"}  # Always collected at sacrifice
LB_DOMAIN = "LB"  # Terminal timepoint only exclusion


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

    # Pass 2 — scheduled-only stats for terminal + LB domains
    if excluded_set:
        # Build a lookup: key → scheduled findings
        # Specimen-based domains (MI, MA, OM, TF) need specimen in the key
        # because they share test_code (e.g., all OM endpoints have test_code="WEIGHT")
        scheduled_findings_map: dict[tuple, dict] = {}

        def _sched_key(f: dict) -> tuple:
            if f["domain"] in TERMINAL_DOMAINS:
                return (f["domain"], f["test_code"], f["sex"], f.get("specimen"), f.get("day"))
            return (f["domain"], f["test_code"], f["sex"], f.get("day"))

        for sched_f in compute_mi_findings(study, subjects, excluded_subjects=excluded_set):
            scheduled_findings_map[_sched_key(sched_f)] = sched_f

        for sched_f in compute_ma_findings(study, subjects, excluded_subjects=excluded_set):
            scheduled_findings_map[_sched_key(sched_f)] = sched_f

        for sched_f in compute_om_findings(study, subjects, excluded_subjects=excluded_set):
            scheduled_findings_map[_sched_key(sched_f)] = sched_f

        for sched_f in compute_tf_findings(study, subjects, excluded_subjects=excluded_set):
            scheduled_findings_map[_sched_key(sched_f)] = sched_f

        for sched_f in compute_lb_findings(study, subjects, excluded_subjects=excluded_set, last_dosing_day=last_dosing_day):
            scheduled_findings_map[_sched_key(sched_f)] = sched_f

        # Merge scheduled stats into all_findings
        for finding in all_findings:
            key = _sched_key(finding)
            sched = scheduled_findings_map.get(key)
            if sched:
                finding["scheduled_group_stats"] = sched["group_stats"]
                finding["scheduled_pairwise"] = sched["pairwise"]
                finding["scheduled_direction"] = sched.get("direction")
                finding["scheduled_min_p_adj"] = sched.get("min_p_adj")
                finding["scheduled_max_effect_size"] = sched.get("max_effect_size")
                finding["scheduled_trend_p"] = sched.get("trend_p")
                finding["n_excluded"] = n_excluded
            elif finding["domain"] in TERMINAL_DOMAINS or finding["domain"] == LB_DOMAIN:
                # Finding exists in Pass 1 but not Pass 2 — all subjects were
                # early deaths at this timepoint.  Attach empty arrays so
                # consumers know "this finding has no data under scheduled-only".
                finding["scheduled_group_stats"] = []
                finding["scheduled_pairwise"] = []
                finding["scheduled_direction"] = None
                finding["scheduled_min_p_adj"] = None
                finding["scheduled_max_effect_size"] = None
                finding["scheduled_trend_p"] = None
                finding["n_excluded"] = n_excluded

    # Try FW domain (food/water consumption) — mirrors BW pattern
    if "fw" in study.xpt_files:
        all_findings.extend(_compute_fw_findings(study, subjects, last_dosing_day=last_dosing_day))

    # Enrich each finding
    for finding in all_findings:
        # Classify
        finding["severity"] = classify_severity(finding)
        dr_result = classify_dose_response(
            finding.get("group_stats", []),
            finding.get("data_type", "continuous"),
        )
        finding["dose_response_pattern"] = dr_result["pattern"]
        finding["pattern_confidence"] = dr_result.get("confidence")
        finding["onset_dose_level"] = dr_result.get("onset_dose_level")
        finding["treatment_related"] = determine_treatment_related(finding)

        # Fold change (continuous endpoints only)
        finding["max_fold_change"] = compute_max_fold_change(
            finding.get("group_stats", [])
        ) if finding.get("data_type") == "continuous" else None

        # Add organ system
        finding["organ_system"] = get_organ_system(
            finding.get("specimen"),
            finding.get("test_code"),
            finding.get("domain"),
        )
        finding["organ_name"] = get_organ_name(
            finding.get("specimen"),
            finding.get("test_code"),
        )

        # Enrich continuous findings with ANOVA, Dunnett's, JT
        if finding.get("data_type") == "continuous":
            raw_values = finding.get("raw_values")
            if raw_values and len(raw_values) >= 2:
                # Compute ANOVA from actual per-subject data
                finding["anova_p"] = _anova_p(raw_values)
                # Dunnett's: first group is control, rest are treated
                control = raw_values[0]
                treated = raw_values[1:]
                if len(control) >= 2 and treated:
                    dunnett_pvals = _dunnett_p(control, treated)
                    finding["dunnett_p"] = [_safe_float(p) for p in dunnett_pvals]
                else:
                    finding["dunnett_p"] = None
                # JT trend from raw data
                finding["jt_p"] = _jonckheere_terpstra_p(raw_values)
            else:
                # Fallback: approximate from pairwise results
                finding["anova_p"] = _safe_float(finding.get("min_p_adj"))
                finding["dunnett_p"] = None
                finding["jt_p"] = _safe_float(finding.get("trend_p"))
            # Drop raw_values before serialization (large numpy arrays)
            finding.pop("raw_values", None)
        else:
            # Incidence domains: use existing Fisher's + Cochran-Armitage
            finding["anova_p"] = None
            finding["jt_p"] = _safe_float(finding.get("trend_p"))

        # Build endpoint label
        domain = finding.get("domain", "")
        test_name = finding.get("test_name", finding.get("test_code", ""))
        specimen = finding.get("specimen")
        if specimen and domain in ("MI", "MA", "CL", "OM", "TF"):
            finding["endpoint_label"] = f"{specimen} — {test_name}"
        else:
            finding["endpoint_label"] = test_name

        # Endpoint type classification
        finding["endpoint_type"] = _classify_endpoint_type(domain, finding.get("test_code"))

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
