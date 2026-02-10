"""Read DM + TX domains to build dose group map and subject roster."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def _parse_tx(study: StudyInfo) -> dict[str, dict]:
    """Parse TX domain into a map of ARMCD -> {dose_value, dose_unit, label, is_recovery, is_satellite}."""
    tx_map: dict[str, dict] = {}
    if "tx" not in study.xpt_files:
        return tx_map

    tx_df, _ = read_xpt(study.xpt_files["tx"])
    tx_df.columns = [c.upper() for c in tx_df.columns]

    for setcd in tx_df["SETCD"].unique():
        set_rows = tx_df[tx_df["SETCD"] == setcd]
        params: dict[str, str] = {}
        for _, row in set_rows.iterrows():
            parm = str(row.get("TXPARMCD", "")).strip()
            val = str(row.get("TXVAL", "")).strip()
            if parm and val and val != "nan":
                params[parm] = val

        armcd = params.get("ARMCD", str(setcd))
        dose_val = None
        if "TRTDOS" in params:
            try:
                dose_val = float(params["TRTDOS"])
            except ValueError:
                pass

        label = params.get("GRPLBL") or params.get("SETLBL") or f"ARMCD {armcd}"

        # Detect recovery arms: TX RECOVDUR param present, or label contains "recovery"
        is_recovery = "RECOVDUR" in params or "recovery" in label.lower()

        # Detect satellite/TK arms: TX TKGRP param present, or label contains "satellite" or "tk"
        is_satellite = "TKGRP" in params or "satellite" in label.lower() or "toxicokinetic" in label.lower()

        tx_map[armcd] = {
            "dose_value": dose_val,
            "dose_unit": params.get("TRTDOSU"),
            "label": label,
            "is_recovery": is_recovery,
            "is_satellite": is_satellite,
        }

    return tx_map


def build_dose_groups(study: StudyInfo) -> dict:
    """Build dose group mapping from DM and TX domains.

    Returns dict with:
      - dose_groups: list of {dose_level, armcd, label, dose_value, dose_unit, n_male, n_female}
      - subjects: DataFrame with USUBJID, SEX, ARMCD, dose_level, is_recovery
      - tx_map: dict mapping ARMCD -> {dose_value, dose_unit, label}
    """
    # Read DM
    dm_df, _ = read_xpt(study.xpt_files["dm"])
    dm_df.columns = [c.upper() for c in dm_df.columns]

    # Parse TX
    tx_map = _parse_tx(study)

    # If TX didn't provide labels, use ARM column from DM
    if not tx_map:
        for armcd in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd]
            label = str(arm_rows["ARM"].iloc[0]) if "ARM" in arm_rows.columns else f"Group {armcd}"
            tx_map[str(armcd).strip()] = {
                "dose_value": None,
                "dose_unit": None,
                "label": label,
                "is_recovery": "recovery" in label.lower(),
                "is_satellite": "satellite" in label.lower() or "toxicokinetic" in label.lower(),
            }

    # Build subject roster from DM
    subjects = dm_df[["USUBJID", "SEX", "ARMCD"]].copy()
    subjects["ARMCD"] = subjects["ARMCD"].astype(str).str.strip()

    # Mark recovery and satellite subjects
    subjects["is_recovery"] = subjects["ARMCD"].apply(
        lambda a: tx_map.get(a, {}).get("is_recovery", False)
    )
    subjects["is_satellite"] = subjects["ARMCD"].apply(
        lambda a: tx_map.get(a, {}).get("is_satellite", False)
    )

    # Discover main study ARMCDs: not recovery, not satellite
    all_armcds = list(dm_df["ARMCD"].astype(str).str.strip().unique())
    main_armcds = [
        a for a in all_armcds
        if not tx_map.get(a, {}).get("is_recovery", False)
        and not tx_map.get(a, {}).get("is_satellite", False)
    ]

    # Sort by dose_value ascending (control first — dose_value == 0 or None)
    def sort_key(armcd: str):
        dv = tx_map.get(armcd, {}).get("dose_value")
        return dv if dv is not None else -1

    main_armcds.sort(key=sort_key)

    # Assign dose_level: 0 for control, 1+ for treated groups
    armcd_to_level: dict[str, int] = {}
    for i, armcd in enumerate(main_armcds):
        info = tx_map.get(armcd, {})
        dv = info.get("dose_value")
        label = info.get("label", "").lower()
        is_control = (dv is not None and dv == 0) or "control" in label or "vehicle" in label
        if is_control:
            armcd_to_level[armcd] = 0
        else:
            armcd_to_level[armcd] = i if 0 not in armcd_to_level.values() else i

    # Re-number so control=0 and treated start at 1
    if armcd_to_level:
        sorted_entries = sorted(armcd_to_level.items(), key=lambda x: sort_key(x[0]))
        level = 0
        for armcd, _ in sorted_entries:
            armcd_to_level[armcd] = level
            level += 1

    # Recovery arms get the dose level of their parent arm
    for armcd in all_armcds:
        if armcd not in armcd_to_level:
            # Try to match parent: strip trailing R, or look for same dose value
            base = armcd.rstrip("R").rstrip("r")
            if base in armcd_to_level:
                armcd_to_level[armcd] = armcd_to_level[base]
            else:
                armcd_to_level[armcd] = -1

    subjects["dose_level"] = subjects["ARMCD"].map(armcd_to_level).fillna(-1).astype(int)

    # Build dose groups summary (main study arms only)
    main_subjects = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]]
    dose_groups = []
    for armcd in main_armcds:
        arm_subs = main_subjects[main_subjects["ARMCD"] == armcd]
        tx_info = tx_map.get(armcd, {})
        dose_groups.append({
            "dose_level": armcd_to_level.get(armcd, -1),
            "armcd": armcd,
            "label": tx_info.get("label", f"Group {armcd}"),
            "dose_value": tx_info.get("dose_value"),
            "dose_unit": tx_info.get("dose_unit"),
            "n_male": int((arm_subs["SEX"] == "M").sum()),
            "n_female": int((arm_subs["SEX"] == "F").sum()),
            "n_total": len(arm_subs),
        })

    return {
        "dose_groups": dose_groups,
        "subjects": subjects,
        "tx_map": tx_map,
    }
