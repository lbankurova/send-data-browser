"""Cross-domain tumor summary with progression detection.

Generates tumor_summary.json by cross-referencing TF with MI findings.
Detects proliferative progression sequences (e.g., injury -> hyperplasia -> adenoma -> carcinoma).
Includes poly-3 survival-adjusted statistics, three parallel analyses (adenoma/carcinoma/combined),
Haseman dual-threshold significance, and HCD tumor background rates.
"""

from __future__ import annotations

import logging

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.findings_tf import _extract_cell_type
from services.analysis.statistics import trend_test_incidence, poly3_test
from services.analysis.hcd import assess_tumor_hcd, get_strain, get_study_duration_days
from services.analysis.mortality import _parse_ds_dispositions, SCHEDULED_DISPOSITIONS

log = logging.getLogger(__name__)


# Known proliferative progression sequences per cell type.
# Each sequence lists stages from early (MI precursors) to late (TF tumors).
PROGRESSION_SEQUENCES: dict[str, list[str]] = {
    "hepatocellular": [
        "necrosis", "regeneration", "hypertrophy", "hyperplasia",
        "altered_hepatocellular_foci", "adenoma", "carcinoma",
    ],
    "follicular": [
        "hypertrophy", "hyperplasia", "adenoma", "carcinoma",
    ],
    "urothelial": [
        "hyperplasia", "papilloma", "carcinoma",
    ],
    "renal_tubular": [
        "necrosis", "regeneration", "hyperplasia", "adenoma", "carcinoma",
    ],
    "smooth_muscle": [
        "hyperplasia", "leiomyoma", "leiomyosarcoma",
    ],
    "squamous": [
        "hyperplasia", "papilloma", "carcinoma",
    ],
}

# MI finding terms that map to progression stages
MI_PRECURSOR_TERMS: dict[str, list[str]] = {
    "necrosis": ["NECROSIS", "NECROS"],
    "regeneration": ["REGENERAT", "REGENERATION"],
    "hypertrophy": ["HYPERTROPHY", "HYPERTROP"],
    "hyperplasia": ["HYPERPLASIA", "HYPERPLASI"],
    "altered_hepatocellular_foci": ["ALTERED HEPATOCELLULAR FOCI", "BASOPHILIC FOCUS", "EOSINOPHILIC FOCUS"],
}

# TF morphology terms that map to progression stages
TF_STAGE_TERMS: dict[str, list[str]] = {
    "adenoma": ["ADENOMA"],
    "carcinoma": ["CARCINOMA"],
    "papilloma": ["PAPILLOMA"],
    "leiomyoma": ["LEIOMYOMA"],
    "leiomyosarcoma": ["LEIOMYOSARCOMA"],
}


def _match_stage(text: str, stage_terms: dict[str, list[str]]) -> list[str]:
    """Return which stages match a finding text."""
    upper = text.upper().strip()
    matched = []
    for stage, terms in stage_terms.items():
        for term in terms:
            if term in upper:
                matched.append(stage)
                break
    return matched


# Cell types where adenoma and carcinoma arise from independent lineages
# (discordance may reflect two independent effects, not progression)
INDEPENDENT_PATHWAY_CELL_TYPES = {"mammary_epithelial", "mammary_stromal"}


