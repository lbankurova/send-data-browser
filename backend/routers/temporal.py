"""On-demand temporal and subject-level data endpoints (spec 01).

These endpoints expose per-subject, per-timepoint data from the XPT/CSV cache
that is aggregated away during view assembly. They serve specs 02-07.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from services.study_discovery import StudyInfo
from services.xpt_processor import ensure_cached, read_xpt
from services.analysis.dose_groups import build_dose_groups

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
    df = pd.read_csv(csv_path, keep_default_na=False)
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

    # BW domain: no BWTESTCD column — all rows are body weight
    if domain_upper == "BW":
        if "BWTESTCD" not in df.columns:
            df["BWTESTCD"] = _BW_DEFAULT_TESTCD
        if "BWTEST" not in df.columns:
            df["BWTEST"] = "Body Weight"

    # Filter to requested test code
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

    # Join with subject roster
    subjects_df = _get_subjects_df(study)
    df = df.merge(subjects_df[["USUBJID", "SEX", "ARMCD", "dose_level", "dose_label"]],
                  on="USUBJID", how="inner")

    # Filter by sex if requested
    if sex:
        df = df[df["SEX"] == sex.upper()]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data for sex='{sex}'")

    if mode == "subject":
        return _build_subject_response(df, test_code, test_name, domain_upper, unit, value_col, day_col)
    else:
        return _build_group_response(df, test_code, test_name, domain_upper, unit, value_col, day_col)


def _build_group_response(
    df: pd.DataFrame, test_code: str, test_name: str, domain: str, unit: str,
    value_col: str, day_col: str,
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

    return {
        "test_code": test_code.upper(),
        "test_name": test_name,
        "domain": domain,
        "unit": unit,
        "timepoints": timepoints,
    }


def _build_subject_response(
    df: pd.DataFrame, test_code: str, test_name: str, domain: str, unit: str,
    value_col: str, day_col: str,
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
        subjects.append({
            "usubjid": usubjid,
            "sex": row0["SEX"],
            "dose_level": int(row0["dose_level"]),
            "dose_label": row0["dose_label"],
            "arm_code": row0["ARMCD"],
            "values": values,
        })

    return {
        "test_code": test_code.upper(),
        "test_name": test_name,
        "domain": domain,
        "unit": unit,
        "subjects": subjects,
    }


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
    subjects_df = _get_subjects_df(study)
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
                if "DSDY" in ds_subj.columns:
                    day_val = pd.to_numeric(ds_subj["DSDY"].iloc[0], errors="coerce")
                    if pd.notna(day_val):
                        disposition_day = int(day_val)
        except Exception:
            pass

    # Collect domain data
    domains: dict = {}

    # BW
    if "bw" in study.xpt_files:
        try:
            bw_df = _read_domain_df(study, "BW")
            bw_subj = bw_df[bw_df["USUBJID"] == usubjid]
            if not bw_subj.empty:
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
        except Exception:
            pass

    # LB
    if "lb" in study.xpt_files:
        try:
            lb_df = _read_domain_df(study, "LB")
            lb_subj = lb_df[lb_df["USUBJID"] == usubjid]
            if not lb_subj.empty:
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
        except Exception:
            pass

    # OM (Organ Measurements)
    if "om" in study.xpt_files:
        try:
            om_df = _read_domain_df(study, "OM")
            om_subj = om_df[om_df["USUBJID"] == usubjid]
            if not om_subj.empty:
                val_col = "OMSTRESN"
                day_col = "OMDY"
                unit_col = "OMSTRESU"
                testcd_col = "OMTESTCD"
                om_subj[val_col] = pd.to_numeric(om_subj[val_col], errors="coerce")
                om_subj[day_col] = pd.to_numeric(om_subj[day_col], errors="coerce")
                om_subj = om_subj.dropna(subset=[val_col])
                measurements = [
                    {
                        "day": int(r[day_col]) if pd.notna(r.get(day_col)) else 0,
                        "test_code": str(r[testcd_col]) if testcd_col in om_subj.columns else "",
                        "value": round(float(r[val_col]), 4),
                        "unit": str(r[unit_col]) if unit_col in om_subj.columns and r[unit_col] != "" else "",
                    }
                    for _, r in om_subj.sort_values(testcd_col).iterrows()
                ]
                if measurements:
                    domains["OM"] = {"measurements": measurements}
        except Exception:
            pass

    # CL (Clinical Observations)
    if "cl" in study.xpt_files:
        try:
            cl_df = _read_domain_df(study, "CL")
            cl_subj = cl_df[cl_df["USUBJID"] == usubjid]
            if not cl_subj.empty:
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
        except Exception:
            pass

    # MI (Microscopic Findings)
    if "mi" in study.xpt_files:
        try:
            mi_df = _read_domain_df(study, "MI")
            mi_subj = mi_df[mi_df["USUBJID"] == usubjid]
            if not mi_subj.empty:
                spec_col = "MISPEC" if "MISPEC" in mi_subj.columns else "MIORRES"
                finding_col = "MISTRESC" if "MISTRESC" in mi_subj.columns else "MIORRES"
                sev_col = "MISEV" if "MISEV" in mi_subj.columns else None

                findings = [
                    {
                        "specimen": str(r[spec_col]) if spec_col in mi_subj.columns else "",
                        "finding": str(r[finding_col]) if finding_col in mi_subj.columns else "",
                        "severity": str(r[sev_col]) if sev_col and sev_col in mi_subj.columns and r.get(sev_col, "") != "" else None,
                    }
                    for _, r in mi_subj.iterrows()
                ]
                if findings:
                    domains["MI"] = {"findings": findings}
        except Exception:
            pass

    # MA (Macroscopic Findings)
    if "ma" in study.xpt_files:
        try:
            ma_df = _read_domain_df(study, "MA")
            ma_subj = ma_df[ma_df["USUBJID"] == usubjid]
            if not ma_subj.empty:
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
        "domains": domains,
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
    if "ma" in study.xpt_files:
        ma_df = _read_domain_df(study, "MA")
        ma_spec_col = "MASPEC" if "MASPEC" in ma_df.columns else None
        if ma_spec_col:
            ma_finding_col = "MASTRESC" if "MASTRESC" in ma_df.columns else "MAORRES"
            ma_sev_col = "MASEV" if "MASEV" in ma_df.columns else None
            ma_specimen_df = ma_df[ma_df[ma_spec_col].str.upper() == specimen.upper()]
            if ma_specimen_df.empty:
                ma_specimen_df = None

    if specimen_df.empty and ma_specimen_df is None:
        raise HTTPException(status_code=404, detail=f"No findings for specimen '{specimen}'")

    # Get unique findings from both domains
    mi_findings = set(specimen_df[finding_col].dropna().unique().tolist()) if not specimen_df.empty else set()
    ma_findings = set(ma_specimen_df[ma_finding_col].dropna().unique().tolist()) if ma_specimen_df is not None else set()
    all_findings = sorted(mi_findings | ma_findings)

    # Severity mapping
    SEV_MAP = {
        "MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5,
    }

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
                findings_map[f] = {
                    "severity": sev_str,
                    "severity_num": sev_num,
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
                findings_by_subj[subj_key][f] = {
                    "severity": sev_str,
                    "severity_num": sev_num,
                }

    # Build per-subject entries from ALL subjects (not just those with findings)
    subject_list = []
    for _, row in subjects_df.iterrows():
        usubjid = str(row["USUBJID"])
        subject_list.append({
            "usubjid": usubjid,
            "sex": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "dose_label": str(row["dose_label"]),
            "is_recovery": bool(row.get("is_recovery", False)),
            "findings": findings_by_subj.get(usubjid, {}),
        })

    # Sort by dose_level then sex then USUBJID
    subject_list.sort(key=lambda s: (s["dose_level"], s["sex"], s["usubjid"]))

    return {
        "specimen": specimen,
        "findings": all_findings,
        "subjects": subject_list,
    }
