"""AC-F1-1 / AC-F2-1 / AC-F3-1 numeric verification.

Asserts the FCT registry bands byte-match the research-doc ground truth
for entries with literal JSON fragments in
docs/_internal/research/fct-lb-bw-band-values.md sections 7.1, 7.2, 7.6.

Scope (MINOR 3 resolution):
  LB.ALT.up, LB.AST.up, LB.TBILI.up, LB.ALP.up, LB.GGT.up   (sec 7.1)
  LB.BUN.up, LB.CREAT.up                                     (sec 7.2)
  BW.BW.down                                         (sec 7.6)

Out of scope (manual PR-checklist verification):
  CHOL / GLUC / TP / ALB + all 12 LB hematology entries.

Invoked via scripts/verify-fct-lb-bw-numerics.sh (thin bash wrapper).
Exit: 0 on all-match, 1 on any mismatch.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REG = ROOT / "shared" / "rules" / "field-consensus-thresholds.json"


def _ladder(vc: float, cf: float, af: float, saf: float) -> dict[str, float]:
    return {
        "variation_ceiling": vc,
        "concern_floor": cf,
        "adverse_floor": af,
        "strong_adverse_floor": saf,
    }


# Per-species expected ladders. None means "uniform across all 5 species".
EXPECTED: dict[str, tuple[dict[str, dict[str, float]] | None, dict[str, float], str]] = {
    # sec 7.1 hepatic markers (all fold)
    "LB.ALT.up": (
        {
            "dog": _ladder(1.8, 2.0, 3.0, 5.0),
            "nhp": _ladder(2.0, 2.0, 3.0, 5.0),
        },
        _ladder(1.5, 2.0, 3.0, 5.0),  # rat/mouse/other
        "fold",
    ),
    "LB.AST.up": (
        {
            "dog": _ladder(1.8, 2.0, 3.0, 5.0),
            "nhp": _ladder(2.0, 2.0, 3.0, 5.0),
        },
        _ladder(1.5, 2.0, 3.0, 5.0),
        "fold",
    ),
    "LB.TBILI.up": (None, _ladder(1.2, 1.5, 2.0, 3.0), "fold"),
    # R1 Finding 3: dog tightened to match rodent (1.5/2.0/3.0/5.0)
    "LB.ALP.up": (None, _ladder(1.5, 2.0, 3.0, 5.0), "fold"),
    "LB.GGT.up": (None, _ladder(1.5, 2.0, 3.0, 5.0), "fold"),
    # sec 7.2 renal markers (all fold)
    "LB.BUN.up": (None, _ladder(1.3, 1.5, 2.0, 3.0), "fold"),
    "LB.CREAT.up": (None, _ladder(1.2, 1.5, 2.0, 3.0), "fold"),
    # sec 7.6 body weight (pct_change)
    "BW.BW.down": (
        {
            "rat":   _ladder(3, 5, 10, 15),
            "mouse": _ladder(2, 4, 8, 12),
            "dog":   _ladder(4, 5, 10, 15),
            "nhp":   _ladder(5, 4, 6, 12),
            "other": _ladder(3, 5, 10, 15),
        },
        _ladder(3, 5, 10, 15),
        "pct_change",
    ),
}


def verify() -> int:
    if not REG.exists():
        print(f"ERROR: FCT registry not found at {REG}", file=sys.stderr)
        return 2
    with open(REG, encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", {})
    failures: list[str] = []

    for entry_key, (per_species, default_ladder, expected_units) in EXPECTED.items():
        entry = entries.get(entry_key)
        if entry is None:
            failures.append(f"MISSING {entry_key!r} in registry")
            continue
        bands = entry.get("bands", {})
        for sp in ("rat", "mouse", "dog", "nhp", "other"):
            band = bands.get(sp)
            if band is None:
                failures.append(f"MISSING {entry_key} bands.{sp}")
                continue
            expected = (per_species or {}).get(sp, default_ladder)
            for k, v in expected.items():
                actual = band.get(k)
                if actual != v:
                    failures.append(
                        f"FAIL {entry_key} bands.{sp}.{k}: expected {v}, got {actual}"
                    )
            actual_units = band.get("units")
            if actual_units != expected_units:
                failures.append(
                    f"FAIL {entry_key} bands.{sp}.units: expected {expected_units!r}, "
                    f"got {actual_units!r}"
                )

    if failures:
        print("\n".join(failures), file=sys.stderr)
        print(
            f"\nFAIL: {len(failures)} band-value mismatches against research "
            f"sec 7.1 / 7.2 / 7.6 JSON.",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: all research-literal-JSON bands verified "
        f"({len(EXPECTED)} entries x 5 species x 4 floors + units)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(verify())
