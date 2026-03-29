"""Per-occasion baseline computation for crossover/escalation studies.

For each subject x period x endpoint, computes the baseline from predose
readings. Change-from-baseline values are used for within-subject statistics.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from generator.adapters.treatment_periods import assign_day_to_period

log = logging.getLogger(__name__)


def _is_predose_timepoint(
    tpt: str | None,
    tptnum: float | None,
    blfl: str | None = None,
) -> bool:
    """Detect predose timepoints from EGBLFL, EGTPT text, or EGTPTNUM.

    Priority:
      1. EGBLFL = "Y" (SEND baseline flag — most reliable)
      2. EGTPT text contains "predose", "pre-dose", or "before dosing"
      3. (Fallback handled by caller — not here, to avoid false positives)
    """
    # EGBLFL: SEND standard baseline flag
    if blfl is not None and str(blfl).strip().upper() == "Y":
        return True
    # Text matching
    if tpt is not None:
        tpt_lower = str(tpt).lower()
        if "predose" in tpt_lower or "pre-dose" in tpt_lower:
            return True
        if "before dosing" in tpt_lower:
            return True
    return False


def _is_postdose_timepoint(tpt: str | None, tptnum: float | None) -> bool:
    """Detect postdose timepoints from EGTPT text or EGTPTNUM."""
    if tpt is not None:
        tpt_lower = str(tpt).lower()
        if "postdose" in tpt_lower or "post-dose" in tpt_lower or "after dosing" in tpt_lower:
            return True
    return False


def _is_derived_mean(tpt: str | None) -> bool:
    """Detect derived mean timepoints (CJUGSEND00 EGTPTNUM=3: 'Mean of the values...')."""
    if tpt is not None:
        tpt_lower = str(tpt).lower()
        if "mean of" in tpt_lower:
            return True
    return False


def compute_per_occasion_baselines(
    domain_df: pd.DataFrame,
    subject_periods: dict[str, list[dict]],
    day_col: str = "EGDY",
    value_col: str = "value",
    testcd_col: str = "EGTESTCD",
    tpt_col: str | None = "EGTPT",
    tptnum_col: str | None = "EGTPTNUM",
    blfl_col: str | None = None,
) -> dict[str, dict[int, dict[str, float]]]:
    """Compute per-subject per-period per-endpoint baselines from predose readings.

    Returns:
        {subject_id: {period: {test_code: baseline_value}}}
    """
    baselines: dict[str, dict[int, dict[str, float]]] = {}

    has_tpt = tpt_col and tpt_col in domain_df.columns
    has_tptnum = tptnum_col and tptnum_col in domain_df.columns
    # Auto-detect BLFL column if not specified
    if blfl_col is None:
        for candidate in ["EGBLFL", "VSBLFL", "BLFL"]:
            if candidate in domain_df.columns:
                blfl_col = candidate
                break
    has_blfl = blfl_col and blfl_col in domain_df.columns

    for subj_id, periods in subject_periods.items():
        subj_df = domain_df[domain_df["USUBJID"] == subj_id]
        if subj_df.empty:
            continue

        baselines[subj_id] = {}

        for period_info in periods:
            period_idx = period_info["period"]
            start_day = period_info.get("start_day")
            if start_day is None:
                continue

            # Find rows on the dosing day (start_day) that are predose
            dosing_day_rows = subj_df[subj_df[day_col] == start_day]

            if dosing_day_rows.empty:
                continue

            predose_rows = []
            for _, row in dosing_day_rows.iterrows():
                tpt = str(row[tpt_col]) if has_tpt else None
                tptnum = row[tptnum_col] if has_tptnum else None
                blfl = str(row[blfl_col]) if has_blfl else None

                # Skip derived means — use raw predose readings
                if _is_derived_mean(tpt):
                    continue

                if _is_predose_timepoint(tpt, tptnum, blfl):
                    predose_rows.append(row)

            if not predose_rows:
                # Fallback: if no predose identified by text/BLFL, use all readings
                # before the first postdose reading
                for _, row in dosing_day_rows.iterrows():
                    tpt = str(row[tpt_col]) if has_tpt else None
                    tptnum = row[tptnum_col] if has_tptnum else None
                    if not _is_postdose_timepoint(tpt, tptnum) and not _is_derived_mean(tpt):
                        predose_rows.append(row)

            if not predose_rows:
                continue

            predose_df = pd.DataFrame(predose_rows)
            baselines[subj_id][period_idx] = {}

            for testcd, grp in predose_df.groupby(testcd_col):
                vals = grp[value_col].dropna().values
                if len(vals) > 0:
                    baselines[subj_id][period_idx][str(testcd)] = float(np.mean(vals))

    return baselines


def compute_change_from_baseline(
    domain_df: pd.DataFrame,
    baselines: dict[str, dict[int, dict[str, float]]],
    subject_periods: dict[str, list[dict]],
    day_col: str = "EGDY",
    value_col: str = "value",
    testcd_col: str = "EGTESTCD",
    tpt_col: str | None = "EGTPT",
    blfl_col: str | None = None,
) -> pd.DataFrame:
    """Compute change-from-baseline for each postdose observation.

    Adds columns: 'cfb' (change from baseline), 'period', 'period_dose'.
    Only retains postdose rows with valid baselines.
    """
    has_tpt = tpt_col and tpt_col in domain_df.columns
    # Auto-detect BLFL column
    if blfl_col is None:
        for candidate in ["EGBLFL", "VSBLFL", "BLFL"]:
            if candidate in domain_df.columns:
                blfl_col = candidate
                break
    has_blfl = blfl_col and blfl_col in domain_df.columns
    records = []

    for subj_id, periods in subject_periods.items():
        subj_df = domain_df[domain_df["USUBJID"] == subj_id]
        if subj_df.empty:
            continue

        subj_baselines = baselines.get(subj_id, {})

        for period_info in periods:
            period_idx = period_info["period"]
            dose_value = period_info.get("dose_value")
            start_day = period_info.get("start_day")
            if start_day is None:
                continue

            period_baselines = subj_baselines.get(period_idx, {})
            if not period_baselines:
                continue

            # Get all rows in this period's window
            period_end = start_day + 7  # generous window
            period_rows = subj_df[
                (subj_df[day_col] >= start_day) &
                (subj_df[day_col] <= period_end)
            ]

            for _, row in period_rows.iterrows():
                tpt = str(row[tpt_col]) if has_tpt else None
                blfl = str(row[blfl_col]) if has_blfl else None

                # Skip predose and derived-mean rows
                if _is_predose_timepoint(tpt, None, blfl) or _is_derived_mean(tpt):
                    continue
                if tpt and "before dosing" in str(tpt).lower():
                    continue

                testcd = str(row[testcd_col])
                val = row[value_col]
                baseline = period_baselines.get(testcd)

                if baseline is None or pd.isna(val):
                    continue

                records.append({
                    "USUBJID": subj_id,
                    testcd_col: testcd,
                    day_col: row[day_col],
                    value_col: val,
                    "cfb": float(val) - baseline,
                    "baseline": baseline,
                    "period": period_idx,
                    "period_dose": dose_value,
                })

    if not records:
        return pd.DataFrame()

    return pd.DataFrame(records)
