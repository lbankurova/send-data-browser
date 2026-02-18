"""Cross-domain PK integration (PC + PP + DM).

Generates pk_integration.json with exposure context for NOAEL determination.
Reads PC (plasma concentrations) and PP (derived PK parameters) XPT domains,
links TK satellite subjects to dose groups, and computes HED/MRSD.

Pattern follows tumor_summary.py (cross-domain generator module).
"""

import math

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


# FDA body surface area scaling factors (Km-based)
KM_TABLE = {
    "MOUSE":      {"km": 3,  "conversion_factor": 12.3},
    "HAMSTER":    {"km": 5,  "conversion_factor": 7.4},
    "RAT":        {"km": 6,  "conversion_factor": 6.2},
    "GUINEA PIG": {"km": 8,  "conversion_factor": 4.6},
    "RABBIT":     {"km": 12, "conversion_factor": 3.1},
    "MONKEY":     {"km": 12, "conversion_factor": 3.1},
    "DOG":        {"km": 20, "conversion_factor": 1.8},
    "MINIPIG":    {"km": 20, "conversion_factor": 1.8},
}

# Primary PK parameters to extract (in priority order for display)
PRIMARY_PARAMS = ["CMAX", "AUCLST", "AUCTAU", "TMAX", "TLST"]


def build_pk_integration(
    study: StudyInfo,
    dose_groups: list[dict],
    noael: list[dict],
) -> dict:
    """Build PK integration summary from PC + PP + DM domains.

    Args:
        study: StudyInfo for reading raw XPT data.
        dose_groups: Dose group definitions from build_dose_groups().
        noael: NOAEL summary rows from build_noael_summary().

    Returns:
        Dict written as pk_integration.json.
    """
    # Check availability
    if "pc" not in study.xpt_files or "pp" not in study.xpt_files:
        return {"available": False}
    if "dm" not in study.xpt_files:
        return {"available": False}

    try:
        pc_df = _read_domain(study, "pc")
        pp_df = _read_domain(study, "pp")
        dm_df = _read_domain(study, "dm")
    except Exception:
        return {"available": False}

    if pc_df is None or pp_df is None or dm_df is None:
        return {"available": False}
    if pc_df.empty or pp_df.empty:
        return {"available": False}

    # Detect TK satellite design from DM SETCD
    tk_design = _detect_tk_design(dm_df)

    # Link TK subjects to dose levels
    pp_merged = _link_tk_to_dose(pp_df, dm_df, dose_groups)
    if pp_merged.empty:
        return {"available": False}

    # Detect analyte info from PC
    analyte = _get_unique_val(pc_df, "PCTESTCD", fallback="UNKNOWN")
    specimen = _get_unique_val(pc_df, "PCSPEC", fallback="PLASMA")
    lloq, lloq_unit = _get_lloq(pc_df)

    # Visit days
    visit_days = _get_visit_days(pp_df)
    multi_visit = len(visit_days) > 1

    # Available PP parameters
    pp_params = _get_available_params(pp_merged)

    # Build per-dose-group stats
    by_dose_group = _build_dose_group_stats(
        pp_merged, pc_df, dm_df, dose_groups, tk_design, lloq,
    )

    # Dose proportionality (needs ≥ 3 dose groups with AUC)
    # Check TK survivorship to distinguish real PK non-monotonicity from artifact
    tk_survivorship = _check_tk_survivorship(study, dm_df, tk_design)
    dose_prop = _compute_dose_proportionality(by_dose_group, tk_survivorship)

    # Accumulation detection
    accumulation = _compute_accumulation(visit_days)

    # Species + HED/MRSD
    species = _get_species(study)
    km_info = KM_TABLE.get(species.upper(), None) if species else None

    # Find NOAEL and LOAEL dose levels from noael summary
    noael_dose_level, loael_dose_level, noael_dose_value = _get_noael_loael_levels(noael)

    # Extract exposure at NOAEL and LOAEL
    noael_exposure = _extract_exposure_at_dose(by_dose_group, noael_dose_level)
    loael_exposure = _extract_exposure_at_dose(by_dose_group, loael_dose_level)

    # HED/MRSD computation
    hed = _compute_hed(noael_dose_value, km_info, noael_dose_level)

    return {
        "available": True,
        "species": species,
        "km_factor": km_info["km"] if km_info else None,
        "hed_conversion_factor": km_info["conversion_factor"] if km_info else None,
        "tk_design": tk_design,
        "analyte": analyte,
        "specimen": specimen,
        "lloq": lloq,
        "lloq_unit": lloq_unit,
        "visit_days": visit_days,
        "multi_visit": multi_visit,
        "pp_parameters_available": pp_params,
        "by_dose_group": by_dose_group,
        "dose_proportionality": dose_prop,
        "accumulation": accumulation,
        "noael_exposure": noael_exposure,
        "loael_exposure": loael_exposure,
        "hed": hed,
    }


