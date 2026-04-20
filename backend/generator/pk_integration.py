"""Cross-domain PK integration (PC + PP + DM).

Generates pk_integration.json with exposure context for NOAEL determination.
Reads PC (plasma concentrations) and PP (derived PK parameters) XPT domains,
links TK satellite subjects to dose groups, and computes HED/MRSD.

Pattern follows tumor_summary.py (cross-domain generator module).
"""

import json
import logging
import math
from pathlib import Path

import numpy as np
import pandas as pd

from generator.subject_syndromes import SEVERITY_MAP
from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt

log = logging.getLogger(__name__)

ANNOTATIONS_DIR = Path(__file__).resolve().parent.parent / "annotations"
_KM_FACTORS_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "config" / "km-factors.json"
_STD10_THRESHOLDS_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "config" / "std10-mi-severity-thresholds.json"
_CL_TERMS_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "config" / "life-threatening-cl-terms.json"

# JSON key -> SEND DM SPECIES values (explicit mapping, not algorithmic)
_JSON_KEY_TO_SEND = {
    "mouse": "MOUSE", "hamster": "HAMSTER", "rat": "RAT",
    "ferret": "FERRET", "guinea_pig": "GUINEA PIG",
    "rabbit": "RABBIT", "monkey": "MONKEY", "dog": "DOG",
    "minipig": "MINIPIG",
    "marmoset": "MARMOSET", "squirrel_monkey": "SQUIRREL MONKEY",
    "baboon": "BABOON", "human_child": "HUMAN CHILD",
}

# Additional SEND DM SPECIES aliases -> JSON key
_SEND_ALIASES = {
    "MINI PIG": "minipig",
    "GOTTINGEN MINIPIG": "minipig",
    "CYNOMOLGUS": "monkey",
    "CYNOMOLGUS MONKEY": "monkey",
}

_KM_TABLE_CACHE: dict | None = None


def _load_km_table() -> dict:
    """Load Km factors from km-factors.json. Lazy-loaded, module-level cache.

    Returns dict keyed by SEND SPECIES string (uppercase), values are
    {"km": int, "conversion_factor": float, "body_weight_kg": float}.
    Skips entries marked _reference_only (human).
    """
    global _KM_TABLE_CACHE
    if _KM_TABLE_CACHE is not None:
        return _KM_TABLE_CACHE

    with open(_KM_FACTORS_PATH) as fh:
        data = json.load(fh)

    table: dict = {}
    for json_key, entry in data["species"].items():
        if entry.get("_reference_only"):
            continue
        send_key = _JSON_KEY_TO_SEND.get(json_key)
        if send_key is None:
            continue
        table[send_key] = {
            "km": entry["km"],
            "conversion_factor": entry["conversion_factor"],
            "body_weight_kg": entry.get("body_weight_kg"),
        }

    # Register SEND aliases (point to the same entry)
    for alias, json_key in _SEND_ALIASES.items():
        send_key = _JSON_KEY_TO_SEND.get(json_key)
        if send_key and send_key in table:
            table[alias] = table[send_key]

    assert "RAT" in table and table["RAT"]["km"] == 6, "Km table smoke check failed"
    _KM_TABLE_CACHE = table
    return _KM_TABLE_CACHE


_STD10_CONFIG_CACHE: dict | None = None
_CL_TERMS_CACHE: dict | None = None


def _load_std10_config() -> dict:
    """Load STD10 MI severity thresholds. Lazy-loaded, module-level cache."""
    global _STD10_CONFIG_CACHE
    if _STD10_CONFIG_CACHE is not None:
        return _STD10_CONFIG_CACHE
    with open(_STD10_THRESHOLDS_PATH) as fh:
        _STD10_CONFIG_CACHE = json.load(fh)
    return _STD10_CONFIG_CACHE


def _load_cl_terms() -> dict:
    """Load life-threatening CL terms. Lazy-loaded, module-level cache."""
    global _CL_TERMS_CACHE
    if _CL_TERMS_CACHE is not None:
        return _CL_TERMS_CACHE
    with open(_CL_TERMS_PATH) as fh:
        _CL_TERMS_CACHE = json.load(fh)
    return _CL_TERMS_CACHE


# MISEV text -> numeric grade (canonical source: subject_syndromes.SEVERITY_MAP)
_MISEV_MAP = SEVERITY_MAP

# BW severity thresholds by species
_BW_THRESHOLDS: dict[str, dict] = {
    "RAT":    {"rate_pct": 10.0, "cumulative_pct": 20.0},
    "MOUSE":  {"rate_pct": 10.0, "cumulative_pct": 20.0},
    "DOG":    {"rate_pct": 10.0, "cumulative_pct": 20.0},
    "MONKEY": {"rate_pct": 6.0,  "cumulative_pct": 12.0},
    "_default": {"rate_pct": 10.0, "cumulative_pct": 20.0},
}
# SEND aliases for species
_BW_SPECIES_ALIASES: dict[str, str] = {
    "CYNOMOLGUS": "MONKEY", "CYNOMOLGUS MONKEY": "MONKEY",
    "MINIPIG": "DOG", "MINI PIG": "DOG", "GOTTINGEN MINIPIG": "DOG",
}

# MA severe structural terms (fallback when MASEV not available)
_MA_SEVERE_TERMS = {"mass", "necrosis", "perforation"}


# Primary PK parameters to extract (in priority order for display)
PRIMARY_PARAMS = ["CMAX", "AUCLST", "AUCTAU", "TMAX", "TLST"]


def build_pk_integration(
    study: StudyInfo,
    dose_groups: list[dict],
    noael: list[dict],
    tk_setcds: set[str] | None = None,
) -> dict:
    """Build PK integration summary from PC + PP + DM domains.

    Args:
        study: StudyInfo for reading raw XPT data.
        dose_groups: Dose group definitions from build_dose_groups().
        noael: NOAEL summary rows from build_noael_summary().

    Returns:
        Dict written as pk_integration.json.
    """
    # Check availability
    if "pc" not in study.xpt_files or "pp" not in study.xpt_files:
        return {"available": False}
    if "dm" not in study.xpt_files:
        return {"available": False}

    try:
        pc_df = _read_domain(study, "pc")
        pp_df = _read_domain(study, "pp")
        dm_df = _read_domain(study, "dm")
    except Exception:
        return {"available": False}

    if pc_df is None or pp_df is None or dm_df is None:
        return {"available": False}
    if pc_df.empty or pp_df.empty:
        return {"available": False}

    # Read POOLDEF if available (for pooled PK data)
    pooldef_df = _read_domain(study, "pooldef")

    # Detect TK satellite design — use authoritative tk_setcds from dose_groups
    tk_design = _detect_tk_design(dm_df, tk_setcds=tk_setcds)

    # Link TK subjects to dose levels
    pp_merged = _link_tk_to_dose(
        pp_df, dm_df, dose_groups, tk_setcds=tk_setcds,
        pooldef_df=pooldef_df,
    )
    if pp_merged.empty:
        return {"available": False}

    # Detect analyte info from PC
    analyte = _get_unique_val(pc_df, "PCTESTCD", fallback="UNKNOWN")
    specimen = _get_unique_val(pc_df, "PCSPEC", fallback="PLASMA")
    lloq, lloq_unit = _get_lloq(pc_df)

    # Visit days
    visit_days = _get_visit_days(pp_df)
    multi_visit = len(visit_days) > 1

    # Available PP parameters
    pp_params = _get_available_params(pp_merged)

    # Build per-dose-group stats
    by_dose_group = _build_dose_group_stats(
        pp_merged, pc_df, dm_df, dose_groups, tk_design, lloq,
        tk_setcds=tk_setcds,
    )

    # Dose proportionality (needs ≥ 3 dose groups with AUC)
    # Check TK survivorship to distinguish real PK non-monotonicity from artifact
    tk_survivorship = _check_tk_survivorship(study, dm_df, tk_design)
    dose_prop = _compute_dose_proportionality(by_dose_group, tk_survivorship)

    # Accumulation: not available for single-visit studies
    accumulation = {"available": False, "ratio": None, "assessment": "unknown",
                    "reason": f"Single visit day ({visit_days[0]})" if visit_days else "No visit days"}

    # Species + HED/MRSD
    species = _get_species(study)
    km_table = _load_km_table()
    species_upper = species.upper().strip() if species else ""
    km_info = km_table.get(species_upper)
    if species and km_info is None:
        log.warning("Species '%s' not found in Km table -- HED/MRSD unavailable", species)

    # Find NOAEL and LOAEL dose levels from noael summary
    noael_dose_level, loael_dose_level, noael_dose_value = _get_noael_loael_levels(noael)

    # Extract exposure at NOAEL and LOAEL
    noael_exposure = _extract_exposure_at_dose(by_dose_group, noael_dose_level)
    loael_exposure = _extract_exposure_at_dose(by_dose_group, loael_dose_level)

    # HED/MRSD computation
    hed = _compute_hed(noael_dose_value, km_info, noael_dose_level)

    # Modality-aware safety margin (Feature 1B + 1C)
    from services.analysis.compound_class import infer_compound_class
    from services.analysis.subject_context import get_ts_metadata
    ts_meta = get_ts_metadata(study)
    compound_info = infer_compound_class(
        ts_meta,
        available_domains=set(study.xpt_files.keys()),
        species=species,
    )
    oncology_flag = _detect_oncology_flag(study, compound_info)
    margin_method = _select_margin_method(compound_info, pp_available=True,
                                          oncology_flag=oncology_flag)

    safety_margin = _compute_safety_margin_v2(
        study=study,
        noael_exposure=noael_exposure,
        loael_exposure=loael_exposure,
        hed=hed,
        noael_dose_value=noael_dose_value,
        noael_dose_level=noael_dose_level,
        margin_method=margin_method,
        compound_info=compound_info,
        by_dose_group=by_dose_group,
    )

    return {
        "available": True,
        "species": species,
        "km_factor": km_info["km"] if km_info else None,
        "hed_conversion_factor": km_info["conversion_factor"] if km_info else None,
        "tk_design": tk_design,
        "analyte": analyte,
        "specimen": specimen,
        "lloq": lloq,
        "lloq_unit": lloq_unit,
        "visit_days": visit_days,
        "multi_visit": multi_visit,
        "pp_parameters_available": pp_params,
        "by_dose_group": by_dose_group,
        "dose_proportionality": dose_prop,
        "accumulation": accumulation,
        "noael_exposure": noael_exposure,
        "loael_exposure": loael_exposure,
        "hed": hed,
        "safety_margin": safety_margin,
        "compound_class": compound_info.get("compound_class"),
        "margin_method": margin_method,
    }


# ─── Modality-aware safety margin (Features 1B + 1C) ────────


