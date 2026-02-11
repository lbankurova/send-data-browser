"""Build enriched subject_context table from SEND trial design domains.

Reads DM, EX, TX, TA, TE, TS, DS to produce a denormalized per-subject
DataFrame plus study metadata, arm structure, and detected issues.

Dose resolution cascade: EX (preferred) → TX (fallback) → ARM parsing (last resort).
"""

from __future__ import annotations

import logging
import re
from typing import Any

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.dose_groups import build_dose_groups

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────

def _safe_read(study: StudyInfo, domain: str) -> pd.DataFrame | None:
    """Read an XPT domain, return None if missing."""
    key = domain.lower()
    if key not in study.xpt_files:
        return None
    try:
        df, _ = read_xpt(study.xpt_files[key])
        df.columns = [c.upper() for c in df.columns]
        return df
    except Exception as e:
        logger.warning("Failed to read %s for %s: %s", domain, study.study_id, e)
        return None


def _str_col(df: pd.DataFrame, col: str) -> pd.Series:
    """Get a string column, stripped, with NaN as empty string."""
    if col not in df.columns:
        return pd.Series("", index=df.index)
    return df[col].astype(str).str.strip().replace("nan", "")


def _float_col(df: pd.DataFrame, col: str) -> pd.Series:
    """Get a numeric column, coercing errors to NaN."""
    if col not in df.columns:
        return pd.Series(float("nan"), index=df.index)
    return pd.to_numeric(df[col], errors="coerce")


# ── TS metadata extraction ────────────────────────────────────────────────

_TS_PARAMS = {
    "SPECIES": "species",
    "STRAIN": "strain",
    "ROUTE": "route",
    "SSTDTC": "study_start",
    "SENDTC": "study_end",
    "SSTYP": "study_type",
    "SDESIGN": "study_design",
    "TRTV": "vehicle",
    "SPONSOR": "sponsor",
    "TESTCD": "test_article",
}


def _parse_ts(ts_df: pd.DataFrame | None) -> dict[str, str | None]:
    """Extract study-level metadata from TS domain."""
    meta: dict[str, str | None] = {v: None for v in _TS_PARAMS.values()}
    if ts_df is None:
        return meta
    for _, row in ts_df.iterrows():
        parm = str(row.get("TSPARMCD", "")).strip().upper()
        val = str(row.get("TSVAL", "")).strip()
        if parm in _TS_PARAMS and val and val != "nan":
            meta[_TS_PARAMS[parm]] = val
    return meta


# ── TA + TE parsing ──────────────────────────────────────────────────────

def _parse_arm_structure(
    ta_df: pd.DataFrame | None,
    te_df: pd.DataFrame | None,
) -> dict[str, Any]:
    """Build arm_structure: ARMCD → list of {etcd, epoch, element, tedur, testrl}.

    Also returns epoch-level flags for recovery detection.
    """
    structure: dict[str, list[dict]] = {}
    te_map: dict[str, dict] = {}  # ETCD → {element, tedur, testrl}

    if te_df is not None:
        for _, row in te_df.iterrows():
            etcd = str(row.get("ETCD", "")).strip()
            if not etcd or etcd == "nan":
                continue
            te_map[etcd] = {
                "element": str(row.get("ELEMENT", "")).strip(),
                "tedur": str(row.get("TEDUR", "")).strip(),
                "testrl": str(row.get("TESTRL", "")).strip(),
            }

    if ta_df is not None:
        for _, row in ta_df.iterrows():
            armcd = str(row.get("ARMCD", "")).strip()
            if not armcd or armcd == "nan":
                continue
            etcd = str(row.get("ETCD", "")).strip()
            epoch = str(row.get("EPOCH", "")).strip()
            taetord = row.get("TAETORD")
            try:
                taetord = int(taetord)
            except (ValueError, TypeError):
                taetord = 0

            entry = {
                "etcd": etcd,
                "epoch": epoch,
                "taetord": taetord,
                **te_map.get(etcd, {"element": "", "tedur": "", "testrl": ""}),
            }
            structure.setdefault(armcd, []).append(entry)

        # Sort by taetord within each arm
        for armcd in structure:
            structure[armcd].sort(key=lambda e: e["taetord"])

    return structure


