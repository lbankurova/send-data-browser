"""FW (Food/Water) domain utilities — shared between domain_stats and food_consumption_summary."""

import pandas as pd

from services.study_discovery import StudyInfo


def resolve_fw_subjects(
    fw_df: pd.DataFrame,
    subjects: pd.DataFrame,
    study: StudyInfo,
) -> pd.DataFrame:
    """Merge FW records with subject roster, resolving via POOLDEF if direct USUBJID merge fails.

    Returns FW DataFrame with USUBJID, SEX, dose_level columns added.
    Returns empty DataFrame if resolution fails.
    """
    from services.xpt_processor import read_xpt

    treatment_subs = subjects[~subjects["is_satellite"]].copy()

    # Try direct USUBJID merge first
    merged = fw_df.merge(
        treatment_subs[["USUBJID", "SEX", "dose_level"]],
        on="USUBJID", how="inner",
    )
    if len(merged) > 0:
        return merged

    # Fallback: resolve via POOLDEF (POOLID → USUBJID)
    if "POOLID" not in fw_df.columns or "pooldef" not in study.xpt_files:
        return merged  # empty

    pool_df, _ = read_xpt(study.xpt_files["pooldef"])
    pool_df.columns = [c.upper() for c in pool_df.columns]
    if "USUBJID" not in pool_df.columns or "POOLID" not in pool_df.columns:
        return merged  # empty

    # POOLDEF maps POOLID → USUBJID (possibly many-to-one for cage-level data)
    fw_with_subj = fw_df.merge(
        pool_df[["USUBJID", "POOLID"]], on="POOLID",
        how="inner", suffixes=("_fw", ""),
    )
    return fw_with_subj.merge(
        treatment_subs[["USUBJID", "SEX", "dose_level"]],
        on="USUBJID", how="inner",
    )
