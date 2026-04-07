"""Clinical insight layer — post-pass annotation on rule results.

Matches histopathology findings against a curated catalog of clinically
significant lesions (C01–C15), annotates results with clinical metadata,
promotes severity for sentinel/high-concern findings, suppresses
protective labels for excluded findings, and computes confidence.

Rule data loaded from shared/rules/clinical-catalog-rules.json.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load catalog from JSON
# ---------------------------------------------------------------------------

_RULES_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "rules" / "clinical-catalog-rules.json"
_LOADED: dict | None = None


def _load() -> dict:
    global _LOADED
    if _LOADED is None:
        with open(_RULES_PATH) as f:
            _LOADED = json.load(f)
    return _LOADED


CLINICAL_CATALOG: list[dict] = _load()["rules"]

# Protective exclusion data
_pex = _load()["protective_exclusions"]
_EXCLUDED_ORGAN_SYSTEMS: set[str] = set(_pex["excluded_organ_systems"])
_EXCLUDED_PROTECTIVE_FINDINGS: list[str] = _pex["excluded_findings"]
PROTECTIVE_EXCLUSIONS: list[dict] = _pex["rules"]

# ---------------------------------------------------------------------------
# Legacy inline catalog removed — now loaded from JSON above
# ---------------------------------------------------------------------------
# See shared/rules/clinical-catalog-rules.json for all 15 entries (C01-C15)
# and 7 protective exclusion rules (PEX01-PEX07).



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

def _check_protective_exclusion(
    result: dict,
    catalog_match: dict | None,
    rule_id: str | None = None,
    study_context: dict | None = None,
) -> tuple[bool, str | None]:
    """Check if a protective result should be excluded.

    Args:
        result: The rule result dict with params, organ_system, etc.
        catalog_match: Clinical catalog match for the finding (if any).
        rule_id: The protective rule ID (R18-R25) for rule-aware gating.
        study_context: Study-level data for PEX08/09/10 checks. Keys:
            mortality_pct, bw_loss_pct, food_decrease_pct, study_type,
            dose_groups_with_decedents, lb_lipid_down.

    Returns (excluded: bool, exclusion_id: str | None).
    """
    params = result.get("params", {})
    organ_system = result.get("organ_system", "").lower()
    finding = (params.get("finding") or "").upper()
    ctx = study_context or {}

    # PEX01 + PEX06: Excluded organ systems
    if organ_system in _EXCLUDED_ORGAN_SYSTEMS:
        return True, "PEX01" if organ_system == "reproductive" else "PEX06"

    # PEX02: Neoplasia — R20 carve-out (R20 requires neoplastic class)
    if any(term in finding for term in _EXCLUDED_PROTECTIVE_FINDINGS):
        if rule_id != "R20":
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

    # PEX05a: Single-animal decrease
    n_affected = params.get("n_affected", 0)
    if n_affected <= 1:
        return True, "PEX05a"

    # PEX07: Non-monotonic without significance
    pattern = params.get("dose_response_pattern", "")
    if pattern == "non_monotonic":
        p_value = params.get("p_value")
        treatment_related = params.get("treatment_related", False)
        if not treatment_related and (p_value is None or p_value >= 0.05):
            return True, "PEX07"

    # PEX08: Survival bias (R20, R21, R22, R24 only)
    _PEX08_SCOPE = {"R20", "R21", "R22", "R24"}
    if rule_id in _PEX08_SCOPE:
        mortality_pct = ctx.get("mortality_pct", 0)
        study_type = ctx.get("study_type", "subchronic")
        if study_type == "subchronic" and mortality_pct > 0:
            return True, "PEX08"
        elif study_type == "chronic" and mortality_pct > 10:
            return True, "PEX08"
        # Carcinogenicity Peto-adjusted check deferred (DATA-GAP-PROT-04)

    # PEX09: Excessive toxicity confound (direct measurements, R20/R21/R22/R24)
    _PEX09_SCOPE = {"R20", "R21", "R22", "R24"}
    if rule_id in _PEX09_SCOPE:
        bw_loss = ctx.get("bw_loss_pct", 0)
        mort = ctx.get("mortality_pct", 0)
        n_dg_decedents = ctx.get("dose_groups_with_decedents", 0)
        if bw_loss > 20 or mort > 10 or n_dg_decedents >= 2:
            return True, "PEX09"

    # PEX10: Starvation/inanition gate (R23 only)
    if rule_id == "R23":
        food_dec = ctx.get("food_decrease_pct", 0)
        bw_dec = ctx.get("bw_loss_pct", 0)
        lb_lipid_down = ctx.get("lb_lipid_down", False)
        if food_dec > 20:
            return True, "PEX10"
        if bw_dec > 10:
            return True, "PEX10"
        # Combined criterion: BW>5% AND food>10% AND LB lipid down
        if bw_dec > 5 and food_dec > 10 and lb_lipid_down:
            return True, "PEX10"

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
        # NOTE: This call omits rule_id and study_context intentionally.
        # Synthetic R18/R19 from _emit_protective_rule_results() have empty
        # specimen/finding params, so catalog_match is always None and PEX
        # checks beyond PEX01-07 are never reached. If synthetic results
        # are enriched with specimen/finding params in future, pass rule_id
        # here to enable PEX08-10 gating.
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

        # Gate: skip clinical annotation for non-treatment-related findings
        # (e.g., control-only incidence with no treated-group signal)
        if not params.get("treatment_related", False):
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
