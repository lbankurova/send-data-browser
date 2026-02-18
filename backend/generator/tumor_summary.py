"""Cross-domain tumor summary with progression detection.

Generates tumor_summary.json by cross-referencing TF with MI findings.
Detects proliferative progression sequences (e.g., injury → hyperplasia → adenoma → carcinoma).
"""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from services.analysis.findings_tf import _extract_cell_type


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


def build_tumor_summary(findings: list[dict], study: StudyInfo) -> dict:
    """Build cross-domain tumor summary from pre-computed findings.

    Args:
        findings: All enriched findings from compute_all_findings().
        study: StudyInfo for reading PM domain.
    """
    # Separate TF and MI findings
    tf_findings = [f for f in findings if f.get("domain") == "TF"]
    mi_findings = [f for f in findings if f.get("domain") == "MI"]

    if not tf_findings:
        return {
            "has_tumors": False,
            "total_tumor_animals": 0,
            "total_tumor_types": 0,
            "summaries": [],
            "combined_analyses": [],
            "progression_sequences": [],
            "palpable_masses": _parse_pm(study),
        }

    # Build per-organ+morphology summaries from TF findings
    summaries = []
    all_tumor_animals: set[str] = set()

    for f in tf_findings:
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

    # Count unique tumor animals from raw TF data
    if "tf" in study.xpt_files:
        tf_df, _ = read_xpt(study.xpt_files["tf"])
        tf_df.columns = [c.upper() for c in tf_df.columns]
        if "USUBJID" in tf_df.columns:
            all_tumor_animals = set(tf_df["USUBJID"].unique())

    # Combined analyses: benign + malignant from same cell type in same organ
    combined_analyses = _compute_combined_analyses(tf_findings)

    # Progression detection: cross-reference TF tumors with MI precursors
    progression_sequences = _detect_progressions(tf_findings, mi_findings)

    return {
        "has_tumors": True,
        "total_tumor_animals": len(all_tumor_animals),
        "total_tumor_types": len(summaries),
        "summaries": summaries,
        "combined_analyses": combined_analyses,
        "progression_sequences": progression_sequences,
        "palpable_masses": _parse_pm(study),
    }


def _compute_combined_analyses(tf_findings: list[dict]) -> list[dict]:
    """Combine benign + malignant from same cell type in same organ.

    Rule: only combine when cell types match. Never combine different
    cell types in the same organ.
    """
    # Group by (organ, cell_type, sex)
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for f in tf_findings:
        organ = f.get("specimen", "")
        cell_type = f.get("cell_type", "unclassified")
        sex = f.get("sex", "")
        key = (organ, cell_type, sex)
        groups.setdefault(key, []).append(f)

    combined = []
    for (organ, cell_type, sex), group in groups.items():
        if len(group) < 2 or cell_type == "unclassified":
            continue

        adenoma_count = 0
        carcinoma_count = 0
        combined_by_dose: dict[int, dict] = {}

        for f in group:
            behavior = f.get("behavior", "UNCERTAIN")
            for gs in f.get("group_stats", []):
                dl = gs["dose_level"]
                if dl not in combined_by_dose:
                    combined_by_dose[dl] = {
                        "dose_level": dl,
                        "n": gs.get("n", 0),
                        "affected": 0,
                    }
                combined_by_dose[dl]["affected"] += gs.get("affected", 0)

                if behavior == "BENIGN":
                    adenoma_count += gs.get("affected", 0)
                elif behavior == "MALIGNANT":
                    carcinoma_count += gs.get("affected", 0)

        # Compute combined incidence
        by_dose_list = []
        for dl in sorted(combined_by_dose.keys()):
            entry = combined_by_dose[dl]
            n = entry["n"]
            affected = entry["affected"]
            by_dose_list.append({
                "dose_level": dl,
                "n": n,
                "affected": affected,
                "incidence": round(affected / n, 4) if n > 0 else 0,
            })

        # Cochran-Armitage on combined
        from services.analysis.statistics import trend_test_incidence
        counts = [d["affected"] for d in by_dose_list]
        totals = [d["n"] for d in by_dose_list]
        trend_result = trend_test_incidence(counts, totals)

        combined.append({
            "organ": organ,
            "cell_type": cell_type,
            "sex": sex,
            "adenoma_count": adenoma_count,
            "carcinoma_count": carcinoma_count,
            "combined_by_dose": by_dose_list,
            "combined_trend_p": trend_result["p_value"],
        })

    return combined


def _detect_progressions(
    tf_findings: list[dict],
    mi_findings: list[dict],
) -> list[dict]:
    """Detect proliferative progression sequences by cross-referencing TF and MI."""
    # Collect organs with TF tumors
    tf_organs: dict[str, dict[str, list[str]]] = {}  # organ → {cell_type → [stages]}
    for f in tf_findings:
        organ = f.get("specimen", "").upper()
        cell_type = f.get("cell_type", "unclassified")
        morphology = f.get("finding", "")
        stages = _match_stage(morphology, TF_STAGE_TERMS)
        tf_organs.setdefault(organ, {}).setdefault(cell_type, []).extend(stages)

    # Collect MI precursors per organ
    mi_stages_by_organ: dict[str, list[str]] = {}  # organ → [stages]
    mi_precursors_by_organ: dict[str, list[dict]] = {}  # organ → [finding details]
    for f in mi_findings:
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
