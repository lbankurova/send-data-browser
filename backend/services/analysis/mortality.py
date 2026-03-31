"""Mortality aggregation: combines DS (disposition) + DD (death diagnosis).

Produces a study-level mortality summary that feeds into NOAEL cap logic
and the frontend MortalityBanner.
"""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.findings_ds import classify_disposition
from services.analysis.findings_dd import parse_dd_domain


SCHEDULED_DISPOSITIONS = {"TERMINAL SACRIFICE", "INTERIM SACRIFICE",
                          "SCHEDULED EUTHANASIA", "SCHEDULED SACRIFICE",
                          "TERMINAL KILL", "RECOVERY SACRIFICE"}

# Phase F: Strain-specific background pathologies (mitigating factors for mortality)
_STRAIN_PATHOLOGY: dict[str, list[str]] = {
    # F344 (Fischer 344): MNCL, CPN, and pheochromocytoma (18-28% males, NTP data)
    "FISCHER 344": ["leukemia", "mononuclear cell", "mncl", "nephropathy", "cpn",
                    "chronic progressive nephropathy", "pheochromocytoma",
                    "adrenal medulla"],
    "F344": ["leukemia", "mononuclear cell", "mncl", "nephropathy", "cpn",
             "chronic progressive nephropathy", "pheochromocytoma",
             "adrenal medulla"],
    "F-344": ["leukemia", "mononuclear cell", "mncl", "nephropathy", "cpn",
              "chronic progressive nephropathy", "pheochromocytoma",
              "adrenal medulla"],
    # Sprague-Dawley: mammary tumors are the dominant background cause in females
    "SPRAGUE-DAWLEY": ["mammary", "fibroadenoma", "adenocarcinoma, mammary"],
    "SPRAGUE DAWLEY": ["mammary", "fibroadenoma", "adenocarcinoma, mammary"],
    "SD": ["mammary", "fibroadenoma", "adenocarcinoma, mammary"],
    # Wistar Han: pituitary tumors, mammary (lower than SD but still significant)
    "WISTAR": ["pituitary", "mammary"],
    "WISTAR HAN": ["pituitary", "mammary"],
    # Long-Evans rat: pituitary, mammary
    "LONG-EVANS": ["pituitary", "mammary"],
    "LONG EVANS": ["pituitary", "mammary"],
    # B6C3F1 mouse (NTP standard): hepatocellular tumors, lung tumors
    "B6C3F1": ["hepatocellular", "liver tumor", "alveolar", "bronchiolar",
               "lung tumor"],
    # CD-1 / ICR mouse: lymphoma, lung tumors
    "CD-1": ["lymphoma", "lymphosarcoma", "alveolar", "bronchiolar", "lung tumor"],
    "CD1": ["lymphoma", "lymphosarcoma", "alveolar", "bronchiolar", "lung tumor"],
    "ICR": ["lymphoma", "lymphosarcoma", "alveolar", "bronchiolar", "lung tumor"],
}

# Intercurrent (non-treatment, non-strain) causes suggesting facility/GLP issues
_INTERCURRENT_TERMS = [
    "gavage", "dosing error", "gavage error", "mis-dose", "misdose",
    "cage", "fight", "injury", "trauma", "husbandry",
    "infection", "contamination", "environmental",
]


def _classify_cause_category(
    cause: str | None,
    strain: str | None,
) -> str:
    """Classify cause of death: strain_pathology, intercurrent, or undetermined."""
    if not cause:
        return "undetermined"
    cause_lower = cause.lower()

    # Check intercurrent causes first (facility/procedural issues)
    for term in _INTERCURRENT_TERMS:
        if term in cause_lower:
            return "intercurrent"

    # Check strain-specific pathologies (mitigating)
    if strain:
        strain_upper = strain.strip().upper()
        for strain_key, terms in _STRAIN_PATHOLOGY.items():
            if strain_key in strain_upper:
                for term in terms:
                    if term in cause_lower:
                        return "strain_pathology"
                break

    return "undetermined"