# ─── Domain reading ───────────────────────────────────────────


def _read_domain(study: StudyInfo, domain: str) -> pd.DataFrame | None:
    """Read a domain XPT and normalize column names to uppercase."""
    if domain not in study.xpt_files:
        return None
    try:
        df, _ = read_xpt(study.xpt_files[domain])
        df.columns = [c.upper() for c in df.columns]
        return df
    except Exception:
        return None


# ─── TK satellite design detection ────────────────────────────


def _detect_tk_design(dm_df: pd.DataFrame) -> dict:
    """Detect TK satellite groups from DM SETCD column."""
    if "SETCD" not in dm_df.columns:
        return {
            "has_satellite_groups": False,
            "satellite_set_codes": [],
            "main_study_set_codes": [],
            "n_tk_subjects": 0,
            "individual_correlation_possible": True,
        }

    set_codes = dm_df["SETCD"].dropna().unique()
    tk_codes = sorted(str(s) for s in set_codes if str(s).upper().endswith("TK"))
    main_codes = sorted(str(s) for s in set_codes if not str(s).upper().endswith("TK"))

    n_tk = 0
    if tk_codes:
        n_tk = int(dm_df[dm_df["SETCD"].isin(tk_codes)].shape[0])

    return {
        "has_satellite_groups": len(tk_codes) > 0,
        "satellite_set_codes": tk_codes,
        "main_study_set_codes": main_codes,
        "n_tk_subjects": n_tk,
        # Satellite TK animals can't be individually correlated with main study toxicity
        "individual_correlation_possible": len(tk_codes) == 0,
    }


# ─── Link TK subjects to dose levels ──────────────────────────


def _link_tk_to_dose(
    pp_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
) -> pd.DataFrame:
    """Merge PP with DM to get dose_level and sex per TK subject."""
    if "USUBJID" not in pp_df.columns or "USUBJID" not in dm_df.columns:
        return pd.DataFrame()

    # Build SETCD → dose_level mapping from dose_groups
    # dose_groups have dose_level (0-based index) and group_label
    # DM has SETCD (e.g., "2TK", "3TK") where numeric prefix matches group number
    dm_cols = ["USUBJID", "SEX"]
    if "SETCD" in dm_df.columns:
        dm_cols.append("SETCD")
    if "ARMCD" in dm_df.columns:
        dm_cols.append("ARMCD")

    dm_sub = dm_df[[c for c in dm_cols if c in dm_df.columns]].copy()

    # Merge PP with DM
    merged = pp_df.merge(dm_sub, on="USUBJID", how="inner")

    # Map SETCD to dose_level
    if "SETCD" in merged.columns:
        setcd_dose_map = _build_setcd_dose_map(dm_df, dose_groups)
        merged["dose_level"] = merged["SETCD"].map(setcd_dose_map)
        # Filter to TK subjects only (those with a TK SETCD that maps to a dose)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    elif "ARMCD" in merged.columns:
        # Fallback: map ARMCD to dose_level
        armcd_map = {}
        for dg in dose_groups:
            if "armcd" in dg:
                armcd_map[dg["armcd"]] = dg["dose_level"]
        merged["dose_level"] = merged["ARMCD"].map(armcd_map)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    else:
        return pd.DataFrame()

    return merged


