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
#
# Phase A (unrecognized term flagging): the full parsed data dict is the cached
# source of truth. Both _TEST_CODE_REVERSE_MAP and get_dictionary_versions()
# derive from _TEST_CODE_DATA, so a test that monkeypatches the reverse map
# cannot produce a stale version string.

_TEST_CODE_ALIASES_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "config" / "test-code-aliases.json"
_TEST_CODE_DATA: dict | None = None
_TEST_CODE_REVERSE_MAP: dict[str, str] | None = None
_TEST_CODE_SELF_CANONICAL: frozenset[str] | None = None
_TEST_CODE_GROUP_CANONICALS: frozenset[str] | None = None


def _load_test_code_data() -> dict:
    """Lazy-load and cache the full test-code-aliases.json data dict."""
    global _TEST_CODE_DATA
    if _TEST_CODE_DATA is not None:
        return _TEST_CODE_DATA
    with open(_TEST_CODE_ALIASES_PATH) as f:
        _TEST_CODE_DATA = json.load(f)
    return _TEST_CODE_DATA


def _load_test_code_reverse_map() -> dict[str, str]:
    """Build reverse lookup: every alias (and canonical code) → canonical code.

    Populates sibling caches for self_canonical and alias_group canonicals so
    assess_test_code_recognition() can distinguish level 1 (exact) from level 2
    (alias) in O(1).
    """
    global _TEST_CODE_REVERSE_MAP, _TEST_CODE_SELF_CANONICAL, _TEST_CODE_GROUP_CANONICALS
    if _TEST_CODE_REVERSE_MAP is not None:
        return _TEST_CODE_REVERSE_MAP

    data = _load_test_code_data()

    reverse: dict[str, str] = {}
    group_canonicals: set[str] = set()
    for group in data["alias_groups"].values():
        canonical = group["canonical"].upper()
        group_canonicals.add(canonical)
        # Map canonical to itself
        reverse[canonical] = canonical
        # Map each alias to the canonical
        for alias in group["aliases"]:
            reverse[alias.upper()] = canonical

    # Self-canonical codes map to themselves (no-op, but ensures completeness)
    self_canonical: set[str] = set()
    for code in data.get("self_canonical", []):
        upper = code.upper()
        self_canonical.add(upper)
        if upper not in reverse:
            reverse[upper] = upper

    _TEST_CODE_REVERSE_MAP = reverse
    _TEST_CODE_SELF_CANONICAL = frozenset(self_canonical)
    _TEST_CODE_GROUP_CANONICALS = frozenset(group_canonicals)
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
#
# Phase A cache structure mirrors test-code aliases: _ORGAN_DATA is the single
# source of truth; reverse-map and group-canonical caches derive from it.

_ORGAN_ALIASES_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "config" / "organ-aliases.json"
_ORGAN_DATA: dict | None = None
_ORGAN_REVERSE_MAP: dict[str, str] | None = None
_ORGAN_GROUP_CANONICALS: frozenset[str] | None = None


def _load_organ_data() -> dict:
    """Lazy-load and cache the full organ-aliases.json data dict."""
    global _ORGAN_DATA
    if _ORGAN_DATA is not None:
        return _ORGAN_DATA
    with open(_ORGAN_ALIASES_PATH) as f:
        _ORGAN_DATA = json.load(f)
    return _ORGAN_DATA


def _load_organ_reverse_map() -> dict[str, str]:
    """Build reverse lookup: every alias → canonical organ name.

    Populates the sibling cache of group canonicals so assess_organ_recognition()
    can distinguish level 1 (raw equals canonical) from level 2 (registered alias)
    in O(1).
    """
    global _ORGAN_REVERSE_MAP, _ORGAN_GROUP_CANONICALS
    if _ORGAN_REVERSE_MAP is not None:
        return _ORGAN_REVERSE_MAP

    data = _load_organ_data()

    reverse: dict[str, str] = {}
    group_canonicals: set[str] = set()
    for canonical, aliases in data["organ_groups"].items():
        canonical_upper = canonical.upper()
        group_canonicals.add(canonical_upper)
        # Map canonical to itself
        reverse[canonical_upper] = canonical_upper
        # Map each alias to the canonical
        for alias in aliases:
            reverse[alias.upper()] = canonical_upper

    _ORGAN_REVERSE_MAP = reverse
    _ORGAN_GROUP_CANONICALS = frozenset(group_canonicals)
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


