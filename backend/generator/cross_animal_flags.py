"""Cross-animal intelligence flags: tissue battery, tumor linkage, recovery narratives.

Generates cross_animal_flags.json consumed by the frontend for data quality
warnings and cross-animal pattern detection.
"""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt

# ICH S1B standard carcinogenicity study durations (weeks)
CARCINOGENICITY_WEEKS: dict[str, int] = {"RAT": 104, "MOUSE": 104}

# Wasting-associated organs (subset of XS09 syndrome targets)
WASTING_ORGANS = {"THYMUS", "SPLEEN", "LYMPH NODE", "BONE MARROW"}
WASTING_TERMS = {"ATROPHY", "WASTING", "DEPLETION", "INVOLUTION", "NECROSIS"}


def build_cross_animal_flags(
    findings: list[dict],
    study: StudyInfo,
    subjects: pd.DataFrame,
    dose_groups: list[dict],
    mortality: dict | None,
    tumor_summary: dict | None,
) -> dict:
    """Build all three cross-animal flag analyses.

    Returns a dict with tissue_battery, tumor_linkage, and recovery_narratives keys.
    """
    tissue_battery = _compute_tissue_battery(study, subjects, findings)
    tumor_linkage = _compute_tumor_linkage(
        findings, study, subjects, dose_groups, mortality, tumor_summary,
        tissue_battery,
    )
    recovery_narratives = _compute_recovery_narratives(
        study, subjects, dose_groups, mortality,
    )

    return {
        "tissue_battery": tissue_battery,
        "tumor_linkage": tumor_linkage,
        "recovery_narratives": recovery_narratives,
    }


# ── 1A. Tissue battery completeness ─────────────────────────


