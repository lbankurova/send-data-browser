"""Organ-specific weight change thresholds — lazy-loaded from shared JSON.

Provides per-organ percentage thresholds for the two-gate OM classification:
- variation_ceiling_pct: below = trivially small (noise)
- adverse_floor_pct: at or above = biologically meaningful
- strong_adverse_pct: clearly adverse regardless of context

Species-specific values (e.g. adrenal) are resolved via _resolve_species_category().
"""

from __future__ import annotations

import json
import logging

from config import SHARED_DIR

log = logging.getLogger(__name__)

_JSON_PATH = SHARED_DIR / "organ-weight-thresholds.json"

# Lazy-loaded singleton
_DATA: dict | None = None

# Default fallback when organ not in config
_DEFAULT_ADVERSE_FLOOR = 15

# Map SEND specimen names → JSON config keys.
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
    # Stomach (for adaptive trees, not OM thresholds)
    "STOMACH": "STOMACH",
}


def _load() -> dict:
    global _DATA
    if _DATA is not None:
        return _DATA
    try:
        with open(_JSON_PATH) as f:
            _DATA = json.load(f)
    except Exception as e:
        log.warning("Failed to load organ-weight-thresholds from %s: %s", _JSON_PATH, e)
        _DATA = {}
    return _DATA


def _resolve_species_category(species: str | None) -> str:
    """Map species string to category key used in species-specific threshold dicts."""
    if not species:
        return "rat"  # conservative default
    s = species.strip().upper()
    if "RAT" in s:
        return "rat"
    if "MOUSE" in s or "MICE" in s:
        return "mouse"
    if "DOG" in s or "BEAGLE" in s or "MONGREL" in s or "CANINE" in s:
        return "dog"
    return "other"


def _resolve_value(val, species: str | None) -> float | None:
    """Resolve a threshold value that may be a plain number or species-specific dict."""
    if val is None:
        return None
    if isinstance(val, dict):
        cat = _resolve_species_category(species)
        resolved = val.get(cat, val.get("other"))
        return float(resolved) if resolved is not None else None
    return float(val)


def get_organ_threshold(specimen: str, species: str | None = None) -> dict | None:
    """Return resolved organ threshold config, or None if organ not in config.

    All numeric values are resolved (species-specific dicts → scalars).
    Returns dict with keys: variation_ceiling_pct, adverse_floor_pct, strong_adverse_pct,
    plus optional: adaptive_requires, special_flags, cross_organ_link.
    """
    data = _load()
    if not specimen:
        return None

    config_key = _SPECIMEN_TO_CONFIG_KEY.get(specimen.strip().upper())
    if not config_key:
        return None

    organ_cfg = data.get(config_key)
    if not organ_cfg:
        return None

    result = {
        "variation_ceiling_pct": _resolve_value(organ_cfg.get("variation_ceiling_pct"), species),
        "adverse_floor_pct": _resolve_value(organ_cfg.get("adverse_floor_pct"), species),
        "strong_adverse_pct": _resolve_value(organ_cfg.get("strong_adverse_pct"), species),
        "config_key": config_key,
    }

    # Pass through optional blocks unchanged
    if "adaptive_requires" in organ_cfg:
        result["adaptive_requires"] = organ_cfg["adaptive_requires"]
    if "special_flags" in organ_cfg:
        result["special_flags"] = organ_cfg["special_flags"]
    if "cross_organ_link" in organ_cfg:
        result["cross_organ_link"] = organ_cfg["cross_organ_link"]

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
    species_cat = _resolve_species_category(species)
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