def get_early_death_subjects(
    study: StudyInfo,
    subjects: pd.DataFrame,
) -> dict[str, str]:
    """Return {USUBJID: DSDECOD} for main-study subjects NOT in scheduled dispositions.

    These are animals that died or were removed before terminal sacrifice —
    their data should be excluded from terminal-endpoint group statistics.
    """
    if "ds" not in study.xpt_files:
        return {}

    ds_df, _ = read_xpt(study.xpt_files["ds"])
    ds_df.columns = [c.upper() for c in ds_df.columns]

    if "DSDECOD" not in ds_df.columns:
        return {}

    # Only consider subjects in the dose-response analysis (dose_level >= 0).
    # Secondary controls (-3) and positive controls (-2) are already excluded
    # from all statistics — their deaths shouldn't drive the scheduled-only toggle.
    main_subs = subjects[
        ~subjects["is_recovery"] & ~subjects["is_satellite"] & (subjects["dose_level"] >= 0)
    ].copy()
    ds_df = ds_df.merge(
        main_subs[["USUBJID", "SEX", "dose_level"]],
        on="USUBJID", how="inner",
    )

    # One disposition per subject (take first record)
    per_subj = ds_df.groupby("USUBJID").first()
    return {
        str(uid): str(row["DSDECOD"]).strip().upper()
        for uid, row in per_subj.iterrows()
        if str(row["DSDECOD"]).strip().upper() not in SCHEDULED_DISPOSITIONS
    }


