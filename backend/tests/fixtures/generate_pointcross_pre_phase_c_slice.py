"""Generate the pointcross stratified-random finding slice fixture.

**Timing note (AC-4.4 deviation):** the spec wanted this fixture captured
BEFORE Feature 4 wiring so that a strict pre/post comparison of scientific
fields could be asserted. The pre-Phase-C window closed when the
implementation cycle regenerated all 16 studies (the PointCross
unified_findings.json was overwritten with Phase C canonical_testcd values).

This generator script therefore produces a POST-Phase-C snapshot that is
used as a FORWARD-LOOKING regression baseline — future cycles that modify
findings_pipeline.py or send_knowledge.py's extract_base_concept /
assess_finding_recognition MUST keep every scientific field in this slice
byte-identical. The Phase C shipping commit itself is the reference point.

The spec's pre/post science-preservation intent was satisfied by the
validation suite (48/49 signals + 83/84 design checks + 29/29 assertions
unchanged before and after the cycle) — see docs/validation/summary.md
pre-cycle vs post-cycle. The slice is retained as the fast-feedback
fixture going forward.

Seed: 20260407 (cycle ship date ISO short form, per AC-4.4 R2 N6).

Run (idempotent):
    python backend/tests/fixtures/generate_pointcross_pre_phase_c_slice.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 20260407

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
POINTCROSS_PATH = REPO_ROOT / "backend" / "generated" / "PointCross" / "unified_findings.json"
OUT_PATH = Path(__file__).resolve().parent / "pointcross_post_phase_c_slice.json"

# Scientific fields — byte-identity asserted by the slice regression test.
SCIENTIFIC_FIELDS = [
    "severity",
    "finding_class",
    "max_effect_lower",
    "treatment_related",
    "direction",
    "severity_grade_5pt",
    "dose_response_pattern",
    "pattern_confidence",
]

# Structural fields — Phase C / future cycles may change these.
# Captured for informational diff but not asserted byte-identical.
STRUCTURAL_FIELDS = [
    "canonical_testcd",
    "test_code_recognition_level",
    "test_code_recognition_reason",
    "canonical_base_finding",
    "canonical_qualifier",
    "test_code_recognition_source",
]

# Identity fields — used to match rows pre/post.
IDENTITY_FIELDS = ["domain", "test_code", "specimen", "sex", "day"]


def _extract(f: dict) -> dict:
    out = {}
    for k in IDENTITY_FIELDS + SCIENTIFIC_FIELDS + STRUCTURAL_FIELDS:
        if k in f:
            out[k] = f[k]
    return out


def _stratum_key(f: dict) -> tuple:
    return (
        f.get("domain"),
        f.get("severity"),
        f.get("treatment_related"),
    )


def main() -> int:
    if not POINTCROSS_PATH.exists():
        print(f"ERROR: {POINTCROSS_PATH} not found. Run the generator first.")
        return 1
    data = json.loads(POINTCROSS_PATH.read_text(encoding="utf-8"))
    findings = data.get("findings", [])
    if not findings:
        print("ERROR: no findings in PointCross unified_findings.json")
        return 1

    # Stratify by (domain, severity, treatment_related) and sample deterministically.
    strata: dict[tuple, list[dict]] = {}
    for f in findings:
        strata.setdefault(_stratum_key(f), []).append(f)

    rng = random.Random(SEED)

    # Target: ≥200 stratified-random findings covering all domains represented
    # in PointCross. Force-include: GAP-248 exemplars + comma_suffix / prefix_modifier
    # candidates.
    slice_rows: list[dict] = []
    seen_keys: set[tuple] = set()

    # Force-include GAP-248 exemplars
    for f in findings:
        tn = (f.get("test_name") or "").upper()
        if "RETINAL FOLD" in tn:
            key = tuple(f.get(k) for k in IDENTITY_FIELDS)
            if key not in seen_keys:
                slice_rows.append(_extract(f))
                seen_keys.add(key)

    # Stratified random sample: ~equal allocation per stratum up to budget.
    # Total target: 200 beyond the forced exemplars.
    target_total = 200
    stratum_keys = sorted(strata.keys(), key=lambda k: (str(k[0]), str(k[1]), str(k[2])))
    per_stratum = max(1, (target_total - len(slice_rows)) // max(1, len(stratum_keys)))

    for sk in stratum_keys:
        bucket = strata[sk]
        take = min(per_stratum, len(bucket))
        sample = rng.sample(bucket, take)
        for f in sample:
            key = tuple(f.get(k) for k in IDENTITY_FIELDS)
            if key in seen_keys:
                continue
            slice_rows.append(_extract(f))
            seen_keys.add(key)

    # Fill any remaining budget from random un-seen findings.
    remaining = target_total + 20 - len(slice_rows)
    if remaining > 0:
        pool = [f for f in findings if tuple(f.get(k) for k in IDENTITY_FIELDS) not in seen_keys]
        rng.shuffle(pool)
        for f in pool[:remaining]:
            slice_rows.append(_extract(f))
            seen_keys.add(tuple(f.get(k) for k in IDENTITY_FIELDS))

    output = {
        "_comment": (
            "AC-4.4 forward-looking regression slice (post-Phase-C baseline). "
            "See generator docstring for the timing-window deviation note. "
            "Scientific fields MUST be byte-identical in future cycles. "
            "Structural fields (canonical_testcd, test_code_recognition_*, "
            "canonical_base_finding, canonical_qualifier, "
            "test_code_recognition_source) are informational — dictionary "
            "refreshes may change them."
        ),
        "seed": SEED,
        "generated_from": "backend/generated/PointCross/unified_findings.json",
        "scientific_fields": SCIENTIFIC_FIELDS,
        "structural_fields": STRUCTURAL_FIELDS,
        "identity_fields": IDENTITY_FIELDS,
        "count": len(slice_rows),
        "rows": slice_rows,
    }
    OUT_PATH.write_text(
        json.dumps(output, indent=2, sort_keys=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT_PATH} with {len(slice_rows)} findings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
