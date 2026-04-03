"""On-demand temporal and subject-level data endpoints (spec 01).

These endpoints expose per-subject, per-timepoint data from the XPT/CSV cache
that is aggregated away during view assembly. They serve specs 02-07.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from services.study_discovery import StudyInfo
from services.xpt_processor import ensure_cached, read_xpt
from services.analysis.dose_groups import build_dose_groups
from services.analysis.phase_filter import compute_last_dosing_day
from services.analysis.override_reader import get_last_dosing_day_override
from services.analysis.incidence_recovery import compute_incidence_recovery
from generator.subject_syndromes import SEVERITY_MAP

router = APIRouter(prefix="/api", tags=["temporal"])

# Populated at startup via init_temporal()
_studies: dict[str, StudyInfo] = {}


def init_temporal(studies: dict[str, StudyInfo]):
    _studies.clear()
    _studies.update(studies)


def _get_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


def _read_domain_df(study: StudyInfo, domain: str) -> pd.DataFrame:
    """Read a domain's CSV cache, creating it if needed."""
    domain_lower = domain.lower()
    if domain_lower not in study.xpt_files:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found in study")
    csv_path = ensure_cached(study, domain_lower)
    df = pd.read_csv(csv_path, keep_default_na=False, dtype={"USUBJID": str})
    df.columns = [c.upper() for c in df.columns]
    return df


def _get_subjects_df(study: StudyInfo, *, include_recovery: bool = False) -> pd.DataFrame:
    """Get subject roster with dose info.

    Args:
        include_recovery: If True, keep recovery arm subjects and add is_recovery column.
                         If False (default), exclude recovery arms for backwards compat.
    """
    info = build_dose_groups(study)
    subjects: pd.DataFrame = info["subjects"]
    tx_map: dict = info["tx_map"]
    if not include_recovery:
        subjects = subjects[~subjects["is_recovery"]].copy()
    else:
        subjects = subjects.copy()
    # Add dose_label
    subjects["dose_label"] = subjects["ARMCD"].map(
        lambda a: tx_map.get(a, {}).get("label", f"Group {a}")
    )
    return subjects


# ---------------------------------------------------------------------------
# Endpoint 1: Per-subject time-course (continuous domains: BW, LB, OM, FW, etc.)
# ---------------------------------------------------------------------------

# Domain column mappings: domain -> (test_code_col, value_col, unit_col, day_col, name_col)
_DOMAIN_COLS = {
    "BW": ("BWTESTCD", "BWSTRESN", "BWSTRESU", "BWDY", "BWTEST"),
    "LB": ("LBTESTCD", "LBSTRESN", "LBSTRESU", "LBDY", "LBTEST"),
    "OM": ("OMTESTCD", "OMSTRESN", "OMSTRESU", "OMDY", "OMTEST"),
    "FW": ("FWTESTCD", "FWSTRESN", "FWSTRESU", "FWDY", "FWTEST"),
    "BG": ("BGTESTCD", "BGSTRESN", "BGSTRESU", "BGDY", "BGTEST"),
    "EG": ("EGTESTCD", "EGSTRESN", "EGSTRESU", "EGDY", "EGTEST"),
    "VS": ("VSTESTCD", "VSSTRESN", "VSSTRESU", "VSDY", "VSTEST"),
}

# BW has no BWTESTCD — the whole domain is body weight
_BW_DEFAULT_TESTCD = "BW"


@router.get("/studies/{study_id}/timecourse/{domain}/{test_code}")
async def get_timecourse(
    study_id: str,
    domain: str,
    test_code: str,
    sex: str | None = Query(None, description="Filter by sex: M or F"),
    mode: str = Query("group", description="group or subject"),
    include_recovery: bool = Query(False, description="Include recovery-arm subjects and recovery-period data"),
):
    """Per-subject or group-level time-course for a continuous endpoint."""
    study = _get_study(study_id)
    domain_upper = domain.upper()

    if domain_upper not in _DOMAIN_COLS:
        raise HTTPException(
            status_code=400,
            detail=f"Domain '{domain}' does not support time-course. Supported: {sorted(_DOMAIN_COLS.keys())}",
        )

    testcd_col, value_col, unit_col, day_col, name_col = _DOMAIN_COLS[domain_upper]

    # Read domain data
    df = _read_domain_df(study, domain_upper)

    # BW domain: ensure BWTESTCD exists and unify TERMBW (terminal
    # sacrifice weight) into the main BW series for a complete trajectory.
    if domain_upper == "BW":
        if "BWTESTCD" not in df.columns:
            df["BWTESTCD"] = _BW_DEFAULT_TESTCD
        else:
            df.loc[df["BWTESTCD"].str.upper() == "TERMBW", "BWTESTCD"] = _BW_DEFAULT_TESTCD
        if "BWTEST" not in df.columns:
            df["BWTEST"] = "Body Weight"

    # OM domain: OMTESTCD is always "WEIGHT" — differentiate by specimen.
    # Accept both "WEIGHT" (returns all organs) and specimen names like "TESTIS"
    # (returns just that organ).  The recovery-comparison endpoint and unified
    # findings use specimen as the test_code, so we match on OMSPEC first.
    om_handled = False
    if domain_upper == "OM" and "OMSPEC" in df.columns:
        # If the request is for a specific specimen (not "WEIGHT"), filter by it
        if test_code.upper() != "WEIGHT":
            df = df[df["OMSPEC"].str.upper() == test_code.upper()]
            if df.empty:
                raise HTTPException(status_code=404, detail=f"Specimen '{test_code}' not found in OM")
        # Remap OMTESTCD to specimen for per-organ grouping
        df[testcd_col] = df["OMSPEC"]
        if name_col in df.columns:
            df[name_col] = df["OMSPEC"].apply(
                lambda s: s.replace("GLAND, ", "").title() + " Weight"
            )
        om_handled = True

    # Filter to requested test code (skipped for OM — handled above)
    if not om_handled:
        if testcd_col not in df.columns:
            raise HTTPException(status_code=404, detail=f"Column '{testcd_col}' not found in {domain_upper}")
        df = df[df[testcd_col].str.upper() == test_code.upper()]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"Test code '{test_code}' not found in {domain_upper}")

    # Get test name and unit from first row
    test_name = str(df[name_col].iloc[0]) if name_col in df.columns else test_code
    unit = str(df[unit_col].iloc[0]) if unit_col in df.columns and df[unit_col].iloc[0] != "" else ""

    # Parse numeric columns
    df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
    df[day_col] = pd.to_numeric(df[day_col], errors="coerce")
    df = df.dropna(subset=[value_col, day_col])

    # Join with subject roster (include recovery subjects if requested)
    subjects_df = _get_subjects_df(study, include_recovery=include_recovery)
    merge_cols = ["USUBJID", "SEX", "ARMCD", "dose_level", "dose_label"]
    if include_recovery and "is_recovery" in subjects_df.columns:
        merge_cols.append("is_recovery")
    df = df.merge(subjects_df[merge_cols], on="USUBJID", how="inner")

    # Filter by sex if requested
    if sex:
        df = df[df["SEX"] == sex.upper()]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data for sex='{sex}'")

    # Compute last dosing day for recovery boundary marker
    if include_recovery:
        override = get_last_dosing_day_override(study_id)
        last_dosing_day = compute_last_dosing_day(study, override=override)
    else:
        last_dosing_day = None

    # Derive terminal sacrifice day: closest actual data day at or after last_dosing_day
    terminal_sacrifice_day = None
    if last_dosing_day is not None:
        actual_days = sorted(df[day_col].dropna().unique())
        candidates = [d for d in actual_days if d >= last_dosing_day]
        terminal_sacrifice_day = int(candidates[0]) if candidates else (int(actual_days[-1]) if actual_days else None)

    # OM domain: attach terminal body weight per subject for bivariate scatter
    terminal_bw_map: dict[str, float] | None = None
    terminal_bw_unit: str | None = None
    if domain_upper == "OM" and mode == "subject":
        terminal_bw_map = {}  # always present for OM; subjects not found get null
    if domain_upper == "OM" and mode == "subject" and "bw" in study.xpt_files:
        bw_df = _read_domain_df(study, "BW")
        bw_val_col = (
            "BWSTRESN" if "BWSTRESN" in bw_df.columns
            else "BWORRES" if "BWORRES" in bw_df.columns
            else None
        )
        if bw_val_col and "BWDY" in bw_df.columns:
            bw_df[bw_val_col] = pd.to_numeric(bw_df[bw_val_col], errors="coerce")
            bw_df["BWDY"] = pd.to_numeric(bw_df["BWDY"], errors="coerce")
            bw_df = bw_df.dropna(subset=[bw_val_col, "BWDY"])
            terminal = bw_df.sort_values("BWDY").groupby("USUBJID").last()
            terminal_bw_map = terminal[bw_val_col].to_dict()
            # BW unit: uniform within a study, take first non-empty value
            bw_unit_col = "BWSTRESU" if "BWSTRESU" in bw_df.columns else None
            if bw_unit_col:
                bw_units = bw_df[bw_unit_col].dropna().unique()
                terminal_bw_unit = str(bw_units[0]) if len(bw_units) > 0 else "g"
            else:
                terminal_bw_unit = "g"

    if mode == "subject":
        return _build_subject_response(
            df, test_code, test_name, domain_upper, unit, value_col, day_col,
            include_recovery=include_recovery, last_dosing_day=last_dosing_day,
            terminal_sacrifice_day=terminal_sacrifice_day,
            terminal_bw_map=terminal_bw_map,
            terminal_bw_unit=terminal_bw_unit if terminal_bw_map is not None else None,
        )
    else:
        return _build_group_response(
            df, test_code, test_name, domain_upper, unit, value_col, day_col,
            last_dosing_day=last_dosing_day,
            terminal_sacrifice_day=terminal_sacrifice_day,
        )


