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


# ─── Test code normalization (Phase 0b) ──────────────────────────────────
# Canonical test code registry loaded from shared/config/test-code-aliases.json.
# Provides O(1) alias → canonical resolution for cross-dataset matching.

_TEST_CODE_ALIASES_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "config" / "test-code-aliases.json"
_TEST_CODE_REVERSE_MAP: dict[str, str] | None = None


def _load_test_code_reverse_map() -> dict[str, str]:
    """Build reverse lookup: every alias (and canonical code) → canonical code."""
    global _TEST_CODE_REVERSE_MAP
    if _TEST_CODE_REVERSE_MAP is not None:
        return _TEST_CODE_REVERSE_MAP

    with open(_TEST_CODE_ALIASES_PATH) as f:
        data = json.load(f)

    reverse: dict[str, str] = {}
    for group in data["alias_groups"].values():
        canonical = group["canonical"].upper()
        # Map canonical to itself
        reverse[canonical] = canonical
        # Map each alias to the canonical
        for alias in group["aliases"]:
            reverse[alias.upper()] = canonical

    # Self-canonical codes map to themselves (no-op, but ensures completeness)
    for code in data.get("self_canonical", []):
        upper = code.upper()
        if upper not in reverse:
            reverse[upper] = upper

    _TEST_CODE_REVERSE_MAP = reverse
    return _TEST_CODE_REVERSE_MAP


def normalize_test_code(code: str) -> str:
    """Map any alias to its canonical test code.

    Returns input unchanged (uppercased) if not in the alias registry.
    Unknown codes are not errors — they may be study-specific or newly
    added to CDISC CT.

    Examples:
        normalize_test_code("UREAN") -> "BUN"
        normalize_test_code("ALT")   -> "ALT"
        normalize_test_code("XYZZY") -> "XYZZY"
    """
    upper = code.upper().strip()
    rmap = _load_test_code_reverse_map()
    return rmap.get(upper, upper)


def get_test_code_aliases(code: str) -> list[str]:
    """Return all known aliases for a test code (including the canonical form).

    Useful for HCD lookups where the database may use a different variant
    of the same analyte code than the study data.

    Example: get_test_code_aliases("CREAT") -> ["CREAT", "CREA"]
    """
    rmap = _load_test_code_reverse_map()
    upper = code.upper().strip()
    canonical = rmap.get(upper, upper)
    # Collect all codes that map to the same canonical
    group = [k for k, v in rmap.items() if v == canonical]
    if not group:
        return [upper]
    return group


# ─── Organ name normalization (Phase 0b) ─────────────────────────────────
# Organ alias hierarchy loaded from shared/config/organ-aliases.json.
# Maps SEND specimen/organ name variants to canonical organ group names.

_ORGAN_ALIASES_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "config" / "organ-aliases.json"
_ORGAN_REVERSE_MAP: dict[str, str] | None = None


def _load_organ_reverse_map() -> dict[str, str]:
    """Build reverse lookup: every alias → canonical organ name."""
    global _ORGAN_REVERSE_MAP
    if _ORGAN_REVERSE_MAP is not None:
        return _ORGAN_REVERSE_MAP

    with open(_ORGAN_ALIASES_PATH) as f:
        data = json.load(f)

    reverse: dict[str, str] = {}
    for canonical, aliases in data["organ_groups"].items():
        canonical_upper = canonical.upper()
        # Map canonical to itself
        reverse[canonical_upper] = canonical_upper
        # Map each alias to the canonical
        for alias in aliases:
            reverse[alias.upper()] = canonical_upper

    _ORGAN_REVERSE_MAP = reverse
    return _ORGAN_REVERSE_MAP


def normalize_organ(organ: str) -> str:
    """Map any organ alias to its canonical organ name.

    Uses a two-tier strategy:
    1. Exact match against the alias registry (O(1) lookup).
    2. Prefix match for hierarchical organs — e.g. any string starting with
       "LYMPH NODE" resolves to "LYMPH NODE" even if the specific subtype
       is not in the registry.

    Returns input unchanged (uppercased) if not matched.

    Examples:
        normalize_organ("ILIAC LYMPH NODE")       -> "LYMPH NODE"
          (not in registry as exact — but see get_organ_group for prefix)
        normalize_organ("LYMPH NODE, ILIAC")       -> "LYMPH NODE"
        normalize_organ("BONE MARROW, FEMUR")      -> "BONE MARROW"
        normalize_organ("LUNG/BRONCHUS")           -> "LUNG"
        normalize_organ("LIVER")                   -> "LIVER"
    """
    upper = organ.upper().strip()
    rmap = _load_organ_reverse_map()

    # Tier 1: exact match
    if upper in rmap:
        return rmap[upper]

    # Tier 2: prefix match against canonical group names
    # Sort by length descending so "SPINAL CORD" matches before "SPINAL" (if both existed)
    for canonical in sorted(rmap.values(), key=len, reverse=True):
        if upper.startswith(canonical + ",") or upper.startswith(canonical + " "):
            return canonical

    # Tier 3: slash-compound — check each part
    if "/" in upper:
        parts = [p.strip() for p in upper.split("/")]
        for part in parts:
            if part in rmap:
                return rmap[part]

    return upper


def get_organ_group(organ: str) -> str | None:
    """Get the parent organ group for a specific organ.

    Returns the canonical group name if the organ is a known alias or subtype,
    None if the organ is not in the registry at all.

    Unlike normalize_organ(), this returns None for unknown organs rather than
    passing them through. Use this when you need to know whether the organ
    belongs to a recognized group.

    Examples:
        get_organ_group("LYMPH NODE, ILIAC")  -> "LYMPH NODE"
        get_organ_group("BONE MARROW, FEMUR") -> "BONE MARROW"
        get_organ_group("LUNG/BRONCHUS")      -> "LUNG"
        get_organ_group("BONE MARROW")        -> "BONE MARROW"
        get_organ_group("LIVER")              -> None  (not in alias registry)
    """
    upper = organ.upper().strip()
    rmap = _load_organ_reverse_map()

    # Exact match
    if upper in rmap:
        return rmap[upper]

    # Prefix match
    for canonical in sorted(set(rmap.values()), key=len, reverse=True):
        if upper.startswith(canonical + ",") or upper.startswith(canonical + " "):
            return canonical

    # Slash-compound
    if "/" in upper:
        parts = [p.strip() for p in upper.split("/")]
        for part in parts:
            if part in rmap:
                return rmap[part]

    return None
