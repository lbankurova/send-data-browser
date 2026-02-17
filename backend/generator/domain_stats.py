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
from services.analysis.findings_cl import compute_cl_findings
from services.analysis.findings_ds import compute_ds_findings
from services.analysis.classification import (
    classify_severity, classify_dose_response, determine_treatment_related,
)
from generator.organ_map import get_organ_system, get_organ_name


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
    """Jonckheere-Terpstra trend test approximation using Spearman correlation."""
    dose_levels = []
    values = []
    for level, group in enumerate(group_values):
        arr = np.array(group, dtype=float)
        arr = arr[~np.isnan(arr)]
        for v in arr:
            dose_levels.append(level)
            values.append(v)
    if len(values) < 4:
        return None
    try:
        _, p = sp_stats.spearmanr(dose_levels, values)
        return _safe_float(p)
    except Exception:
        return None


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


def compute_all_findings(study: StudyInfo) -> tuple[list[dict], dict]:
    """Run all domain findings modules and enrich with additional tests.

    Returns (enriched_findings, dose_group_data).
    """
    dg_data = build_dose_groups(study)
    subjects = dg_data["subjects"]
    dose_groups = dg_data["dose_groups"]

    # Collect all findings from existing modules
    all_findings = []
    all_findings.extend(compute_lb_findings(study, subjects))
    all_findings.extend(compute_bw_findings(study, subjects))
    all_findings.extend(compute_om_findings(study, subjects))
    all_findings.extend(compute_mi_findings(study, subjects))
    all_findings.extend(compute_ma_findings(study, subjects))
    all_findings.extend(compute_cl_findings(study, subjects))
    all_findings.extend(compute_ds_findings(study, subjects))

    # Try FW domain (food/water consumption) — mirrors BW pattern
    if "fw" in study.xpt_files:
        all_findings.extend(_compute_fw_findings(study, subjects))

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
        if specimen and domain in ("MI", "MA", "CL", "OM"):
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
    }
    return mapping.get(domain, "other")


def _compute_fw_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from FW domain — mirrors BW pattern."""
    from services.xpt_processor import read_xpt
    from services.analysis.statistics import welch_t_test, cohens_d, trend_test, bonferroni_correct

    if "fw" not in study.xpt_files:
        return []

    fw_df, _ = read_xpt(study.xpt_files["fw"])
    fw_df.columns = [c.upper() for c in fw_df.columns]

    main_subs = subjects[~subjects["is_recovery"]].copy()
    fw_df = fw_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

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