def build_tumor_summary(
    findings: list[dict],
    study: StudyInfo,
    subjects: pd.DataFrame | None = None,
    strain: str | None = None,
) -> dict:
    """Build cross-domain tumor summary from pre-computed findings.

    Args:
        findings: All enriched findings from compute_all_findings().
        study: StudyInfo for reading PM/MI/TF/DS domains.
        subjects: Optional subjects DataFrame (for poly-3 survival adjustment).
        strain: Optional strain string (for HCD tumor rate lookup).
    """
    # Separate neoplastic and MI-precursor findings (MI-first: isNeoplastic flag)
    neoplastic_findings = [f for f in findings if f.get("isNeoplastic")]
    mi_precursor_findings = [f for f in findings if f.get("domain") == "MI" and not f.get("isNeoplastic")]

    if not neoplastic_findings:
        return {
            "has_tumors": False,
            "total_tumor_animals": 0,
            "total_tumor_types": 0,
            "summaries": [],
            "parallel_analyses": [],
            "progression_sequences": [],
            "palpable_masses": _parse_pm(study),
        }

    # Build per-organ+morphology summaries from neoplastic findings
    summaries = []
    all_tumor_animals: set[str] = set()

    for f in neoplastic_findings:
        organ = f.get("specimen", "")
        morphology = f.get("finding", "")
        behavior = f.get("behavior", "UNCERTAIN")
        cell_type = f.get("cell_type", _extract_cell_type(morphology))
        sex = f.get("sex", "")

        # Count affected animals per dose from group_stats
        by_dose = []
        total_affected = 0
        for gs in f.get("group_stats", []):
            affected = gs.get("affected", 0)
            total_affected += affected
            by_dose.append({
                "dose_level": gs["dose_level"],
                "n": gs.get("n", 0),
                "affected": affected,
                "incidence": gs.get("incidence", 0),
            })

        summaries.append({
            "organ": organ,
            "morphology": morphology,
            "behavior": behavior,
            "cell_type": cell_type,
            "sex": sex,
            "count": total_affected,
            "by_dose": by_dose,
            "trend_p": f.get("trend_p"),
        })

    # Count unique tumor animals from raw MI + TF data
    all_tumor_animals = _count_tumor_animals(study)

    # Build per-animal tumor index for poly-3 and combined deduplication
    animal_tumor_index = _build_animal_tumor_index(study)

    # Get survival data for poly-3
    survival_data, study_duration = _get_survival_data(study, subjects)

    # Resolve strain for HCD lookup
    if strain is None:
        strain = get_strain(study)

    # Parallel analyses: three-way (adenoma/carcinoma/combined) with poly-3 + Haseman
    parallel_analyses = _compute_parallel_analyses(
        neoplastic_findings,
        animal_tumor_index=animal_tumor_index,
        survival_data=survival_data,
        study_duration=study_duration,
        strain=strain,
    )

    # Progression detection: cross-reference neoplastic findings with MI precursors
    progression_sequences = _detect_progressions(neoplastic_findings, mi_precursor_findings)

    return {
        "has_tumors": True,
        "total_tumor_animals": len(all_tumor_animals),
        "total_tumor_types": len(summaries),
        "summaries": summaries,
        "parallel_analyses": parallel_analyses,
        "progression_sequences": progression_sequences,
        "palpable_masses": _parse_pm(study),
    }


def _count_tumor_animals(study: StudyInfo) -> set[str]:
    """Count unique tumor-bearing animals from raw MI (neoplastic) + TF XPT."""
    animals: set[str] = set()
    # MI domain: neoplastic findings
    if "mi" in study.xpt_files:
        try:
            from services.analysis.findings_mi import _classify_mi_neoplasm
            mi_df, _ = read_xpt(study.xpt_files["mi"])
            mi_df.columns = [c.upper() for c in mi_df.columns]
            for _, row in mi_df.iterrows():
                mistresc = str(row.get("MISTRESC", row.get("MIORRES", "")))
                mirescat = str(row.get("MIRESCAT", "")) if "MIRESCAT" in mi_df.columns else None
                is_neo, _ = _classify_mi_neoplasm(mistresc, mirescat or None)
                if is_neo:
                    animals.add(str(row.get("USUBJID", "")))
        except Exception:
            pass
    # TF domain: all records are neoplastic
    if "tf" in study.xpt_files:
        try:
            tf_df, _ = read_xpt(study.xpt_files["tf"])
            tf_df.columns = [c.upper() for c in tf_df.columns]
            if "USUBJID" in tf_df.columns:
                animals.update(str(u) for u in tf_df["USUBJID"].unique())
        except Exception:
            pass
    return animals


