"""Read DM + TX domains to build dose group map and subject roster."""

import logging
import re

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt

logger = logging.getLogger(__name__)

# TK classification constants
_TK_SATELLITE = "satellite"
_TK_COMBINED = "combined"
_TK_MAIN = "main"


def _prescan_domain_subjects(study: StudyInfo, domain: str) -> set[str]:
    """Read USUBJIDs from a domain XPT for TK domain-data validation (Step 4)."""
    if domain not in study.xpt_files:
        return set()
    try:
        df, _ = read_xpt(study.xpt_files[domain])
        col = next((c for c in df.columns if c.upper() == "USUBJID"), None)
        if col:
            return set(df[col].dropna().astype(str).unique())
        return set()
    except Exception:
        return set()


def _classify_tk_sets(
    study: StudyInfo,
    tx_df: pd.DataFrame,
    dm_df: pd.DataFrame,
) -> dict[str, dict]:
    """5-step cascading TK satellite classification.

    Implements the algorithm from deep-research-TKclass-28mar2026.md:
      Step 1: TKDESC param lookup (highest reliability)
      Step 2: SET label text matching
      Step 3: SETCD pattern matching
      Step 4: Domain-data validation (resolves satellite vs combined)

    Returns dict of setcd_str -> {classification, method, detail}.
    """
    classifications: dict[str, dict] = {}
    unresolved: set[str] = set()

    # Gather per-SETCD params and SET column labels
    set_params: dict[str, dict[str, str]] = {}
    set_labels: dict[str, str] = {}

    for setcd in tx_df["SETCD"].unique():
        setcd_str = str(setcd).strip()
        set_rows = tx_df[tx_df["SETCD"] == setcd]

        params: dict[str, str] = {}
        for _, row in set_rows.iterrows():
            parm = str(row.get("TXPARMCD", "")).strip().upper()
            val = str(row.get("TXVAL", "")).strip()
            if parm and val and val.lower() != "nan":
                params[parm] = val
        set_params[setcd_str] = params

        if "SET" in set_rows.columns:
            set_labels[setcd_str] = str(set_rows["SET"].iloc[0]).strip()

        unresolved.add(setcd_str)

    # ── Step 1: TKDESC param lookup ──────────────────────────────
    for setcd_str in list(unresolved):
        tkdesc = set_params.get(setcd_str, {}).get("TKDESC", "")
        if not tkdesc:
            continue

        tu = tkdesc.upper().strip()
        if tu == "SATELLITE" or ("SATELLITE" in tu and "CONCOMITANT" not in tu):
            classifications[setcd_str] = {
                "classification": _TK_SATELLITE, "method": "TKDESC",
                "detail": f"TKDESC={tkdesc}",
            }
        elif tu in ("CONCOMITANT", "MAIN AND TK", "MAIN+TK", "COMBINED"):
            classifications[setcd_str] = {
                "classification": _TK_COMBINED, "method": "TKDESC",
                "detail": f"TKDESC={tkdesc}",
            }
        elif tu in ("NO TK", "NON-TK", "NONE", "N/A", "NO"):
            classifications[setcd_str] = {
                "classification": _TK_MAIN, "method": "TKDESC",
                "detail": f"TKDESC={tkdesc}",
            }
        elif tu in ("TK", "TK ONLY", "TOXICOKINETIC", "TK SATELLITE"):
            classifications[setcd_str] = {
                "classification": _TK_SATELLITE, "method": "TKDESC",
                "detail": f"TKDESC={tkdesc} (non-standard)",
            }
        elif "CONCOMITANT" in tu or ("MAIN" in tu and "TK" in tu):
            # Only classify as combined if MAIN appears alongside TK (e.g., "MAIN AND TK").
            # Plain "MAIN STUDY" without TK is just a main-study set.
            classifications[setcd_str] = {
                "classification": _TK_COMBINED, "method": "TKDESC",
                "detail": f"TKDESC={tkdesc} (non-standard)",
            }
        else:
            continue  # Unrecognised TKDESC — fall through to Step 2

        unresolved.discard(setcd_str)

    # ── Step 2: SET label + GRPLBL/SETLBL text matching ──────────
    _COMBINED_KW = ("main + tk", "main and tk", "combined", "concomitant",
                     "tox + tk", "toxicology and tk", "main+tk")
    _SATELLITE_KW = ("tk satellite", "toxicokinetic satellite", "pk satellite",
                      "tk only", "satellite tk")

    for setcd_str in list(unresolved):
        params = set_params.get(setcd_str, {})
        set_label = set_labels.get(setcd_str, "")
        grplbl = params.get("GRPLBL", "")
        setlbl = params.get("SETLBL", "")
        all_text = f"{set_label} | {grplbl} | {setlbl}".lower()

        # Skip if no TK-related keywords at all
        if not any(kw in all_text for kw in ("tk", "satellite", "toxicokinetic", "pharmacokinetic")):
            continue

        best_label = set_label or grplbl or setlbl
        if any(kw in all_text for kw in _COMBINED_KW):
            classifications[setcd_str] = {
                "classification": _TK_COMBINED, "method": "SET_label",
                "detail": f"Combined keyword in '{best_label}'",
            }
        elif any(kw in all_text for kw in _SATELLITE_KW) or "satellite" in all_text:
            classifications[setcd_str] = {
                "classification": _TK_SATELLITE, "method": "SET_label",
                "detail": f"Satellite keyword in '{best_label}'",
            }
        elif "tk" in all_text or "toxicokinetic" in all_text:
            # Weak signal — Step 4 will validate
            classifications[setcd_str] = {
                "classification": _TK_SATELLITE, "method": "SET_label_candidate",
                "detail": f"TK keyword in '{best_label}' — pending domain validation",
            }
        else:
            continue

        unresolved.discard(setcd_str)

    # ── Step 3: SETCD pattern matching ───────────────────────────
    for setcd_str in list(unresolved):
        su = setcd_str.upper()

        # Combined patterns (contains "+")
        if re.search(r"\+.*TK|TK.*\+", su):
            cls, meth = _TK_COMBINED, f"SETCD '+TK' pattern '{setcd_str}'"
        # Pure satellite: {n}TK, {n}.TK
        elif re.match(r"^\d+\.?TK$", su):
            cls, meth = _TK_SATELLITE, f"SETCD suffix '{setcd_str}'"
        # Pure satellite: TK{n}, TK, TKHIGH, TKMID, TKLOW, TKCTRL
        elif re.match(r"^TK(\d+|HIGH|MID|LOW|CTRL)?$", su):
            cls, meth = _TK_SATELLITE, f"SETCD TK prefix '{setcd_str}'"
        # Pure satellite: {n}{sex}TK
        elif re.match(r"^\d+[MF]TK$", su):
            cls, meth = _TK_SATELLITE, f"SETCD sex-split '{setcd_str}'"
        # Recovery + TK: {n}RTK
        elif re.match(r"^\d+RTK$", su):
            cls, meth = _TK_SATELLITE, f"SETCD recovery+TK '{setcd_str}'"
        # Pure satellite: SAT{n}, SATPK, {n}SAT
        elif re.match(r"^(SAT(PK)?\d*|\d+SAT)$", su):
            cls, meth = _TK_SATELLITE, f"SETCD SAT pattern '{setcd_str}'"
        # Pure satellite: PK{n}, PK
        elif re.match(r"^PK\d*$", su):
            cls, meth = _TK_SATELLITE, f"SETCD PK prefix '{setcd_str}'"
        # Ambiguous: {n}{sex}?N?TK (e.g., 1FNTK), MNTK
        elif re.match(r"^(\d+[MF]?N?TK|MNTK)$", su):
            cls, meth = _TK_SATELLITE, f"SETCD ambiguous '{setcd_str}' — pending domain validation"
        else:
            continue

        classifications[setcd_str] = {
            "classification": cls, "method": "SETCD_pattern", "detail": meth,
        }
        unresolved.discard(setcd_str)

    # All remaining are main study
    for setcd_str in unresolved:
        classifications[setcd_str] = {
            "classification": _TK_MAIN, "method": "default",
            "detail": "No TK indicators",
        }

    # ── Step 4: Domain-data validation ───────────────────────────
    # For satellite / candidate sets, check if subjects actually have tox data.
    # If they do, they're combined cohort (not pure satellites).
    needs_validation = [
        s for s, c in classifications.items()
        if c["classification"] == _TK_SATELLITE
    ]

    if needs_validation and dm_df is not None and "SETCD" in dm_df.columns:
        tox_subjects = (
            _prescan_domain_subjects(study, "mi")
            | _prescan_domain_subjects(study, "ma")
            | _prescan_domain_subjects(study, "om")
            | _prescan_domain_subjects(study, "lb")
        )
        pc_subjects = _prescan_domain_subjects(study, "pc")

        # Group size heuristic: compute median main-study group size
        dm_setcd = dm_df["SETCD"].astype(str).str.strip()
        main_setcds = [
            s for s, c in classifications.items()
            if c["classification"] == _TK_MAIN
        ]
        main_sizes = [int((dm_setcd == s).sum()) for s in main_setcds]
        median_main = sorted(main_sizes)[len(main_sizes) // 2] if main_sizes else 0

        for setcd_str in needs_validation:
            set_mask = dm_setcd == setcd_str
            set_ids = set(dm_df.loc[set_mask, "USUBJID"].astype(str).unique())
            if not set_ids:
                continue

            has_tox = bool(set_ids & tox_subjects)
            has_pc = bool(set_ids & pc_subjects)
            set_size = len(set_ids)
            prev = classifications[setcd_str]

            # Group size confidence signal
            small_group = median_main > 0 and set_size < 0.5 * median_main
            size_note = (
                f" Group size {set_size} < 50% of median main ({median_main})"
                f" — supports satellite." if small_group else ""
            )

            if has_tox:
                # Subjects have MI/MA/OM/LB data → combined cohort, NOT satellite
                is_ambiguous = "candidate" in prev.get("method", "")
                classifications[setcd_str] = {
                    "classification": _TK_COMBINED,
                    "method": f"{prev['method']}→domain_validated",
                    "detail": (
                        f"Reclassified combined: subjects have tox domain data. "
                        f"Original: {prev['detail']}"
                    ),
                    "ambiguous": is_ambiguous,
                }
                if is_ambiguous:
                    logger.warning(
                        "SETCD %s: ambiguous TK classification — TK keyword in label "
                        "but subjects have tox data. Classified as combined. "
                        "Manual review recommended.", setcd_str,
                    )
            elif not has_pc:
                # No PK data → probably not TK at all
                classifications[setcd_str] = {
                    "classification": _TK_MAIN,
                    "method": f"{prev['method']}→domain_validated",
                    "detail": (
                        f"Reclassified main: no PC data found. "
                        f"Original: {prev['detail']}"
                    ),
                }
            else:
                # has PC but no tox → confirmed satellite
                classifications[setcd_str]["method"] = (
                    f"{prev['method']}→domain_confirmed"
                )
                classifications[setcd_str]["detail"] = (
                    f"Confirmed satellite: PC data present, no tox domains."
                    f"{size_note} Original: {prev['detail']}"
                )

    # ── Step 5: Cross-validation ─────────────────────────────────
    # Check SPGRPCD linkage and dose consistency between satellite/main pairs.
    satellite_setcds = {
        s for s, c in classifications.items() if c["classification"] == _TK_SATELLITE
    }
    main_setcds_set = {
        s for s, c in classifications.items() if c["classification"] == _TK_MAIN
    }

    if satellite_setcds:
        # SPGRPCD linkage: verify each satellite pairs with a main set
        sat_spgrpcds = {}
        main_spgrpcds = {}
        sat_doses = {}
        main_doses = {}
        for setcd_str, params in set_params.items():
            spgrpcd = params.get("SPGRPCD")
            trtdos = params.get("TRTDOS")
            if setcd_str in satellite_setcds:
                if spgrpcd:
                    sat_spgrpcds[setcd_str] = spgrpcd
                if trtdos:
                    sat_doses[setcd_str] = trtdos
            elif setcd_str in main_setcds_set:
                if spgrpcd:
                    main_spgrpcds[setcd_str] = spgrpcd
                if trtdos:
                    main_doses[setcd_str] = trtdos

        # Check orphan satellites (no matching main SPGRPCD)
        main_grp_values = set(main_spgrpcds.values())
        for sat_set, sat_grp in sat_spgrpcds.items():
            if sat_grp not in main_grp_values:
                prev = classifications[sat_set]
                classifications[sat_set]["detail"] += (
                    f" WARNING: orphan satellite — SPGRPCD '{sat_grp}' has no "
                    f"matching main-study set."
                )

        # Dose consistency: satellite TRTDOS should match paired main set
        grp_to_main_dose: dict[str, str] = {}
        for main_set, grp in main_spgrpcds.items():
            if main_set in main_doses:
                grp_to_main_dose[grp] = main_doses[main_set]

        for sat_set, sat_grp in sat_spgrpcds.items():
            expected_dose = grp_to_main_dose.get(sat_grp)
            actual_dose = sat_doses.get(sat_set)
            if expected_dose and actual_dose and expected_dose != actual_dose:
                classifications[sat_set]["detail"] += (
                    f" WARNING: dose mismatch — satellite TRTDOS={actual_dose}, "
                    f"main set TRTDOS={expected_dose}."
                )

        # PC ground truth: subjects with PC data not in any TK or combined set
        if dm_df is not None and "SETCD" in dm_df.columns:
            combined_setcds = {
                s for s, c in classifications.items()
                if c["classification"] == _TK_COMBINED
            }
            tk_or_combined = satellite_setcds | combined_setcds
            pc_subjects_local = _prescan_domain_subjects(study, "pc")
            if pc_subjects_local:
                dm_setcd_col = dm_df["SETCD"].astype(str).str.strip()
                tk_combined_subjects = set(
                    dm_df.loc[dm_setcd_col.isin(tk_or_combined), "USUBJID"]
                    .astype(str).unique()
                )
                unaccounted_pc = pc_subjects_local - tk_combined_subjects
                if unaccounted_pc:
                    logger.info(
                        "%d subject(s) with PC data not in TK/combined sets — "
                        "possible concomitant TK from main-study animals: %s",
                        len(unaccounted_pc),
                        sorted(list(unaccounted_pc))[:5],
                    )

    return classifications


def _parse_tx(
    study: StudyInfo, dm_df: pd.DataFrame | None = None,
) -> tuple[dict[str, dict], set[str], list[dict]]:
    """Parse TX domain into a map of ARMCD -> {dose_value, dose_unit, label, ...}.

    Uses 5-step cascading TK classification (see _classify_tk_sets).
    Recovery detection priority:
      1. DM.ARM (200-char, untruncated) — primary
      2. TX RECOVDUR parameter — secondary
      3. TX GRPLBL/SETLBL "recovery" substring — fallback

    Returns (tx_map, tk_setcds, tk_report):
      - tx_map: ARMCD -> metadata for non-satellite sets
      - tk_setcds: set of SETCD values for TK satellite sets (excluded from tx_map)
      - tk_report: list of classification dicts for provenance messages
    """
    tx_map: dict[str, dict] = {}
    tk_setcds: set[str] = set()
    tk_report: list[dict] = []
    if "tx" not in study.xpt_files:
        return tx_map, tk_setcds, tk_report

    tx_df, _ = read_xpt(study.xpt_files["tx"])
    tx_df.columns = [c.upper() for c in tx_df.columns]

    # Build DM ARM lookup: armcd → untruncated ARM label (200-char, authoritative)
    dm_arm_map: dict[str, str] = {}
    if dm_df is not None and "ARM" in dm_df.columns and "ARMCD" in dm_df.columns:
        for armcd_val in dm_df["ARMCD"].unique():
            arm_rows = dm_df[dm_df["ARMCD"] == armcd_val]
            dm_arm_map[str(armcd_val).strip()] = str(arm_rows["ARM"].iloc[0]).strip()

    # ── 5-step TK classification ─────────────────────────────────
    tk_classifications = _classify_tk_sets(study, tx_df, dm_df)
    for setcd_str, info in tk_classifications.items():
        if info["classification"] == _TK_SATELLITE:
            tk_setcds.add(setcd_str)
        if info["classification"] != _TK_MAIN:
            tk_report.append({"setcd": setcd_str, **info})

    if tk_report:
        n_sat = sum(1 for r in tk_report if r["classification"] == _TK_SATELLITE)
        n_comb = sum(1 for r in tk_report if r["classification"] == _TK_COMBINED)
        logger.info(
            "TK classification: %d satellite set(s), %d combined set(s)",
            n_sat, n_comb,
        )

    # ── Build tx_map from non-satellite sets ─────────────────────
    for setcd in tx_df["SETCD"].unique():
        setcd_str = str(setcd).strip()

        # Skip satellite sets — they'd cause ARMCD collisions with main sets
        if setcd_str in tk_setcds:
            continue

        set_rows = tx_df[tx_df["SETCD"] == setcd]
        params: dict[str, str] = {}
        for _, row in set_rows.iterrows():
            parm = str(row.get("TXPARMCD", "")).strip()
            val = str(row.get("TXVAL", "")).strip()
            if parm and val and val.lower() != "nan":
                params[parm] = val

        armcd = params.get("ARMCD", str(setcd))
        dose_val = None
        if "TRTDOS" in params:
            try:
                dose_val = float(params["TRTDOS"].replace(",", ""))
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

        # Skip if ARMCD already in tx_map (combined set duplicating a main set)
        if armcd in tx_map:
            continue

        # Compound identity: TRT > COMPTRT > parsed from GRPLBL
        compound = params.get("TRT") or params.get("COMPTRT") or params.get("TRTNAM") or ""
        if not compound and grplbl:
            # Parse "G2 - Compound 1: 12 mg/kg" → "Compound 1"
            m = re.match(r'.*?[-–]\s*(.+?):\s*\d', grplbl)
            if m:
                compound = m.group(1).strip()

        tx_map[armcd] = {
            "dose_value": dose_val,
            "dose_unit": params.get("TRTDOSU"),
            "label": label,
            "setlbl": setlbl,
            "spgrpcd": params.get("SPGRPCD"),
            "tcntrl": params.get("TCNTRL"),
            "sexpop": params.get("SEXPOP"),
            "compound": compound or None,
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

    return tx_map, tk_setcds, tk_report


def _resolve_label(tx_info: dict, dm_arm_label: str = "") -> str:
    """Pick best label for a dose group: GRPLBL > SETLBL > DM.ARM.

    GRPLBL is the group-level label (shared across main+recovery arms).
    SETLBL may include arm-specific suffixes ("nonrec", "rec", "TK").
    DM.ARM may include "Recovery" suffix for recovery arms, so filter those out.

    Detects concatenated GRPLBL patterns (e.g., "Group 250mg/kg/day" where
    group number runs into dose with no separator) and falls back to SETLBL
    or constructed label from dose_value + dose_unit.
    """
    grplbl = tx_info.get("label", "")  # GRPLBL or SETLBL from _parse_tx
    setlbl = tx_info.get("setlbl", "")

    # Check for concatenated GRPLBL: "Group N{dose}{unit}" with no space
    # between group number and dose value (e.g., "Group 250mg/kg/day")
    if grplbl and re.match(r'^Group \d+\d+\s*mg', grplbl, re.IGNORECASE):
        # GRPLBL is corrupted — prefer SETLBL or constructed label
        if setlbl:
            return setlbl
        dv = tx_info.get("dose_value")
        du = tx_info.get("dose_unit", "mg/kg")
        if dv is not None:
            return f"{dv:g} {du or 'mg/kg'}"
        # Can't fix — use as-is
        return grplbl

    if grplbl:
        return grplbl
    if setlbl:
        return setlbl
    if dm_arm_label and "recovery" not in dm_arm_label.lower():
        return dm_arm_label
    return f"Group {tx_info.get('armcd', '?')}"


def _detect_sex_stratified_arms(tx_map: dict) -> bool:
    """Detect whether arms are sex-stratified (separate M/F arms with matching doses).

    Returns True when:
    1. TX.SEXPOP contains single-sex values (M/F) across different arms
    2. Both sexes are represented (not a single-sex study)
    3. At least one dose value appears for both M and F arms
    """
    m_doses: set[float | None] = set()
    f_doses: set[float | None] = set()
    for info in tx_map.values():
        sexpop = (info.get("sexpop") or "").strip().upper()
        if sexpop in ("M", "MALE"):
            m_doses.add(info.get("dose_value"))
        elif sexpop in ("F", "FEMALE"):
            f_doses.add(info.get("dose_value"))
    if not m_doses or not f_doses:
        return False
    return bool(m_doses & f_doses)


def _strip_sex_prefix(label: str) -> str:
    """Remove sex prefix from sex-stratified arm labels.

    Handles: "M-Vehicle", "F - Low", "Male Vehicle", "Female-Low"
    Single-letter M/F requires a dash to avoid false positives ("Medium" → "edium").
    """
    # Try "Male"/"Female" first (optional dash)
    cleaned = re.sub(r'^(?:Male|Female)\s*[-–]?\s*', '', label, flags=re.IGNORECASE).strip()
    if cleaned and cleaned != label:
        return cleaned
    # Then single-letter M/F (requires dash)
    cleaned = re.sub(r'^[MF]\s*[-–]\s*', '', label, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else label


def _merge_sex_stratified_arms(
    tx_map: dict,
    subjects: pd.DataFrame,
    dm_arm_map: dict,
) -> tuple[dict, pd.DataFrame, list[str]]:
    """Merge sex-stratified arms into combined dose groups.

    Groups arms by (dose_value, control_type) and merges M/F variants.
    Returns updated (tx_map, subjects, provenance_messages).
    """
    # Group arms by dose_value, then verify TCNTRL consistency within main arms.
    from collections import defaultdict
    dose_val_groups: dict[float | None, list[str]] = defaultdict(list)
    for armcd, info in tx_map.items():
        sexpop = (info.get("sexpop") or "").strip().upper()
        if sexpop not in ("M", "F", "MALE", "FEMALE"):
            continue
        dose_val_groups[info.get("dose_value")].append(armcd)

    # Only merge groups that have both sexes and consistent TCNTRL on main arms
    merge_map: dict[str, str] = {}  # old_armcd -> canonical_armcd
    merged_count = 0
    for dose_val, armcds in dose_val_groups.items():
        if len(armcds) < 2:
            continue
        sexes = {(tx_map[a].get("sexpop") or "").strip().upper()[0] for a in armcds
                 if (tx_map[a].get("sexpop") or "").strip()}
        if sexes != {"M", "F"}:
            continue  # Not a M/F pair
        # Verify TCNTRL consistency among main (non-recovery) arms
        main_ctrls = {(tx_map[a].get("tcntrl") or "").upper().strip()
                      for a in armcds if not tx_map[a].get("is_recovery")}
        if len(main_ctrls) > 1:
            continue  # Different control types — don't merge (spec edge case #2)

        # Separate main and recovery arms within this dose group
        main_arms = [a for a in armcds if not tx_map[a].get("is_recovery")]
        rec_arms = [a for a in armcds if tx_map[a].get("is_recovery")]

        # Merge main arms: pick first as canonical, remap others
        if len(main_arms) >= 2:
            canonical = main_arms[0]
            # Update label to strip sex prefix
            tx_map[canonical]["label"] = _strip_sex_prefix(tx_map[canonical]["label"])
            tx_map[canonical]["setlbl"] = _strip_sex_prefix(tx_map[canonical].get("setlbl", ""))
            tx_map[canonical]["sexpop"] = "BOTH"
            for other in main_arms[1:]:
                merge_map[other] = canonical
            merged_count += 1

        # Merge recovery arms the same way
        if len(rec_arms) >= 2:
            rec_canonical = rec_arms[0]
            tx_map[rec_canonical]["label"] = _strip_sex_prefix(tx_map[rec_canonical]["label"])
            tx_map[rec_canonical]["setlbl"] = _strip_sex_prefix(tx_map[rec_canonical].get("setlbl", ""))
            tx_map[rec_canonical]["sexpop"] = "BOTH"
            # Update spgrpcd to match canonical main arm's spgrpcd
            if main_arms:
                tx_map[rec_canonical]["spgrpcd"] = tx_map[main_arms[0]].get("spgrpcd")
            for other in rec_arms[1:]:
                merge_map[other] = rec_canonical

    if not merge_map:
        return tx_map, subjects, []

    # Remap subjects: change ARMCD from merged arm to canonical
    subjects["ARMCD"] = subjects["ARMCD"].map(lambda a: merge_map.get(a, a))
    # Update is_recovery after remap
    subjects["is_recovery"] = subjects["ARMCD"].apply(
        lambda a: tx_map.get(a, {}).get("is_recovery", False)
    )

    # Update dm_arm_map for canonical arms
    for old, canonical in merge_map.items():
        if old in dm_arm_map and canonical not in dm_arm_map:
            dm_arm_map[canonical] = dm_arm_map[old]

    # Remove merged arms from tx_map (keep canonical only)
    for old in merge_map:
        tx_map.pop(old, None)

    prov = [
        f"Sex-stratified arms detected: {len(merge_map) + merged_count} sex-specific arms "
        f"merged into {merged_count} combined dose groups by dose value. "
        f"Per-sex statistical comparisons preserved within each merged group."
    ]
    logger.info("Sex-stratified arm merge: remapped %d arms → %d canonical", len(merge_map), merged_count)

    return tx_map, subjects, prov


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
    tx_map, tk_setcds, tk_report = _parse_tx(study, dm_df)

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

    # Fill gaps: DM ARMCDs not in tx_map (e.g., recovery arms encoded as
    # separate DM ARMCDs but sharing TX ARMCD with main arms — GLP003 pattern)
    if tx_map:
        dm_armcds = set(dm_df["ARMCD"].astype(str).str.strip().unique())
        missing = dm_armcds - set(tx_map.keys())
        if missing:
            for armcd in missing:
                arm_rows = dm_df[dm_df["ARMCD"].astype(str).str.strip() == armcd]
                dm_arm = str(arm_rows["ARM"].iloc[0]).strip() if "ARM" in arm_rows.columns else ""
                is_recovery = "recovery" in dm_arm.lower()
                # Inherit dose_value from paired main arm (strip trailing R/r)
                base_armcd = re.sub(r'[Rr]+$', '', armcd)
                base_info = tx_map.get(base_armcd, {})
                tx_map[armcd] = {
                    "dose_value": base_info.get("dose_value"),
                    "dose_unit": base_info.get("dose_unit"),
                    "label": dm_arm or f"Group {armcd}",
                    "setlbl": "",
                    "spgrpcd": base_info.get("spgrpcd"),
                    "tcntrl": base_info.get("tcntrl"),
                    "is_recovery": is_recovery,
                    "is_satellite": "satellite" in dm_arm.lower() or "toxicokinetic" in dm_arm.lower(),
                }
            logger.info(
                "Filled %d DM ARMCDs not in TX: %s (recovery detection via DM.ARM)",
                len(missing), sorted(missing),
            )

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

    # --- Sex-stratified arm merging (before grouping) ---
    sex_strat_prov: list[str] = []
    if _detect_sex_stratified_arms(tx_map):
        tx_map, subjects, sex_strat_prov = _merge_sex_stratified_arms(
            tx_map, subjects, dm_arm_map,
        )

    # --- Determine grouping mode: SPGRPCD vs legacy ---
    has_spgrpcd = any(info.get("spgrpcd") for info in tx_map.values())

    # Use post-merge ARMCDs (subjects may have been remapped)
    all_armcds = list(subjects["ARMCD"].unique())

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

    # ── Classify control types and resolve multi-control ──────────
    # Detect all control arms and their types before building dose groups
    arm_control_types: dict[str, str | None] = {}
    for armcd in main_armcds:
        tx_info = tx_map.get(armcd, {})
        arm_control_types[armcd] = _classify_control(tx_info)

    # Separate positive controls (excluded from dose-response)
    positive_control_arms = {
        a for a, ct in arm_control_types.items()
        if ct in (CTRL_POSITIVE, CTRL_ACTIVE_COMPARATOR)
    }

    # Reference controls (vehicle, negative, untreated, procedural, air, unknown)
    reference_control_arms = {
        a for a, ct in arm_control_types.items()
        if ct is not None and a not in positive_control_arms
    }

    # Multi-control resolution (Path C from control-groups research):
    # When 2+ reference controls exist, designate vehicle as primary.
    # Negative/untreated becomes secondary (informational QC, not in dose-response).
    primary_control_arm: str | None = None
    secondary_control_arms: set[str] = set()
    control_resolution = "single"

    if len(reference_control_arms) > 1:
        control_resolution = "multi_control_path_c"
        # Priority: VEHICLE > UNKNOWN > NEGATIVE > UNTREATED > AIR > PROCEDURAL
        _CTRL_PRIORITY = {
            CTRL_VEHICLE: 0, CTRL_UNKNOWN: 1, CTRL_NEGATIVE: 2,
            CTRL_UNTREATED: 3, CTRL_AIR: 4, CTRL_PROCEDURAL: 5,
        }
        sorted_controls = sorted(
            reference_control_arms,
            key=lambda a: _CTRL_PRIORITY.get(arm_control_types.get(a, ""), 99),
        )
        primary_control_arm = sorted_controls[0]
        secondary_control_arms = set(sorted_controls[1:])
        logger.info(
            "Multi-control detected: primary=%s (%s), secondary=%s. "
            "Path C: vehicle designated as primary reference.",
            primary_control_arm, arm_control_types[primary_control_arm],
            {a: arm_control_types[a] for a in secondary_control_arms},
        )
    elif len(reference_control_arms) == 1:
        primary_control_arm = next(iter(reference_control_arms))

    if positive_control_arms:
        logger.info(
            "Positive control arm(s) excluded from dose-response: %s",
            positive_control_arms,
        )

    # Arms excluded from dose-response: positive controls + secondary controls
    excluded_arms = positive_control_arms | secondary_control_arms

    # Filter main_armcds: exclude non-dose-response arms
    dose_response_armcds = [a for a in main_armcds if a not in excluded_arms]

    # Re-assign dose levels after exclusion (control at 0, treated ascending)
    if excluded_arms:
        level = 0
        for armcd in dose_response_armcds:
            armcd_to_level[armcd] = level
            level += 1
        # Excluded arms get negative sentinel dose_levels
        for armcd in positive_control_arms:
            armcd_to_level[armcd] = -2  # positive control sentinel
        for armcd in secondary_control_arms:
            armcd_to_level[armcd] = -3  # secondary control sentinel
        # Re-assign recovery arms to match their main arm
        for main_arm, rec_arm in recovery_pairing.items():
            if rec_arm and main_arm in armcd_to_level:
                armcd_to_level[rec_arm] = armcd_to_level[main_arm]
        # Update subjects
        subjects["dose_level"] = subjects["ARMCD"].map(armcd_to_level).fillna(-1).astype(int)

    # ── Build dose groups ───────────────────────────────────────────
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

        ctrl_type = arm_control_types.get(armcd)
        is_primary_control = (armcd == primary_control_arm)
        is_secondary_control = (armcd in secondary_control_arms)
        is_positive_control = (armcd in positive_control_arms)

        dose_groups.append({
            "dose_level": armcd_to_level.get(armcd, -1),
            "armcd": armcd,
            "label": group_label,
            "is_control": _is_control(tx_info),
            "control_type": ctrl_type,
            "is_primary_control": is_primary_control,
            "is_secondary_control": is_secondary_control,
            "is_positive_control": is_positive_control,
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
    has_concurrent_control = any(
        dg["is_control"] and not dg["is_positive_control"]
        for dg in dose_groups
    )

    # ── Study configuration classification (Phase G) ────────────────
    # Detect single-arm, active-comparator-only, and other non-standard
    # configurations that need pipeline routing changes.
    n_main_arms = len(main_armcds)
    active_comparator_only = (
        not has_concurrent_control
        and any(
            arm_control_types.get(a) == CTRL_ACTIVE_COMPARATOR
            for a in main_armcds
        )
    )
    single_arm = (n_main_arms == 1 and not has_concurrent_control)

    if single_arm:
        study_configuration = "single_arm"
    elif active_comparator_only:
        study_configuration = "active_comparator_only"
    elif not has_concurrent_control:
        study_configuration = "no_concurrent_control"
    elif control_resolution == "multi_control_path_c":
        study_configuration = "dual_control"
    elif positive_control_arms:
        study_configuration = "vehicle_plus_positive"
    else:
        study_configuration = "standard"

    if study_configuration not in ("standard", "dual_control"):
        logger.info("Study configuration: %s", study_configuration)

    # ── Multi-compound detection ────────────────────────────────────
    # Collect unique compound identities across treated (non-control) arms.
    # When > 1 compound detected, JT trend test across compounds is
    # scientifically meaningless — flag for per-compound stratification.
    compounds = set()
    for g in dose_groups:
        tx_info = tx_map.get(g["armcd"], {})
        compound = tx_info.get("compound")
        g["compound"] = compound
        if compound and not g["is_control"] and g["dose_level"] >= 0:
            compounds.add(compound)

    is_multi_compound = len(compounds) > 1
    if is_multi_compound:
        logger.info(
            "Multi-compound study detected: %d compounds (%s). "
            "JT trend test across compounds is suppressed.",
            len(compounds), sorted(compounds),
        )

    return {
        "dose_groups": dose_groups,
        "subjects": subjects,
        "tx_map": tx_map,
        "tk_count": tk_count,
        "tk_setcds": tk_setcds,
        "tk_report": tk_report,
        "has_concurrent_control": has_concurrent_control,
        "study_configuration": study_configuration,
        "control_resolution": control_resolution,
        "primary_control_arm": primary_control_arm,
        "secondary_control_arms": list(secondary_control_arms),
        "positive_control_arms": list(positive_control_arms),
        "is_multi_compound": is_multi_compound,
        "compounds": sorted(compounds) if compounds else [],
        "sex_stratified_merge": sex_strat_prov,
    }


# ---------------------------------------------------------------------------
# Grouping strategies
# ---------------------------------------------------------------------------

# ── Control type constants ──────────────────────────────────────────────
CTRL_VEHICLE = "VEHICLE_CONTROL"
CTRL_NEGATIVE = "NEGATIVE_CONTROL"
CTRL_POSITIVE = "POSITIVE_CONTROL"
CTRL_PROCEDURAL = "PROCEDURAL_CONTROL"
CTRL_UNTREATED = "UNTREATED_CONTROL"
CTRL_AIR = "AIR_CONTROL"
CTRL_ACTIVE_COMPARATOR = "ACTIVE_COMPARATOR"
CTRL_UNKNOWN = "UNKNOWN_CONTROL"
CTRL_NONE = None  # Not a control arm

# TCNTRL normalization map — Tier 1 (high confidence, direct match)
# Source: Carfagna et al. 2021, PhUSE WP-058, FDA SEND repository (>1,800 studies)
_TCNTRL_TIER1: dict[str, str] = {}
for _val, _type in [
    # Vehicle controls
    ("vehicle control", CTRL_VEHICLE),
    ("vehicle", CTRL_VEHICLE),
    ("saline control", CTRL_VEHICLE),
    ("peg control", CTRL_VEHICLE),
    ("citrate buffer control", CTRL_VEHICLE),
    ("formulation buffer", CTRL_VEHICLE),
    ("excipient", CTRL_VEHICLE),
    ("excipient control", CTRL_VEHICLE),
    ("control article (vehicle)", CTRL_VEHICLE),
    ("control (vehicle)", CTRL_VEHICLE),
    ("capsule control", CTRL_VEHICLE),
    ("solution vehicle control", CTRL_VEHICLE),
    ("gel vehicle control", CTRL_VEHICLE),
    # Negative controls
    ("negative control", CTRL_NEGATIVE),
    ("placebo control", CTRL_NEGATIVE),
    ("placebo", CTRL_NEGATIVE),
    # Procedural controls
    ("sham control", CTRL_PROCEDURAL),
    ("sham", CTRL_PROCEDURAL),
    ("mock-infected control", CTRL_PROCEDURAL),
    ("procedural control", CTRL_PROCEDURAL),
    # Untreated controls
    ("untreated control", CTRL_UNTREATED),
    ("untreated", CTRL_UNTREATED),
    ("absolute control", CTRL_UNTREATED),
    # Air controls
    ("air control", CTRL_AIR),
]:
    _TCNTRL_TIER1[_val] = _type

# Tier 2 — ambiguous TCNTRL values that need secondary resolution
_TCNTRL_TIER2 = {
    "control", "control article", "control item", "reference item",
    "reference control", "dosed control", "water control", "water",
}

# Tier 3 — data quality errors (provide no information)
_TCNTRL_TIER3 = {
    "not applicable", "not available", "none", "see protocol", "n/a",
}


def _classify_control(tx_info: dict) -> str | None:
    """Classify control type from TX metadata using 3-tier TCNTRL normalization.

    Returns a CTRL_* constant, or None if the arm is not a control.

    Normalization tiers (from control-groups-model-29mar2026.md §5):
      Tier 1: High-confidence direct match (40+ known TCNTRL values)
      Tier 2: Ambiguous values resolved via dose_value / label context
      Tier 3: Data quality errors treated as missing
    """
    tcntrl = tx_info.get("tcntrl")
    tcntrl_str = str(tcntrl).strip() if tcntrl else ""
    tcntrl_lower = tcntrl_str.lower()

    # ── Cross-check: TCNTRL on a treated arm (dose > 0) ──
    # Some sponsors put TCNTRL on ALL arms to document the vehicle formulation
    # (FFU pattern: TCNTRL="Vehicle Control" + TRTDOS=12 on a treated arm).
    # If dose_value > 0 and TCNTRL is a vehicle/negative type, the arm is
    # treated, not control. Only dose_value=0 arms are true vehicle controls.
    dv = tx_info.get("dose_value")
    if dv is not None and dv > 0 and tcntrl_lower:
        # Positive controls at dose > 0 are still positive controls
        if "positive" in tcntrl_lower:
            return CTRL_POSITIVE
        # Active comparators at dose > 0 are still active comparators
        if tcntrl_lower in _TCNTRL_TIER2:
            tier2_resolved = _TCNTRL_TIER1.get(tcntrl_lower)
            if tier2_resolved == CTRL_ACTIVE_COMPARATOR:
                return CTRL_ACTIVE_COMPARATOR
        # Otherwise: TCNTRL on a dosed arm is vehicle documentation, not control classification
        return CTRL_NONE

    # ── Tier 1: Direct match ──
    if tcntrl_lower in _TCNTRL_TIER1:
        return _TCNTRL_TIER1[tcntrl_lower]

    # Positive control: any TCNTRL containing "positive" (case-insensitive)
    if tcntrl_lower and "positive" in tcntrl_lower:
        return CTRL_POSITIVE

    # ── Tier 3: Data quality errors → treat as no TCNTRL ──
    if tcntrl_lower in _TCNTRL_TIER3:
        tcntrl_lower = ""

    # ── Tier 2: Ambiguous TCNTRL → resolve with context ──
    if tcntrl_lower in _TCNTRL_TIER2:
        dv = tx_info.get("dose_value")
        if dv is not None and dv == 0:
            return CTRL_VEHICLE
        # Has dose > 0 → could be active comparator or positive control
        if dv is not None and dv > 0:
            return CTRL_ACTIVE_COMPARATOR
        # No dose info → assume vehicle control (most common case)
        return CTRL_VEHICLE

    # ── No TCNTRL or unrecognized → fall back to heuristics ──
    dv = tx_info.get("dose_value")
    if dv is not None and dv == 0:
        return CTRL_VEHICLE

    label = tx_info.get("label", "").lower()
    if "vehicle" in label:
        return CTRL_VEHICLE
    if "negative control" in label or "untreated" in label:
        return CTRL_UNTREATED
    if "positive control" in label:
        return CTRL_POSITIVE
    if "sham" in label:
        return CTRL_PROCEDURAL
    if "control" in label or "reference" in label:
        # Generic "control" in label without more context → vehicle (most common)
        return CTRL_VEHICLE

    return CTRL_NONE


def _is_control(tx_info: dict) -> bool:
    """Backwards-compatible boolean control check.

    Returns True for any control type EXCEPT positive control and
    active comparator (these are excluded from dose-response analysis).
    """
    ctrl_type = _classify_control(tx_info)
    if ctrl_type is None:
        return False
    # Positive controls and active comparators are NOT the reference group
    return ctrl_type not in (CTRL_POSITIVE, CTRL_ACTIVE_COMPARATOR)


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