def _compute_tissue_battery(
    study: StudyInfo,
    subjects: pd.DataFrame,
    findings: list[dict],
) -> dict:
    """Check tissue battery completeness per animal against sacrifice-group reference."""
    result: dict = {
        "reference_batteries": {},
        "has_reduced_recovery_battery": False,
        "flagged_animals": [],
        "study_level_note": None,
    }

    if "mi" not in study.xpt_files:
        return result

    try:
        mi_df, _ = read_xpt(study.xpt_files["mi"])
        mi_df.columns = [c.upper() for c in mi_df.columns]
    except Exception:
        return result

    if "USUBJID" not in mi_df.columns or "MISPEC" not in mi_df.columns:
        return result

    # Build per-animal specimen sets from all MI records (including normals)
    per_animal: dict[str, set[str]] = {}
    for _, row in mi_df.iterrows():
        uid = str(row["USUBJID"])
        spec = str(row.get("MISPEC", "")).strip().upper()
        if spec:
            per_animal.setdefault(uid, set()).add(spec)

    # Merge subject metadata
    subj_map: dict[str, dict] = {}
    for _, row in subjects.iterrows():
        uid = str(row["USUBJID"])
        subj_map[uid] = {
            "sex": str(row.get("SEX", "")),
            "is_recovery": bool(row.get("is_recovery", False)),
            "is_satellite": bool(row.get("is_satellite", False)),
            "dose_level": int(row.get("dose_level", -1)),
        }

    # Split into sacrifice groups: (is_recovery, sex) → list of (USUBJID, specimen_set)
    groups: dict[tuple[bool, str], list[tuple[str, set[str]]]] = {}
    for uid, specs in per_animal.items():
        info = subj_map.get(uid)
        if not info or info["is_satellite"]:
            continue
        key = (info["is_recovery"], info["sex"])
        groups.setdefault(key, []).append((uid, specs))

    # Build reference batteries from control animals (dose_level == 0)
    ref_batteries: dict[str, dict] = {}
    for (is_rec, sex), animals in groups.items():
        group_name = f"{'recovery' if is_rec else 'terminal'}_{sex}"
        controls = [
            (uid, specs) for uid, specs in animals
            if subj_map[uid]["dose_level"] == 0
        ]

        if controls:
            # Union of all specimens across control animals
            ref_specs = set()
            for _, specs in controls:
                ref_specs |= specs
            ref_batteries[group_name] = {
                "expected_count": len(ref_specs),
                "specimens": sorted(ref_specs),
                "source": "control",
            }
        elif is_rec:
            # No recovery controls — use animal with most MI records
            if animals:
                best_uid, best_specs = max(animals, key=lambda x: len(x[1]))
                # Check if count ≥ 80% of terminal battery
                terminal_key = f"terminal_{sex}"
                terminal_ref = ref_batteries.get(terminal_key)
                if (
                    terminal_ref
                    and len(best_specs) >= 0.8 * terminal_ref["expected_count"]
                ):
                    # Use terminal reference instead
                    ref_batteries[group_name] = {
                        "expected_count": terminal_ref["expected_count"],
                        "specimens": terminal_ref["specimens"],
                        "source": "terminal_fallback",
                    }
                else:
                    ref_batteries[group_name] = {
                        "expected_count": len(best_specs),
                        "specimens": sorted(best_specs),
                        "source": f"max_recovery_animal ({best_uid[-4:]})",
                    }

    result["reference_batteries"] = ref_batteries

    # Check for reduced recovery battery
    for sex in ("M", "F"):
        term_key = f"terminal_{sex}"
        rec_key = f"recovery_{sex}"
        if term_key in ref_batteries and rec_key in ref_batteries:
            term_count = ref_batteries[term_key]["expected_count"]
            rec_count = ref_batteries[rec_key]["expected_count"]
            if rec_count < term_count * 0.8:
                result["has_reduced_recovery_battery"] = True
                break

    # Collect target organs from adverse MI findings
    target_organs: set[str] = set()
    for f in findings:
        if f.get("domain") == "MI" and f.get("severity") == "adverse":
            spec = str(f.get("specimen", "")).strip().upper()
            if spec:
                target_organs.add(spec)

    # Compare each non-TK animal against reference
    flagged = []
    for uid, specs in per_animal.items():
        info = subj_map.get(uid)
        if not info or info["is_satellite"]:
            continue

        group_name = f"{'recovery' if info['is_recovery'] else 'terminal'}_{info['sex']}"
        ref = ref_batteries.get(group_name)
        if not ref:
            continue

        expected = ref["expected_count"]
        if expected == 0:
            continue

        examined = len(specs)
        pct = round(examined / expected * 100, 1)

        if pct < 80:
            missing = sorted(set(ref["specimens"]) - specs)
            missing_targets = sorted(set(missing) & target_organs)

            flagged.append({
                "animal_id": uid,
                "sex": info["sex"],
                "sacrifice_group": "recovery" if info["is_recovery"] else "terminal",
                "examined_count": examined,
                "expected_count": expected,
                "completion_pct": pct,
                "missing_specimens": missing,
                "missing_target_organs": missing_targets,
                "flag": True,
                "reference_source": ref["source"],
            })

    result["flagged_animals"] = flagged

    if len(flagged) >= 2:
        details = ", ".join(
            f"{f['animal_id'][-4:]}: {f['examined_count']}/{f['expected_count']}"
            for f in flagged[:4]
        )
        result["study_level_note"] = (
            f"{len(flagged)} animals below 80% expected ({details})"
        )

    return result


# ── 1B. Cross-animal tumor linkage ──────────────────────────


