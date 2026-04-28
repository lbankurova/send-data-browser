#!/usr/bin/env python3
"""
capture-approval-baseline.py -- F4 Phase 1 baseline capture.

Reads the engine's generated output for a study and emits a schema-conforming
baseline.json snapshotting analytical conclusions (NOAEL/LOAEL per endpoint x sex,
adverse classification, target organs, syndrome detections, signal scores,
effect sizes, p-value adjustments, ECI dimensions) plus presentation metadata.

Per spec section 6 (lattice-framework-redesign-spec.md), the captured baseline
is what the F4 diff gate compares against on every algorithmic-paths commit.
A diff in the scientific block blocks the commit until a written rationale is
provided; presentation diffs auto-log.

Schema authority: backend/tests/approval-baselines/baseline.schema.json.
Validator: scripts/validate-approval-baseline.py (called before write).

Usage:
  python scripts/capture-approval-baseline.py PointCross
  python scripts/capture-approval-baseline.py PointCross --out custom/path.json
  python scripts/capture-approval-baseline.py PointCross --regenerate

Exit:
  0  baseline written and validated
  1  build / validation failure (file not written)
  2  source files missing or unreadable
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
GENERATED_DIR = ROOT / "backend" / "generated"
BASELINE_DIR = ROOT / "backend" / "tests" / "approval-baselines"
SCHEMA_VERSION = 1

def _load_validator():
    """Import validate-approval-baseline.py via importlib.util because the file
    name has hyphens and Python's import system can't handle that natively."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "validate_approval_baseline",
        ROOT / "scripts" / "validate-approval-baseline.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load validate-approval-baseline.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _read_json(path: Path) -> Any:
    if not path.exists():
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(2)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        sys.exit(2)


def _short_commit() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or "0000000"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "0000000"


def _finding_id(domain: str, test_code: str, specimen: str, sex: str, day: Any) -> str:
    """Schema-conforming 5-segment id: {domain}.{test_code}.{specimen}.{sex}.{day}.

    Empty segments are allowed by the regex `[^.]*`. Day may be an integer or null.
    Strings are kept verbatim; the regex doesn't constrain inner-segment characters
    other than disallowing `.`.
    """
    return f"{domain or ''}.{(test_code or '').replace('.', '_')}.{(specimen or '').replace('.', '_')}.{sex or ''}.{'' if day is None else day}"


def _endpoint_id(domain: str, test_code: str, specimen: str, sex: str) -> str:
    """Schema-conforming 4-segment id (no day) for noael_per_endpoint_sex.

    Format: '{domain}.{test_code}.{specimen}.{sex}'. Empty segments allowed by
    the regex `[^.]*`. Inner dots in test_code / specimen are replaced with
    underscores so the four-segment shape is preserved.
    """
    return f"{domain or ''}.{(test_code or '').replace('.', '_')}.{(specimen or '').replace('.', '_')}.{sex or ''}"


def _build_endpoint_index(findings: list[dict]) -> dict[tuple[str, str], tuple[str, str, str]]:
    """Map (endpoint_label, sex) -> (domain, test_code, specimen) from findings.

    endpoint_loael_summary keys are `{endpoint_label}__{sex}`. To produce a
    schema-conforming `{domain}.{test_code}.{specimen}.{sex}` NOAEL key, look
    up a representative finding with the same (label, sex) and read its
    domain/test_code/specimen. First match wins (deterministic given findings
    list order, which is preserved across captures of the same generated
    output).
    """
    idx: dict[tuple[str, str], tuple[str, str, str]] = {}
    for f in findings or []:
        label = f.get("endpoint_label")
        sex = f.get("sex")
        if not label or sex not in ("M", "F"):
            continue
        key = (label, sex)
        if key in idx:
            continue
        idx[key] = (
            f.get("domain") or "",
            f.get("test_code") or "",
            f.get("specimen") or "",
        )
    return idx