# ─── Term recognition (Phase A — unrecognized-term-flagging) ────────────────
# Recognition helpers classify a raw term against the existing alias registries
# and return a (canonical_form, level, reason|tier) tuple. They wrap the
# existing normalize_* machinery WITHOUT changing those functions' signatures,
# so existing call sites keep working.
#
# Level taxonomy (Phase A emits 1/2/6 only; Phases B-D will add 3/4/5):
#   1 = exact   — raw equals a canonical registered in the dictionary
#   2 = alias   — raw matched a registered alias of a different canonical
#   6 = unrecognized — see the reason/tier field for which sub-case
#
# See docs/_internal/architecture/term-recognition.md for the full taxonomy
# and Phase B-E roadmap.

# Domains that HAVE a test-code synonym dictionary in Phase A. Domains outside
# this set are recorded as level 6 with reason "no_dictionary" until Phases B-D
# introduce MI/MA/CL/OM/TF/DS dictionaries.
_TEST_CODE_DICTIONARY_DOMAINS: frozenset[str] = frozenset({
    "LB", "BW", "FW", "EG", "VS", "BG",
})

# Human-readable caveat emitted into the per-study recognition report. Exposed
# as a module constant so tests can assert identity (not substring match) per
# R1 F12 — prevents the string and the test from drifting.
PHASE_A_RECOGNITION_CAVEAT = (
    "Recognition rate reflects dictionary completeness, not term validity. "
    "MI/MA/CL/OM/TF/DS findings are all level 6 in Phase A because no synonym "
    "dictionary exists yet (Phases B-D will add base-concept extraction and "
    "curated synonyms). A low recognition rate for these domains is expected "
    "and is not a data quality problem."
)


def assess_test_code_recognition(
    domain: str, raw_code: str
) -> tuple[str, int, str]:
    """Classify a test code's recognition tier against the alias registry.

    Returns (canonical_form, test_code_recognition_level, recognition_reason).

    Level / reason combinations:
        1, "exact"          -- raw.upper().strip() equals a canonical (either
                               self_canonical member or canonical of an
                               alias_group)
        2, "alias"          -- raw matched a registered alias of a different
                               canonical
        6, "no_dictionary"  -- domain has no synonym dictionary in Phase A
                               (MI/MA/CL/OM/TF/DS, or empty/unknown domain)
        6, "unmatched"      -- domain HAS a dictionary, raw was checked and did
                               not match
        6, "empty"          -- raw was empty/whitespace after strip

    Phase A level 1 definition (R1 F4): a code qualifies as level 1 iff
    `raw.upper().strip()` is either in self_canonical OR is the canonical of
    an alias_group. This means BUN -> ("BUN", 1, "exact") even though BUN is
    the canonical of BUN_GROUP and is not in self_canonical.

    Edge cases (R1 F5):
      - Empty / whitespace-only input -> ("", 6, "empty")
      - Whitespace is stripped, then upper-cased before classification
      - Empty domain falls to the no-dictionary branch -> (upper, 6, "no_dictionary")

    Contract (R1 F5 AC-11): this function does NOT accept None. Callers must
    gate. Empty string returns the level-6 "empty" tuple, never raises.
    """
    # Edge case: empty / whitespace input
    if not raw_code or not raw_code.strip():
        return ("", 6, "empty")

    upper = raw_code.upper().strip()

    # Domains without a Phase A dictionary: level 6 "no_dictionary"
    # (empty domain also falls here — matches AC-3c)
    if domain not in _TEST_CODE_DICTIONARY_DOMAINS:
        return (upper, 6, "no_dictionary")

    # Load caches (populates _TEST_CODE_SELF_CANONICAL and _TEST_CODE_GROUP_CANONICALS)
    rmap = _load_test_code_reverse_map()

    if upper in rmap:
        canonical = rmap[upper]
        # Level 1: raw IS a canonical (self_canonical or group canonical)
        if (
            (_TEST_CODE_SELF_CANONICAL is not None and upper in _TEST_CODE_SELF_CANONICAL)
            or (_TEST_CODE_GROUP_CANONICALS is not None and upper in _TEST_CODE_GROUP_CANONICALS)
        ):
            return (canonical, 1, "exact")
        # Level 2: raw is a registered alias mapping to a different canonical
        return (canonical, 2, "alias")

    # In dictionary domain but not in registry
    return (upper, 6, "unmatched")