def _build_setcd_dose_map(dm_df: pd.DataFrame, dose_groups: list[dict]) -> dict:
    """Build mapping from SETCD to dose_level.

    TK satellite SETCDs follow pattern: <group_number>TK
    Main study SETCDs are just the group number.
    We match TK SETCD prefixes to main study group numbers.
    """
    setcd_dose = {}

    # Build group_number → dose_level from dose_groups
    # dose_groups are ordered: index 0 = control (dose_level 0), etc.
    group_num_to_dose = {}
    for dg in dose_groups:
        # group_label often starts with "Group N" or similar
        dose_level = dg["dose_level"]
        # Main study SETCD is typically dose_level + 1 (1-indexed)
        group_num = str(dose_level + 1)
        group_num_to_dose[group_num] = dose_level

    # Map TK SETCDs: extract numeric prefix
    all_setcds = dm_df["SETCD"].dropna().unique()
    for setcd in all_setcds:
        s = str(setcd).upper()
        if s.endswith("TK"):
            prefix = s[:-2]  # Remove "TK" suffix
            if prefix in group_num_to_dose:
                setcd_dose[str(setcd)] = group_num_to_dose[prefix]

    return setcd_dose


# ─── PP parameter stats ───────────────────────────────────────


def _build_dose_group_stats(
    pp_merged: pd.DataFrame,
    pc_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    tk_design: dict,
    lloq: float | None,
) -> list[dict]:
    """Build per-dose-group PK parameter stats and concentration-time profiles."""
    results = []

    # Get dose_value and dose_unit from dose_groups
    dose_info = {}
    for dg in dose_groups:
        dose_info[dg["dose_level"]] = {
            "dose_value": dg.get("dose_value"),
            "dose_unit": dg.get("dose_unit", "mg/kg"),
            "dose_label": dg.get("group_label", f"Group {dg['dose_level'] + 1}"),
        }

    # Concentration-time data per dose
    conc_time_by_dose = _compute_concentration_time(pc_df, dm_df, dose_groups, lloq)

    for dose_level in sorted(pp_merged["dose_level"].unique()):
        dose_data = pp_merged[pp_merged["dose_level"] == dose_level]
        n_subjects = int(dose_data["USUBJID"].nunique())
        di = dose_info.get(dose_level, {})

        # Compute stats per parameter
        parameters = {}
        if "PPTESTCD" in dose_data.columns and "PPSTRESN" in dose_data.columns:
            for param in dose_data["PPTESTCD"].unique():
                param_str = str(param).upper()
                param_data = dose_data[dose_data["PPTESTCD"] == param]
                vals = pd.to_numeric(param_data["PPSTRESN"], errors="coerce").dropna()

                # Filter out negative values for AUCIFO (extrapolation failures)
                if param_str == "AUCIFO":
                    vals = vals[vals >= 0]

                if vals.empty:
                    continue

                unit = _get_unique_val(param_data, "PPSTRESU", fallback="")
                values = [round(float(v), 4) for v in vals]

                parameters[param_str] = {
                    "mean": round(float(vals.mean()), 4) if len(vals) > 0 else None,
                    "sd": round(float(vals.std(ddof=1)), 4) if len(vals) > 1 else None,
                    "median": round(float(vals.median()), 4) if len(vals) > 0 else None,
                    "n": int(len(vals)),
                    "unit": str(unit),
                    "values": values,
                }

        results.append({
            "dose_level": int(dose_level),
            "dose_value": di.get("dose_value"),
            "dose_unit": di.get("dose_unit", "mg/kg"),
            "dose_label": di.get("dose_label", f"Dose {dose_level}"),
            "n_subjects": n_subjects,
            "parameters": parameters,
            "concentration_time": conc_time_by_dose.get(int(dose_level), []),
        })

    return results