def _build_group_response(
    df: pd.DataFrame, test_code: str, test_name: str, domain: str, unit: str,
    value_col: str, day_col: str, *, last_dosing_day: int | None = None,
    terminal_sacrifice_day: int | None = None,
) -> dict:
    """Build group-level (mean ± SD) time-course response."""
    timepoints = []
    for day, day_df in sorted(df.groupby(day_col)):
        groups = []
        for (dose_level, dose_label, sex_val), grp in day_df.groupby(["dose_level", "dose_label", "SEX"]):
            values = grp[value_col].dropna().tolist()
            groups.append({
                "dose_level": int(dose_level),
                "dose_label": dose_label,
                "sex": sex_val,
                "n": len(values),
                "mean": round(float(np.mean(values)), 4) if values else None,
                "sd": round(float(np.std(values, ddof=1)), 4) if len(values) > 1 else 0.0,
                "values": [round(v, 4) for v in values],
            })
        timepoints.append({"day": int(day), "groups": groups})

    result: dict = {
        "test_code": test_code.upper(),
        "test_name": test_name,
        "domain": domain,
        "unit": unit,
        "timepoints": timepoints,
    }
    if last_dosing_day is not None:
        result["last_dosing_day"] = last_dosing_day
    if terminal_sacrifice_day is not None:
        result["terminal_sacrifice_day"] = terminal_sacrifice_day
    return result


def _build_subject_response(
    df: pd.DataFrame, test_code: str, test_name: str, domain: str, unit: str,
    value_col: str, day_col: str, *, include_recovery: bool = False,
    last_dosing_day: int | None = None,
    terminal_sacrifice_day: int | None = None,
    terminal_bw_map: dict[str, float] | None = None,
    terminal_bw_unit: str | None = None,
) -> dict:
    """Build subject-level time-course response."""
    subjects = []
    for usubjid, subj_df in df.groupby("USUBJID"):
        row0 = subj_df.iloc[0]
        values = [
            {"day": int(r[day_col]), "value": round(float(r[value_col]), 4)}
            for _, r in subj_df.sort_values(day_col).iterrows()
            if pd.notna(r[value_col])
        ]
        entry: dict = {
            "usubjid": usubjid,
            "sex": row0["SEX"],
            "dose_level": int(row0["dose_level"]),
            "dose_label": row0["dose_label"],
            "arm_code": row0["ARMCD"],
            "values": values,
        }
        if include_recovery and "is_recovery" in row0.index:
            entry["is_recovery"] = bool(row0["is_recovery"])
        if terminal_bw_map is not None:
            bw = terminal_bw_map.get(usubjid)
            entry["terminal_bw"] = round(float(bw), 4) if bw is not None and pd.notna(bw) else None
        subjects.append(entry)

    result: dict = {
        "test_code": test_code.upper(),
        "test_name": test_name,
        "domain": domain,
        "unit": unit,
        "subjects": subjects,
    }
    if last_dosing_day is not None:
        result["last_dosing_day"] = last_dosing_day
    if terminal_sacrifice_day is not None:
        result["terminal_sacrifice_day"] = terminal_sacrifice_day
    if terminal_bw_unit is not None:
        result["terminal_bw_unit"] = terminal_bw_unit
    return result


# ---------------------------------------------------------------------------
# Endpoint 2: Clinical observations timecourse
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/timecourse/cl")
async def get_cl_timecourse(
    study_id: str,
    finding: str | None = Query(None, description="Filter to specific finding (CLSTRESC)"),
    category: str | None = Query(None, description="Filter by CLCAT"),
):
    """Clinical observation counts per day/dose/sex."""
    study = _get_study(study_id)

    if "cl" not in study.xpt_files:
        raise HTTPException(status_code=404, detail="CL domain not found in study")

    df = _read_domain_df(study, "CL")
    subjects_df = _get_subjects_df(study)

    # Identify columns
    finding_col = "CLSTRESC" if "CLSTRESC" in df.columns else "CLRESULT"
    day_col = "CLDY" if "CLDY" in df.columns else "VISITDY"
    cat_col = "CLCAT" if "CLCAT" in df.columns else None

    if finding_col not in df.columns:
        raise HTTPException(status_code=404, detail="Finding column not found in CL domain")

    # Parse day
    if day_col in df.columns:
        df[day_col] = pd.to_numeric(df[day_col], errors="coerce")
        df = df.dropna(subset=[day_col])

    # Get all findings and categories before filtering
    all_findings = sorted(df[finding_col].dropna().unique().tolist())
    all_categories = sorted(df[cat_col].dropna().unique().tolist()) if cat_col and cat_col in df.columns else []

    # Apply filters
    if finding:
        df = df[df[finding_col].str.upper() == finding.upper()]
    if category and cat_col and cat_col in df.columns:
        df = df[df[cat_col].str.upper() == category.upper()]

    # Join with subject roster
    df = df.merge(subjects_df[["USUBJID", "SEX", "ARMCD", "dose_level", "dose_label"]],
                  on="USUBJID", how="inner")

    # Build timecourse: for each day, count subjects with each finding per dose/sex
    timecourse = []
    for day, day_df in sorted(df.groupby(day_col)):
        counts = []
        for (dose_level, dose_label, sex_val), grp in day_df.groupby(["dose_level", "dose_label", "SEX"]):
            # Count subjects in this group at this day
            total_subjects = int(subjects_df[
                (subjects_df["dose_level"] == dose_level) & (subjects_df["SEX"] == sex_val)
            ].shape[0])

            # Count findings and collect subject IDs per finding
            finding_counts = {}
            finding_subjects = {}
            for f_val, f_grp in grp.groupby(finding_col):
                f_key = str(f_val)
                ids = f_grp["USUBJID"].unique().tolist()
                finding_counts[f_key] = len(ids)
                finding_subjects[f_key] = ids

            counts.append({
                "dose_level": int(dose_level),
                "dose_label": dose_label,
                "sex": sex_val,
                "total_subjects": total_subjects,
                "findings": finding_counts,
                "subjects": finding_subjects,
            })
        timecourse.append({"day": int(day), "counts": counts})

    return {
        "findings": all_findings,
        "categories": all_categories,
        "timecourse": timecourse,
    }


