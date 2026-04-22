"""Organ-specific weight change thresholds — routed through the FCT registry.

Phase A of species-magnitude-thresholds-dog-nhp: `organ-weight-thresholds.json`
is absorbed into `shared/rules/field-consensus-thresholds.json` (the FCT
registry, strict superset) per M1 (no legacy versioning). This module preserves
its public contract — `get_organ_threshold(specimen, species)` still returns
the same dict shape so existing consumers (`_assess_om_two_gate`, adaptive
trees, OM-MI corroboration, NOAEL engine) are unchanged.

Internally, threshold resolution now routes through `fct_registry.get_fct(...)`;
FCT becomes the single source of truth for OM severity bands. Provenance is
mapped back onto the legacy `threshold_source` ∈ {regulatory, calibrated,
derived} vocabulary for backward compatibility; the richer 7-value provenance
tag is available via `get_organ_fct_bands()` for Phase B consumers.
"""

from __future__ import annotations

import json
import logging

from config import SHARED_DIR
from services.analysis import fct_registry
from services.analysis.fct_registry import FctBands, resolve_species_category

log = logging.getLogger(__name__)

# Default fallback when organ not in config
_DEFAULT_ADVERSE_FLOOR = 15

# Map SEND specimen names → FCT endpoint keys (OM domain).
# SEND uses both "GLAND, ADRENAL" and "ADRENAL GLAND" formats depending on study.
_SPECIMEN_TO_CONFIG_KEY: dict[str, str] = {
    # Adrenal
    "ADRENAL GLAND": "ADRENAL",
    "ADRENAL GLANDS": "ADRENAL",
    "ADRENALS": "ADRENAL",
    "GLAND, ADRENAL": "ADRENAL",
    # Thyroid
    "THYROID GLAND": "THYROID",
    "THYROID GLANDS": "THYROID",
    "THYROID": "THYROID",
    "GLAND, THYROID": "THYROID",
    # Reproductive
    "TESTIS": "TESTES",
    "TESTES": "TESTES",
    "OVARY": "OVARIES",
    "OVARIES": "OVARIES",
    "EPIDIDYMIS": "EPIDIDYMIDES",
    "EPIDIDYMIDES": "EPIDIDYMIDES",
    "UTERUS": "UTERUS",
    "PROSTATE": "PROSTATE",
    "PROSTATE GLAND": "PROSTATE",
    "GLAND, PROSTATE": "PROSTATE",
    "SEMINAL VESICLE": "SEMINAL_VESICLES",
    "SEMINAL VESICLES": "SEMINAL_VESICLES",
    "GLAND, SEMINAL VESICLE": "SEMINAL_VESICLES",
    "PITUITARY": "PITUITARY",
    "PITUITARY GLAND": "PITUITARY",
    "GLAND, PITUITARY": "PITUITARY",
    # Major organs
    "LIVER": "LIVER",
    "KIDNEY": "KIDNEY",
    "KIDNEYS": "KIDNEY",
    "HEART": "HEART",
    "BRAIN": "BRAIN",
    "SPLEEN": "SPLEEN",
    "THYMUS": "THYMUS",
    "LUNG": "LUNGS",
    "LUNGS": "LUNGS",
    # Pancreas
    "PANCREAS": "PANCREAS",
    # Stomach (for adaptive trees, not OM thresholds)
    "STOMACH": "STOMACH",
}


# Provenance → legacy threshold_source vocabulary. Kept for backward-compat
# with the `threshold_provisional = (source == "derived")` downstream check
# in the OM classifier and the `confidence.py` D-factor cascade.
_PROVENANCE_TO_LEGACY_SOURCE: dict[str, str] = {
    "regulatory": "regulatory",
    "best_practice": "calibrated",
    "industry_survey": "calibrated",
    "bv_derived": "calibrated",
    "extrapolated": "derived",
    "stopping_criterion_used_as_proxy": "derived",
    "catalog_rule": "calibrated",
}


def _legacy_source(provenance: str) -> str:
    return _PROVENANCE_TO_LEGACY_SOURCE.get(provenance, "calibrated")


def resolve_specimen_key(specimen: str | None) -> str | None:
    """Map a SEND specimen name to its FCT endpoint key (OM domain), or None."""
    if not specimen:
        return None
    return _SPECIMEN_TO_CONFIG_KEY.get(specimen.strip().upper())


# Re-export for callers that historically reached into this module.
_resolve_species_category = resolve_species_category


