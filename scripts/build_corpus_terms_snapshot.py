"""Build the SENDEX corpus terms snapshot.

Reads every backend/generated/<study>/unified_findings.json file present on
disk, extracts MI/MA/CL `test_name` values (the actual finding name -- not
the composite test_code, which contains the specimen prefix for MI/MA),
computes each study's unified_findings.json sha256, and writes
scripts/data/sendex_corpus_terms_snapshot.json.

Schema (AC-1.10 N4):

    {
      "generated_at": "<ISO>",
      "studies": [
        {"study_id": "<id>", "unified_findings_sha256": "<hex>"}
      ],
      "domains": {
        "MI": ["<raw>", ...],
        "MA": ["<raw>", ...],
        "CL": ["<raw>", ...]
      }
    }

The dictionary build script (`build_synonym_dictionary.py --corpus-snapshot`)
reads this snapshot to compute resolved/unresolved breakdowns and to fail-fast
when the snapshot is stale.

Run:
    python scripts/build_corpus_terms_snapshot.py \\
        --generated backend/generated \\
        --out scripts/data/sendex_corpus_terms_snapshot.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GENERATED = REPO_ROOT / "backend" / "generated"
DEFAULT_OUT = REPO_ROOT / "scripts" / "data" / "sendex_corpus_terms_snapshot.json"

SCOPED_DOMAINS = ("MI", "MA", "CL")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_snapshot(generated_dir: Path) -> dict:
    """Walk every study directory and collect MI/MA/CL test_name values."""
    studies: list[dict] = []
    domains_terms: dict[str, set[str]] = {d: set() for d in SCOPED_DOMAINS}

    if not generated_dir.exists():
        print(
            f"WARN: generated directory {generated_dir} not found; "
            f"writing empty snapshot",
            file=sys.stderr,
        )
        return _empty_snapshot()

    for study_path in sorted(generated_dir.iterdir()):
        if not study_path.is_dir():
            continue
        unified_path = study_path / "unified_findings.json"
        if not unified_path.exists():
            continue
        try:
            with open(unified_path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(
                f"WARN: skipping {study_path.name}: failed to read "
                f"unified_findings.json: {e}",
                file=sys.stderr,
            )
            continue
        study_record = {
            "study_id": study_path.name,
            "unified_findings_sha256": _sha256(unified_path),
        }
        studies.append(study_record)

        for f in data.get("findings", []):
            domain = f.get("domain")
            if domain not in SCOPED_DOMAINS:
                continue
            # MI/MA: the actual finding name lives in test_name; test_code
            # is the composite "{specimen}_{test_name}" produced by the
            # generator. CL: test_name == test_code (no specimen).
            raw = f.get("test_name") or ""
            raw = raw.strip().upper()
            if raw:
                domains_terms[domain].add(raw)

    return {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
        "studies": studies,
        "domains": {d: sorted(domains_terms[d]) for d in SCOPED_DOMAINS},
    }


def _empty_snapshot() -> dict:
    return {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
        "studies": [],
        "domains": {d: [] for d in SCOPED_DOMAINS},
    }


def write_snapshot(snapshot: dict, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(snapshot, f, indent=2, sort_keys=False, ensure_ascii=True)
        f.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the SENDEX corpus terms snapshot"
    )
    parser.add_argument(
        "--generated",
        type=Path,
        default=DEFAULT_GENERATED,
        help="Generated studies directory (default: backend/generated/)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=(
            "Output snapshot path "
            "(default: scripts/data/sendex_corpus_terms_snapshot.json)"
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    snapshot = build_snapshot(args.generated)
    write_snapshot(snapshot, args.out)
    print(
        f"Wrote {args.out} with {len(snapshot['studies'])} studies; "
        f"MI={len(snapshot['domains']['MI'])}, "
        f"MA={len(snapshot['domains']['MA'])}, "
        f"CL={len(snapshot['domains']['CL'])}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