def assess_organ_recognition(raw_specimen: str) -> tuple[str, int, str]:
    """Classify an organ specimen's recognition tier against the organ registry.

    Returns (canonical_organ, organ_recognition_level, organ_norm_tier).

    Level / tier combinations:
        1, "exact"          -- raw.upper().strip() equals a canonical group name
        2, "alias"          -- raw matched a registered alias (Tier 1 of
                               normalize_organ)
        6, "prefix"         -- matched via Tier 2 prefix heuristic (e.g.
                               "BONE MARROW EXTRACT" starts with "BONE MARROW ")
        6, "slash_compound" -- matched via Tier 3 slash-split heuristic
                               (e.g. "BRAIN/SPINAL CORD" -> "SPINAL CORD")
        6, "unmatched"      -- no match at any tier; raw passes through
                               unchanged (uppercased + stripped)
        6, "empty"          -- raw was empty/whitespace after strip

    Phase A demotes prefix/slash_compound to level 6 per research §6.4.1 scope
    confidence gate: organ-scoped synonym resolution (Phase C) is only safe at
    exact/alias confidence. Recording the tier label now keeps the audit trail
    honest and avoids a Phase C migration.

    IMPORTANT (R1 F1): Inputs that LOOK like slash-compound textually but are
    in fact registered exact aliases (e.g. "LUNG/BRONCHUS" is listed as an
    explicit alias of "LUNG" in organ-aliases.json) hit Tier 1 of the reverse
    map and resolve at level 2 ("alias"), not level 6.

    This function structurally mirrors normalize_organ()'s tier-detection
    (exact -> prefix -> slash_compound). The mirror is deliberate and
    necessary because normalize_organ() returns only the canonical string and
    discards the tier label. Do NOT "simplify" by collapsing into
    normalize_organ() — the tier label is the entire point of this wrapper,
    and Phase C's scope confidence gate depends on it.
    """
    # Edge case: empty / whitespace input
    if not raw_specimen or not raw_specimen.strip():
        return ("", 6, "empty")

    upper = raw_specimen.upper().strip()

    # Load caches (populates _ORGAN_GROUP_CANONICALS)
    rmap = _load_organ_reverse_map()

    # Tier 1: exact membership in the reverse map
    if upper in rmap:
        canonical = rmap[upper]
        # Level 1 if raw IS a group canonical; level 2 if raw is a registered alias
        if _ORGAN_GROUP_CANONICALS is not None and upper in _ORGAN_GROUP_CANONICALS:
            return (canonical, 1, "exact")
        return (canonical, 2, "alias")

    # Tier 2: prefix match against canonical group names
    # Sort by length descending so "SPINAL CORD" matches before "SPINAL" (if both existed)
    for canonical in sorted(set(rmap.values()), key=len, reverse=True):
        if upper.startswith(canonical + ",") or upper.startswith(canonical + " "):
            return (canonical, 6, "prefix")

    # Tier 3: slash-compound — check each part
    if "/" in upper:
        parts = [p.strip() for p in upper.split("/")]
        for part in parts:
            if part in rmap:
                return (rmap[part], 6, "slash_compound")

    # No match at any tier
    return (upper, 6, "unmatched")


def get_dictionary_versions() -> dict[str, str]:
    """Return current loaded dictionary versions for stale-detection.

    Both versions are derived from the cached full-data dicts. Tests that
    monkeypatch the reverse maps cannot produce a stale version because this
    function consults _load_*_data() directly.
    """
    return {
        "test_code_aliases": _load_test_code_data().get("version", "unknown"),
        "organ_aliases": _load_organ_data().get("version", "unknown"),
    }


