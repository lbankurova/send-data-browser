"""CL (Clinical observations) domain findings: per (CLSTRESC) where abnormal → incidence."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import fisher_exact_2x2, trend_test_incidence
from services.analysis.phase_filter import (
    get_treatment_subjects, filter_treatment_period_records,
)
from services.analysis.day_utils import mode_day, min_day

NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE", "NONE"}

# ── CL body-system classification ─────────────────────────
# Maps CL finding keywords to body-system categories for grouping noisy
# CL coding variability. Checked in order; first match wins.
CL_BODY_SYSTEM_RULES: list[tuple[str, list[str]]] = [
    ("CNS", ["TREMOR", "CONVULS", "SEIZURE", "LETHARGY", "LETHARG", "HYPOACTIV",
             "HYPERACTIV", "ATAXIA", "PARALYS", "PTOSIS", "PILOERECT", "PROSTRAT",
             "DECREAS.*ACTIV", "INCREAS.*ACTIV", "SALIVAT", "LACRIMAT", "CHROMODACRY"]),
    ("GI", ["DIARRHEA", "DIARRHOEA", "EMESIS", "VOMIT", "SOFT STOOL", "LOOSE STOOL",
            "DISCOLOR.*FECES", "ABNORMAL.*FECES", "FECAL", "STOOL"]),
    ("integument", ["ALOPECIA", "CRUST", "SCAB", "ERYTHEMA", "SWELLING", "EDEMA",
                    "OEDEMA", "RASH", "LESION", "WOUND", "INJECTION SITE",
                    "DERMATIT", "SKIN", "DESQUAM", "ULCER", "NODULE", "MASS"]),
]


def classify_cl_body_system(finding: str) -> str:
    """Map a CL finding term to a body-system category."""
    upper = finding.upper()
    import re
    for system, patterns in CL_BODY_SYSTEM_RULES:
        for pat in patterns:
            if re.search(pat, upper):
                return system
    return "general"


def compute_cl_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    last_dosing_day: int | None = None,
) -> list[dict]:
    """Compute findings from CL domain (clinical observations)."""
    if "cl" not in study.xpt_files:
        return []

    cl_df, _ = read_xpt(study.xpt_files["cl"])
    cl_df.columns = [c.upper() for c in cl_df.columns]
    cl_df["CLDY"] = pd.to_numeric(cl_df.get("CLDY", pd.Series(dtype=float)), errors="coerce")

    # Identify whether recovery subjects have CL records BEFORE filtering to main-only
    has_any_recovery_cl = False
    recovery_subs = subjects[subjects["is_recovery"] & ~subjects["is_satellite"]]
    if len(recovery_subs) > 0:
        recovery_cl = cl_df.merge(recovery_subs[["USUBJID"]], on="USUBJID", how="inner")
        if len(recovery_cl) > 0:
            has_any_recovery_cl = True

    # Include recovery animals for treatment-period pooling
    treatment_subs = get_treatment_subjects(subjects)
    cl_df = cl_df.merge(treatment_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Filter recovery records to treatment period if day column exists
    cl_df = filter_treatment_period_records(cl_df, subjects, "CLDY", last_dosing_day)

    finding_col = "CLSTRESC" if "CLSTRESC" in cl_df.columns else ("CLORRES" if "CLORRES" in cl_df.columns else None)
    if finding_col is None:
        return []

    cl_df["finding_upper"] = cl_df[finding_col].astype(str).str.strip().str.upper()
    cl_abnormal = cl_df[~cl_df["finding_upper"].isin(NORMAL_TERMS)].copy()
    cl_abnormal = cl_abnormal[cl_abnormal["finding_upper"] != "NAN"]

    if len(cl_abnormal) == 0:
        return []

    n_per_group = treatment_subs.groupby(["dose_level", "SEX"]).size().to_dict()
    all_dose_levels = sorted(treatment_subs["dose_level"].unique())

    findings = []
    grouped = cl_abnormal.groupby([finding_col, "SEX"])

    for (finding_str, sex), grp in grouped:
        finding_str = str(finding_str).strip()
        if not finding_str or finding_str.upper() in NORMAL_TERMS:
            continue

        # Per-subject onset day: min(CLDY) per USUBJID
        onset_days: list[dict[str, int | None]] = []
        for subj_id, subj_grp in grp.groupby("USUBJID"):
            day_vals = subj_grp["CLDY"].dropna()
            onset = int(day_vals.min()) if len(day_vals) > 0 else None
            onset_days.append({str(subj_id): onset})

        body_system = classify_cl_body_system(finding_str)

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
            "day": mode_day(grp, "CLDY"),
            "day_first": min_day(grp, "CLDY"),
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
            "has_recovery_subjects": has_any_recovery_cl,
            "raw_subject_onset_days": onset_days,
            "cl_body_system": body_system,
        })

    return findings