# ---------------------------------------------------------------------------
# Endpoint 3: Subject profile (cross-domain summary for one subject)
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/subjects/{usubjid}/profile")
async def get_subject_profile(study_id: str, usubjid: str):
    """Cross-domain summary for a single subject."""
    study = _get_study(study_id)

    # Get subject metadata from DM
    subjects_df = _get_subjects_df(study, include_recovery=True)
    subj_row = subjects_df[subjects_df["USUBJID"] == usubjid]
    if subj_row.empty:
        raise HTTPException(status_code=404, detail=f"Subject '{usubjid}' not found")

    subj = subj_row.iloc[0]

    # Get disposition from DS domain
    disposition = None
    disposition_day = None
    if "ds" in study.xpt_files:
        try:
            ds_df = _read_domain_df(study, "DS")
            ds_subj = ds_df[ds_df["USUBJID"] == usubjid]
            if not ds_subj.empty:
                # Find disposition record (DSDECOD is the standard field)
                if "DSDECOD" in ds_subj.columns:
                    disposition = str(ds_subj["DSDECOD"].iloc[0])
                elif "DSTERM" in ds_subj.columns:
                    disposition = str(ds_subj["DSTERM"].iloc[0])
                # DSSTDY is the standard SEND variable; DSDY is a fallback
                day_col = "DSSTDY" if "DSSTDY" in ds_subj.columns else "DSDY" if "DSDY" in ds_subj.columns else None
                if day_col:
                    day_val = pd.to_numeric(ds_subj[day_col].iloc[0], errors="coerce")
                    if pd.notna(day_val):
                        disposition_day = int(day_val)
        except Exception:
            pass

    # Collect domain data
    domains: dict = {}

    def _subject_domain(domain: str) -> pd.DataFrame | None:
        """Read a domain and filter to this subject. Returns None if unavailable or empty."""
        if domain.lower() not in study.xpt_files:
            return None
        try:
            df = _read_domain_df(study, domain)
            subj = df[df["USUBJID"] == usubjid]
            return subj if not subj.empty else None
        except Exception:
            return None

    # BW
    bw_subj = _subject_domain("BW")
    if bw_subj is not None:
        val_col = "BWSTRESN"
        day_col = "BWDY"
        unit_col = "BWSTRESU"
        bw_subj[val_col] = pd.to_numeric(bw_subj[val_col], errors="coerce")
        bw_subj[day_col] = pd.to_numeric(bw_subj[day_col], errors="coerce")
        bw_subj = bw_subj.dropna(subset=[val_col, day_col])
        measurements = [
            {
                "day": int(r[day_col]),
                "test_code": "BW",
                "value": round(float(r[val_col]), 2),
                "unit": str(r[unit_col]) if unit_col in bw_subj.columns and r[unit_col] != "" else "g",
            }
            for _, r in bw_subj.sort_values(day_col).iterrows()
        ]
        if measurements:
            domains["BW"] = {"measurements": measurements}

    # LB
    lb_subj = _subject_domain("LB")
    if lb_subj is not None:
        val_col = "LBSTRESN"
        day_col = "LBDY"
        unit_col = "LBSTRESU"
        testcd_col = "LBTESTCD"
        lb_subj[val_col] = pd.to_numeric(lb_subj[val_col], errors="coerce")
        lb_subj[day_col] = pd.to_numeric(lb_subj[day_col], errors="coerce")
        lb_subj = lb_subj.dropna(subset=[val_col, day_col])
        measurements = [
            {
                "day": int(r[day_col]),
                "test_code": str(r[testcd_col]) if testcd_col in lb_subj.columns else "",
                "value": round(float(r[val_col]), 4),
                "unit": str(r[unit_col]) if unit_col in lb_subj.columns and r[unit_col] != "" else "",
            }
            for _, r in lb_subj.sort_values([testcd_col, day_col]).iterrows()
        ]
        if measurements:
            domains["LB"] = {"measurements": measurements}

    # OM (Organ Measurements) — use OMSPEC as test_code (OMTESTCD is always "WEIGHT")
    om_subj = _subject_domain("OM")
    if om_subj is not None:
        val_col = "OMSTRESN"
        day_col = "OMDY"
        unit_col = "OMSTRESU"
        spec_col = "OMSPEC" if "OMSPEC" in om_subj.columns else "OMTESTCD"
        om_subj[val_col] = pd.to_numeric(om_subj[val_col], errors="coerce")
        om_subj[day_col] = pd.to_numeric(om_subj[day_col], errors="coerce")
        om_subj = om_subj.dropna(subset=[val_col])
        measurements = [
            {
                "day": int(r[day_col]) if pd.notna(r.get(day_col)) else 0,
                "test_code": str(r[spec_col]).strip() if spec_col in om_subj.columns else "",
                "value": round(float(r[val_col]), 4),
                "unit": str(r[unit_col]) if unit_col in om_subj.columns and r[unit_col] != "" else "",
            }
            for _, r in om_subj.sort_values(spec_col).iterrows()
        ]
        if measurements:
            domains["OM"] = {"measurements": measurements}

    # CL (Clinical Observations)
    cl_subj = _subject_domain("CL")
    if cl_subj is not None:
        finding_col = "CLSTRESC" if "CLSTRESC" in cl_subj.columns else "CLRESULT"
        day_col = "CLDY" if "CLDY" in cl_subj.columns else "VISITDY"
        cat_col = "CLCAT" if "CLCAT" in cl_subj.columns else None

        if day_col in cl_subj.columns:
            cl_subj[day_col] = pd.to_numeric(cl_subj[day_col], errors="coerce")

        observations = [
            {
                "day": int(r[day_col]) if day_col in cl_subj.columns and pd.notna(r.get(day_col)) else 0,
                "finding": str(r[finding_col]) if finding_col in cl_subj.columns else "",
                "category": str(r[cat_col]) if cat_col and cat_col in cl_subj.columns and r.get(cat_col, "") != "" else "",
            }
            for _, r in cl_subj.sort_values(day_col if day_col in cl_subj.columns else "USUBJID").iterrows()
        ]
        if observations:
            domains["CL"] = {"observations": observations}

    # MI (Microscopic Findings)
    mi_subj = _subject_domain("MI")
    if mi_subj is not None:
        spec_col = "MISPEC" if "MISPEC" in mi_subj.columns else "MIORRES"
        finding_col = "MISTRESC" if "MISTRESC" in mi_subj.columns else "MIORRES"
        sev_col = "MISEV" if "MISEV" in mi_subj.columns else None
        rescat_col = "MIRESCAT" if "MIRESCAT" in mi_subj.columns else None

        def _safe_str(val):
            """Return None for NaN/empty, stripped string otherwise."""
            if pd.isna(val):
                return None
            s = str(val).strip()
            return s if s else None

        findings = [
            {
                "specimen": str(r.get(spec_col, "")).strip() if spec_col in mi_subj.columns else "",
                "finding": str(r.get(finding_col, "")).strip() if finding_col in mi_subj.columns else "",
                "severity": _safe_str(r[sev_col]) if sev_col and sev_col in mi_subj.columns else None,
                "result_category": _safe_str(r[rescat_col]) if rescat_col and rescat_col in mi_subj.columns else None,
            }
            for _, r in mi_subj.iterrows()
        ]
        if findings:
            domains["MI"] = {"findings": findings}

    # MA (Macroscopic Findings)
    ma_subj = _subject_domain("MA")
    if ma_subj is not None:
        spec_col = "MASPEC" if "MASPEC" in ma_subj.columns else "MAORRES"
        finding_col = "MASTRESC" if "MASTRESC" in ma_subj.columns else "MAORRES"

        findings = [
            {
                "specimen": str(r[spec_col]) if spec_col in ma_subj.columns else "",
                "finding": str(r[finding_col]) if finding_col in ma_subj.columns else "",
            }
            for _, r in ma_subj.iterrows()
        ]
        if findings:
            domains["MA"] = {"findings": findings}

    # Control group lab stats (terminal timepoint, same sex as subject)
    control_stats: dict = {}
    subject_sex = str(subj["SEX"])
    if "lb" in study.xpt_files:
        try:
            all_control = subjects_df[subjects_df["dose_level"] == 0]
            sex_control = all_control[all_control["SEX"] == subject_sex]
            ctrl_ids = sex_control["USUBJID"].tolist()
            if ctrl_ids:
                lb_all = _read_domain_df(study, "LB")
                lb_ctrl = lb_all[lb_all["USUBJID"].isin(ctrl_ids)]
                val_col, day_col = "LBSTRESN", "LBDY"
                unit_col, testcd_col = "LBSTRESU", "LBTESTCD"
                lb_ctrl[val_col] = pd.to_numeric(lb_ctrl[val_col], errors="coerce")
                lb_ctrl[day_col] = pd.to_numeric(lb_ctrl[day_col], errors="coerce")
                lb_ctrl = lb_ctrl.dropna(subset=[val_col, day_col])
                lab_stats: dict = {}
                for test, tgrp in lb_ctrl.groupby(testcd_col):
                    max_day = tgrp[day_col].max()
                    terminal = tgrp[tgrp[day_col] == max_day]
                    vals = terminal[val_col].dropna()
                    if len(vals) >= 1:
                        unit = str(terminal[unit_col].iloc[0]) if unit_col in terminal.columns and terminal[unit_col].iloc[0] != "" else ""
                        lab_stats[str(test)] = {
                            "mean": round(float(vals.mean()), 4),
                            "sd": round(float(vals.std(ddof=1)), 4) if len(vals) > 1 else 0.0,
                            "unit": unit,
                            "n": int(len(vals)),
                        }
                if lab_stats:
                    control_stats["lab"] = lab_stats
        except Exception:
            pass

    # Control group organ weight stats (same sex, terminal sacrifice only)
    if "om" in study.xpt_files:
        try:
            all_control = subjects_df[subjects_df["dose_level"] == 0]
            sex_control = all_control[all_control["SEX"] == subject_sex]
            ctrl_ids = sex_control["USUBJID"].tolist()
            if ctrl_ids:
                om_all = _read_domain_df(study, "OM")
                om_ctrl = om_all[om_all["USUBJID"].isin(ctrl_ids)]
                om_val_col = "OMSTRESN"
                om_day_col = "OMDY"
                om_unit_col = "OMSTRESU"
                om_spec_col = "OMSPEC" if "OMSPEC" in om_ctrl.columns else "OMTESTCD"
                om_ctrl[om_val_col] = pd.to_numeric(om_ctrl[om_val_col], errors="coerce")
                om_ctrl = om_ctrl.dropna(subset=[om_val_col])
                # Filter to terminal: per-organ max day (matches LB per-test pattern)
                if om_day_col in om_ctrl.columns:
                    om_ctrl[om_day_col] = pd.to_numeric(om_ctrl[om_day_col], errors="coerce")
                om_stats: dict = {}
                for organ, ogrp in om_ctrl.groupby(om_spec_col):
                    # Take latest measurement day for this organ (handles interim vs terminal)
                    if om_day_col in ogrp.columns:
                        organ_max_day = ogrp[om_day_col].max()
                        if pd.notna(organ_max_day):
                            ogrp = ogrp[ogrp[om_day_col] == organ_max_day]
                    vals = ogrp[om_val_col].dropna()
                    if len(vals) >= 1:
                        unit = str(ogrp[om_unit_col].iloc[0]) if om_unit_col in ogrp.columns and ogrp[om_unit_col].iloc[0] != "" else ""
                        om_stats[str(organ).strip()] = {
                            "mean": round(float(vals.mean()), 4),
                            "sd": round(float(vals.std(ddof=1)), 4) if len(vals) > 1 else 0.0,
                            "unit": unit,
                            "n": int(len(vals)),
                        }
                if om_stats:
                    control_stats["om"] = om_stats
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("OM control stats failed for %s: %s", study_id, e)

    # Death cause and relatedness from pre-generated mortality data
    death_cause: str | None = None
    death_relatedness: str | None = None
    try:
        mort_path = Path(__file__).parent.parent / "generated" / study_id / "study_mortality.json"
        if mort_path.exists():
            mort = json.loads(mort_path.read_text())
            for rec in mort.get("deaths", []) + mort.get("accidentals", []):
                if rec.get("USUBJID") == usubjid:
                    death_cause = rec.get("cause")
                    death_relatedness = rec.get("relatedness")
                    break
    except Exception:
        pass

    return {
        "usubjid": usubjid,
        "sex": str(subj["SEX"]),
        "dose_level": int(subj["dose_level"]),
        "dose_label": str(subj["dose_label"]),
        "arm_code": str(subj["ARMCD"]),
        "disposition": disposition,
        "disposition_day": disposition_day,
        "death_cause": death_cause,
        "death_relatedness": death_relatedness,
        "domains": domains,
        "control_stats": control_stats if control_stats else None,
    }


