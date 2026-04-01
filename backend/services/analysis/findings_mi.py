"""MI (Microscopic) domain findings: per (MISPEC, MISTRESC) where abnormal -> incidence + severity."""

import re

import numpy as np
import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.analysis.statistics import (
    incidence_exact_both, trend_test_incidence,
)
from services.analysis.supp_qualifiers import (
    load_supp_modifiers, aggregate_modifiers, count_distributions,
)
from services.analysis.day_utils import mode_day
from services.analysis.pl_utils import read_xpt_as_polars, subjects_to_polars

SEVERITY_SCORES = {"MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5}
_N_OF_M = re.compile(r"^(\d+)\s+OF\s+(\d+)$", re.IGNORECASE)


def _parse_severity(val: str) -> float | None:
    """Parse severity text to numeric score.

    Handles: "MINIMAL"->1 .. "SEVERE"->5, "2 OF 5"->2.0, plain "3"->3.0.
    """
    val = val.strip().upper()
    if val in SEVERITY_SCORES:
        return float(SEVERITY_SCORES[val])
    m = _N_OF_M.match(val)
    if m:
        return float(m.group(1))
    try:
        return float(val)
    except ValueError:
        return None

NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE"}


def compute_mi_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from MI domain (microscopic/histopathology)."""
    if "mi" not in study.xpt_files:
        return []

    mi_df = read_xpt_as_polars(study.xpt_files["mi"])
    subs = subjects_to_polars(subjects)

    if "MIDY" in mi_df.columns:
        mi_df = mi_df.with_columns(pl.col("MIDY").cast(pl.Float64, strict=False))

    # Identify specimens with recovery subjects BEFORE filtering to main-only
    specimens_with_recovery: set[str] = set()
    recovery_subs = subs.filter(pl.col("is_recovery") & ~pl.col("is_satellite"))
    if recovery_subs.height > 0 and "MISPEC" in mi_df.columns:
        recovery_mi = mi_df.join(recovery_subs.select(["USUBJID"]), on="USUBJID", how="inner")
        if recovery_mi.height > 0:
            specimens_with_recovery = set(
                recovery_mi["MISPEC"].cast(pl.Utf8).str.strip_chars().str.to_uppercase().to_list()
            )

    main_subs = subs.filter(~pl.col("is_recovery") & ~pl.col("is_satellite"))
    if excluded_subjects:
        main_subs = main_subs.filter(~pl.col("USUBJID").is_in(list(excluded_subjects)))
    mi_df = mi_df.join(main_subs.select(["USUBJID", "SEX", "dose_level"]), on="USUBJID", how="inner")

    # Load SUPPMI modifiers (requires pandas interop for apply)
    supp_map = load_supp_modifiers(study, "mi")

    spec_col = "MISPEC" if "MISPEC" in mi_df.columns else None
    finding_col = "MISTRESC" if "MISTRESC" in mi_df.columns else None
    severity_col = "MISEV" if "MISEV" in mi_df.columns else None

    if spec_col is None or finding_col is None:
        return []

    # Filter to abnormal findings
    mi_df = mi_df.with_columns(
        pl.col(finding_col).cast(pl.Utf8).str.strip_chars().str.to_uppercase().alias("finding_upper")
    )
    mi_abnormal = mi_df.filter(
        ~pl.col("finding_upper").is_in(list(NORMAL_TERMS)) & (pl.col("finding_upper") != "NAN")
    )

    if mi_abnormal.height == 0:
        return []

    # Build n_per_group
    n_per_group: dict[tuple, int] = {}
    for row in main_subs.group_by(["dose_level", "SEX"]).len().iter_rows(named=True):
        n_per_group[(row["dose_level"], row["SEX"])] = row["len"]
    all_dose_levels = sorted(main_subs["dose_level"].unique().to_list())

    # Convert to pandas for grouped iteration (severity parsing, SUPP apply, RELREC iterrows)
    mi_pd = mi_abnormal.to_pandas()

    if severity_col:
        mi_pd["sev_score"] = mi_pd[severity_col].astype(str).apply(_parse_severity)

    if supp_map and "MISEQ" in mi_pd.columns:
        mi_pd["_modifiers"] = mi_pd.apply(
            lambda r: supp_map.get((r["USUBJID"], int(float(r["MISEQ"])))),
            axis=1,
        )

    findings = []

    for (specimen, finding_str, sex), grp in mi_pd.groupby([spec_col, finding_col, "SEX"]):
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

            avg_sev = None
            if severity_col and len(dose_grp) > 0:
                sev_vals = dose_grp["sev_score"].dropna().values
                if len(sev_vals) > 0:
                    avg_sev = round(float(np.mean(sev_vals)), 2)

            sev_grade_counts = None
            if severity_col and len(dose_grp) > 0:
                sev_vals_int = dose_grp["sev_score"].dropna().values
                if len(sev_vals_int) > 0:
                    counts: dict[str, int] = {}
                    for v in sev_vals_int:
                        key = str(int(v))
                        counts[key] = counts.get(key, 0) + 1
                    sev_grade_counts = counts

            gs_entry = {
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
                "avg_severity": avg_sev,
                "severity_grade_counts": sev_grade_counts,
            }

            if "_modifiers" in dose_grp.columns:
                dose_mods = dose_grp["_modifiers"].dropna().tolist()
                mod_counts = count_distributions(dose_mods)
                if mod_counts:
                    gs_entry["modifier_counts"] = mod_counts

            group_stats.append(gs_entry)

            if dose_level == 0:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        pairwise = []
        for dose_level in [dl for dl in all_dose_levels if dl > 0]:
            treat_affected, treat_total = dose_counts[dose_level]
            if treat_total == 0 or control_total == 0:
                continue
            table = [
                [treat_affected, treat_total - treat_affected],
                [control_affected, control_total - control_affected],
            ]
            result = incidence_exact_both(table)
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
                "p_value_fisher": result["p_value_fisher"],
                "h_lower": result.get("h_lower"),
            })

        trend_result = trend_test_incidence(incidence_counts, incidence_totals)

        direction = None
        if control_total > 0 and incidence_totals[-1] > 0:
            ctrl_inc = incidence_counts[0] / control_total
            high_inc = incidence_counts[-1] / incidence_totals[-1]
            direction = "up" if high_inc > ctrl_inc else "down" if high_inc < ctrl_inc else "none"

        all_sev = None
        if severity_col:
            sev_vals = grp["sev_score"].dropna().values
            if len(sev_vals) > 0:
                all_sev = round(float(np.mean(sev_vals)), 2)

        min_p = None
        for pw in pairwise:
            if pw["p_value"] is not None:
                if min_p is None or pw["p_value"] < min_p:
                    min_p = pw["p_value"]

        modifier_profile = None
        if "_modifiers" in grp.columns:
            modifier_records = grp["_modifiers"].dropna().tolist()
            if modifier_records:
                profile = aggregate_modifiers(modifier_records)
                profile["n_total"] = int(grp["USUBJID"].nunique())
                modifier_profile = profile

        relrec_seqs = None
        relrec_subject_seqs = None
        if "MISEQ" in grp.columns:
            seqs = grp["MISEQ"].dropna().unique()
            if len(seqs) > 0:
                relrec_seqs = [int(float(s)) for s in seqs]
            pairs = grp[["USUBJID", "MISEQ"]].dropna()
            if len(pairs) > 0:
                relrec_subject_seqs = [
                    (str(r["USUBJID"]).strip(), int(float(r["MISEQ"])))
                    for _, r in pairs.iterrows()
                ]

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
            "max_effect_size": None,
            "min_p_adj": min_p,
            "has_recovery_subjects": str(specimen).strip().upper() in specimens_with_recovery,
            "avg_severity": all_sev,
            "modifier_profile": modifier_profile,
            "_relrec_seq": relrec_seqs,
            "_relrec_subject_seqs": relrec_subject_seqs,
        })

    return findings
