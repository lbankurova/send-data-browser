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
                          "TERMINAL KILL"}


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

    main_subs = subjects[~subjects["is_recovery"]].copy()
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
                "dsdecod": "FOUND DEAD",
                "category": "death",
            })
            ds_death_subjects.add(subj)

    # --- Enrich deaths with DD cause-of-death ---
    enriched_deaths = []
    for d in deaths:
        dd = dd_by_subj.get(d["USUBJID"])
        enriched_deaths.append({
            "USUBJID": d["USUBJID"],
            "sex": d["SEX"],
            "dose_level": d["dose_level"],
            "is_recovery": d["is_recovery"],
            "disposition": d.get("dsdecod", ""),
            "cause": dd["cause"] if dd else None,
            "relatedness": dd["relatedness"] if dd else None,
            "study_day": dd["study_day"] if dd else None,
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
            "disposition": a.get("dsdecod", ""),
            "cause": dd["cause"] if dd else None,
            "relatedness": dd["relatedness"] if dd else None,
            "study_day": dd["study_day"] if dd else None,
            "dose_label": dose_label_map.get(a["dose_level"], ""),
        })

    # --- Filter to main-study only for mortality counts ---
    main_deaths = [d for d in enriched_deaths if not d["is_recovery"]]
    main_accidentals = [a for a in enriched_accidentals if not a["is_recovery"]]

    # --- Build by_dose summary ---
    all_levels = sorted(dose_value_map.keys())
    by_dose = []
    for dl in all_levels:
        dose_deaths = [d for d in main_deaths if d["dose_level"] == dl]
        dose_accidentals = [a for a in main_accidentals if a["dose_level"] == dl]
        by_dose.append({
            "dose_level": dl,
            "dose_label": dose_label_map.get(dl, ""),
            "dose_value": dose_value_map.get(dl),
            "deaths": len(dose_deaths),
            "accidental": len(dose_accidentals),
            "subjects": [d["USUBJID"] for d in dose_deaths],
            "accidental_subjects": [a["USUBJID"] for a in dose_accidentals],
        })

    # --- Determine mortality LOAEL (lowest dose with >=1 treatment-related death) ---
    # Exclude dose level 0 (control deaths don't trigger LOAEL)
    mortality_loael = None
    for bd in by_dose:
        if bd["dose_level"] > 0 and bd["deaths"] > 0:
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
        if uid in early_death_subjects and not rec.get("is_recovery"):
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
        if uid in early_death_subjects and uid not in covered and not rec.get("is_recovery"):
            early_death_details.append({
                "USUBJID": uid,
                "sex": rec["SEX"],
                "dose_level": rec["dose_level"],
                "disposition": rec.get("dsdecod", ""),
                "dose_label": dose_label_map.get(rec["dose_level"], ""),
            })

    return {
        "has_mortality": total_deaths > 0,
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


def _parse_ds_dispositions(study: StudyInfo, subjects: pd.DataFrame) -> list[dict]:
    """Parse DS domain and classify each subject's disposition."""
    if "ds" not in study.xpt_files:
        return []

    ds_df, _ = read_xpt(study.xpt_files["ds"])
    ds_df.columns = [c.upper() for c in ds_df.columns]

    if "DSDECOD" not in ds_df.columns:
        return []

    ds_df = ds_df.merge(
        subjects[["USUBJID", "SEX", "dose_level", "is_recovery"]],
        on="USUBJID",
        how="inner",
    )

    records = []
    for _, row in ds_df.iterrows():
        dsdecod = str(row["DSDECOD"]).strip().upper()
        cat = classify_disposition(dsdecod)
        records.append({
            "USUBJID": str(row["USUBJID"]),
            "SEX": str(row["SEX"]),
            "dose_level": int(row["dose_level"]),
            "is_recovery": bool(row["is_recovery"]),
            "dsdecod": dsdecod,
            "category": cat,
        })

    return records
