"""SEND domain knowledge: biomarker mappings, organ systems, and biological thresholds.

Data loaded from shared/config/biomarker-catalog.json. This module provides
typed accessors; consumers should not read the JSON directly.
"""

import json
from pathlib import Path

_CATALOG_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "config" / "biomarker-catalog.json"
_CATALOG: dict | None = None


def _load_catalog() -> dict:
    global _CATALOG
    if _CATALOG is None:
        with open(_CATALOG_PATH) as f:
            _CATALOG = json.load(f)
    return _CATALOG

# ─── Domain effect-type registry (SLA-19, SLA-17) ─────────────────────────
# Declares the effect-size semantics for each SEND domain.
# Consumers must use typed accessors below instead of reading max_effect_size directly.

DOMAIN_EFFECT_TYPE: dict[str, str] = _load_catalog()["domain_effect_type"]

INCIDENCE_DOMAINS: frozenset[str] = frozenset(
    d for d, t in DOMAIN_EFFECT_TYPE.items() if t == "incidence"
)  # {"MA", "CL", "TF", "DS"} — binary/proportion data, no magnitude scalar

# Add a domain here if and only if it produces a continuous effect size scalar
# (Cohen's d, Hedges' g, or equivalent). Domains absent from this set are
# assumed to lack a magnitude scalar — signal weights, confidence thresholds,
# and NOAEL penalty scope all depend on this assumption. When in doubt, omit
# rather than include: the failure mode of a missing entry is "no effect size
# displayed," which is visible and correctable.
CONTINUOUS_DOMAINS: frozenset[str] = frozenset(
    d for d, t in DOMAIN_EFFECT_TYPE.items() if t == "effect_size"
)  # {"LB", "BW", "OM", "EG", "VS", "BG", "FW"}


def get_effect_size(finding: dict) -> float | None:
    """Returns effect size (Hedges' g by default) for continuous domains, None for all others.

    Falls back to data_type field when domain is not set (e.g. test fixtures).
    """
    domain = finding.get("domain")
    if domain is not None:
        if DOMAIN_EFFECT_TYPE.get(domain) == "effect_size":
            return finding.get("max_effect_size")
        return None
    # Fallback: use data_type field
    if finding.get("data_type", "continuous") == "continuous":
        return finding.get("max_effect_size")
    return None


def get_severity_grade(finding: dict) -> float | None:
    """Returns INHAND avg severity grade (1-5) for MI only, None for all others."""
    if finding.get("domain") == "MI":
        return finding.get("max_effect_size")
    return None


def effect_size_label(finding: dict) -> str:
    """Return the human-readable label for the effect-size metric of this finding."""
    domain = finding.get("domain", "")
    if domain == "MI":
        return "avg severity"
    etype = DOMAIN_EFFECT_TYPE.get(domain)
    if etype == "incidence":
        return "odds ratio"
    # Default effect size method is Hedges' g (small-sample-corrected Cohen's d).
    # When user switches to Cohen's d or Glass's delta via analysis settings,
    # the parameterized pipeline recomputes values; this label is for the
    # generation-time default only.
    return "Hedges' g"


def get_direction_of_concern(finding: dict) -> str | None:
    """Return the expected toxicological direction of concern for a finding.

    Uses BIOMARKER_MAP metadata keyed by test_code. Returns "up" or "down"
    for LB/EG/VS/BG endpoints with known concern direction, None otherwise.

    This encodes domain knowledge: e.g., RBC decrease is concerning (anemia),
    ALT increase is concerning (hepatotoxicity). The observed `direction` field
    on the finding may or may not align with the concern direction.
    """
    tc = finding.get("test_code", "")
    bio = BIOMARKER_MAP.get(tc)
    if bio:
        return bio.get("direction_of_concern")
    return None


# LBTESTCD → biomarker metadata (loaded from shared/config/biomarker-catalog.json)
BIOMARKER_MAP: dict[str, dict] = _load_catalog()["biomarkers"]

# ── Legacy inline data removed — now loaded from JSON ──
# The following entries were previously hardcoded here:
#   ALT, AST, ALP, GGT, TBIL, BILI, ALB, TP, PROT, GLOB, GLOBUL, ALBGLOB,
#   BUN, UREAN, CREAT, PHOS, RBC, HGB, HCT, WBC, PLT, PLAT, RETIC, RETI,
#   MCV, MCH, MCHC, RDW, NEUT, LYM, LYMPH, MONO, EOS, BASO, LGUNSCE,
#   PT, APTT, FIBRINO, GLUC, CHOL, TRIG, NA, SODIUM, K, CL, CA,
#   PH, SPGRAV, KETONES, VOLUME, CK, LDH, PRAG, QTCBAG, RRAG, HR,
#   T4, T4FREE, T3, TSH, CORTCST, ACTH, EPINEP, NOREPI, DOPA,
#   TESTO, ESTRA, FSH, LH, PROG, INHBB, NRBC
# All 70+ entries are now in shared/config/biomarker-catalog.json

# Specimen/organ name → organ system (loaded from JSON)
ORGAN_SYSTEM_MAP: dict[str, str] = _load_catalog()["organ_system_map"]

# Biological significance thresholds (loaded from JSON)
THRESHOLDS: dict[str, float | int] = _load_catalog()["biological_thresholds"]

# Per-domain Cohen's d thresholds (loaded from JSON)
DOMAIN_EFFECT_THRESHOLDS: dict[str, dict[str, float]] = _load_catalog()["domain_effect_thresholds"]