def _derive_noael_tier(by_dose_level: dict[str, dict], dose_labels: dict[int, str]) -> tuple[str, str | None, str | None]:
    """Map endpoint_loael_summary firing pattern -> (tier, value, loael).

    Rules (per spec section 6.1 + schema enum):
      - all `suspended: true`           -> insufficient_evidence
      - all `fired: false`              -> high (NOAEL = highest dose, no LOAEL)
      - lowest dose level fires         -> below_tested (NOAEL undefined; LOAEL = lowest)
      - first firing at dose N (>1)     -> low (NOAEL = dose label N-1; LOAEL = dose label N)

    `dose_labels` maps int dose_level -> short dose label (e.g. "20"). The function
    returns string labels (or None) so the JSON shape matches the schema.
    """
    if not by_dose_level:
        return "insufficient_evidence", None, None

    keys_int = sorted(int(k) for k in by_dose_level.keys())
    rows = [(lvl, by_dose_level[str(lvl)]) for lvl in keys_int]
    all_suspended = all(r["suspended"] for _, r in rows)
    if all_suspended:
        return "insufficient_evidence", None, None

    first_fired = next((lvl for lvl, r in rows if r["fired"]), None)
    if first_fired is None:
        # No dose fires -> NOAEL is the highest tested dose.
        highest = rows[-1][0]
        return "high", dose_labels.get(highest), None

    if first_fired == rows[0][0]:
        # Lowest tested dose fires -> NOAEL below tested range.
        return "below_tested", None, dose_labels.get(first_fired)

    prior = rows[rows.index((first_fired, by_dose_level[str(first_fired)])) - 1][0]
    return "low", dose_labels.get(prior), dose_labels.get(first_fired)


def _build_dose_label_map(dose_groups: list[dict]) -> dict[int, str]:
    """Map dose_level int -> short label, e.g. {0: '0', 1: '20', 2: '80'}.

    Uses dose_value when available, falls back to label trim; preserves a
    single string-formatted scalar so diffs are stable across captures.
    """
    out: dict[int, str] = {}
    for dg in dose_groups or []:
        lvl = dg.get("dose_level")
        if lvl is None:
            continue
        dose_value = dg.get("dose_value")
        if dose_value is not None:
            # Strip trailing .0 for integer doses to keep the baseline compact.
            if float(dose_value).is_integer():
                out[int(lvl)] = str(int(float(dose_value)))
            else:
                out[int(lvl)] = str(dose_value)
        else:
            out[int(lvl)] = (dg.get("label") or str(lvl)).strip()
    return out


def _classify_syndrome_certainty(distribution: dict[str, int]) -> str:
    """Map confidence_distribution (HIGH/MODERATE/LOW counts) -> schema enum.

    Schema enum: confirmed | likely | possible | uncertain.
    """
    if not distribution:
        return "uncertain"
    total = sum(int(v) for v in distribution.values())
    if total == 0:
        return "uncertain"
    high = int(distribution.get("HIGH", 0))
    moderate = int(distribution.get("MODERATE", 0))
    if high / total >= 0.5:
        return "confirmed"
    if (high + moderate) / total >= 0.5:
        return "likely"
    if (high + moderate) / total >= 0.2:
        return "possible"
    return "uncertain"


def _collect_syndromes(syndrome_path: Path) -> list[dict]:
    """Build syndrome_detections list from syndrome_rollup.json.

    Dedupes by (syndrome_id, organ_system) by summing n_subjects_total and
    union'ing confidence_distribution counts. Sorted by syndrome_id for stable
    serialization.
    """
    if not syndrome_path.exists():
        return []
    data = _read_json(syndrome_path)

    detections: dict[str, dict] = {}
    for entry in data.get("cross_organ_syndromes") or []:
        sid = entry.get("syndrome_id")
        if not sid:
            continue
        detections[sid] = {
            "syndrome_id": sid,
            "certainty": _classify_syndrome_certainty(entry.get("confidence_distribution") or {}),
            "evidence_count": int(entry.get("n_subjects_total") or 0),
            "species_required": entry.get("species_required"),
        }

    by_organ = data.get("by_organ") or {}
    for organ, entries in by_organ.items():
        for entry in entries or []:
            sid = entry.get("syndrome_id")
            if not sid:
                continue
            existing = detections.get(sid)
            new_count = int(entry.get("n_subjects_total") or 0)
            if existing is None:
                detections[sid] = {
                    "syndrome_id": sid,
                    "certainty": _classify_syndrome_certainty(entry.get("confidence_distribution") or {}),
                    "evidence_count": new_count,
                    "species_required": entry.get("species_required"),
                }
            else:
                existing["evidence_count"] += new_count

    return sorted(detections.values(), key=lambda r: r["syndrome_id"])


