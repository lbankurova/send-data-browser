"""F11 origin-detection unit tests.

Covers AC-F11-1..5:
- Regex correctness (TSPARMCD curated allowlist + negative-lookahead, SUPPDM, TSVAL country parse)
- Source precedence TSPARMCD > SUPPDM > TSVAL
- Multi-match within a single source -> origin_detection_conflict=True
- Cross-source disagreement -> origin_detection_conflict=True
- False-positive guard (FUNDINGSOURCE excluded via negative-lookahead)
- Never-blocks invariant (detect_origin never raises)
- origin_match resolution against HCD reference (Mauritius -> same, others -> different)

Run: cd backend && python tests/test_origin_detection.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis import origin_detection  # noqa: E402
from services.analysis.origin_detection import detect_origin  # noqa: E402


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
# AC-F11-1 (a): TSPARMCD path
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (a) TSPARMCD curated allowlist ===")

for code in ("SPCSOURCE", "ANSOURCE", "ANIMAL_SOURCE", "ANIMALSOURCE", "ANORIGIN",
             "CYNO_ORIGIN", "ORIGIN_COUNTRY", "ORIGIN"):
    r = detect_origin([{"TSPARMCD": code, "TSVAL": "Mauritius"}])
    check(
        f"{code}: origin_captured=True",
        r.origin_captured is True,
        f"got {r}",
    )
    check(
        f"{code}: origin_value='Mauritius'",
        r.origin_value == "Mauritius",
    )
    check(
        f"{code}: origin_match='same' (Mauritius == HCD reference)",
        r.origin_match == "same",
    )
    check(
        f"{code}: detection_source starts with TSPARMCD",
        (r.detection_source or "").startswith("TSPARMCD."),
    )


# ---------------------------------------------------------------------------
# AC-F11-1 (b): False-positive guard — FUNDINGSOURCE, DATASOURCE, SOURCEORG etc.
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (b) False-positive guard ===")

for bad_code in ("FUNDINGSOURCE", "DATASOURCE", "SOURCEDATA", "SOURCEORG", "RESOURCES",
                 "ORIGINATOR"):
    r = detect_origin([{"TSPARMCD": bad_code, "TSVAL": "Mauritius"}])
    check(
        f"{bad_code}: origin_captured=False (false-positive filter)",
        r.origin_captured is False,
        f"got {r}",
    )


# ---------------------------------------------------------------------------
# AC-F11-1 (c): SUPPDM path
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (c) SUPPDM.QNAM path ===")

r = detect_origin([], [{"QNAM": "ORIGIN_COUNTRY", "QVAL": "Vietnam"}])
check("SUPPDM ORIGIN_COUNTRY -> captured", r.origin_captured is True)
check("SUPPDM: detection_source starts with SUPPDM.", (r.detection_source or "").startswith("SUPPDM."))
check("SUPPDM Vietnam -> origin_match=different (HCD reference is Mauritius)",
      r.origin_match == "different")

r = detect_origin([], [{"QNAM": "FUNDINGSOURCE", "QVAL": "Mauritius"}])
check("SUPPDM FUNDINGSOURCE -> not captured (false-positive filter)",
      r.origin_captured is False)


# ---------------------------------------------------------------------------
# AC-F11-1 (d): TSVAL free-text country parse
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (d) TSVAL country-token parse ===")

r = detect_origin([{"TSPARMCD": "STRAIN", "TSVAL": "CAMBODIAN CYNOMOLGUS MACAQUE"}])
check("STRAIN=CAMBODIAN CYNO -> captured", r.origin_captured is True)
check("STRAIN Cambodian -> value captures CAMBODIAN token",
      r.origin_value == "CAMBODIAN")
check("STRAIN Cambodian -> detection_source starts with TSVAL.",
      (r.detection_source or "").startswith("TSVAL."))

r = detect_origin([{"TSPARMCD": "SPECIES", "TSVAL": "Vietnamese Cynomolgus Monkey"}])
check("SPECIES=Vietnamese Cyno -> captured", r.origin_captured is True)
check("SPECIES Vietnamese -> canonicalises to VIETNAM (match=different)",
      r.origin_match == "different")

# TSVAL on a non-origin-relevant param is ignored (only STRAIN/SPECIES/STYPE scanned).
r = detect_origin([{"TSPARMCD": "DOSE", "TSVAL": "Mauritius"}])
check("DOSE=Mauritius -> not captured (non-origin TSPARMCD)",
      r.origin_captured is False)


# ---------------------------------------------------------------------------
# AC-F11-1 (e): No-capture study surfaces origin_captured=false
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (e) No-capture ===")
r = detect_origin([])
check("empty TS -> origin_captured=False", r.origin_captured is False)
check("empty TS -> origin_value is None", r.origin_value is None)
check("empty TS -> origin_match='unknown'", r.origin_match == "unknown")
check("empty TS -> detection_source is None", r.detection_source is None)
check("empty TS -> origin_detection_conflict=False",
      r.origin_detection_conflict is False)


# ---------------------------------------------------------------------------
# AC-F11-1 (f): Cross-source conflict (TSPARMCD=MAURITIUS, TSVAL=VIETNAM)
# ---------------------------------------------------------------------------
print("\n=== AC-F11-1 (f) Cross-source conflict ===")
r = detect_origin([
    {"TSPARMCD": "SPCSOURCE", "TSVAL": "Mauritius"},
    {"TSPARMCD": "STRAIN", "TSVAL": "Vietnamese origin"},
])
check("TSPARMCD wins precedence: origin_value=Mauritius",
      r.origin_value == "Mauritius",
      f"got {r.origin_value}")
check("TSPARMCD vs TSVAL disagreement -> origin_detection_conflict=True",
      r.origin_detection_conflict is True)
check("disagreement -> origin_match='unknown'",
      r.origin_match == "unknown")
check("disagreement -> detection_source still identifies winning precedence",
      (r.detection_source or "").startswith("TSPARMCD."))


# ---------------------------------------------------------------------------
# Multi-match WITHIN a single source -> conflict flagged
# ---------------------------------------------------------------------------
print("\n=== Multi-match within TSPARMCD ===")
r = detect_origin([
    {"TSPARMCD": "SPCSOURCE", "TSVAL": "Mauritius"},
    {"TSPARMCD": "ANORIGIN", "TSVAL": "Vietnam"},
])
check("two TSPARMCD origin rows with different countries -> conflict",
      r.origin_detection_conflict is True)
check("two TSPARMCD origin rows -> origin_match='unknown'",
      r.origin_match == "unknown")


# ---------------------------------------------------------------------------
# Source precedence TSPARMCD > SUPPDM > TSVAL
# ---------------------------------------------------------------------------
print("\n=== Source precedence ===")
r = detect_origin(
    ts_rows=[{"TSPARMCD": "SPCSOURCE", "TSVAL": "Mauritius"}],
    suppdm_rows=[{"QNAM": "ORIGIN_COUNTRY", "QVAL": "Vietnam"}],
)
check("TSPARMCD wins over SUPPDM when both match",
      (r.detection_source or "").startswith("TSPARMCD."))
check("TSPARMCD Mauritius + SUPPDM Vietnam -> value=Mauritius",
      r.origin_value == "Mauritius")
check("cross-source disagreement -> origin_detection_conflict=True",
      r.origin_detection_conflict is True)

r = detect_origin(
    ts_rows=[{"TSPARMCD": "STRAIN", "TSVAL": "Cambodian origin"}],
    suppdm_rows=[{"QNAM": "ORIGIN_COUNTRY", "QVAL": "Mauritius"}],
)
check("SUPPDM wins over TSVAL when TSPARMCD absent",
      (r.detection_source or "").startswith("SUPPDM."))
check("SUPPDM Mauritius + TSVAL Cambodian -> value=Mauritius (SUPPDM wins)",
      r.origin_value == "Mauritius")


# ---------------------------------------------------------------------------
# Canonicalisation: VIETNAMESE / VIETNAM map to same country
# ---------------------------------------------------------------------------
print("\n=== Country canonicalisation ===")
r = detect_origin([{"TSPARMCD": "SPCSOURCE", "TSVAL": "Vietnamese"}])
check("Vietnamese -> match=different (canonicalises to VIETNAM != Mauritius)",
      r.origin_match == "different")

r = detect_origin([{"TSPARMCD": "SPCSOURCE", "TSVAL": "Mainland China"}])
check("'Mainland China' -> match=different (China != Mauritius)",
      r.origin_match == "different")


# ---------------------------------------------------------------------------
# AC-F11-5: detect_origin NEVER raises
# ---------------------------------------------------------------------------
print("\n=== AC-F11-5 never-blocks ===")
try:
    detect_origin(None)
    check("detect_origin(None) does not raise", True)
except Exception as e:  # noqa: BLE001
    check(f"detect_origin(None) does not raise: {type(e).__name__}: {e}", False)

try:
    detect_origin([{"TSPARMCD": None, "TSVAL": None}])
    check("detect_origin with null values does not raise", True)
except Exception as e:  # noqa: BLE001
    check(f"detect_origin with null values does not raise: {type(e).__name__}: {e}", False)

try:
    detect_origin([{}], [{}])
    check("detect_origin with empty dicts does not raise", True)
except Exception as e:  # noqa: BLE001
    check(f"detect_origin with empty dicts does not raise: {type(e).__name__}: {e}", False)


# ---------------------------------------------------------------------------
# AC-F11-4-adjacent: payload shape for UI / consumer
# ---------------------------------------------------------------------------
print("\n=== Payload shape ===")
r = detect_origin([{"TSPARMCD": "SPCSOURCE", "TSVAL": "Mauritius"}])
p = r.to_payload()
for key in ("origin_captured", "origin_value", "origin_match", "detection_source",
            "origin_detection_conflict"):
    check(f"payload has '{key}'", key in p)


# ---------------------------------------------------------------------------
# Pattern cache reset
# ---------------------------------------------------------------------------
print("\n=== Pattern cache reset ===")
origin_detection.reset_cache()
r = detect_origin([{"TSPARMCD": "SPCSOURCE", "TSVAL": "Mauritius"}])
check("reset_cache + re-detect still works", r.origin_captured is True)


# ---------------------------------------------------------------------------
print("\n" + "=" * 50)
print(f"Results: {_passed} passed, {_failed} failed")


def test_origin_detection_all_checks_pass():
    """Pytest entry point — module-level check() calls populate _failed."""
    assert _failed == 0, f"{_failed} origin-detection check(s) failed; see stdout"


if __name__ == "__main__":
    sys.exit(0 if _failed == 0 else 1)
