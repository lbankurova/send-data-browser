"""Incidence-based recovery comparison for CL-like domains.

Extracted from temporal.py endpoint for testability.

Usage:
    from services.analysis.incidence_recovery import compute_incidence_verdict, compute_incidence_recovery

Functions:
    compute_incidence_verdict: Pure verdict logic from incidence ratios
    compute_incidence_recovery: DataFrame-level processing (filter, group, count, verdict)
"""

from __future__ import annotations

import pandas as pd

# Severity text → numeric grade mapping (matches findings_mi.py)
SEVERITY_SCORES = {"MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5}

# ── Normal-observation terms to exclude ──────────────────────
NORMAL_TERMS = frozenset({
    "NORMAL", "WITHIN NORMAL LIMITS", "WNL",
    "NO ABNORMALITIES", "UNREMARKABLE", "NONE", "NAN", "",
})

# SLA-15: Minimum recovery arm sample size — mirrors MI recovery's
# insufficient_n guard.  A verdict from N<3 animals has no statistical
# power and would mislead the toxicologist.
MIN_RECOVERY_N = 3


def compute_incidence_verdict(
    main_inc: float,
    rec_inc: float,
    rec_n: int | None = None,
) -> str | None:
    """Classify recovery outcome from main vs recovery incidence ratios.

    Args:
        rec_n: Recovery arm sample size.  When provided and < MIN_RECOVERY_N,
               returns ``"insufficient_n"`` immediately.  ``None`` skips the guard
               (for backward-compatible calls that only have incidence ratios).

    Returns one of: resolved, improving, worsening, persistent,
    new_in_recovery, insufficient_n, or None.
    """
    if rec_n is not None and rec_n < MIN_RECOVERY_N:
        return "insufficient_n"
    if main_inc == 0 and rec_inc == 0:
        return None  # nothing observed in either period — not a recovery outcome
    if rec_inc == 0:
        return "resolved"
    if rec_inc < main_inc:
        return "improving"
    if rec_inc > main_inc and main_inc > 0:
        return "worsening"
    if main_inc > 0:
        return "persistent"
    if rec_inc > 0:
        return "new_in_recovery"
    return None


def _count_severity_grades(match_df: pd.DataFrame, sev_col: str) -> dict[str, int] | None:
    """Count severity grades (1-5) from matched rows. Returns None if no grades."""
    if sev_col not in match_df.columns:
        return None
    sev_vals = match_df[sev_col].astype(str).str.strip().str.upper().map(SEVERITY_SCORES)
    sev_vals = sev_vals.dropna()
    if len(sev_vals) == 0:
        return None
    counts: dict[str, int] = {}
    for v in sev_vals:
        key = str(int(v))
        counts[key] = counts.get(key, 0) + 1
    return counts


def compute_incidence_recovery(
    cl_df: pd.DataFrame,
    subjects_df: pd.DataFrame,
    domain_key: str,
    day_col: str,
    last_dosing_day: int | None = None,
    recovery_day: int | None = None,
    specimen_col: str | None = None,
    sev_col: str | None = None,
) -> list[dict]:
    """Compute incidence recovery rows for a CL-like domain.

    Args:
        cl_df: Raw CL domain DataFrame (must have USUBJID, observation column, day_col).
        subjects_df: Subject roster with USUBJID, SEX, dose_level, dose_label, is_recovery.
        domain_key: Domain identifier (e.g. "cl", "mi").
        day_col: Column name for study day (e.g. "CLDY").
        last_dosing_day: Treatment/recovery boundary day. None disables time-period filtering.
        recovery_day: Recovery sacrifice day (for output metadata).
        specimen_col: Optional specimen/organ column (e.g. "MISPEC"). When set, rows
            are grouped by (specimen, finding) and include a ``specimen`` field.
        sev_col: Optional severity column (e.g. "MISEV"). When set, each row includes
            ``main_severity_counts`` and ``recovery_severity_counts`` dicts mapping
            grade (1-5) to count.

    Returns:
        List of incidence recovery row dicts.
    """
    prefix = domain_key.upper()
    stresc_col = f"{prefix}STRESC"
    orres_col = f"{prefix}ORRES"
    obs_col = stresc_col if stresc_col in cl_df.columns else (orres_col if orres_col in cl_df.columns else None)
    if obs_col is None:
        return []

    df = cl_df.copy()

    # Normalise observation text
    df[obs_col] = df[obs_col].astype(str).str.strip().str.upper()
    df = df[~df[obs_col].isin(NORMAL_TERMS)]
    if df.empty:
        return []

    # Normalise specimen column if provided
    has_specimen = specimen_col is not None and specimen_col in df.columns
    if has_specimen:
        df[specimen_col] = df[specimen_col].astype(str).str.strip().str.upper()

    # Join dose info
    df = df.merge(
        subjects_df[["USUBJID", "SEX", "dose_level", "dose_label", "is_recovery"]],
        on="USUBJID", how="inner",
    )

    # Time-period filter: restrict main-arm records to treatment period,
    # recovery-arm records to recovery period.
    if last_dosing_day is not None and day_col in df.columns:
        df[day_col] = pd.to_numeric(df[day_col], errors="coerce")
        main_df = df[~df["is_recovery"] & (df[day_col].isna() | (df[day_col] <= last_dosing_day))]
        rec_df = df[df["is_recovery"] & (df[day_col].isna() | (df[day_col] > last_dosing_day))]
    else:
        main_df = df[~df["is_recovery"]]
        rec_df = df[df["is_recovery"]]

    # All subjects roster by (sex, dose_level) for denominators
    roster = subjects_df.groupby(["SEX", "dose_level", "is_recovery"]).agg(
        n=("USUBJID", "nunique"),
        dose_label=("dose_label", "first"),
    ).reset_index()

    # Build iteration axes
    all_findings = sorted(set(main_df[obs_col].unique()) | set(rec_df[obs_col].unique()))
    all_specimens: list[str | None] = [None]
    if has_specimen:
        all_specimens = sorted(
            set(main_df[specimen_col].unique()) | set(rec_df[specimen_col].unique())
        )

    rows: list[dict] = []

    for specimen_val in all_specimens:
        for finding_name in all_findings:
            for sex_val in ["F", "M"]:
                for dose_level in sorted(subjects_df["dose_level"].unique()):
                    main_mask = (
                        (main_df[obs_col] == finding_name) &
                        (main_df["SEX"] == sex_val) &
                        (main_df["dose_level"] == dose_level)
                    )
                    rec_mask = (
                        (rec_df[obs_col] == finding_name) &
                        (rec_df["SEX"] == sex_val) &
                        (rec_df["dose_level"] == dose_level)
                    )
                    if has_specimen and specimen_val is not None:
                        main_mask = main_mask & (main_df[specimen_col] == specimen_val)
                        rec_mask = rec_mask & (rec_df[specimen_col] == specimen_val)

                    main_match = main_df[main_mask]
                    rec_match = rec_df[rec_mask]

                    main_affected = main_match["USUBJID"].nunique()
                    rec_affected = rec_match["USUBJID"].nunique()

                    main_roster = roster[
                        (roster["SEX"] == sex_val) &
                        (roster["dose_level"] == dose_level) &
                        (~roster["is_recovery"])
                    ]
                    rec_roster = roster[
                        (roster["SEX"] == sex_val) &
                        (roster["dose_level"] == dose_level) &
                        (roster["is_recovery"])
                    ]
                    main_n = int(main_roster["n"].iloc[0]) if not main_roster.empty else 0
                    rec_n = int(rec_roster["n"].iloc[0]) if not rec_roster.empty else 0

                    dose_label_str = ""
                    if not main_roster.empty:
                        dose_label_str = str(main_roster["dose_label"].iloc[0])
                    elif not rec_roster.empty:
                        dose_label_str = str(rec_roster["dose_label"].iloc[0])

                    if main_n == 0 and rec_n == 0:
                        continue
                    if main_affected == 0 and rec_affected == 0:
                        continue

                    main_inc = main_affected / main_n if main_n > 0 else 0
                    rec_inc = rec_affected / rec_n if rec_n > 0 else 0
                    # Control group: no recovery verdict (background rate only)
                    verdict = None if dose_level == 0 else compute_incidence_verdict(main_inc, rec_inc, rec_n)

                    row: dict = {
                        "domain": domain_key.upper(),
                        "finding": finding_name,
                        "sex": sex_val,
                        "dose_level": int(dose_level),
                        "dose_label": dose_label_str,
                        "main_affected": main_affected,
                        "main_n": main_n,
                        "recovery_affected": rec_affected,
                        "recovery_n": rec_n,
                        "recovery_day": recovery_day,
                        "verdict": verdict,
                    }

                    if has_specimen and specimen_val is not None:
                        row["specimen"] = specimen_val

                    if sev_col:
                        row["main_severity_counts"] = _count_severity_grades(main_match, sev_col)
                        row["recovery_severity_counts"] = _count_severity_grades(rec_match, sev_col)

                    rows.append(row)

    return rows