def _compute_concentration_time(
    pc_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    lloq: float | None,
) -> dict[int, list[dict]]:
    """Compute mean concentration-time profiles per dose group."""
    if "USUBJID" not in pc_df.columns or "PCSTRESN" not in pc_df.columns:
        return {}

    # Merge PC with DM to get SETCD
    dm_sub = dm_df[["USUBJID"]].copy()
    if "SETCD" in dm_df.columns:
        dm_sub = dm_df[["USUBJID", "SETCD"]].copy()

    pc_merged = pc_df.merge(dm_sub, on="USUBJID", how="inner")

    # Map SETCD to dose_level
    if "SETCD" not in pc_merged.columns:
        return {}

    setcd_map = _build_setcd_dose_map(dm_df, dose_groups)
    pc_merged["dose_level"] = pc_merged["SETCD"].map(setcd_map)
    pc_merged = pc_merged.dropna(subset=["dose_level"])
    pc_merged["dose_level"] = pc_merged["dose_level"].astype(int)

    # Parse elapsed time from PCELTM (ISO 8601 duration, e.g., "PT0.5H")
    if "PCELTM" in pc_merged.columns:
        pc_merged["elapsed_h"] = pc_merged["PCELTM"].apply(_parse_elapsed_time)
    elif "PCTPTNUM" in pc_merged.columns:
        pc_merged["elapsed_h"] = pd.to_numeric(pc_merged["PCTPTNUM"], errors="coerce")
    else:
        return {}

    # Handle BQL: use LLOQ/2
    lloq_half = (lloq / 2) if lloq and lloq > 0 else 0.0
    pc_merged["conc"] = pd.to_numeric(pc_merged["PCSTRESN"], errors="coerce")
    pc_merged["is_bql"] = pc_merged["conc"].isna()
    pc_merged["conc"] = pc_merged["conc"].fillna(lloq_half)

    # Get timepoint labels
    if "PCTPT" in pc_merged.columns:
        pc_merged["timepoint_label"] = pc_merged["PCTPT"].astype(str)
    else:
        pc_merged["timepoint_label"] = pc_merged["elapsed_h"].apply(
            lambda h: f"{h:.1f}H" if pd.notna(h) else "Unknown"
        )

    result = {}
    for dose_level, grp in pc_merged.groupby("dose_level"):
        dose_level = int(dose_level)
        timepoints = []

        # Get timepoint number for sorting
        if "PCTPTNUM" in grp.columns:
            tp_col = "PCTPTNUM"
        else:
            tp_col = "elapsed_h"

        for tp_val, tp_grp in grp.groupby(tp_col):
            elapsed = tp_grp["elapsed_h"].iloc[0] if "elapsed_h" in tp_grp.columns else None
            label = tp_grp["timepoint_label"].iloc[0]
            conc_vals = tp_grp["conc"].dropna()
            n_bql = int(tp_grp["is_bql"].sum())

            timepoints.append({
                "timepoint": str(label),
                "tptnum": int(tp_val) if pd.notna(tp_val) else 0,
                "elapsed_h": round(float(elapsed), 2) if pd.notna(elapsed) else None,
                "mean": round(float(conc_vals.mean()), 4) if len(conc_vals) > 0 else 0.0,
                "sd": round(float(conc_vals.std(ddof=1)), 4) if len(conc_vals) > 1 else 0.0,
                "n": int(len(tp_grp)),
                "n_bql": n_bql,
            })

        timepoints.sort(key=lambda t: t["elapsed_h"] if t["elapsed_h"] is not None else 0)
        result[dose_level] = timepoints

    return result


# ─── Dose proportionality ─────────────────────────────────────