def _build_animal_tumor_index(
    study: StudyInfo,
) -> dict[str, dict[tuple[str, str, str], set[str]]]:
    """Build per-animal tumor index: USUBJID -> {(organ, cell_type, sex): {behaviors}}.

    Used for (a) combined count deduplication and (b) poly-3 per-animal tumor status.
    Reads raw MI XPT (with _classify_mi_neoplasm) + TF XPT.
    """
    # index: USUBJID -> {(organ_upper, cell_type, sex): set of behaviors}
    index: dict[str, dict[tuple[str, str, str], set[str]]] = {}
    # DM sex map shared between MI and TF domain parsing
    sex_map: dict[str, str] = {}

    def _add(usubjid: str, organ: str, cell_type: str, sex: str, behavior: str) -> None:
        key = (organ.upper(), cell_type, sex.upper())
        index.setdefault(usubjid, {}).setdefault(key, set()).add(behavior)

    # Read DM for sex mapping (shared across MI + TF)
    if "dm" in study.xpt_files:
        try:
            dm_df, _ = read_xpt(study.xpt_files["dm"])
            dm_df.columns = [c.upper() for c in dm_df.columns]
            for _, row in dm_df.iterrows():
                sex_map[str(row.get("USUBJID", ""))] = str(row.get("SEX", "")).upper()
        except Exception:
            pass

    # MI domain
    if "mi" in study.xpt_files:
        try:
            from services.analysis.findings_mi import _classify_mi_neoplasm
            mi_df, _ = read_xpt(study.xpt_files["mi"])
            mi_df.columns = [c.upper() for c in mi_df.columns]

            for _, row in mi_df.iterrows():
                mistresc = str(row.get("MISTRESC", row.get("MIORRES", "")))
                mirescat = str(row.get("MIRESCAT", "")) if "MIRESCAT" in mi_df.columns else None
                is_neo, behavior = _classify_mi_neoplasm(mistresc, mirescat or None)
                if not is_neo:
                    continue
                usubjid = str(row.get("USUBJID", ""))
                organ = str(row.get("MISPEC", ""))
                morphology = mistresc
                cell_type = _extract_cell_type(morphology)
                sex = sex_map.get(usubjid, "")
                beh = behavior or "UNCERTAIN"
                _add(usubjid, organ, cell_type, sex, beh)
        except Exception as e:
            log.debug("Failed to build MI tumor index: %s", e)

    # TF domain
    if "tf" in study.xpt_files:
        try:
            tf_df, _ = read_xpt(study.xpt_files["tf"])
            tf_df.columns = [c.upper() for c in tf_df.columns]
            for _, row in tf_df.iterrows():
                usubjid = str(row.get("USUBJID", ""))
                organ = str(row.get("TFSPEC", row.get("TFORRES", "")))
                morphology = str(row.get("TFSTRESC", row.get("TFORRES", "")))
                cell_type = _extract_cell_type(morphology)
                sex = sex_map.get(usubjid, "")
                rescat = str(row.get("TFRESCAT", "")).strip().upper()
                if rescat in ("BENIGN", "MALIGNANT"):
                    beh = rescat
                elif rescat == "UNDETERMINED":
                    beh = "UNCERTAIN"
                else:
                    beh = "UNCERTAIN"
                _add(usubjid, organ, cell_type, sex, beh)
        except Exception as e:
            log.debug("Failed to build TF tumor index: %s", e)

    return index


def _get_survival_data(
    study: StudyInfo,
    subjects: pd.DataFrame | None,
) -> tuple[list[dict], int | None]:
    """Get per-animal survival data for poly-3 from DS domain.

    Reuses mortality._parse_ds_dispositions() for DS parsing, then filters
    to main-study animals and classifies terminal vs early death.

    Returns (animal_records, study_duration) where each record has
    {USUBJID, dose_level, disposition_day, is_terminal, sex}.
    """
    if subjects is None:
        return [], None

    try:
        ds_records = _parse_ds_dispositions(study, subjects)
    except Exception:
        return [], None

    if not ds_records:
        return [], None

    records = []
    max_terminal_day = 0

    for r in ds_records:
        # Skip satellites and recovery animals
        if r["is_satellite"] or r["is_recovery"]:
            continue
        if r["dose_level"] < 0:
            continue
        ds_day = r["ds_study_day"]
        if ds_day is None:
            continue

        is_terminal = r["dsdecod"] in SCHEDULED_DISPOSITIONS
        if is_terminal and ds_day > max_terminal_day:
            max_terminal_day = ds_day

        records.append({
            "USUBJID": r["USUBJID"],
            "dose_level": r["dose_level"],
            "disposition_day": ds_day,
            "is_terminal": is_terminal,
            "sex": r["SEX"],
        })

    study_duration = max_terminal_day if max_terminal_day > 0 else None
    return records, study_duration


