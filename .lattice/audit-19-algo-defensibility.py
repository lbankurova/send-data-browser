"""Rule 19 algorithm-defensibility audit for AUDIT-19.

Reads each study's syndrome_rollup.json (post-fix), reports cofiring_presentations
per cell, verifies SCIENCE-FLAG fire-pins (PC, PDS, 43066), preservation pins
(phospholipidosis on instem/96298/87497/Study3), and absence pins (Study1).

Suitable for copy-paste into the audit closure paragraph.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent / "backend" / "generated"

# (study, expected outcome class, notes)
STUDIES = [
    # Stream 5 SCIENCE-FLAG fire-pins
    ("PointCross", "FIRE", "Stream 5 SCIENCE-FLAG: 7-organ pattern at HIGH"),
    ("PDS", "FIRE", "Stream 5 SCIENCE-FLAG: 14-organ pattern at HIGH"),
    ("TOXSCI-24-0062--43066 1 month dog- Compound A-xpt", "FIRE", "Stream 5 SCIENCE-FLAG: dog cross-species"),
    # Stream 5 SCIENCE-FLAG that won't clear via cofiring (data is not actually multi-organ)
    ("Nimble", "NO_FIRE_DATA_LIMITED", "Stream 5 pin: data shows only 1 target_organ_flag=True; 0 syndromes detected upstream"),
    # Preservation pins (phospholipidosis still in cross_organ_syndromes)
    ("instem", "PRESERVE_PHOSPHOLIPIDOSIS", "definition-spanning still surfaces phospholipidosis"),
    ("TOXSCI-24-0062--96298 1 month rat- Compound A xpt", "PRESERVE_PHOSPHOLIPIDOSIS", "definition-spanning"),
    ("TOXSCI-24-0062--87497 1 month rat- Compound B-xpt", "PRESERVE_PHOSPHOLIPIDOSIS", "definition-spanning"),
    ("CBER-POC-Pilot-Study3-Gene-Therapy", "PRESERVE_PHOSPHOLIPIDOSIS", "definition-spanning"),
    # Absence pin
    ("CBER-POC-Pilot-Study1-Vaccine_xpt_only", "NO_FIRE_ABSENCE", "0 syndromes (preservation: vaccine non-adjuvanted)"),
    # Vaccine cells with co-firing (acceptable per architecture: structural surface, not adversity)
    ("CBER-POC-Pilot-Study2-Vaccine_xpt", "FIRE_VACCINE", "vaccine cells fire co-firing entries; downstream consumer interprets adversity"),
    ("CBER-POC-Pilot-Study4-Vaccine", "FIRE_VACCINE", "vaccine cells fire co-firing entries"),
    # Other studies for completeness
    ("TOXSCI-24-0062--35449 1 month dog- Compound B-xpt", "FIRE", "dog HIGH co-firing"),
]


def assess(study_dir, expected):
    rp = study_dir / "syndrome_rollup.json"
    if not rp.exists():
        return ("[SKIP]", f"no syndrome_rollup.json", None, None)
    with open(rp) as f:
        rollup = json.load(f)
    cof = rollup.get("cofiring_presentations") or []
    cross = rollup.get("cross_organ_syndromes") or []
    n_syn = (rollup.get("meta") or {}).get("n_syndromes_detected", 0)

    # Determine actual outcome
    if expected == "FIRE":
        if any(c["phase"] == "Main Study" and c["dose_value"] is not None and c["dose_value"] > 0 for c in cof):
            return ("[PASS]", f"{len(cof)} cofiring entries; max n_organ_systems={max((c['n_organ_systems'] for c in cof), default=0)}", cof, cross)
        return ("[FAIL]", f"expected >=1 cofiring entry at treated dose; got {len(cof)}", cof, cross)
    if expected == "NO_FIRE_DATA_LIMITED":
        if not cof:
            return ("[EXPECTED]", f"no cofiring (n_syndromes_detected={n_syn} -- upstream gap)", cof, cross)
        return ("[UNEXPECTED]", f"got {len(cof)} cofiring entries -- data may have changed", cof, cross)
    if expected == "PRESERVE_PHOSPHOLIPIDOSIS":
        phos_in_cross = any(c.get("syndrome_id") == "phospholipidosis" for c in cross)
        if phos_in_cross:
            return ("[PASS]", f"phospholipidosis preserved in cross_organ_syndromes ({len(cross)} entries); cofiring={len(cof)}", cof, cross)
        return ("[FAIL]", f"phospholipidosis not in cross_organ_syndromes ({len(cross)} entries)", cof, cross)
    if expected == "NO_FIRE_ABSENCE":
        if not cof and not cross:
            return ("[PASS]", f"absence preserved (n_syndromes_detected={n_syn})", cof, cross)
        return ("[FAIL]", f"expected empty; got cofiring={len(cof)} cross={len(cross)}", cof, cross)
    if expected == "FIRE_VACCINE":
        return ("[INFO]", f"{len(cof)} cofiring entries (vaccine pharmacology surface)", cof, cross)
    return ("[?]", "unknown expected", cof, cross)


for study, expected, notes in STUDIES:
    sd = ROOT / study
    status, summary, cof, cross = assess(sd, expected)
    print(f"\n{status} {study}")
    print(f"  expected: {expected} -- {notes}")
    print(f"  result:   {summary}")
    if cof and len(cof) <= 6:
        for c in cof:
            organs_str = ",".join(c.get("organ_systems", []))
            print(f"    cofiring cell={c.get('cell'):<22} n_org={c.get('n_organ_systems')}  organs=[{organs_str}]  n_subj={c.get('n_subjects_total')}/{c.get('n_evaluable')}")
    elif cof:
        # Show top 3 cells
        for c in cof[:3]:
            organs_str = ",".join(c.get("organ_systems", []))
            print(f"    cofiring cell={c.get('cell'):<22} n_org={c.get('n_organ_systems')}  organs=[{organs_str}]  n_subj={c.get('n_subjects_total')}/{c.get('n_evaluable')}")
        print(f"    (... +{len(cof)-3} more cells)")