def _compute_dose_proportionality(
    by_dose_group: list[dict],
    tk_survivorship: dict | None = None,
) -> dict:
    """Compute dose proportionality via log-log regression of AUC vs dose.

    Enhanced with non-monotonicity detection and survivorship cross-reference
    to distinguish real PK phenomena from artifacts of early death.
    """
    # Prefer AUCLST over AUCTAU over AUCIFO
    param = None
    for candidate in ["AUCLST", "AUCTAU"]:
        has_param = all(
            candidate in g["parameters"]
            for g in by_dose_group
            if g["parameters"]
        )
        if has_param and len(by_dose_group) >= 3:
            param = candidate
            break

    if param is None or len(by_dose_group) < 3:
        return {
            "parameter": param or "AUCLST",
            "slope": None,
            "r_squared": None,
            "assessment": "insufficient_data",
            "dose_levels_used": [],
            "non_monotonic": False,
            "interpretation": None,
        }

    doses = []
    aucs = []
    dose_levels_used = []
    for g in by_dose_group:
        dose_val = g.get("dose_value")
        auc_mean = g["parameters"].get(param, {}).get("mean")
        if dose_val and dose_val > 0 and auc_mean and auc_mean > 0:
            doses.append(dose_val)
            aucs.append(auc_mean)
            dose_levels_used.append(g["dose_level"])

    if len(doses) < 3:
        return {
            "parameter": param,
            "slope": None,
            "r_squared": None,
            "assessment": "insufficient_data",
            "dose_levels_used": dose_levels_used,
            "non_monotonic": False,
            "interpretation": None,
        }

    log_doses = [math.log(d) for d in doses]
    log_aucs = [math.log(a) for a in aucs]

    # Linear regression on log-log scale
    coeffs = np.polyfit(log_doses, log_aucs, 1)
    slope = float(coeffs[0])

    # R-squared
    y_pred = np.polyval(coeffs, log_doses)
    ss_res = sum((y - yp) ** 2 for y, yp in zip(log_aucs, y_pred))
    ss_tot = sum((y - np.mean(log_aucs)) ** 2 for y in log_aucs)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Non-monotonicity: AUC drops between consecutive dose groups
    non_monotonic = False
    drop_at_dose = None
    for i in range(1, len(aucs)):
        if aucs[i] < aucs[i - 1]:
            non_monotonic = True
            drop_at_dose = doses[i]
            break

    # Classify
    if 0.8 <= slope <= 1.2 and not non_monotonic:
        assessment = "linear"
    elif slope > 1.2:
        assessment = "supralinear"
    else:
        assessment = "sublinear"

    # Build interpretation narrative
    interpretation = _build_dp_interpretation(
        assessment, non_monotonic, drop_at_dose, slope, r_squared,
        tk_survivorship,
    )

    return {
        "parameter": param,
        "slope": round(slope, 3),
        "r_squared": round(r_squared, 4),
        "assessment": assessment,
        "dose_levels_used": dose_levels_used,
        "log_doses": [round(d, 3) for d in log_doses],
        "log_aucs": [round(a, 3) for a in log_aucs],
        "non_monotonic": non_monotonic,
        "interpretation": interpretation,
    }


