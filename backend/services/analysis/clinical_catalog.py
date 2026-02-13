"""Clinical insight layer — post-pass annotation on rule results.

Matches histopathology findings against a curated catalog of clinically
significant lesions (C01–C15), annotates results with clinical metadata,
promotes severity for sentinel/high-concern findings, suppresses
protective labels for excluded findings, and computes confidence.
"""

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Catalog — 15 clinically significant finding patterns
# ---------------------------------------------------------------------------

CLINICAL_CATALOG = [
    {
        "id": "C01",
        "name": "Male reproductive — atrophy/degeneration",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": ["TESTIS", "EPIDIDYMIS", "SEMINAL VESICLE", "PROSTATE"],
        "findings": ["ATROPHY", "DEGENERATION", "HYPOSPERMIA", "ASPERMIA",
                      "GERM CELL DEPLETION"],
        "min_n_affected": 1,
        "min_severity": 1,
    },
    {
        "id": "C02",
        "name": "Ovary atrophy/follicular depletion",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": ["OVARY"],
        "findings": ["ATROPHY", "DEGENERATION", "FOLLICULAR DEPLETION",
                      "DECREASED CORPORA LUTEA"],
        "min_n_affected": 1,
        "min_severity": 1,
    },
    {
        "id": "C03",
        "name": "Uterus atrophy",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["UTERUS"],
        "findings": ["ATROPHY"],
        "min_n_affected": 2,
        "min_severity": 1,
    },
    {
        "id": "C04",
        "name": "Malignant neoplasia (any organ)",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": None,  # any organ
        "findings": ["CARCINOMA", "SARCOMA", "LYMPHOMA", "LEUKEMIA", "MALIGNANT"],
        "min_n_affected": 1,
        "min_severity": 1,
    },
    {
        "id": "C05",
        "name": "Benign neoplasia",
        "clinical_class": "ContextDependent",
        "elevate_to": None,  # flag for review only
        "specimens": None,
        "findings": ["ADENOMA", "FIBROMA", "BENIGN"],
        "min_n_affected": 2,
        "min_severity": 1,
    },
    {
        "id": "C06",
        "name": "Neurotoxic injury",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": ["BRAIN", "SPINAL CORD", "SCIATIC NERVE",
                       "PERIPHERAL NERVE", "DORSAL ROOT GANGLIA"],
        "findings": ["NECROSIS", "DEGENERATION", "GLIOSIS", "DEMYELINATION",
                      "AXONAL DEGENERATION", "NEURONAL NECROSIS"],
        "min_n_affected": 1,
        "min_severity": 1,
    },
    {
        "id": "C07",
        "name": "Bone marrow hypocellularity/aplasia",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": ["BONE MARROW", "STERNUM", "FEMUR"],
        "findings": ["HYPOCELLULARITY", "APLASIA", "DECREASED CELLULARITY"],
        "min_n_affected": 1,
        "min_severity": 2,
    },
    {
        "id": "C08",
        "name": "Liver necrosis/degeneration",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["LIVER"],
        "findings": ["NECROSIS", "HEPATOCELLULAR NECROSIS", "SINGLE CELL NECROSIS",
                      "CENTRILOBULAR NECROSIS", "DEGENERATION",
                      "HEPATOCELLULAR DEGENERATION"],
        "min_n_affected": 2,
        "min_severity": 1,
    },
    {
        "id": "C09",
        "name": "Kidney tubular necrosis/degeneration",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["KIDNEY"],
        "findings": ["TUBULAR NECROSIS", "CORTICAL NECROSIS",
                      "TUBULAR DEGENERATION", "PAPILLARY NECROSIS"],
        "min_n_affected": 2,
        "min_severity": 1,
    },
    {
        "id": "C10",
        "name": "Heart myocardial necrosis/degeneration",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["HEART"],
        "findings": ["MYOCYTE NECROSIS", "MYOCARDIAL NECROSIS",
                      "DEGENERATION", "FIBROSIS"],
        "min_n_affected": 2,
        "min_severity": 2,
    },
    {
        "id": "C11",
        "name": "Lung diffuse alveolar damage/hemorrhage",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["LUNG", "LUNGS"],
        "findings": ["ALVEOLAR DAMAGE", "HEMORRHAGE", "EDEMA"],
        "min_n_affected": 2,
        "min_severity": 2,
    },
    {
        "id": "C12",
        "name": "GI tract ulceration/perforation",
        "clinical_class": "Sentinel",
        "elevate_to": "adverse",
        "specimens": ["STOMACH", "ESOPHAGUS", "SMALL INTESTINE",
                       "LARGE INTESTINE", "COLON", "CECUM", "RECTUM",
                       "DUODENUM", "JEJUNUM", "ILEUM"],
        "findings": ["ULCERATION", "PERFORATION", "ULCER"],
        "min_n_affected": 1,
        "min_severity": 2,
    },
    {
        "id": "C13",
        "name": "Lymphoid depletion (immune organs)",
        "clinical_class": "HighConcern",
        "elevate_to": "adverse",
        "specimens": ["THYMUS", "SPLEEN", "LYMPH NODE"],
        "findings": ["LYMPHOID DEPLETION", "ATROPHY", "DECREASED CELLULARITY",
                      "APOPTOSIS"],
        "min_n_affected": 3,
        "min_severity": 2,
    },
    {
        "id": "C14",
        "name": "Liver hypertrophy (adaptive)",
        "clinical_class": "ModerateConcern",
        "elevate_to": None,  # flag only
        "specimens": ["LIVER"],
        "findings": ["HEPATOCELLULAR HYPERTROPHY", "CENTRILOBULAR HYPERTROPHY",
                      "HYPERTROPHY"],
        "min_n_affected": 3,
        "min_severity": 2,
    },
    {
        "id": "C15",
        "name": "Thyroid follicular hypertrophy/hyperplasia",
        "clinical_class": "ModerateConcern",
        "elevate_to": None,  # flag only
        "specimens": ["THYROID"],
        "findings": ["FOLLICULAR HYPERTROPHY", "FOLLICULAR HYPERPLASIA"],
        "min_n_affected": 3,
        "min_severity": 2,
    },
]