def _compute_tumor_linkage(
    findings: list[dict],
    study: StudyInfo,
    subjects: pd.DataFrame,
    dose_groups: list[dict],
    mortality: dict | None,
    tumor_summary: dict | None,
    tissue_battery: dict | None,
) -> dict:
    """Compute tumor dose-response incidence and generate interpretive flags."""
    result: dict = {
        "tumor_dose_response": [],
        "banner_text": None,
    }

    if "tf" not in study.xpt_files:
        return result

    try:
        tf_df, _ = read_xpt(study.xpt_files["tf"])
        tf_df.columns = [c.upper() for c in tf_df.columns]
    except Exception:
        return result

    if "USUBJID" not in tf_df.columns:
        return result

    # Parse study metadata for duration + species
    study_weeks = _get_study_duration_weeks(study)
    species_upper, strain = _get_species_strain(study)

    # Build per-animal tumor records
    spec_col = "TFSPEC" if "TFSPEC" in tf_df.columns else "MISPEC" if "MISPEC" in tf_df.columns else None
    find_col = "TFSTRESC" if "TFSTRESC" in tf_df.columns else "TFORRES" if "TFORRES" in tf_df.columns else None
    cat_col = "TFRESCAT" if "TFRESCAT" in tf_df.columns else None

    if not spec_col or not find_col:
        return result

    # Build subject lookup
    subj_map: dict[str, dict] = {}
    for _, row in subjects.iterrows():
        uid = str(row["USUBJID"])
        subj_map[uid] = {
            "sex": str(row.get("SEX", "")),
            "is_recovery": bool(row.get("is_recovery", False)),
            "is_satellite": bool(row.get("is_satellite", False)),
            "dose_level": int(row.get("dose_level", -1)),
        }

    # Build per-animal specimens examined (from tissue battery)
    per_animal_specs: dict[str, set[str]] = {}
    if "mi" in study.xpt_files:
        try:
            mi_df, _ = read_xpt(study.xpt_files["mi"])
            mi_df.columns = [c.upper() for c in mi_df.columns]
            for _, row in mi_df.iterrows():
                uid = str(row["USUBJID"])
                spec = str(row.get("MISPEC", "")).strip().upper()
                if spec:
                    per_animal_specs.setdefault(uid, set()).add(spec)
        except Exception:
            pass

    dose_label_map = {dg["dose_level"]: dg.get("label", "") for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}

    # Mortality lookup: USUBJID → death record
    death_map: dict[str, dict] = {}
    if mortality:
        for d in mortality.get("deaths", []):
            death_map[d["USUBJID"]] = d
        for a in mortality.get("accidentals", []):
            death_map[a["USUBJID"]] = a

    # Group TF records by (specimen, finding, behavior)
    tumor_groups: dict[tuple[str, str, str], list[dict]] = {}
    for _, row in tf_df.iterrows():
        uid = str(row["USUBJID"])
        info = subj_map.get(uid)
        if not info or info["is_satellite"]:
            continue

        specimen = str(row[spec_col]).strip().upper()
        finding = str(row[find_col]).strip().upper()
        behavior = str(row[cat_col]).strip().upper() if cat_col else "UNCERTAIN"

        key = (specimen, finding, behavior)
        tumor_groups.setdefault(key, []).append({
            "uid": uid,
            "specimen": specimen,
            "finding": finding,
            "behavior": behavior,
            "sex": info["sex"],
            "dose_level": info["dose_level"],
            "is_recovery": info["is_recovery"],
        })

    # Build dose-response per tumor type
    all_levels = sorted(dose_value_map.keys())
    tumor_dose_response = []

    for (specimen, finding, behavior), records in tumor_groups.items():
        # Incidence per dose group: compute per sex
        incidence_by_dose = []
        animal_ids = list({r["uid"] for r in records})

        for dl in all_levels:
            # Denominator: main study animals at this dose where this tissue was examined
            animals_at_dose = [
                uid for uid, info in subj_map.items()
                if info["dose_level"] == dl and not info["is_satellite"]
            ]
            males_examined = [
                uid for uid in animals_at_dose
                if subj_map[uid]["sex"] == "M"
                and specimen in per_animal_specs.get(uid, set())
            ]
            females_examined = [
                uid for uid in animals_at_dose
                if subj_map[uid]["sex"] == "F"
                and specimen in per_animal_specs.get(uid, set())
            ]
            males_affected = len([
                r for r in records if r["dose_level"] == dl and r["sex"] == "M"
            ])
            females_affected = len([
                r for r in records if r["dose_level"] == dl and r["sex"] == "F"
            ])

            incidence_by_dose.append({
                "dose_level": dl,
                "dose_label": dose_label_map.get(dl, ""),
                "males": {"affected": males_affected, "total": len(males_examined)},
                "females": {"affected": females_affected, "total": len(females_examined)},
            })

        # Animal details
        animal_details = []
        for uid in animal_ids:
            info = subj_map.get(uid, {})
            death = death_map.get(uid)
            animal_details.append({
                "id": uid,
                "sex": info.get("sex", ""),
                "arm": "recovery" if info.get("is_recovery") else "terminal",
                "death_day": death.get("study_day") if death else None,
                "scheduled": death is None,  # if no death record, it was scheduled
            })

        # Generate flags
        flags = _generate_tumor_flags(
            specimen, finding, behavior, records, incidence_by_dose,
            study_weeks, species_upper, strain, all_levels, dose_label_map,
        )

        denominator_note = "Terminal + recovery animals where tissue was examined (TK excluded)"

        tumor_dose_response.append({
            "specimen": specimen,
            "finding": finding,
            "behavior": behavior,
            "incidence_by_dose": incidence_by_dose,
            "animal_ids": animal_ids,
            "animal_details": animal_details,
            "flags": flags,
            "denominator_note": denominator_note,
        })

    result["tumor_dose_response"] = tumor_dose_response

    # Banner text: most concerning tumor (malignant first, highest total incidence)
    if tumor_dose_response:
        # Sort: malignant first, then by total affected count
        def _concern_key(t: dict) -> tuple:
            is_malignant = 1 if t["behavior"] == "MALIGNANT" else 0
            total = sum(
                d["males"]["affected"] + d["females"]["affected"]
                for d in t["incidence_by_dose"]
            )
            return (-is_malignant, -total)

        sorted_tumors = sorted(tumor_dose_response, key=_concern_key)
        top = sorted_tumors[0]
        total_affected = sum(
            d["males"]["affected"] + d["females"]["affected"]
            for d in top["incidence_by_dose"]
        )
        # Find dose with most affected
        max_dose_entry = max(
            top["incidence_by_dose"],
            key=lambda d: d["males"]["affected"] + d["females"]["affected"],
        )
        max_dose_total = (
            max_dose_entry["males"]["total"] + max_dose_entry["females"]["total"]
        )
        max_dose_affected = (
            max_dose_entry["males"]["affected"] + max_dose_entry["females"]["affected"]
        )

        # Build parenthetical context from flags
        context_parts: list[str] = []
        both_sexes = max_dose_entry["males"]["affected"] > 0 and max_dose_entry["females"]["affected"] > 0
        if both_sexes:
            context_parts.append("both sexes")
        if study_weeks is not None:
            context_parts.append(f"{study_weeks}-week study")
        context_suffix = f" ({', '.join(context_parts)})" if context_parts else ""

        result["banner_text"] = (
            f"{top['finding'].lower()}: "
            f"{max_dose_affected}/{max_dose_total} at {max_dose_entry['dose_label']}"
            f"{context_suffix}"
        )

    return result