def build_baseline_dict(
    study_id: str,
    generated_dir: Path,
    *,
    captured_at: str | None = None,
    captured_against_commit: str | None = None,
) -> dict:
    """Build the full baseline dict from generated/{study} JSON outputs.

    Both capture and diff use this same builder so "current state" and
    "captured baseline" are constructed identically.
    """
    generated_dir = generated_dir.resolve()
    unified_path = generated_dir / "unified_findings.json"
    syndrome_path = generated_dir / "syndrome_rollup.json"

    unified = _read_json(unified_path)
    findings = unified.get("findings") or []
    summary = unified.get("summary") or {}
    dose_groups = unified.get("dose_groups") or []
    endpoint_loael = unified.get("endpoint_loael_summary") or {}

    dose_label_map = _build_dose_label_map(dose_groups)
    endpoint_lookup = _build_endpoint_index(findings)

    # noael_per_endpoint_sex -- per-sex (M/F) NOAEL keyed by 4-segment id.
    # Schema patternProperties requires `^[A-Z]+\\.[^.]*\\.[^.]*\\.[MF]$`, so:
    #   - "Combined" sex entries are filtered (the engine emits per-sex-aggregated
    #     NOAELs in addition to M/F, but the schema's per-endpoint-sex contract
    #     is M/F-only; aggregated values are reproducible from the per-sex pair).
    #   - endpoint_class values that are not pure uppercase letters
    #     ("LB-multi", "LB-single", "OTHER") are normalized by stripping non-
    #     [A-Z] characters and uppercasing. The lookup falls back to the
    #     finding's `domain` field, which IS pure uppercase by SEND convention.
    noael: dict[str, dict] = {}
    for els_key, els_row in endpoint_loael.items():
        if "__" not in els_key:
            continue
        endpoint_label, _, sex = els_key.rpartition("__")
        if sex not in ("M", "F"):
            continue  # skip "Combined" -- not in schema's [MF]$ regex
        domain, test_code, specimen = endpoint_lookup.get(
            (endpoint_label, sex),
            (
                "".join(c for c in (els_row.get("endpoint_class") or "") if c.isalpha()).upper(),
                endpoint_label,
                "",
            ),
        )
        eid = _endpoint_id(domain, test_code, specimen, sex)
        tier, value, loael_label = _derive_noael_tier(els_row.get("by_dose_level") or {}, dose_label_map)
        noael[eid] = {"tier": tier, "value": value, "loael": loael_label}

    # Per-finding maps. The schema permits empty objects; sparse fields stay sparse.
    adverse_class: dict[str, dict] = {}
    signal_scores: dict[str, Any] = {}
    effect_sizes: dict[str, Any] = {}
    p_adj: dict[str, Any] = {}
    eci_dims: dict[str, dict] = {}

    for f in findings:
        fid = _finding_id(
            f.get("domain") or "",
            f.get("test_code") or "",
            f.get("specimen") or "",
            f.get("sex") or "",
            f.get("day"),
        )
        adverse_class[fid] = {
            "verdict": f.get("verdict"),
            "treatment_related": f.get("treatment_related"),
            "severity": f.get("severity"),
        }
        # Engine emits max_effect_size / min_p_adj on every finding; signal_score
        # and ECI dimensions are NOT in unified_findings today. Capture what
        # exists; leave the others empty so future engine additions land
        # transparently in the next baseline capture.
        if "signal_score" in f:
            signal_scores[fid] = f.get("signal_score")
        effect_sizes[fid] = f.get("max_effect_size")
        p_adj[fid] = f.get("min_p_adj")
        eci = {k: f.get(k) for k in ("D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9") if k in f}
        if eci:
            eci_dims[fid] = eci

    # Sorted serialization for stable diffs (jsonse is already sorted by default
    # via sort_keys, but we sort lists explicitly).
    target_organs = sorted({str(o) for o in (summary.get("target_organs") or []) if o})
    syndrome_detections = _collect_syndromes(syndrome_path)

    captured_at = captured_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    captured_against_commit = captured_against_commit or _short_commit()

    return {
        "schema_version": SCHEMA_VERSION,
        "study_id": study_id,
        "captured_at": captured_at,
        "captured_against_commit": captured_against_commit,
        "captured_from": str((generated_dir / "unified_findings.json").relative_to(ROOT)).replace("\\", "/"),
        "captured_by": "scripts/capture-approval-baseline.py",
        "scientific": {
            "summary_counts": {
                "total_findings": int(summary.get("total_findings") or 0),
                "total_adverse": int(summary.get("total_adverse") or 0),
                "total_warning": int(summary.get("total_warning") or 0),
                "total_normal": int(summary.get("total_normal") or 0),
                "total_treatment_related": int(summary.get("total_treatment_related") or 0),
            },
            "noael_per_endpoint_sex": noael,
            "adverse_classification": adverse_class,
            "target_organs": target_organs,
            "syndrome_detections": syndrome_detections,
            "signal_scores": signal_scores,
            "effect_sizes": effect_sizes,
            "p_value_adjustments": p_adj,
            "eci_dimensions": eci_dims,
        },
        "presentation": {
            "labels": {},
            "format_strings": {},
            "bundle_artifacts": {},
        },
    }


