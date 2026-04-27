#!/usr/bin/env python3
"""Audit: verify syndrome_rollup.json byte-equal to a fresh rebuild.

Per gap-288-stage2-noael-synthesis-spec.md Section 3.2:
    Acceptance: `python scripts/audit-syndrome-rollup.py` (new) confirms
    rollup matches per-subject re-aggregation byte-for-byte.

Usage:
    python scripts/audit-syndrome-rollup.py              # all studies under backend/generated
    python scripts/audit-syndrome-rollup.py PointCross   # one study
    python scripts/audit-syndrome-rollup.py PointCross Nimble

Exit code: 0 on every-study match; 1 on any mismatch or missing input.

The byte-equal check normalizes the `meta.generated` timestamp (which is
set per-call) before comparison; everything else must match exactly.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow importing from backend/
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from generator.syndrome_rollup import build_syndrome_rollup
from services.analysis.sanitize import sanitize


GENERATED = ROOT / "backend" / "generated"

REQUIRED_INPUTS = (
    "subject_syndromes.json",
    "subject_context.json",
    "noael_summary.json",
)
OPTIONAL_INPUTS = (
    "study_mortality.json",
    "recovery_verdicts.json",
)


def load_or_none(path: Path):
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


def normalize(payload: dict) -> dict:
    """Drop the per-call timestamp before comparison."""
    out = json.loads(json.dumps(payload, sort_keys=True))
    if "meta" in out and "generated" in out["meta"]:
        out["meta"]["generated"] = "<NORMALIZED>"
    return out


VERDICT_OK = "OK"
VERDICT_SKIP = "SKIP"
VERDICT_FAIL = "FAIL"


def audit_study(study: str) -> tuple[str, str]:
    base = GENERATED / study
    if not base.exists():
        return VERDICT_SKIP, f"directory not found: {base}"

    missing = [n for n in REQUIRED_INPUTS if not (base / n).exists()]
    if missing:
        # No syndrome data generated upstream -- not an audit failure, just nothing to check.
        return VERDICT_SKIP, f"missing inputs: {', '.join(missing)}"

    on_disk_path = base / "syndrome_rollup.json"
    if not on_disk_path.exists():
        # Inputs are present but the rollup file is not -- a study that was
        # generated against the old generator (pre-syndrome_rollup) won't have
        # the file. CI must FAIL on this so partially-migrated corpora don't
        # silently pass; re-run `python -m generator.generate <study>` to
        # produce the rollup. Studies missing upstream inputs are SKIP-ed
        # earlier in this function.
        return VERDICT_FAIL, "syndrome_rollup.json missing -- regenerate study"

    on_disk = load_or_none(on_disk_path)
    rebuilt = build_syndrome_rollup(
        subject_syndromes=load_or_none(base / "subject_syndromes.json"),
        subject_context=load_or_none(base / "subject_context.json"),
        noael_summary=load_or_none(base / "noael_summary.json"),
        mortality=load_or_none(base / OPTIONAL_INPUTS[0]),
        recovery_verdicts=load_or_none(base / OPTIONAL_INPUTS[1]),
    )
    rebuilt = json.loads(json.dumps(sanitize(rebuilt)))

    if normalize(on_disk) == normalize(rebuilt):
        return VERDICT_OK, "match"

    # Find the first divergence for diagnostics
    a = normalize(on_disk)
    b = normalize(rebuilt)
    diff = []
    for key in sorted(set(a.keys()) | set(b.keys())):
        if a.get(key) != b.get(key):
            diff.append(key)
    return VERDICT_FAIL, f"diff in keys: {', '.join(diff[:5]) or 'unknown'}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit syndrome_rollup.json byte-equality")
    parser.add_argument("studies", nargs="*", help="Study IDs (default: all under backend/generated)")
    args = parser.parse_args()

    if args.studies:
        studies = args.studies
    else:
        studies = sorted(p.name for p in GENERATED.iterdir() if p.is_dir() and not p.name.startswith("."))

    counts = {VERDICT_OK: 0, VERDICT_SKIP: 0, VERDICT_FAIL: 0}
    for s in studies:
        verdict, msg = audit_study(s)
        counts[verdict] += 1
        print(f"  [{verdict:4s}] {s}: {msg}")

    print()
    print(
        f"OK={counts[VERDICT_OK]}  SKIP={counts[VERDICT_SKIP]}  "
        f"FAIL={counts[VERDICT_FAIL]}  total={len(studies)}"
    )
    if counts[VERDICT_FAIL]:
        print(f"FAIL: {counts[VERDICT_FAIL]} studies mismatched on-disk vs rebuild.")
        return 1
    if counts[VERDICT_OK] == 0:
        # No matches and no failures means no data was checked -- treat as caller error.
        print("FAIL: no studies had syndrome_rollup.json on disk to verify.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