def compute_study_mortality(
    study: StudyInfo,
    subjects: pd.DataFrame,
    dose_groups: list[dict],
    strain: str | None = None,
) -> dict:
    """Build a study-level mortality summary from DS + DD domains.

    Returns a dict with:
      - has_mortality: bool
      - total_deaths: int (excluding accidental)
      - total_accidental: int
      - mortality_loael: int | None (lowest dose_level with treatment-related death)
      - mortality_noael_cap: float | None (dose_value just below mortality_loael)
      - severity_tier: str
      - deaths: list of individual death records
      - by_dose: list of per-dose mortality counts
    """
    dose_label_map = {dg["dose_level"]: dg["label"] for dg in dose_groups}
    dose_value_map = {dg["dose_level"]: dg.get("dose_value") for dg in dose_groups}

    # --- Parse DS domain for disposition classification ---
    ds_records = _parse_ds_dispositions(study, subjects)

    # --- Parse DD domain for cause-of-death ---
    dd_records = parse_dd_domain(study, subjects)
    dd_by_subj = {r["USUBJID"]: r for r in dd_records}

    # --- Classify deaths vs scheduled vs accidental ---
    deaths = []
    accidentals = []
    for rec in ds_records:
        cat = rec["category"]
        if cat == "death":
            deaths.append(rec)
        elif cat == "accidental":
            accidentals.append(rec)
        # "scheduled" and "unknown" are not mortality events

    # Reclassify deaths where DD DDRESCAT says "ACCIDENTAL"
    reclassified = []
    remaining_deaths = []
    for d in deaths:
        dd = dd_by_subj.get(d["USUBJID"])
        if dd and dd["relatedness"].upper() == "ACCIDENTAL":
            d["category"] = "accidental"
            reclassified.append(d)
        else:
            remaining_deaths.append(d)
    deaths = remaining_deaths
    accidentals.extend(reclassified)

    # Also check DD records: a subject with a DD record but no DS death
    # record is still considered dead (DD = death diagnosis)
    ds_death_subjects = {d["USUBJID"] for d in deaths}
    ds_accidental_subjects = {a["USUBJID"] for a in accidentals}
    for dd_rec in dd_records:
        subj = dd_rec["USUBJID"]
        if subj not in ds_death_subjects and subj not in ds_accidental_subjects:
            # DD record without matching DS death — treat as death
            deaths.append({
                "USUBJID": subj,
                "SEX": dd_rec["SEX"],
                "dose_level": dd_rec["dose_level"],
                "is_recovery": dd_rec["is_recovery"],
                "is_satellite": dd_rec.get("is_satellite", False),
                "dsdecod": "FOUND DEAD",
                "category": "death",
            })
            ds_death_subjects.add(subj)

    # --- Enrich deaths with DD cause-of-death + strain pathology classification ---
    enriched_deaths = []
    for d in deaths:
        dd = dd_by_subj.get(d["USUBJID"])
        cause = dd["cause"] if dd else None
        enriched_deaths.append({
            "USUBJID": d["USUBJID"],
            "sex": d["SEX"],
            "dose_level": d["dose_level"],
            "is_recovery": d["is_recovery"],
            "is_satellite": d.get("is_satellite", False),
            "disposition": d.get("dsdecod", ""),
            "cause": cause,
            "cause_category": _classify_cause_category(cause, strain),
            "relatedness": dd["relatedness"] if dd else None,
            "study_day": dd["study_day"] if dd else d.get("ds_study_day"),
            "dose_label": dose_label_map.get(d["dose_level"], ""),
        })

    enriched_accidentals = []
    for a in accidentals:
        dd = dd_by_subj.get(a["USUBJID"])
        enriched_accidentals.append({
            "USUBJID": a["USUBJID"],
            "sex": a["SEX"],
            "dose_level": a["dose_level"],
            "is_recovery": a["is_recovery"],
            "is_satellite": a.get("is_satellite", False),
            "disposition": a.get("dsdecod", ""),
            "cause": dd["cause"] if dd else None,
            "relatedness": dd["relatedness"] if dd else None,
            "study_day": dd["study_day"] if dd else a.get("ds_study_day"),
            "dose_label": dose_label_map.get(a["dose_level"], ""),
        })

    # --- Filter to analysis-relevant subjects for mortality counts ---
    # Exclude recovery, TK satellite, AND secondary/positive controls (dose_level < 0).
    # Deaths at dose_level -3/-2 are shown in the full deaths array for transparency
    # but don't participate in total_deaths, by_dose, or LOAEL determination.
    main_deaths = [
        d for d in enriched_deaths
        if not d["is_recovery"] and not d.get("is_satellite") and d["dose_level"] >= 0
    ]
    main_accidentals = [
        a for a in enriched_accidentals
        if not a["is_recovery"] and not a.get("is_satellite") and a["dose_level"] >= 0
    ]

    # --- Build by_dose summary ---
    # Break down deaths by cause_category so LOAEL can exclude intercurrent/strain deaths.
    all_levels = sorted(dose_value_map.keys())
    by_dose = []
    for dl in all_levels:
        dose_deaths = [d for d in main_deaths if d["dose_level"] == dl]
        dose_accidentals = [a for a in main_accidentals if a["dose_level"] == dl]
        n_undetermined = sum(
            1 for d in dose_deaths if d.get("cause_category") == "undetermined"
        )
        n_intercurrent = sum(
            1 for d in dose_deaths if d.get("cause_category") == "intercurrent"
        )
        n_strain_pathology = sum(
            1 for d in dose_deaths if d.get("cause_category") == "strain_pathology"
        )
        by_dose.append({
            "dose_level": dl,
            "dose_label": dose_label_map.get(dl, ""),
            "dose_value": dose_value_map.get(dl),
            "deaths": len(dose_deaths),
            "deaths_undetermined": n_undetermined,
            "deaths_intercurrent": n_intercurrent,
            "deaths_strain_pathology": n_strain_pathology,
            "accidental": len(dose_accidentals),
            "subjects": [d["USUBJID"] for d in dose_deaths],
            "accidental_subjects": [a["USUBJID"] for a in dose_accidentals],
        })

    # --- Determine mortality LOAEL (lowest dose with >=1 potentially treatment-related death) ---
    # Exclude dose level 0 (control deaths don't trigger LOAEL).
    # Only undetermined deaths drive LOAEL -- intercurrent (gavage error, husbandry)
    # and strain_pathology (MNCL, mammary) deaths are not evidence of test-article toxicity.
    mortality_loael = None
    for bd in by_dose:
        if bd["dose_level"] > 0 and bd["deaths_undetermined"] > 0:
            mortality_loael = bd["dose_level"]
            break

    # --- Compute NOAEL cap from mortality LOAEL ---
    # Cap value = dose_value at the LOAEL level (NOAEL must be below this)
    mortality_noael_cap = None
    if mortality_loael is not None:
        mortality_noael_cap = dose_value_map.get(mortality_loael)

    total_deaths = len(main_deaths)
    total_accidental = len(main_accidentals)

    # Build early_death_subjects: all non-scheduled subjects (deaths + accidentals)
    early_death_subjects = get_early_death_subjects(study, subjects)

    # Per-subject detail for the frontend (sex, dose_level, disposition)
    # Merge enriched deaths + accidentals (main-study only) keyed to early_death set
    early_death_details = []
    for rec in enriched_deaths + enriched_accidentals:
        uid = rec["USUBJID"]
        if uid in early_death_subjects and not rec.get("is_recovery") and not rec.get("is_satellite"):
            early_death_details.append({
                "USUBJID": uid,
                "sex": rec["sex"],
                "dose_level": rec["dose_level"],
                "disposition": rec["disposition"],
                "dose_label": rec.get("dose_label", ""),
            })
    # Also add any early_death_subjects not covered by deaths/accidentals
    # (e.g., "unknown" dispositions that aren't in DEATH_TERMS)
    covered = {d["USUBJID"] for d in early_death_details}
    for rec in ds_records:
        uid = rec["USUBJID"]
        if uid in early_death_subjects and uid not in covered and not rec.get("is_recovery") and not rec.get("is_satellite"):
            early_death_details.append({
                "USUBJID": uid,
                "sex": rec["SEX"],
                "dose_level": rec["dose_level"],
                "disposition": rec.get("dsdecod", ""),
                "dose_label": dose_label_map.get(rec["dose_level"], ""),
            })

    return {
        "has_mortality": len(enriched_deaths) > 0 or len(enriched_accidentals) > 0,
        "total_deaths": total_deaths,
        "total_accidental": total_accidental,
        "mortality_loael": mortality_loael,
        "mortality_loael_label": dose_label_map.get(mortality_loael) if mortality_loael is not None else None,
        "mortality_noael_cap": mortality_noael_cap,
        "severity_tier": "S0_Death" if total_deaths > 0 else "none",
        "deaths": enriched_deaths,
        "accidentals": enriched_accidentals,
        "by_dose": by_dose,
        "early_death_subjects": early_death_subjects,
        "early_death_details": early_death_details,
    }