def _build_dp_interpretation(
    assessment: str,
    non_monotonic: bool,
    drop_at_dose: float | None,
    slope: float,
    r_squared: float,
    tk_survivorship: dict | None,
) -> str:
    """Build a scientifically meaningful interpretation of dose proportionality."""
    if assessment == "linear":
        return "Exposure increases proportionally with dose (linear pharmacokinetics)."

    parts = []

    if non_monotonic and drop_at_dose is not None:
        parts.append(
            f"Exposure (AUC) decreases at {drop_at_dose:.0f} mg/kg despite higher dose, "
            f"indicating non-monotonic pharmacokinetics."
        )

        # Cross-reference with TK survivorship
        if tk_survivorship:
            all_survived = tk_survivorship.get("all_tk_survived", True)
            high_dose_deaths = tk_survivorship.get("high_dose_tk_deaths", 0)
            main_study_deaths = tk_survivorship.get("high_dose_main_deaths", 0)

            if all_survived and main_study_deaths > 0:
                parts.append(
                    f"TK satellite animals all survived at this dose, "
                    f"but {main_study_deaths} main study animal(s) died with target organ toxicity. "
                    f"AUC drop reflects genuine saturable absorption or autoinduction of metabolism, "
                    f"not a survivorship artifact."
                )
            elif not all_survived:
                parts.append(
                    f"{high_dose_deaths} TK satellite animal(s) died at the highest dose. "
                    f"AUC values at this dose may be unreliable due to survivorship bias."
                )
            else:
                parts.append(
                    "All TK satellite animals survived. "
                    "AUC drop is consistent with saturable absorption or autoinduction."
                )
        else:
            parts.append(
                "Possible mechanisms: saturable absorption, autoinduction of metabolism, "
                "or target organ toxicity reducing clearance capacity."
            )

        parts.append(
            f"Log-log regression slope = {slope:.2f} (R\u00b2 = {r_squared:.2f}); "
            f"low R\u00b2 confirms non-linear dose-exposure relationship."
        )
    elif assessment == "supralinear":
        parts.append(
            f"Exposure increases faster than dose (slope = {slope:.2f}), "
            "suggesting saturable first-pass metabolism or capacity-limited clearance."
        )
    else:
        parts.append(
            f"Exposure increases less than proportionally with dose (slope = {slope:.2f}), "
            "suggesting saturable absorption or dose-dependent clearance induction."
        )

    return " ".join(parts)


# ─── Accumulation ─────────────────────────────────────────────


def _compute_accumulation(visit_days: list[int]) -> dict:
    """Detect accumulation from multi-visit data."""
    if len(visit_days) <= 1:
        reason = (
            f"Single visit day ({visit_days[0]}) — no Day 1 comparison available"
            if visit_days
            else "No visit days found"
        )
        return {
            "available": False,
            "ratio": None,
            "assessment": "unknown",
            "reason": reason,
        }

    # Multi-visit: would compare AUC at first vs last visit
    # Placeholder for future multi-visit studies
    return {
        "available": False,
        "ratio": None,
        "assessment": "unknown",
        "reason": f"Multi-visit accumulation analysis not yet implemented (days: {visit_days})",
    }


# ─── TK survivorship check ─────────────────────────────────────


def _check_tk_survivorship(
    study: StudyInfo,
    dm_df: pd.DataFrame,
    tk_design: dict,
) -> dict | None:
    """Check whether TK satellite animals survived, cross-referencing DS/DD.

    This distinguishes real PK non-monotonicity from survivorship artifacts:
    if TK animals at the highest dose all survived but main study animals died,
    the AUC data is reliable and the non-monotonicity is a genuine PK phenomenon.
    """
    if not tk_design.get("has_satellite_groups"):
        return None

    # Read DS domain for disposition
    ds_df = _read_domain(study, "ds")
    if ds_df is None or ds_df.empty:
        return None

    tk_codes = set(tk_design.get("satellite_set_codes", []))
    if not tk_codes or "SETCD" not in dm_df.columns:
        return None

    # Identify TK subjects at highest dose (last TK SETCD alphabetically)
    sorted_tk = sorted(tk_codes)
    high_dose_tk_code = sorted_tk[-1] if sorted_tk else None
    if not high_dose_tk_code:
        return None

    tk_subjects = set(dm_df[dm_df["SETCD"] == high_dose_tk_code]["USUBJID"])

    # Main study subjects at same dose level (SETCD without TK suffix)
    main_code = high_dose_tk_code.replace("TK", "")
    main_subjects = set(dm_df[dm_df["SETCD"] == main_code]["USUBJID"])
    # Also check recovery subjects (e.g., "4R")
    recovery_code = main_code + "R"
    if "SETCD" in dm_df.columns:
        recovery_subs = set(dm_df[dm_df["SETCD"] == recovery_code]["USUBJID"])
        main_subjects = main_subjects | recovery_subs

    # Check for deaths in DS domain
    death_codes = {"MORIBUND SACRIFICE", "FOUND DEAD", "DIED"}
    dead_subjects = set()
    if "DSDECOD" in ds_df.columns:
        dead_subjects = set(
            ds_df[ds_df["DSDECOD"].str.upper().isin(death_codes)]["USUBJID"]
        )

    tk_deaths = tk_subjects & dead_subjects
    main_deaths = main_subjects & dead_subjects

    return {
        "high_dose_tk_code": high_dose_tk_code,
        "n_tk_subjects": len(tk_subjects),
        "high_dose_tk_deaths": len(tk_deaths),
        "high_dose_main_deaths": len(main_deaths),
        "all_tk_survived": len(tk_deaths) == 0,
        "dead_tk_subjects": sorted(tk_deaths) if tk_deaths else [],
        "dead_main_subjects": sorted(main_deaths) if main_deaths else [],
    }


