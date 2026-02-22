"""Read DM + TX domains to build dose group map and subject roster."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def _parse_tx(study: StudyInfo) -> tuple[dict[str, dict], set[str]]:
    """Parse TX domain into a map of ARMCD -> {dose_value, dose_unit, label, is_recovery, is_satellite}.

    Returns (tx_map, tk_setcds) where tk_setcds is the set of SETCD values for TK satellite sets.
    TK sets are excluded from tx_map to avoid ARMCD collision (TK and main arms share ARMCD).
    """
    tx_map: dict[str, dict] = {}
    tk_setcds: set[str] = set()
    if "tx" not in study.xpt_files:
        return tx_map, tk_setcds

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

        # Detect satellite/TK arms via multiple heuristics:
        # 1. Any TK-prefixed param with a value indicating TK (not "non-TK", "none", etc.)
        # 2. SETCD string contains "TK"
        # 3. SETLBL/GRPLBL contains "satellite" or "toxicokinetic"
        tk_positive_values = set()
        for p, v in params.items():
            if p.startswith("TK"):
                vl = v.lower()
                if vl not in ("non-tk", "none", "no", "n/a", ""):
                    tk_positive_values.add(v)
        setcd_str = str(setcd).strip()
        setlbl = params.get("SETLBL", "")
        grplbl = params.get("GRPLBL", "")
        is_satellite = (
            bool(tk_positive_values)
            or "TK" in setcd_str.upper()
            or "satellite" in label.lower()
            or "toxicokinetic" in label.lower()
            or "satellite" in setlbl.lower()
            or "toxicokinetic" in setlbl.lower()
            or "satellite" in grplbl.lower()
            or "toxicokinetic" in grplbl.lower()
        )

        if is_satellite:
            # Track TK SETCD but don't add to tx_map — avoids ARMCD collision
            tk_setcds.add(setcd_str)
            continue

        tx_map[armcd] = {
            "dose_value": dose_val,
            "dose_unit": params.get("TRTDOSU"),
            "label": label,
            "is_recovery": is_recovery,
            "is_satellite": False,
        }

    # Post-process: detect recovery arms by ARMCD suffix convention
    # e.g., "1R" pairs with "1", "2R" pairs with "2"
    for armcd, info in tx_map.items():
        if not info["is_recovery"] and armcd.endswith("R") and len(armcd) >= 2:
            base_armcd = armcd[:-1]
            if base_armcd in tx_map and not tx_map[base_armcd]["is_recovery"]:
                info["is_recovery"] = True

    return tx_map, tk_setcds


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
    tx_map, tk_setcds = _parse_tx(study)

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

    # Mark recovery subjects via ARMCD lookup
    subjects["is_recovery"] = subjects["ARMCD"].apply(
        lambda a: tx_map.get(a, {}).get("is_recovery", False)
    )

    # Mark satellite/TK subjects via DM.SETCD membership (not ARMCD — TK arms share ARMCD with main)
    if tk_setcds and "SETCD" in dm_df.columns:
        dm_setcd = dm_df["SETCD"].astype(str).str.strip()
        subjects["is_satellite"] = dm_setcd.isin(tk_setcds).values
    else:
        # Fallback: ARMCD-based detection (for studies without TX TK info / no SETCD)
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

    # TK satellite counts per ARMCD: satellites share ARMCD with main arms
    tk_subjects = subjects[subjects["is_satellite"]]
    tk_per_armcd = tk_subjects.groupby("ARMCD").size().to_dict() if len(tk_subjects) > 0 else {}

    # Recovery arm linkage: find recovery ARMCDs that pair with main ARMCDs
    recovery_armcds = {a: info for a, info in tx_map.items() if info.get("is_recovery", False)}
    recovery_subjects = subjects[subjects["is_recovery"] & ~subjects["is_satellite"]]

    dose_groups = []
    for armcd in main_armcds:
        arm_subs = main_subjects[main_subjects["ARMCD"] == armcd]
        tx_info = tx_map.get(armcd, {})

        # Find paired recovery arm: try ARMCD + "R" convention
        rec_armcd = None
        rec_n = 0
        candidate = armcd + "R"
        if candidate in recovery_armcds:
            rec_armcd = candidate
            rec_n = int(len(recovery_subjects[recovery_subjects["ARMCD"] == candidate]))

        dose_groups.append({
            "dose_level": armcd_to_level.get(armcd, -1),
            "armcd": armcd,
            "label": tx_info.get("label", f"Group {armcd}"),
            "dose_value": tx_info.get("dose_value"),
            "dose_unit": tx_info.get("dose_unit"),
            "n_male": int((arm_subs["SEX"] == "M").sum()),
            "n_female": int((arm_subs["SEX"] == "F").sum()),
            "n_total": len(arm_subs),
            "tk_count": int(tk_per_armcd.get(armcd, 0)),
            "is_recovery": False,
            "recovery_armcd": rec_armcd,
            "recovery_n": rec_n,
        })

    tk_count = int(subjects["is_satellite"].sum())

    return {
        "dose_groups": dose_groups,
        "subjects": subjects,
        "tx_map": tx_map,
        "tk_count": tk_count,
    }