def _maybe_regenerate(study_id: str) -> None:
    """Run the engine generator for this study before capture (--regenerate)."""
    print(f"  Regenerating {study_id} via generator...", flush=True)
    cmd = [
        str(ROOT / "backend" / "venv" / "Scripts" / "python.exe"),
        "-m",
        "generator.generate",
        study_id,
    ]
    res = subprocess.run(cmd, cwd=str(ROOT / "backend"))
    if res.returncode != 0:
        print(f"ERROR: regeneration failed (exit {res.returncode})", file=sys.stderr)
        sys.exit(2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Capture an approval-test baseline for a study (F4 Phase 1).",
    )
    parser.add_argument("study_id", help="Study identifier matching backend/generated/{study_id}/.")
    parser.add_argument("--out", help="Output path. Default: backend/tests/approval-baselines/{study}/baseline.json.")
    parser.add_argument("--regenerate", action="store_true",
                        help="Run the engine generator before capture (slow; explicit opt-in).")
    parser.add_argument("--stdout", action="store_true",
                        help="Write JSON to stdout instead of disk (for tests / piping).")
    args = parser.parse_args(argv)

    generated_dir = GENERATED_DIR / args.study_id
    if not generated_dir.exists():
        print(f"ERROR: {generated_dir} does not exist. "
              f"Run the generator first or pass --regenerate.", file=sys.stderr)
        return 2

    if args.regenerate:
        _maybe_regenerate(args.study_id)

    baseline = build_baseline_dict(args.study_id, generated_dir)

    # Validate before write. A capture that doesn't conform to the schema is
    # a defect -- refuse to land it.
    validator = _load_validator()
    schema = json.loads((ROOT / "backend" / "tests" / "approval-baselines" / "baseline.schema.json").read_text(encoding="utf-8"))
    errors = validator.validate(baseline, schema)
    if errors:
        print(f"ERROR: built baseline does not conform to schema ({len(errors)} violation(s)):", file=sys.stderr)
        for e in errors[:20]:
            print(f"  - {e}", file=sys.stderr)
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more", file=sys.stderr)
        return 1

    payload = json.dumps(baseline, indent=2, sort_keys=True, default=str) + "\n"

    if args.stdout:
        sys.stdout.write(payload)
        return 0

    out_path = Path(args.out) if args.out else (BASELINE_DIR / args.study_id / "baseline.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(payload, encoding="utf-8")

    print(f"OK: wrote {out_path}")
    print(f"     study_id={args.study_id}  total_findings={baseline['scientific']['summary_counts']['total_findings']}")
    print(f"     n_noael={len(baseline['scientific']['noael_per_endpoint_sex'])}  n_syndromes={len(baseline['scientific']['syndrome_detections'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