# ---------------------------------------------------------------------------
# Protective exclusions — block protective labeling for these findings
# ---------------------------------------------------------------------------

# Organ systems that should never be labeled protective
_EXCLUDED_ORGAN_SYSTEMS = {"reproductive", "hematopoietic", "immune", "hematologic"}

# Findings that should never be labeled protective (neoplasia)
_EXCLUDED_PROTECTIVE_FINDINGS = [
    "CARCINOMA", "SARCOMA", "LYMPHOMA", "LEUKEMIA", "MALIGNANT",
    "ADENOMA", "FIBROMA", "BENIGN",
]

PROTECTIVE_EXCLUSIONS = [
    {"id": "PEX01", "desc": "Reproductive organs",
     "check": "organ_system"},
    {"id": "PEX02", "desc": "Neoplasia",
     "check": "neoplasia_finding"},
    {"id": "PEX03", "desc": "Low baseline (control < 10%)",
     "check": "low_control_incidence", "max_control_incidence": 0.10},
    {"id": "PEX04", "desc": "Sentinel/HighConcern finding",
     "check": "catalog_class"},
    {"id": "PEX05", "desc": "Single-animal decrease",
     "check": "single_animal", "max_n_affected_treated": 1},
    {"id": "PEX06", "desc": "Hematopoietic/immune organs",
     "check": "organ_system"},
    {"id": "PEX07", "desc": "Non-monotonic without significance",
     "check": "non_monotonic"},
]


# ---------------------------------------------------------------------------
# Matching logic
# ---------------------------------------------------------------------------

def _matches_finding(data_finding: str, catalog_findings: list[str]) -> bool:
    """Case-insensitive substring match — catalog term found in data finding."""
    upper = data_finding.upper()
    return any(term in upper for term in catalog_findings)


def _matches_specimen(data_specimen: str, catalog_specimens: list[str] | None) -> bool:
    """Case-insensitive — catalog specimen found in data specimen string.
    None means any specimen matches (used for neoplasia rules).
    """
    if catalog_specimens is None:
        return True
    upper = data_specimen.upper()
    return any(term in upper for term in catalog_specimens)


def match_catalog(params: dict) -> dict | None:
    """Match a rule result's params against catalog entries.

    Returns the first matching catalog entry dict, or None.
    """
    specimen = (params.get("specimen") or "").upper()
    finding = (params.get("finding") or "").upper()
    if not finding:
        return None

    for entry in CLINICAL_CATALOG:
        if _matches_specimen(specimen, entry["specimens"]) and \
           _matches_finding(finding, entry["findings"]):
            return entry
    return None


# ---------------------------------------------------------------------------
# Confidence computation
# ---------------------------------------------------------------------------

def compute_clinical_confidence(
    params: dict,
    match: dict,
) -> str:
    """Compute clinical confidence: High / Medium / Low.

    Based on:
    - n_affected vs threshold
    - dose-response pattern quality
    - clinical class weight
    """
    n_affected = params.get("n_affected", 0)
    min_n = match.get("min_n_affected", 1)
    pattern = params.get("dose_response_pattern", "")
    clinical_class = match.get("clinical_class", "")

    score = 0

    # n_affected contribution
    if n_affected >= min_n * 3:
        score += 3
    elif n_affected >= min_n * 2:
        score += 2
    elif n_affected >= min_n:
        score += 1

    # Dose-response pattern contribution
    if pattern in ("monotonic_increase", "monotonic_decrease"):
        score += 2
    elif pattern == "threshold":
        score += 1

    # Clinical class weight
    if clinical_class == "Sentinel":
        score += 2
    elif clinical_class == "HighConcern":
        score += 1

    # Statistical significance boost
    p_value = params.get("p_value")
    if p_value is not None and p_value < 0.01:
        score += 1

    if score >= 6:
        return "High"
    elif score >= 3:
        return "Medium"
    return "Low"


