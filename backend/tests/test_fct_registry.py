"""AC-F2-2 OM parity gate: FCT registry byte-equal with pre-migration values.

Run: cd backend && python tests/test_fct_registry.py

Asserts that the FCT registry migration preserves all per-organ per-species
thresholds from the superseded `shared/organ-weight-thresholds.json`. This is
the Phase A parity gate — if these assertions fail, the migration is not
byte-equivalent and the downstream `classify_severity` / `_assess_om_two_gate`
behavior has drifted.

Covers: 13 organs, rat/mouse/dog/nhp/other species coverage, null-band NHP
cases (spleen/thymus/lungs/pancreas), flat non-species-specific entries
(ovaries/uterus), nhp_tier propagation, special_flags / adaptive_requires /
cross_organ_link passthrough, threshold_source -> provenance mapping.

Also exercises the loader error paths (integrity check) and the downstream
`get_organ_threshold()` return shape that `_assess_om_two_gate` depends on.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

# Ensure backend/ is on sys.path for services.* imports when run directly.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis import fct_registry  # noqa: E402
from services.analysis.fct_registry import (  # noqa: E402
    FctRegistryIntegrityError,
    resolve_species_category,
    get_fct,
    content_fingerprint,
)
from services.analysis.organ_thresholds import (  # noqa: E402
    get_organ_threshold,
    get_default_om_threshold,
    get_organ_fct_bands,
)


# ---------------------------------------------------------------------------
# Pre-migration expected values (from the deleted organ-weight-thresholds.json).
# Each row is (organ_config_key, species, variation_ceiling_pct,
#   adverse_floor_pct, strong_adverse_pct, legacy_threshold_source).
# ---------------------------------------------------------------------------
EXPECTED: list[tuple] = [
    # LIVER
    ("LIVER", "RAT",         5.0,  10.0, 25.0, "regulatory"),
    ("LIVER", "MOUSE",       5.0,  10.0, 25.0, "regulatory"),
    ("LIVER", "BEAGLE",      15.0, 25.0, 40.0, "calibrated"),
    ("LIVER", "CYNOMOLGUS",  25.0, 30.0, 50.0, "derived"),
    # KIDNEY
    ("KIDNEY", "RAT",        5.0,  10.0, 25.0, "regulatory"),
    ("KIDNEY", "BEAGLE",     15.0, 15.0, 22.0, "calibrated"),
    ("KIDNEY", "CYNOMOLGUS", 20.0, 25.0, 40.0, "derived"),
    # HEART
    ("HEART", "RAT",         3.0,  8.0,  15.0, "calibrated"),
    ("HEART", "BEAGLE",      12.0, 12.0, 15.0, "calibrated"),
    ("HEART", "CYNOMOLGUS",  20.0, 25.0, 40.0, "derived"),
    # BRAIN (any_significant policy for rodents)
    ("BRAIN", "RAT",         0.0,  0.0,  5.0,  "calibrated"),
    ("BRAIN", "MOUSE",       0.0,  0.0,  5.0,  "calibrated"),
    ("BRAIN", "BEAGLE",      5.0,  5.0,  5.0,  "calibrated"),
    ("BRAIN", "CYNOMOLGUS",  15.0, 15.0, 25.0, "derived"),
    # ADRENAL
    ("ADRENAL", "RAT",       5.0,  15.0, 30.0, "calibrated"),
    ("ADRENAL", "MOUSE",     8.0,  25.0, 40.0, "calibrated"),
    ("ADRENAL", "BEAGLE",    20.0, 20.0, 30.0, "calibrated"),
    ("ADRENAL", "CYNOMOLGUS",20.0, 25.0, 40.0, "derived"),
    # THYROID
    ("THYROID", "RAT",       5.0,  15.0, 30.0, "calibrated"),
    ("THYROID", "BEAGLE",    15.0, 15.0, 25.0, "calibrated"),
    ("THYROID", "CYNOMOLGUS",20.0, 25.0, 40.0, "derived"),
    # SPLEEN (rat/mouse/dog populated; nhp null)
    ("SPLEEN", "RAT",        8.0,  20.0, 40.0, "calibrated"),
    ("SPLEEN", "BEAGLE",     20.0, 20.0, 30.0, "calibrated"),
    # THYMUS
    ("THYMUS", "RAT",        8.0,  20.0, 40.0, "calibrated"),
    ("THYMUS", "BEAGLE",     20.0, 20.0, 30.0, "calibrated"),
    # TESTES
    ("TESTES", "RAT",        5.0,  10.0, 20.0, "calibrated"),
    ("TESTES", "BEAGLE",     15.0, 15.0, 20.0, "calibrated"),
    # EPIDIDYMIDES
    ("EPIDIDYMIDES", "RAT",  5.0,  10.0, 20.0, "calibrated"),
    ("EPIDIDYMIDES", "BEAGLE",15.0,15.0, 20.0, "calibrated"),
    # OVARIES (flat, species_specific=false)
    ("OVARIES", "RAT",       10.0, 20.0, 35.0, "calibrated"),
    # UTERUS (flat)
    ("UTERUS", "RAT",        15.0, 25.0, 40.0, "calibrated"),
    # LUNGS (rat/mouse/dog populated; nhp null)
    ("LUNGS", "RAT",         5.0,  15.0, 30.0, "calibrated"),
    ("LUNGS", "BEAGLE",      5.0,  15.0, 30.0, "calibrated"),
]

# Expected null-band rows (NHP Tier C qualitative entries).
NULL_ROWS: list[tuple[str, str]] = [
    ("SPLEEN", "CYNOMOLGUS"),
    ("THYMUS", "CYNOMOLGUS"),
    ("LUNGS",  "CYNOMOLGUS"),
    ("PANCREAS", "CYNOMOLGUS"),
]

# Organs with special metadata that must pass through.
SPECIAL_FLAGS = {"KIDNEY": "alpha2u_globulin_male_rat"}
CROSS_LINKS = {"ADRENAL": "stress_axis", "THYROID": "liver_thyroid_axis", "THYMUS": "stress_axis"}
NHP_TIER_C = {"SPLEEN", "THYMUS", "LUNGS", "PANCREAS"}


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
_passed = 0
_failed = 0


def check(name: str, cond: bool, detail: str = ""):
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed += 1
        print(f"  FAIL  {name}{(' -- ' + detail) if detail else ''}")


# ---------------------------------------------------------------------------
# 1. Parity: per-(organ, species) values byte-equal with pre-migration
#
# Uses direct FCT registry lookups so specimen-map aliasing (ADRENAL GLAND ->
# ADRENAL etc.) is tested separately in §3. Byte-parity asserts the migrated
# numeric bands match the pre-migration organ-weight-thresholds.json exactly.
# ---------------------------------------------------------------------------
print("\n=== OM Parity (AC-F2-2) ===")

for organ, species, ceiling, floor, strong, source in EXPECTED:
    f = get_fct("OM", organ, species=species, direction="both")
    if f.entry_ref is None:
        check(f"{organ}/{species}: entry resolves", False, "FCT entry not found")
        continue
    check(f"{organ}/{species}: ceiling={ceiling}", f.variation_ceiling == ceiling,
          f"got {f.variation_ceiling}")
    check(f"{organ}/{species}: floor={floor}", f.adverse_floor == floor,
          f"got {f.adverse_floor}")
    check(f"{organ}/{species}: strong={strong}", f.strong_adverse_floor == strong,
          f"got {f.strong_adverse_floor}")
    # Legacy threshold_source vocabulary is derived from provenance —
    # check via organ_thresholds.get_organ_fct_bands which returns
    # the same underlying FctBands.
    from services.analysis.organ_thresholds import _legacy_source
    check(f"{organ}/{species}: legacy threshold_source={source}",
          _legacy_source(f.provenance) == source,
          f"got provenance={f.provenance} -> {_legacy_source(f.provenance)}")

# Null bands (NHP Tier C qualitative)
for organ, species in NULL_ROWS:
    f = get_fct("OM", organ, species=species, direction="both")
    check(f"{organ}/{species}: null bands (NHP Tier C)",
          f.entry_ref is not None
          and f.variation_ceiling is None
          and f.adverse_floor is None
          and f.strong_adverse_floor is None)


# ---------------------------------------------------------------------------
# 2. nhp_tier / special_flags / cross_organ_link passthrough
#
# Uses get_organ_threshold with real SEND specimen names (same mapping the
# OM classifier uses at runtime).
# ---------------------------------------------------------------------------
print("\n=== Optional metadata passthrough ===")

ORGAN_TO_SPECIMEN = {
    "LIVER": "LIVER",
    "KIDNEY": "KIDNEY",
    "HEART": "HEART",
    "BRAIN": "BRAIN",
    "ADRENAL": "ADRENAL GLAND",
    "THYROID": "THYROID GLAND",
    "SPLEEN": "SPLEEN",
    "THYMUS": "THYMUS",
    "TESTES": "TESTIS",
    "EPIDIDYMIDES": "EPIDIDYMIS",
    "OVARIES": "OVARY",
    "UTERUS": "UTERUS",
    "LUNGS": "LUNG",
    "PANCREAS": "PANCREAS",
}

for organ in NHP_TIER_C:
    specimen = ORGAN_TO_SPECIMEN[organ]
    r = get_organ_threshold(specimen, "RAT")
    check(f"{organ} ({specimen!r}): nhp_tier = C_qualitative",
          r is not None and r.get("nhp_tier") == "C_qualitative")

for organ, flag in SPECIAL_FLAGS.items():
    specimen = ORGAN_TO_SPECIMEN[organ]
    r = get_organ_threshold(specimen, "RAT")
    check(f"{organ} ({specimen!r}): special_flags contains {flag}",
          r is not None and flag in (r.get("special_flags") or []))

for organ, link in CROSS_LINKS.items():
    specimen = ORGAN_TO_SPECIMEN[organ]
    r = get_organ_threshold(specimen, "RAT")
    check(f"{organ} ({specimen!r}): cross_organ_link = {link}",
          r is not None and r.get("cross_organ_link") == link)

# LIVER adaptive_requires
r = get_organ_threshold("LIVER", "RAT")
check("LIVER: adaptive_requires.critical_clean includes ALT+AST",
      r is not None
      and "ALT" in r["adaptive_requires"]["critical_clean"]
      and "AST" in r["adaptive_requires"]["critical_clean"])
check("LIVER (dog): adaptive_ceiling_pct = 25",
      (get_organ_threshold("LIVER", "BEAGLE") or {}).get("adaptive_ceiling_pct") == 25.0)


# ---------------------------------------------------------------------------
# 3. Specimen alias resolution
# ---------------------------------------------------------------------------
print("\n=== Specimen alias resolution ===")
r1 = get_organ_threshold("ADRENAL GLANDS", "RAT")
r2 = get_organ_threshold("GLAND, ADRENAL", "RAT")
check("ADRENAL GLANDS -> ADRENAL",
      r1 and r1["adverse_floor_pct"] == 15.0 and r1["config_key"] == "ADRENAL")
check("GLAND, ADRENAL -> ADRENAL",
      r2 and r2["adverse_floor_pct"] == 15.0)

check("Unknown specimen returns None", get_organ_threshold("UNKNOWN", "RAT") is None)
check("PROSTATE (mapped specimen, no FCT entry) returns None",
      get_organ_threshold("PROSTATE", "RAT") is None)
check("get_default_om_threshold() == 15", get_default_om_threshold() == 15)


# ---------------------------------------------------------------------------
# 4. Species resolution parity with the superseded resolver
# ---------------------------------------------------------------------------
print("\n=== Species resolution parity ===")

cases = [
    ("RAT", "rat"),
    ("SPRAGUE-DAWLEY RAT", "rat"),
    ("MOUSE", "mouse"),
    ("DOG", "dog"),
    ("BEAGLE", "dog"),
    ("MONGREL", "dog"),
    (None, "rat"),           # conservative default — matches pre-migration
    ("RABBIT", "other"),      # not in alias list
    ("CYNOMOLGUS MONKEY", "nhp"),  # pre-migration behavior: MONKEY alias wins
]
for species, expected in cases:
    check(f"resolve({species!r}) == {expected!r}",
          resolve_species_category(species) == expected)


# ---------------------------------------------------------------------------
# 5. FCT uncertainty-first payload fields
# ---------------------------------------------------------------------------
print("\n=== FCT uncertainty-first payload ===")

f = get_fct("OM", "LIVER", species="BEAGLE", direction="both")
check("liver/dog: coverage=full", f.coverage == "full", f"got {f.coverage}")
check("liver/dog: provenance=industry_survey (Choi 2011)",
      f.provenance == "industry_survey", f"got {f.provenance}")
check("liver/dog: fallback_used=False", f.fallback_used is False)
check("liver/dog: entry_ref='OM.LIVER.both'", f.entry_ref == "OM.LIVER.both")

f = get_fct("OM", "SPLEEN", species="CYNOMOLGUS", direction="both")
check("spleen/nhp: coverage=none (Tier C)", f.coverage == "none", f"got {f.coverage}")
check("spleen/nhp: fallback_used=True", f.fallback_used is True)
check("spleen/nhp: all band values None",
      f.variation_ceiling is None and f.adverse_floor is None and f.strong_adverse_floor is None)
check("spleen/nhp: nhp_tier=C_qualitative", f.nhp_tier == "C_qualitative")

# Missing entry => provisional defaults
f = get_fct("OM", "NONEXISTENT", species="RAT", direction="both")
check("missing entry: coverage=none", f.coverage == "none")
check("missing entry: fallback_used=True", f.fallback_used is True)
check("missing entry: entry_ref=None", f.entry_ref is None)
check("missing entry: provenance=extrapolated", f.provenance == "extrapolated")

# Flat-entry behavior
f = get_fct("OM", "OVARIES", species="RAT", direction="both")
check("OVARIES (flat): species_specific=False -> fallback_used=False",
      f.fallback_used is False)
check("OVARIES (flat): coverage=full locally", f.coverage == "full")


# ---------------------------------------------------------------------------
# 6. Payload serialisation
# ---------------------------------------------------------------------------
print("\n=== Payload serialisation ===")
f = get_fct("OM", "LIVER", species="BEAGLE")
payload = f.to_payload()
required_keys = {
    "variation_ceiling", "concern_floor", "adverse_floor", "strong_adverse_floor",
    "units", "any_significant", "coverage", "provenance", "fallback_used",
    "entry_ref", "threshold_reliability",
}
check("to_payload has all required keys",
      required_keys.issubset(payload.keys()),
      f"missing {required_keys - payload.keys()}")


# ---------------------------------------------------------------------------
# 7. Loader integrity (negative path)
# ---------------------------------------------------------------------------
print("\n=== Loader integrity (negative path) ===")

# Simulate an invalid registry: missing provenance.
_saved = fct_registry._DATA
try:
    fct_registry._DATA = None
    bad = {
        "_schema_version": "1.0.0",
        "entries": {
            "OM.BROKEN.both": {
                "species_specific": False,
                "bands": {"any": {"units": "pct_change"}},
                "coverage": "partial",
                # provenance intentionally missing
            },
        },
    }
    try:
        fct_registry._validate_registry(bad)
        check("invalid registry (missing provenance) raises", False)
    except FctRegistryIntegrityError as e:
        check("invalid registry (missing provenance) raises", "provenance" in str(e))
finally:
    fct_registry._DATA = _saved


# ---------------------------------------------------------------------------
# 7a. Schema <-> validator cross-validation (AC-F2-4 remediation)
#
# The FCT loader uses an inline Python validator (no `ajv` / `jsonschema`
# dependency). The JSON Schema file is authored for IDE tooling + external
# validators. This test guards against schema drift: it asserts the enum
# values declared in the schema file match the ALLOWED_* frozensets in
# fct_registry.py exactly. Any change to the schema enums that isn't
# mirrored in the inline validator (or vice versa) fails here.
# ---------------------------------------------------------------------------
print("\n=== Schema <-> validator cross-validation (AC-F2-4) ===")

_SCHEMA_PATH = _BACKEND.parent / "shared" / "schemas" / "field-consensus-thresholds.schema.json"
if _SCHEMA_PATH.exists():
    with open(_SCHEMA_PATH, encoding="utf-8") as _sf:
        _schema = json.load(_sf)
    _defs = _schema.get("$defs", {})

    def _enum_of(def_name: str) -> set[str]:
        return set((_defs.get(def_name) or {}).get("enum") or [])

    check(
        "schema $defs/coverage enum matches ALLOWED_COVERAGE",
        _enum_of("coverage") == set(fct_registry.ALLOWED_COVERAGE),
        f"schema={sorted(_enum_of('coverage'))}, code={sorted(fct_registry.ALLOWED_COVERAGE)}",
    )
    check(
        "schema $defs/provenance enum matches ALLOWED_PROVENANCE",
        _enum_of("provenance") == set(fct_registry.ALLOWED_PROVENANCE),
        f"schema={sorted(_enum_of('provenance'))}, code={sorted(fct_registry.ALLOWED_PROVENANCE)}",
    )
    check(
        "schema $defs/units enum matches ALLOWED_UNITS",
        _enum_of("units") == set(fct_registry.ALLOWED_UNITS),
        f"schema={sorted(_enum_of('units'))}, code={sorted(fct_registry.ALLOWED_UNITS)}",
    )
    check(
        "schema $defs/threshold_reliability enum matches ALLOWED_RELIABILITY",
        _enum_of("threshold_reliability") == set(fct_registry.ALLOWED_RELIABILITY),
        f"schema={sorted(_enum_of('threshold_reliability'))}, code={sorted(fct_registry.ALLOWED_RELIABILITY)}",
    )
else:
    check("schema file exists at shared/schemas/field-consensus-thresholds.schema.json",
          False, f"not found at {_SCHEMA_PATH}")


# ---------------------------------------------------------------------------
# 7b. invalidate() hook integration (AC-F2-6)
#
# The hook is the X7 override-cascade integration point. Phase A ships the
# hook and its registration API; Phase D wires it into override_engine. The
# test here asserts the hook (a) fires with the passed study_id, (b) clears
# cached data so the next load re-validates, and (c) swallows hook errors
# without aborting invalidation.
# ---------------------------------------------------------------------------
print("\n=== invalidate() hook integration (AC-F2-6) ===")

_hook_calls: list[str] = []

def _recording_hook(study_id: str) -> None:
    _hook_calls.append(study_id)

def _throwing_hook(study_id: str) -> None:
    raise RuntimeError(f"hook failure for {study_id}")

# Clear any prior registrations (idempotent guard).
fct_registry._INVALIDATION_HOOKS.clear()

fct_registry.register_invalidation_hook(_recording_hook)
fct_registry.register_invalidation_hook(_recording_hook)  # idempotent
check("register_invalidation_hook is idempotent",
      len(fct_registry._INVALIDATION_HOOKS) == 1)

fct_registry.register_invalidation_hook(_throwing_hook)
# Prime the registry cache.
_ = fct_registry.load()
check("registry loaded (cache primed)", fct_registry._DATA is not None)

fct_registry.invalidate("PointCross")
check("invalidate clears _DATA", fct_registry._DATA is None)
check("invalidate fires hook with study_id", _hook_calls == ["PointCross"])
check("invalidate tolerates throwing hook (continues)", len(_hook_calls) == 1)

# Subsequent lookup re-loads the registry transparently.
_reloaded = fct_registry.get_fct("OM", "LIVER", species="RAT")
check("get_fct after invalidate returns FctBands",
      _reloaded.entry_ref == "OM.LIVER.both")

# Global invalidation (study_id=None) fires the hook with an empty string.
_hook_calls.clear()
fct_registry.invalidate()
check("invalidate(None) fires hook with empty string", _hook_calls == [""])

# Clean up registered hooks so later tests in this file are not affected.
fct_registry._INVALIDATION_HOOKS.clear()


# ---------------------------------------------------------------------------
# 8. Content fingerprint is stable
# ---------------------------------------------------------------------------
print("\n=== Content fingerprint ===")
fp1 = content_fingerprint()
fp2 = content_fingerprint()
check("content_fingerprint is deterministic", fp1 == fp2)
check("content_fingerprint is 64 hex chars (sha256)", len(fp1) == 64)


# ---------------------------------------------------------------------------
# 9. get_organ_fct_bands returns full payload for OM lookups
# ---------------------------------------------------------------------------
print("\n=== get_organ_fct_bands ===")
bands = get_organ_fct_bands("LIVER", "RAT")
check("get_organ_fct_bands returns an FctBands for LIVER/rat", bands is not None)
check("LIVER rat bands match parity",
      bands is not None
      and bands.variation_ceiling == 5.0
      and bands.adverse_floor == 10.0
      and bands.strong_adverse_floor == 25.0
      and bands.provenance == "regulatory")


# ---------------------------------------------------------------------------
# 10. classify_severity smoke (ensures classification module still imports)
# ---------------------------------------------------------------------------
print("\n=== classify_severity smoke ===")
try:
    from services.analysis.classification import classify_severity
    # classify_severity does NOT yet consume FCT (Phase B); Phase A parity
    # only asserts `get_organ_threshold` routing. Smoke-test that the
    # module imports cleanly and classifies a synthetic finding.
    result = classify_severity(
        {"min_p_adj": 0.04, "trend_p": None, "data_type": "continuous", "direction": "up"},
    )
    check("classify_severity import + smoke", isinstance(result, str))
except Exception as e:
    check(f"classify_severity import + smoke: {type(e).__name__}: {e}", False)


# ---------------------------------------------------------------------------
# 11. PointCross OM parity — AC-F2-2 fixture-based gate
#
# Loads the generated unified_findings.json and asserts (a) classify_severity
# replays the stored severity for every OM finding (self-consistency under
# the FCT-routed threshold path), and (b) the (specimen, sex, severity,
# finding_class) slim-hash matches the pre-migration baseline.
# ---------------------------------------------------------------------------
print("\n=== PointCross OM parity (AC-F2-2 fixture) ===")

_UNIFIED_PATH = _BACKEND / "generated" / "PointCross" / "unified_findings.json"
# Baseline slim-hash of OM (specimen, sex, severity, finding_class) tuples from
# the pre-migration PointCross regen. Captured 2026-04-21 immediately before
# the shared/organ-weight-thresholds.json -> FCT registry migration, regen'd
# with the FCT-routed get_organ_threshold, and verified byte-equal. Any future
# change that drifts this hash must either (a) update the baseline with
# scientist sign-off, or (b) be reverted.
_POINTCROSS_OM_SLIM_HASH = "69d81d9d7b62418bafb4e182645c8070"

if _UNIFIED_PATH.exists():
    from services.analysis.classification import classify_severity as _classify
    with open(_UNIFIED_PATH, encoding="utf-8") as _f:
        _uf = json.load(_f)
    _om = [f for f in _uf.get("findings", []) if f.get("domain") == "OM"]
    check(
        f"PointCross has OM findings (found {len(_om)})",
        len(_om) > 0,
    )

    _slim = sorted(
        (f.get("specimen"), f.get("sex"), f.get("severity"), f.get("finding_class"))
        for f in _om
    )
    _hash = hashlib.md5(str(_slim).encode()).hexdigest()
    check(
        f"OM slim-hash matches pre-migration baseline ({_POINTCROSS_OM_SLIM_HASH})",
        _hash == _POINTCROSS_OM_SLIM_HASH,
        f"got {_hash} -- classify_severity output drifted; see AC-F2-2",
    )

    _replayed = 0
    _mismatches: list[str] = []
    for _f in _om:
        _expected = _f.get("severity")
        _got = _classify(_f)
        if _expected != _got:
            _mismatches.append(
                f"{_f.get('specimen')}/{_f.get('sex')}: stored={_expected!r}, "
                f"replayed={_got!r}"
            )
        _replayed += 1
    check(
        f"classify_severity replays {_replayed} OM findings without drift",
        not _mismatches,
        "; ".join(_mismatches[:3]) + (" ..." if len(_mismatches) > 3 else ""),
    )
else:
    check(
        f"PointCross unified_findings.json present at {_UNIFIED_PATH}",
        False,
        "regen the study before running parity gate",
    )


# ---------------------------------------------------------------------------
print("\n" + "=" * 50)
print(f"Results: {_passed} passed, {_failed} failed")


def test_fct_registry_all_checks_pass():
    """Pytest entry point: module-level check() calls populate _failed; this
    wrapper just asserts the counter is zero so `pytest backend/tests` picks
    the suite up.
    """
    assert _failed == 0, f"{_failed} FCT registry check(s) failed; see stdout"


if __name__ == "__main__":
    sys.exit(0 if _failed == 0 else 1)
