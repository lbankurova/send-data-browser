"""DD (Death Diagnosis) domain parser: cause-of-death records."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def parse_dd_domain(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Parse DD.xpt for cause-of-death records.

    Returns a list of dicts, one per DD record, enriched with subject info:
      - USUBJID, SEX, dose_level, is_recovery
      - cause (DDSTRESC or DDORRES), raw_cause (DDORRES)
      - relatedness (DDRESCAT), study_day (DDDY)
    """
    if "dd" not in study.xpt_files:
        return []

    dd_df, _ = read_xpt(study.xpt_files["dd"])
    dd_df.columns = [c.upper() for c in dd_df.columns]

    if "USUBJID" not in dd_df.columns:
        return []

    # Merge with subjects for dose_level, SEX, is_recovery, is_satellite
    dd_df = dd_df.merge(
        subjects[["USUBJID", "SEX", "dose_level", "is_recovery", "is_satellite"]],
        on="USUBJID",
        how="inner",
    )

    records = []
    for _, row in dd_df.iterrows():
        cause = str(row.get("DDSTRESC", row.get("DDORRES", ""))).strip()
        raw_cause = str(row.get("DDORRES", "")).strip()
        relatedness = str(row.get("DDRESCAT", "")).strip()
        study_day = row.get("DDDY")
        if study_day is not None:
            try:
                study_day = int(study_day)
            except (ValueError, TypeError):
                study_day = None

        # Skip empty/nan causes
        if not cause or cause == "nan":
            cause = raw_cause if raw_cause and raw_cause != "nan" else "Unknown"

        records.append({
            "USUBJID": str(row["USUBJID"]),
            "SEX": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "is_recovery": bool(row["is_recovery"]),
            "is_satellite": bool(row.get("is_satellite", False)),
            "cause": cause,
            "raw_cause": raw_cause if raw_cause != "nan" else "",
            "relatedness": relatedness if relatedness != "nan" else "",
            "study_day": study_day,
        })

    return records