def qualify_control_mortality(
    mortality: dict,
    dose_groups: list[dict],
    duration_days: int | None,
) -> dict:
    """Qualify control group mortality against regulatory thresholds.

    Implements Section 6 of control-groups-model-29mar2026.md:
      Step 1: mortality_rate = control_deaths / control_n
      Step 2: duration-specific regulatory thresholds (EPA/OECD)

    Returns dict with qualification results merged into the mortality summary.
    """
    # Find control group (dose_level 0)
    control_dg = next((dg for dg in dose_groups if dg["dose_level"] == 0), None)
    if control_dg is None:
        return {
            "control_mortality_rate": None,
            "control_survival_rate": None,
            "control_n": None,
            "control_deaths": None,
            "duration_days": duration_days,
            "duration_weeks": round(duration_days / 7, 1) if duration_days else None,
            "qualification_flags": [],
            "suppress_noael": False,
        }

    control_n = control_dg.get("n_total", 0)
    if control_n == 0:
        return {
            "control_mortality_rate": None,
            "control_survival_rate": None,
            "control_n": 0,
            "control_deaths": 0,
            "duration_days": duration_days,
            "duration_weeks": round(duration_days / 7, 1) if duration_days else None,
            "qualification_flags": [],
            "suppress_noael": False,
        }

    # Count control deaths from by_dose
    control_deaths = 0
    for bd in mortality.get("by_dose", []):
        if bd["dose_level"] == 0:
            control_deaths = bd["deaths"]
            break

    mortality_rate = control_deaths / control_n
    survival_rate = 1.0 - mortality_rate
    duration_weeks = round(duration_days / 7, 1) if duration_days else None

    # Dual-rate computation: count strain-pathology deaths for adjusted rate.
    # Raw rate drives regulatory threshold gates (EPA/OECD floors).
    # Adjusted rate (excluding strain-expected deaths) drives HCD comparison
    # and contextual annotation for the toxicologist.
    strain_pathology_deaths = 0
    for d in mortality.get("deaths", []):
        if (d.get("dose_level") == 0
                and not d.get("is_recovery")
                and not d.get("is_satellite")
                and d.get("cause_category") == "strain_pathology"):
            strain_pathology_deaths += 1

    adjusted_deaths = control_deaths - strain_pathology_deaths
    mortality_rate_adjusted = (
        round(adjusted_deaths / control_n, 4) if adjusted_deaths > 0 else 0.0
    )

    flags: list[dict] = []
    suppress_noael = False

    # Step 2: Regulatory floor thresholds
    if duration_days is not None:
        weeks = duration_days / 7

        # Carcinogenicity (>= 78 weeks / 18 months)
        if weeks >= 78:
            if survival_rate < 0.25:
                flags.append({
                    "severity": "critical",
                    "code": "CTRL_MORT_CRITICAL",
                    "message": (
                        f"Control survival {survival_rate:.0%} is below 25% minimum "
                        f"-- study uninterpretable per OECD TG 451/EPA 870.4200"
                    ),
                })
                suppress_noael = True
            elif survival_rate < 0.50:
                flags.append({
                    "severity": "warning",
                    "code": "CTRL_MORT_ELEVATED",
                    "message": (
                        f"Control survival {survival_rate:.0%} is below EPA 50% threshold "
                        f"at {duration_weeks}w -- negative findings may be unreliable"
                    ),
                })

        # Chronic (26-78 weeks) -- no explicit regulatory threshold; interpolated
        # from subchronic/carcinogenicity gates. >10% is abnormal for all standard
        # strains at these durations (39-week dog, 52-week rat).
        elif weeks > 26:
            if mortality_rate > 0.20:
                flags.append({
                    "severity": "critical",
                    "code": "CTRL_MORT_CRITICAL",
                    "message": (
                        f"Control mortality {mortality_rate:.0%} exceeds 20% "
                        f"in {duration_weeks}w chronic study -- investigate validity"
                    ),
                })
                suppress_noael = True
            elif mortality_rate > 0.10:
                flags.append({
                    "severity": "warning",
                    "code": "CTRL_MORT_ELEVATED",
                    "message": (
                        f"Control mortality {mortality_rate:.0%} exceeds 10% "
                        f"for chronic ({duration_weeks}w) study"
                    ),
                })

        # Subchronic (<= 26 weeks)
        else:
            if mortality_rate > 0.10:
                flags.append({
                    "severity": "critical",
                    "code": "CTRL_MORT_CRITICAL",
                    "message": (
                        f"Control mortality {mortality_rate:.0%} exceeds 10% "
                        f"in {duration_weeks}w study -- investigate study validity"
                    ),
                })
                suppress_noael = True
            elif mortality_rate > 0.05:
                flags.append({
                    "severity": "warning",
                    "code": "CTRL_MORT_ELEVATED",
                    "message": (
                        f"Control mortality {mortality_rate:.0%} exceeds 5% "
                        f"for subchronic ({duration_weeks}w) study"
                    ),
                })

            # 13-week specific
            if weeks <= 13 and mortality_rate > 0.02:
                flags.append({
                    "severity": "warning",
                    "code": "CTRL_MORT_ALERT",
                    "message": (
                        f"Control mortality {mortality_rate:.0%} in "
                        f"{duration_weeks}w study requires investigation"
                    ),
                })

    return {
        "control_mortality_rate": round(mortality_rate, 4),
        "control_survival_rate": round(survival_rate, 4),
        "control_mortality_rate_adjusted": mortality_rate_adjusted,
        "strain_pathology_deaths": strain_pathology_deaths,
        "control_n": control_n,
        "control_deaths": control_deaths,
        "duration_days": duration_days,
        "duration_weeks": duration_weeks,
        "qualification_flags": flags,
        "suppress_noael": suppress_noael,
    }


