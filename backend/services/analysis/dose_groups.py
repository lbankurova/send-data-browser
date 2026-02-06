"""Read DM + TX domains to build dose group map and subject roster."""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


# ARMCD → dose level index (0 = control)
ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}

# Recovery arm codes (R variants)
RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}


def build_dose_groups(study: StudyInfo) -> dict:
    """Build dose group mapping from DM and TX domains.

    Returns dict with:
      - dose_groups: list of {dose_level, armcd, label, dose_value, dose_unit, n_male, n_female}
      - subjects: DataFrame with USUBJID, SEX, ARMCD, dose_level, is_recovery
      - tx_map: dict mapping ARMCD → {dose_value, dose_unit, label}
    """
    # Read DM
    dm_df, _ = read_xpt(study.xpt_files["dm"])
    dm_df.columns = [c.upper() for c in dm_df.columns]

    # Read TX for dose info — TX uses SETCD as group key and TXPARMCD/TXVAL for parameters
    tx_map = {}
    if "tx" in study.xpt_files:
        tx_df, _ = read_xpt(study.xpt_files["tx"])
        tx_df.columns = [c.upper() for c in tx_df.columns]

        # TX is a long-format table: SETCD groups parameters via TXPARMCD/TXVAL
        for setcd in tx_df["SETCD"].unique():
            set_rows = tx_df[tx_df["SETCD"] == setcd]
            params = {}
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

            tx_map[armcd] = {
                "dose_value": dose_val,
                "dose_unit": params.get("TRTDOSU"),
                "label": label,
            }

    # Build subject roster from DM
    subjects = dm_df[["USUBJID", "SEX", "ARMCD"]].copy()
    subjects["ARMCD"] = subjects["ARMCD"].astype(str).str.strip()
    subjects["is_recovery"] = subjects["ARMCD"].isin(RECOVERY_ARMCDS)

    # Map ARMCD to dose level
    def map_dose_level(armcd: str) -> int:
        base = armcd.replace("R", "")
        return ARMCD_TO_DOSE_LEVEL.get(base, -1)

    subjects["dose_level"] = subjects["ARMCD"].apply(map_dose_level)

    # If TX didn't provide labels, use ARM column from DM
    if not tx_map:
        for armcd in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd]
            label = str(arm_rows["ARM"].iloc[0]) if "ARM" in arm_rows.columns else f"Group {armcd}"
            tx_map[str(armcd).strip()] = {
                "dose_value": None,
                "dose_unit": None,
                "label": label,
            }

    # Build dose groups summary (main study only)
    main_subjects = subjects[~subjects["is_recovery"]]
    dose_groups = []
    for armcd in sorted(ARMCD_TO_DOSE_LEVEL.keys()):
        arm_subs = main_subjects[main_subjects["ARMCD"] == armcd]
        tx_info = tx_map.get(armcd, {})
        dose_groups.append({
            "dose_level": ARMCD_TO_DOSE_LEVEL[armcd],
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
