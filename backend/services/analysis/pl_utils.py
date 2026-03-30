"""Polars utility functions for the findings pipeline.

Provides Polars-native equivalents of phase_filter operations and common
DataFrame conversions. Used by findings modules migrated from pandas.
"""

import polars as pl


def read_xpt_as_polars(xpt_path) -> pl.DataFrame:
    """Read an XPT file via pyreadstat, return as Polars DataFrame.

    pyreadstat returns pandas — we convert once at the boundary.
    Normalizes column names to uppercase.
    """
    from services.xpt_processor import read_xpt
    pd_df, _ = read_xpt(xpt_path)
    pd_df.columns = [c.upper() for c in pd_df.columns]
    return pl.from_pandas(pd_df)


def subjects_to_polars(subjects) -> pl.DataFrame:
    """Convert pandas subjects DataFrame to Polars. No-op if already Polars."""
    if isinstance(subjects, pl.DataFrame):
        return subjects
    return pl.from_pandas(subjects)


def get_treatment_subjects_pl(subjects: pl.DataFrame) -> pl.DataFrame:
    """Return subjects for treatment-period analysis: main + recovery, excluding satellites."""
    return subjects.filter(~pl.col("is_satellite"))


def get_terminal_subjects_pl(subjects: pl.DataFrame) -> pl.DataFrame:
    """Return subjects for terminal analysis: main study only, excluding recovery + satellites."""
    return subjects.filter(~pl.col("is_recovery") & ~pl.col("is_satellite"))


def filter_treatment_period_records_pl(
    records: pl.DataFrame,
    subjects: pl.DataFrame,
    day_column: str,
    last_dosing_day: int | None,
) -> pl.DataFrame:
    """Filter domain records to keep only treatment-period data for recovery animals.

    Polars equivalent of phase_filter.filter_treatment_period_records.
    """
    if day_column not in records.columns:
        return records

    recovery_ids = set(
        subjects.filter(pl.col("is_recovery"))["USUBJID"].to_list()
    )
    if not recovery_ids:
        return records

    is_recovery = pl.col("USUBJID").is_in(list(recovery_ids))

    if last_dosing_day is None:
        return records.filter(~is_recovery)

    day = pl.col(day_column).cast(pl.Float64, strict=False)
    keep = ~is_recovery | (day <= last_dosing_day)
    return records.filter(keep)