def _generate_tumor_flags(
    specimen: str,
    finding: str,
    behavior: str,
    records: list[dict],
    incidence_by_dose: list[dict],
    study_weeks: int | None,
    species_upper: str,
    strain: str,
    all_levels: list[int],
    dose_label_map: dict[int, str],
) -> list[str]:
    """Generate interpretive flags for a single tumor type."""
    flags: list[str] = []

    # Per-dose affected counts (combined sex)
    affected_by_dose = {
        d["dose_level"]: d["males"]["affected"] + d["females"]["affected"]
        for d in incidence_by_dose
    }

    # ≥2 at same dose, 0 at lower doses
    for dl in all_levels:
        n = affected_by_dose.get(dl, 0)
        if n >= 2:
            lower_total = sum(affected_by_dose.get(l, 0) for l in all_levels if l < dl)
            if lower_total == 0:
                label = dose_label_map.get(dl, str(dl))
                flags.append(f"Dose-dependent: {n} at {label}, 0 at lower doses")

    # Both sexes affected at same dose
    for d in incidence_by_dose:
        if d["males"]["affected"] > 0 and d["females"]["affected"] > 0:
            flags.append(f"Both sexes affected at {d['dose_label']}")

    # Malignant neoplasm in short-duration study
    if behavior == "MALIGNANT" and study_weeks is not None:
        carc_weeks = CARCINOGENICITY_WEEKS.get(species_upper)
        if carc_weeks is not None:
            strain_species = f"{strain} {species_upper.lower()}" if strain else species_upper.lower()
            flags.append(
                f"Malignant neoplasm in {strain_species} at {study_weeks} weeks. "
                f"Standard carcinogenicity duration: {carc_weeks} weeks for this species."
            )
        else:
            flags.append(
                f"Malignant neoplasm identified in a {study_weeks}-week study"
            )

    # Recovery animals affected
    recovery_records = [r for r in records if r["is_recovery"]]
    terminal_records = [r for r in records if not r["is_recovery"]]
    if recovery_records:
        flags.append(
            "Found during recovery — tumor persisted/progressed post-treatment"
        )
        # Terminal + recovery at same dose
        rec_doses = {r["dose_level"] for r in recovery_records}
        term_doses = {r["dose_level"] for r in terminal_records}
        overlap = rec_doses & term_doses
        for dl in overlap:
            label = dose_label_map.get(dl, str(dl))
            flags.append(
                f"Present at terminal AND recovery at {label} — irreversible"
            )

    # Highest dose only
    affected_doses = [dl for dl, n in affected_by_dose.items() if n > 0]
    if affected_doses and max(affected_doses) == max(all_levels) and len(affected_doses) == 1:
        flags.append("High-dose only — may exceed maximum tolerated dose")

    # Deduplicate flags
    seen: set[str] = set()
    unique_flags: list[str] = []
    for f in flags:
        if f not in seen:
            seen.add(f)
            unique_flags.append(f)

    return unique_flags


