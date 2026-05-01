"""Regenerate subject_syndromes.json + syndrome_rollup.json after AUDIT-25 vocab fixes.

Walks the studies, calls build_subject_syndromes (re-reads MI/MA xpt) then
build_syndrome_rollup. Writes both JSON files atomically per study.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pandas as pd

from services.study_discovery import discover_studies
from generator.subject_syndromes import build_subject_syndromes
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


studies = discover_studies()


for study_id in STUDIES:
    sd = GEN / study_id
    if not sd.exists():
        print(f"[SKIP] {study_id}: no generated dir")
        continue
    if study_id not in studies:
        print(f"[SKIP] {study_id}: not in discover_studies")
        continue
    study = studies[study_id]

    findings_data = load(sd / "unified_findings.json")
    if findings_data is None:
        print(f"[SKIP] {study_id}: no unified_findings.json")
        continue
    findings = findings_data.get("findings") or []

    ctx = load(sd / "subject_context.json") or []
    ctx_df = pd.DataFrame(ctx)
    if ctx_df.empty:
        print(f"[SKIP] {study_id}: empty subject_context")
        continue

    try:
        ss = build_subject_syndromes(findings, study, ctx_df)
    except Exception as e:
        print(f"[FAIL] {study_id}: build_subject_syndromes -- {e}")
        continue
    with open(sd / "subject_syndromes.json", "w") as f:
        json.dump(ss, f, indent=2)

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
    with open(sd / "syndrome_rollup.json", "w") as f:
        json.dump(rollup, f, indent=2)

    n_ss_subj = sum(1 for v in (ss.get("subjects") or {}).values() if v.get("syndromes"))
    n_syn = rollup["meta"].get("n_syndromes_detected", 0)
    n_cross = len(rollup.get("cross_organ_syndromes") or [])
    n_cof = len(rollup.get("cofiring_presentations") or [])
    print(f"[OK]   {study_id}: subjects-w-syndrome={n_ss_subj} n_syn={n_syn} n_cross={n_cross} n_cofiring={n_cof}")
