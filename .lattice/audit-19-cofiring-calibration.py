"""AUDIT-19 calibration: count distinct primary organ_systems per (dose, phase) cell.

For each study with a syndrome_rollup.json, build the {(dose, phase): set(primary_organ)}
distribution by walking by_organ -> rows -> by_dose_phase keys. Print per-cell distinct
primary_organ count to calibrate the co-firing threshold N.

Goal pins:
  - PointCross HIGH cell expected to fire (>= N organs co-firing)
  - Nimble HIGH cell expected to fire
  - PDS HIGH cell expected to fire
  - TOXSCI-43066 dog HIGH cell expected to fire
  - Study1 vaccine: expected NOT to fire (preservation)
  - Phospholipidosis-bearing studies (instem, 96298, 87497, Study3): single-syndrome
    multi-organ should still be visible in cross_organ_syndromes; co-firing entries
    should NOT spuriously fire here from phospholipidosis alone.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent / "backend" / "generated"

STUDIES = [
    "PointCross",
    "Nimble",
    "PDS",
    "TOXSCI-24-0062--43066 1 month dog- Compound A-xpt",
    "CBER-POC-Pilot-Study1-Vaccine_xpt_only",
    "instem",
    "TOXSCI-24-0062--96298 1 month rat- Compound A xpt",
    "TOXSCI-24-0062--87497 1 month rat- Compound B-xpt",
    "CBER-POC-Pilot-Study3-Gene-Therapy",
    "TOXSCI-24-0062--35449 1 month dog- Compound B-xpt",
    "CBER-POC-Pilot-Study2-Vaccine_xpt",
    "CBER-POC-Pilot-Study4-Vaccine",
]


def cell_organ_distribution(rollup):
    """Return {(dose_str, phase): {organ_system: [(syndrome_id, syndrome_name), ...]}}."""
    out = {}
    for organ_system, rows in (rollup.get("by_organ") or {}).items():
        for row in rows:
            sid = row.get("syndrome_id", "?")
            sname = row.get("syndrome_name", "?")
            for cell_label in (row.get("by_dose_phase") or {}).keys():
                # cell_label is "<dose>:<phase>"
                if ":" not in cell_label:
                    continue
                dose_str, phase = cell_label.split(":", 1)
                key = (dose_str, phase)
                out.setdefault(key, {}).setdefault(organ_system, []).append((sid, sname))
    return out


for study in STUDIES:
    sd = ROOT / study
    rp = sd / "syndrome_rollup.json"
    if not rp.exists():
        print(f"\n[SKIP] {study}: no syndrome_rollup.json")
        continue
    with open(rp) as f:
        rollup = json.load(f)

    cross = rollup.get("cross_organ_syndromes") or []
    n_syn = (rollup.get("meta") or {}).get("n_syndromes_detected", 0)
    n_org = (rollup.get("meta") or {}).get("n_organs_with_match", 0)
    print(f"\n=== {study} ===")
    print(f"  n_syndromes_detected={n_syn}, n_organs_with_match={n_org}, cross_organ_syndromes={len(cross)}")

    dist = cell_organ_distribution(rollup)
    # Sort cells: Main first, then by dose desc
    sorted_cells = sorted(
        dist.keys(),
        key=lambda k: (0 if k[1] == "Main Study" else 1, -float(k[0]) if k[0] not in ("null", "0") else 0),
    )
    for (dose_str, phase) in sorted_cells:
        organs = dist[(dose_str, phase)]
        n_distinct = len(organs)
        if n_distinct < 2:
            continue  # skip uninteresting single-organ cells
        flag_n3 = "[FIRE@N=3]" if n_distinct >= 3 else ""
        flag_n4 = "[FIRE@N=4]" if n_distinct >= 4 else ""
        print(f"  cell={dose_str:>6}:{phase:<14} distinct_organs={n_distinct:>2} {flag_n3} {flag_n4}")
        for organ_system, members in sorted(organs.items()):
            ids = ", ".join(f"{sid}={sname}" for sid, sname in members[:4])
            if len(members) > 4:
                ids += f", ...+{len(members) - 4} more"
            print(f"    [{organ_system:<14}] {ids}")
