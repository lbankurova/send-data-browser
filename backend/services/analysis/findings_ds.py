"""DS (Disposition) domain findings: mortality signal per dose group."""

import numpy as np
import pandas as pd
import polars as pl

from services.study_discovery import StudyInfo
from services.analysis.statistics import incidence_exact_both, trend_test_incidence
from services.analysis.day_utils import mode_day
from services.analysis.pl_utils import read_xpt_as_polars, subjects_to_polars


DEATH_TERMS = {
    "DEAD", "DEATH", "FOUND DEAD", "DIED",
    "EUTHANIZED", "EUTHANASIA", "EUTHANIZED MORIBUND",
    "SACRIFICED MORIBUND", "MORIBUND SACRIFICE", "MORIBUND",
}


def classify_disposition(dsdecod: str) -> str:
    """Classify a DS disposition term into a category.

    Returns one of: "death", "accidental", "scheduled", "unknown".
    """
    term = dsdecod.strip().upper()
    if term in DEATH_TERMS:
        return "death"
    if term in {"TERMINAL SACRIFICE", "SCHEDULED EUTHANASIA",
                "SCHEDULED SACRIFICE", "TERMINAL KILL"}:
        return "scheduled"
    if term in {"ACCIDENTAL DEATH", "DOSING ACCIDENT", "GAVAGE ERROR"}:
        return "accidental"
    return "unknown"


def compute_ds_findings(
    study: StudyInfo,
    subjects: pd.DataFrame,
    excluded_subjects: set[str] | None = None,
) -> list[dict]:
    """Compute mortality findings from DS domain."""
    if "ds" not in study.xpt_files:
        return []

    ds_df = read_xpt_as_polars(study.xpt_files["ds"])
    subs = subjects_to_polars(subjects)

    if "DSSTDY" in ds_df.columns:
        ds_df = ds_df.with_columns(pl.col("DSSTDY").cast(pl.Float64, strict=False))

    if "DSDECOD" not in ds_df.columns:
        return []

    # Main study subjects only (no recovery, no satellites)
    main_subs = subs.filter(~pl.col("is_recovery") & ~pl.col("is_satellite"))
    if excluded_subjects:
        main_subs = main_subs.filter(~pl.col("USUBJID").is_in(list(excluded_subjects)))
    ds_df = ds_df.join(main_subs.select(["USUBJID", "SEX", "dose_level"]), on="USUBJID", how="inner")

    # Filter to death-related records
    ds_df = ds_df.with_columns(
        pl.col("DSDECOD").cast(pl.Utf8).str.strip_chars().str.to_uppercase().alias("decod_upper")
    )
    deaths = ds_df.filter(pl.col("decod_upper").is_in(list(DEATH_TERMS)))

    if deaths.height == 0:
        return []

    # Build n_per_group lookup
    n_per_group: dict[tuple, int] = {}
    for row in main_subs.group_by(["dose_level", "SEX"]).len().iter_rows(named=True):
        n_per_group[(row["dose_level"], row["SEX"])] = row["len"]
    all_dose_levels = sorted(main_subs["dose_level"].unique().to_list())

    findings = []

    for (sex,), sex_deaths in deaths.group_by(["SEX"], maintain_order=True):
        group_stats = []
        control_affected = 0
        control_total = 0
        dose_counts = {}

        for dose_level in all_dose_levels:
            dose_grp = sex_deaths.filter(pl.col("dose_level") == dose_level)
            affected = int(dose_grp["USUBJID"].n_unique())
            total = int(n_per_group.get((dose_level, sex), 0))
            dose_counts[dose_level] = (affected, total)

            group_stats.append({
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
                "avg_severity": None,
            })

            if dose_level == 0:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        pairwise = []
        for dose_level in all_dose_levels:
            if dose_level <= 0:
                continue
            treat_affected, treat_total = dose_counts[dose_level]
            if treat_total == 0 or control_total == 0:
                continue
            table = [
                [treat_affected, treat_total - treat_affected],
                [control_affected, control_total - control_affected],
            ]
            result = incidence_exact_both(table)
            pairwise.append({
                "dose_level": int(dose_level),
                "p_value": result["p_value"],
                "p_value_adj": result["p_value"],
                "odds_ratio": result["odds_ratio"],
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

        total_deaths = int(sex_deaths["USUBJID"].n_unique())

        # mode_day needs pandas — convert the small group
        day = mode_day(sex_deaths.to_pandas(), "DSSTDY")

        findings.append({
            "domain": "DS",
            "test_code": "MORTALITY",
            "test_name": "Mortality",
            "specimen": None,
            "finding": "Mortality",
            "day": day,
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
            "avg_severity": None,
            "mortality_count": total_deaths,
        })

    return findings