# ---------------------------------------------------------------------------
# Endpoint 4: Subject-level microscopic findings matrix
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/histopath/subjects")
async def get_histopath_subjects(
    study_id: str,
    specimen: str = Query(..., description="Specimen name to filter by"),
):
    """Per-subject histopath findings for a specimen (severity matrix).

    Reads both MI (microscopic) and MA (macroscopic) domains so the matrix
    includes non-graded findings like ENLARGED, MASS, DISCOLORATION.
    """
    study = _get_study(study_id)

    if "mi" not in study.xpt_files:
        raise HTTPException(status_code=404, detail="MI domain not found in study")

    mi_df = _read_domain_df(study, "MI")
    subjects_df = _get_subjects_df(study, include_recovery=True)

    spec_col = "MISPEC" if "MISPEC" in mi_df.columns else None
    finding_col = "MISTRESC" if "MISTRESC" in mi_df.columns else "MIORRES"
    sev_col = "MISEV" if "MISEV" in mi_df.columns else None

    if spec_col is None:
        raise HTTPException(status_code=404, detail="MISPEC column not found in MI domain")

    # Filter MI to specimen
    specimen_df = mi_df[mi_df[spec_col].str.upper() == specimen.upper()]

    # Also read MA domain if available
    ma_specimen_df = None
    ma_finding_col = None
    ma_sev_col = None
    ma_lat_col = None
    ma_examined_subjects: set[str] = set()  # subjects with MA records for this specimen
    if "ma" in study.xpt_files:
        ma_df = _read_domain_df(study, "MA")
        ma_spec_col = "MASPEC" if "MASPEC" in ma_df.columns else None
        if ma_spec_col:
            ma_lat_col = "MALAT" if "MALAT" in ma_df.columns else None
            ma_finding_col = "MASTRESC" if "MASTRESC" in ma_df.columns else "MAORRES"
            ma_sev_col = "MASEV" if "MASEV" in ma_df.columns else None
            ma_specimen_df = ma_df[ma_df[ma_spec_col].str.upper() == specimen.upper()]
            if ma_specimen_df.empty:
                ma_specimen_df = None
            else:
                # Track all subjects who had this specimen collected (MA record exists)
                ma_examined_subjects = set(ma_specimen_df["USUBJID"].dropna().astype(str).unique())

    if specimen_df.empty and ma_specimen_df is None:
        raise HTTPException(status_code=404, detail=f"No findings for specimen '{specimen}'")

    # Get unique findings from both domains
    mi_findings = set(specimen_df[finding_col].dropna().unique().tolist()) if not specimen_df.empty else set()
    ma_findings = set(ma_specimen_df[ma_finding_col].dropna().unique().tolist()) if ma_specimen_df is not None else set()
    all_findings = sorted(mi_findings | ma_findings)

    # Severity mapping (shared from subject_syndromes)
    SEV_MAP = SEVERITY_MAP

    # Detect laterality columns
    mi_lat_col = "MILAT" if "MILAT" in mi_df.columns else None

    # Join MI specimen findings with subject metadata
    findings_by_subj: dict[str, dict] = {}
    if not specimen_df.empty:
        specimen_df = specimen_df.merge(
            subjects_df[["USUBJID", "SEX", "dose_level", "dose_label", "is_recovery"]],
            on="USUBJID", how="inner",
        )

        for usubjid, subj_grp in specimen_df.groupby("USUBJID"):
            findings_map = {}
            for _, r in subj_grp.iterrows():
                f = str(r[finding_col])
                sev_str = str(r[sev_col]).strip().upper() if sev_col and sev_col in subj_grp.columns and r.get(sev_col, "") != "" else None
                sev_num = SEV_MAP.get(sev_str, 0) if sev_str else 0
                lat = str(r[mi_lat_col]).strip().upper() if mi_lat_col and mi_lat_col in subj_grp.columns and pd.notna(r.get(mi_lat_col)) and str(r.get(mi_lat_col, "")).strip() else None
                findings_map[f] = {
                    "severity": sev_str,
                    "severity_num": sev_num,
                    "laterality": lat,
                }
            findings_by_subj[str(usubjid)] = findings_map

    # Merge MA findings into findings_by_subj
    if ma_specimen_df is not None:
        ma_merged = ma_specimen_df.merge(
            subjects_df[["USUBJID", "SEX", "dose_level", "dose_label", "is_recovery"]],
            on="USUBJID", how="inner",
        )
        for usubjid, subj_grp in ma_merged.groupby("USUBJID"):
            subj_key = str(usubjid)
            if subj_key not in findings_by_subj:
                findings_by_subj[subj_key] = {}
            for _, r in subj_grp.iterrows():
                f = str(r[ma_finding_col])
                if f in findings_by_subj[subj_key]:
                    continue  # MI finding takes precedence
                sev_str = str(r[ma_sev_col]).strip().upper() if ma_sev_col and ma_sev_col in subj_grp.columns and r.get(ma_sev_col, "") not in ("", "nan") else None
                sev_num = SEV_MAP.get(sev_str, 0) if sev_str else 0
                lat = str(r[ma_lat_col]).strip().upper() if ma_lat_col and ma_lat_col in subj_grp.columns and pd.notna(r.get(ma_lat_col)) and str(r.get(ma_lat_col, "")).strip() else None
                findings_by_subj[subj_key][f] = {
                    "severity": sev_str,
                    "severity_num": sev_num,
                    "laterality": lat,
                }

    # Read DS domain once for disposition + recovery_days
    disposition_map: dict[str, tuple[str | None, int | None]] = {}  # usubjid → (disposition, disposition_day)
    ds_df_loaded = None
    if "ds" in study.xpt_files:
        try:
            ds_df_loaded = _read_domain_df(study, "DS")
            # Per-subject disposition
            decod_col = "DSDECOD" if "DSDECOD" in ds_df_loaded.columns else "DSTERM" if "DSTERM" in ds_df_loaded.columns else None
            day_col_ds = "DSDY" if "DSDY" in ds_df_loaded.columns else None
            if decod_col:
                for _, ds_row in ds_df_loaded.iterrows():
                    uid = str(ds_row["USUBJID"])
                    disp = str(ds_row[decod_col]) if pd.notna(ds_row.get(decod_col)) else None
                    disp_day = None
                    if day_col_ds and pd.notna(ds_row.get(day_col_ds)):
                        disp_day_val = pd.to_numeric(ds_row[day_col_ds], errors="coerce")
                        if pd.notna(disp_day_val):
                            disp_day = int(disp_day_val)
                    if uid not in disposition_map or disp is not None:
                        disposition_map[uid] = (disp, disp_day)
        except Exception:
            pass

    # Build per-subject entries from ALL subjects (not just those with findings)
    subject_list = []
    for _, row in subjects_df.iterrows():
        usubjid = str(row["USUBJID"])
        disp_info = disposition_map.get(usubjid, (None, None))
        entry: dict = {
            "usubjid": usubjid,
            "sex": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "dose_label": str(row["dose_label"]),
            "is_recovery": bool(row.get("is_recovery", False)),
            "is_satellite": bool(row.get("is_satellite", False)),
            "findings": findings_by_subj.get(usubjid, {}),
            "disposition": disp_info[0],
            "disposition_day": disp_info[1],
        }
        if ma_examined_subjects:
            entry["ma_examined"] = usubjid in ma_examined_subjects
        subject_list.append(entry)

    # Sort by dose_level then sex then USUBJID
    subject_list.sort(key=lambda s: (s["dose_level"], s["sex"], s["usubjid"]))

    # Compute recovery period (days) from DS domain sacrifice days
    recovery_days = None
    has_recovery = any(s["is_recovery"] for s in subject_list)
    if has_recovery and ds_df_loaded is not None:
        try:
            # SEND uses DSSTDY (disposition study day); fall back to DSDY
            day_col = "DSSTDY" if "DSSTDY" in ds_df_loaded.columns else "DSDY" if "DSDY" in ds_df_loaded.columns else None
            if day_col:
                recovery_ids = {s["usubjid"] for s in subject_list if s["is_recovery"]}
                main_ids = {s["usubjid"] for s in subject_list if not s["is_recovery"]}
                ds_df_loaded[day_col] = pd.to_numeric(ds_df_loaded[day_col], errors="coerce")
                rec_days = ds_df_loaded[ds_df_loaded["USUBJID"].isin(recovery_ids)][day_col].dropna()
                main_days = ds_df_loaded[ds_df_loaded["USUBJID"].isin(main_ids)][day_col].dropna()
                if not rec_days.empty and not main_days.empty:
                    recovery_days = int(rec_days.max() - main_days.max())
        except Exception:
            pass

    return {
        "specimen": specimen,
        "findings": all_findings,
        "subjects": subject_list,
        "recovery_days": recovery_days,
    }