def _run_analysis(
    behavior_filter: str | None,
    group_findings: list[dict],
    animal_tumor_index: dict[str, dict[tuple[str, str, str], set[str]]],
    organ: str,
    cell_type: str,
    sex: str,
    survival_data: list[dict],
    study_duration: int | None,
    strain: str | None,
    morphology_hint: str = "",
) -> dict:
    """Run a single analysis (adenoma, carcinoma, or combined) for a (organ, cell_type, sex) group.

    behavior_filter: "BENIGN" for adenoma-alone, "MALIGNANT" for carcinoma-alone, None for combined.
    """
    # Filter findings by behavior
    if behavior_filter:
        filtered = [f for f in group_findings if f.get("behavior") == behavior_filter]
    else:
        filtered = group_findings

    # Build by_dose from group_stats — for combined, deduplicate by USUBJID
    dose_data: dict[int, dict] = {}  # dose_level -> {n, affected_subjects: set}
    group_key = (organ.upper(), cell_type, sex.upper())

    if behavior_filter is None:
        # Combined: count distinct USUBJIDs per dose with ANY matching tumor
        # Use animal_tumor_index for deduplication
        dose_n: dict[int, int] = {}
        dose_subjects: dict[int, set[str]] = {}
        for f in filtered:
            for gs in f.get("group_stats", []):
                dl = gs["dose_level"]
                dose_n[dl] = gs.get("n", 0)
                if dl not in dose_subjects:
                    dose_subjects[dl] = set()
                # Add subjects from group_stats if available
                for subj in gs.get("subjects", []):
                    dose_subjects[dl].add(str(subj))

        # If group_stats doesn't carry subject lists, fall back to summing
        # (loses deduplication but preserves backward compatibility)
        has_subject_lists = any(gs.get("subjects") for f in filtered for gs in f.get("group_stats", []))

        if not has_subject_lists:
            # Fall back: use animal_tumor_index to build per-dose combined counts
            # Match animals that have ANY behavior in this (organ, cell_type, sex) group
            dose_animals: dict[int, set[str]] = {}
            for uid, groups_map in animal_tumor_index.items():
                if group_key in groups_map:
                    # Find this animal's dose_level from survival_data or group_stats
                    dl_for_animal = _find_dose_level(uid, survival_data, group_findings)
                    if dl_for_animal is not None:
                        dose_animals.setdefault(dl_for_animal, set()).add(uid)

            if dose_animals:
                for dl in sorted(set(list(dose_n.keys()) + list(dose_animals.keys()))):
                    n = dose_n.get(dl, 0)
                    affected = len(dose_animals.get(dl, set()))
                    dose_data[dl] = {"dose_level": dl, "n": n, "affected": affected}
            else:
                # Last resort: sum across behaviors (double-counting possible)
                for f in filtered:
                    for gs in f.get("group_stats", []):
                        dl = gs["dose_level"]
                        if dl not in dose_data:
                            dose_data[dl] = {"dose_level": dl, "n": gs.get("n", 0), "affected": 0}
                        dose_data[dl]["affected"] += gs.get("affected", 0)
        else:
            for dl in sorted(dose_n.keys()):
                n = dose_n[dl]
                affected = len(dose_subjects.get(dl, set()))
                dose_data[dl] = {"dose_level": dl, "n": n, "affected": affected}
    else:
        # Single behavior: straightforward sum
        for f in filtered:
            for gs in f.get("group_stats", []):
                dl = gs["dose_level"]
                if dl not in dose_data:
                    dose_data[dl] = {"dose_level": dl, "n": gs.get("n", 0), "affected": 0}
                dose_data[dl]["affected"] += gs.get("affected", 0)

    by_dose = []
    for dl in sorted(dose_data.keys()):
        entry = dose_data[dl]
        n = entry["n"]
        affected = entry["affected"]
        by_dose.append({
            "dose_level": dl,
            "n": n,
            "affected": affected,
            "incidence": round(affected / n, 4) if n > 0 else 0,
        })

    if not by_dose:
        return _empty_analysis(behavior_filter)

    # Cochran-Armitage trend test
    counts = [d["affected"] for d in by_dose]
    totals = [d["n"] for d in by_dose]
    trend_result = trend_test_incidence(counts, totals)
    trend_p = trend_result["p_value"]
    trend_stat = trend_result["statistic"]

    # Direction-aware one-sided p
    trend_direction = "none"
    trend_p_one_sided = None
    if trend_stat is not None and trend_p is not None:
        if trend_stat > 0:
            trend_direction = "up"
            trend_p_one_sided = trend_p / 2
        elif trend_stat < 0:
            trend_direction = "down"
            trend_p_one_sided = 1.0 - trend_p / 2
        else:
            trend_direction = "none"
            trend_p_one_sided = 0.5

    # Poly-3 (when survival data available and meaningful early death fraction)
    poly3_trend_p = None
    poly3_result = None
    if survival_data and study_duration and study_duration > 0:
        # Check poly-3 gate: >5% early deaths in any group
        sex_survival = [s for s in survival_data if s["sex"] == sex.upper()] if sex else survival_data
        early_death_frac = _max_early_death_fraction(sex_survival)
        if early_death_frac > 0.05:
            # Build per-animal tumor status for this analysis
            p3_animals = _build_poly3_animals(
                sex_survival, animal_tumor_index, group_key, behavior_filter,
            )
            if p3_animals:
                poly3_result = poly3_test(p3_animals, study_duration)
                poly3_trend_p = poly3_result.get("trend_p")

    # Haseman dual-threshold
    hcd_result = assess_tumor_hcd(organ, morphology_hint, strain, sex)
    bg_rate = hcd_result.get("background_rate")
    if bg_rate is not None:
        haseman_class = "rare" if bg_rate < 0.01 else "common"
        haseman_threshold = 0.05 if haseman_class == "rare" else 0.01
    else:
        haseman_class = "unknown"
        haseman_threshold = 0.01  # conservative default

    # Use poly-3 one-sided p if available, else standard one-sided p
    p_for_haseman = None
    if poly3_result and poly3_result.get("trend_p") is not None and poly3_result.get("trend_statistic") is not None:
        p3_stat = poly3_result["trend_statistic"]
        p3_p = poly3_result["trend_p"]
        if p3_stat > 0:
            p_for_haseman = p3_p / 2
        elif p3_stat < 0:
            p_for_haseman = 1.0 - p3_p / 2
        else:
            p_for_haseman = 0.5
    else:
        p_for_haseman = trend_p_one_sided

    meets_haseman = None
    if p_for_haseman is not None:
        # Only increasing trends satisfy Haseman
        effective_direction = trend_direction
        if poly3_result and poly3_result.get("trend_statistic") is not None:
            effective_direction = "up" if poly3_result["trend_statistic"] > 0 else "down" if poly3_result["trend_statistic"] < 0 else "none"
        if effective_direction == "up":
            meets_haseman = p_for_haseman <= haseman_threshold
        else:
            meets_haseman = False

    total_count = sum(d["affected"] for d in by_dose)
    return {
        "count": total_count,
        "by_dose": by_dose,
        "trend_p": trend_p,
        "trend_p_one_sided": trend_p_one_sided,
        "trend_direction": trend_direction,
        "poly3_trend_p": poly3_trend_p,
        "poly3_pairwise_p": poly3_result["pairwise_p"] if poly3_result else None,
        "poly3_adjusted_rates": poly3_result["adjusted_rates"] if poly3_result else None,
        "haseman_threshold": haseman_threshold,
        "haseman_class": haseman_class,
        "meets_haseman": meets_haseman,
    }


