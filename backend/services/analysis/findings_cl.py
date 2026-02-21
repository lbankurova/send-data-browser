"""CL (Clinical observations) domain findings: per (CLSTRESC) where abnormal → incidence."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import fisher_exact_2x2, trend_test_incidence

NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE", "NONE"}


def compute_cl_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute findings from CL domain (clinical observations)."""
    if "cl" not in study.xpt_files:
        return []

    cl_df, _ = read_xpt(study.xpt_files["cl"])
    cl_df.columns = [c.upper() for c in cl_df.columns]

    main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
    cl_df = cl_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    finding_col = "CLSTRESC" if "CLSTRESC" in cl_df.columns else ("CLORRES" if "CLORRES" in cl_df.columns else None)
    if finding_col is None:
        return []

    cl_df["finding_upper"] = cl_df[finding_col].astype(str).str.strip().str.upper()
    cl_abnormal = cl_df[~cl_df["finding_upper"].isin(NORMAL_TERMS)].copy()
    cl_abnormal = cl_abnormal[cl_abnormal["finding_upper"] != "NAN"]

    if len(cl_abnormal) == 0:
        return []

    n_per_group = main_subs.groupby(["dose_level", "SEX"]).size().to_dict()
    all_dose_levels = sorted(main_subs["dose_level"].unique())

    findings = []
    grouped = cl_abnormal.groupby([finding_col, "SEX"])

    for (finding_str, sex), grp in grouped:
        finding_str = str(finding_str).strip()
        if not finding_str or finding_str.upper() in NORMAL_TERMS:
            continue

        group_stats = []
        control_affected = 0
        control_total = 0
        dose_counts = {}

        for dose_level in all_dose_levels:
            dose_grp = grp[grp["dose_level"] == dose_level]
            affected = int(dose_grp["USUBJID"].nunique())
            total = int(n_per_group.get((dose_level, sex), 0))

            dose_counts[dose_level] = (affected, total)

            group_stats.append({
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
            })

            if dose_level == all_dose_levels[0]:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        pairwise = []
        treated_levels = [dl for dl in all_dose_levels if dl != all_dose_levels[0]]
        for dose_level in treated_levels:
            treat_affected, treat_total = dose_counts[dose_level]
            if treat_total == 0 or control_total == 0:
                continue
            table = [
                [treat_affected, treat_total - treat_affected],
                [control_affected, control_total - control_affected],
            ]
            result = fisher_exact_2x2(table)
            rr = None
            if treat_total > 0 and control_total > 0:
                p_treat = treat_affected / treat_total
                p_ctrl = control_affected / control_total
                rr = round(p_treat / p_ctrl, 4) if p_ctrl > 0 else None
            pairwise.append({
                "dose_level": int(dose_level),
                "p_value": result["p_value"],
                "p_value_adj": result["p_value"],
                "odds_ratio": result["odds_ratio"],
                "risk_ratio": rr,
            })

        trend_result = trend_test_incidence(incidence_counts, incidence_totals)

        direction = None
        if control_total > 0 and incidence_totals[-1] > 0:
            ctrl_inc = incidence_counts[0] / control_total
            high_inc = incidence_counts[-1] / incidence_totals[-1]
            direction = "up" if high_inc > ctrl_inc else "down" if high_inc < ctrl_inc else "none"

        min_p = None
        for pw in pairwise:
            if pw["p_value"] is not None:
                if min_p is None or pw["p_value"] < min_p:
                    min_p = pw["p_value"]

        findings.append({
            "domain": "CL",
            "test_code": finding_str,
            "test_name": finding_str,
            "specimen": None,
            "finding": finding_str,
            "day": None,
            "sex": str(sex),
            "unit": None,
            "data_type": "incidence",
            "group_stats": group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": None,
            "min_p_adj": min_p,
        })

    return findings
