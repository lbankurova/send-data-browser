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

# ── Normal-observation terms to exclude ──────────────────────
NORMAL_TERMS = frozenset({
    "NORMAL", "WITHIN NORMAL LIMITS", "WNL",
    "NO ABNORMALITIES", "UNREMARKABLE", "NONE", "NAN", "",
})


def compute_incidence_verdict(
    main_inc: float,
    rec_inc: float,
) -> str | None:
    """Classify recovery outcome from main vs recovery incidence ratios.

    Returns one of: resolved, improving, worsening, persistent, new_in_recovery, None.
    """
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


def compute_incidence_recovery(
    cl_df: pd.DataFrame,
    subjects_df: pd.DataFrame,
    domain_key: str,
    day_col: str,
    last_dosing_day: int | None = None,
    recovery_day: int | None = None,
) -> list[dict]:
    """Compute incidence recovery rows for a CL-like domain.

    Args:
        cl_df: Raw CL domain DataFrame (must have USUBJID, observation column, day_col).
        subjects_df: Subject roster with USUBJID, SEX, dose_level, dose_label, is_recovery.
        domain_key: Domain identifier (e.g. "cl").
        day_col: Column name for study day (e.g. "CLDY").
        last_dosing_day: Treatment/recovery boundary day. None disables time-period filtering.
        recovery_day: Recovery sacrifice day (for output metadata).

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

    # Get unique findings
    all_findings = sorted(set(main_df[obs_col].unique()) | set(rec_df[obs_col].unique()))

    rows: list[dict] = []

    for finding_name in all_findings:
        for sex_val in ["F", "M"]:
            for dose_level in sorted(subjects_df["dose_level"].unique()):
                if dose_level == 0:
                    continue

                main_match = main_df[
                    (main_df[obs_col] == finding_name) &
                    (main_df["SEX"] == sex_val) &
                    (main_df["dose_level"] == dose_level)
                ]
                main_affected = main_match["USUBJID"].nunique()

                rec_match = rec_df[
                    (rec_df[obs_col] == finding_name) &
                    (rec_df["SEX"] == sex_val) &
                    (rec_df["dose_level"] == dose_level)
                ]
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

                dose_label = ""
                if not main_roster.empty:
                    dose_label = str(main_roster["dose_label"].iloc[0])
                elif not rec_roster.empty:
                    dose_label = str(rec_roster["dose_label"].iloc[0])

                if main_n == 0 and rec_n == 0:
                    continue

                main_inc = main_affected / main_n if main_n > 0 else 0
                rec_inc = rec_affected / rec_n if rec_n > 0 else 0
                verdict = compute_incidence_verdict(main_inc, rec_inc)

                rows.append({
                    "domain": domain_key.upper(),
                    "finding": finding_name,
                    "sex": sex_val,
                    "dose_level": int(dose_level),
                    "dose_label": dose_label,
                    "main_affected": main_affected,
                    "main_n": main_n,
                    "recovery_affected": rec_affected,
                    "recovery_n": rec_n,
                    "recovery_day": recovery_day,
                    "verdict": verdict,
                })

    return rows
