"""Cross-domain food efficiency computation (FW + BW).

Generates food_consumption_summary.json by cross-referencing FW with BW data.
Computes per-animal food efficiency ratio (BW gain / food consumed) and classifies
the BW-FW relationship using a 4-way assessment table.

Pattern follows tumor_summary.py (cross-domain generator module).
"""

import re

import numpy as np
import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.statistics import welch_t_test, cohens_d


# Threshold: FW decrease < 10% is "not meaningfully decreased" (within normal variation)
FW_DECREASE_THRESHOLD = -10.0


def build_food_consumption_summary(findings: list[dict], study: StudyInfo) -> dict:
    """Build cross-domain food consumption summary from pre-computed findings.

    Args:
        findings: All enriched findings from compute_all_findings().
        study: StudyInfo for reading raw FW/BW XPT data.
    """
    fw_findings = [f for f in findings if f.get("domain") == "FW"]
    bw_findings = [f for f in findings if f.get("domain") == "BW"]

    if not fw_findings:
        return {"available": False}

    # Read raw data for per-animal cross-reference
    fw_df = _read_fw_raw(study)
    bw_df = _read_bw_raw(study)

    if fw_df is None or bw_df is None or fw_df.empty or bw_df.empty:
        return {"available": False}

    # Get study route from TS domain
    study_route = _get_study_route(study)
    caloric_dilution_risk = _assess_caloric_dilution(study_route)

    # Check for water consumption data
    # numpy.bool_ fails identity checks; convert at boundary
    has_water = bool("FWTESTCD" in fw_df.columns and (fw_df["FWTESTCD"].str.upper() == "WC").any())

    # Filter to food consumption only (exclude water)
    if "FWTESTCD" in fw_df.columns:
        fw_food = fw_df[fw_df["FWTESTCD"].str.upper() == "FC"].copy()
        if fw_food.empty:
            # Maybe no FWTESTCD column distinction — use all FW data
            fw_food = fw_df.copy()
    else:
        fw_food = fw_df.copy()

    # Identify measurement periods from FW data
    periods = _compute_periods(fw_food, bw_df)

    # Overall assessment using the 4-way table
    overall = _compute_overall_assessment(fw_findings, bw_findings, periods)

    # Recovery analysis
    recovery = _compute_recovery(fw_findings, bw_findings, study)

    return {
        "available": True,
        "study_route": study_route,
        "caloric_dilution_risk": caloric_dilution_risk,
        "has_water_data": has_water,
        "periods": periods,
        "overall_assessment": overall,
        "water_consumption": None,
        "recovery": recovery,
    }


