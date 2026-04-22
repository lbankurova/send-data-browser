"""AC-F2-8: cross-topic payload-shape consistency test.

Enforces the through-line uncertainty-first payload convention across the
FCT registry (Phase A, shipped), the clinical catalog (incidence sentinel,
schema-ready), the P4 small-N qualifier (cv-tier-adaptive-thresholds Track
2 Phase E scope), and future inheritors (hcd-mi-ma-s08-wiring,
bw-classifier-rework, B5 origin).

Phase A scope: the test asserts VOCABULARY + POLARITY alignment across
modules that already declare the enums. It does NOT yet assert emission —
payloads that carry coverage/fallback_used/provenance are emitted by
Phase B consumers (classify_severity, confidence, scores_and_rules). This
file ships now so any Phase B PR that introduces a divergent enum value
or an inverted fallback_used polarity trips the gate before review.

Run: cd backend && python tests/test_payload_consistency.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis import fct_registry  # noqa: E402


# Canonical vocabularies per spec §F2 and AC-F2-7.
SPEC_COVERAGE = {
    "full", "partial", "none",
    "catalog_driven",
    "n-sufficient", "n-marginal", "n-insufficient",
}
SPEC_PROVENANCE = {
    "regulatory", "best_practice", "industry_survey",
    "bv_derived", "extrapolated",
    "stopping_criterion_used_as_proxy",
    "catalog_rule",
}
SPEC_UNITS = {"pct_change", "fold", "absolute", "sd"}
SPEC_RELIABILITY = {"high", "moderate", "low", "speculative"}


_passed = 0
_failed = 0


def check(name: str, cond: bool, detail: str = ""):
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed += 1
        suffix = f" -- {detail}" if detail else ""
        print(f"  FAIL  {name}{suffix}")


# ---------------------------------------------------------------------------
# (a) Coverage vocabulary is the exhaustive enum across all sources.
# ---------------------------------------------------------------------------
print("\n=== (a) coverage vocabulary ===")

check(
    "fct_registry.ALLOWED_COVERAGE matches spec enum exactly",
    set(fct_registry.ALLOWED_COVERAGE) == SPEC_COVERAGE,
    f"got {sorted(fct_registry.ALLOWED_COVERAGE)}, want {sorted(SPEC_COVERAGE)}",
)

# Schema enum check — structural mirror of fct_registry.
schema_path = _BACKEND.parent / "shared" / "schemas" / "field-consensus-thresholds.schema.json"
with open(schema_path, encoding="utf-8") as f:
    schema = json.load(f)
schema_coverage = set((schema.get("$defs", {}).get("coverage") or {}).get("enum") or [])
check(
    "FCT schema $defs/coverage matches spec enum exactly",
    schema_coverage == SPEC_COVERAGE,
    f"got {sorted(schema_coverage)}",
)

# No registry entry may declare a coverage value outside the allowed set.
registry_data = fct_registry.load()
entries_with_bad_coverage = [
    k for k, e in (registry_data.get("entries") or {}).items()
    if e.get("coverage") not in SPEC_COVERAGE
]
check(
    "every FCT entry declares coverage from spec enum",
    not entries_with_bad_coverage,
    f"bad entries: {entries_with_bad_coverage}",
)


# ---------------------------------------------------------------------------
# (b) fallback_used polarity lock.
#
# Polarity: true = "default was substituted" (species band missing,
# registry fell back to 'other'/'any'). NEVER "override applied" — that
# polarity is reserved for a future X7 override payload field.
# ---------------------------------------------------------------------------
print("\n=== (b) fallback_used polarity lock ===")

# Species-band hit (explicit band present) -> fallback_used=False.
fct_liver_dog = fct_registry.get_fct("OM", "LIVER", species="BEAGLE", direction="both")
check(
    "species-specific band hit -> fallback_used=False",
    fct_liver_dog.fallback_used is False,
)

# Missing species band -> fallback_used=True. TESTES has no nhp band (male
# reproductive entries weren't NHP-populated in Phase A migration); the
# loader should fall back to 'other' with fallback_used=True.
fct_testes_nhp = fct_registry.get_fct("OM", "TESTES", species="CYNOMOLGUS", direction="both")
check(
    "species-specific entry without this species band -> fallback_used=True",
    fct_testes_nhp.fallback_used is True,
    f"got {fct_testes_nhp.fallback_used}, bands probably have 'other' substituted",
)

# Flat (species_specific=False) entry hit via 'any' -> NOT a fallback.
fct_ovaries = fct_registry.get_fct("OM", "OVARIES", species="RAT", direction="both")
check(
    "flat entry ('any' band is authoritative) -> fallback_used=False",
    fct_ovaries.fallback_used is False,
)

# Entry missing -> fallback_used=True (registry substituted provisional defaults).
fct_missing = fct_registry.get_fct("OM", "NONEXISTENT_ENDPOINT", species="RAT")
check(
    "missing entry -> fallback_used=True",
    fct_missing.fallback_used is True,
)
check(
    "missing entry -> coverage='none' (provisional signal)",
    fct_missing.coverage == "none",
)


# ---------------------------------------------------------------------------
# (c) provenance values come from the single enum.
# ---------------------------------------------------------------------------
print("\n=== (c) provenance enum alignment ===")

check(
    "fct_registry.ALLOWED_PROVENANCE matches spec enum exactly",
    set(fct_registry.ALLOWED_PROVENANCE) == SPEC_PROVENANCE,
    f"got {sorted(fct_registry.ALLOWED_PROVENANCE)}",
)

schema_provenance = set((schema.get("$defs", {}).get("provenance") or {}).get("enum") or [])
check(
    "FCT schema $defs/provenance matches spec enum exactly",
    schema_provenance == SPEC_PROVENANCE,
    f"got {sorted(schema_provenance)}",
)

# No registry entry or band may declare provenance outside the allowed set.
bad_entry_provenances = []
bad_band_provenances = []
for key, entry in (registry_data.get("entries") or {}).items():
    if entry.get("provenance") not in SPEC_PROVENANCE:
        bad_entry_provenances.append((key, entry.get("provenance")))
    for species_key, band in (entry.get("bands") or {}).items():
        p = band.get("provenance")
        if p is not None and p not in SPEC_PROVENANCE:
            bad_band_provenances.append((key, species_key, p))

check(
    "every FCT entry-level provenance comes from spec enum",
    not bad_entry_provenances,
    f"bad: {bad_entry_provenances}",
)
check(
    "every FCT per-band provenance comes from spec enum",
    not bad_band_provenances,
    f"bad: {bad_band_provenances}",
)

# Joint-rule provenance too.
bad_joint_provenances = [
    (k, r.get("provenance")) for k, r in (registry_data.get("joint_rules") or {}).items()
    if r.get("provenance") not in SPEC_PROVENANCE
]
check(
    "every FCT joint_rule provenance comes from spec enum",
    not bad_joint_provenances,
    f"bad: {bad_joint_provenances}",
)


# ---------------------------------------------------------------------------
# Units + threshold_reliability alignment
# ---------------------------------------------------------------------------
print("\n=== (d) units + reliability alignment ===")

check(
    "fct_registry.ALLOWED_UNITS matches spec enum exactly",
    set(fct_registry.ALLOWED_UNITS) == SPEC_UNITS,
)
check(
    "fct_registry.ALLOWED_RELIABILITY matches spec enum exactly",
    set(fct_registry.ALLOWED_RELIABILITY) == SPEC_RELIABILITY,
)

schema_units = set((schema.get("$defs", {}).get("units") or {}).get("enum") or [])
schema_reliability = set((schema.get("$defs", {}).get("threshold_reliability") or {}).get("enum") or [])
check(
    "FCT schema $defs/units matches spec enum exactly",
    schema_units == SPEC_UNITS,
)
check(
    "FCT schema $defs/threshold_reliability matches spec enum exactly",
    schema_reliability == SPEC_RELIABILITY,
)


# ---------------------------------------------------------------------------
# FctBands.to_payload output shape (ensures emission-time field names match).
# ---------------------------------------------------------------------------
print("\n=== (e) FctBands.to_payload field shape ===")

payload = fct_liver_dog.to_payload()
required_payload_keys = {
    "coverage", "fallback_used", "provenance",
    "entry_ref", "threshold_reliability",
    "variation_ceiling", "concern_floor", "adverse_floor", "strong_adverse_floor",
    "units", "any_significant",
}
missing = required_payload_keys - set(payload)
check(
    "FctBands.to_payload emits every through-line required key",
    not missing,
    f"missing: {sorted(missing)}",
)


# ---------------------------------------------------------------------------
# Catalog-sentinel combination (AC-F2-7): {coverage: catalog_driven,
# fallback_used: false, provenance: catalog_rule} must be declared valid by
# both the Python ALLOWED_* sets and the schema. Payload emission for
# incidence findings ships in Phase B; this test enforces the schema-level
# contract now.
# ---------------------------------------------------------------------------
print("\n=== (f) catalog-sentinel combination (AC-F2-7) ===")

check(
    "'catalog_driven' in coverage enum",
    "catalog_driven" in SPEC_COVERAGE,
)
check(
    "'catalog_rule' in provenance enum",
    "catalog_rule" in SPEC_PROVENANCE,
)


# ---------------------------------------------------------------------------
# F11 origin payload: documented BFIELDs exist in field-contracts-index.md.
# Reads the index directly — failing here means the new BFIELD entries
# were not added when a Phase A PR introduced origin payload emission.
# ---------------------------------------------------------------------------
print("\n=== (g) F11 origin payload documented in field-contracts-index ===")

contracts_index = _BACKEND.parent / "docs" / "_internal" / "knowledge" / "field-contracts-index.md"
if contracts_index.exists():
    idx = contracts_index.read_text(encoding="utf-8")
    for field_name in ("origin_captured", "origin_value", "origin_match",
                       "detection_source", "origin_detection_conflict"):
        check(
            f"field-contracts-index.md documents '{field_name}'",
            field_name in idx,
        )
else:
    check("field-contracts-index.md exists", False,
          f"not found at {contracts_index}")


# ---------------------------------------------------------------------------
print("\n" + "=" * 50)
print(f"Results: {_passed} passed, {_failed} failed")


def test_payload_consistency_all_checks_pass():
    """Pytest entry point — module-level check() calls populate _failed."""
    assert _failed == 0, f"{_failed} payload-consistency check(s) failed; see stdout"


if __name__ == "__main__":
    sys.exit(0 if _failed == 0 else 1)