def _empty_analysis(behavior_filter: str | None) -> dict:
    """Return an empty analysis dict."""
    return {
        "count": 0, "by_dose": [],
        "trend_p": None, "trend_p_one_sided": None, "trend_direction": "none",
        "poly3_trend_p": None, "poly3_pairwise_p": None, "poly3_adjusted_rates": None,
        "haseman_threshold": 0.01, "haseman_class": "unknown", "meets_haseman": None,
    }


def _find_dose_level(
    usubjid: str,
    survival_data: list[dict],
    group_findings: list[dict],
) -> int | None:
    """Find dose_level for a USUBJID from survival data or group_stats subjects."""
    for s in survival_data:
        if s["USUBJID"] == usubjid:
            return s["dose_level"]
    # Fallback: search group_stats subjects (if present)
    for f in group_findings:
        for gs in f.get("group_stats", []):
            for subj in gs.get("subjects", []):
                if str(subj) == usubjid:
                    return gs["dose_level"]
    return None


def _max_early_death_fraction(survival_data: list[dict]) -> float:
    """Compute max early-death fraction across dose groups."""
    groups: dict[int, list[dict]] = {}
    for s in survival_data:
        groups.setdefault(s["dose_level"], []).append(s)
    max_frac = 0.0
    for dl, animals in groups.items():
        n = len(animals)
        if n == 0:
            continue
        early = sum(1 for a in animals if not a["is_terminal"])
        frac = early / n
        if frac > max_frac:
            max_frac = frac
    return max_frac