# Compound class -> margin method mapping (Feature 1B)
_COMPOUND_CLASS_TO_MARGIN: dict[str, str] = {
    "small_molecule": "bsa_hed",
    # Biologics -> exposure-based AUC ratio
    "checkpoint_inhibitor": "exposure_auc",
    "anti_vegf_mab": "exposure_auc",
    "bispecific_tce": "exposure_auc",
    "anti_il6_mab": "exposure_auc",
    "anti_tnf_mab": "exposure_auc",
    "anti_il17_mab": "exposure_auc",
    "anti_il4_il13_mab": "exposure_auc",
    "anti_il1_mab": "exposure_auc",
    "monoclonal_antibody": "exposure_auc",
    "biologic_unspecified": "exposure_auc",
    "recombinant_epo": "exposure_auc",
    "recombinant_gcsf": "exposure_auc",
    "recombinant_ifn": "exposure_auc",
    "oligonucleotide": "exposure_auc",
    # ADC -> multi-analyte
    "adc": "multi_analyte_adc",
    # Gene therapy -> vg/kg pass-through
    "aav_gene_therapy": "gene_therapy_vgkg",
    "lentiviral_gene_therapy": "gene_therapy_vgkg",
    "lnp_mrna": "gene_therapy_vgkg",
    "gene_therapy": "gene_therapy_vgkg",
    "gene_editing": "gene_therapy_vgkg",
    "gene_editing_aav": "gene_therapy_vgkg",
    "gene_editing_lnp": "gene_therapy_vgkg",
    "gene_editing_lentiviral": "gene_therapy_vgkg",
    # Vaccine -> dose-based BSA
    "vaccine": "bsa_hed",
}

# Fc-fusion variants use prefix matching
_FC_FUSION_PREFIX = "fc_fusion_"


def _select_margin_method(compound_info: dict, pp_available: bool,
                          oncology_flag: bool = False) -> str:
    """Select margin calculation method from compound class detection.

    oncology_flag overrides modality-based routing per ICH S9.
    """
    # Oncology override: takes precedence over modality-based method
    if oncology_flag:
        return "oncology_s9_mortality"

    cc = compound_info.get("compound_class", "")

    # Check explicit mapping
    method = _COMPOUND_CLASS_TO_MARGIN.get(cc)
    if method is None and cc.startswith(_FC_FUSION_PREFIX):
        method = "exposure_auc"
    if method is None and cc.startswith("adc_"):
        method = "multi_analyte_adc"

    if method is None:
        method = "bsa_fallback"

    # If exposure-based but no PP data, fall back to BSA HED
    if method == "exposure_auc" and not pp_available:
        method = "bsa_fallback"

    return method


def _detect_oncology_flag(study: StudyInfo, compound_info: dict) -> bool:
    """Detect if study should use oncology (ICH S9) margin method.

    Checks: (a) compound profile suggested_profiles containing oncology IDs,
    (b) program annotation regulatory-context: 'ich_s9'.
    """
    # Check compound profile suggested_profiles
    suggested = compound_info.get("suggested_profiles", [])
    oncology_profiles = {"oncology", "antineoplastic", "cytotoxic"}
    if any(p.lower() in oncology_profiles for p in suggested if isinstance(p, str)):
        return True

    # Check compound profile annotation
    ann_path = ANNOTATIONS_DIR / study.study_id / "compound_profile.json"
    if ann_path.exists():
        try:
            with open(ann_path) as f:
                profile = json.load(f)
            if profile.get("regulatory_context") == "ich_s9":
                return True
        except Exception:
            pass

    # Check program annotations for regulatory-context
    programs_dir = ANNOTATIONS_DIR / "_programs"
    if programs_dir.exists():
        for prog_dir in programs_dir.iterdir():
            if not prog_dir.is_dir():
                continue
            rc_path = prog_dir / "regulatory_context.json"
            if rc_path.exists():
                try:
                    with open(rc_path) as f:
                        data = json.load(f)
                    for _key, entry in data.items():
                        if (entry.get("study_id") == study.study_id or _key == study.study_id):
                            if entry.get("value") == "ich_s9":
                                return True
                except Exception:
                    pass
    return False


def _load_clinical_data(study: StudyInfo) -> dict:
    """Load clinical Cmax/AUC from compound profile annotation."""
    result: dict = {"clinical_cmax": None, "clinical_cmax_unit": None,
                    "clinical_auc": None, "clinical_auc_unit": None}
    ann_path = ANNOTATIONS_DIR / study.study_id / "compound_profile.json"
    if ann_path.exists():
        try:
            with open(ann_path) as f:
                profile = json.load(f)
            result["clinical_cmax"] = profile.get("clinical_cmax")
            result["clinical_cmax_unit"] = profile.get("clinical_cmax_unit")
            result["clinical_auc"] = profile.get("clinical_auc")
            result["clinical_auc_unit"] = profile.get("clinical_auc_unit")
        except Exception as e:
            log.warning("Failed to read compound profile for %s: %s", study.study_id, e)

    # Also check program annotations
    _programs_dir = ANNOTATIONS_DIR / "_programs"
    if _programs_dir.exists():
        for prog_dir in _programs_dir.iterdir():
            if not prog_dir.is_dir():
                continue
            for schema_file in ("clinical_dose.json", "clinical_auc.json"):
                fpath = prog_dir / schema_file
                if fpath.exists():
                    try:
                        with open(fpath) as f:
                            data = json.load(f)
                        # Check if this program's annotation references our study
                        for _key, entry in data.items():
                            if entry.get("study_id") == study.study_id or _key == study.study_id:
                                if schema_file == "clinical_auc.json" and result["clinical_auc"] is None:
                                    result["clinical_auc"] = entry.get("value")
                                    result["clinical_auc_unit"] = entry.get("unit")
                                elif schema_file == "clinical_dose.json" and result["clinical_cmax"] is None:
                                    result["clinical_cmax"] = entry.get("value")
                                    result["clinical_cmax_unit"] = entry.get("unit")
                    except Exception:
                        pass
    return result


def _compute_cmax_margin(noael_exposure: dict | None, loael_exposure: dict | None,
                         clinical_cmax: float | None, clinical_cmax_unit: str | None) -> dict | None:
    """Compute Cmax-based safety margin (preserved from original)."""
    if clinical_cmax is None or not isinstance(clinical_cmax, (int, float)) or clinical_cmax <= 0:
        return {"available": False, "note": "No clinical Cmax provided"}

    ref_exposure = noael_exposure or loael_exposure
    ref_label = "NOAEL" if noael_exposure else "LOAEL"
    if ref_exposure is None:
        return {"available": False, "note": "No NOAEL/LOAEL exposure data",
                "clinical_cmax": clinical_cmax, "clinical_cmax_unit": clinical_cmax_unit}

    animal_cmax = ref_exposure.get("cmax", {}).get("mean")
    if animal_cmax is None or animal_cmax <= 0:
        return {"available": False, "note": f"No Cmax at {ref_label} dose",
                "clinical_cmax": clinical_cmax, "clinical_cmax_unit": clinical_cmax_unit}

    margin = round(animal_cmax / clinical_cmax, 2)
    return {
        "available": True,
        "margin": margin,
        "reference_dose": ref_label,
        "animal_cmax": animal_cmax,
        "animal_cmax_unit": ref_exposure.get("cmax", {}).get("unit"),
        "clinical_cmax": clinical_cmax,
        "clinical_cmax_unit": clinical_cmax_unit,
    }


def _compute_auc_margin(noael_exposure: dict | None, clinical_auc: float | None,
                        clinical_auc_unit: str | None) -> dict | None:
    """Compute AUC-based safety margin (Feature 1C: measured-AUC mode)."""
    if noael_exposure is None:
        return {"available": False, "note": "NOAEL not established; AUC margin requires NOAEL dose"}

    auc_data = noael_exposure.get("auc")
    if auc_data is None or auc_data.get("mean") is None:
        return {"available": False, "note": "No AUC data at NOAEL dose"}

    noael_auc = auc_data["mean"]
    if clinical_auc is None or not isinstance(clinical_auc, (int, float)) or clinical_auc <= 0:
        return {
            "available": False,
            "note": "clinical AUC not provided",
            "noael_auc": noael_auc,
            "noael_auc_unit": auc_data.get("unit"),
        }

    margin = round(noael_auc / clinical_auc, 2)
    return {
        "available": True,
        "margin": margin,
        "noael_auc": noael_auc,
        "noael_auc_unit": auc_data.get("unit"),
        "clinical_auc": clinical_auc,
        "clinical_auc_unit": clinical_auc_unit,
    }


def _compute_adc_margins(by_dose_group: list[dict], noael_dose_level: int | None) -> list[dict]:
    """Compute multi-analyte margins for ADCs (Feature 1B).

    ADCs report 3 analytes in PP: total antibody, ADC (conjugated), free payload.
    Returns one margin row per analyte found.
    """
    if noael_dose_level is None:
        return [{"analyte": "ADC", "available": False,
                 "note": "NOAEL not established"}]

    group = next((g for g in by_dose_group if g["dose_level"] == noael_dose_level), None)
    if group is None:
        return [{"analyte": "ADC", "available": False,
                 "note": "No PK data at NOAEL dose"}]

    params = group.get("parameters", {})
    results = []
    for param_key in ["CMAX", "AUCLST", "AUCTAU"]:
        param_data = params.get(param_key)
        if param_data and param_data.get("mean") is not None:
            results.append({
                "analyte": param_data.get("analyte", param_key),
                "parameter": param_key,
                "value": param_data["mean"],
                "unit": param_data.get("unit", ""),
                "available": True,
                "note": "Clinical comparator values needed for margin computation",
            })

    if not results:
        return [{"analyte": "ADC", "available": False,
                 "note": "No PK parameters at NOAEL dose"}]

    # Caveat: real ADC studies should have 3 analytes (total Ab, ADC, free payload)
    # identified by PCTEST/PCTESTCD. Current data shows PK parameter types, not
    # analyte-specific rows. This is a data limitation, not a logic error.
    if len(results) > 0 and all(r.get("analyte") in ("CMAX", "AUCLST", "AUCTAU") for r in results):
        for r in results:
            r["note"] = "Parameter-level data; multi-analyte resolution requires PCTEST analyte labels"

    return results


# ─── Clopper-Pearson CI ──────────────────────────────────────