# ── 1C. Recovery-period death narratives ─────────────────────


def _compute_recovery_narratives(
    study: StudyInfo,
    subjects: pd.DataFrame,
    dose_groups: list[dict],
    mortality: dict | None,
) -> list[dict]:
    """Generate interpretive narratives for recovery-period deaths."""
    if not mortality or not mortality.get("deaths"):
        return []

    dose_label_map = {dg["dose_level"]: dg.get("label", "") for dg in dose_groups}

    # Filter to recovery deaths (unscheduled)
    recovery_deaths = [
        d for d in mortality["deaths"]
        if d.get("is_recovery") and not d.get("is_satellite", False)
    ]
    if not recovery_deaths:
        return []

    # Try to read SE domain for recovery start day
    recovery_start_days = _get_recovery_start_days(study, subjects)

    # Read BW data
    bw_data: dict[str, list[dict]] = {}
    if "bw" in study.xpt_files:
        try:
            bw_df, _ = read_xpt(study.xpt_files["bw"])
            bw_df.columns = [c.upper() for c in bw_df.columns]
            for _, row in bw_df.iterrows():
                uid = str(row["USUBJID"])
                day_val = row.get("BWDY", row.get("VISITDY"))
                if day_val is None:
                    continue
                try:
                    day = int(float(str(day_val)))
                except (ValueError, TypeError):
                    continue
                val_raw = row.get("BWSTRESN", row.get("BWORRES"))
                if val_raw is None:
                    continue
                try:
                    val = float(str(val_raw))
                except (ValueError, TypeError):
                    continue
                bw_data.setdefault(uid, []).append({"day": day, "value": val})
        except Exception:
            pass

    # Read MI for COD detection
    mi_per_animal: dict[str, list[dict]] = {}
    if "mi" in study.xpt_files:
        try:
            mi_df, _ = read_xpt(study.xpt_files["mi"])
            mi_df.columns = [c.upper() for c in mi_df.columns]
            for _, row in mi_df.iterrows():
                uid = str(row["USUBJID"])
                finding = str(row.get("MISTRESC", row.get("MIORRES", ""))).strip().upper()
                specimen = str(row.get("MISPEC", "")).strip().upper()
                rescat = str(row.get("MIRESCAT", "")).strip().upper()
                severity = str(row.get("MISEV", "")).strip().upper()
                if finding:
                    mi_per_animal.setdefault(uid, []).append({
                        "finding": finding,
                        "specimen": specimen,
                        "rescat": rescat,
                        "severity": severity,
                    })
        except Exception:
            pass

    narratives = []
    for death in recovery_deaths:
        uid = death["USUBJID"]
        sex = death.get("sex", "")
        dose_level = death.get("dose_level", -1)
        dose_label = dose_label_map.get(dose_level, death.get("dose_label", ""))
        death_day = death.get("study_day")

        # Recovery start day
        rec_start = recovery_start_days.get(uid)
        if rec_start is None:
            # Fallback: estimate from subject metadata or skip
            continue

        # BW during recovery
        bw_records = bw_data.get(uid, [])
        recovery_bw = sorted(
            [b for b in bw_records if b["day"] >= rec_start],
            key=lambda b: b["day"],
        )

        bw_trend = "unknown"
        bw_change_pct = 0.0
        bw_start = None
        bw_last = None

        if len(recovery_bw) >= 3:
            bw_start = recovery_bw[0]["value"]
            bw_last = recovery_bw[-1]["value"]
            if bw_start > 0:
                bw_change_pct = round((bw_last - bw_start) / bw_start * 100, 1)
                if bw_change_pct > 5:
                    bw_trend = "gaining"
                elif bw_change_pct < -5:
                    bw_trend = "declining"
                else:
                    bw_trend = "stable"

        # COD detection from MI
        cod_finding = None
        cod_specimen = None
        cod_wasting_related = False
        mi_findings = mi_per_animal.get(uid, [])
        if mi_findings:
            # Priority: malignant neoplasm → highest severity
            malignants = [f for f in mi_findings if f["rescat"] == "MALIGNANT"]
            if malignants:
                cod_entry = malignants[0]
            else:
                # Highest severity
                sev_order = {"MARKED": 4, "SEVERE": 4, "MODERATE": 3, "MILD": 2, "SLIGHT": 2, "MINIMAL": 1}
                cod_entry = max(
                    [f for f in mi_findings if f["finding"] and f["finding"] != "NORMAL"],
                    key=lambda f: sev_order.get(f["severity"], 0),
                    default=None,
                )
            if cod_entry:
                cod_finding = cod_entry["finding"]
                cod_specimen = cod_entry["specimen"]
                # Wasting-relatedness check
                is_neoplasm = cod_entry["rescat"] in ("MALIGNANT", "BENIGN")
                if is_neoplasm and cod_specimen not in WASTING_ORGANS:
                    cod_wasting_related = False
                elif cod_specimen in WASTING_ORGANS:
                    cod_wasting_related = True
                elif any(term in cod_finding for term in WASTING_TERMS):
                    cod_wasting_related = True

        # Generate narrative
        days_in_recovery = (death_day - rec_start) if death_day is not None else None
        narrative = _build_narrative(
            bw_trend, bw_change_pct, cod_finding, cod_specimen, cod_wasting_related,
        )

        narratives.append({
            "animal_id": uid,
            "sex": sex,
            "dose_label": dose_label,
            "recovery_start_day": rec_start,
            "death_day": death_day,
            "days_in_recovery": days_in_recovery,
            "bw_trend": bw_trend,
            "bw_change_pct": bw_change_pct,
            "bw_start": bw_start,
            "bw_last": bw_last,
            "cod_finding": cod_finding,
            "cod_specimen": cod_specimen,
            "cod_wasting_related": cod_wasting_related,
            "narrative": narrative,
        })

    return narratives


