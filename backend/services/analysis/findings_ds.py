"""DS (Disposition) domain findings: mortality signal per dose group."""

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import fisher_exact_2x2, trend_test_incidence
from services.analysis.day_utils import mode_day


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


def compute_ds_findings(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Compute mortality findings from DS domain.

    Identifies deaths/euthanasia from DSDECOD, creates incidence-based
    findings per dose group following the MI findings pattern.
    """
    if "ds" not in study.xpt_files:
        return []

    ds_df, _ = read_xpt(study.xpt_files["ds"])
    ds_df.columns = [c.upper() for c in ds_df.columns]
    ds_df["DSSTDY"] = pd.to_numeric(ds_df.get("DSSTDY", pd.Series(dtype=float)), errors="coerce")

    # Must have DSDECOD (decoded disposition term)
    if "DSDECOD" not in ds_df.columns:
        return []

    main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
    ds_df = ds_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Filter to death-related records
    ds_df["decod_upper"] = ds_df["DSDECOD"].astype(str).str.strip().str.upper()
    deaths = ds_df[ds_df["decod_upper"].isin(DEATH_TERMS)].copy()

    if len(deaths) == 0:
        return []

    n_per_group = main_subs.groupby(["dose_level", "SEX"]).size().to_dict()
    all_dose_levels = sorted(main_subs["dose_level"].unique())

    findings = []

    for sex, sex_deaths in deaths.groupby("SEX"):
        group_stats = []
        control_affected = 0
        control_total = 0
        dose_counts = {}

        for dose_level in all_dose_levels:
            dose_grp = sex_deaths[sex_deaths["dose_level"] == dose_level]
            affected = int(dose_grp["USUBJID"].nunique())
            total = int(n_per_group.get((dose_level, sex), 0))
            dose_counts[dose_level] = (affected, total)

            group_stats.append({
                "dose_level": int(dose_level),
                "n": total,
                "affected": affected,
                "incidence": round(affected / total, 4) if total > 0 else 0,
                "avg_severity": None,
            })

            if dose_level == all_dose_levels[0]:
                control_affected = affected
                control_total = total

        incidence_counts = [dose_counts[dl][0] for dl in all_dose_levels]
        incidence_totals = [dose_counts[dl][1] for dl in all_dose_levels]

        # Fisher exact tests (each dose vs control)
        pairwise = []
        for dose_level in all_dose_levels:
            if dose_level == all_dose_levels[0]:
                continue
            treat_affected, treat_total = dose_counts[dose_level]
            if treat_total == 0 or control_total == 0:
                continue
            table = [
                [treat_affected, treat_total - treat_affected],
                [control_affected, control_total - control_affected],
            ]
            result = fisher_exact_2x2(table)
            pairwise.append({
                "dose_level": int(dose_level),
                "p_value": result["p_value"],
                "p_value_adj": result["p_value"],
                "odds_ratio": result["odds_ratio"],
            })

        # Trend test
        trend_result = trend_test_incidence(incidence_counts, incidence_totals)

        # Direction
        direction = None
        if control_total > 0 and incidence_totals[-1] > 0:
            ctrl_inc = incidence_counts[0] / control_total
            high_inc = incidence_counts[-1] / incidence_totals[-1]
            direction = "up" if high_inc > ctrl_inc else "down" if high_inc < ctrl_inc else "none"

        # Min p-value
        min_p = None
        for pw in pairwise:
            if pw["p_value"] is not None:
                if min_p is None or pw["p_value"] < min_p:
                    min_p = pw["p_value"]

        total_deaths = int(sex_deaths["USUBJID"].nunique())

        findings.append({
            "domain": "DS",
            "test_code": "MORTALITY",
            "test_name": "Mortality",
            "specimen": None,
            "finding": "Mortality",
            "day": mode_day(sex_deaths, "DSSTDY"),
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
