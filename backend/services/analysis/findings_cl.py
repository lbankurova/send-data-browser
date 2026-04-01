"""CL (Clinical observations) domain findings: per (CLSTRESC) where abnormal -> incidence."""

import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.analysis.statistics import incidence_exact_both, trend_test_incidence
from services.analysis.pl_utils import (
    read_xpt_as_polars, subjects_to_polars,
    get_treatment_subjects_pl, filter_treatment_period_records_pl,
)
from services.analysis.supp_qualifiers import (
    load_supp_modifiers, aggregate_modifiers, count_distributions,
)
from services.analysis.day_utils import mode_day, min_day

NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE", "NONE"}

# ── CL body-system classification ─────────────────────────
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

    cl_df = read_xpt_as_polars(study.xpt_files["cl"])
    subs = subjects_to_polars(subjects)

    # Resolve day column: CLDY preferred, VISITDY fallback
    day_col = "CLDY" if "CLDY" in cl_df.columns else ("VISITDY" if "VISITDY" in cl_df.columns else None)

    if day_col and day_col in cl_df.columns:
        cl_df = cl_df.with_columns(pl.col(day_col).cast(pl.Float64, strict=False))
        if day_col != "CLDY":
            cl_df = cl_df.rename({day_col: "CLDY"})
            day_col = "CLDY"

    # Check if recovery subjects have CL records BEFORE filtering
    has_any_recovery_cl = False
    recovery_subs = subs.filter(pl.col("is_recovery") & ~pl.col("is_satellite"))
    if recovery_subs.height > 0:
        recovery_cl = cl_df.join(recovery_subs.select(["USUBJID"]), on="USUBJID", how="inner")
        if recovery_cl.height > 0:
            has_any_recovery_cl = True

    # Include recovery animals for treatment-period pooling
    treatment_subs = get_treatment_subjects_pl(subs).select(["USUBJID", "SEX", "dose_level"])
    cl_df = cl_df.join(treatment_subs, on="USUBJID", how="inner")

    # Filter recovery records to treatment period
    cl_df = filter_treatment_period_records_pl(cl_df, subs, "CLDY", last_dosing_day)

    # Load SUPPCL modifiers (requires pandas interop)
    supp_map = load_supp_modifiers(study, "cl")

    finding_col = "CLSTRESC" if "CLSTRESC" in cl_df.columns else ("CLORRES" if "CLORRES" in cl_df.columns else None)
    if finding_col is None:
        return []

    # Filter to abnormal findings
    cl_df = cl_df.with_columns(
        pl.col(finding_col).cast(pl.Utf8).str.strip_chars().str.to_uppercase().alias("finding_upper")
    )
    cl_abnormal = cl_df.filter(
        ~pl.col("finding_upper").is_in(list(NORMAL_TERMS)) & (pl.col("finding_upper") != "NAN")
    )

    if cl_abnormal.height == 0:
        return []

    # Build n_per_group from treatment subjects
    n_per_group: dict[tuple, int] = {}
    treatment_subs_full = get_treatment_subjects_pl(subs)
    for row in treatment_subs_full.group_by(["dose_level", "SEX"]).len().iter_rows(named=True):
        n_per_group[(row["dose_level"], row["SEX"])] = row["len"]
    all_dose_levels = sorted(treatment_subs_full["dose_level"].unique().to_list())

    # Convert to pandas for grouped iteration (SUPP apply + RELREC iterrows + onset groupby)
    cl_pd = cl_abnormal.to_pandas()

    if supp_map and "CLSEQ" in cl_pd.columns:
        cl_pd["_modifiers"] = cl_pd.apply(
            lambda r: supp_map.get((r["USUBJID"], int(float(r["CLSEQ"])))),
            axis=1,
        )

    findings = []

    for (finding_str, sex), grp in cl_pd.groupby([finding_col, "SEX"]):
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

            gs_entry = {
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
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
                "p_value_fisher": result["p_value_fisher"],
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

        modifier_profile = None
        if "_modifiers" in grp.columns:
            modifier_records = grp["_modifiers"].dropna().tolist()
            if modifier_records:
                profile = aggregate_modifiers(modifier_records)
                profile["n_total"] = int(grp["USUBJID"].nunique())
                modifier_profile = profile

        relrec_seqs = None
        relrec_subject_seqs = None
        if "CLSEQ" in grp.columns:
            seqs = grp["CLSEQ"].dropna().unique()
            if len(seqs) > 0:
                relrec_seqs = [int(float(s)) for s in seqs]
            pairs = grp[["USUBJID", "CLSEQ"]].dropna()
            if len(pairs) > 0:
                relrec_subject_seqs = [
                    (str(r["USUBJID"]).strip(), int(float(r["CLSEQ"])))
                    for _, r in pairs.iterrows()
                ]

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
            "modifier_profile": modifier_profile,
            "_relrec_seq": relrec_seqs,
            "_relrec_subject_seqs": relrec_subject_seqs,
        })

    return findings