def _build_narrative(
    bw_trend: str,
    bw_change_pct: float,
    cod_finding: str | None,
    cod_specimen: str | None,
    cod_wasting_related: bool,
) -> str:
    """Build a human-readable narrative string per the spec lookup table."""
    pct_str = f"+{bw_change_pct}%" if bw_change_pct > 0 else f"{bw_change_pct}%"
    organ_str = cod_specimen.lower() if cod_specimen else ""

    # Use categorical name: "neoplasia" for tumors, otherwise the finding text
    if cod_finding:
        upper = cod_finding.upper()
        if "CARCINOMA" in upper or "ADENOMA" in upper or "NEOPLASM" in upper or "SARCOMA" in upper:
            cod_category = f"{organ_str} neoplasia" if organ_str else "neoplasia"
        else:
            cod_category = cod_finding.lower()
    else:
        cod_category = "unknown cause"

    if bw_trend == "gaining":
        if not cod_wasting_related:
            return (
                f"BW gaining ({pct_str}) — death from independent "
                f"{cod_category}, not wasting"
            )
        else:
            return (
                f"BW gaining ({pct_str}) — terminal organ damage "
                f"from treatment period ({organ_str})" if organ_str else
                f"BW gaining ({pct_str}) — terminal organ damage from treatment period"
            )
    elif bw_trend == "declining":
        return f"BW not recovered ({pct_str}) at time of death — {cod_category}"
    elif bw_trend == "stable":
        return f"BW stable during recovery — {cod_category}"
    else:
        return f"Recovery death — {cod_category}"


