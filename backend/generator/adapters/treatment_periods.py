"""Treatment period assembly for crossover/escalation studies.

Parses semicolon-delimited TRTDOS from TX domain to determine dose sequences,
then uses SE (Subject Elements) domain to map subjects to treatment periods
with study day boundaries and per-subject dose assignments.
"""

from __future__ import annotations

import logging

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt

log = logging.getLogger(__name__)


def parse_dose_sequences(study: StudyInfo) -> dict:
    """Parse TX domain to extract per-SETCD dose sequences.

    Returns:
        {
            "sequences": {setcd: [dose_val, ...], ...},
            "dose_unit": str,
            "unique_doses": sorted list of unique dose values,
            "is_escalation": bool (True if all SETCDs share same sequence),
        }
    """
    tx_df, _ = read_xpt(study.xpt_files["tx"])
    tx_df.columns = [c.upper() for c in tx_df.columns]

    sequences: dict[str, list[float]] = {}
    dose_unit = "mg/kg"

    for setcd in tx_df["SETCD"].unique():
        setcd_str = str(setcd).strip()
        set_rows = tx_df[tx_df["SETCD"] == setcd]

        trtdos_row = set_rows[set_rows["TXPARMCD"].str.upper() == "TRTDOS"]
        if trtdos_row.empty:
            continue

        trtdos_val = str(trtdos_row["TXVAL"].iloc[0]).strip()
        if ";" not in trtdos_val:
            continue

        doses = []
        for part in trtdos_val.split(";"):
            try:
                doses.append(float(part.strip()))
            except ValueError:
                log.warning("Non-numeric dose in TRTDOS for SETCD %s: %s", setcd_str, part)
                doses.append(0.0)

        sequences[setcd_str] = doses

        # Extract dose unit
        unit_row = set_rows[set_rows["TXPARMCD"].str.upper() == "TRTDOSU"]
        if not unit_row.empty:
            dose_unit = str(unit_row["TXVAL"].iloc[0]).strip()

    if not sequences:
        return {"sequences": {}, "dose_unit": dose_unit, "unique_doses": [], "is_escalation": False}

    # Unique dose levels across all sequences
    all_doses = set()
    for seq in sequences.values():
        all_doses.update(seq)
    unique_doses = sorted(all_doses)

    # Escalation: all SETCDs share identical sequence
    seq_set = set(tuple(s) for s in sequences.values())
    is_escalation = len(seq_set) == 1

    return {
        "sequences": sequences,
        "dose_unit": dose_unit,
        "unique_doses": unique_doses,
        "is_escalation": is_escalation,
    }