def _build_poly3_animals(
    survival_data: list[dict],
    animal_tumor_index: dict[str, dict[tuple[str, str, str], set[str]]],
    group_key: tuple[str, str, str],
    behavior_filter: str | None,
) -> list[dict]:
    """Build poly-3 animal records for a specific analysis."""
    animals = []
    for s in survival_data:
        uid = s["USUBJID"]
        has_tumor = False
        uid_tumors = animal_tumor_index.get(uid, {}).get(group_key, set())
        if behavior_filter:
            has_tumor = behavior_filter in uid_tumors
        else:
            has_tumor = len(uid_tumors) > 0
        animals.append({
            "dose_level": s["dose_level"],
            "has_tumor": has_tumor,
            "disposition_day": s["disposition_day"],
            "is_terminal": s["is_terminal"],
        })
    return animals


def _detect_discordance(adenoma: dict, carcinoma: dict, combined: dict) -> tuple[str | None, str | None]:
    """Detect discordance patterns between three parallel analyses.

    Uses one-sided p at significance threshold 0.05 for pattern detection.
    """
    threshold = 0.05
    a_sig = (adenoma["trend_p_one_sided"] or 1.0) <= threshold and adenoma["trend_direction"] == "up"
    c_sig = (carcinoma["trend_p_one_sided"] or 1.0) <= threshold and carcinoma["trend_direction"] == "up"
    comb_sig = (combined["trend_p_one_sided"] or 1.0) <= threshold and combined["trend_direction"] == "up"

    if not a_sig and not c_sig and not comb_sig:
        return None, None
    if a_sig and c_sig and comb_sig:
        return None, None  # concordant significance

    if a_sig and c_sig:
        return "both_components", "Independent benign and malignant effects"
    if comb_sig and not a_sig and not c_sig:
        return "combined_only", "Marginal proliferative drive without clear progression"
    if c_sig and not comb_sig:
        return "carcinoma_only", "Accelerated malignant conversion from stable adenoma pool"
    if a_sig and not c_sig and not comb_sig:
        return "adenoma_only", "Benign proliferative response without malignant transformation"

    return None, None


def _compute_parallel_analyses(
    neoplastic_findings: list[dict],
    animal_tumor_index: dict[str, dict[tuple[str, str, str], set[str]]],
    survival_data: list[dict],
    study_duration: int | None,
    strain: str | None,
) -> list[dict]:
    """Three parallel analyses per (organ, cell_type, sex): adenoma, carcinoma, combined.

    Replaces _compute_combined_analyses with full poly-3, Haseman, and discordance.
    """
    # Group by (organ, cell_type, sex)
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for f in neoplastic_findings:
        organ = f.get("specimen", "")
        cell_type = f.get("cell_type", "unclassified")
        sex = f.get("sex", "")
        key = (organ, cell_type, sex)
        groups.setdefault(key, []).append(f)

    results = []
    for (organ, cell_type, sex), group in groups.items():
        if len(group) < 2 or cell_type == "unclassified":
            continue

        # Get a morphology hint for HCD lookup (from first finding)
        morph_hint = group[0].get("finding", "")

        # Adenoma analysis (BENIGN)
        adenoma_morph = ""
        for f in group:
            if f.get("behavior") == "BENIGN":
                adenoma_morph = f.get("finding", "")
                break
        adenoma = _run_analysis(
            "BENIGN", group, animal_tumor_index, organ, cell_type, sex,
            survival_data, study_duration, strain, morphology_hint=adenoma_morph or morph_hint,
        )

        # Carcinoma analysis (MALIGNANT)
        carcinoma_morph = ""
        for f in group:
            if f.get("behavior") == "MALIGNANT":
                carcinoma_morph = f.get("finding", "")
                break
        carcinoma = _run_analysis(
            "MALIGNANT", group, animal_tumor_index, organ, cell_type, sex,
            survival_data, study_duration, strain, morphology_hint=carcinoma_morph or morph_hint,
        )

        # Combined analysis (all behaviors)
        combined = _run_analysis(
            None, group, animal_tumor_index, organ, cell_type, sex,
            survival_data, study_duration, strain, morphology_hint=morph_hint,
        )

        # Discordance detection
        discordance, discordance_interpretation = _detect_discordance(adenoma, carcinoma, combined)

        # Progression-linked caveat for independent pathways
        if discordance and cell_type in INDEPENDENT_PATHWAY_CELL_TYPES:
            discordance_interpretation = (
                (discordance_interpretation or "") +
                " Note: independent pathways -- discordance may reflect two independent effects, not progression"
            ).strip()

        results.append({
            "organ": organ,
            "cell_type": cell_type,
            "sex": sex,
            "adenoma": adenoma,
            "carcinoma": carcinoma,
            "combined": combined,
            "discordance": discordance,
            "discordance_interpretation": discordance_interpretation,
        })

    return results


