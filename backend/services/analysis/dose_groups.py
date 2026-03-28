"""Read DM + TX domains to build dose group map and subject roster."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def _parse_tx(
    study: StudyInfo, dm_df: pd.DataFrame | None = None,
) -> tuple[dict[str, dict], set[str]]:
    """Parse TX domain into a map of ARMCD -> {dose_value, dose_unit, label, ...}.

    Recovery detection priority:
      1. DM.ARM (200-char, untruncated) — primary
      2. TX RECOVDUR parameter — secondary
      3. TX GRPLBL/SETLBL "recovery" substring — fallback

    Returns (tx_map, tk_setcds) where tk_setcds is the set of SETCD values for TK satellite sets.
    TK sets are excluded from tx_map to avoid ARMCD collision (TK and main arms share ARMCD).
    """
    tx_map: dict[str, dict] = {}
    tk_setcds: set[str] = set()
    if "tx" not in study.xpt_files:
        return tx_map, tk_setcds

    tx_df, _ = read_xpt(study.xpt_files["tx"])
    tx_df.columns = [c.upper() for c in tx_df.columns]

    # Build DM ARM lookup: armcd → untruncated ARM label (200-char, authoritative)
    dm_arm_map: dict[str, str] = {}
    if dm_df is not None and "ARM" in dm_df.columns and "ARMCD" in dm_df.columns:
        for armcd_val in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd_val]
            dm_arm_map[str(armcd_val).strip()] = str(arm_rows["ARM"].iloc[0]).strip()

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

        grplbl = params.get("GRPLBL", "")
        setlbl = params.get("SETLBL", "")
        label = grplbl or setlbl or f"ARMCD {armcd}"

        # Recovery detection — priority: DM.ARM > RECOVDUR > label
        dm_arm_label = dm_arm_map.get(armcd, "")
        is_recovery = (
            "recovery" in dm_arm_label.lower()
            or "RECOVDUR" in params
            or "recovery" in label.lower()
        )

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
            "setlbl": setlbl,
            "spgrpcd": params.get("SPGRPCD"),
            "tcntrl": params.get("TCNTRL"),
            "is_recovery": is_recovery,
            "is_satellite": False,
        }

    # Post-process: detect recovery arms by ARMCD suffix convention
    # ONLY when SPGRPCD is absent from all TX entries.
    has_spgrpcd = any(info.get("spgrpcd") for info in tx_map.values())
    if not has_spgrpcd:
        for armcd, info in tx_map.items():
            if not info["is_recovery"] and armcd.endswith("R") and len(armcd) >= 2:
                base_armcd = armcd[:-1]
                if base_armcd in tx_map and not tx_map[base_armcd]["is_recovery"]:
                    info["is_recovery"] = True

    return tx_map, tk_setcds


def _resolve_label(tx_info: dict, dm_arm_label: str = "") -> str:
    """Pick best label for a dose group: GRPLBL > SETLBL > DM.ARM.

    GRPLBL is the group-level label (shared across main+recovery arms).
    SETLBL may include arm-specific suffixes ("nonrec", "rec", "TK").
    DM.ARM may include "Recovery" suffix for recovery arms, so filter those out.
    """
    label = tx_info.get("label", "")  # GRPLBL or SETLBL from _parse_tx
    if label:
        return label
    setlbl = tx_info.get("setlbl", "")
    if setlbl:
        return setlbl
    if dm_arm_label and "recovery" not in dm_arm_label.lower():
        return dm_arm_label
    return f"Group {tx_info.get('armcd', '?')}"


def build_dose_groups(study: StudyInfo) -> dict:
    """Build dose group mapping from DM and TX domains.

    Uses SPGRPCD (Sponsor Group Code) when available to collapse arms that belong
    to the same treatment group (e.g., main + recovery arms).  Falls back to the
    legacy ARMCD suffix convention ("1R" pairs with "1") when SPGRPCD is absent.

    Returns dict with:
      - dose_groups: list of {dose_level, armcd, label, dose_value, dose_unit, n_male, n_female, ...}
      - subjects: DataFrame with USUBJID, SEX, ARMCD, dose_level, is_recovery
      - tx_map: dict mapping ARMCD -> {dose_value, dose_unit, label, ...}
    """
    # Read DM
    dm_df, _ = read_xpt(study.xpt_files["dm"])
    dm_df.columns = [c.upper() for c in dm_df.columns]

    # Parse TX (pass DM for untruncated ARM labels)
    tx_map, tk_setcds = _parse_tx(study, dm_df)

    # DM ARM lookup for label resolution
    dm_arm_map: dict[str, str] = {}
    if "ARM" in dm_df.columns and "ARMCD" in dm_df.columns:
        for armcd_val in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd_val]
            dm_arm_map[str(armcd_val).strip()] = str(arm_rows["ARM"].iloc[0]).strip()

    # If TX didn't provide labels, use ARM column from DM
    if not tx_map:
        for armcd in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd]
            label = str(arm_rows["ARM"].iloc[0]) if "ARM" in arm_rows.columns else f"Group {armcd}"
            tx_map[str(armcd).strip()] = {
                "dose_value": None,
                "dose_unit": None,
                "label": label,
                "setlbl": "",
                "spgrpcd": None,
                "tcntrl": None,
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

    # --- Determine grouping mode: SPGRPCD vs legacy ---
    has_spgrpcd = any(info.get("spgrpcd") for info in tx_map.values())

    all_armcds = list(dm_df["ARMCD"].astype(str).str.strip().unique())

    if has_spgrpcd:
        armcd_to_level, main_armcds, recovery_pairing = _build_groups_spgrpcd(
            tx_map, all_armcds, dm_arm_map,
        )
    else:
        armcd_to_level, main_armcds, recovery_pairing = _build_groups_legacy(
            tx_map, all_armcds,
        )

    subjects["dose_level"] = subjects["ARMCD"].map(armcd_to_level).fillna(-1).astype(int)

    # Build dose groups summary (main study arms only)
    main_subjects = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]]

    # Treatment-period subjects: main + recovery (for pooled N counts)
    treatment_subjects = subjects[~subjects["is_satellite"]]

    # TK satellite counts per ARMCD: satellites share ARMCD with main arms
    tk_subjects = subjects[subjects["is_satellite"]]
    tk_per_armcd = tk_subjects.groupby("ARMCD").size().to_dict() if len(tk_subjects) > 0 else {}
    tk_male_per_armcd = tk_subjects[tk_subjects["SEX"] == "M"].groupby("ARMCD").size().to_dict() if len(tk_subjects) > 0 else {}
    tk_female_per_armcd = tk_subjects[tk_subjects["SEX"] == "F"].groupby("ARMCD").size().to_dict() if len(tk_subjects) > 0 else {}

    # Recovery arm linkage
    recovery_subjects = subjects[subjects["is_recovery"] & ~subjects["is_satellite"]]

    dose_groups = []
    for armcd in main_armcds:
        arm_subs = main_subjects[main_subjects["ARMCD"] == armcd]
        tx_info = tx_map.get(armcd, {})

        # Recovery arm: from pairing map
        rec_armcd = recovery_pairing.get(armcd)
        rec_n = 0
        rec_n_male = 0
        rec_n_female = 0
        if rec_armcd:
            rec_subs = recovery_subjects[recovery_subjects["ARMCD"] == rec_armcd]
            rec_n = int(len(rec_subs))
            rec_n_male = int((rec_subs["SEX"] == "M").sum())
            rec_n_female = int((rec_subs["SEX"] == "F").sum())

        # Pooled N: main + recovery animals at the same dose level
        dose_lvl = armcd_to_level.get(armcd, -1)
        pooled = treatment_subjects[treatment_subjects["dose_level"] == dose_lvl]

        # Label: GRPLBL (group-level) > DM.ARM > SETLBL (arm-specific)
        group_label = _resolve_label(tx_info, dm_arm_map.get(armcd, ""))

        dose_groups.append({
            "dose_level": armcd_to_level.get(armcd, -1),
            "armcd": armcd,
            "label": group_label,
            "is_control": _is_control(tx_info),
            "dose_value": tx_info.get("dose_value"),
            "dose_unit": tx_info.get("dose_unit"),
            "n_male": int((arm_subs["SEX"] == "M").sum()),
            "n_female": int((arm_subs["SEX"] == "F").sum()),
            "n_total": len(arm_subs),
            "pooled_n_male": int((pooled["SEX"] == "M").sum()),
            "pooled_n_female": int((pooled["SEX"] == "F").sum()),
            "pooled_n_total": len(pooled),
            "tk_count": int(tk_per_armcd.get(armcd, 0)),
            "tk_n_male": int(tk_male_per_armcd.get(armcd, 0)),
            "tk_n_female": int(tk_female_per_armcd.get(armcd, 0)),
            "is_recovery": False,
            "recovery_armcd": rec_armcd,
            "recovery_n": rec_n,
            "recovery_n_male": rec_n_male,
            "recovery_n_female": rec_n_female,
        })

    tk_count = int(subjects["is_satellite"].sum())
    has_concurrent_control = any(dg["is_control"] for dg in dose_groups)

    return {
        "dose_groups": dose_groups,
        "subjects": subjects,
        "tx_map": tx_map,
        "tk_count": tk_count,
        "has_concurrent_control": has_concurrent_control,
    }


# ---------------------------------------------------------------------------
# Grouping strategies
# ---------------------------------------------------------------------------

def _is_control(tx_info: dict) -> bool:
    """Detect control arm from TX metadata.

    TCNTRL in SEND marks control treatments (e.g. "VEHICLE CONTROL",
    "PLACEBO").  Some XPTs store SAS-missing as the literal string "None"
    — filter that out.
    """
    tcntrl = tx_info.get("tcntrl")
    if tcntrl and str(tcntrl).strip().lower() not in ("none", ""):
        return True
    dv = tx_info.get("dose_value")
    if dv is not None and dv == 0:
        return True
    label = tx_info.get("label", "").lower()
    if "control" in label or "vehicle" in label:
        return True
    return False


def _build_groups_spgrpcd(
    tx_map: dict[str, dict],
    all_armcds: list[str],
    dm_arm_map: dict[str, str],
) -> tuple[dict[str, int], list[str], dict[str, str | None]]:
    """SPGRPCD mode: group arms by Sponsor Group Code.

    Within each SPGRPCD, the non-recovery arm is main and the recovery arm is
    the recovery counterpart.

    Returns (armcd_to_level, main_armcds, recovery_pairing).
    """
    # Group arms by SPGRPCD
    groups: dict[str, list[str]] = {}
    for armcd in all_armcds:
        info = tx_map.get(armcd, {})
        if info.get("is_satellite"):
            continue
        grp = info.get("spgrpcd")
        if grp is None:
            # Arm without SPGRPCD in a SPGRPCD study — treat as its own group
            grp = f"_solo_{armcd}"
        groups.setdefault(grp, []).append(armcd)

    # For each group: pick main arm (non-recovery) and recovery arm
    main_armcds: list[str] = []
    recovery_pairing: dict[str, str | None] = {}

    for grp_code, armcds in groups.items():
        main_arm = None
        rec_arm = None
        for a in armcds:
            info = tx_map.get(a, {})
            if info.get("is_recovery"):
                rec_arm = a
            else:
                main_arm = a

        if main_arm is None:
            # All arms in this group are recovery — pick first as main
            main_arm = armcds[0]
            rec_arm = armcds[1] if len(armcds) > 1 else None

        main_armcds.append(main_arm)
        recovery_pairing[main_arm] = rec_arm

    # Sort main arms: control first, then by dose_value ascending
    def sort_key(armcd: str):
        info = tx_map.get(armcd, {})
        if _is_control(info):
            return (-1, 0)
        dv = info.get("dose_value")
        return (0, dv if dv is not None else 0)

    main_armcds.sort(key=sort_key)

    # Assign dose_level: 0 for control, 1+ for treated
    armcd_to_level: dict[str, int] = {}
    level = 0
    for armcd in main_armcds:
        armcd_to_level[armcd] = level
        level += 1

    # Recovery arms inherit parent's dose_level
    for main_arm, rec_arm in recovery_pairing.items():
        if rec_arm and main_arm in armcd_to_level:
            armcd_to_level[rec_arm] = armcd_to_level[main_arm]

    # Any remaining unmapped arms
    for armcd in all_armcds:
        if armcd not in armcd_to_level:
            armcd_to_level[armcd] = -1

    return armcd_to_level, main_armcds, recovery_pairing


def _build_groups_legacy(
    tx_map: dict[str, dict],
    all_armcds: list[str],
) -> tuple[dict[str, int], list[str], dict[str, str | None]]:
    """Legacy mode: sequential dose_level assignment with ARMCD+R suffix recovery pairing.

    This is the original algorithm, used when SPGRPCD is absent from TX.
    """
    main_armcds = [
        a for a in all_armcds
        if not tx_map.get(a, {}).get("is_recovery", False)
        and not tx_map.get(a, {}).get("is_satellite", False)
    ]

    def sort_key(armcd: str):
        dv = tx_map.get(armcd, {}).get("dose_value")
        return dv if dv is not None else -1

    main_armcds.sort(key=sort_key)

    # Assign dose_level: 0 for control, 1+ for treated groups
    armcd_to_level: dict[str, int] = {}
    for i, armcd in enumerate(main_armcds):
        info = tx_map.get(armcd, {})
        if _is_control(info):
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

    # Recovery arms: ARMCD + "R" suffix convention
    recovery_pairing: dict[str, str | None] = {a: None for a in main_armcds}
    recovery_armcds = {a for a, info in tx_map.items() if info.get("is_recovery", False)}

    for main_arm in main_armcds:
        candidate = main_arm + "R"
        if candidate in recovery_armcds:
            recovery_pairing[main_arm] = candidate

    # Recovery arms inherit parent's dose_level
    for armcd in all_armcds:
        if armcd not in armcd_to_level:
            base = armcd.rstrip("R").rstrip("r")
            if base in armcd_to_level:
                armcd_to_level[armcd] = armcd_to_level[base]
            else:
                armcd_to_level[armcd] = -1

    return armcd_to_level, main_armcds, recovery_pairing
