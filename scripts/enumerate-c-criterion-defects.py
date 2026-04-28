"""DATA-GAP-NOAEL-ALG-22 Phase 1 — pattern enumeration across corpus.

Scans unified_findings.json for findings matching the four-axis defect
taxonomy from `distillations/noael-alg-c-criterion-coherence.md`:

- **Axis 2 (biphasic):** per-dose pairwise effects sign-flipping across doses.
  Finding-level `direction` inference is unreliable; C1's direction-match
  guard becomes a noise filter.
- **Axis 3 (registry-contract violation):** finding direction non-canonical
  for endpoint class, fc=tr_adverse, and the algorithm fires LOAEL via
  C1-C5 without the registry-mandated corroboration check.

Per-study columns: study, sex, finding (domain/endpoint), direction,
fc, per-dose effect signature, fires_loael (T/F), defect-axis classification,
defensibility note.

Run:
    cd backend && C:/pg/pcc/backend/venv/Scripts/python.exe ../scripts/enumerate-c-criterion-defects.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from generator.view_dataframes import _is_loael_driving_woe  # noqa: E402
from services.analysis.endpoint_adverse_direction import (  # noqa: E402
    corroboration_triggers,
    lookup_endpoint_class,
    primary_adverse_direction,
)


STUDIES = ["PointCross", "Nimble", "PDS"]
GENERATED_DIR = ROOT / "backend" / "generated"


def load_findings(study: str) -> list[dict]:
    path = GENERATED_DIR / study / "unified_findings.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [f for f in data.get("findings", []) if not f.get("is_derived")]


def per_dose_signs(finding: dict) -> list[str]:
    """Compact per-dose direction signature: '+', '-', '0' per pairwise."""
    out = []
    for pw in sorted(finding.get("pairwise", []), key=lambda x: x.get("dose_level", 0)):
        e = pw.get("effect_size")
        if e is None:
            out.append("?")
        elif e > 0:
            out.append("+")
        elif e < 0:
            out.append("-")
        else:
            out.append("0")
    return out


def is_biphasic(finding: dict) -> bool:
    """Axis 2: per-dose pairwise effects span both signs (excluding zeros)."""
    signs = [s for s in per_dose_signs(finding) if s in ("+", "-")]
    return "+" in signs and "-" in signs


def is_non_canonical_direction(finding: dict) -> tuple[bool, str | None, str | None]:
    """Axis 3 first-half check: finding direction non-canonical for endpoint class
    AND class declares bidirectional corroboration triggers.

    Returns (is_non_canonical, endpoint_class, primary_direction).
    """
    direction = finding.get("direction")
    if direction not in ("up", "down"):
        return (False, None, None)
    ep_class = lookup_endpoint_class(
        finding.get("endpoint_label"),
        send_domain=finding.get("domain"),
    )
    primary = primary_adverse_direction(ep_class)
    if primary not in ("up", "down"):
        return (False, ep_class, primary)
    if direction == primary:
        return (False, ep_class, primary)
    triggers = corroboration_triggers(ep_class)
    if not triggers:
        return (False, ep_class, primary)
    return (True, ep_class, primary)


def fires_loael_at_any_dose(finding: dict, sex_findings: list[dict] | None = None) -> list[int]:
    """Return list of dose levels where _is_loael_driving_woe returns True
    using the same gate the algorithm uses. With sex_findings the C7 path
    is plumbed; without, the back-compat path runs.
    """
    fires = []
    n_per_group = 10  # default; algorithm uses per-study but for enumeration this suffices
    threshold = 0.30
    for pw in finding.get("pairwise", []):
        dl = pw.get("dose_level")
        if dl is None or dl <= 0:
            continue
        kw = {"sex_findings": sex_findings} if sex_findings is not None else {}
        if _is_loael_driving_woe(finding, dl, n_per_group, threshold, **kw):
            fires.append(dl)
    return sorted(fires)


def enumerate_study(study: str) -> dict:
    findings = load_findings(study)
    print(f"\n=== {study} ({len(findings)} findings) ===")

    axis2_candidates = []  # biphasic
    axis3_candidates = []  # registry-contract violation
    for f in findings:
        signs = per_dose_signs(f)
        biphasic = is_biphasic(f)
        non_canonical, ep_class, primary = is_non_canonical_direction(f)
        fc = f.get("finding_class")

        if biphasic:
            # Bound by sex_findings of same sex for accurate C7 evaluation
            sex = f.get("sex")
            sex_findings = [x for x in findings if x.get("sex") == sex]
            fires = fires_loael_at_any_dose(f, sex_findings=sex_findings)
            axis2_candidates.append({
                "study": study,
                "domain": f.get("domain"),
                "endpoint": f.get("endpoint_label") or f.get("finding"),
                "sex": f.get("sex"),
                "day": f.get("day"),
                "direction": f.get("direction"),
                "fc": fc,
                "per_dose_signs": "".join(signs),
                "fires_at": fires,
            })

        if non_canonical and fc == "tr_adverse":
            sex = f.get("sex")
            sex_findings = [x for x in findings if x.get("sex") == sex]
            fires = fires_loael_at_any_dose(f, sex_findings=sex_findings)
            if fires:  # actually fires C1-C5
                axis3_candidates.append({
                    "study": study,
                    "domain": f.get("domain"),
                    "endpoint": f.get("endpoint_label") or f.get("finding"),
                    "sex": f.get("sex"),
                    "day": f.get("day"),
                    "endpoint_class": ep_class,
                    "primary_direction": primary,
                    "finding_direction": f.get("direction"),
                    "fc": fc,
                    "per_dose_signs": "".join(signs),
                    "fires_at": fires,
                })

    print(f"  Axis 2 (biphasic): {len(axis2_candidates)}")
    print(f"  Axis 3 (non-canonical + tr_adverse + fires): {len(axis3_candidates)}")

    return {
        "study": study,
        "n_findings": len(findings),
        "axis2": axis2_candidates,
        "axis3": axis3_candidates,
    }


def main() -> None:
    results = [enumerate_study(s) for s in STUDIES]

    # Print summary table
    print("\n=== Summary ===")
    print(f"{'Study':<12} {'Findings':>10} {'Axis2':>8} {'Axis3':>8}")
    for r in results:
        print(f"{r['study']:<12} {r['n_findings']:>10} {len(r['axis2']):>8} {len(r['axis3']):>8}")

    # Detailed dump for report writing
    out_path = ROOT / "scripts" / "data" / "c-criterion-defect-enumeration.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results written to {out_path}")


if __name__ == "__main__":
    main()