# ---------------------------------------------------------------------------
# Protective exclusion check
# ---------------------------------------------------------------------------

def _check_protective_exclusion(result: dict, catalog_match: dict | None) -> tuple[bool, str | None]:
    """Check if a protective (R18/R19) result should be excluded.

    Returns (excluded: bool, exclusion_id: str | None).
    """
    params = result.get("params", {})
    organ_system = result.get("organ_system", "").lower()
    finding = (params.get("finding") or "").upper()

    # PEX01 + PEX06: Excluded organ systems
    if organ_system in _EXCLUDED_ORGAN_SYSTEMS:
        return True, "PEX01" if organ_system == "reproductive" else "PEX06"

    # PEX02: Neoplasia
    if any(term in finding for term in _EXCLUDED_PROTECTIVE_FINDINGS):
        return True, "PEX02"

    # PEX03: Low control incidence (< 10%)
    ctrl_pct_str = params.get("ctrl_pct", "")
    if ctrl_pct_str:
        try:
            ctrl_pct = float(ctrl_pct_str)
            if ctrl_pct < 10:
                return True, "PEX03"
        except (ValueError, TypeError):
            pass

    # PEX04: Sentinel or HighConcern catalog match
    if catalog_match and catalog_match.get("clinical_class") in ("Sentinel", "HighConcern"):
        return True, "PEX04"

    # PEX05: Single-animal decrease
    n_affected = params.get("n_affected", 0)
    if n_affected <= 1:
        return True, "PEX05"

    # PEX07: Non-monotonic without significance
    pattern = params.get("dose_response_pattern", "")
    if pattern == "non_monotonic":
        p_value = params.get("p_value")
        treatment_related = params.get("treatment_related", False)
        if not treatment_related and (p_value is None or p_value >= 0.05):
            return True, "PEX07"

    return False, None


# ---------------------------------------------------------------------------
# Main entry point — post-pass on rule results
# ---------------------------------------------------------------------------

def apply_clinical_layer(results: list[dict], findings: list[dict]) -> list[dict]:
    """Annotate rule results with clinical catalog metadata.

    Modifies results in-place:
    1. Adds clinical_class, catalog_id, clinical_confidence to matched findings
    2. Promotes severity for sentinel/high-concern findings meeting thresholds
    3. Suppresses R18/R19 for findings matching protective exclusions
    4. Un-dampens R10 for sentinel findings
    """
    # Build a lookup from finding identity to finding data (for group_stats)
    finding_lookup: dict[str, dict] = {}
    for f in findings:
        key = f"{f.get('domain')}_{f.get('test_code')}_{f.get('sex')}"
        finding_lookup[key] = f

    for result in results:
        params = result.get("params", {})
        rule_id = result.get("rule_id", "")

        # Only annotate endpoint-scoped rules with specimen/finding data
        if result.get("scope") != "endpoint":
            continue

        # Try to match against catalog
        catalog_match = match_catalog(params)

        # --- R18/R19: Check protective exclusions ---
        if rule_id in ("R18", "R19"):
            excluded, exclusion_id = _check_protective_exclusion(result, catalog_match)
            if excluded:
                params["protective_excluded"] = True
                params["exclusion_id"] = exclusion_id
                # Neutralize the output text
                finding_name = params.get("finding", "unknown")
                specimen_name = params.get("specimen", "unknown")
                result["output_text"] = (
                    f"{finding_name} in {specimen_name}: decreased incidence "
                    f"noted but excluded from protective classification "
                    f"({exclusion_id})."
                )

        if not catalog_match:
            continue

        # --- Annotate with catalog metadata ---
        params["clinical_class"] = catalog_match["clinical_class"]
        params["catalog_id"] = catalog_match["id"]

        # Compute confidence
        params["clinical_confidence"] = compute_clinical_confidence(
            params, catalog_match
        )

        # --- Severity promotion ---
        n_affected = params.get("n_affected", 0)
        min_n = catalog_match.get("min_n_affected", 1)
        elevate_to = catalog_match.get("elevate_to")

        if elevate_to and n_affected >= min_n:
            # Promote info → warning for sentinel/high-concern findings
            if result["severity"] == "info" and \
               catalog_match["clinical_class"] in ("Sentinel", "HighConcern"):
                result["severity"] = "warning"

        # --- R10 un-dampening for sentinel findings ---
        if rule_id == "R10" and params.get("dampened"):
            if catalog_match["clinical_class"] == "Sentinel":
                # Un-dampen: restore severity, clear dampening flags
                result["severity"] = "warning"
                params["dampened"] = False
                params["dampening_reason"] = None
                logger.info(
                    "Un-dampened R10 for sentinel finding %s (%s)",
                    params.get("finding", ""),
                    catalog_match["id"],
                )

    return results
