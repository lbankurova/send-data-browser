"""MI (Microscopic) domain findings: per (MISPEC, MISTRESC) where abnormal → incidence + severity."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import (
    fisher_exact_2x2, trend_test_incidence,
)
from services.analysis.supp_qualifiers import (
    load_supp_modifiers, aggregate_modifiers, count_distributions,
)
from services.analysis.day_utils import mode_day

SEVERITY_SCORES = {"MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5}
NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE"}


def compute_mi_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from MI domain (microscopic/histopathology)."""
    if "mi" not in study.xpt_files:
        return []

    mi_df, _ = read_xpt(study.xpt_files["mi"])
    mi_df.columns = [c.upper() for c in mi_df.columns]
    mi_df["MIDY"] = pd.to_numeric(mi_df.get("MIDY", pd.Series(dtype=float)), errors="coerce")

    main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
    if excluded_subjects:
        main_subs = main_subs[~main_subs["USUBJID"].isin(excluded_subjects)]
    mi_df = mi_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Load SUPPMI modifiers
    supp_map = load_supp_modifiers(study, "mi")
    if supp_map and "MISEQ" in mi_df.columns:
        mi_df["_modifiers"] = mi_df.apply(
            lambda r: supp_map.get((r["USUBJID"], int(float(r["MISEQ"])))),
            axis=1,
        )

    spec_col = "MISPEC" if "MISPEC" in mi_df.columns else None
    finding_col = "MISTRESC" if "MISTRESC" in mi_df.columns else ("MISTRESC" if "MISTRESC" in mi_df.columns else None)
    severity_col = "MISEV" if "MISEV" in mi_df.columns else None

    if spec_col is None or finding_col is None:
        return []

    # Filter to abnormal findings
    mi_df["finding_upper"] = mi_df[finding_col].astype(str).str.strip().str.upper()
    mi_abnormal = mi_df[~mi_df["finding_upper"].isin(NORMAL_TERMS)].copy()
    mi_abnormal = mi_abnormal[mi_abnormal["finding_upper"] != "NAN"]

    if len(mi_abnormal) == 0:
        return []

    # Severity score
    if severity_col:
        mi_abnormal = mi_abnormal.copy()
        mi_abnormal["sev_score"] = mi_abnormal[severity_col].astype(str).str.strip().str.upper().map(SEVERITY_SCORES)

    findings = []
    grouped = mi_abnormal.groupby([spec_col, finding_col, "SEX"])

    # N per dose/sex for denominator
    n_per_group = main_subs.groupby(["dose_level", "SEX"]).size().to_dict()
    all_dose_levels = sorted(main_subs["dose_level"].unique())

    for (specimen, finding_str, sex), grp in grouped:
        finding_str = str(finding_str).strip()
        if not finding_str or finding_str.upper() in NORMAL_TERMS:
            continue

        # Incidence per dose group
        group_stats = []
        control_affected = 0
        control_total = 0
        dose_counts = {}  # dose_level → (affected, total)

        for dose_level in all_dose_levels:
            dose_grp = grp[grp["dose_level"] == dose_level]
            affected = int(dose_grp["USUBJID"].nunique())
            total = int(n_per_group.get((dose_level, sex), 0))

            dose_counts[dose_level] = (affected, total)

            avg_sev = None
            if severity_col and len(dose_grp) > 0:
                sev_vals = dose_grp["sev_score"].dropna().values
                if len(sev_vals) > 0:
                    avg_sev = round(float(np.mean(sev_vals)), 2)

            gs_entry = {
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
                "avg_severity": avg_sev,
            }

            # Per-dose modifier counts
            if "_modifiers" in dose_grp.columns:
                dose_mods = dose_grp["_modifiers"].dropna().tolist()
                mod_counts = count_distributions(dose_mods)
                if mod_counts:
                    gs_entry["modifier_counts"] = mod_counts

            group_stats.append(gs_entry)

            if dose_level == all_dose_levels[0]:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        # Fisher exact tests (each dose vs control)
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
            if control_total > 0 and treat_total > 0:
                p_treat = treat_affected / treat_total
                p_ctrl = control_affected / control_total if control_total > 0 else 0
                rr = round(p_treat / p_ctrl, 4) if p_ctrl > 0 else None

            pairwise.append({
                "dose_level": int(dose_level),
                "p_value": result["p_value"],
                "p_value_adj": result["p_value"],
                "odds_ratio": result["odds_ratio"],
                "risk_ratio": rr,
            })

        # Trend test for incidence
        trend_result = trend_test_incidence(incidence_counts, incidence_totals)

        # Direction
        direction = None
        if control_total > 0 and incidence_totals[-1] > 0:
            ctrl_inc = incidence_counts[0] / control_total
            high_inc = incidence_counts[-1] / incidence_totals[-1]
            direction = "up" if high_inc > ctrl_inc else "down" if high_inc < ctrl_inc else "none"

        # Overall severity
        all_sev = None
        if severity_col:
            sev_vals = grp["sev_score"].dropna().values
            if len(sev_vals) > 0:
                all_sev = round(float(np.mean(sev_vals)), 2)

        # Min p-value
        min_p = None
        for pw in pairwise:
            if pw["p_value"] is not None:
                if min_p is None or pw["p_value"] < min_p:
                    min_p = pw["p_value"]

        # Aggregate modifiers for this (specimen, finding, sex)
        modifier_profile = None
        if "_modifiers" in grp.columns:
            modifier_records = grp["_modifiers"].dropna().tolist()
            if modifier_records:
                profile = aggregate_modifiers(modifier_records)
                profile["n_total"] = int(grp["USUBJID"].nunique())
                modifier_profile = profile

        findings.append({
            "domain": "MI",
            "test_code": f"{specimen}_{finding_str}",
            "test_name": finding_str,
            "specimen": str(specimen),
            "finding": finding_str,
            "day": mode_day(grp, "MIDY"),
            "sex": str(sex),
            "unit": None,
            "data_type": "incidence",
            "group_stats": group_stats,
            "pairwise": pairwise,
            "trend_p": trend_result["p_value"],
            "trend_stat": trend_result["statistic"],
            "direction": direction,
            "max_effect_size": all_sev,  # use avg severity as "effect size" for incidence
            "min_p_adj": min_p,
            "avg_severity": all_sev,
            "modifier_profile": modifier_profile,
        })

    return findings