def _arm_has_recovery(epochs: list[dict]) -> bool:
    """Check if an arm's epoch list includes a recovery phase."""
    for ep in epochs:
        if "recovery" in ep.get("epoch", "").lower():
            return True
        if "recovery" in ep.get("element", "").lower():
            return True
    return False


def _parse_tedur_days(tedur: str) -> int | None:
    """Parse ISO 8601 duration string (e.g., P28D, P4W) to days."""
    if not tedur or tedur == "nan":
        return None
    m = re.match(r"P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?", tedur, re.IGNORECASE)
    if not m:
        return None
    years = int(m.group(1) or 0)
    months = int(m.group(2) or 0)
    weeks = int(m.group(3) or 0)
    days = int(m.group(4) or 0)
    return years * 365 + months * 30 + weeks * 7 + days


# ── EX domain parsing (Method 1) ─────────────────────────────────────────

def _parse_ex(ex_df: pd.DataFrame | None) -> dict[str, dict]:
    """Parse EX domain into per-USUBJID dose information.

    Returns: {USUBJID: {dose, dose_unit, route, frequency, dose_varies, dose_list}}
    """
    if ex_df is None:
        return {}

    result: dict[str, dict] = {}
    for usubjid, grp in ex_df.groupby("USUBJID"):
        usubjid = str(usubjid).strip()
        doses = _float_col(grp, "EXDOSE")
        units = _str_col(grp, "EXDOSU")
        routes = _str_col(grp, "EXROUTE")
        freqs = _str_col(grp, "EXFREQ")
        treatments = _str_col(grp, "EXTRT")

        # Filter out NaN doses
        valid_doses = doses.dropna()
        if valid_doses.empty:
            continue

        # Unique non-zero doses (for escalation detection)
        nonzero_doses = valid_doses[valid_doses != 0].unique().tolist()
        dose_varies = len(nonzero_doses) > 1

        # Take mode (most common dose) as the representative dose
        dose_val = float(valid_doses.mode().iloc[0]) if not valid_doses.mode().empty else float(valid_doses.iloc[0])

        # Unit, route, frequency — take first non-empty
        unit = next((u for u in units if u and u != "nan"), None)
        route = next((r for r in routes if r and r != "nan"), None)
        freq = next((f for f in freqs if f and f != "nan"), None)
        trt = next((t for t in treatments if t and t != "nan"), None)

        # Control detection from EX
        is_control_ex = (dose_val == 0) or (
            trt is not None and any(kw in trt.lower() for kw in ("vehicle", "control"))
        )

        result[usubjid] = {
            "dose": dose_val,
            "dose_unit": unit,
            "route": route,
            "frequency": freq,
            "is_control_ex": is_control_ex,
            "dose_varies": dose_varies,
            "dose_list": sorted(set(valid_doses.tolist())),
        }

    return result


# ── ARM label parsing (Method 3 — last resort) ───────────────────────────

_DOSE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|µg|ug|g|mL)\/?(\w*)", re.IGNORECASE)


def _parse_dose_from_arm(arm_label: str) -> tuple[float | None, str | None]:
    """Try to extract a numeric dose from an ARM label. Returns (dose, unit) or (None, None)."""
    m = _DOSE_RE.search(arm_label)
    if m:
        dose = float(m.group(1))
        unit = m.group(2)
        if m.group(3):
            unit += "/" + m.group(3)
        return dose, unit
    return None, None


# ── Issue detection ───────────────────────────────────────────────────────

