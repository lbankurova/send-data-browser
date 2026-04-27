#!/usr/bin/env python3
"""JSON-canonical diff for unified_findings.json (AC-CARD-7 byte-equality).

Compares two unified_findings.json files (typically: pre-cycle snapshot vs
post-cycle regen). Supports `--ignore-key` to mask out keys that are
expected to differ (e.g. newly-added optional keys like `heterogeneity`).

Exit codes:
  0  -- no differences (or only differences in ignored keys)
  1  -- differences detected outside the ignore list
  2  -- I/O / parse error

Usage:
  python scripts/diff-unified-findings.py SNAPSHOT.json GENERATED.json \
    [--ignore-key heterogeneity] [--ignore-key other_key] [--quiet]
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def _strip(obj: Any, ignore_keys: set[str]) -> Any:
    """Recursively remove `ignore_keys` from any dict at any depth."""
    if isinstance(obj, dict):
        return {k: _strip(v, ignore_keys) for k, v in obj.items() if k not in ignore_keys}
    if isinstance(obj, list):
        return [_strip(x, ignore_keys) for x in obj]
    return obj


def _canon(obj: Any) -> str:
    """Canonical JSON: sorted keys, no whitespace, stable float repr."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _walk(prefix: str, a: Any, b: Any, deltas: list[str]) -> None:
    """Collect human-readable per-path differences."""
    if isinstance(a, dict) and isinstance(b, dict):
        keys = sorted(set(a.keys()) | set(b.keys()))
        for k in keys:
            sub = f"{prefix}.{k}" if prefix else k
            if k not in a:
                deltas.append(f"+ {sub}")
            elif k not in b:
                deltas.append(f"- {sub}")
            else:
                _walk(sub, a[k], b[k], deltas)
        return
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            deltas.append(f"~ {prefix}  list length {len(a)} -> {len(b)}")
            return
        for i, (x, y) in enumerate(zip(a, b)):
            _walk(f"{prefix}[{i}]", x, y, deltas)
        return
    if a != b:
        deltas.append(f"~ {prefix}  {a!r} -> {b!r}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("snapshot", help="Pre-cycle baseline JSON")
    ap.add_argument("generated", help="Post-cycle regenerated JSON")
    ap.add_argument(
        "--ignore-key",
        action="append",
        default=[],
        help="Strip this key from both sides before comparing (repeatable)",
    )
    ap.add_argument("--quiet", action="store_true", help="Suppress delta listing on diff")
    args = ap.parse_args()

    try:
        with open(args.snapshot, encoding="utf-8") as f:
            a = json.load(f)
        with open(args.generated, encoding="utf-8") as f:
            b = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERROR: failed to load JSON: {e}", file=sys.stderr)
        return 2

    ignore = set(args.ignore_key)
    if ignore:
        a = _strip(a, ignore)
        b = _strip(b, ignore)

    if _canon(a) == _canon(b):
        print("OK: no differences (after ignore-key strip)" if ignore else "OK: byte-equal")
        return 0

    deltas: list[str] = []
    _walk("", a, b, deltas)

    print(f"DIFF: {len(deltas)} delta(s)" + (f" (ignoring keys: {sorted(ignore)})" if ignore else ""))
    if not args.quiet:
        for d in deltas[:200]:
            print(d)
        if len(deltas) > 200:
            print(f"... and {len(deltas) - 200} more")
    return 1


if __name__ == "__main__":
    sys.exit(main())
