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

from services.analysis.hcd_evidence import (
    RELIABILITY_N_THRESHOLD,
    build_hcd_evidence,
    empty_hcd_evidence,
)

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
    hcd_evidence: dict | None = None,
) -> str:
    """Compute clinical confidence: High / Medium / Low.

    Based on:
    - n_affected vs threshold
    - dose-response pattern quality
    - clinical class weight
    - γ-primary HCD contribution (F2) when `hcd_evidence` is supplied; the
      integer `confidence_contribution` is added to the existing score before
      thresholding. When `hcd_evidence is None` (AC-F2-1 flag-OFF / no HCD),
      scoring matches pre-change behavior byte-equal.
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

    # γ-primary HCD contribution (F2). Signed integer, pre-capped upstream.
    if hcd_evidence is not None:
        score += int(hcd_evidence.get("confidence_contribution", 0) or 0)

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
    # Only applies to protective-decrease findings (direction "down").
    # For adaptive-increase findings (R18/R19, direction "up"), low control
    # incidence is expected -- the treatment CAUSES the finding.
    direction = params.get("direction", "none")
    ctrl_pct_str = params.get("ctrl_pct", "")
    if ctrl_pct_str and direction != "up":
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

def apply_clinical_layer(
    results: list[dict],
    findings: list[dict],
    *,
    study_context: dict | None = None,
) -> list[dict]:
    """Annotate rule results with clinical catalog metadata.

    Modifies results in-place:
    1. Adds clinical_class, catalog_id, clinical_confidence to matched findings
    2. Attaches hcd_evidence record (F1/F9) -- null-safe: always present when a
       catalog match fires, even when no HCD row matches (AC-F9-2).
    3. Promotes severity for sentinel/high-concern findings meeting thresholds
    4. Suppresses R18/R19 for findings matching protective exclusions
    5. Un-dampens R10 for sentinel findings
    6. α-cell machinery (F5) runs when `enable_alpha_cell_scaling` flag is on
       AND the catalog rule has alpha_eligible==True AND the cell passes the
       background/reliability/finding-class gate.

    Args:
        study_context: optional {species, strain, study_start_year,
            duration_category, enable_alpha_cell_scaling}. Missing fields
            default to None / False; wiring falls back to the existing
            finding_class-only gate when context is unavailable.
    """
    ctx = study_context or {}
    species = ctx.get("species")
    strain = ctx.get("strain")
    study_start_year = ctx.get("study_start_year")
    duration_category = ctx.get("duration_category")
    enable_alpha = bool(ctx.get("enable_alpha_cell_scaling", False))

    # Lazy HCD imports -- avoid circular dependency when HCD DB is absent.
    hcd_db = None
    resolve_finding_term = None
    if species and strain:
        try:
            from services.analysis.hcd_database import get_sqlite_db
            from services.analysis.hcd_crosswalk import (
                resolve_finding_term as _resolve_term,
            )
            hcd_db = get_sqlite_db()
            resolve_finding_term = _resolve_term
        except Exception as exc:  # pragma: no cover -- defensive
            logger.warning("HCD wiring unavailable: %s", exc)

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

        # --- Build hcd_evidence record (F1/F9) ---
        # Null-safe: always present when a catalog match fires. AC-F9-2 flags
        # absence as a defect.
        hcd_evidence = _build_hcd_evidence_for_result(
            result=result,
            catalog_match=catalog_match,
            hcd_db=hcd_db,
            resolve_finding_term=resolve_finding_term,
            species=species,
            strain=strain,
            study_start_year=study_start_year,
            duration_category=duration_category,
        )

        # F3 defensive invariant -- set BEFORE α runs, since the floor-flag
        # guards against future consumers that might read clinical_confidence.
        hcd_evidence["noael_floor_applied"] = bool(
            catalog_match.get("clinical_class") in ("Sentinel", "HighConcern")
        )

        # --- α-cell machinery (F5, flag-gated) ---
        _apply_alpha_cell_scaling(
            catalog_match=catalog_match,
            params=params,
            hcd_evidence=hcd_evidence,
            enable_alpha=enable_alpha,
        )

        params["hcd_evidence"] = hcd_evidence

        # Compute confidence (γ-primary contribution enters here)
        params["clinical_confidence"] = compute_clinical_confidence(
            params, catalog_match, hcd_evidence=hcd_evidence,
        )
        # Pre-γ audit value (display-layer; helps UI show "HCD pushed
        # Medium->High" context).
        params["clinical_confidence_pre_gamma"] = compute_clinical_confidence(
            params, catalog_match, hcd_evidence=None,
        )

        # --- Severity promotion ---
        n_affected = params.get("n_affected", 0)
        min_n = catalog_match.get("min_n_affected", 1)
        elevate_to = catalog_match.get("elevate_to")

        # α may have raised the effective threshold (alpha_scaled_threshold);
        # honor it when present. Otherwise fall back to catalog min_n.
        effective_min_n = min_n
        if hcd_evidence.get("alpha_applies") and hcd_evidence.get("alpha_scaled_threshold"):
            effective_min_n = int(hcd_evidence["alpha_scaled_threshold"])

        promote_ok = n_affected >= effective_min_n
        # AC-F5-3: tr_adverse floor -- α cannot suppress promotion when
        # finding_class == "tr_adverse" (noael_floor_applied is True for
        # Sentinel/HighConcern; ModerateConcern with tr_adverse still promotes
        # because catalog-firing preserves the scientific floor).
        if params.get("finding_class") == "tr_adverse":
            promote_ok = n_affected >= min_n  # ignore α scaling

        if elevate_to and promote_ok:
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


# ---------------------------------------------------------------------------
# HCD wiring helpers (F9)
# ---------------------------------------------------------------------------

def _build_hcd_evidence_for_result(
    *,
    result: dict,
    catalog_match: dict,
    hcd_db,
    resolve_finding_term,
    species: str | None,
    strain: str | None,
    study_start_year: int | None,
    duration_category: str | None,
) -> dict:
    """Query HCD for one catalog-matched result and build its hcd_evidence record.

    Returns an explicit empty record (all-null inner fields) when HCD is
    unavailable, when the crosswalk misses, or when the DB query returns
    nothing (AC-F9-2).
    """
    if hcd_db is None or resolve_finding_term is None:
        return empty_hcd_evidence()

    params = result.get("params") or {}
    specimen = (params.get("specimen") or "").upper()
    sex = params.get("sex") or ""
    catalog_id = catalog_match.get("id")

    # Crosswalk: (catalog_id, organ, strain) -> canonical HCD finding term.
    # On miss -> explicit no-HCD record, not a silent substring fallback.
    canonical_term = resolve_finding_term(
        catalog_id=catalog_id, organ=specimen, strain=strain,
    )
    if canonical_term is None:
        return empty_hcd_evidence()

    try:
        hcd_row = hcd_db.query_mi_incidence(
            species=species or "", strain=strain or "", sex=sex,
            organ=specimen, finding=canonical_term,
            duration_category=duration_category,
        )
    except Exception as exc:
        logger.warning("query_mi_incidence failed: %s", exc)
        hcd_row = None

    # Counts for γ inputs
    observed_n_affected = int(params.get("n_affected") or 0)
    observed_n_total = _resolve_observed_total(result, params)

    # Direction for hcd_discordant_protective (N-1 tag)
    direction = params.get("direction") or "none"

    # Control incidence percent for the N-1 tag
    ctrl_pct = _parse_ctrl_pct(params.get("ctrl_pct"))

    return build_hcd_evidence(
        hcd_row,
        observed_n_affected=observed_n_affected,
        observed_n_total=observed_n_total,
        catalog_id=catalog_id,
        study_start_year=study_start_year,
        direction=direction,
        ctrl_pct=ctrl_pct,
    )


def _resolve_observed_total(result: dict, params: dict) -> int:
    """Best-effort extraction of the treated-group cell N."""
    n = params.get("n_total")
    if isinstance(n, int) and n > 0:
        return n
    # Fallback: pull from group_stats on the parent finding if present.
    # Rule results carry param snapshots; we avoid crossing back to findings
    # here to keep this path pure. n_affected is a safe lower bound.
    n_aff = int(params.get("n_affected") or 0)
    return max(n_aff, 1)


def _parse_ctrl_pct(raw) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# α-cell scaling (F5) -- flag-gated, Phase-1 OFF.
# ---------------------------------------------------------------------------

_ALPHA_HIGH_BG_THRESHOLD = 0.25  # 25% (provisional, RG-MIMA-10 calibration)
_ALPHA_SCALING_COEF = 0.5         # provisional coefficient


def _apply_alpha_cell_scaling(
    *,
    catalog_match: dict,
    params: dict,
    hcd_evidence: dict,
    enable_alpha: bool,
) -> None:
    """Mutate hcd_evidence with α-cell audit fields when the gate passes.

    AC-F5-1: flag OFF -> dead code path; no mutation. AC-F5-2: flag ON +
    catalog alpha_eligible + HCD bg >= 25% + N>=100 + non-tr_adverse ->
    alpha_applies, alpha_scaled_threshold, reason populated.
    """
    if not enable_alpha:
        return
    if not catalog_match.get("alpha_eligible"):
        return
    bg = hcd_evidence.get("background_rate")
    n_animals = hcd_evidence.get("background_n_animals")
    if bg is None or n_animals is None:
        return
    if bg <= _ALPHA_HIGH_BG_THRESHOLD:
        return
    if n_animals < RELIABILITY_N_THRESHOLD:
        return
    # AC-F5-3: α cannot override tr_adverse -- floor holds.
    if params.get("finding_class") == "tr_adverse":
        return

    import math
    min_n = int(catalog_match.get("min_n_affected") or 1)
    n_treated = _resolve_observed_total({"params": params}, params)
    # F5 α scaling: effective_min_n = ceil(min_n + 0.5 * N_treated * background_rate)
    scaled = int(math.ceil(min_n + _ALPHA_SCALING_COEF * n_treated * bg))

    n_affected = int(params.get("n_affected") or 0)
    source = hcd_evidence.get("source") or "unknown"
    if n_affected < scaled:
        hcd_evidence["alpha_applies"] = True
        hcd_evidence["alpha_scaled_threshold"] = scaled
        hcd_evidence["reason"] = (
            f"alpha-scaled: min_n raised from {min_n} to {scaled} due to "
            f"{bg * 100:.0f}% HCD background ({source}, N={n_animals})"
        )