# ---------------------------------------------------------------------------
# Endpoint 5: Multi-subject comparison (cross-domain)
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/subjects/compare")
async def compare_subjects(
    study_id: str,
    ids: str = Query(..., description="Comma-separated subject IDs (short or full)"),
):
    """Cross-domain comparison data for multiple subjects.

    Returns lab values, body weights, clinical observations, and control
    group statistics for the requested subjects. Used by the Compare tab.
    """
    study = _get_study(study_id)
    raw_ids = [s.strip() for s in ids.split(",") if s.strip()]
    if len(raw_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 subject IDs required")

    subjects_df = _get_subjects_df(study, include_recovery=True)

    # Resolve short IDs (e.g., "2104") to full USUBJIDs (e.g., "PC201708-2104")
    full_ids: list[str] = []
    for rid in raw_ids:
        if rid in subjects_df["USUBJID"].values:
            full_ids.append(rid)
        else:
            # Try suffix match
            matches = subjects_df[subjects_df["USUBJID"].str.endswith(f"-{rid}")]["USUBJID"].tolist()
            if matches:
                full_ids.append(matches[0])
            else:
                raise HTTPException(status_code=404, detail=f"Subject '{rid}' not found")

    # --- Subject profiles ---
    profiles = []
    for fid in full_ids:
        row = subjects_df[subjects_df["USUBJID"] == fid].iloc[0]
        short_id = fid.split("-")[-1] if "-" in fid else fid[-4:]

        # Disposition from DS
        disposition = None
        disposition_day = None
        if "ds" in study.xpt_files:
            try:
                ds_df = _read_domain_df(study, "DS")
                ds_subj = ds_df[ds_df["USUBJID"] == fid]
                if not ds_subj.empty:
                    if "DSDECOD" in ds_subj.columns:
                        disposition = str(ds_subj["DSDECOD"].iloc[0])
                    elif "DSTERM" in ds_subj.columns:
                        disposition = str(ds_subj["DSTERM"].iloc[0])
                    if "DSDY" in ds_subj.columns:
                        day_val = pd.to_numeric(ds_subj["DSDY"].iloc[0], errors="coerce")
                        if pd.notna(day_val):
                            disposition_day = int(day_val)
            except Exception:
                pass

        profiles.append({
            "usubjid": fid,
            "short_id": short_id,
            "sex": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "dose_label": str(row["dose_label"]),
            "disposition": disposition,
            "disposition_day": disposition_day,
        })

    # --- Body weights ---
    body_weights: list[dict] = []
    if "bw" in study.xpt_files:
        try:
            bw_df = _read_domain_df(study, "BW")
            bw_df = bw_df[bw_df["USUBJID"].isin(full_ids)]
            val_col, day_col, unit_col = "BWSTRESN", "BWDY", "BWSTRESU"
            bw_df[val_col] = pd.to_numeric(bw_df[val_col], errors="coerce")
            bw_df[day_col] = pd.to_numeric(bw_df[day_col], errors="coerce")
            bw_df = bw_df.dropna(subset=[val_col, day_col])
            for _, r in bw_df.iterrows():
                body_weights.append({
                    "usubjid": str(r["USUBJID"]),
                    "day": int(r[day_col]),
                    "weight": round(float(r[val_col]), 2),
                })
        except Exception:
            pass

    # --- Lab values ---
    lab_values: list[dict] = []
    available_timepoints: list[int] = []
    if "lb" in study.xpt_files:
        try:
            lb_df = _read_domain_df(study, "LB")
            lb_df = lb_df[lb_df["USUBJID"].isin(full_ids)]
            val_col, day_col, unit_col, testcd_col = "LBSTRESN", "LBDY", "LBSTRESU", "LBTESTCD"
            lb_df[val_col] = pd.to_numeric(lb_df[val_col], errors="coerce")
            lb_df[day_col] = pd.to_numeric(lb_df[day_col], errors="coerce")
            lb_df = lb_df.dropna(subset=[val_col, day_col])
            available_timepoints = sorted(lb_df[day_col].dropna().unique().astype(int).tolist())
            for _, r in lb_df.iterrows():
                lab_values.append({
                    "usubjid": str(r["USUBJID"]),
                    "test": str(r[testcd_col]) if testcd_col in lb_df.columns else "",
                    "unit": str(r[unit_col]) if unit_col in lb_df.columns and r[unit_col] != "" else "",
                    "day": int(r[day_col]),
                    "value": round(float(r[val_col]), 4),
                })
        except Exception:
            pass

    # --- Clinical observations ---
    clinical_obs: list[dict] = []
    if "cl" in study.xpt_files:
        try:
            cl_df = _read_domain_df(study, "CL")
            cl_df = cl_df[cl_df["USUBJID"].isin(full_ids)]
            finding_col = "CLSTRESC" if "CLSTRESC" in cl_df.columns else "CLRESULT"
            day_col = "CLDY" if "CLDY" in cl_df.columns else "VISITDY"
            if day_col in cl_df.columns:
                cl_df[day_col] = pd.to_numeric(cl_df[day_col], errors="coerce")
            for _, r in cl_df.iterrows():
                clinical_obs.append({
                    "usubjid": str(r["USUBJID"]),
                    "day": int(r[day_col]) if day_col in cl_df.columns and pd.notna(r.get(day_col)) else 0,
                    "observation": str(r[finding_col]) if finding_col in cl_df.columns else "",
                })
        except Exception:
            pass

    # --- Control group stats ---
    # Sexes of the selected subjects (for sex-specific controls)
    selected_sexes = set(p["sex"] for p in profiles)
    is_mixed_sex = len(selected_sexes) > 1
    all_control = subjects_df[subjects_df["dose_level"] == 0]
    if not is_mixed_sex and selected_sexes:
        sex_val = next(iter(selected_sexes))
        control_subjects = all_control[all_control["SEX"] == sex_val]
    else:
        control_subjects = all_control
    control_ids = control_subjects["USUBJID"].tolist()

    # Per-sex control ID sets (for mixed-sex by_sex breakdown)
    control_ids_by_sex: dict[str, list] = {}
    if is_mixed_sex:
        for sex_val in sorted(selected_sexes):
            sex_ctrl = all_control[all_control["SEX"] == sex_val]
            control_ids_by_sex[sex_val] = sex_ctrl["USUBJID"].tolist()

    # Helper: compute lab stats for a subset of control IDs from pre-filtered lb data
    def _compute_lab_stats(lb_ctrl_subset, val_col, day_col, unit_col, testcd_col):
        result = {}
        if lb_ctrl_subset.empty:
            return result
        for test, tgrp in lb_ctrl_subset.groupby(testcd_col):
            max_day = tgrp[day_col].max()
            terminal = tgrp[tgrp[day_col] == max_day]
            vals = terminal[val_col].dropna()
            if len(vals) >= 1:
                unit = str(terminal[unit_col].iloc[0]) if unit_col in terminal.columns and terminal[unit_col].iloc[0] != "" else ""
                result[str(test)] = {
                    "mean": round(float(vals.mean()), 4),
                    "sd": round(float(vals.std(ddof=1)), 4) if len(vals) > 1 else 0.0,
                    "unit": unit,
                    "n": int(len(vals)),
                }
        return result

    # Control lab stats (terminal timepoint = max day per test)
    control_lab: dict[str, dict] = {}
    if "lb" in study.xpt_files and control_ids:
        try:
            lb_all = _read_domain_df(study, "LB")
            lb_ctrl = lb_all[lb_all["USUBJID"].isin(control_ids)]
            val_col, day_col, unit_col, testcd_col = "LBSTRESN", "LBDY", "LBSTRESU", "LBTESTCD"
            lb_ctrl[val_col] = pd.to_numeric(lb_ctrl[val_col], errors="coerce")
            lb_ctrl[day_col] = pd.to_numeric(lb_ctrl[day_col], errors="coerce")
            lb_ctrl = lb_ctrl.dropna(subset=[val_col, day_col])
            control_lab = _compute_lab_stats(lb_ctrl, val_col, day_col, unit_col, testcd_col)
            # Add per-sex breakdown for mixed-sex comparisons
            if is_mixed_sex and not lb_ctrl.empty:
                for sex_val, sex_ids in control_ids_by_sex.items():
                    sex_stats = _compute_lab_stats(
                        lb_ctrl[lb_ctrl["USUBJID"].isin(sex_ids)],
                        val_col, day_col, unit_col, testcd_col,
                    )
                    for test, stats in sex_stats.items():
                        if test in control_lab:
                            control_lab[test].setdefault("by_sex", {})[sex_val] = stats
        except Exception:
            pass

    # Helper: compute BW stats for a subset
    def _compute_bw_stats(bw_subset, val_col, day_col):
        result = {}
        for day_val, dgrp in bw_subset.groupby(day_col):
            vals = dgrp[val_col].dropna()
            if len(vals) >= 1:
                result[str(int(day_val))] = {
                    "mean": round(float(vals.mean()), 2),
                    "sd": round(float(vals.std(ddof=1)), 2) if len(vals) > 1 else 0.0,
                    "n": int(len(vals)),
                }
        return result

    # Control BW stats (mean/SD per day)
    control_bw: dict[str, dict] = {}
    if "bw" in study.xpt_files and control_ids:
        try:
            bw_all = _read_domain_df(study, "BW")
            bw_ctrl = bw_all[bw_all["USUBJID"].isin(control_ids)]
            val_col, day_col = "BWSTRESN", "BWDY"
            bw_ctrl[val_col] = pd.to_numeric(bw_ctrl[val_col], errors="coerce")
            bw_ctrl[day_col] = pd.to_numeric(bw_ctrl[day_col], errors="coerce")
            bw_ctrl = bw_ctrl.dropna(subset=[val_col, day_col])
            control_bw = _compute_bw_stats(bw_ctrl, val_col, day_col)
            # Add per-sex breakdown for mixed-sex comparisons
            if is_mixed_sex and not bw_ctrl.empty:
                for sex_val, sex_ids in control_ids_by_sex.items():
                    sex_stats = _compute_bw_stats(
                        bw_ctrl[bw_ctrl["USUBJID"].isin(sex_ids)],
                        val_col, day_col,
                    )
                    for day_key, stats in sex_stats.items():
                        if day_key in control_bw:
                            control_bw[day_key].setdefault("by_sex", {})[sex_val] = stats
        except Exception:
            pass

    return {
        "subjects": profiles,
        "lab_values": lab_values,
        "body_weights": body_weights,
        "clinical_obs": clinical_obs,
        "control_stats": {
            "lab": control_lab,
            "bw": control_bw,
        },
        "available_timepoints": available_timepoints,
    }


# ---------------------------------------------------------------------------
# Endpoint 6: Recovery comparison (terminal vs recovery sacrifice groups)
# ---------------------------------------------------------------------------

@router.get("/studies/{study_id}/recovery-comparison")
async def get_recovery_comparison(study_id: str):
    """Compare recovery-arm subjects vs recovery-arm controls for LB and BW.

    Returns per-endpoint, per-sex, per-dose recovery statistics including
    p-value (Welch t-test) and effect size (Hedges' g) at recovery sacrifice.
    Also includes the terminal (main-arm) effect for comparison.
    """
    from services.analysis.statistics import welch_t_test, compute_effect_size

    study = _get_study(study_id)
    subjects_df = _get_subjects_df(study, include_recovery=True)

    recovery_subjects = subjects_df[subjects_df["is_recovery"]].copy()
    main_subjects = subjects_df[~subjects_df["is_recovery"]].copy()

    if recovery_subjects.empty:
        return {"available": False, "rows": [], "recovery_day": None}

    recovery_ids = set(recovery_subjects["USUBJID"])
    main_ids = set(main_subjects["USUBJID"])

    # Determine recovery sacrifice day from DS domain
    recovery_day = None
    if "ds" in study.xpt_files:
        try:
            ds_df = _read_domain_df(study, "DS")
            # SEND uses DSSTDY for disposition study day
            day_col_ds = "DSSTDY" if "DSSTDY" in ds_df.columns else "DSDY"
            ds_df[day_col_ds] = pd.to_numeric(ds_df.get(day_col_ds), errors="coerce")
            rec_ds = ds_df[ds_df["USUBJID"].isin(recovery_ids)]
            if not rec_ds.empty and rec_ds[day_col_ds].notna().any():
                recovery_day = int(rec_ds[day_col_ds].dropna().max())
        except Exception:
            pass

    # Compute treatment/recovery boundary once for time-period filtering
    try:
        override = get_last_dosing_day_override(study_id)
        last_dosing_day = compute_last_dosing_day(study, override=override)
    except Exception:
        last_dosing_day = None

    # Recovery period boundary: max of main-arm terminal sacrifice day and last
    # dosing day.  Days at or before this boundary are dosing-period measurements.
    # Computed cross-domain (BW is the most reliable source for terminal day)
    # to match frontend logic: mainTerminalDay = max(terminalDay, lastDosingDay).
    main_terminal_day = last_dosing_day or 0
    if "bw" in study.xpt_files:
        try:
            bw_df = _read_domain_df(study, "BW")
            bw_day_col = "BWDY"
            if bw_day_col in bw_df.columns:
                bw_df[bw_day_col] = pd.to_numeric(bw_df[bw_day_col], errors="coerce")
                main_bw = bw_df[bw_df["USUBJID"].isin(main_ids)]
                if not main_bw.empty:
                    bw_max = main_bw[bw_day_col].max()
                    if pd.notna(bw_max):
                        main_terminal_day = max(main_terminal_day, int(bw_max))
        except Exception:
            pass
    # Also check recovery_day from DS (terminal recovery sacrifice) to ensure
    # main_terminal_day is at least before the first recovery sacrifice.
    if recovery_day is not None and main_terminal_day >= recovery_day:
        main_terminal_day = recovery_day - 1

    rows: list[dict] = []
    # { endpoint_label: { sex: [day1, day2, ...] } }
    recovery_days_available: dict[str, dict[str, list[int]]] = {}

    def _safe_round(v: float | None, ndigits: int) -> float | None:
        """Round a value, converting NaN/Inf to None for JSON safety."""
        if v is None:
            return None
        import math
        if math.isnan(v) or math.isinf(v):
            return None
        return round(v, ndigits)

    def _compute_domain_recovery(
        domain_key: str,
        testcd_col: str,
        value_col: str,
        day_col: str,
        name_col: str,
    ):
        if domain_key not in study.xpt_files:
            return
        try:
            df = _read_domain_df(study, domain_key.upper())
        except Exception:
            return

        # BW: ensure BWTESTCD exists and unify TERMBW (terminal sacrifice
        # weight) into the main BW series so the full trajectory is used.
        if domain_key.upper() == "BW":
            if testcd_col not in df.columns:
                df[testcd_col] = _BW_DEFAULT_TESTCD
            else:
                df.loc[df[testcd_col].str.upper() == "TERMBW", testcd_col] = _BW_DEFAULT_TESTCD
            if name_col not in df.columns:
                df[name_col] = "Body Weight"

        # For OM, differentiate by specimen (organ) since OMTESTCD is always "WEIGHT"
        if domain_key.upper() == "OM" and "OMSPEC" in df.columns:
            df[testcd_col] = df["OMSPEC"]
            df[name_col] = df["OMSPEC"].apply(
                lambda s: s.replace("GLAND, ", "").title() + " Weight"
            )

        if testcd_col not in df.columns or value_col not in df.columns:
            return

        df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
        df[day_col] = pd.to_numeric(df[day_col], errors="coerce")
        df = df.dropna(subset=[value_col, day_col])

        # Split into recovery and main arms
        rec_df = df[df["USUBJID"].isin(recovery_ids)].copy()
        main_df = df[df["USUBJID"].isin(main_ids)].copy()

        if rec_df.empty:
            return

        # Join dose info
        rec_df = rec_df.merge(
            recovery_subjects[["USUBJID", "SEX", "dose_level"]],
            on="USUBJID", how="inner",
        )
        main_df = main_df.merge(
            main_subjects[["USUBJID", "SEX", "dose_level"]],
            on="USUBJID", how="inner",
        )

        for test_code, test_group in rec_df.groupby(testcd_col):
            test_name = str(test_group[name_col].iloc[0]) if name_col in test_group.columns else str(test_code)

            for sex_val, sex_group in test_group.groupby("SEX"):
                # Recovery control: dose_level=0, same sex
                rec_control = sex_group[sex_group["dose_level"] == 0]

                # Collect scheduled measurement days for the recovery day stepper.
                # A day is "scheduled" (not a moribund sacrifice) if the control
                # group has measurements at that day — moribund sacrifices only
                # affect one animal and won't have concurrent control data.
                # We also require at least one treated group with n >= 2 for stats.
                # Days within the main study period (≤ last_dosing_day) are excluded —
                # recovery-arm subjects may have dosing-period measurements (e.g. BG, FW)
                # but those reflect treatment effects, not recovery.
                ctrl_days = set(
                    rec_control[day_col].dropna().unique()
                ) if not rec_control.empty else set()
                treated_groups = sex_group[sex_group["dose_level"] > 0]
                valid_days: list[int] = []
                for d in sorted(sex_group[day_col].dropna().unique()):
                    if d <= main_terminal_day:
                        continue  # main study period — not a recovery measurement
                    if d not in ctrl_days:
                        continue  # no concurrent control → likely moribund sacrifice
                    # Check at least one treated group has n >= 2 at this day
                    at_day = treated_groups[treated_groups[day_col] == d]
                    has_group = False
                    for _, dg in at_day.groupby("dose_level"):
                        if len(dg[value_col].dropna()) >= 2:
                            has_group = True
                            break
                    if has_group:
                        valid_days.append(int(d))
                # Key by test_code (not test_name) so the frontend can look up
                # by the same identifier used in unified findings.  For OM this
                # is the specimen name (e.g. "BRAIN"), for LB the LBTESTCD
                # (e.g. "ALB"), for BW "BW".
                rda_key = str(test_code)
                if rda_key not in recovery_days_available:
                    recovery_days_available[rda_key] = {}
                recovery_days_available[rda_key][str(sex_val)] = valid_days

                # Main-arm terminal effect (for comparison) — computed once per
                # test_code/sex, reused across all days and dose groups.
                main_test = main_df[
                    (main_df[testcd_col].str.upper() == str(test_code).upper()) &
                    (main_df["SEX"] == sex_val)
                ]
                main_ctrl = main_test[main_test["dose_level"] == 0]
                main_ctrl_day = main_ctrl[day_col].max() if not main_ctrl.empty else None

                # Main-arm control mean at terminal (for drift detection)
                main_ctrl_mean = None
                if main_ctrl_day is not None:
                    mc_terminal_all = main_ctrl[main_ctrl[day_col] == main_ctrl_day]
                    mc_vals_all = mc_terminal_all[value_col].dropna().values
                    if len(mc_vals_all) >= 2:
                        main_ctrl_mean = _safe_round(float(np.mean(mc_vals_all)), 4)

                # Pre-compute terminal effect and peak effect per dose_level
                # (these depend only on main arm, independent of recovery day).
                _terminal_cache: dict[int, tuple] = {}  # dose_level -> (terminal_d, terminal_day_val, main_treated_mean, ci_lower_term, ci_upper_term, pct_diff_term)
                _same_arm_terminal_cache: dict[int, float | None] = {}  # dose_level -> terminal_d_same_arm
                _peak_cache: dict[int, tuple] = {}  # dose_level -> (peak_d, peak_day_val)

                for dose_level, dose_group in sex_group.groupby("dose_level"):
                    if dose_level == 0:
                        continue

                    # --- Terminal effect (main arm) ---
                    terminal_d = None
                    terminal_day_val = None
                    main_treated_mean = None
                    ci_lower_term = None
                    ci_upper_term = None
                    pct_diff_term = None
                    if main_ctrl_day is not None:
                        main_treated = main_test[
                            (main_test["dose_level"] == dose_level) &
                            (main_test[day_col] == main_ctrl_day if main_ctrl_day == main_test[day_col].max() else True)
                        ]
                        if not main_treated.empty:
                            mt_day = main_treated[day_col].max()
                            mt_terminal = main_treated[main_treated[day_col] == mt_day]
                            mc_terminal = main_ctrl[main_ctrl[day_col] == main_ctrl_day]
                            mt_vals = mt_terminal[value_col].dropna().values
                            mc_vals = mc_terminal[value_col].dropna().values
                            if len(mt_vals) >= 2:
                                main_treated_mean = _safe_round(float(np.mean(mt_vals)), 4)
                            if len(mt_vals) >= 2 and len(mc_vals) >= 2:
                                terminal_d = compute_effect_size(mt_vals, mc_vals)
                                terminal_day_val = mt_day
                                # CI + % diff for terminal
                                from scipy import stats as sp_stats
                                mt_mean = float(np.mean(mt_vals))
                                mc_mean = float(np.mean(mc_vals))
                                mt_sd = float(np.std(mt_vals, ddof=1))
                                mc_sd = float(np.std(mc_vals, ddof=1))
                                se_t = np.sqrt(mt_sd**2 / len(mt_vals) + mc_sd**2 / len(mc_vals))
                                num_t = (mt_sd**2 / len(mt_vals) + mc_sd**2 / len(mc_vals)) ** 2
                                den_t = (mt_sd**2 / len(mt_vals)) ** 2 / (len(mt_vals) - 1) + (mc_sd**2 / len(mc_vals)) ** 2 / (len(mc_vals) - 1)
                                df_t = num_t / den_t if den_t > 0 else len(mt_vals) + len(mc_vals) - 2
                                t_crit_t = sp_stats.t.ppf(0.975, df_t) if df_t > 0 else 1.96
                                md_t = mt_mean - mc_mean
                                ci_lower_term = _safe_round(md_t - t_crit_t * se_t, 4)
                                ci_upper_term = _safe_round(md_t + t_crit_t * se_t, 4)
                                if abs(mc_mean) > 1e-10:
                                    pct_diff_term = _safe_round((mt_mean - mc_mean) / mc_mean * 100, 2)
                    _terminal_cache[int(dose_level)] = (
                        terminal_d, terminal_day_val, main_treated_mean,
                        ci_lower_term, ci_upper_term, pct_diff_term,
                    )

                    # --- Same-arm terminal effect (Option D, BUG-21) ---
                    # Use recovery-arm treated vs recovery-arm control at the
                    # terminal day.  Eliminates cross-arm control baseline shift.
                    terminal_d_same_arm = None
                    if main_ctrl_day is not None and not rec_control.empty:
                        rec_treated_at_term = dose_group[dose_group[day_col] == main_ctrl_day]
                        rec_ctrl_at_term = rec_control[rec_control[day_col] == main_ctrl_day]
                        rt_vals = rec_treated_at_term[value_col].dropna().values
                        rc_vals = rec_ctrl_at_term[value_col].dropna().values
                        if len(rt_vals) >= 2 and len(rc_vals) >= 2:
                            terminal_d_same_arm = compute_effect_size(rt_vals, rc_vals)
                    _same_arm_terminal_cache[int(dose_level)] = terminal_d_same_arm

                    # --- Peak effect (main arm) ---
                    peak_d = None
                    peak_day_val = None
                    main_dose = main_test[main_test["dose_level"] == dose_level]
                    if not main_dose.empty and not main_ctrl.empty:
                        for tp_day, tp_group in main_dose.groupby(day_col):
                            tp_vals = tp_group[value_col].dropna().values
                            mc_at_day = main_ctrl[main_ctrl[day_col] == tp_day]
                            mc_vals_day = mc_at_day[value_col].dropna().values if not mc_at_day.empty else np.array([])
                            if len(tp_vals) >= 2 and len(mc_vals_day) >= 2:
                                tp_d = compute_effect_size(tp_vals, mc_vals_day)
                                if tp_d is not None and (peak_d is None or abs(tp_d) > abs(peak_d)):
                                    peak_d = tp_d
                                    peak_day_val = tp_day
                    _peak_cache[int(dose_level)] = (peak_d, peak_day_val)

                    # --- Iterate over recovery-period days for this dose group ---
                    # Exclude main-study-period days (≤ main_terminal_day) — those
                    # reflect treatment effects during dosing, not recovery.
                    unique_days = sorted(dose_group[day_col].dropna().unique())
                    unique_days = [d for d in unique_days if d > main_terminal_day]

                    for current_day in unique_days:
                        dose_at_day = dose_group[dose_group[day_col] == current_day]
                        treat_vals = dose_at_day[value_col].dropna().values

                        # Recovery control at this specific day
                        has_concurrent_control_day = False
                        ctrl_vals_day = np.array([])
                        if not rec_control.empty:
                            ctrl_at_day = rec_control[rec_control[day_col] == current_day]
                            ctrl_vals_day = ctrl_at_day[value_col].dropna().values
                            if len(ctrl_vals_day) >= 2:
                                has_concurrent_control_day = True

                        # Retrieve cached terminal/peak (independent of recovery day)
                        t_cache = _terminal_cache[int(dose_level)]
                        p_cache = _peak_cache[int(dose_level)]
                        terminal_d = t_cache[0]
                        terminal_day_val = t_cache[1]
                        main_treated_mean = t_cache[2]
                        ci_lower_term = t_cache[3]
                        ci_upper_term = t_cache[4]
                        pct_diff_term = t_cache[5]
                        terminal_d_same_arm = _same_arm_terminal_cache.get(int(dose_level))
                        peak_d = p_cache[0]
                        peak_day_val = p_cache[1]

                        base_fields = {
                            "endpoint_label": test_name,
                            "test_code": str(test_code),
                            "sex": str(sex_val),
                            "day": int(current_day),
                            "recovery_day": recovery_day or int(dose_group[day_col].max()),
                            "dose_level": int(dose_level),
                        }

                        # §10.5: n<2 — emit flagged row instead of skipping
                        if len(treat_vals) < 2:
                            rows.append({
                                **base_fields,
                                "mean": _safe_round(float(np.mean(treat_vals)), 4) if len(treat_vals) else None,
                                "sd": None,
                                "p_value": None,
                                "effect_size": None,
                                "terminal_effect": _safe_round(terminal_d, 4),
                                "terminal_effect_same_arm": _safe_round(terminal_d_same_arm, 4),
                                "terminal_day": int(terminal_day_val) if terminal_day_val is not None else None,
                                "peak_effect": _safe_round(peak_d, 4) if peak_d is not None else None,
                                "peak_day": int(peak_day_val) if peak_day_val is not None else None,
                                "insufficient_n": True,
                                "treated_n": len(treat_vals),
                                "control_mean": None,
                                "control_n": None,
                                "treated_mean_terminal": main_treated_mean,
                                "control_mean_terminal": main_ctrl_mean,
                            })
                            continue

                        # §10.4: No concurrent control at this day — emit row with flag
                        if not has_concurrent_control_day:
                            rows.append({
                                **base_fields,
                                "mean": _safe_round(float(np.mean(treat_vals)), 4),
                                "sd": _safe_round(float(np.std(treat_vals, ddof=1)), 4),
                                "p_value": None,
                                "effect_size": None,
                                "terminal_effect": _safe_round(terminal_d, 4),
                                "terminal_effect_same_arm": _safe_round(terminal_d_same_arm, 4),
                                "terminal_day": int(terminal_day_val) if terminal_day_val is not None else None,
                                "peak_effect": _safe_round(peak_d, 4) if peak_d is not None else None,
                                "peak_day": int(peak_day_val) if peak_day_val is not None else None,
                                "no_concurrent_control": True,
                                "treated_n": len(treat_vals),
                                "control_mean": None,
                                "control_n": None,
                                "treated_mean_terminal": main_treated_mean,
                                "control_mean_terminal": main_ctrl_mean,
                            })
                            continue

                        # Stats: recovery arm treated vs recovery arm control at this day
                        t_result = welch_t_test(treat_vals, ctrl_vals_day)
                        d = compute_effect_size(treat_vals, ctrl_vals_day)

                        # CI for recovery: mean_diff ± t_crit * SE_diff
                        from scipy import stats as sp_stats
                        treat_mean_rec = float(np.mean(treat_vals))
                        ctrl_mean_rec = float(np.mean(ctrl_vals_day))
                        treat_sd_rec = float(np.std(treat_vals, ddof=1))
                        ctrl_sd_rec = float(np.std(ctrl_vals_day, ddof=1))
                        n1, n2 = len(treat_vals), len(ctrl_vals_day)
                        se_diff_rec = np.sqrt(treat_sd_rec**2 / n1 + ctrl_sd_rec**2 / n2)
                        # Welch-Satterthwaite df
                        num = (treat_sd_rec**2 / n1 + ctrl_sd_rec**2 / n2) ** 2
                        denom = (treat_sd_rec**2 / n1) ** 2 / (n1 - 1) + (ctrl_sd_rec**2 / n2) ** 2 / (n2 - 1)
                        df_rec = num / denom if denom > 0 else n1 + n2 - 2
                        t_crit_rec = sp_stats.t.ppf(0.975, df_rec) if df_rec > 0 else 1.96
                        mean_diff_rec = treat_mean_rec - ctrl_mean_rec
                        ci_lower_rec = _safe_round(mean_diff_rec - t_crit_rec * se_diff_rec, 4)
                        ci_upper_rec = _safe_round(mean_diff_rec + t_crit_rec * se_diff_rec, 4)

                        # % diff: (treated - control) / control * 100
                        pct_diff_rec = _safe_round(
                            (treat_mean_rec - ctrl_mean_rec) / ctrl_mean_rec * 100, 2
                        ) if abs(ctrl_mean_rec) > 1e-10 else None

                        rows.append({
                            **base_fields,
                            "mean": _safe_round(float(np.mean(treat_vals)), 4),
                            "sd": _safe_round(float(np.std(treat_vals, ddof=1)), 4),
                            "p_value": _safe_round(t_result["p_value"], 6),
                            "effect_size": _safe_round(d, 4),
                            "terminal_effect": _safe_round(terminal_d, 4),
                            "terminal_effect_same_arm": _safe_round(terminal_d_same_arm, 4),
                            "terminal_day": int(terminal_day_val) if terminal_day_val is not None else None,
                            "peak_effect": _safe_round(peak_d, 4) if peak_d is not None else None,
                            "peak_day": int(peak_day_val) if peak_day_val is not None else None,
                            "control_mean": _safe_round(float(np.mean(ctrl_vals_day)), 4),
                            "control_n": len(ctrl_vals_day),
                            "treated_n": len(treat_vals),
                            "treated_mean_terminal": main_treated_mean,
                            "control_mean_terminal": main_ctrl_mean,
                            "pct_diff_terminal": pct_diff_term,
                            "pct_diff_recovery": pct_diff_rec,
                            "ci_lower": ci_lower_rec,
                            "ci_upper": ci_upper_rec,
                            "ci_lower_terminal": ci_lower_term,
                            "ci_upper_terminal": ci_upper_term,
                        })

    # Process all continuous domains that have recovery data
    for dk, (testcd_col, val_col, _unit_col, day_col, name_col) in _DOMAIN_COLS.items():
        _compute_domain_recovery(dk.lower(), testcd_col, val_col, day_col, name_col)

    # ── Incidence domains (CL, MI) ──────────────────────────────
    # Compare incidence of clinical observations between main and recovery arms.
    # For each finding × sex × dose: count affected subjects in main (terminal)
    # vs recovery arm to assess persistence/resolution.
    incidence_rows: list[dict] = []

    if "cl" in study.xpt_files:
        try:
            cl_df = _read_domain_df(study, "CL")
            incidence_rows = compute_incidence_recovery(
                cl_df=cl_df,
                subjects_df=subjects_df,
                domain_key="cl",
                day_col="CLDY",
                last_dosing_day=last_dosing_day,
                recovery_day=recovery_day,
            )
        except Exception:
            pass

    # MI (Microscopic Findings) — incidence + severity grade counts
    if "mi" in study.xpt_files:
        try:
            mi_df = _read_domain_df(study, "MI")
            mi_sev_col = "MISEV" if "MISEV" in mi_df.columns else None
            mi_spec_col = "MISPEC" if "MISPEC" in mi_df.columns else None
            mi_rows = compute_incidence_recovery(
                cl_df=mi_df,
                subjects_df=subjects_df,
                domain_key="mi",
                day_col="MIDY",
                last_dosing_day=last_dosing_day,
                recovery_day=recovery_day,
                specimen_col=mi_spec_col,
                sev_col=mi_sev_col,
            )
            incidence_rows.extend(mi_rows)
        except Exception:
            pass

    # MA (Macroscopic Findings) — incidence only (no severity grades in SEND MA)
    if "ma" in study.xpt_files:
        try:
            ma_df = _read_domain_df(study, "MA")
            ma_spec_col = "MASPEC" if "MASPEC" in ma_df.columns else None
            ma_rows = compute_incidence_recovery(
                cl_df=ma_df,
                subjects_df=subjects_df,
                domain_key="ma",
                day_col="MADY",
                last_dosing_day=last_dosing_day,
                recovery_day=recovery_day,
                specimen_col=ma_spec_col,
            )
            incidence_rows.extend(ma_rows)
        except Exception:
            pass

    return {
        "available": len(rows) > 0 or len(incidence_rows) > 0,
        "recovery_day": recovery_day,
        "last_dosing_day": last_dosing_day,
        "recovery_days_available": recovery_days_available,
        "rows": rows,
        "incidence_rows": incidence_rows,
    }