def _reset_dictionary_caches_for_tests() -> None:
    """Test helper: clear ALL cached dictionary state.

    Call this in fixture teardown when a test monkeypatches any of the caches
    or depends on the live version string from disk.
    """
    global _TEST_CODE_DATA, _TEST_CODE_REVERSE_MAP, _TEST_CODE_SELF_CANONICAL
    global _TEST_CODE_GROUP_CANONICALS, _ORGAN_DATA, _ORGAN_REVERSE_MAP
    global _ORGAN_GROUP_CANONICALS
    _TEST_CODE_DATA = None
    _TEST_CODE_REVERSE_MAP = None
    _TEST_CODE_SELF_CANONICAL = None
    _TEST_CODE_GROUP_CANONICALS = None
    _ORGAN_DATA = None
    _ORGAN_REVERSE_MAP = None
    _ORGAN_GROUP_CANONICALS = None


# ─── Recognition report builder ─────────────────────────────────────────────
# Pure aggregator: called at the end of generation with the in-memory unified
# findings list. Produces the per-study unrecognized_terms.json payload.

_RECOGNITION_REPORT_CAP = 1000  # R1 F13 — bumped from 200 for histopath-heavy studies


def _recognition_rate(numerator: int, denominator: int) -> float | None:
    """Rate with explicit divide-by-zero handling (R1 F8, R2 N3).

    Returns None (NOT 0.0) when denominator is zero — a 0.0 rate falsely
    implies "checked everything and nothing recognized" when the truth is
    "nothing was in scope." Consumers must handle None explicitly.
    """
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def build_unrecognized_terms_report(
    findings: list[dict],
    study_id: str,
    dict_versions: dict[str, str],
) -> dict:
    """Aggregate enriched findings into the per-study recognition report.

    Pure function — no I/O. Input: the enriched findings list already produced
    by the pipeline (each finding carries test_code_recognition_level,
    test_code_recognition_reason, organ_recognition_level, organ_norm_tier).

    Schema contract: see docs/_internal/incoming/unrecognized-term-flagging-synthesis.md
    Feature 3. All level keys are strings ("1", "2", "6"); levels_present lists
    the sparse set of present keys so Phase B/C consumers can extend without
    assuming exhaustiveness.
    """
    from datetime import datetime, timezone

    total_findings = len(findings)

    # Counters
    by_tc_level: dict[str, int] = {}
    by_tc_reason: dict[str, int] = {}
    by_org_level: dict[str, int] = {}
    findings_with_tc = 0
    findings_with_specimen = 0
    tc_recognized = 0
    org_recognized = 0

    # Per-domain aggregation
    per_domain: dict[str, dict] = {}

    # Per-term aggregation for unrecognized output arrays
    unrec_tc: dict[tuple[str, str, str], dict] = {}  # (domain, raw_code, reason) -> entry
    unrec_org: dict[tuple[str, str], dict] = {}  # (raw_specimen, norm_tier) -> entry

    for f in findings:
        domain = f.get("domain", "")
        tc_level = f.get("test_code_recognition_level")
        tc_reason = f.get("test_code_recognition_reason")
        org_level = f.get("organ_recognition_level")
        org_tier = f.get("organ_norm_tier")
        raw_tc = f.get("test_code", "")
        specimen = f.get("specimen", "")

        # Domain bucket
        if domain not in per_domain:
            per_domain[domain] = {
                "total": 0,
                "by_test_code_level": {},
                "with_test_code": 0,
                "tc_recognized": 0,
            }
        dom_bucket = per_domain[domain]
        dom_bucket["total"] += 1

        # Test-code summary
        if tc_level is not None:
            findings_with_tc += 1
            dom_bucket["with_test_code"] += 1
            key = str(tc_level)
            by_tc_level[key] = by_tc_level.get(key, 0) + 1
            dom_bucket["by_test_code_level"][key] = dom_bucket["by_test_code_level"].get(key, 0) + 1
            if tc_level in (1, 2):
                tc_recognized += 1
                dom_bucket["tc_recognized"] += 1
        if tc_reason is not None:
            by_tc_reason[tc_reason] = by_tc_reason.get(tc_reason, 0) + 1

        # Organ summary
        if org_level is not None:
            findings_with_specimen += 1
            key = str(org_level)
            by_org_level[key] = by_org_level.get(key, 0) + 1
            if org_level in (1, 2):
                org_recognized += 1

        # Collect unrecognized test codes (level 6 only)
        if tc_level == 6 and raw_tc:
            tc_key = (domain, raw_tc.upper().strip(), tc_reason or "unmatched")
            if tc_key not in unrec_tc:
                unrec_tc[tc_key] = {
                    "domain": domain,
                    "raw_code": raw_tc.upper().strip(),
                    "count": 0,
                    "reason": tc_reason or "unmatched",
                    "specimens": set(),
                }
            unrec_tc[tc_key]["count"] += 1
            if specimen:
                unrec_tc[tc_key]["specimens"].add(specimen.upper().strip())

        # Collect unrecognized organs (level 6 only)
        if org_level == 6 and specimen:
            org_key = (specimen.upper().strip(), org_tier or "unmatched")
            if org_key not in unrec_org:
                unrec_org[org_key] = {
                    "raw_specimen": specimen.upper().strip(),
                    "count": 0,
                    "norm_tier": org_tier or "unmatched",
                }
            unrec_org[org_key]["count"] += 1

    # Finalize unrecognized test-code array: specimens set -> sorted list, sort desc, truncate
    unrec_tc_list = [
        {
            "domain": e["domain"],
            "raw_code": e["raw_code"],
            "count": e["count"],
            "reason": e["reason"],
            "specimens": sorted(e["specimens"]),
        }
        for e in unrec_tc.values()
    ]
    unrec_tc_list.sort(key=lambda x: x["count"], reverse=True)
    tc_total = len(unrec_tc_list)
    tc_truncated: dict | None = None
    if tc_total > _RECOGNITION_REPORT_CAP:
        tc_truncated = {"shown": _RECOGNITION_REPORT_CAP, "total": tc_total}
        unrec_tc_list = unrec_tc_list[:_RECOGNITION_REPORT_CAP]

    # Finalize unrecognized organ array
    unrec_org_list = list(unrec_org.values())
    unrec_org_list.sort(key=lambda x: x["count"], reverse=True)
    org_total = len(unrec_org_list)
    org_truncated: dict | None = None
    if org_total > _RECOGNITION_REPORT_CAP:
        org_truncated = {"shown": _RECOGNITION_REPORT_CAP, "total": org_total}
        unrec_org_list = unrec_org_list[:_RECOGNITION_REPORT_CAP]

    # Finalize per-domain summary (rate uses with_test_code denominator)
    per_domain_out: dict[str, dict] = {}
    for domain, bucket in sorted(per_domain.items()):
        rate = _recognition_rate(bucket["tc_recognized"], bucket["with_test_code"])
        note: str | None = None
        if domain in ("MI", "MA", "CL", "OM", "TF", "DS"):
            note = f"Phase A: no {domain} synonym dictionary yet -- 100% level 6 is expected"
        per_domain_out[domain] = {
            "total": bucket["total"],
            "by_test_code_level": bucket["by_test_code_level"],
            "rate": rate,
            "note": note,
        }

    levels_present = sorted(by_tc_level.keys())

    summary = {
        "total_findings": total_findings,
        "findings_with_test_code": findings_with_tc,
        "findings_with_specimen": findings_with_specimen,
        "by_test_code_level": by_tc_level,
        "by_test_code_reason": by_tc_reason,
        "by_organ_level": by_org_level,
        "levels_present": levels_present,
        "recognition_rate_test_code": _recognition_rate(tc_recognized, findings_with_tc),
        "recognition_rate_organ": _recognition_rate(org_recognized, findings_with_specimen),
        "recognition_rate_test_code_denominator": "findings_with_test_code (excludes null)",
        "recognition_rate_organ_denominator": "findings_with_specimen (excludes null)",
    }

    return {
        "study_id": study_id,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "schema_version": "1.0.0",
        "dictionary_versions_source": "study_metadata_enriched.json",
        "dictionary_versions_snapshot": dict(dict_versions),
        "phase_a_caveat": PHASE_A_RECOGNITION_CAVEAT,
        "summary": summary,
        "by_domain": per_domain_out,
        "unrecognized_test_codes": unrec_tc_list,
        "unrecognized_test_codes_truncated": tc_truncated,
        "unrecognized_organs": unrec_org_list,
        "unrecognized_organs_truncated": org_truncated,
    }
