"""Field-Consensus Threshold (FCT) registry — species/endpoint-calibrated severity bands.

Loads `shared/rules/field-consensus-thresholds.json` at startup as a singleton.
Exposes per-(domain, endpoint, species, direction, sex) band resolution for
severity classification, confidence scoring, and rule emission.

Phase A scope: OM content migrated in-place from the superseded
`shared/organ-weight-thresholds.json`. LB / BW / classify_severity call-site
rewiring is Phase B (gated on scientist sign-off per SF-1..4). The loader
is deliberately built with the full schema surface so Phase B can drop in
without a second migration.

Integrity contract (AC-F2-1):
- Every `entries.*` row must have `provenance` in the allowed enum.
- Every `joint_rules.*` entry must have `provenance` + a `syndrome_rule_ref`
  that resolves against the live syndrome-engine rule IDs.
- Bidirectional: every syndrome rule tagged `fct_applicable: true` must map
  to a `joint_rules` entry.
- Violations raise `FctRegistryIntegrityError` at startup; pipeline halts.

Uncertainty-first payload convention (through-line):
- `coverage`, `fallback_used`, and `provenance` are schema-enforced on the
  output of `get_fct()`. Downstream finding payloads carry these fields
  verbatim so consumers never reason about implicit defaults.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from config import SHARED_DIR

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canonical vocabularies
# ---------------------------------------------------------------------------

ALLOWED_PROVENANCE = frozenset({
    "regulatory",
    "best_practice",
    "industry_survey",
    "bv_derived",
    "extrapolated",
    "stopping_criterion_used_as_proxy",
    "catalog_rule",
})

# Most- to least-authoritative. Lower rank = stronger provenance.
_PROVENANCE_RANK: dict[str, int] = {
    "regulatory": 0,
    "best_practice": 1,
    "industry_survey": 2,
    "bv_derived": 3,
    "extrapolated": 4,
    "stopping_criterion_used_as_proxy": 5,
    "catalog_rule": 6,
}

ALLOWED_COVERAGE = frozenset({
    "full",
    "partial",
    "none",
    "catalog_driven",
    "n-sufficient",
    "n-marginal",
    "n-insufficient",
})

ALLOWED_UNITS = frozenset({"pct_change", "fold", "absolute", "sd"})

ALLOWED_RELIABILITY = frozenset({"high", "moderate", "low", "speculative"})

ALLOWED_DIRECTIONS = frozenset({"up", "down", "both"})


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class FctRegistryIntegrityError(RuntimeError):
    """Raised when the FCT registry fails load-time integrity validation.

    This is a domain-specific halt — pipeline must not continue with a
    silently-malformed severity classifier.
    """


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FctBands:
    """Resolved per-(domain, endpoint, species, direction, sex) band set.

    Fields carry the uncertainty-first payload convention forward — consumers
    write these values directly into finding payloads without re-deriving.
    """
    variation_ceiling: float | None
    concern_floor: float | None
    adverse_floor: float | None
    strong_adverse_floor: float | None
    units: str
    any_significant: bool
    coverage: str
    provenance: str
    fallback_used: bool
    entry_ref: str | None
    threshold_reliability: str | None
    nhp_tier: str | None
    special_flags: tuple[str, ...]
    cross_organ_link: str | None
    notes: str | None
    raw_entry: dict[str, Any] = field(default_factory=dict, repr=False)

    def to_payload(self) -> dict[str, Any]:
        """Serialize as a finding-payload sub-object."""
        return {
            "variation_ceiling": self.variation_ceiling,
            "concern_floor": self.concern_floor,
            "adverse_floor": self.adverse_floor,
            "strong_adverse_floor": self.strong_adverse_floor,
            "units": self.units,
            "any_significant": self.any_significant,
            "coverage": self.coverage,
            "provenance": self.provenance,
            "fallback_used": self.fallback_used,
            "entry_ref": self.entry_ref,
            "threshold_reliability": self.threshold_reliability,
        }


# ---------------------------------------------------------------------------
# Species resolution
# ---------------------------------------------------------------------------

# Preserves the pre-migration organ_thresholds._resolve_species_category
# behavior byte-for-byte (AC-F2-2 parity gate). Extension to rabbit/minipig/
# guineapig lives behind a future cycle that populates their FCT bands;
# adding them prematurely would redirect existing OM-MI discount lookups.
_SPECIES_ALIAS_ORDER: tuple[tuple[tuple[str, ...], str], ...] = (
    (("RAT",), "rat"),
    (("MOUSE", "MICE"), "mouse"),
    (("DOG", "BEAGLE", "MONGREL", "CANINE"), "dog"),
    (("MONKEY", "MACAQUE", "CYNOMOLGUS", "NHP"), "nhp"),
)


def resolve_species_category(species: str | None) -> str:
    """Map a species string to the FCT registry's species-key vocabulary.

    Byte-parity with the pre-migration ``organ_thresholds._resolve_species_category``:

    * ``None`` -> ``"rat"`` (conservative default; rat bands are the most-tested).
    * Non-``None`` string matching no alias -> ``"other"``. The FCT "other" band
      carries rodent-equivalent defaults. ``fallback_used`` is NOT set in this
      branch because the pre-migration code also returned values without any
      fallback signal for unknown species.
    * Known aliases resolve to their species category (rat / mouse / dog / nhp).

    Downstream paths that need a "truly unknown species" signal rely on the
    ``fallback_used`` flag emitted when ``_resolve_band`` substitutes the
    ``other`` / ``any`` band for a species whose explicit band is missing.
    """
    if not species:
        return "rat"
    s = species.strip().upper()
    for aliases, category in _SPECIES_ALIAS_ORDER:
        for alias in aliases:
            if alias in s:
                return category
    return "other"


# ---------------------------------------------------------------------------
# Module state
# ---------------------------------------------------------------------------

_REGISTRY_PATH = SHARED_DIR / "rules" / "field-consensus-thresholds.json"
_DATA: dict[str, Any] | None = None
_DATA_LOCK = threading.Lock()
_INVALIDATION_HOOKS: list[Callable[[str], None]] = []


def _registry_path() -> Path:
    return _REGISTRY_PATH


def _load_raw() -> dict[str, Any]:
    path = _registry_path()
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as e:
        raise FctRegistryIntegrityError(
            f"FCT registry missing at {path}"
        ) from e
    except json.JSONDecodeError as e:
        raise FctRegistryIntegrityError(
            f"FCT registry is malformed JSON: {e}"
        ) from e


# ---------------------------------------------------------------------------
# Integrity validation (load-time)
# ---------------------------------------------------------------------------


def _validate_entry(entry_key: str, entry: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if not isinstance(entry, dict):
        return [f"entries[{entry_key!r}]: expected object, got {type(entry).__name__}"]

    # species_specific is required; bands is required
    if "species_specific" not in entry:
        errors.append(f"entries[{entry_key!r}]: missing 'species_specific'")
    elif not isinstance(entry["species_specific"], bool):
        errors.append(f"entries[{entry_key!r}]: 'species_specific' must be boolean")

    if "bands" not in entry:
        errors.append(f"entries[{entry_key!r}]: missing 'bands'")
        return errors  # cannot validate further without bands

    bands = entry["bands"]
    if not isinstance(bands, dict) or not bands:
        errors.append(f"entries[{entry_key!r}]: 'bands' must be a non-empty object")

    # coverage + provenance required
    coverage = entry.get("coverage")
    if coverage not in ALLOWED_COVERAGE:
        errors.append(
            f"entries[{entry_key!r}]: coverage={coverage!r} not in {sorted(ALLOWED_COVERAGE)}"
        )
    provenance = entry.get("provenance")
    if provenance not in ALLOWED_PROVENANCE:
        errors.append(
            f"entries[{entry_key!r}]: provenance={provenance!r} not in {sorted(ALLOWED_PROVENANCE)}"
        )

    # threshold_reliability is optional; validate when present
    reliability = entry.get("threshold_reliability")
    if reliability is not None and reliability not in ALLOWED_RELIABILITY:
        errors.append(
            f"entries[{entry_key!r}]: threshold_reliability={reliability!r} not in {sorted(ALLOWED_RELIABILITY)}"
        )

    # Per-band validation
    if isinstance(bands, dict):
        for species_key, band in bands.items():
            if not isinstance(band, dict):
                errors.append(
                    f"entries[{entry_key!r}].bands[{species_key!r}]: expected object"
                )
                continue
            units = band.get("units")
            if units not in ALLOWED_UNITS:
                errors.append(
                    f"entries[{entry_key!r}].bands[{species_key!r}]: units={units!r} not in {sorted(ALLOWED_UNITS)}"
                )
            band_provenance = band.get("provenance")
            if band_provenance is not None and band_provenance not in ALLOWED_PROVENANCE:
                errors.append(
                    f"entries[{entry_key!r}].bands[{species_key!r}]: provenance={band_provenance!r} not in allowed set"
                )

    # Key shape: DOMAIN.ENDPOINT.DIRECTION
    parts = entry_key.split(".")
    if len(parts) != 3:
        errors.append(f"entries[{entry_key!r}]: key must be '<DOMAIN>.<ENDPOINT>.<DIRECTION>'")
    else:
        direction = parts[2]
        if direction not in ALLOWED_DIRECTIONS:
            errors.append(f"entries[{entry_key!r}]: direction {direction!r} not in {sorted(ALLOWED_DIRECTIONS)}")

    return errors


def _validate_joint_rule(
    rule_key: str,
    rule: dict[str, Any],
    syndrome_rule_ids: frozenset[str],
) -> list[str]:
    errors: list[str] = []
    if not isinstance(rule, dict):
        return [f"joint_rules[{rule_key!r}]: expected object"]

    provenance = rule.get("provenance")
    if provenance not in ALLOWED_PROVENANCE:
        errors.append(
            f"joint_rules[{rule_key!r}]: provenance={provenance!r} not in allowed set"
        )

    ref = rule.get("syndrome_rule_ref")
    if not ref or not isinstance(ref, str):
        errors.append(f"joint_rules[{rule_key!r}]: missing or invalid 'syndrome_rule_ref'")
    elif ref not in syndrome_rule_ids:
        errors.append(
            f"joint_rules[{rule_key!r}]: syndrome_rule_ref={ref!r} does not resolve against syndrome-engine rule IDs"
        )

    conditions = rule.get("conditions")
    if not isinstance(conditions, list) or not conditions:
        errors.append(f"joint_rules[{rule_key!r}]: 'conditions' must be a non-empty list")

    combinator = rule.get("combinator")
    if combinator not in {"AND", "OR"}:
        errors.append(f"joint_rules[{rule_key!r}]: combinator={combinator!r} must be AND or OR")

    if not rule.get("verdict"):
        errors.append(f"joint_rules[{rule_key!r}]: missing 'verdict'")

    return errors


def _collect_syndrome_rule_ids() -> frozenset[str]:
    """Collect rule IDs from live syndrome-engine rule files.

    Sources: shared/rules/histopath-syndromes.json (histopath-specific),
    shared/rules/clinical-catalog-rules.json (catalog, C01-C15),
    shared/rules/lab-clinical-rules.json (LB concurrent-elevation rules
    including L03 Hy's Law). Missing files are tolerated (pipeline halts
    separately if the catalog itself is missing); unresolved joint_rule
    references fail at _validate_joint_rule.
    """
    ids: set[str] = set()
    rules_dir = SHARED_DIR / "rules"
    for fname in ("histopath-syndromes.json", "clinical-catalog-rules.json", "lab-clinical-rules.json"):
        path = rules_dir / fname
        if not path.exists():
            continue
        try:
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as e:  # noqa: BLE001 -- tolerate at collection time
            log.warning("FCT: failed to read %s for rule-ID collection: %s", fname, e)
            continue
        rules = payload.get("rules") if isinstance(payload, dict) else None
        if isinstance(rules, list):
            for r in rules:
                rid = r.get("id") if isinstance(r, dict) else None
                if isinstance(rid, str):
                    ids.add(rid)
    return frozenset(ids)


def _bidirectional_syndrome_check(
    joint_rules: dict[str, Any],
    syndrome_rule_ids: frozenset[str],
) -> list[str]:
    """Every syndrome rule tagged fct_applicable: true must appear in joint_rules.

    Cross-file drift guard (AC-F2-1 R1 F-R8). Skipped silently when the
    syndrome files are absent at collection time; applies only to loaded rules.
    """
    errors: list[str] = []
    joint_rule_refs = {
        r.get("syndrome_rule_ref")
        for r in joint_rules.values()
        if isinstance(r, dict)
    }
    rules_dir = SHARED_DIR / "rules"
    for fname in ("histopath-syndromes.json", "clinical-catalog-rules.json", "lab-clinical-rules.json"):
        path = rules_dir / fname
        if not path.exists():
            continue
        try:
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)
        except Exception:  # noqa: BLE001
            continue
        rules = payload.get("rules") if isinstance(payload, dict) else None
        if not isinstance(rules, list):
            continue
        for r in rules:
            if not isinstance(r, dict):
                continue
            if r.get("fct_applicable") is True:
                rid = r.get("id")
                if rid and rid not in joint_rule_refs:
                    errors.append(
                        f"syndrome rule {rid!r} in {fname} is tagged fct_applicable: true but no joint_rules entry references it"
                    )
    _ = syndrome_rule_ids  # reserved for future checks
    return errors


def _validate_schema_enum_parity() -> list[str]:
    """AC-F2-4: guard against schema <-> validator enum drift at startup.

    Reads `shared/schemas/field-consensus-thresholds.schema.json` and asserts
    the enum values declared in `$defs/coverage`, `$defs/provenance`,
    `$defs/units`, `$defs/threshold_reliability` match the ALLOWED_*
    frozensets exactly. Prevents schema and inline validator from diverging.
    Schema-file absence is tolerated (emits one warning-level error so the
    user sees it, without blocking startup).
    """
    schema_path = SHARED_DIR / "schemas" / "field-consensus-thresholds.schema.json"
    if not schema_path.exists():
        return [
            f"schema drift check skipped: {schema_path} not found. "
            "Expected at shared/schemas/field-consensus-thresholds.schema.json."
        ]

    try:
        with open(schema_path, encoding="utf-8") as f:
            schema = json.load(f)
    except Exception as e:  # noqa: BLE001
        return [f"schema drift check: cannot read {schema_path}: {e}"]

    defs = schema.get("$defs") or {}

    def _enum_of(key: str) -> set[str]:
        return set((defs.get(key) or {}).get("enum") or [])

    errors: list[str] = []
    for key, allowed in (
        ("coverage", ALLOWED_COVERAGE),
        ("provenance", ALLOWED_PROVENANCE),
        ("units", ALLOWED_UNITS),
        ("threshold_reliability", ALLOWED_RELIABILITY),
    ):
        schema_enum = _enum_of(key)
        expected = set(allowed)
        if schema_enum != expected:
            missing_in_schema = expected - schema_enum
            extra_in_schema = schema_enum - expected
            parts = []
            if missing_in_schema:
                parts.append(f"schema missing {sorted(missing_in_schema)}")
            if extra_in_schema:
                parts.append(f"schema has extras {sorted(extra_in_schema)}")
            errors.append(
                f"schema $defs/{key} vs ALLOWED_{key.upper()}: " + ", ".join(parts)
            )
    return errors


def _validate_registry(data: dict[str, Any]) -> None:
    errors: list[str] = []

    if not isinstance(data, dict):
        raise FctRegistryIntegrityError("FCT registry root must be an object")

    if "_schema_version" not in data:
        errors.append("registry: missing '_schema_version'")

    entries = data.get("entries")
    if not isinstance(entries, dict):
        errors.append("registry: 'entries' must be an object")
        entries = {}

    for key, entry in entries.items():
        errors.extend(_validate_entry(key, entry))

    joint_rules = data.get("joint_rules", {})
    if joint_rules is None:
        joint_rules = {}
    if not isinstance(joint_rules, dict):
        errors.append("registry: 'joint_rules' must be an object")
        joint_rules = {}

    syndrome_rule_ids = _collect_syndrome_rule_ids() if joint_rules else frozenset()

    for rk, rule in joint_rules.items():
        errors.extend(_validate_joint_rule(rk, rule, syndrome_rule_ids))

    errors.extend(_bidirectional_syndrome_check(joint_rules, syndrome_rule_ids))

    # Schema <-> validator enum parity (AC-F2-4). Runs at startup alongside
    # the data integrity checks; drift fails the load.
    errors.extend(_validate_schema_enum_parity())

    if errors:
        msg_head = f"FCT registry failed load-time integrity check ({len(errors)} issue(s)):"
        full = msg_head + "\n  - " + "\n  - ".join(errors)
        raise FctRegistryIntegrityError(full)


# ---------------------------------------------------------------------------
# Public load / invalidation API
# ---------------------------------------------------------------------------


def load() -> dict[str, Any]:
    """Load (or return cached) registry. Validates on first load."""
    global _DATA
    with _DATA_LOCK:
        if _DATA is not None:
            return _DATA
        raw = _load_raw()
        _validate_registry(raw)
        _DATA = raw
        return _DATA


def invalidate(study_id: str | None = None) -> None:
    """Invalidate the cached registry + fire X7 override-cascade hooks.

    Any consumer holding FCT-derived severity / confidence / NOAEL caches must
    register via `register_invalidation_hook` so cache invalidation cascades
    through the X7 chain (GAP-SMT-06). Study-scoped invalidation passes
    `study_id`; global invalidation passes None.
    """
    global _DATA
    with _DATA_LOCK:
        _DATA = None
    hooks = list(_INVALIDATION_HOOKS)
    for hook in hooks:
        try:
            hook(study_id or "")
        except Exception as e:  # noqa: BLE001 - hook failures must not crash invalidation
            log.warning("FCT invalidation hook %r raised: %s", hook, e)


def register_invalidation_hook(hook: Callable[[str], None]) -> None:
    """Register a callback invoked on `invalidate()`. Idempotent."""
    if hook not in _INVALIDATION_HOOKS:
        _INVALIDATION_HOOKS.append(hook)


def content_fingerprint() -> str:
    """Stable content hash for the loaded registry — used by settings-hash
    composition (X7 override cascade, AC-F7-5) to force cache invalidation
    when registry content changes.
    """
    import hashlib
    data = load()
    # Canonical JSON with sorted keys gives a byte-stable fingerprint even
    # when upstream tools re-format the file with different key ordering.
    payload = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


# ---------------------------------------------------------------------------
# Resolution API
# ---------------------------------------------------------------------------


def _resolve_band(
    entry: dict[str, Any],
    species_key: str,
) -> tuple[dict[str, Any] | None, bool]:
    """Return (band_dict, fallback_used). fallback_used=True when the species
    key was not found and we fell back to 'other'. When the entry is
    flat (species_specific=false), the 'any' band is the authoritative
    value — fallback_used is False.
    """
    bands = entry.get("bands", {})
    if not isinstance(bands, dict):
        return None, False

    if species_key in bands:
        return bands[species_key], False

    if entry.get("species_specific") is False and "any" in bands:
        return bands["any"], False

    for fallback in ("other", "any"):
        if fallback in bands:
            return bands[fallback], True

    return None, False


def _band_is_populated(band: dict[str, Any] | None) -> bool:
    if not band:
        return False
    # Populated if any of the numeric threshold fields is non-null.
    for key in ("variation_ceiling", "concern_floor", "adverse_floor", "strong_adverse_floor"):
        if band.get(key) is not None:
            return True
    return False


def get_fct(
    domain: str,
    endpoint: str,
    species: str | None = None,
    direction: str = "both",
    sex: str | None = None,  # noqa: ARG001 -- reserved for Phase B sex-specific bands
) -> FctBands:
    """Resolve the FCT band set for a (domain, endpoint, species, direction, sex) key.

    Lookup order (tuple-widening per etransafe-send-snomed pattern):
      1. "<DOMAIN>.<ENDPOINT>.<direction>"
      2. "<DOMAIN>.<ENDPOINT>.both"  (fall back to direction-agnostic entry)

    When no entry matches, returns an `FctBands` with coverage="none",
    fallback_used=True, provenance="extrapolated", entry_ref=None — triggers
    the `provisional` verdict downstream per M5 honest-uncertainty framing.
    """
    data = load()
    entries = data.get("entries", {})
    species_key = resolve_species_category(species)

    lookups = [
        f"{domain}.{endpoint}.{direction}",
    ]
    if direction != "both":
        lookups.append(f"{domain}.{endpoint}.both")

    entry: dict[str, Any] | None = None
    entry_ref: str | None = None
    for key in lookups:
        candidate = entries.get(key)
        if candidate is not None:
            entry = candidate
            entry_ref = key
            break

    if entry is None:
        return FctBands(
            variation_ceiling=None,
            concern_floor=None,
            adverse_floor=None,
            strong_adverse_floor=None,
            units="pct_change",
            any_significant=False,
            coverage="none",
            provenance="extrapolated",
            fallback_used=True,
            entry_ref=None,
            threshold_reliability=None,
            nhp_tier=None,
            special_flags=(),
            cross_organ_link=None,
            notes=None,
            raw_entry={},
        )

    band, band_fallback_used = _resolve_band(entry, species_key)
    populated = _band_is_populated(band)

    entry_coverage = entry.get("coverage", "partial")
    entry_provenance = entry.get("provenance", "extrapolated")

    if band is None or not populated:
        # The entry exists but has no numeric bands for this species — the
        # classifier should emit a `provisional` verdict (M5 honest uncertainty).
        return FctBands(
            variation_ceiling=None,
            concern_floor=None,
            adverse_floor=None,
            strong_adverse_floor=None,
            units=(band or {}).get("units", "pct_change"),
            any_significant=bool((band or {}).get("any_significant", False)),
            coverage="none",
            provenance=((band or {}).get("provenance") or entry_provenance),
            fallback_used=True,
            entry_ref=entry_ref,
            threshold_reliability=entry.get("threshold_reliability"),
            nhp_tier=entry.get("nhp_tier"),
            special_flags=tuple(entry.get("special_flags") or ()),
            cross_organ_link=entry.get("cross_organ_link"),
            notes=entry.get("notes"),
            raw_entry=entry,
        )

    band_provenance = band.get("provenance") or entry_provenance

    # Coverage reported on the finding tracks *this species*: if the species
    # band is populated we report 'full' locally even when entry_coverage is
    # 'partial' (partial means some species lack bands).
    resolved_coverage = "full" if not band_fallback_used else entry_coverage
    # Fallback used when we substituted 'other'/'any' for a species without
    # an explicit band.
    fallback_used = band_fallback_used

    return FctBands(
        variation_ceiling=_as_float(band.get("variation_ceiling")),
        concern_floor=_as_float(band.get("concern_floor")),
        adverse_floor=_as_float(band.get("adverse_floor")),
        strong_adverse_floor=_as_float(band.get("strong_adverse_floor")),
        units=band.get("units", "pct_change"),
        any_significant=bool(band.get("any_significant", False)),
        coverage=resolved_coverage,
        provenance=band_provenance,
        fallback_used=fallback_used,
        entry_ref=entry_ref,
        threshold_reliability=entry.get("threshold_reliability"),
        nhp_tier=entry.get("nhp_tier"),
        special_flags=tuple(entry.get("special_flags") or ()),
        cross_organ_link=entry.get("cross_organ_link"),
        notes=entry.get("notes"),
        raw_entry=entry,
    )


def _as_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Provenance ordering helpers
# ---------------------------------------------------------------------------


def provenance_rank(prov: str) -> int:
    """Lower rank = stronger provenance. Unknown provenance ranks last."""
    return _PROVENANCE_RANK.get(prov, 99)


def weaker_of(a: str, b: str) -> str:
    """Return the weaker (most-extrapolated) of two provenance tags."""
    return a if provenance_rank(a) >= provenance_rank(b) else b


# ---------------------------------------------------------------------------
# Iteration helpers (used by audit scripts)
# ---------------------------------------------------------------------------


def iter_entries() -> list[tuple[str, dict[str, Any]]]:
    data = load()
    entries = data.get("entries", {})
    if not isinstance(entries, dict):
        return []
    return list(entries.items())


def iter_joint_rules() -> list[tuple[str, dict[str, Any]]]:
    data = load()
    joint_rules = data.get("joint_rules", {}) or {}
    if not isinstance(joint_rules, dict):
        return []
    return list(joint_rules.items())