def _detect_issues(
    dm_df: pd.DataFrame,
    ta_df: pd.DataFrame | None,
    tx_df: pd.DataFrame | None,
    ts_meta: dict[str, str | None],
    ex_info: dict[str, dict],
    arm_structure: dict[str, list[dict]],
    subject_context: pd.DataFrame,
) -> list[dict]:
    """Detect study design issues (SD-001 through SD-007)."""
    issues: list[dict] = []

    dm_armcds = set(_str_col(dm_df, "ARMCD").unique()) - {"", "nan"}
    ta_armcds = set(arm_structure.keys()) if arm_structure else set()

    # SD-001: Orphaned subjects — DM ARMCD not in TA
    if ta_df is not None and ta_armcds:
        orphan_armcds = dm_armcds - ta_armcds
        for armcd in orphan_armcds:
            affected = dm_df[_str_col(dm_df, "ARMCD") == armcd]["USUBJID"].tolist()
            if affected:
                issues.append({
                    "rule": "SD-001",
                    "armcd": armcd,
                    "subjects": [str(s) for s in affected],
                    "n": len(affected),
                    "valid_armcds": sorted(ta_armcds),
                })

    # SD-002: Empty arms — TA ARMCD with no subjects in DM
    if ta_armcds:
        empty_arms = ta_armcds - dm_armcds
        for armcd in empty_arms:
            # Get ARM label from TA
            arm_label = ""
            if ta_df is not None:
                arm_rows = ta_df[_str_col(ta_df, "ARMCD") == armcd]
                if "ARM" in arm_rows.columns and len(arm_rows) > 0:
                    arm_label = str(arm_rows["ARM"].iloc[0]).strip()
            issues.append({
                "rule": "SD-002",
                "armcd": armcd,
                "arm": arm_label,
            })

    # SD-003: Ambiguous control status
    control_subjects = subject_context[subject_context["IS_CONTROL"] == True]  # noqa: E712
    non_control_zero_dose = subject_context[
        (subject_context["DOSE"] == 0) & (subject_context["IS_CONTROL"] == False)  # noqa: E712
    ]
    if len(non_control_zero_dose) > 0:
        issues.append({
            "rule": "SD-003",
            "variant": "a",
            "subjects": non_control_zero_dose["USUBJID"].tolist(),
            "n": len(non_control_zero_dose),
            "arm": non_control_zero_dose["ARM"].iloc[0] if len(non_control_zero_dose) > 0 else "",
        })

    control_nonzero = subject_context[
        (subject_context["IS_CONTROL"] == True) & (subject_context["DOSE"] > 0)  # noqa: E712
    ]
    if len(control_nonzero) > 0:
        issues.append({
            "rule": "SD-003",
            "variant": "b",
            "subjects": control_nonzero["USUBJID"].tolist(),
            "n": len(control_nonzero),
            "arm": control_nonzero["ARM"].iloc[0] if len(control_nonzero) > 0 else "",
            "dose": float(control_nonzero["DOSE"].iloc[0]),
        })

    if len(control_subjects) == 0:
        # Collect available arm labels for suggestion dropdown
        available_arms = []
        if "ARM" in dm_df.columns:
            available_arms = sorted(set(_str_col(dm_df, "ARM").unique()) - {"", "nan"})
        issues.append({
            "rule": "SD-003",
            "variant": "c",
            "available_arms": available_arms,
        })

    # SD-004: Missing TS parameters
    required_ts = ["species", "strain", "route", "study_start", "study_type"]
    missing_ts = [p for p in required_ts if not ts_meta.get(p)]
    if missing_ts:
        # Map back to TSPARMCD names for the message
        reverse_map = {v: k for k, v in _TS_PARAMS.items()}
        # Try to infer missing values from other domains
        inferred: dict[str, str] = {}
        if "species" in missing_ts and "SPECIES" in dm_df.columns:
            vals = set(_str_col(dm_df, "SPECIES").unique()) - {"", "nan"}
            if len(vals) == 1:
                inferred["SPECIES"] = vals.pop()
        if "strain" in missing_ts and "STRAIN" in dm_df.columns:
            vals = set(_str_col(dm_df, "STRAIN").unique()) - {"", "nan"}
            if len(vals) == 1:
                inferred["STRAIN"] = vals.pop()
        if "route" in missing_ts:
            for eid, edata in ex_info.items():
                route = edata.get("route")
                if route:
                    inferred["ROUTE"] = route
                    break
        issues.append({
            "rule": "SD-004",
            "missing": [reverse_map.get(m, m) for m in missing_ts],
            "inferred": inferred,
        })

    # SD-005: Dose inconsistency within subject
    escalation_subjects = []
    for usubjid, info in ex_info.items():
        if info.get("dose_varies"):
            escalation_subjects.append({
                "usubjid": usubjid,
                "doses": info["dose_list"],
                "unit": info.get("dose_unit", ""),
            })
    if escalation_subjects:
        issues.append({
            "rule": "SD-005",
            "subjects": escalation_subjects,
            "n": len(escalation_subjects),
        })

    # SD-006: Orphaned sets — TX SETCD with no subjects in DM
    if tx_df is not None and "SETCD" in tx_df.columns:
        tx_setcds = set(_str_col(tx_df, "SETCD").unique()) - {"", "nan"}
        dm_setcds = set(_str_col(dm_df, "SETCD").unique()) - {"", "nan"} if "SETCD" in dm_df.columns else set()
        orphan_sets = tx_setcds - dm_setcds
        for setcd in orphan_sets:
            # Get SET label
            set_rows = tx_df[_str_col(tx_df, "SETCD") == setcd]
            set_label = ""
            if "SET" in set_rows.columns and len(set_rows) > 0:
                set_label = str(set_rows["SET"].iloc[0]).strip()
            issues.append({
                "rule": "SD-006",
                "setcd": setcd,
                "set": set_label,
            })

    # SD-007: ARM/ARMCD mismatch across DM and TA
    if ta_df is not None and "ARM" in ta_df.columns and "ARMCD" in ta_df.columns:
        ta_arm_map: dict[str, str] = {}
        for _, row in ta_df.iterrows():
            armcd = str(row.get("ARMCD", "")).strip()
            arm = str(row.get("ARM", "")).strip()
            if armcd and armcd != "nan" and arm and arm != "nan":
                if armcd not in ta_arm_map:
                    ta_arm_map[armcd] = arm

        dm_arm_map: dict[str, str] = {}
        for _, row in dm_df.iterrows():
            armcd = str(row.get("ARMCD", "")).strip()
            arm = str(row.get("ARM", "")).strip()
            if armcd and armcd != "nan" and arm and arm != "nan":
                if armcd not in dm_arm_map:
                    dm_arm_map[armcd] = arm

        for armcd in dm_arm_map:
            if armcd in ta_arm_map and dm_arm_map[armcd] != ta_arm_map[armcd]:
                affected = dm_df[_str_col(dm_df, "ARMCD") == armcd]["USUBJID"].tolist()
                issues.append({
                    "rule": "SD-007",
                    "armcd": armcd,
                    "dm_arm": dm_arm_map[armcd],
                    "ta_arm": ta_arm_map[armcd],
                    "subjects": [str(s) for s in affected],
                })

    return issues


