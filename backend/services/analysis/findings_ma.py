"""MA (Macroscopic) domain findings: per (MASPEC, MASTRESC) where abnormal -> incidence."""

import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.analysis.statistics import incidence_exact_both, trend_test_incidence
from services.analysis.supp_qualifiers import (
    load_supp_modifiers, aggregate_modifiers, count_distributions,
)
from services.analysis.day_utils import mode_day
from services.analysis.pl_utils import read_xpt_as_polars, subjects_to_polars

NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE"}


def compute_ma_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute findings from MA domain (macroscopic/gross pathology)."""
    if "ma" not in study.xpt_files:
        return []

    ma_df = read_xpt_as_polars(study.xpt_files["ma"])
    subs = subjects_to_polars(subjects)

    if "MADY" in ma_df.columns:
        ma_df = ma_df.with_columns(pl.col("MADY").cast(pl.Float64, strict=False))

    # Identify specimens with recovery subjects BEFORE filtering to main-only
    specimens_with_recovery: set[str] = set()
    recovery_subs = subs.filter(pl.col("is_recovery") & ~pl.col("is_satellite"))
    if recovery_subs.height > 0 and "MASPEC" in ma_df.columns:
        recovery_ma = ma_df.join(recovery_subs.select(["USUBJID"]), on="USUBJID", how="inner")
        if recovery_ma.height > 0:
            specimens_with_recovery = set(
                recovery_ma["MASPEC"].cast(pl.Utf8).str.strip_chars().str.to_uppercase().to_list()
            )

    main_subs = subs.filter(~pl.col("is_recovery") & ~pl.col("is_satellite"))
    if excluded_subjects:
        main_subs = main_subs.filter(~pl.col("USUBJID").is_in(list(excluded_subjects)))
    ma_df = ma_df.join(main_subs.select(["USUBJID", "SEX", "dose_level"]), on="USUBJID", how="inner")

    # Load SUPPMA modifiers (requires pandas interop — small, infrequent)
    supp_map = load_supp_modifiers(study, "ma")

    spec_col = "MASPEC" if "MASPEC" in ma_df.columns else None
    finding_col = "MASTRESC" if "MASTRESC" in ma_df.columns else None
    if spec_col is None or finding_col is None:
        return []

    # Filter to abnormal findings
    ma_df = ma_df.with_columns(
        pl.col(finding_col).cast(pl.Utf8).str.strip_chars().str.to_uppercase().alias("finding_upper")
    )
    ma_abnormal = ma_df.filter(
        ~pl.col("finding_upper").is_in(list(NORMAL_TERMS)) & (pl.col("finding_upper") != "NAN")
    )

    if ma_abnormal.height == 0:
        return []

    # Build n_per_group lookup
    n_per_group: dict[tuple, int] = {}
    for row in main_subs.group_by(["dose_level", "SEX"]).len().iter_rows(named=True):
        n_per_group[(row["dose_level"], row["SEX"])] = row["len"]
    all_dose_levels = sorted(main_subs["dose_level"].unique().to_list())

    # For SUPP modifiers + RELREC, convert to pandas for the grouped iteration
    # (these operations use apply/iterrows which are complex to port to Polars
    # for marginal benefit — the grouped subsets are small)
    ma_pd = ma_abnormal.to_pandas()

    if supp_map and "MASEQ" in ma_pd.columns:
        ma_pd["_modifiers"] = ma_pd.apply(
            lambda r: supp_map.get((r["USUBJID"], int(float(r["MASEQ"])))),
            axis=1,
        )

    findings = []

    for (specimen, finding_str, sex), grp in ma_pd.groupby([spec_col, finding_col, "SEX"]):
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

        # Aggregate modifiers
        modifier_profile = None
        if "_modifiers" in grp.columns:
            modifier_records = grp["_modifiers"].dropna().tolist()
            if modifier_records:
                profile = aggregate_modifiers(modifier_records)
                profile["n_total"] = int(grp["USUBJID"].nunique())
                modifier_profile = profile

        # RELREC seq pairs
        relrec_seqs = None
        relrec_subject_seqs = None
        if "MASEQ" in grp.columns:
            seqs = grp["MASEQ"].dropna().unique()
            if len(seqs) > 0:
                relrec_seqs = [int(float(s)) for s in seqs]
            pairs = grp[["USUBJID", "MASEQ"]].dropna()
            if len(pairs) > 0:
                relrec_subject_seqs = [
                    (str(r["USUBJID"]).strip(), int(float(r["MASEQ"])))
                    for _, r in pairs.iterrows()
                ]

        findings.append({
            "domain": "MA",
            "test_code": f"{specimen}_{finding_str}",
            "test_name": finding_str,
            "specimen": str(specimen),
            "finding": finding_str,
            "day": mode_day(grp, "MADY"),
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
            "modifier_profile": modifier_profile,
            "has_recovery_subjects": str(specimen).strip().upper() in specimens_with_recovery,
            "_relrec_seq": relrec_seqs,
            "_relrec_subject_seqs": relrec_subject_seqs,
        })

    return findings