# ── Helpers ──────────────────────────────────────────────────


def _get_recovery_start_days(
    study: StudyInfo,
    subjects: pd.DataFrame,
) -> dict[str, int]:
    """Get recovery period start day per subject from SE domain.

    SE may have SESTDY (study day) directly, or SESTDTC (ISO date) that must be
    converted to study day relative to the first dosing date (Day 1).
    """
    from datetime import datetime

    result: dict[str, int] = {}

    if "se" not in study.xpt_files:
        return result

    try:
        se_df, _ = read_xpt(study.xpt_files["se"])
        se_df.columns = [c.upper() for c in se_df.columns]
    except Exception:
        return result

    if "USUBJID" not in se_df.columns or "ETCD" not in se_df.columns:
        return result

    has_sestdy = "SESTDY" in se_df.columns
    has_sestdtc = "SESTDTC" in se_df.columns

    if not has_sestdy and not has_sestdtc:
        return result

    # If using dates, find each subject's Day 1 (start of first treatment element)
    day1_map: dict[str, datetime] = {}
    if has_sestdtc and not has_sestdy:
        for _, row in se_df.iterrows():
            etcd = str(row.get("ETCD", "")).strip().upper()
            # Treatment elements start with TRT
            if etcd.startswith("TRT"):
                uid = str(row["USUBJID"])
                dtc = str(row.get("SESTDTC", "")).strip()
                if dtc and uid not in day1_map:
                    try:
                        dt = datetime.fromisoformat(dtc[:10])
                        day1_map[uid] = dt
                    except (ValueError, TypeError):
                        pass

    for _, row in se_df.iterrows():
        etcd = str(row.get("ETCD", "")).strip().upper()
        if "REC" not in etcd and "WASHOUT" not in etcd:
            continue

        uid = str(row["USUBJID"])

        if has_sestdy:
            try:
                result[uid] = int(float(str(row["SESTDY"])))
                continue
            except (ValueError, TypeError):
                pass

        # Fallback: compute from SESTDTC
        if has_sestdtc and uid in day1_map:
            dtc = str(row.get("SESTDTC", "")).strip()
            if dtc:
                try:
                    rec_dt = datetime.fromisoformat(dtc[:10])
                    # Study day 1 = first dosing date, so day = delta + 1
                    delta = (rec_dt - day1_map[uid]).days + 1
                    result[uid] = delta
                except (ValueError, TypeError):
                    pass

    return result


def _get_study_duration_weeks(study: StudyInfo) -> int | None:
    """Get study dosing duration in weeks from TS domain."""
    if "ts" not in study.xpt_files:
        return None
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        for _, row in ts_df.iterrows():
            parmcd = str(row.get("TSPARMCD", "")).strip().upper()
            if parmcd in ("DOSDUR", "PLESSION"):
                val = str(row.get("TSVAL", "")).strip()
                # Parse "P13W" or "13 WEEKS" or similar
                import re
                m = re.match(r"P?(\d+)\s*W", val, re.IGNORECASE)
                if m:
                    return int(m.group(1))
                # Try days
                m = re.match(r"P?(\d+)\s*D", val, re.IGNORECASE)
                if m:
                    return int(m.group(1)) // 7
    except Exception:
        pass
    return None


def _get_species_strain(study: StudyInfo) -> tuple[str, str]:
    """Get species and strain from TS domain. Returns (SPECIES_UPPER, strain)."""
    species = ""
    strain = ""
    if "ts" not in study.xpt_files:
        return species, strain
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        for _, row in ts_df.iterrows():
            parmcd = str(row.get("TSPARMCD", "")).strip().upper()
            val = str(row.get("TSVAL", "")).strip()
            if parmcd == "SPECIES":
                species = val.upper()
            elif parmcd == "STRAIN":
                strain = val
    except Exception:
        pass
    return species, strain