def _parse_ds_dispositions(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Parse DS domain and classify each subject's disposition."""
    if "ds" not in study.xpt_files:
        return []

    ds_df, _ = read_xpt(study.xpt_files["ds"])
    ds_df.columns = [c.upper() for c in ds_df.columns]

    if "DSDECOD" not in ds_df.columns:
        return []

    ds_df = ds_df.merge(
        subjects[["USUBJID", "SEX", "dose_level", "is_recovery", "is_satellite"]],
        on="USUBJID",
        how="inner",
    )

    # Extract study day from DSDY or VISITDY (fallback for studies without DD domain)
    ds_day_col = None
    for col in ("DSDY", "VISITDY", "DSSTDY"):
        if col in ds_df.columns:
            ds_day_col = col
            break

    records = []
    for _, row in ds_df.iterrows():
        dsdecod = str(row["DSDECOD"]).strip().upper()
        cat = classify_disposition(dsdecod)
        ds_day = None
        if ds_day_col:
            v = row.get(ds_day_col)
            if pd.notna(v):
                try:
                    ds_day = int(float(v))
                except (ValueError, TypeError):
                    pass
        records.append({
            "USUBJID": str(row["USUBJID"]),
            "SEX": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "is_recovery": bool(row["is_recovery"]),
            "is_satellite": bool(row.get("is_satellite", False)),
            "dsdecod": dsdecod,
            "category": cat,
            "ds_study_day": ds_day,
        })

    return records