# ── Main builder ──────────────────────────────────────────────────────────

def build_subject_context(study: StudyInfo) -> dict:
    """Build enriched subject_context table from SEND trial design domains.

    Returns dict with:
      - subject_context: pd.DataFrame (one row per USUBJID)
      - study_metadata: dict (TS-derived key-value pairs)
      - arm_structure: dict (ARMCD → epochs)
      - dose_method: str ("EX" | "TX" | "ARM")
      - issues: list[dict] (detected study design issues)
    """
    # Load domains
    dm_df = _safe_read(study, "DM")
    if dm_df is None:
        raise ValueError(f"DM domain required but not found for {study.study_id}")

    ex_df = _safe_read(study, "EX")
    tx_df = _safe_read(study, "TX")
    ta_df = _safe_read(study, "TA")
    te_df = _safe_read(study, "TE")
    ts_df = _safe_read(study, "TS")
    ds_df = _safe_read(study, "DS")

    # Step 1: Parse TS → study_metadata
    ts_meta = _parse_ts(ts_df)

    # Step 2: Parse TA + TE → arm_structure
    arm_structure = _parse_arm_structure(ta_df, te_df)

    # Step 3: Get existing dose group data (DM + TX)
    dg_data = build_dose_groups(study)
    subjects_df = dg_data["subjects"]  # USUBJID, SEX, ARMCD, dose_level, is_recovery, is_satellite
    tx_map = dg_data["tx_map"]

    # Step 4: Parse EX domain
    ex_info = _parse_ex(ex_df)

    # Step 5: Dose resolution cascade
    dose_method = "TX"  # default (what build_dose_groups already used)
    ex_subject_count = 0
    non_ex_subject_count = 0

    if ex_info:
        # Method 1: EX domain preferred
        dose_method = "EX"
        subjects_df["DOSE"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("dose", float("nan"))
        )
        subjects_df["DOSE_UNIT"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("dose_unit")
        )
        subjects_df["ROUTE"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("route")
        )
        subjects_df["FREQUENCY"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("frequency")
        )
        subjects_df["DOSE_VARIES"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("dose_varies", False)
        )

        # Track counts for provenance
        has_ex = subjects_df["DOSE"].notna()
        ex_subject_count = int(has_ex.sum())
        non_ex_subject_count = len(subjects_df) - ex_subject_count

        # Fill gaps from TX for subjects not in EX
        if not has_ex.all() and tx_map:
            dose_method = "MIXED"
    else:
        # Method 2: TX-derived (already in dg_data)
        subjects_df["DOSE"] = subjects_df["ARMCD"].map(
            lambda a: tx_map.get(str(a).strip(), {}).get("dose_value")
        )
        subjects_df["DOSE_UNIT"] = subjects_df["ARMCD"].map(
            lambda a: tx_map.get(str(a).strip(), {}).get("dose_unit")
        )
        subjects_df["ROUTE"] = None
        subjects_df["FREQUENCY"] = None
        subjects_df["DOSE_VARIES"] = False

    # Fill DOSE from TX for any remaining NaN (Method 2 fallback)
    if tx_map:
        mask = subjects_df["DOSE"].isna()
        if mask.any():
            subjects_df.loc[mask, "DOSE"] = subjects_df.loc[mask, "ARMCD"].map(
                lambda a: tx_map.get(str(a).strip(), {}).get("dose_value")
            )
            subjects_df.loc[mask, "DOSE_UNIT"] = subjects_df.loc[mask, "ARMCD"].map(
                lambda a: tx_map.get(str(a).strip(), {}).get("dose_unit")
            )

    # Method 3: ARM label parsing for remaining NaN
    arm_parsed = False
    mask = subjects_df["DOSE"].isna()
    if mask.any():
        for idx in subjects_df[mask].index:
            armcd = str(subjects_df.loc[idx, "ARMCD"]).strip()
            arm_label = tx_map.get(armcd, {}).get("label", "")
            parsed_dose, parsed_unit = _parse_dose_from_arm(arm_label)
            if parsed_dose is not None:
                subjects_df.loc[idx, "DOSE"] = parsed_dose
                subjects_df.loc[idx, "DOSE_UNIT"] = parsed_unit
                arm_parsed = True
        if arm_parsed and dose_method == "TX":
            dose_method = "ARM"

    # Fill remaining NaN doses with 0
    subjects_df["DOSE"] = subjects_df["DOSE"].fillna(0)

    # Step 6: Control detection
    subjects_df["IS_CONTROL"] = False
    # From EX
    if ex_info:
        subjects_df["IS_CONTROL"] = subjects_df["USUBJID"].map(
            lambda u: ex_info.get(str(u).strip(), {}).get("is_control_ex", False)
        )
    # From TX/ARM — dose_level 0 from build_dose_groups
    subjects_df.loc[subjects_df["dose_level"] == 0, "IS_CONTROL"] = True
    # From ARM label
    for idx in subjects_df.index:
        armcd = str(subjects_df.loc[idx, "ARMCD"]).strip()
        label = tx_map.get(armcd, {}).get("label", "").lower()
        if "control" in label or "vehicle" in label:
            subjects_df.loc[idx, "IS_CONTROL"] = True

    # Step 7: Enrich with DM columns
    dm_cols = ["USUBJID", "STUDYID", "ARM", "ARMCD", "SEX"]
    if "SETCD" in dm_df.columns:
        dm_cols.append("SETCD")
    if "SPECIES" in dm_df.columns:
        dm_cols.append("SPECIES")
    if "STRAIN" in dm_df.columns:
        dm_cols.append("STRAIN")

    dm_subset = dm_df[[c for c in dm_cols if c in dm_df.columns]].copy()
    for c in dm_subset.columns:
        dm_subset[c] = dm_subset[c].astype(str).str.strip().replace("nan", "")

    # Merge DM fields onto subjects
    subjects_df["USUBJID_str"] = subjects_df["USUBJID"].astype(str).str.strip()
    dm_subset["USUBJID_str"] = dm_subset["USUBJID"].astype(str).str.strip()

    ctx = subjects_df.merge(
        dm_subset.drop(columns=["USUBJID", "ARMCD"], errors="ignore"),
        on="USUBJID_str",
        how="left",
    )
    ctx = ctx.drop(columns=["USUBJID_str"], errors="ignore")

    # Step 8: Study phase from arm_structure
    ctx["HAS_RECOVERY"] = ctx["ARMCD"].map(
        lambda a: _arm_has_recovery(arm_structure.get(str(a).strip(), []))
    )
    # Default study phase — Main Study
    ctx["STUDY_PHASE"] = "Main Study"
    ctx.loc[ctx["is_recovery"] == True, "STUDY_PHASE"] = "Recovery"  # noqa: E712

    # Step 9: TK detection
    ctx["IS_TK"] = ctx["is_satellite"]  # Already detected by build_dose_groups

    # Step 10: Treatment timing from TE
    ctx["TREATMENT_START_DY"] = None
    ctx["TREATMENT_END_DY"] = None
    ctx["RECOVERY_START_DY"] = None
    if arm_structure:
        for armcd, epochs in arm_structure.items():
            mask = ctx["ARMCD"].astype(str).str.strip() == armcd
            cumulative_days = 0
            for ep in epochs:
                dur = _parse_tedur_days(ep.get("tedur", ""))
                epoch_name = ep.get("epoch", "").lower()
                element_name = ep.get("element", "").lower()

                if "treatment" in epoch_name or "treatment" in element_name:
                    ctx.loc[mask, "TREATMENT_START_DY"] = cumulative_days + 1
                    if dur:
                        ctx.loc[mask, "TREATMENT_END_DY"] = cumulative_days + dur

                if "recovery" in epoch_name or "recovery" in element_name:
                    ctx.loc[mask, "RECOVERY_START_DY"] = cumulative_days + 1

                if dur:
                    cumulative_days += dur

    # Step 11: Sacrifice day from DS
    ctx["SACRIFICE_DY"] = None
    if ds_df is not None and "USUBJID" in ds_df.columns:
        sacrifice = ds_df[_str_col(ds_df, "DSDECOD").str.upper().isin(
            ["TERMINAL SACRIFICE", "SCHEDULED SACRIFICE", "EUTHANASIA"]
        )]
        if len(sacrifice) > 0 and "DSSTDY" in sacrifice.columns:
            sac_map = dict(zip(
                sacrifice["USUBJID"].astype(str).str.strip(),
                _float_col(sacrifice, "DSSTDY"),
            ))
            ctx["SACRIFICE_DY"] = ctx["USUBJID"].astype(str).str.strip().map(sac_map)

    # Step 12: Fill metadata gaps — track source for provenance
    species_source = None
    strain_source = None

    if "SPECIES" not in ctx.columns or ctx["SPECIES"].isna().all() or (ctx["SPECIES"] == "").all():
        if ts_meta.get("species"):
            ctx["SPECIES"] = ts_meta["species"]
            species_source = "TS"
    else:
        # Species came from DM; check if TS also had it
        species_source = "TS" if ts_meta.get("species") else "DM"

    if "STRAIN" not in ctx.columns or ctx["STRAIN"].isna().all() or (ctx["STRAIN"] == "").all():
        if ts_meta.get("strain"):
            ctx["STRAIN"] = ts_meta["strain"]
            strain_source = "TS"
    else:
        strain_source = "TS" if ts_meta.get("strain") else "DM"

    # Fill route from TS if not from EX — track source for provenance
    route_source = None
    if ex_info:
        # Check if any EX record had route info
        any_ex_route = any(v.get("route") for v in ex_info.values())
        if any_ex_route:
            route_source = "EX"
    if route_source is None and ("ROUTE" not in ctx.columns or ctx["ROUTE"].isna().all() or (ctx["ROUTE"].astype(str).str.strip() == "").all()):
        if ts_meta.get("route"):
            ctx["ROUTE"] = ts_meta["route"]
            route_source = "TS"

    # Step 13: Compute DOSE_GROUP_ORDER and DOSE_LEVEL label
    ctx["DOSE_GROUP_ORDER"] = ctx["dose_level"]
    ctx["DOSE_LEVEL"] = ctx.apply(
        lambda row: tx_map.get(str(row["ARMCD"]).strip(), {}).get("label", f"Group {row['ARMCD']}"),
        axis=1,
    )

    # Rename columns to match spec schema
    rename_map = {
        "USUBJID": "USUBJID",
        "dose_level": "dose_level_num",
    }
    ctx = ctx.rename(columns=rename_map)

    # Select final columns (drop internal helpers)
    final_cols = [
        "USUBJID", "STUDYID", "ARM", "ARMCD", "SEX",
        "SPECIES", "STRAIN",
        "DOSE", "DOSE_UNIT", "DOSE_LEVEL", "DOSE_GROUP_ORDER", "IS_CONTROL",
        "ROUTE", "FREQUENCY",
        "STUDY_PHASE", "HAS_RECOVERY", "IS_TK",
        "TREATMENT_START_DY", "TREATMENT_END_DY", "RECOVERY_START_DY", "SACRIFICE_DY",
        "DOSE_VARIES",
    ]
    # Only include columns that exist
    final_cols = [c for c in final_cols if c in ctx.columns]
    # Add SETCD if present
    if "SETCD" in ctx.columns:
        final_cols.insert(4, "SETCD")

    ctx = ctx[final_cols].copy()

    # Step 14: Detect issues
    issues = _detect_issues(dm_df, ta_df, tx_df, ts_meta, ex_info, arm_structure, ctx)

    logger.info(
        "Built subject_context for %s: %d subjects, dose_method=%s, %d issues",
        study.study_id, len(ctx), dose_method, len(issues),
    )

    return {
        "subject_context": ctx,
        "study_metadata": ts_meta,
        "arm_structure": arm_structure,
        "dose_method": dose_method,
        "issues": issues,
        "_provenance_hints": {
            "route_source": route_source,
            "species_source": species_source,
            "strain_source": strain_source,
            "ex_subject_count": ex_subject_count,
            "non_ex_subject_count": non_ex_subject_count,
        },
    }