def _clopper_pearson_ci(k: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Exact binomial (Clopper-Pearson) confidence interval.

    Returns (lower, upper) as proportions in [0, 1].
    """
    from scipy.stats import beta as beta_dist
    if n == 0:
        return (0.0, 1.0)
    if k == 0:
        lo = 0.0
    else:
        lo = beta_dist.ppf(alpha / 2, k, n - k + 1)
    if k == n:
        hi = 1.0
    else:
        hi = beta_dist.ppf(1 - alpha / 2, k + 1, n - k)
    return (float(lo), float(hi))


# ─── STD10 Tier 2 classification ─────────────────────────────


def _get_organ_regen_tier(organ: str, config: dict) -> str:
    """Determine organ regenerative capacity tier (low/moderate/high).

    Falls back to 'high' (most conservative -- highest threshold).
    """
    organ_upper = organ.upper().strip()
    for tier, organs in config["organ_regen_tiers"].items():
        if organ_upper in organs:
            return tier
        # Partial match for composite organ names (e.g. "BONE MARROW, FEMUR")
        for org in organs:
            if org in organ_upper or organ_upper.startswith(org):
                return tier
    return "high"


def _check_mi_severe(study: StudyInfo, config: dict, max_tier: int = 2) -> dict[str, list[str]]:
    """Check MI domain for severe findings per the adversity dictionary.

    Only categories with std10_tier <= max_tier are evaluated.
    Returns {USUBJID: [reason, ...]} for subjects meeting MI criteria.
    Bilateral organs: classify on most severe finding across sides.
    """
    mi_df = _read_domain(study, "mi")
    if mi_df is None or mi_df.empty:
        return {}

    glomerular_terms = [t.lower() for t in config.get("glomerular_override_terms", [])]
    result: dict[str, list[str]] = {}

    for _, row in mi_df.iterrows():
        term = str(row.get("MISTRESC", "")).strip().lower()
        sev_str = str(row.get("MISEV", "")).strip().upper()
        organ = str(row.get("MISPEC", row.get("MILOC", ""))).strip()
        usubjid = str(row.get("USUBJID", ""))

        if not term or not usubjid:
            continue

        sev_grade = _MISEV_MAP.get(sev_str, 0)

        for cat in config["categories"]:
            # Only include categories at or below the requested tier
            cat_tier = cat.get("std10_tier")
            if cat_tier is None or cat_tier > max_tier:
                continue

            # Check if finding term matches any category term (substring)
            matched = any(ct in term for ct in cat["terms"])
            if not matched:
                continue

            # Check organ constraint if present
            organ_constraint = cat.get("organ_constraint")
            if organ_constraint:
                organ_upper = organ.upper()
                if not any(oc in organ_upper for oc in organ_constraint):
                    continue

            # Determine regen tier for this organ
            regen_tier = _get_organ_regen_tier(organ, config)

            # Glomerular override: kidney glomerular lesions use low-regen threshold
            if regen_tier == "moderate" and any(gt in term for gt in glomerular_terms):
                regen_tier = "low"

            # Check organ-specific override
            organ_override = cat.get("organ_override", {}).get(organ.upper())
            if organ_override:
                threshold = organ_override.get("misev_threshold")
            else:
                threshold_key = f"misev_threshold_{regen_tier}_regen"
                threshold = cat.get(threshold_key)

            # null threshold = any severity triggers
            if threshold is None:
                reason = f"MI: {term} in {organ} (any severity, {cat['category']})"
                result.setdefault(usubjid, []).append(reason)
            elif sev_grade >= threshold:
                reason = f"MI: {term} in {organ} (sev {sev_str}>={threshold}, {cat['category']})"
                result.setdefault(usubjid, []).append(reason)

    return result


def _check_bw_severe(
    study: StudyInfo, species: str,
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Check BW domain for severe body weight loss.

    Sustained loss (classifies as severe):
      Rate: >threshold% loss in a 5-10 day interval, CONFIRMED by a subsequent
      measurement (within 14 days) still at or below the pre-drop weight.
      This filters single-timepoint fluctuations (fasting, handling stress,
      scale precision). NC3Rs 10%/week is a humane endpoint threshold designed
      for real-time welfare monitoring; retrospective classification requires
      confirmation that the loss trajectory is sustained, not transient.
      Cumulative: >=threshold% loss from baseline (inherently sustained).

    Acute BW event (flag for review, not auto-severe):
      >15% normalized loss in a single interval with no full recovery at the
      next measurement. Flagged as an acute event for toxicologist review --
      may represent genuine acute toxicity or measurement artifact.

    Returns (severe_subjects, acute_events) as two dicts of {USUBJID: [reason]}.
    Only severe_subjects contribute to the Tier 2 severity numerator.
    """
    empty: tuple[dict[str, list[str]], dict[str, list[str]]] = ({}, {})
    bw_df = _read_domain(study, "bw")
    if bw_df is None or bw_df.empty:
        return empty

    if "BWSTRESN" not in bw_df.columns:
        return empty

    # Coerce to numeric (some studies have string-typed numeric columns)
    bw_df = bw_df.copy()
    bw_df["BWSTRESN"] = pd.to_numeric(bw_df["BWSTRESN"], errors="coerce")

    day_col = "BWDY" if "BWDY" in bw_df.columns else ("VISITDY" if "VISITDY" in bw_df.columns else None)
    if day_col is None:
        return empty
    bw_df[day_col] = pd.to_numeric(bw_df[day_col], errors="coerce")

    # Species-aware thresholds
    sp = species.upper().strip() if species else ""
    sp = _BW_SPECIES_ALIASES.get(sp, sp)
    thresholds = _BW_THRESHOLDS.get(sp, _BW_THRESHOLDS["_default"])
    rate_threshold = thresholds["rate_pct"]
    cum_threshold = thresholds["cumulative_pct"]

    severe: dict[str, list[str]] = {}
    acute_events: dict[str, list[str]] = {}

    for usubjid, subj_df in bw_df.groupby("USUBJID"):
        subj_sorted = subj_df.dropna(subset=["BWSTRESN", day_col]).sort_values(day_col)
        if subj_sorted.empty:
            continue

        days = subj_sorted[day_col].values
        weights = subj_sorted["BWSTRESN"].values
        baseline = weights[0]
        if baseline <= 0:
            continue

        uid = str(usubjid)

        # Cumulative check: >=threshold% loss from baseline
        for w in weights:
            loss_pct = ((baseline - w) / baseline) * 100
            if loss_pct >= cum_threshold:
                reason = f"BW: {loss_pct:.1f}% cumulative loss (>={cum_threshold}%)"
                severe.setdefault(uid, []).append(reason)
                break

        # Rate check: sustained loss (confirmed across consecutive intervals)
        # Skip if <3 measurements (can't confirm)
        if len(weights) < 3:
            continue

        sustained_found = False
        acute_found = False

        for i in range(len(weights) - 1):
            if sustained_found:
                break
            for j in range(i + 1, len(weights)):
                gap_ij = days[j] - days[i]
                if gap_ij < 5 or gap_ij > 10:
                    continue
                if weights[i] <= 0:
                    continue
                loss_pct = ((weights[i] - weights[j]) / weights[i]) * 100
                norm_loss = loss_pct * (7.0 / gap_ij)
                if norm_loss <= rate_threshold:
                    continue

                # >threshold% loss found. Confirm sustained: any measurement
                # within 14 days after j still at or below pre-drop weight.
                confirmed = False
                for k in range(j + 1, len(weights)):
                    gap_jk = days[k] - days[j]
                    if gap_jk <= 0:
                        continue
                    if gap_jk > 14:
                        break
                    if weights[k] <= weights[i]:
                        confirmed = True
                        break

                if confirmed:
                    reason = (
                        f"BW: {norm_loss:.1f}%/week sustained loss "
                        f"(>{rate_threshold}%, confirmed)"
                    )
                    severe.setdefault(uid, []).append(reason)
                    sustained_found = True
                    break

                # Not sustained. Check acute event: >15% with no full recovery.
                if norm_loss > 15.0 and not acute_found:
                    no_full_recovery = False
                    for k in range(j + 1, len(weights)):
                        gap_jk = days[k] - days[j]
                        if gap_jk <= 0:
                            continue
                        if gap_jk > 10:
                            break
                        if weights[k] < weights[i]:
                            no_full_recovery = True
                            break
                    if no_full_recovery:
                        reason = (
                            f"BW: {norm_loss:.1f}%/week acute event "
                            f"(no full recovery)"
                        )
                        acute_events.setdefault(uid, []).append(reason)
                        acute_found = True

                break  # one rate evaluation per starting index

    return severe, acute_events


def _check_cl_severe(study: StudyInfo) -> dict[str, list[str]]:
    """Check CL domain for life-threatening clinical signs.

    Two-tier matching:
    - unqualified: substring match triggers
    - severity_dependent: triggers only if no exclude modifiers present

    Returns {USUBJID: [reason, ...]}.
    """
    cl_df = _read_domain(study, "cl")
    if cl_df is None or cl_df.empty:
        return {}

    if "CLSTRESC" not in cl_df.columns:
        return {}

    terms_config = _load_cl_terms()
    unqualified = terms_config["unqualified"]
    sev_dependent = terms_config["severity_dependent"]
    sev_exclude = terms_config["severity_dependent_exclude"]

    result: dict[str, list[str]] = {}

    for _, row in cl_df.iterrows():
        term = str(row.get("CLSTRESC", "")).strip().lower()
        usubjid = str(row.get("USUBJID", ""))
        if not term or not usubjid:
            continue

        # Unqualified: any substring match
        for ut in unqualified:
            if ut in term:
                reason = f"CL: {term} (matches '{ut}')"
                result.setdefault(usubjid, []).append(reason)
                break
        else:
            # Severity-dependent: match only if no exclude modifiers
            for st in sev_dependent:
                if st in term:
                    has_exclude = any(ex in term for ex in sev_exclude)
                    if not has_exclude:
                        reason = f"CL: {term} (severity-dependent '{st}', no mild modifier)"
                        result.setdefault(usubjid, []).append(reason)
                    break

    return result


def _check_ma_severe(study: StudyInfo) -> dict[str, list[str]]:
    """Check MA domain for severe macroscopic findings.

    When MASEV populated: MASEV >= 4 + structural terms.
    Fallback: MASTRESC matches severe terms (mass, necrosis, perforation).

    Returns {USUBJID: [reason, ...]}.
    """
    ma_df = _read_domain(study, "ma")
    if ma_df is None or ma_df.empty:
        return {}

    has_masev = "MASEV" in ma_df.columns
    has_mastresc = "MASTRESC" in ma_df.columns

    if not has_masev and not has_mastresc:
        return {}

    result: dict[str, list[str]] = {}

    for _, row in ma_df.iterrows():
        usubjid = str(row.get("USUBJID", ""))
        if not usubjid:
            continue

        if has_masev:
            masev_str = str(row.get("MASEV", "")).strip().upper()
            masev_grade = _MISEV_MAP.get(masev_str, 0)
            if masev_grade >= 4:
                term = str(row.get("MASTRESC", "")).strip().lower()
                # Spec: MASEV >= 4 + structural abnormality terms (conjunction)
                if any(st in term for st in _MA_SEVERE_TERMS):
                    reason = f"MA: {term} (MASEV={masev_str})"
                    result.setdefault(usubjid, []).append(reason)
        elif has_mastresc:
            term = str(row.get("MASTRESC", "")).strip().lower()
            if any(st in term for st in _MA_SEVERE_TERMS):
                reason = f"MA: {term} (matches severe term, no MASEV)"
                result.setdefault(usubjid, []).append(reason)

    return result


def _classify_severe_toxicity_tier2(
    study: StudyInfo,
    species: str | None,
    subject_ctx: list[dict],
) -> dict:
    """Classify subjects as severely toxic at Tier 2 (expanded criteria).

    Aggregates MI, BW, CL, MA, and DS (mortality) domains.
    Each subject counted at most once regardless of how many criteria are met.

    Returns per-dose-group severity data with per-sex breakdown.
    """
    config = _load_std10_config()

    # Build subject lookup: USUBJID -> {dose, sex, dose_value, is_control}
    subj_info: dict[str, dict] = {}
    for s in subject_ctx:
        uid = s.get("USUBJID", "")
        if not uid:
            continue
        subj_info[uid] = {
            "dose_order": s.get("DOSE_GROUP_ORDER", 0),
            "dose_value": s.get("DOSE", 0.0),
            "sex": s.get("SEX", ""),
            "is_control": s.get("IS_CONTROL", False),
            "is_tk": s.get("IS_TK", False),
        }

    # Collect severe subjects from each domain
    mi_severe = _check_mi_severe(study, config)
    bw_severe, bw_acute_events = _check_bw_severe(study, species or "")
    cl_severe = _check_cl_severe(study)
    ma_severe = _check_ma_severe(study)

    # Load mortality for DS domain (Tier 1 baseline)
    gen_dir = Path(__file__).resolve().parent.parent / "generated" / study.study_id
    mortality_path = gen_dir / "study_mortality.json"
    ds_severe: dict[str, list[str]] = {}
    if mortality_path.exists():
        try:
            with open(mortality_path) as f:
                mort_data = json.load(f)
            # early_death_subjects: {USUBJID: disposition} dict
            eds = mort_data.get("early_death_subjects", {})
            if isinstance(eds, dict):
                for uid, disposition in eds.items():
                    if uid:
                        ds_severe[uid] = [f"DS: {disposition}"]
        except Exception:
            pass

    # Merge all domains into unified subject-level classification
    all_severe: dict[str, list[str]] = {}
    for domain_results in [mi_severe, bw_severe, cl_severe, ma_severe, ds_severe]:
        for uid, reasons in domain_results.items():
            all_severe.setdefault(uid, []).extend(reasons)

    # Build per-dose-group severity data (excluding controls and TK subjects)
    dose_groups_seen: dict[int, dict] = {}  # dose_order -> {dose_value, M_n, F_n, M_severe, F_severe, subjects}
    for uid, info in subj_info.items():
        if info["is_control"] or info["is_tk"]:
            continue
        order = info["dose_order"]
        if order not in dose_groups_seen:
            dose_groups_seen[order] = {
                "dose_value": info["dose_value"],
                "M_n": 0, "F_n": 0,
                "M_severe": 0, "F_severe": 0,
                "subjects": [],
            }
        dg = dose_groups_seen[order]
        sex = info["sex"].upper()
        if sex == "M":
            dg["M_n"] += 1
        elif sex == "F":
            dg["F_n"] += 1

        if uid in all_severe:
            if sex == "M":
                dg["M_severe"] += 1
            elif sex == "F":
                dg["F_severe"] += 1
            dg["subjects"].append({
                "usubjid": uid,
                "sex": sex,
                "criteria": all_severe[uid],
            })

    # Build output
    severity_data: list[dict] = []
    for order in sorted(dose_groups_seen.keys()):
        dg = dose_groups_seen[order]
        m_n, f_n = dg["M_n"], dg["F_n"]
        m_sev, f_sev = dg["M_severe"], dg["F_severe"]
        total_n = m_n + f_n
        total_sev = m_sev + f_sev
        rate = total_sev / total_n if total_n > 0 else 0.0
        m_rate = m_sev / m_n if m_n > 0 else 0.0
        f_rate = f_sev / f_n if f_n > 0 else 0.0

        ci_lo, ci_hi = _clopper_pearson_ci(total_sev, total_n)
        m_ci = _clopper_pearson_ci(m_sev, m_n)
        f_ci = _clopper_pearson_ci(f_sev, f_n)

        severity_data.append({
            "dose_level": order,
            "dose_value": dg["dose_value"],
            "n": total_n,
            "severe_count": total_sev,
            "rate": round(rate, 4),
            "ci_95": [round(ci_lo, 4), round(ci_hi, 4)],
            "per_sex": {
                "M": {"n": m_n, "severe": m_sev, "rate": round(m_rate, 4),
                       "ci_95": [round(m_ci[0], 4), round(m_ci[1], 4)]},
                "F": {"n": f_n, "severe": f_sev, "rate": round(f_rate, 4),
                       "ci_95": [round(f_ci[0], 4), round(f_ci[1], 4)]},
            },
            "subjects": dg["subjects"],
        })

    # Domain contributions summary
    domain_counts = {
        "MI": len(mi_severe),
        "BW": len(bw_severe),
        "CL": len(cl_severe),
        "MA": len(ma_severe),
        "DS": len(ds_severe),
    }

    # Count severe subjects among treated only (exclude controls + TK)
    treated_uids = {uid for uid, info in subj_info.items()
                    if not info["is_control"] and not info["is_tk"]}
    total_severe_treated = sum(1 for uid in all_severe if uid in treated_uids)

    # Acute BW events: flagged for review, not counted in severity numerator
    acute_count = sum(1 for uid in bw_acute_events if uid in treated_uids)

    return {
        "severity_data": severity_data,
        "domain_contributions": domain_counts,
        "total_severe_subjects": total_severe_treated,
        "bw_acute_events": acute_count,
    }


def _compute_mortality_tier(study: StudyInfo) -> dict:
    """Compute Tier 1 (mortality-only) STD10/HNSTD.

    Preserved from original _compute_oncology_margin for backward compat.
    Returns the mortality tier dict with method "oncology_s9_mortality".
    """
    gen_dir = Path(__file__).resolve().parent.parent / "generated" / study.study_id
    mortality_path = gen_dir / "study_mortality.json"
    if not mortality_path.exists():
        return {"available": False, "method": "oncology_s9_mortality",
                "note": "No mortality data available"}

    try:
        with open(mortality_path) as f:
            mortality = json.load(f)
    except Exception:
        return {"available": False, "method": "oncology_s9_mortality",
                "note": "Failed to read mortality data"}

    by_dose = mortality.get("by_dose", [])
    if not by_dose:
        return {"available": False, "method": "oncology_s9_mortality",
                "note": "No per-dose mortality data"}

    # Load subject_context for group N and sex lookup
    ctx_path = gen_dir / "subject_context.json"
    group_n: dict[int, int] = {}
    sex_lookup: dict[str, str] = {}  # USUBJID -> SEX
    group_n_by_sex: dict[str, dict[int, int]] = {"M": {}, "F": {}}
    if ctx_path.exists():
        try:
            with open(ctx_path) as f:
                ctx = json.load(f)
            if isinstance(ctx, list):
                # subject_context.json is a flat list of subject dicts
                from collections import Counter
                non_tk = [s for s in ctx if not s.get("IS_TK", False)]
                order_counts = Counter(s.get("DOSE_GROUP_ORDER", 0) for s in non_tk)
                group_n = dict(order_counts)
                # Build sex lookup and per-sex group N
                for s in non_tk:
                    uid = s.get("USUBJID", "")
                    sex = s.get("SEX", "")
                    if uid:
                        sex_lookup[uid] = sex
                    if sex in ("M", "F"):
                        order = s.get("DOSE_GROUP_ORDER", 0)
                        group_n_by_sex[sex][order] = group_n_by_sex[sex].get(order, 0) + 1
            elif isinstance(ctx, dict):
                for dg in ctx.get("dose_groups", []):
                    group_n[dg["dose_level"]] = dg.get("n_total", 0)
        except Exception:
            pass

    # Compute mortality rate per dose
    dose_mortality: list[dict] = []
    sex_dose_deaths: dict[str, dict[int, list]] = {"M": {}, "F": {}}
    any_mortality = False
    for dg in by_dose:
        level = dg["dose_level"]
        if level == 0:
            continue  # Skip control
        # deaths is the TOTAL count; deaths_undetermined is a SUBSET (not additive)
        deaths = dg.get("deaths", 0)
        n = group_n.get(level, 0)
        rate = deaths / n if n > 0 else 0.0
        dose_value = dg.get("dose_value", 0.0)
        if deaths > 0:
            any_mortality = True
        dose_mortality.append({
            "dose_level": level,
            "dose_value": dose_value,
            "deaths": deaths,
            "n": n,
            "rate": rate,
        })
        # Track deaths by sex for per_sex breakdown
        dead_subjects = dg.get("subjects", [])
        for sex in ("M", "F"):
            sex_deaths = [uid for uid in dead_subjects if sex_lookup.get(uid) == sex]
            sex_dose_deaths[sex][level] = sex_deaths

    # Build per-sex mortality data
    per_sex: dict[str, dict] = {}
    for sex in ("M", "F"):
        sex_mort: list[dict] = []
        for dm in dose_mortality:
            level = dm["dose_level"]
            n_sex = group_n_by_sex[sex].get(level, 0)
            deaths_sex = len(sex_dose_deaths[sex].get(level, []))
            rate_sex = deaths_sex / n_sex if n_sex > 0 else 0.0
            sex_mort.append({
                "dose_level": level,
                "dose_value": dm["dose_value"],
                "deaths": deaths_sex,
                "n": n_sex,
                "rate": rate_sex,
            })
        per_sex[sex] = {"mortality_data": sex_mort}

    if not any_mortality:
        # Fallback: HNSTD / 6 (highest non-severely toxic dose)
        if dose_mortality:
            hnstd = max(dm["dose_value"] for dm in dose_mortality)
            mrsd = round(hnstd / 6, 4) if hnstd > 0 else None
            return {
                "available": mrsd is not None,
                "method": "oncology_hnstd_fallback",
                "hnstd_mg_kg": hnstd,
                "mrsd_mg_kg": mrsd,
                "safety_factor": 6,
                "note": "No mortality at any dose; using HNSTD/6 per ICH S9 Q&A",
                "per_sex": per_sex,
            }
        return {"available": False, "method": "oncology_s9_mortality",
                "note": "No treated dose groups with mortality data"}

    # Linear interpolation to find STD10 (dose at 10% mortality)
    # Reuses _interpolate_std10 with mortality-specific caveats
    dose_mortality.sort(key=lambda x: x["dose_value"])
    caveats: list[str] = []

    std10 = _interpolate_std10(dose_mortality)

    # Derive caveats from the interpolation result and input data
    if std10 is not None and dose_mortality[0]["rate"] >= 0.10:
        caveats.append("STD10 at or below lowest tested dose")
    elif std10 is not None and all(dm["rate"] < 0.10 for dm in dose_mortality):
        caveats.append("Mortality present but <10% at all doses; using highest dose as conservative STD10")

    groups_with_deaths = sum(1 for dm in dose_mortality if dm["deaths"] > 0)
    if groups_with_deaths < 3:
        caveats.append(f"Sparse mortality data ({groups_with_deaths} groups with deaths)")

    if std10 is None:
        return {"available": False, "method": "oncology_s9_mortality",
                "note": "Could not estimate STD10", "caveats": caveats,
                "per_sex": per_sex}

    mrsd = round(std10 / 10, 4)
    return {
        "available": True,
        "method": "oncology_s9_mortality",
        "std10_mg_kg": round(std10, 4),
        "mrsd_mg_kg": mrsd,
        "safety_factor": 10,
        "mortality_data": dose_mortality,
        "per_sex": per_sex,
        "caveats": caveats if caveats else None,
    }


def _interpolate_std10(severity_data: list[dict]) -> float | None:
    """Linear interpolation to find STD10 from expanded severity rates."""
    if not severity_data:
        return None
    sorted_data = sorted(severity_data, key=lambda x: x["dose_value"])
    if sorted_data[0]["rate"] >= 0.10:
        return sorted_data[0]["dose_value"]
    for i in range(len(sorted_data) - 1):
        low = sorted_data[i]
        high = sorted_data[i + 1]
        if low["rate"] < 0.10 <= high["rate"]:
            if high["rate"] != low["rate"]:
                frac = (0.10 - low["rate"]) / (high["rate"] - low["rate"])
                return low["dose_value"] + frac * (high["dose_value"] - low["dose_value"])
            return low["dose_value"]
    if sorted_data[-1]["rate"] > 0:
        return sorted_data[-1]["dose_value"]
    return None


def _compute_expanded_tier(
    study: StudyInfo,
    species: str | None,
    subject_ctx: list[dict],
    is_rodent: bool,
) -> dict:
    """Compute Tier 2 (expanded severity) STD10 or HNSTD.

    For rodent: interpolates STD10 from expanded severity rates.
    For non-rodent (N<6): outputs HNSTD with CI and fragility annotation.
    """
    tier2 = _classify_severe_toxicity_tier2(study, species, subject_ctx)
    severity_data = tier2["severity_data"]

    if not severity_data:
        return {
            "available": False,
            "method": "oncology_s9_expanded",
            "note": "No treated dose groups for expanded classification",
        }

    # Per-sex STD10: compute for each sex independently
    per_sex: dict[str, dict] = {}
    primary_sex = None
    primary_std10 = None

    for sex_label in ["M", "F"]:
        sex_data = []
        for sd in severity_data:
            ps = sd["per_sex"].get(sex_label, {})
            if ps.get("n", 0) > 0:
                sex_data.append({
                    "dose_value": sd["dose_value"],
                    "rate": ps["rate"],
                    "n": ps["n"],
                    "severe": ps["severe"],
                    "ci_95": ps["ci_95"],
                })
        if not sex_data:
            continue

        if is_rodent:
            sex_std10 = _interpolate_std10(sex_data)
            sex_mrsd = round(sex_std10 / 10, 4) if sex_std10 else None
            per_sex[sex_label] = {
                "std10_mg_kg": round(sex_std10, 4) if sex_std10 else None,
                "mrsd_mg_kg": sex_mrsd,
                "severity_data": sex_data,
            }
            if sex_std10 is not None:
                if primary_std10 is None or sex_std10 < primary_std10:
                    primary_std10 = sex_std10
                    primary_sex = sex_label
        else:
            # Non-rodent: HNSTD = highest dose where 0 subjects meet Tier 2
            sorted_data = sorted(sex_data, key=lambda x: x["dose_value"])
            hnstd = None
            for sd in reversed(sorted_data):
                if sd["severe"] == 0:
                    hnstd = sd["dose_value"]
                    break
            sex_mrsd = round(hnstd / 6, 4) if hnstd and hnstd > 0 else None
            fragility = None
            if any(sd["n"] < 6 for sd in sorted_data):
                max_n = max(sd["n"] for sd in sorted_data)
                fragility = (
                    f"N={max_n}/group: single borderline finding "
                    f"shifts HNSTD by one dose level"
                )
            per_sex[sex_label] = {
                "hnstd_mg_kg": hnstd,
                "mrsd_mg_kg": sex_mrsd,
                "severity_data": sex_data,
                "fragility": fragility,
            }
            if hnstd is not None:
                if primary_std10 is None or hnstd < primary_std10:
                    primary_std10 = hnstd
                    primary_sex = sex_label

    # Combined (both sexes) computation
    if is_rodent:
        combined_std10 = _interpolate_std10(severity_data)
        combined_mrsd = round(combined_std10 / 10, 4) if combined_std10 else None
        method = "oncology_s9_expanded"
        result = {
            "available": combined_std10 is not None,
            "method": method,
            "std10_mg_kg": round(combined_std10, 4) if combined_std10 else None,
            "mrsd_mg_kg": combined_mrsd,
            "severity_data": severity_data,
            "per_sex": per_sex,
            "primary_sex": primary_sex,
            "domain_contributions": tier2["domain_contributions"],
        }
    else:
        # Non-rodent HNSTD
        sorted_all = sorted(severity_data, key=lambda x: x["dose_value"])
        hnstd = None
        for sd in reversed(sorted_all):
            if sd["severe_count"] == 0:
                hnstd = sd["dose_value"]
                break
        combined_mrsd = round(hnstd / 6, 4) if hnstd and hnstd > 0 else None
        method = "oncology_hnstd_expanded"

        caveats_list = []
        # Species-specific BW threshold uncertainty
        sp = (species or "").upper().strip()
        raw_sp = sp
        sp = _BW_SPECIES_ALIASES.get(sp, sp)
        if sp == "MONKEY":
            caveats_list.append(
                "NHP BW threshold: proportional from NC3Rs rat, "
                "not independently validated"
            )
        elif raw_sp != sp:
            # Species was aliased (e.g. MINIPIG -> DOG)
            caveats_list.append(
                f"{raw_sp} BW threshold: aliased to {sp} thresholds, "
                f"no species-specific validation"
            )
        # Fragility for small groups
        if any(sd["n"] < 6 for sd in sorted_all):
            max_n = max(sd["n"] for sd in sorted_all) if sorted_all else 0
            caveats_list.append(
                f"N={max_n}/group: single borderline finding "
                f"shifts HNSTD by one dose level"
            )

        result = {
            "available": hnstd is not None,
            "method": method,
            "hnstd_mg_kg": hnstd,
            "mrsd_mg_kg": combined_mrsd,
            "safety_factor": 6,
            "severity_data": severity_data,
            "per_sex": per_sex,
            "primary_sex": primary_sex,
            "domain_contributions": tier2["domain_contributions"],
            "caveats": caveats_list if caveats_list else None,
        }

    return result


def _compute_oncology_margin(study: StudyInfo) -> dict:
    """Compute tiered oncology margin: Tier 1 (mortality) + Tier 2 (expanded severity).

    Three-tier output per ICH S9 severe toxicity definition.
    Tier 3 (inclusive) deferred until LB organ failure markers are defined.
    """
    # Species detection
    species = _get_species(study)
    sp_upper = (species or "").upper().strip()
    is_rodent = sp_upper in {"RAT", "MOUSE", "HAMSTER", "GUINEA PIG"}

    # Tier 1: mortality-only (existing logic, preserved)
    mortality_tier = _compute_mortality_tier(study)

    # Load subject context for Tier 2
    gen_dir = Path(__file__).resolve().parent.parent / "generated" / study.study_id
    ctx_path = gen_dir / "subject_context.json"
    subject_ctx: list[dict] = []
    if ctx_path.exists():
        try:
            with open(ctx_path) as f:
                subject_ctx = json.load(f)
            if not isinstance(subject_ctx, list):
                subject_ctx = []
        except Exception:
            subject_ctx = []

    # Tier 2: expanded severity classification
    expanded_tier = _compute_expanded_tier(study, species, subject_ctx, is_rodent)

    # Tier divergence alert
    tier_divergence: dict | None = None
    mort_std10 = mortality_tier.get("std10_mg_kg")
    exp_std10 = expanded_tier.get("std10_mg_kg") or expanded_tier.get("hnstd_mg_kg")
    alert_threshold = 2.0
    if mort_std10 and exp_std10 and exp_std10 > 0:
        fold = round(mort_std10 / exp_std10, 2)
        tier_divergence = {
            "mortality_vs_expanded_fold": fold,
            "alert": fold > alert_threshold,
            "alert_threshold": alert_threshold,
        }

    # Collect caveats
    caveats: list[str] = []
    if mortality_tier.get("caveats"):
        caveats.extend(mortality_tier["caveats"])
    if expanded_tier.get("caveats"):
        caveats.extend(expanded_tier["caveats"])

    # Compound class caveat: cytotoxic/antineoplastic BM/GI context
    try:
        from services.analysis.compound_class import infer_compound_class
        cc_info = infer_compound_class(study)
        cc = cc_info.get("compound_class", "")
        oncology_classes = {"oncology", "antineoplastic", "cytotoxic"}
        if cc in oncology_classes or any(cc.startswith(p) for p in oncology_classes):
            caveats.append(
                "Cytotoxic compound: BM/GI findings at lower MISEV grades "
                "may have different adversity context"
            )
    except Exception:
        pass

    return {
        "available": mortality_tier.get("available", False) or expanded_tier.get("available", False),
        "method": "oncology_s9_tiered",
        "tiers": {
            "mortality": mortality_tier,
            "expanded": expanded_tier,
        },
        "tier_divergence": tier_divergence,
        "caveats": caveats if caveats else None,
        "species": species,
        "is_rodent": is_rodent,
    }


def _compute_gene_therapy_margin(noael_dose_value: float | None,
                                 dose_unit: str | None) -> dict | None:
    """Compute gene therapy margin -- vg/kg pass-through, no Km conversion (Feature 1B)."""
    if noael_dose_value is None:
        return {"available": False, "method": "gene_therapy_vgkg",
                "note": "NOAEL not established"}

    return {
        "available": True,
        "method": "gene_therapy_vgkg",
        "noael_dose": noael_dose_value,
        "dose_unit": dose_unit or "vg/kg",
        "note": "Gene therapy: dose ratio only, no BSA/Km conversion",
    }


def _compute_safety_margin_v2(
    study: StudyInfo,
    noael_exposure: dict | None,
    loael_exposure: dict | None,
    hed: dict | None,
    noael_dose_value: float | None,
    noael_dose_level: int | None,
    margin_method: str,
    compound_info: dict,
    by_dose_group: list[dict],
) -> dict:
    """Compute modality-aware safety margin with restructured schema (Features 1B + 1C).

    Output schema:
        primary_method: str
        cmax_based: dict | None  (preserved from original)
        auc_based: dict | None   (Feature 1C: measured-AUC)
        hed_based: dict | None   (always computed when Km available)
        oncology: dict | None    (Feature 1B: oncology STD10)
        gene_therapy: dict | None (Feature 1B: vg/kg)
        adc_analytes: list | None (Feature 1B: multi-analyte)
        safety_factor: int
        margin_method: str
    """
    clinical = _load_clinical_data(study)
    clinical_cmax = clinical["clinical_cmax"]
    clinical_cmax_unit = clinical["clinical_cmax_unit"]
    clinical_auc = clinical["clinical_auc"]
    clinical_auc_unit = clinical["clinical_auc_unit"]

    # Default safety factor (can be overridden by program annotation)
    safety_factor = 10

    # Always compute Cmax margin (preserved for acute tox endpoints)
    cmax_based = _compute_cmax_margin(
        noael_exposure, loael_exposure, clinical_cmax, clinical_cmax_unit)

    # Always compute AUC margin when data available (Feature 1C)
    auc_based = _compute_auc_margin(noael_exposure, clinical_auc, clinical_auc_unit)

    # Always compute HED when Km available; structured {available: False} otherwise
    if hed is not None:
        hed_based = {
            "available": True,
            "hed_mg_kg": hed["hed_mg_kg"],
            "mrsd_mg_kg": hed["mrsd_mg_kg"],
            "safety_factor": hed["safety_factor"],
            "method": hed["method"],
            "noael_status": hed.get("noael_status"),
        }
    else:
        hed_based = {"available": False, "note": "HED unavailable (NOAEL not established or species not in Km table)"}

    # Method-specific computations
    oncology = None
    gene_therapy = None
    adc_analytes = None

    if margin_method == "oncology_s9_mortality":
        oncology = _compute_oncology_margin(study)
    elif margin_method == "gene_therapy_vgkg":
        dose_unit = None
        if by_dose_group:
            dose_unit = by_dose_group[0].get("dose_unit")
        gene_therapy = _compute_gene_therapy_margin(noael_dose_value, dose_unit)
    elif margin_method == "multi_analyte_adc":
        adc_analytes = _compute_adc_margins(by_dose_group, noael_dose_level)

    # Determine primary method based on modality and data availability
    primary_method = margin_method
    if margin_method == "exposure_auc":
        # AUC-first is the default for biologics (Feature 1C)
        if auc_based and auc_based.get("available"):
            primary_method = "measured_auc"
        elif hed_based and hed_based.get("available"):
            primary_method = "dose_hed"
        elif cmax_based and cmax_based.get("available"):
            primary_method = "cmax"
        else:
            primary_method = "exposure_auc"
    elif margin_method == "bsa_hed":
        if auc_based and auc_based.get("available"):
            primary_method = "measured_auc"
        elif hed_based and hed_based.get("available"):
            primary_method = "dose_hed"
        else:
            primary_method = "bsa_hed"
    elif margin_method == "bsa_fallback":
        if hed_based and hed_based.get("available"):
            primary_method = "dose_hed"
        else:
            primary_method = "bsa_fallback"

    return {
        "primary_method": primary_method,
        "margin_method": margin_method,
        "compound_class": compound_info.get("compound_class"),
        "cmax_based": cmax_based,
        "auc_based": auc_based,
        "hed_based": hed_based,
        "oncology": oncology,
        "gene_therapy": gene_therapy,
        "adc_analytes": adc_analytes,
        "safety_factor": safety_factor,
    }




# ─── Domain reading ───────────────────────────────────────────


def _read_domain(study: StudyInfo, domain: str) -> pd.DataFrame | None:
    """Read a domain XPT and normalize column names to uppercase."""
    if domain not in study.xpt_files:
        return None
    try:
        df, _ = read_xpt(study.xpt_files[domain])
        df.columns = [c.upper() for c in df.columns]
        return df
    except Exception:
        return None


# ─── TK satellite design detection ────────────────────────────


def _detect_tk_design(dm_df: pd.DataFrame, tk_setcds: set[str] | None = None) -> dict:
    """Detect TK satellite groups from DM SETCD column.

    When tk_setcds is provided (from dose_groups._classify_tk_sets), uses
    that authoritative classification instead of the simple endswith("TK")
    heuristic.
    """
    if "SETCD" not in dm_df.columns:
        return {
            "has_satellite_groups": False,
            "satellite_set_codes": [],
            "main_study_set_codes": [],
            "n_tk_subjects": 0,
            "individual_correlation_possible": True,
        }

    set_codes = dm_df["SETCD"].dropna().unique()

    if tk_setcds is not None:
        # Use authoritative classification from dose_groups
        tk_codes = sorted(s for s in (str(sc).strip() for sc in set_codes) if s in tk_setcds)
        main_codes = sorted(s for s in (str(sc).strip() for sc in set_codes) if s not in tk_setcds)
    else:
        # Fallback: simple suffix match (legacy behavior)
        tk_codes = sorted(str(s) for s in set_codes if str(s).upper().endswith("TK"))
        main_codes = sorted(str(s) for s in set_codes if not str(s).upper().endswith("TK"))

    n_tk = 0
    if tk_codes:
        n_tk = int(dm_df[dm_df["SETCD"].astype(str).str.strip().isin(tk_codes)].shape[0])

    return {
        "has_satellite_groups": len(tk_codes) > 0,
        "satellite_set_codes": tk_codes,
        "main_study_set_codes": main_codes,
        "n_tk_subjects": n_tk,
        "individual_correlation_possible": len(tk_codes) == 0,
    }


# ─── Link TK subjects to dose levels ──────────────────────────


def _link_tk_to_dose(
    pp_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    tk_setcds: set[str] | None = None,
    pooldef_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Merge PP with DM to get dose_level and sex per TK subject.

    Handles two SEND patterns:
    - Individual PK: PP rows have real USUBJID -> direct join to DM.
    - Pooled PK: PP rows have empty USUBJID + POOLID -> resolve via
      POOLDEF (POOLID -> USUBJID[]) then look up one representative
      subject per pool in DM to get SETCD/SEX.
    """
    if "USUBJID" not in pp_df.columns or "USUBJID" not in dm_df.columns:
        return pd.DataFrame()

    # Detect pooled PK: USUBJID is empty/missing but POOLID is populated
    pp_has_poolid = "POOLID" in pp_df.columns
    pp_usubj_empty = (
        pp_df["USUBJID"].astype(str).str.strip().replace("", pd.NA).isna().all()
    )
    is_pooled = pp_has_poolid and pp_usubj_empty

    if is_pooled:
        return _link_pooled_tk_to_dose(
            pp_df, dm_df, dose_groups, tk_setcds=tk_setcds,
            pooldef_df=pooldef_df,
        )

    # --- Individual PK path (original logic) ---
    dm_cols = ["USUBJID", "SEX"]
    if "SETCD" in dm_df.columns:
        dm_cols.append("SETCD")
    if "ARMCD" in dm_df.columns:
        dm_cols.append("ARMCD")

    dm_sub = dm_df[[c for c in dm_cols if c in dm_df.columns]].copy()

    # Merge PP with DM
    merged = pp_df.merge(dm_sub, on="USUBJID", how="inner")

    # Map SETCD to dose_level
    if "SETCD" in merged.columns:
        setcd_dose_map = _build_setcd_dose_map(dm_df, dose_groups, tk_setcds=tk_setcds)
        merged["dose_level"] = merged["SETCD"].map(setcd_dose_map)
        # Filter to TK subjects only (those with a TK SETCD that maps to a dose)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    elif "ARMCD" in merged.columns:
        # Fallback: map ARMCD to dose_level
        armcd_map = {}
        for dg in dose_groups:
            if "armcd" in dg:
                armcd_map[dg["armcd"]] = dg["dose_level"]
        merged["dose_level"] = merged["ARMCD"].map(armcd_map)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    else:
        return pd.DataFrame()

    return merged


def _link_pooled_tk_to_dose(
    pp_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    tk_setcds: set[str] | None = None,
    pooldef_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Resolve pooled PP rows to dose groups via POOLDEF -> DM lookup.

    Each pool maps to multiple subjects (POOLDEF). We pick one representative
    subject per pool to get SETCD/SEX from DM, then attach dose_level.
    The USUBJID column is set to the POOLID so downstream n_subjects counts
    reflect the number of independent measurement units (pools).
    """
    if pooldef_df is None or pooldef_df.empty:
        return pd.DataFrame()
    if "POOLID" not in pooldef_df.columns or "USUBJID" not in pooldef_df.columns:
        return pd.DataFrame()

    # Build POOLID -> representative USUBJID (first subject in pool)
    pool_rep = (
        pooldef_df.groupby("POOLID")["USUBJID"]
        .first()
        .reset_index()
        .rename(columns={"USUBJID": "_REP_USUBJID"})
    )

    # Join PP -> pool representative
    merged = pp_df.merge(pool_rep, on="POOLID", how="inner")
    if merged.empty:
        return pd.DataFrame()

    # Look up SETCD/SEX from DM via the representative USUBJID
    dm_cols = ["USUBJID", "SEX"]
    if "SETCD" in dm_df.columns:
        dm_cols.append("SETCD")
    if "ARMCD" in dm_df.columns:
        dm_cols.append("ARMCD")
    dm_sub = dm_df[[c for c in dm_cols if c in dm_df.columns]].copy()

    merged = merged.merge(
        dm_sub, left_on="_REP_USUBJID", right_on="USUBJID", how="inner",
    )
    # Use POOLID as USUBJID so downstream counts are per-pool
    merged["USUBJID"] = merged["POOLID"]
    merged = merged.drop(columns=["_REP_USUBJID"], errors="ignore")

    # Map SETCD to dose_level
    if "SETCD" in merged.columns:
        setcd_dose_map = _build_setcd_dose_map(dm_df, dose_groups, tk_setcds=tk_setcds)
        merged["dose_level"] = merged["SETCD"].map(setcd_dose_map)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    elif "ARMCD" in merged.columns:
        armcd_map = {}
        for dg in dose_groups:
            if "armcd" in dg:
                armcd_map[dg["armcd"]] = dg["dose_level"]
        merged["dose_level"] = merged["ARMCD"].map(armcd_map)
        merged = merged.dropna(subset=["dose_level"])
        merged["dose_level"] = merged["dose_level"].astype(int)
    else:
        return pd.DataFrame()

    return merged


def _build_setcd_dose_map(
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    tk_setcds: set[str] | None = None,
) -> dict:
    """Build mapping from SETCD to dose_level.

    Uses tk_setcds from dose_groups when available (authoritative).
    Falls back to matching TK SETCD prefixes to main study group numbers.
    """
    import re as _re

    setcd_dose = {}

    # Build group_number → dose_level from dose_groups
    group_num_to_dose = {}
    armcd_to_dose = {}
    for dg in dose_groups:
        dose_level = dg["dose_level"]
        group_num = str(dose_level + 1)
        group_num_to_dose[group_num] = dose_level
        if "armcd" in dg:
            armcd_to_dose[str(dg["armcd"])] = dose_level

    all_setcds = dm_df["SETCD"].dropna().unique()
    resolved = set(tk_setcds) if tk_setcds else set()

    for setcd in all_setcds:
        s = str(setcd).strip()
        su = s.upper()

        # Only map TK satellite SETCDs (not main study or combined)
        if resolved and s not in resolved:
            continue

        # Try extracting numeric prefix via regex
        m = _re.match(r"^(\d+)", su.replace("TK", "").replace("SAT", "").replace("PK", ""))
        if m:
            prefix = m.group(1)
            if prefix in group_num_to_dose:
                setcd_dose[s] = group_num_to_dose[prefix]
                continue

        # Fallback: match via ARMCD from DM
        if "ARMCD" in dm_df.columns:
            set_rows = dm_df[dm_df["SETCD"].astype(str).str.strip() == s]
            if not set_rows.empty:
                armcd = str(set_rows["ARMCD"].iloc[0]).strip()
                if armcd in armcd_to_dose:
                    setcd_dose[s] = armcd_to_dose[armcd]

    return setcd_dose


# ─── PP parameter stats ───────────────────────────────────────


def _build_dose_group_stats(
    pp_merged: pd.DataFrame,
    pc_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    tk_design: dict,
    lloq: float | None,
    tk_setcds: set[str] | None = None,
) -> list[dict]:
    """Build per-dose-group PK parameter stats and concentration-time profiles."""
    results = []

    # Get dose_value and dose_unit from dose_groups
    dose_info = {}
    for dg in dose_groups:
        dose_info[dg["dose_level"]] = {
            "dose_value": dg.get("dose_value"),
            "dose_unit": dg.get("dose_unit", "mg/kg"),
            "dose_label": dg.get("group_label", f"Group {dg['dose_level'] + 1}"),
        }

    # Concentration-time data per dose
    conc_time_by_dose = _compute_concentration_time(
        pc_df, dm_df, dose_groups, lloq, tk_setcds=tk_setcds,
    )

    for dose_level in sorted(pp_merged["dose_level"].unique()):
        dose_data = pp_merged[pp_merged["dose_level"] == dose_level]
        n_subjects = int(dose_data["USUBJID"].nunique())
        di = dose_info.get(dose_level, {})

        # Compute stats per parameter
        parameters = {}
        if "PPTESTCD" in dose_data.columns and "PPSTRESN" in dose_data.columns:
            for param in dose_data["PPTESTCD"].unique():
                param_str = str(param).upper()
                param_data = dose_data[dose_data["PPTESTCD"] == param]
                vals = pd.to_numeric(param_data["PPSTRESN"], errors="coerce").dropna()

                # Filter out negative values for AUCIFO (extrapolation failures)
                if param_str == "AUCIFO":
                    vals = vals[vals >= 0]

                if vals.empty:
                    continue

                unit = _get_unique_val(param_data, "PPSTRESU", fallback="")
                values = [round(float(v), 4) for v in vals]

                parameters[param_str] = {
                    "mean": round(float(vals.mean()), 4) if len(vals) > 0 else None,
                    "sd": round(float(vals.std(ddof=1)), 4) if len(vals) > 1 else None,
                    "median": round(float(vals.median()), 4) if len(vals) > 0 else None,
                    "n": int(len(vals)),
                    "unit": str(unit),
                    "values": values,
                }

        results.append({
            "dose_level": int(dose_level),
            "dose_value": di.get("dose_value"),
            "dose_unit": di.get("dose_unit", "mg/kg"),
            "dose_label": di.get("dose_label", f"Dose {dose_level}"),
            "n_subjects": n_subjects,
            "parameters": parameters,
            "concentration_time": conc_time_by_dose.get(int(dose_level), []),
        })

    return results


def _compute_concentration_time(
    pc_df: pd.DataFrame,
    dm_df: pd.DataFrame,
    dose_groups: list[dict],
    lloq: float | None,
    tk_setcds: set[str] | None = None,
) -> dict[int, list[dict]]:
    """Compute mean concentration-time profiles per dose group."""
    if "USUBJID" not in pc_df.columns or "PCSTRESN" not in pc_df.columns:
        return {}

    # Merge PC with DM to get SETCD
    dm_sub = dm_df[["USUBJID"]].copy()
    if "SETCD" in dm_df.columns:
        dm_sub = dm_df[["USUBJID", "SETCD"]].copy()

    pc_merged = pc_df.merge(dm_sub, on="USUBJID", how="inner")

    # Map SETCD to dose_level
    if "SETCD" not in pc_merged.columns:
        return {}

    setcd_map = _build_setcd_dose_map(dm_df, dose_groups, tk_setcds=tk_setcds)
    pc_merged["dose_level"] = pc_merged["SETCD"].map(setcd_map)
    pc_merged = pc_merged.dropna(subset=["dose_level"])
    pc_merged["dose_level"] = pc_merged["dose_level"].astype(int)

    # Parse elapsed time from PCELTM (ISO 8601 duration, e.g., "PT0.5H")
    # PCELTM column can exist but be all-empty (e.g., PDS study) -- fall through to PCTPTNUM
    has_pceltm = ("PCELTM" in pc_merged.columns
                  and pc_merged["PCELTM"].astype(str).str.strip().replace("", pd.NA).notna().any())
    if has_pceltm:
        pc_merged["elapsed_h"] = pc_merged["PCELTM"].apply(_parse_elapsed_time)
    elif "PCTPTNUM" in pc_merged.columns:
        pc_merged["elapsed_h"] = pd.to_numeric(pc_merged["PCTPTNUM"], errors="coerce")
    else:
        return {}

    # Handle BQL: use LLOQ/2
    lloq_half = (lloq / 2) if lloq and lloq > 0 else 0.0
    pc_merged["conc"] = pd.to_numeric(pc_merged["PCSTRESN"], errors="coerce")
    pc_merged["is_bql"] = pc_merged["conc"].isna()
    pc_merged["conc"] = pc_merged["conc"].fillna(lloq_half)

    # Get timepoint labels
    if "PCTPT" in pc_merged.columns:
        pc_merged["timepoint_label"] = pc_merged["PCTPT"].astype(str)
    else:
        pc_merged["timepoint_label"] = pc_merged["elapsed_h"].apply(
            lambda h: f"{h:.1f}H" if pd.notna(h) else "Unknown"
        )

    result = {}
    for dose_level, grp in pc_merged.groupby("dose_level"):
        dose_level = int(dose_level)
        timepoints = []

        # Get timepoint number for sorting
        if "PCTPTNUM" in grp.columns:
            tp_col = "PCTPTNUM"
        else:
            tp_col = "elapsed_h"

        for tp_val, tp_grp in grp.groupby(tp_col):
            elapsed = tp_grp["elapsed_h"].iloc[0] if "elapsed_h" in tp_grp.columns else None
            label = tp_grp["timepoint_label"].iloc[0]
            conc_vals = tp_grp["conc"].dropna()
            n_bql = int(tp_grp["is_bql"].sum())

            timepoints.append({
                "timepoint": str(label),
                "tptnum": int(tp_val) if pd.notna(tp_val) else 0,
                "elapsed_h": round(float(elapsed), 2) if pd.notna(elapsed) else None,
                "mean": round(float(conc_vals.mean()), 4) if len(conc_vals) > 0 else 0.0,
                "sd": round(float(conc_vals.std(ddof=1)), 4) if len(conc_vals) > 1 else 0.0,
                "n": int(len(tp_grp)),
                "n_bql": n_bql,
            })

        timepoints.sort(key=lambda t: t["elapsed_h"] if t["elapsed_h"] is not None else 0)
        result[dose_level] = timepoints

    return result


# ─── Dose proportionality ─────────────────────────────────────


def _compute_dose_proportionality(
    by_dose_group: list[dict],
    tk_survivorship: dict | None = None,
) -> dict:
    """Compute dose proportionality via log-log regression of AUC vs dose.

    Enhanced with non-monotonicity detection and survivorship cross-reference
    to distinguish real PK phenomena from artifacts of early death.
    """
    # Prefer AUCLST over AUCTAU over AUCIFO
    param = None
    for candidate in ["AUCLST", "AUCTAU", "AUCALL"]:
        has_param = all(
            candidate in g["parameters"]
            for g in by_dose_group
            if g["parameters"]
        )
        if has_param and len(by_dose_group) >= 3:
            param = candidate
            break

    if param is None or len(by_dose_group) < 3:
        return {
            "parameter": param or "AUCLST",
            "slope": None,
            "r_squared": None,
            "assessment": "insufficient_data",
            "dose_levels_used": [],
            "non_monotonic": False,
            "interpretation": None,
        }

    doses = []
    aucs = []
    dose_levels_used = []
    for g in by_dose_group:
        dose_val = g.get("dose_value")
        auc_mean = g["parameters"].get(param, {}).get("mean")
        if dose_val and dose_val > 0 and auc_mean and auc_mean > 0:
            doses.append(dose_val)
            aucs.append(auc_mean)
            dose_levels_used.append(g["dose_level"])

    if len(doses) < 3:
        return {
            "parameter": param,
            "slope": None,
            "r_squared": None,
            "assessment": "insufficient_data",
            "dose_levels_used": dose_levels_used,
            "non_monotonic": False,
            "interpretation": None,
        }

    log_doses = [math.log(d) for d in doses]
    log_aucs = [math.log(a) for a in aucs]

    # Linear regression on log-log scale
    coeffs = np.polyfit(log_doses, log_aucs, 1)
    slope = float(coeffs[0])

    # R-squared
    y_pred = np.polyval(coeffs, log_doses)
    ss_res = sum((y - yp) ** 2 for y, yp in zip(log_aucs, y_pred))
    ss_tot = sum((y - np.mean(log_aucs)) ** 2 for y in log_aucs)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # Non-monotonicity: AUC drops between consecutive dose groups
    non_monotonic = False
    drop_at_dose = None
    for i in range(1, len(aucs)):
        if aucs[i] < aucs[i - 1]:
            non_monotonic = True
            drop_at_dose = doses[i]
            break

    # Classify
    if 0.8 <= slope <= 1.2 and not non_monotonic:
        assessment = "linear"
    elif slope > 1.2:
        assessment = "supralinear"
    else:
        assessment = "sublinear"

    # Build interpretation narrative
    interpretation = _build_dp_interpretation(
        assessment, non_monotonic, drop_at_dose, slope, r_squared,
        tk_survivorship,
    )

    return {
        "parameter": param,
        "slope": round(slope, 3),
        "r_squared": round(r_squared, 4),
        "assessment": assessment,
        "dose_levels_used": dose_levels_used,
        "log_doses": [round(d, 3) for d in log_doses],
        "log_aucs": [round(a, 3) for a in log_aucs],
        "non_monotonic": non_monotonic,
        "interpretation": interpretation,
    }


def _build_dp_interpretation(
    assessment: str,
    non_monotonic: bool,
    drop_at_dose: float | None,
    slope: float,
    r_squared: float,
    tk_survivorship: dict | None,
) -> str:
    """Build a scientifically meaningful interpretation of dose proportionality."""
    if assessment == "linear":
        return "Exposure increases proportionally with dose (linear pharmacokinetics)."

    parts = []

    if non_monotonic and drop_at_dose is not None:
        parts.append(
            f"Exposure (AUC) decreases at {drop_at_dose:.0f} mg/kg despite higher dose, "
            f"indicating non-monotonic pharmacokinetics."
        )

        # Cross-reference with TK survivorship
        if tk_survivorship:
            all_survived = tk_survivorship.get("all_tk_survived", True)
            high_dose_deaths = tk_survivorship.get("high_dose_tk_deaths", 0)
            main_study_deaths = tk_survivorship.get("high_dose_main_deaths", 0)

            if all_survived and main_study_deaths > 0:
                parts.append(
                    f"TK satellite animals all survived at this dose, "
                    f"but {main_study_deaths} main study animal(s) died with target organ toxicity. "
                    f"AUC drop reflects genuine saturable absorption or autoinduction of metabolism, "
                    f"not a survivorship artifact."
                )
            elif not all_survived:
                parts.append(
                    f"{high_dose_deaths} TK satellite animal(s) died at the highest dose. "
                    f"AUC values at this dose may be unreliable due to survivorship bias."
                )
            else:
                parts.append(
                    "All TK satellite animals survived. "
                    "AUC drop is consistent with saturable absorption or autoinduction."
                )
        else:
            parts.append(
                "Possible mechanisms: saturable absorption, autoinduction of metabolism, "
                "or target organ toxicity reducing clearance capacity."
            )

        parts.append(
            f"Log-log regression slope = {slope:.2f} (R\u00b2 = {r_squared:.2f}); "
            f"low R\u00b2 confirms non-linear dose-exposure relationship."
        )
    elif assessment == "supralinear":
        parts.append(
            f"Exposure increases faster than dose (slope = {slope:.2f}), "
            "suggesting saturable first-pass metabolism or capacity-limited clearance."
        )
    else:
        parts.append(
            f"Exposure increases less than proportionally with dose (slope = {slope:.2f}), "
            "suggesting saturable absorption or dose-dependent clearance induction."
        )

    return " ".join(parts)


# ─── TK survivorship check ─────────────────────────────────────


def _check_tk_survivorship(
    study: StudyInfo,
    dm_df: pd.DataFrame,
    tk_design: dict,
) -> dict | None:
    """Check whether TK satellite animals survived, cross-referencing DS/DD.

    This distinguishes real PK non-monotonicity from survivorship artifacts:
    if TK animals at the highest dose all survived but main study animals died,
    the AUC data is reliable and the non-monotonicity is a genuine PK phenomenon.
    """
    if not tk_design.get("has_satellite_groups"):
        return None

    # Read DS domain for disposition
    ds_df = _read_domain(study, "ds")
    if ds_df is None or ds_df.empty:
        return None

    tk_codes = set(tk_design.get("satellite_set_codes", []))
    if not tk_codes or "SETCD" not in dm_df.columns:
        return None

    # Identify TK subjects at highest dose (last TK SETCD alphabetically)
    sorted_tk = sorted(tk_codes)
    high_dose_tk_code = sorted_tk[-1] if sorted_tk else None
    if not high_dose_tk_code:
        return None

    tk_subjects = set(dm_df[dm_df["SETCD"] == high_dose_tk_code]["USUBJID"])

    # Main study subjects at same dose level (SETCD without TK suffix)
    main_code = high_dose_tk_code.replace("TK", "")
    main_subjects = set(dm_df[dm_df["SETCD"] == main_code]["USUBJID"])
    # Also check recovery subjects (e.g., "4R")
    recovery_code = main_code + "R"
    if "SETCD" in dm_df.columns:
        recovery_subs = set(dm_df[dm_df["SETCD"] == recovery_code]["USUBJID"])
        main_subjects = main_subjects | recovery_subs

    # Check for deaths in DS domain
    death_codes = {"MORIBUND SACRIFICE", "FOUND DEAD", "DIED"}
    dead_subjects = set()
    if "DSDECOD" in ds_df.columns:
        dead_subjects = set(
            ds_df[ds_df["DSDECOD"].str.upper().isin(death_codes)]["USUBJID"]
        )

    tk_deaths = tk_subjects & dead_subjects
    main_deaths = main_subjects & dead_subjects

    return {
        "high_dose_tk_code": high_dose_tk_code,
        "n_tk_subjects": len(tk_subjects),
        "high_dose_tk_deaths": len(tk_deaths),
        "high_dose_main_deaths": len(main_deaths),
        "all_tk_survived": len(tk_deaths) == 0,
        "dead_tk_subjects": sorted(tk_deaths) if tk_deaths else [],
        "dead_main_subjects": sorted(main_deaths) if main_deaths else [],
    }


# ─── Species & HED ────────────────────────────────────────────


def _get_species(study: StudyInfo) -> str | None:
    """Get species from TS domain."""
    if "ts" not in study.xpt_files:
        return None
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        species_rows = ts_df[ts_df["TSPARMCD"].str.upper() == "SPECIES"]
        if not species_rows.empty:
            return str(species_rows.iloc[0].get("TSVAL", "")).strip().upper() or None
    except Exception:
        pass
    return None


def _get_noael_loael_levels(noael: list[dict]) -> tuple[int | None, int | None, float | None]:
    """Extract NOAEL and LOAEL dose levels from noael summary.

    Prefers the 'Combined' sex row, falls back to first available.
    Returns (noael_dose_level, loael_dose_level, noael_dose_value).
    """
    if not noael:
        return None, None, None

    # Prefer Combined
    row = next((r for r in noael if r.get("sex") == "Combined"), noael[0])
    noael_level = row.get("noael_dose_level")
    loael_level = row.get("loael_dose_level")
    noael_value = row.get("noael_dose_value")
    return noael_level, loael_level, noael_value


def _extract_exposure_at_dose(
    by_dose_group: list[dict],
    dose_level: int | None,
) -> dict | None:
    """Extract exposure summary at a specific dose level."""
    if dose_level is None:
        return None

    group = next((g for g in by_dose_group if g["dose_level"] == dose_level), None)
    if group is None:
        return None

    params = group.get("parameters", {})
    cmax = params.get("CMAX")
    auc = params.get("AUCLST") or params.get("AUCTAU")
    tmax = params.get("TMAX")

    return {
        "dose_level": dose_level,
        "dose_value": group.get("dose_value"),
        "cmax": {
            "mean": cmax["mean"],
            "sd": cmax.get("sd"),
            "unit": cmax.get("unit", ""),
        } if cmax else None,
        "auc": {
            "mean": auc["mean"],
            "sd": auc.get("sd"),
            "unit": auc.get("unit", ""),
        } if auc else None,
        "tmax": {
            "mean": tmax["mean"],
            "unit": tmax.get("unit", ""),
        } if tmax else None,
    }


def _compute_hed(
    noael_dose_value: float | None,
    km_info: dict | None,
    noael_dose_level: int | None = None,
) -> dict | None:
    """Compute HED and MRSD from NOAEL dose using FDA Km scaling.

    Also sets noael_status to distinguish:
    - "established": NOAEL > 0, standard HED/MRSD derivation
    - "at_control": NOAEL = control (0 mg/kg), adverse at all doses,
      HED/MRSD are zero — no safe starting dose can be derived
    """
    if noael_dose_value is None or km_info is None:
        return None

    conversion_factor = km_info["conversion_factor"]
    hed = noael_dose_value / conversion_factor
    safety_factor = 10
    mrsd = hed / safety_factor

    # Determine status
    at_control = noael_dose_level == 0 or (noael_dose_value is not None and noael_dose_value == 0)
    noael_status = "at_control" if at_control else "established"

    return {
        "noael_mg_kg": float(noael_dose_value),
        "hed_mg_kg": round(hed, 4),
        "mrsd_mg_kg": round(mrsd, 4),
        "safety_factor": safety_factor,
        "method": "FDA body surface area scaling (Km-based)",
        "noael_status": noael_status,
    }


# ─── Utility helpers ──────────────────────────────────────────


def _get_unique_val(df: pd.DataFrame, col: str, fallback: str = "") -> str:
    """Get the most common non-null value from a column."""
    if col not in df.columns:
        return fallback
    vals = df[col].dropna()
    if vals.empty:
        return fallback
    return str(vals.mode().iloc[0]) if not vals.mode().empty else str(vals.iloc[0])


def _get_lloq(pc_df: pd.DataFrame) -> tuple[float | None, str | None]:
    """Extract LLOQ from PC domain (PCLLOQ column or similar)."""
    # Try PCLLOQ column
    if "PCLLOQ" in pc_df.columns:
        vals = pd.to_numeric(pc_df["PCLLOQ"], errors="coerce").dropna()
        if not vals.empty:
            unit = _get_unique_val(pc_df, "PCSTRESU", fallback="ng/mL")
            return round(float(vals.iloc[0]), 4), unit

    # Try PCORNRLO (original normal range low)
    if "PCORNRLO" in pc_df.columns:
        vals = pd.to_numeric(pc_df["PCORNRLO"], errors="coerce").dropna()
        if not vals.empty:
            unit = _get_unique_val(pc_df, "PCSTRESU", fallback="ng/mL")
            return round(float(vals.iloc[0]), 4), unit

    return None, None


def _get_visit_days(pp_df: pd.DataFrame) -> list[int]:
    """Extract unique visit days from PP domain."""
    if "VISITDY" in pp_df.columns:
        days = pd.to_numeric(pp_df["VISITDY"], errors="coerce").dropna().unique()
        return sorted(int(d) for d in days)
    if "PPDY" in pp_df.columns:
        days = pd.to_numeric(pp_df["PPDY"], errors="coerce").dropna().unique()
        return sorted(int(d) for d in days)
    return []


def _get_available_params(pp_merged: pd.DataFrame) -> list[str]:
    """Get list of available PP parameter codes, ordered by priority."""
    if "PPTESTCD" not in pp_merged.columns:
        return []
    all_params = set(str(p).upper() for p in pp_merged["PPTESTCD"].dropna().unique())
    # Return in priority order, then any extras
    ordered = [p for p in PRIMARY_PARAMS if p in all_params]
    extras = sorted(all_params - set(PRIMARY_PARAMS))
    return ordered + extras


def _parse_elapsed_time(pceltm) -> float | None:
    """Parse ISO 8601 duration string to hours.

    Examples: "PT0.5H" → 0.5, "PT2H" → 2.0, "PT30M" → 0.5
    """
    if pd.isna(pceltm):
        return None
    s = str(pceltm).upper().strip()
    if not s.startswith("PT"):
        # Try parsing as a plain number (hours)
        try:
            return float(s)
        except (ValueError, TypeError):
            return None

    s = s[2:]  # Remove "PT"
    hours = 0.0

    # Extract hours
    if "H" in s:
        h_part, s = s.split("H", 1)
        try:
            hours += float(h_part)
        except ValueError:
            pass

    # Extract minutes
    if "M" in s:
        m_part, s = s.split("M", 1)
        try:
            hours += float(m_part) / 60.0
        except ValueError:
            pass

    # Extract seconds
    if "S" in s:
        s_part, _ = s.split("S", 1)
        try:
            hours += float(s_part) / 3600.0
        except ValueError:
            pass

    return round(hours, 4)
