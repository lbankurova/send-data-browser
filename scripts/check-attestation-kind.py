#!/usr/bin/env python3
"""
check-attestation-kind.py -- read a SIMPLIFY-1 review-gate.json and verify it
carries at least one attestation of a required kind (and optionally a required
ref).

Used by:
  - F3 pre-commit step (kind=peer-review when staged paths match algo regex)
  - F6 pre-commit step (kind=bug-pattern when staged paths match a registered
    pattern's applies_to glob)  [next commit]
  - F7 pre-commit step (kind=retro-action when commit is fix: with Bug-Retro
    trailer)  [next commit]

The validator is shared so the rule for "what makes an attestation count" lives
in one place. Per spec §15.1 (SIMPLIFY-1), each attestation kind has its own
specific check; this script implements the common shape (count + optional
ref filter) used by all three F-features that produce attestations.

Usage:
  python scripts/check-attestation-kind.py --gate <path> --kind <kind>
  python scripts/check-attestation-kind.py --gate <path> --kind peer-review --min 1
  python scripts/check-attestation-kind.py --gate <path> --kind bug-pattern --ref multi-timepoint-kitchen-sink-aggregation
  python scripts/check-attestation-kind.py --gate <path> --kind retro-action --ref-prefix BUG-031

Exit:
  0  required attestation(s) present
  1  missing or count below --min
  2  gate file unreadable / malformed
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify a review-gate.json carries an attestation of the required kind.",
    )
    parser.add_argument("--gate", required=True, help="Path to review-gate.json")
    parser.add_argument("--kind", required=True, help="Required attestation kind (e.g. peer-review)")
    parser.add_argument("--ref", help="Optional exact-match ref filter")
    parser.add_argument("--ref-prefix", help="Optional ref prefix filter (e.g. BUG-031 matches BUG-031#5)")
    parser.add_argument("--min", type=int, default=1, help="Minimum count of matching attestations (default: 1)")
    parser.add_argument("--quiet", action="store_true", help="Suppress success output (for hook-step embedding)")
    args = parser.parse_args()

    gate_path = Path(args.gate)
    if not gate_path.exists():
        print(f"FAIL: gate file not found: {gate_path}", file=sys.stderr)
        return 2
    try:
        with open(gate_path, "r", encoding="utf-8") as fh:
            gate = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot read gate {gate_path}: {exc}", file=sys.stderr)
        return 2

    attestations = gate.get("attestations") or []
    if not isinstance(attestations, list):
        print(f"FAIL: gate.attestations is not a list (got {type(attestations).__name__})", file=sys.stderr)
        return 2

    matches = []
    for entry in attestations:
        if not isinstance(entry, dict):
            continue
        if entry.get("kind") != args.kind:
            continue
        ref = entry.get("ref", "") if isinstance(entry.get("ref"), str) else ""
        if args.ref is not None and ref != args.ref:
            continue
        if args.ref_prefix is not None and not ref.startswith(args.ref_prefix):
            continue
        matches.append(entry)

    if len(matches) < args.min:
        filter_desc = f"kind={args.kind}"
        if args.ref:
            filter_desc += f" ref={args.ref}"
        if args.ref_prefix:
            filter_desc += f" ref-prefix={args.ref_prefix}"
        print(
            f"FAIL: gate carries {len(matches)} matching attestation(s) "
            f"({filter_desc}); minimum {args.min} required",
            file=sys.stderr,
        )
        return 1

    if not args.quiet:
        print(f"PASS: {len(matches)} matching attestation(s) for kind={args.kind}")
        for m in matches:
            print(f"  - ref={m.get('ref')} verdict={m.get('verdict')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