def get_organ_fct_bands(specimen: str, species: str | None = None) -> FctBands | None:
    """Return the raw FCT bands for an OM specimen — Phase B consumers that
    need the full uncertainty-first payload (coverage, provenance, entry_ref)
    should read this directly rather than `get_organ_threshold`.
    """
    config_key = resolve_specimen_key(specimen)
    if not config_key:
        return None
    fct = fct_registry.get_fct("OM", config_key, species=species, direction="both")
    if fct.entry_ref is None:
        return None
    return fct


def get_organ_threshold(specimen: str, species: str | None = None) -> dict | None:
    """Return resolved organ threshold config, or None if organ not in config.

    Backward-compatible return shape: keys `variation_ceiling_pct`,
    `adverse_floor_pct`, `strong_adverse_pct`, `config_key`,
    `threshold_source` ∈ {regulatory, calibrated, derived},
    `threshold_provisional`, plus optional `adaptive_requires`, `special_flags`,
    `cross_organ_link`, `nhp_tier`, `adaptive_ceiling_pct`.
    """
    config_key = resolve_specimen_key(specimen)
    if not config_key:
        return None

    fct = fct_registry.get_fct("OM", config_key, species=species, direction="both")
    if fct.entry_ref is None:
        # Entry not present in registry.
        return None

    raw = fct.raw_entry or {}
    legacy_source = _legacy_source(fct.provenance)

    result: dict = {
        "variation_ceiling_pct": fct.variation_ceiling,
        "adverse_floor_pct": fct.adverse_floor,
        "strong_adverse_pct": fct.strong_adverse_floor,
        "config_key": config_key,
        "threshold_source": legacy_source,
        "threshold_provisional": legacy_source == "derived",
    }

    # Pass through optional entry-level blocks unchanged.
    for key in ("adaptive_requires", "special_flags", "cross_organ_link", "nhp_tier"):
        if key in raw:
            result[key] = raw[key]

    # adaptive_ceiling_pct: resolve per-species (existing behavior).
    adaptive_ceiling = raw.get("adaptive_ceiling_pct")
    if isinstance(adaptive_ceiling, dict):
        category = resolve_species_category(species)
        resolved = adaptive_ceiling.get(category, adaptive_ceiling.get("other"))
        if resolved is not None:
            result["adaptive_ceiling_pct"] = float(resolved)
    elif adaptive_ceiling is not None:
        try:
            result["adaptive_ceiling_pct"] = float(adaptive_ceiling)
        except (TypeError, ValueError):
            pass

    return result


def get_default_om_threshold() -> float:
    """Return default adverse_floor_pct for organs not in config."""
    return _DEFAULT_ADVERSE_FLOOR


# ---------------------------------------------------------------------------
# OM-MI corroboration discount factors (lazy-loaded)
# ---------------------------------------------------------------------------

_OM_MI_JSON_PATH = SHARED_DIR / "om-mi-discount-factors.json"
_OM_MI_DATA: dict | None = None


def _load_om_mi_discounts() -> dict:
    global _OM_MI_DATA
    if _OM_MI_DATA is not None:
        return _OM_MI_DATA
    try:
        with open(_OM_MI_JSON_PATH) as f:
            _OM_MI_DATA = json.load(f)
    except Exception as e:
        log.warning("Failed to load om-mi-discount-factors from %s: %s", _OM_MI_JSON_PATH, e)
        _OM_MI_DATA = {}
    return _OM_MI_DATA


def get_om_mi_discount(organ_config_key: str, species: str | None) -> float:
    """Look up the OM-without-MI corroboration discount for an organ + species.

    Returns a multiplier (0.5-1.0). Falls back to 0.75 for unmapped organs.
    """
    data = _load_om_mi_discounts()
    species_cat = resolve_species_category(species)
    species_table = data.get(species_cat, data.get("rat", {}))
    if isinstance(species_table, dict) and "_meta" not in species_table:
        entry = species_table.get(organ_config_key)
    else:
        entry = None
    if entry and isinstance(entry, dict):
        return float(entry.get("discount", 0.75))
    default = data.get("default", {})
    return float(default.get("discount", 0.75) if isinstance(default, dict) else 0.75)


def get_species(study) -> str | None:
    """Get species from TS domain. Returns raw TSVAL string or None."""
    if "ts" not in study.xpt_files:
        return None
    try:
        from services.xpt_processor import read_xpt
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        species_rows = ts_df[ts_df["TSPARMCD"].str.upper() == "SPECIES"]
        if not species_rows.empty:
            return str(species_rows.iloc[0].get("TSVAL", "")).strip().upper() or None
    except Exception:
        pass
    return None