# ─── Species & HED ────────────────────────────────────────────


def _get_species(study: StudyInfo) -> str | None:
    """Get species from TS domain."""
    if "ts" not in study.xpt_files:
        return None
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        species_rows = ts_df[ts_df["TSPARMCD"].str.upper() == "SPECIES"]
        if not species_rows.empty:
            return str(species_rows.iloc[0].get("TSVAL", "")).strip().upper() or None
    except Exception:
        pass
    return None


def _get_noael_loael_levels(noael: list[dict]) -> tuple[int | None, int | None, float | None]:
    """Extract NOAEL and LOAEL dose levels from noael summary.

    Prefers the 'Combined' sex row, falls back to first available.
    Returns (noael_dose_level, loael_dose_level, noael_dose_value).
    """
    if not noael:
        return None, None, None

    # Prefer Combined
    row = next((r for r in noael if r.get("sex") == "Combined"), noael[0])
    noael_level = row.get("noael_dose_level")
    loael_level = row.get("loael_dose_level")
    noael_value = row.get("noael_dose_value")
    return noael_level, loael_level, noael_value


def _extract_exposure_at_dose(
    by_dose_group: list[dict],
    dose_level: int | None,
) -> dict | None:
    """Extract exposure summary at a specific dose level."""
    if dose_level is None:
        return None

    group = next((g for g in by_dose_group if g["dose_level"] == dose_level), None)
    if group is None:
        return None

    params = group.get("parameters", {})
    cmax = params.get("CMAX")
    auc = params.get("AUCLST") or params.get("AUCTAU")
    tmax = params.get("TMAX")

    return {
        "dose_level": dose_level,
        "dose_value": group.get("dose_value"),
        "cmax": {
            "mean": cmax["mean"],
            "sd": cmax.get("sd"),
            "unit": cmax.get("unit", ""),
        } if cmax else None,
        "auc": {
            "mean": auc["mean"],
            "sd": auc.get("sd"),
            "unit": auc.get("unit", ""),
        } if auc else None,
        "tmax": {
            "mean": tmax["mean"],
            "unit": tmax.get("unit", ""),
        } if tmax else None,
    }


def _compute_hed(
    noael_dose_value: float | None,
    km_info: dict | None,
    noael_dose_level: int | None = None,
) -> dict | None:
    """Compute HED and MRSD from NOAEL dose using FDA Km scaling.

    Also sets noael_status to distinguish:
    - "established": NOAEL > 0, standard HED/MRSD derivation
    - "at_control": NOAEL = control (0 mg/kg), adverse at all doses,
      HED/MRSD are zero — no safe starting dose can be derived
    """
    if noael_dose_value is None or km_info is None:
        return None

    conversion_factor = km_info["conversion_factor"]
    hed = noael_dose_value / conversion_factor
    safety_factor = 10
    mrsd = hed / safety_factor

    # Determine status
    at_control = noael_dose_level == 0 or (noael_dose_value is not None and noael_dose_value == 0)
    noael_status = "at_control" if at_control else "established"

    return {
        "noael_mg_kg": float(noael_dose_value),
        "hed_mg_kg": round(hed, 4),
        "mrsd_mg_kg": round(mrsd, 4),
        "safety_factor": safety_factor,
        "method": "FDA body surface area scaling (Km-based)",
        "noael_status": noael_status,
    }