def _read_fw_raw(study: StudyInfo) -> pd.DataFrame | None:
    """Read raw FW XPT data."""
    if "fw" not in study.xpt_files:
        return None
    try:
        df, _ = read_xpt(study.xpt_files["fw"])
        df.columns = [c.upper() for c in df.columns]
        if "FWSTRESN" in df.columns:
            df["value"] = pd.to_numeric(df["FWSTRESN"], errors="coerce")
        elif "FWORRES" in df.columns:
            df["value"] = pd.to_numeric(df["FWORRES"], errors="coerce")
        else:
            return None
        # Parse day columns
        for col in ["FWDY", "FWENDY"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    except Exception:
        return None


def _read_bw_raw(study: StudyInfo) -> pd.DataFrame | None:
    """Read raw BW XPT data."""
    if "bw" not in study.xpt_files:
        return None
    try:
        df, _ = read_xpt(study.xpt_files["bw"])
        df.columns = [c.upper() for c in df.columns]
        if "BWSTRESN" in df.columns:
            df["value"] = pd.to_numeric(df["BWSTRESN"], errors="coerce")
        elif "BWORRES" in df.columns:
            df["value"] = pd.to_numeric(df["BWORRES"], errors="coerce")
        else:
            return None
        if "BWDY" in df.columns:
            df["BWDY"] = pd.to_numeric(df["BWDY"], errors="coerce")
        return df
    except Exception:
        return None


def _get_study_route(study: StudyInfo) -> str | None:
    """Get study route from TS domain."""
    if "ts" not in study.xpt_files:
        return None
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        route_rows = ts_df[ts_df["TSPARMCD"].str.upper() == "ROUTE"]
        if not route_rows.empty:
            return str(route_rows.iloc[0].get("TSVAL", "")).strip() or None
    except Exception:
        pass
    return None


def _assess_caloric_dilution(route: str | None) -> bool:
    """Dietary admin routes have caloric dilution risk."""
    if not route:
        return False
    upper = route.upper()
    return any(term in upper for term in ["DIETARY", "DIET", "FEED", "ADMIXTURE"])


def _get_dose_info(study: StudyInfo) -> pd.DataFrame | None:
    """Get per-subject dose_level + SEX from DM domain."""
    from services.analysis.dose_groups import build_dose_groups
    try:
        dg_data = build_dose_groups(study)
        subjects = dg_data["subjects"]
        return subjects[["USUBJID", "SEX", "dose_level", "is_recovery"]].copy()
    except Exception:
        return None


def _compute_periods(fw_df: pd.DataFrame, bw_df: pd.DataFrame) -> list[dict]:
    """Compute food efficiency per measurement period.

    For each unique (FWDY, FWENDY) pair, match FW animals to BW at period
    start/end, compute per-animal food efficiency, then aggregate to groups.
    """
    from services.analysis.dose_groups import build_dose_groups
    from services.study_discovery import StudyInfo

    # We need USUBJID + dose_level in both dataframes
    # FW should already have USUBJID; we need dose_level
    if "USUBJID" not in fw_df.columns or "USUBJID" not in bw_df.columns:
        return []

    # Get dose info - need to look at fw_df's study for dose groups
    # Build subject info from the intersection of FW and BW subjects
    fw_subjects = set(fw_df["USUBJID"].unique())
    bw_subjects = set(bw_df["USUBJID"].unique())
    common_subjects = fw_subjects & bw_subjects

    if not common_subjects:
        return []

    # Extract dose_level from BW findings or from DM
    # Use the already-merged dose info if available, otherwise merge from DM
    # We'll get dose info from a separate merge with DM
    # For now, use the approach from domain_stats: merge via subjects df

    # Identify periods from FW data
    if "FWDY" in fw_df.columns and "FWENDY" in fw_df.columns:
        fw_with_periods = fw_df.dropna(subset=["FWDY", "FWENDY"]).copy()
        period_keys = fw_with_periods.groupby(["FWDY", "FWENDY"]).size().reset_index()
        period_list = [(int(row["FWDY"]), int(row["FWENDY"])) for _, row in period_keys.iterrows()]
    elif "FWDY" in fw_df.columns:
        # No FWENDY — each FWDY is a point measurement
        days = sorted(fw_df["FWDY"].dropna().unique())
        if len(days) >= 2:
            period_list = [(int(days[0]), int(days[-1]))]
        elif len(days) == 1:
            period_list = [(int(days[0]), int(days[0]))]
        else:
            return []
    else:
        return []

    # Need subjects with dose_level info
    # Try to get it from the fw_df itself (if already merged)
    if "dose_level" not in fw_df.columns:
        # We need to get it from somewhere — this will be handled by the caller
        # For standalone operation, return empty
        return []

    periods = []
    for start_day, end_day in sorted(period_list):
        days_in_period = max(end_day - start_day, 1)

        # Get FW data for this period
        if "FWENDY" in fw_df.columns:
            period_fw = fw_df[
                (fw_df["FWDY"] == start_day) & (fw_df["FWENDY"] == end_day)
            ].copy()
        else:
            period_fw = fw_df[fw_df["FWDY"].between(start_day, end_day)].copy()

        period_fw = period_fw[period_fw["USUBJID"].isin(common_subjects)]
        if period_fw.empty:
            continue

        # Get BW at period start and end for each animal
        # Find nearest BW measurement to start_day and end_day
        bw_start = _nearest_bw(bw_df, start_day, common_subjects)
        bw_end = _nearest_bw(bw_df, end_day, common_subjects)

        # Per-animal food efficiency
        animal_fe = []
        for _, row in period_fw.iterrows():
            subj = row["USUBJID"]
            fw_val = row["value"]
            if pd.isna(fw_val) or fw_val <= 0:
                continue
            bw_s = bw_start.get(subj)
            bw_e = bw_end.get(subj)
            if bw_s is None or bw_e is None or pd.isna(bw_s) or pd.isna(bw_e):
                continue
            bw_gain = float(bw_e) - float(bw_s)
            total_food = float(fw_val) * days_in_period
            if total_food > 0:
                fe = bw_gain / total_food
                animal_fe.append({
                    "USUBJID": subj,
                    "dose_level": int(row["dose_level"]),
                    "sex": str(row.get("SEX", "U")),
                    "fw_g_per_day": float(fw_val),
                    "bw_gain": bw_gain,
                    "food_efficiency": fe,
                })

        if not animal_fe:
            continue

        fe_df = pd.DataFrame(animal_fe)

        # Aggregate by dose_level + sex
        by_dose_sex = []
        control_fe_values = {}  # sex -> values

        for (dose_level, sex), grp in fe_df.groupby(["dose_level", "sex"]):
            fe_vals = grp["food_efficiency"].values
            fw_vals = grp["fw_g_per_day"].values
            bw_vals = grp["bw_gain"].values

            entry = {
                "dose_level": int(dose_level),
                "sex": str(sex),
                "n": int(len(grp)),
                "mean_fw": round(float(np.mean(fw_vals)), 2),
                "mean_bw_gain": round(float(np.mean(bw_vals)), 2),
                "mean_food_efficiency": round(float(np.mean(fe_vals)), 4),
                "food_efficiency_sd": round(float(np.std(fe_vals, ddof=1)), 4) if len(fe_vals) > 1 else None,
                "food_efficiency_control": None,
                "food_efficiency_reduced": None,
                "fe_p_value": None,
                "fe_cohens_d": None,
                "fw_pct_change": None,
                "bw_pct_change": None,
            }

            if dose_level == 0:
                control_fe_values[str(sex)] = fe_vals

            by_dose_sex.append(entry)

        # Compute vs-control stats
        for entry in by_dose_sex:
            sex = entry["sex"]
            ctrl_vals = control_fe_values.get(sex)
            if ctrl_vals is not None and len(ctrl_vals) > 0:
                ctrl_mean_fe = float(np.mean(ctrl_vals))
                entry["food_efficiency_control"] = round(ctrl_mean_fe, 4)

                if entry["dose_level"] == 0:
                    entry["fw_pct_change"] = 0.0
                    entry["bw_pct_change"] = 0.0
                    entry["food_efficiency_reduced"] = False
                else:
                    # Compute pct change vs control
                    ctrl_fw_entry = next(
                        (e for e in by_dose_sex if e["dose_level"] == 0 and e["sex"] == sex),
                        None,
                    )
                    if ctrl_fw_entry and ctrl_fw_entry["mean_fw"] > 0:
                        entry["fw_pct_change"] = round(
                            ((entry["mean_fw"] - ctrl_fw_entry["mean_fw"]) / ctrl_fw_entry["mean_fw"]) * 100, 1
                        )
                    if ctrl_fw_entry and ctrl_fw_entry["mean_bw_gain"] != 0:
                        entry["bw_pct_change"] = round(
                            ((entry["mean_bw_gain"] - ctrl_fw_entry["mean_bw_gain"]) / abs(ctrl_fw_entry["mean_bw_gain"])) * 100, 1
                        )

                    # FE reduced: more than 20% below control
                    if ctrl_mean_fe > 0:
                        entry["food_efficiency_reduced"] = (
                            entry["mean_food_efficiency"] < ctrl_mean_fe * 0.8
                        )

                    # Welch t-test on FE values vs control
                    dose_fe = fe_df[
                        (fe_df["dose_level"] == entry["dose_level"]) &
                        (fe_df["sex"] == sex)
                    ]["food_efficiency"].values
                    if len(dose_fe) >= 2 and len(ctrl_vals) >= 2:
                        t_result = welch_t_test(dose_fe, ctrl_vals)
                        d_result = cohens_d(dose_fe, ctrl_vals)
                        entry["fe_p_value"] = round(t_result["p_value"], 6) if t_result["p_value"] is not None else None
                        entry["fe_cohens_d"] = round(d_result, 4) if d_result is not None else None

        periods.append({
            "start_day": start_day,
            "end_day": end_day,
            "days": days_in_period,
            "by_dose_sex": by_dose_sex,
        })

    return periods


def _nearest_bw(bw_df: pd.DataFrame, target_day: int, subjects: set) -> dict[str, float]:
    """Find nearest BW measurement to target_day for each subject."""
    bw_filtered = bw_df[bw_df["USUBJID"].isin(subjects)].copy()
    if "BWDY" not in bw_filtered.columns:
        return {}
    bw_filtered = bw_filtered.dropna(subset=["BWDY", "value"])
    bw_filtered["day_diff"] = (bw_filtered["BWDY"] - target_day).abs()
    # For each subject, pick the measurement closest to target_day
    idx = bw_filtered.groupby("USUBJID")["day_diff"].idxmin()
    nearest = bw_filtered.loc[idx]
    return dict(zip(nearest["USUBJID"].values, nearest["value"].values.astype(float)))


def _compute_overall_assessment(
    fw_findings: list[dict],
    bw_findings: list[dict],
    periods: list[dict],
) -> dict:
    """Classify using the 4-way assessment table.

    | BW down | FW down | FE reduced | Assessment |
    |---------|---------|------------|------------|
    | Yes     | Yes (proportional) | No  | secondary_to_food |
    | Yes     | No      | Yes        | primary_weight_loss |
    | Yes     | Yes (FW > BW)      | Yes | malabsorption |
    | No      | Yes     | No         | compensated |
    """
    # Determine BW and FW direction from high dose findings
    bw_decreased = _is_high_dose_decreased(bw_findings)
    fw_decreased = _is_high_dose_decreased(fw_findings, threshold=FW_DECREASE_THRESHOLD)

    # Determine FE reduced from periods
    fe_reduced = False
    for period in periods:
        for entry in period.get("by_dose_sex", []):
            if entry.get("food_efficiency_reduced"):
                fe_reduced = True
                break
        if fe_reduced:
            break

    # Classify
    if bw_decreased and fw_decreased and not fe_reduced:
        assessment = "secondary_to_food"
    elif bw_decreased and not fw_decreased and fe_reduced:
        assessment = "primary_weight_loss"
    elif bw_decreased and fw_decreased and fe_reduced:
        assessment = "malabsorption"
    elif not bw_decreased and fw_decreased and not fe_reduced:
        assessment = "compensated"
    elif not bw_decreased and not fw_decreased:
        assessment = "not_applicable"
    else:
        assessment = "indeterminate"

    # Build narrative
    narrative = _build_narrative(bw_decreased, fw_decreased, fe_reduced, assessment, periods, bw_findings, fw_findings)

    # Temporal onset: compare FW vs BW timecourse (simplified — limited FW timepoints)
    temporal_onset = _assess_temporal_onset(fw_findings, bw_findings)

    return {
        "bw_decreased": bw_decreased,
        "fw_decreased": fw_decreased,
        "fe_reduced": fe_reduced,
        "assessment": assessment,
        "temporal_onset": temporal_onset,
        "narrative": narrative,
    }


def _is_high_dose_decreased(findings: list[dict], threshold: float = -5.0) -> bool:
    """Check if the high dose group shows meaningful decrease vs control."""
    for f in findings:
        group_stats = f.get("group_stats", [])
        if len(group_stats) < 2:
            continue
        control = group_stats[0]
        high_dose = group_stats[-1]
        ctrl_mean = control.get("mean")
        high_mean = high_dose.get("mean")
        if ctrl_mean and high_mean and ctrl_mean > 0:
            pct = ((high_mean - ctrl_mean) / ctrl_mean) * 100
            if pct < threshold:
                return True
    return False


def _assess_temporal_onset(fw_findings: list[dict], bw_findings: list[dict]) -> str:
    """Simplified temporal onset comparison. FW has few timepoints vs BW's many."""
    # With only 2 FW measurement periods, we can't do true timecourse analysis
    # Compare overall directions
    fw_decreased = _is_high_dose_decreased(fw_findings, threshold=FW_DECREASE_THRESHOLD)
    bw_decreased = _is_high_dose_decreased(bw_findings)

    if not bw_decreased and not fw_decreased:
        return "not_applicable"

    # Check earliest BW timepoint with significant decrease
    bw_first_sig_day = None
    for f in sorted(bw_findings, key=lambda x: x.get("day") or 9999):
        direction = f.get("direction")
        min_p = f.get("min_p_adj")
        if direction == "down" and min_p is not None and min_p < 0.05:
            bw_first_sig_day = f.get("day")
            break

    fw_first_sig_day = None
    for f in sorted(fw_findings, key=lambda x: x.get("day") or 9999):
        direction = f.get("direction")
        min_p = f.get("min_p_adj")
        if direction == "down" and min_p is not None and min_p < 0.05:
            fw_first_sig_day = f.get("day")
            break

    if bw_first_sig_day is not None and fw_first_sig_day is not None:
        if bw_first_sig_day < fw_first_sig_day:
            return "bw_first"
        elif fw_first_sig_day < bw_first_sig_day:
            return "fw_first"
        else:
            return "simultaneous"

    return "unknown"


def _build_narrative(
    bw_decreased: bool,
    fw_decreased: bool,
    fe_reduced: bool,
    assessment: str,
    periods: list[dict],
    bw_findings: list[dict],
    fw_findings: list[dict],
) -> str:
    """Build human-readable narrative for the assessment."""
    # Get high-dose pct changes
    bw_pct = _get_high_dose_pct(bw_findings)
    fw_pct = _get_high_dose_pct(fw_findings)

    # Get food efficiency values from periods
    ctrl_fe = None
    high_fe = None
    for period in periods:
        for entry in period.get("by_dose_sex", []):
            if entry["dose_level"] == 0 and ctrl_fe is None:
                ctrl_fe = entry.get("mean_food_efficiency")
            elif entry.get("food_efficiency_reduced") and high_fe is None:
                high_fe = entry.get("mean_food_efficiency")
        # Use the longest period's data
        if ctrl_fe is not None:
            break

    parts = []
    if assessment == "primary_weight_loss":
        bw_str = f"{bw_pct:+.0f}%" if bw_pct is not None else "significantly"
        fw_str = f"{fw_pct:+.0f}%" if fw_pct is not None else "minimally"
        parts.append(f"Body weight decreased at high dose ({bw_str}) while food consumption was minimally affected ({fw_str}).")
        if ctrl_fe is not None and high_fe is not None:
            parts.append(f"Food efficiency markedly reduced ({high_fe:.2f} vs {ctrl_fe:.2f} control), indicating primary weight loss.")
        else:
            parts.append("Food efficiency reduced, indicating primary weight loss rather than reduced food intake.")
    elif assessment == "secondary_to_food":
        parts.append("Both body weight and food consumption decreased proportionally.")
        parts.append("Food efficiency preserved, suggesting weight loss is secondary to reduced food intake.")
    elif assessment == "malabsorption":
        parts.append("Both body weight and food consumption decreased, but food efficiency is also reduced.")
        parts.append("This pattern suggests malabsorption or metabolic disruption beyond simple palatability.")
    elif assessment == "compensated":
        parts.append("Food consumption decreased but body weight maintained.")
        parts.append("Animals appear to compensate, suggesting the decrease may be palatability-related without systemic impact.")
    elif assessment == "not_applicable":
        parts.append("Neither body weight nor food consumption meaningfully decreased at high dose.")
    else:
        parts.append("BW-FW relationship is indeterminate from available data.")

    return " ".join(parts)


def _get_high_dose_pct(findings: list[dict]) -> float | None:
    """Get pct change at high dose from the latest timepoint finding."""
    latest = None
    for f in findings:
        day = f.get("day") or 0
        if latest is None or day > (latest.get("day") or 0):
            latest = f
    if not latest:
        return None
    group_stats = latest.get("group_stats", [])
    if len(group_stats) < 2:
        return None
    ctrl_mean = group_stats[0].get("mean")
    high_mean = group_stats[-1].get("mean")
    if ctrl_mean and high_mean and ctrl_mean > 0:
        return ((high_mean - ctrl_mean) / ctrl_mean) * 100
    return None


def _get_epoch_boundaries(study: StudyInfo) -> dict:
    """Derive epoch day boundaries from SE domain, falling back to TE.

    Returns {treatment_end: int, recovery_start: int | None}.
    """
    # Try SE first — per-subject element dates are the most precise source
    if "se" in study.xpt_files and "dm" in study.xpt_files:
        try:
            se_df, _ = read_xpt(study.xpt_files["se"])
            se_df.columns = [c.upper() for c in se_df.columns]
            dm_df, _ = read_xpt(study.xpt_files["dm"])
            dm_df.columns = [c.upper() for c in dm_df.columns]

            if "ETCD" in se_df.columns and "SEENDTC" in se_df.columns:
                se_m = se_df.merge(dm_df[["USUBJID", "RFSTDTC"]], on="USUBJID", how="left")
                se_m["SEENDTC_dt"] = pd.to_datetime(se_m["SEENDTC"], errors="coerce")
                se_m["SESTDTC_dt"] = pd.to_datetime(se_m["SESTDTC"], errors="coerce")
                se_m["RFSTDTC_dt"] = pd.to_datetime(se_m["RFSTDTC"], errors="coerce")
                se_m["end_day"] = (se_m["SEENDTC_dt"] - se_m["RFSTDTC_dt"]).dt.days + 1
                se_m["start_day"] = (se_m["SESTDTC_dt"] - se_m["RFSTDTC_dt"]).dt.days + 1

                trt = se_m[se_m["ETCD"].str.upper().str.startswith("TRT")]
                rec = se_m[se_m["ETCD"].str.upper() == "REC"]

                treatment_end = int(trt["end_day"].max()) if not trt.empty else None
                recovery_start = int(rec["start_day"].min()) if not rec.empty else None

                if treatment_end is not None:
                    return {"treatment_end": treatment_end, "recovery_start": recovery_start}
        except Exception:
            pass

    # Fallback: TE domain (planned durations)
    if "te" in study.xpt_files:
        try:
            te_df, _ = read_xpt(study.xpt_files["te"])
            te_df.columns = [c.upper() for c in te_df.columns]
            if "ETCD" in te_df.columns and "TEDUR" in te_df.columns:
                treatment_days = None
                for _, row in te_df.iterrows():
                    etcd = str(row.get("ETCD", "")).upper().strip()
                    dur = str(row.get("TEDUR", "")).strip()
                    m = re.match(r"P(\d+)([DWMY])", dur)
                    if not m:
                        continue
                    n, unit = int(m.group(1)), m.group(2)
                    days = {"D": n, "W": n * 7, "M": n * 30, "Y": n * 365}.get(unit)
                    if days and etcd.startswith("TRT"):
                        if treatment_days is None or days > treatment_days:
                            treatment_days = days
                if treatment_days:
                    return {"treatment_end": treatment_days, "recovery_start": None}
        except Exception:
            pass

    return {"treatment_end": 91, "recovery_start": None}


def _label_periods(periods: list[dict], study: StudyInfo) -> None:
    """Add epoch and label keys to each period dict in-place.

    Uses SE domain for epoch boundaries (treatment_end, recovery_start),
    falling back to TE durations.
    """
    bounds = _get_epoch_boundaries(study)
    treatment_end = bounds["treatment_end"]
    recovery_start = bounds.get("recovery_start")

    for p in periods:
        start_day = p["start_day"]
        end_day = p["end_day"]
        days = end_day - start_day
        weeks = max(round(days / 7), 1)

        if recovery_start and start_day >= recovery_start - 1:
            p["epoch"] = "recovery"
            p["label"] = f"Recovery ({weeks} wk)"
        else:
            p["epoch"] = "treatment"
            if end_day < treatment_end * 0.6:
                p["label"] = f"Treatment \u2014 interim ({weeks} wk)"
            else:
                p["label"] = f"Treatment \u2014 terminal ({weeks} wk)"


def _compute_recovery(
    fw_findings: list[dict],
    bw_findings: list[dict],
    study: StudyInfo,
) -> dict | None:
    """Analyze FW and BW during recovery period (if recovery subjects exist)."""
    from services.analysis.dose_groups import build_dose_groups

    try:
        dg_data = build_dose_groups(study)
        subjects = dg_data["subjects"]
    except Exception:
        return None

    recovery_subs = subjects[subjects["is_recovery"]].copy()
    if recovery_subs.empty:
        return None

    # Read raw data for recovery subjects
    fw_df = _read_fw_raw(study)
    bw_df = _read_bw_raw(study)
    if fw_df is None or bw_df is None:
        return None

    rec_ids = set(recovery_subs["USUBJID"])

    # Check FW recovery: are recovery FW values close to control?
    fw_rec = fw_df[fw_df["USUBJID"].isin(rec_ids)].copy()
    bw_rec = bw_df[bw_df["USUBJID"].isin(rec_ids)].copy()

    # Merge dose info
    fw_rec = fw_rec.merge(recovery_subs[["USUBJID", "dose_level"]], on="USUBJID", how="inner")
    bw_rec = bw_rec.merge(recovery_subs[["USUBJID", "dose_level"]], on="USUBJID", how="inner")

    fw_recovered = _check_recovery_status(fw_rec)
    bw_recovered = _check_recovery_status(bw_rec)

    # Build interpretation
    if fw_recovered and not bw_recovered:
        interp = "Food consumption recovered but body weight remained depressed, consistent with residual organ damage."
    elif fw_recovered and bw_recovered:
        interp = "Both food consumption and body weight recovered, suggesting reversible effects."
    elif not fw_recovered and not bw_recovered:
        interp = "Neither food consumption nor body weight recovered during the recovery period."
    elif not fw_recovered and bw_recovered:
        interp = "Body weight recovered despite persistent food consumption decrease."
    else:
        interp = "Recovery data available but assessment indeterminate."

    return {
        "available": True,
        "fw_recovered": fw_recovered,
        "bw_recovered": bw_recovered,
        "interpretation": interp,
    }


def _check_recovery_status(rec_df: pd.DataFrame) -> bool:
    """Check if recovery subjects' values are within 10% of control."""
    if rec_df.empty or "dose_level" not in rec_df.columns:
        return False

    ctrl_vals = rec_df[rec_df["dose_level"] == 0]["value"].dropna()
    high_dose_level = rec_df["dose_level"].max()
    if high_dose_level == 0:
        return True
    high_vals = rec_df[rec_df["dose_level"] == high_dose_level]["value"].dropna()

    if ctrl_vals.empty or high_vals.empty:
        return False

    ctrl_mean = float(ctrl_vals.mean())
    high_mean = float(high_vals.mean())

    if ctrl_mean == 0:
        return True

    pct_diff = abs((high_mean - ctrl_mean) / ctrl_mean) * 100
    return pct_diff < 10.0


def build_food_consumption_summary_with_subjects(
    findings: list[dict],
    study: StudyInfo,
    early_death_subjects: dict[str, str] | None = None,
) -> dict:
    """Full pipeline version: builds dose groups internally, merges subjects,
    then delegates to build_food_consumption_summary.

    This is the entry point called from generate.py.

    When early_death_subjects is provided, those subjects are excluded from
    period computation so moribund sacrifices don't create spurious
    single-subject periods.
    """
    from services.analysis.dose_groups import build_dose_groups

    # Get subjects for dose_level merge
    dg_data = build_dose_groups(study)
    subjects = dg_data["subjects"]
    main_subs = subjects[~subjects["is_recovery"]].copy()

    fw_findings = [f for f in findings if f.get("domain") == "FW"]
    bw_findings = [f for f in findings if f.get("domain") == "BW"]

    if not fw_findings:
        return {"available": False}

    # Read raw data
    fw_df = _read_fw_raw(study)
    bw_df = _read_bw_raw(study)

    if fw_df is None or bw_df is None or fw_df.empty or bw_df.empty:
        return {"available": False}

    # Merge subject info into FW
    fw_df = fw_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")
    bw_df = bw_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")

    # Get study route
    study_route = _get_study_route(study)
    caloric_dilution_risk = _assess_caloric_dilution(study_route)

    # Check for water
    # numpy.bool_ fails identity checks; convert at boundary
    has_water = bool("FWTESTCD" in fw_df.columns and (fw_df["FWTESTCD"].str.upper() == "WC").any())

    # Filter to FC only
    if "FWTESTCD" in fw_df.columns:
        fw_food = fw_df[fw_df["FWTESTCD"].str.upper() == "FC"].copy()
        if fw_food.empty:
            fw_food = fw_df.copy()
    else:
        fw_food = fw_df.copy()

    # Exclude early-death subjects' truncated-period FW records only.
    # Moribund sacrifices create anomalous (FWDY, FWENDY) pairs (e.g. (1,90)
    # instead of the cohort's (1,92)).  Their valid records for standard
    # periods (e.g. interim (1,29)) are preserved.  BW is untouched — point
    # measurements are fine for matching any period.
    if early_death_subjects and "FWDY" in fw_food.columns and "FWENDY" in fw_food.columns:
        excluded = set(early_death_subjects.keys())
        pair_counts = fw_food.groupby(["FWDY", "FWENDY"])["USUBJID"].nunique()
        total_subjects = fw_food["USUBJID"].nunique()
        threshold = max(3, total_subjects * 0.05)
        anomalous_pairs = {
            idx for idx, n in pair_counts.items() if n < threshold
        }
        if anomalous_pairs:
            is_early = fw_food["USUBJID"].isin(excluded)
            is_anomalous = fw_food[["FWDY", "FWENDY"]].apply(tuple, axis=1).isin(anomalous_pairs)
            fw_food = fw_food[~(is_early & is_anomalous)].copy()

    # Compute periods with merged data
    periods = _compute_periods(fw_food, bw_df)

    # Label periods with epoch names from TE domain
    _label_periods(periods, study)

    # Overall assessment
    overall = _compute_overall_assessment(fw_findings, bw_findings, periods)

    # Recovery
    recovery = _compute_recovery(fw_findings, bw_findings, study)

    return {
        "available": True,
        "study_route": study_route,
        "caloric_dilution_risk": caloric_dilution_risk,
        "has_water_data": has_water,
        "periods": periods,
        "overall_assessment": overall,
        "water_consumption": None,
        "recovery": recovery,
    }
