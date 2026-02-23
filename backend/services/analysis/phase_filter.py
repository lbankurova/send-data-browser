"""Phase-aware subject and record filtering for recovery animal treatment-period pooling.

During the treatment period, recovery animals receive identical treatment to main study
animals. Their in-life data (BW, LB, CL, FW, BG, EG, VS) should be pooled with main
study animals for treatment-period statistics. Terminal domains (MI, MA, OM, TF) remain
main-study-only because sacrifice timing differs.

See docs/knowledge/recovery-animal-data-handling-spec.md for the full specification.
"""

import re

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def _parse_iso_duration_days(duration: str) -> int | None:
    """Parse ISO 8601 duration string (e.g., P28D, P4W, P13W) to days."""
    if not duration or duration == "nan":
        return None
    m = re.match(
        r"P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?", duration, re.IGNORECASE
    )
    if not m:
        return None
    years = int(m.group(1) or 0)
    months = int(m.group(2) or 0)
    weeks = int(m.group(3) or 0)
    days = int(m.group(4) or 0)
    total = years * 365 + months * 30 + weeks * 7 + days
    return total if total > 0 else None


def compute_last_dosing_day(study: StudyInfo) -> int | None:
    """Compute the last dosing day (study day number) from TE or TS domains.

    Used to separate treatment-period records (pool main + recovery) from
    recovery-period records (recovery only).

    Method 1: TE/TA domains — accumulate epoch durations, find treatment epoch end.
    Method 2: TS.DOSDUR — parse dosing duration (assumes dosing starts Day 1).
    """
    # Method 1: TE + TA domains — per-arm epoch structure
    if "te" in study.xpt_files and "ta" in study.xpt_files:
        try:
            te_df, _ = read_xpt(study.xpt_files["te"])
            te_df.columns = [c.upper() for c in te_df.columns]
            ta_df, _ = read_xpt(study.xpt_files["ta"])
            ta_df.columns = [c.upper() for c in ta_df.columns]

            # Build ETCD → TEDUR mapping from TE
            tedur_map: dict[str, str] = {}
            if "ETCD" in te_df.columns and "TEDUR" in te_df.columns:
                for _, row in te_df.iterrows():
                    etcd = str(row.get("ETCD", "")).strip()
                    tedur = str(row.get("TEDUR", "")).strip()
                    if etcd and tedur and tedur != "nan":
                        tedur_map[etcd] = tedur

            # Walk each arm's epochs, accumulate durations, find treatment end
            treatment_end_days: list[int] = []
            for armcd in ta_df["ARMCD"].astype(str).str.strip().unique():
                arm_ta = ta_df[ta_df["ARMCD"].astype(str).str.strip() == armcd]
                if "TAETORD" in arm_ta.columns:
                    arm_ta = arm_ta.sort_values("TAETORD")

                cumulative = 0
                for _, row in arm_ta.iterrows():
                    etcd = str(row.get("ETCD", "")).strip()
                    epoch = str(row.get("EPOCH", "")).strip().lower()

                    dur = _parse_iso_duration_days(tedur_map.get(etcd, ""))

                    if "treatment" in epoch or "dosing" in epoch:
                        if dur:
                            treatment_end_days.append(cumulative + dur)

                    if dur:
                        cumulative += dur

            if treatment_end_days:
                return max(treatment_end_days)
        except Exception:
            pass

    # Method 2: TS domain — DOSDUR parameter
    if "ts" in study.xpt_files:
        try:
            ts_df, _ = read_xpt(study.xpt_files["ts"])
            ts_df.columns = [c.upper() for c in ts_df.columns]
            dosdur_rows = ts_df[
                ts_df["TSPARMCD"].astype(str).str.strip() == "DOSDUR"
            ]
            if len(dosdur_rows) > 0:
                days = _parse_iso_duration_days(
                    str(dosdur_rows["TSVAL"].iloc[0]).strip()
                )
                if days:
                    return days
        except Exception:
            pass

    return None


# ── Subject selection ────────────────────────────────────────────────────

# Domains where treatment-period pooling applies (in-life, longitudinal)
IN_LIFE_DOMAINS = {"BW", "LB", "CL", "FW", "BG", "EG", "VS"}

# Domains where only main study animals are used (terminal sacrifice)
TERMINAL_DOMAINS = {"MI", "MA", "OM", "TF"}


def get_treatment_subjects(subjects: pd.DataFrame) -> pd.DataFrame:
    """Return subjects for treatment-period analysis: main + recovery, excluding satellites.

    Recovery animals receive the same treatment during the dosing period and should
    be pooled with main study animals for in-life domain statistics.
    """
    return subjects[~subjects["is_satellite"]].copy()


def get_terminal_subjects(subjects: pd.DataFrame) -> pd.DataFrame:
    """Return subjects for terminal analysis: main study only, excluding recovery + satellites."""
    return subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()


# ── Record filtering ─────────────────────────────────────────────────────


def filter_treatment_period_records(
    records: pd.DataFrame,
    subjects: pd.DataFrame,
    day_column: str,
    last_dosing_day: int | None,
) -> pd.DataFrame:
    """Filter domain records to keep only treatment-period data for recovery animals.

    - All main study animal records: kept as-is
    - Recovery animal records with day <= last_dosing_day: kept (treatment period)
    - Recovery animal records with day > last_dosing_day: excluded (recovery period)

    If last_dosing_day is None, recovery animals are excluded entirely (safe fallback).
    If day_column doesn't exist in records, recovery animals are included unfiltered.
    """
    if day_column not in records.columns:
        return records

    recovery_ids = set(subjects[subjects["is_recovery"]]["USUBJID"])
    is_recovery = records["USUBJID"].isin(recovery_ids)

    if not is_recovery.any():
        return records  # No recovery records present

    if last_dosing_day is None:
        # Can't determine treatment period — exclude recovery records to be safe
        return records[~is_recovery].copy()

    day = pd.to_numeric(records[day_column], errors="coerce")

    # Keep: all non-recovery records + recovery records within treatment period
    keep = ~is_recovery | (day <= last_dosing_day)
    return records[keep].copy()