def build_treatment_periods(study: StudyInfo) -> dict:
    """Build per-subject treatment period mapping from SE domain.

    Returns:
        {
            "periods": [{"period": 1, "start_day": 1, "etcd": "D_1"}, ...],
            "subject_periods": {
                subj_id: [
                    {"period": 1, "dose_value": 0, "start_day": 1, "end_day": 2, "etcd": "D_1"},
                    ...
                ], ...
            },
            "subject_period_doses": {subj_id: {period_idx: dose_value}},
        }
    """
    dose_info = parse_dose_sequences(study)
    sequences = dose_info["sequences"]

    if not sequences:
        return {"periods": [], "subject_periods": {}, "subject_period_doses": {}}

    # Read SE domain for per-subject element dates
    if "se" not in study.xpt_files:
        log.warning("No SE domain — cannot determine treatment period boundaries")
        return {"periods": [], "subject_periods": {}, "subject_period_doses": {}}

    se_df, _ = read_xpt(study.xpt_files["se"])
    se_df.columns = [c.upper() for c in se_df.columns]

    # Read DM for reference start date (RFSTDTC) and SETCD assignment
    dm_df, _ = read_xpt(study.xpt_files["dm"])
    dm_df.columns = [c.upper() for c in dm_df.columns]

    rfstdtc_map: dict[str, pd.Timestamp] = {}
    setcd_map: dict[str, str] = {}
    for _, row in dm_df.iterrows():
        subj = str(row["USUBJID"])
        rfst = str(row.get("RFSTDTC", ""))
        if rfst and rfst != "nan":
            try:
                rfstdtc_map[subj] = pd.Timestamp(rfst[:10])
            except Exception:
                pass
        if "SETCD" in dm_df.columns:
            setcd_map[subj] = str(row["SETCD"]).strip()

    # Identify treatment elements (exclude screening, acclimation, washout, rest)
    _NON_TREATMENT = {"SCREEN", "SCRN", "ACCLIM", "REST"}
    treatment_etcds: list[str] = []
    for etcd in se_df["ETCD"].unique():
        etcd_str = str(etcd).strip().upper()
        if etcd_str in _NON_TREATMENT:
            continue
        if etcd_str.startswith("WO"):
            continue
        # Check if it's a treatment element (D_*, TRT*, or contains dose info)
        element_rows = se_df[se_df["ETCD"] == etcd]
        if not element_rows.empty:
            element_name = str(element_rows["ELEMENT"].iloc[0]).lower()
            if any(kw in element_name for kw in ("mg", "vehicle", "control", "drug", "compound")):
                treatment_etcds.append(str(etcd).strip())

    if not treatment_etcds:
        log.warning("No treatment elements found in SE domain")
        return {"periods": [], "subject_periods": {}, "subject_period_doses": {}}

    # Build per-subject period data
    subject_periods: dict[str, list[dict]] = {}
    subject_period_doses: dict[str, dict[int, float]] = {}

    for subj_id in sorted(se_df["USUBJID"].unique()):
        subj_str = str(subj_id)
        setcd = setcd_map.get(subj_str, "")
        seq = sequences.get(setcd)
        if seq is None:
            log.warning("Subject %s SETCD=%s has no dose sequence", subj_str, setcd)
            continue

        rfstdtc = rfstdtc_map.get(subj_str)
        if rfstdtc is None:
            log.warning("Subject %s has no RFSTDTC", subj_str)
            continue

        # Get treatment elements for this subject in order
        subj_se = se_df[
            (se_df["USUBJID"] == subj_id) &
            (se_df["ETCD"].isin(treatment_etcds))
        ].sort_values("SESEQ")

        periods = []
        period_doses: dict[int, float] = {}

        for period_idx, (_, se_row) in enumerate(subj_se.iterrows()):
            start_dtc = str(se_row.get("SESTDTC", ""))
            end_dtc = str(se_row.get("SEENDTC", ""))

            try:
                start_ts = pd.Timestamp(start_dtc[:10])
                start_day = (start_ts - rfstdtc).days + 1
            except Exception:
                start_day = None

            try:
                end_ts = pd.Timestamp(end_dtc[:10])
                end_day = (end_ts - rfstdtc).days + 1
            except Exception:
                end_day = start_day

            dose_value = seq[period_idx] if period_idx < len(seq) else None

            periods.append({
                "period": period_idx + 1,
                "dose_value": dose_value,
                "start_day": start_day,
                "end_day": end_day,
                "etcd": str(se_row["ETCD"]).strip(),
            })
            if dose_value is not None:
                period_doses[period_idx + 1] = dose_value

        subject_periods[subj_str] = periods
        subject_period_doses[subj_str] = period_doses

    # Build canonical period list (from first subject)
    canonical_periods = []
    if subject_periods:
        first_subj = next(iter(subject_periods.values()))
        for p in first_subj:
            canonical_periods.append({
                "period": p["period"],
                "start_day": p["start_day"],
                "etcd": p["etcd"],
            })

    return {
        "periods": canonical_periods,
        "subject_periods": subject_periods,
        "subject_period_doses": subject_period_doses,
    }


def assign_day_to_period(
    study_day: int | float,
    subject_periods: list[dict],
) -> int | None:
    """Map a study day to a treatment period index (1-based).

    Each period spans from its start_day until the next period's start_day - 1.
    Days before the first period or after the last period's range return None.
    """
    if not subject_periods:
        return None

    sorted_periods = sorted(subject_periods, key=lambda p: p["start_day"] or 0)

    for i, period in enumerate(sorted_periods):
        start = period.get("start_day")
        if start is None:
            continue

        # End of this period: day before next period starts, or +7 for last period
        if i + 1 < len(sorted_periods):
            next_start = sorted_periods[i + 1].get("start_day")
            end = next_start - 1 if next_start else start + 7
        else:
            end = start + 7  # generous window for last period

        if start <= study_day <= end:
            return period["period"]

    return None


def build_day_to_dose_map(
    subject_periods: list[dict],
) -> dict[int, float]:
    """Build study_day -> dose_value mapping for a single subject.

    Maps each day in each period's range to that period's dose.
    """
    result: dict[int, float] = {}
    sorted_periods = sorted(subject_periods, key=lambda p: p["start_day"] or 0)

    for i, period in enumerate(sorted_periods):
        start = period.get("start_day")
        dose = period.get("dose_value")
        if start is None or dose is None:
            continue

        if i + 1 < len(sorted_periods):
            next_start = sorted_periods[i + 1].get("start_day")
            end = next_start - 1 if next_start else start + 7
        else:
            end = start + 7

        for day in range(start, end + 1):
            result[day] = dose

    return result
