"""Regenerate syndrome_rollup.json from on-disk inputs (no XPT re-read).

build_syndrome_rollup is a pure aggregation over subject_syndromes +
subject_context + noael_summary + mortality + recovery_verdicts. We can
re-run it without invoking the full generator pipeline.
"""
import json
import sys
from pathlib import Path

# Make `generator` importable
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from generator.syndrome_rollup import build_syndrome_rollup

GEN = ROOT / "backend" / "generated"

STUDIES = [
    "PointCross", "PDS", "Nimble",
    "TOXSCI-24-0062--43066 1 month dog- Compound A-xpt",
    "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt",
    "TOXSCI-24-0062--87497 1 month rat- Compound B-xpt",
    "TOXSCI-24-0062--96298 1 month rat- Compound A xpt",
    "instem",
    "CBER-POC-Pilot-Study1-Vaccine_xpt_only",
    "CBER-POC-Pilot-Study2-Vaccine_xpt",
    "CBER-POC-Pilot-Study3-Gene-Therapy",
    "CBER-POC-Pilot-Study4-Vaccine",
]


def load(p):
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


for study in STUDIES:
    sd = GEN / study
    if not sd.exists():
        print(f"[SKIP] {study}: no dir")
        continue
    ss = load(sd / "subject_syndromes.json")
    if ss is None:
        print(f"[SKIP] {study}: no subject_syndromes.json")
        continue
    ctx = load(sd / "subject_context.json") or []
    noael = load(sd / "noael_summary.json")
    mort = load(sd / "study_mortality.json")
    rv = load(sd / "recovery_verdicts.json")

    rollup = build_syndrome_rollup(
        subject_syndromes=ss,
        subject_context=ctx,
        noael_summary=noael,
        mortality=mort,
        recovery_verdicts=rv,
    )
    out_path = sd / "syndrome_rollup.json"
    with open(out_path, "w") as f:
        json.dump(rollup, f, indent=2)
    n_syn = rollup["meta"].get("n_syndromes_detected", 0)
    n_cross = len(rollup.get("cross_organ_syndromes") or [])
    n_cof = len(rollup.get("cofiring_presentations") or [])
    print(f"[OK]   {study}: n_syn={n_syn} n_cross={n_cross} n_cofiring={n_cof}")
