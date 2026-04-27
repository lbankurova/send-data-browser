"""NOAEL-ALG algorithm-defensibility check on PointCross + PDS (CLAUDE.md rule 19).

Runs the post-Path-C `build_noael_summary` against both studies' real
`unified_findings.json` and reports the per-sex NOAEL output alongside the
cached BUG-031 baseline. The cached output is what shipped on master; the
new output is what the synthesis F1+F2 + AC-F1-9 + C2a per-dose fix +
override-respect gate produce.

Rule 19 requires answering: "Would a regulatory toxicologist agree this
output represents the data?" with cited per-pairwise / group values driving
the result. This script captures the data; the human-readable
defensibility statement lives in
``docs/validation/NOAEL-ALG-defensibility-pointcross.md`` (and -pds.md).

Run:
    cd backend && C:/pg/pcc/backend/venv/Scripts/python.exe \
        tests/test_noael_alg_defensibility_pointcross_pds.py
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

from generator.view_dataframes import build_noael_summary, build_endpoint_loael_summary  # noqa: E402
from services.analysis.analysis_settings import ScoringParams  # noqa: E402


def _load_study(study_id: str) -> tuple[list[dict], list[dict]]:
    """Read findings + dose_groups from cached unified_findings.json."""
    p = Path(__file__).resolve().parent.parent / "generated" / study_id / "unified_findings.json"
    with open(p) as f:
        d = json.load(f)
    return d["findings"], d["dose_groups"]


def _show_cached(study_id: str) -> list[dict]:
    p = Path(__file__).resolve().parent.parent / "generated" / study_id / "noael_summary.json"
    with open(p) as f:
        return json.load(f)


def _summarize(rows: list[dict], label: str) -> None:
    print(f"\n--- {label} ---")
    for r in rows:
        sex = r["sex"]
        noael = r.get("noael_label")
        loael = r.get("loael_label")
        method = (r.get("noael_derivation") or {}).get("method")
        n_adv = r.get("n_adverse_at_loael", 0)
        agg = (r.get("noael_derivation") or {}).get("aggregation_policy")
        sustained = (r.get("noael_derivation") or {}).get("sustained_dose_levels")
        transient = (r.get("noael_derivation") or {}).get("transient_dose_levels")
        print(f"  sex={sex:<8} NOAEL={noael:<25} LOAEL={loael:<30} method={method}")
        print(f"           n_adverse_at_loael={n_adv}  agg_policy={agg}")
        if sustained or transient:
            print(f"           sustained={sustained} transient={transient}")


def main() -> int:
    for study_id in ["PointCross", "PDS"]:
        print(f"\n{'='*70}")
        print(f"  {study_id} — algorithm-defensibility (CLAUDE.md rule 19)")
        print(f"{'='*70}")
        findings, dose_groups = _load_study(study_id)

        cached = _show_cached(study_id)
        _summarize(cached, "CACHED (master / BUG-031 baseline)")

        params = ScoringParams()
        rows_new = build_noael_summary(findings, dose_groups, params=params)
        _summarize(rows_new, "NEW PATH (Path C: F2 dispatch + AC-F1-9 migration + C2a per-dose + override gate)")

        # F1a top-level emission spot check
        endpoint_summary = build_endpoint_loael_summary(findings, dose_groups, params=params)
        n_endpoints = len({k.split("__")[0] for k in endpoint_summary})
        n_combined_keys = sum(1 for k in endpoint_summary if k.endswith("__Combined"))
        print(f"  F1a endpoint_loael_summary: {len(endpoint_summary)} (endpoint, sex) keys "
              f"across {n_endpoints} endpoints; {n_combined_keys} Combined-sex keys")

        # If a Combined NOAEL fired this run, show the most informative detail:
        # one example endpoint that drove LOAEL (firing dose + policy + position)
        for r in rows_new:
            if r["sex"] != "Combined":
                continue
            adv = (r.get("noael_derivation") or {}).get("adverse_findings_at_loael") or []
            if adv:
                print(f"  Combined LOAEL evidence sample: {adv[0].get('finding')} "
                      f"({adv[0].get('domain')}/{adv[0].get('specimen')}) "
                      f"p_value={adv[0].get('p_value')} "
                      f"finding_class={adv[0].get('finding_class')}")
            firing = (r.get("noael_derivation") or {}).get("firing_timepoint_position") or {}
            if firing:
                sample_keys = list(firing.keys())[:3]
                print(f"  firing_timepoint_position sample: {[(k, firing[k]) for k in sample_keys]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