def _detect_progressions(
    neoplastic_findings: list[dict],
    mi_precursor_findings: list[dict],
) -> list[dict]:
    """Detect proliferative progression sequences by cross-referencing neoplastic and MI."""
    # Collect organs with neoplastic tumors
    tf_organs: dict[str, dict[str, list[str]]] = {}  # organ -> {cell_type -> [stages]}
    for f in neoplastic_findings:
        organ = f.get("specimen", "").upper()
        cell_type = f.get("cell_type", "unclassified")
        morphology = f.get("finding", "")
        stages = _match_stage(morphology, TF_STAGE_TERMS)
        tf_organs.setdefault(organ, {}).setdefault(cell_type, []).extend(stages)

    # Collect MI precursors per organ
    mi_stages_by_organ: dict[str, list[str]] = {}  # organ -> [stages]
    mi_precursors_by_organ: dict[str, list[dict]] = {}  # organ -> [finding details]
    for f in mi_precursor_findings:
        organ = f.get("specimen", "").upper()
        finding_text = f.get("finding", "")
        stages = _match_stage(finding_text, MI_PRECURSOR_TERMS)
        if stages:
            mi_stages_by_organ.setdefault(organ, []).extend(stages)
            mi_precursors_by_organ.setdefault(organ, []).append({
                "finding": finding_text,
                "stages_matched": stages,
                "specimen": f.get("specimen", ""),
            })

    progressions = []
    for organ, cell_types in tf_organs.items():
        for cell_type, tf_stages in cell_types.items():
            if cell_type == "unclassified":
                continue

            sequence_def = PROGRESSION_SEQUENCES.get(cell_type)
            if not sequence_def:
                continue

            # Combine MI stages + TF stages
            mi_stages = set(mi_stages_by_organ.get(organ, []))
            all_stages_present = list(set(tf_stages) | mi_stages)

            # Check which defined stages are present
            stages_present = [s for s in sequence_def if s in all_stages_present]

            # Need at least one MI precursor and one TF tumor stage
            has_mi = any(s in mi_stages for s in stages_present)
            has_tf = any(s in tf_stages for s in stages_present)

            if not stages_present:
                continue

            progressions.append({
                "organ": organ,
                "cell_type": cell_type,
                "stages": sequence_def,
                "stages_present": stages_present,
                "complete": len(stages_present) == len(sequence_def),
                "mi_precursors": mi_precursors_by_organ.get(organ, []),
                "has_mi_precursor": has_mi,
                "has_tf_tumor": has_tf,
            })

    return progressions


def _parse_pm(study: StudyInfo) -> list[dict]:
    """Parse PM (Palpable Masses) domain as metadata."""
    if "pm" not in study.xpt_files:
        return []

    try:
        pm_df, _ = read_xpt(study.xpt_files["pm"])
        pm_df.columns = [c.upper() for c in pm_df.columns]
    except Exception:
        return []

    masses = []
    for _, row in pm_df.iterrows():
        animal_id = str(row.get("USUBJID", ""))
        location = str(row.get("PMLOC", row.get("PMSPEC", "")))
        # Try to get dose level from DM merge, but PM is metadata-only
        masses.append({
            "animal_id": animal_id,
            "location": location,
            "finding": str(row.get("PMSTRESC", row.get("PMORRES", "MASS"))),
        })

    return masses