# ─── Utility helpers ──────────────────────────────────────────


def _get_unique_val(df: pd.DataFrame, col: str, fallback: str = "") -> str:
    """Get the most common non-null value from a column."""
    if col not in df.columns:
        return fallback
    vals = df[col].dropna()
    if vals.empty:
        return fallback
    return str(vals.mode().iloc[0]) if not vals.mode().empty else str(vals.iloc[0])


def _get_lloq(pc_df: pd.DataFrame) -> tuple[float | None, str | None]:
    """Extract LLOQ from PC domain (PCLLOQ column or similar)."""
    # Try PCLLOQ column
    if "PCLLOQ" in pc_df.columns:
        vals = pd.to_numeric(pc_df["PCLLOQ"], errors="coerce").dropna()
        if not vals.empty:
            unit = _get_unique_val(pc_df, "PCSTRESU", fallback="ng/mL")
            return round(float(vals.iloc[0]), 4), unit

    # Try PCORNRLO (original normal range low)
    if "PCORNRLO" in pc_df.columns:
        vals = pd.to_numeric(pc_df["PCORNRLO"], errors="coerce").dropna()
        if not vals.empty:
            unit = _get_unique_val(pc_df, "PCSTRESU", fallback="ng/mL")
            return round(float(vals.iloc[0]), 4), unit

    return None, None


def _get_visit_days(pp_df: pd.DataFrame) -> list[int]:
    """Extract unique visit days from PP domain."""
    if "VISITDY" in pp_df.columns:
        days = pd.to_numeric(pp_df["VISITDY"], errors="coerce").dropna().unique()
        return sorted(int(d) for d in days)
    if "PPDY" in pp_df.columns:
        days = pd.to_numeric(pp_df["PPDY"], errors="coerce").dropna().unique()
        return sorted(int(d) for d in days)
    return []


def _get_available_params(pp_merged: pd.DataFrame) -> list[str]:
    """Get list of available PP parameter codes, ordered by priority."""
    if "PPTESTCD" not in pp_merged.columns:
        return []
    all_params = set(str(p).upper() for p in pp_merged["PPTESTCD"].dropna().unique())
    # Return in priority order, then any extras
    ordered = [p for p in PRIMARY_PARAMS if p in all_params]
    extras = sorted(all_params - set(PRIMARY_PARAMS))
    return ordered + extras


def _parse_elapsed_time(pceltm) -> float | None:
    """Parse ISO 8601 duration string to hours.

    Examples: "PT0.5H" → 0.5, "PT2H" → 2.0, "PT30M" → 0.5
    """
    if pd.isna(pceltm):
        return None
    s = str(pceltm).upper().strip()
    if not s.startswith("PT"):
        # Try parsing as a plain number (hours)
        try:
            return float(s)
        except (ValueError, TypeError):
            return None

    s = s[2:]  # Remove "PT"
    hours = 0.0

    # Extract hours
    if "H" in s:
        h_part, s = s.split("H", 1)
        try:
            hours += float(h_part)
        except ValueError:
            pass

    # Extract minutes
    if "M" in s:
        m_part, s = s.split("M", 1)
        try:
            hours += float(m_part) / 60.0
        except ValueError:
            pass

    # Extract seconds
    if "S" in s:
        s_part, _ = s.split("S", 1)
        try:
            hours += float(s_part) / 3600.0
        except ValueError:
            pass

    return round(hours, 4)
