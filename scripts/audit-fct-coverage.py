#!/usr/bin/env python
"""Audit FCT registry coverage — per-species, per-domain, per-provenance.

AC-F2-3: emits `backend/generated/fct-coverage-report.json` summarising
coverage tiers. CI compares this file against the committed baseline; any
drift requires reviewer acknowledgement.

Usage: python scripts/audit-fct-coverage.py
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from services.analysis import fct_registry  # noqa: E402

OUT = BACKEND / "generated" / "fct-coverage-report.json"


def band_populated(band: dict) -> bool:
    if not isinstance(band, dict):
        return False
    return any(
        band.get(k) is not None
        for k in ("variation_ceiling", "concern_floor", "adverse_floor", "strong_adverse_floor")
    )


def audit() -> dict:
    entries = fct_registry.iter_entries()
    joint_rules = fct_registry.iter_joint_rules()

    by_domain: dict[str, int] = defaultdict(int)
    by_coverage: dict[str, int] = defaultdict(int)
    by_provenance: dict[str, int] = defaultdict(int)
    by_reliability: dict[str, int] = defaultdict(int)

    species_populated: dict[str, int] = defaultdict(int)
    species_null: dict[str, int] = defaultdict(int)
    species_by_domain: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    # AC-F2-3 cross-tab: entries per coverage tier per species.
    coverage_by_species: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    per_entry_coverage: list[dict] = []

    for key, entry in entries:
        parts = key.split(".")
        domain = parts[0] if parts else "UNKNOWN"
        by_domain[domain] += 1
        coverage = entry.get("coverage", "unknown")
        by_coverage[coverage] += 1
        provenance = entry.get("provenance", "unknown")
        by_provenance[provenance] += 1
        reliability = entry.get("threshold_reliability") or "unspecified"
        by_reliability[reliability] += 1

        bands = entry.get("bands") or {}
        populated_species = []
        null_species = []
        for species_key, band in bands.items():
            if band_populated(band):
                populated_species.append(species_key)
                species_populated[species_key] += 1
                species_by_domain[species_key][domain] += 1
                # Per-species view: this species is populated at the entry's
                # coverage tier. Populated species contribute to the entry's
                # reported coverage.
                coverage_by_species[coverage][species_key] += 1
            else:
                null_species.append(species_key)
                species_null[species_key] += 1
                # Null band for this species means the entry does NOT cover
                # this species numerically — classifier emits provisional.
                coverage_by_species["none_for_species"][species_key] += 1

        per_entry_coverage.append({
            "entry_ref": key,
            "domain": domain,
            "coverage": coverage,
            "provenance": provenance,
            "threshold_reliability": reliability,
            "nhp_tier": entry.get("nhp_tier"),
            "populated_species": sorted(populated_species),
            "null_species": sorted(null_species),
        })

    joint_rule_provenance: dict[str, int] = defaultdict(int)
    for _, rule in joint_rules:
        joint_rule_provenance[rule.get("provenance", "unknown")] += 1

    return {
        "_meta": {
            "registry_fingerprint": fct_registry.content_fingerprint(),
            "entry_count": len(entries),
            "joint_rule_count": len(joint_rules),
        },
        "entries_by_domain": dict(by_domain),
        "entries_by_coverage": dict(by_coverage),
        "entries_by_provenance": dict(by_provenance),
        "entries_by_reliability": dict(by_reliability),
        "species_populated": dict(species_populated),
        "species_null": dict(species_null),
        "species_by_domain": {k: dict(v) for k, v in species_by_domain.items()},
        # AC-F2-3 cross-tab: {coverage_tier: {species: count}}.
        # 'none_for_species' rows count species whose entry has null bands
        # for that species regardless of entry-level coverage label.
        "coverage_by_species": {k: dict(v) for k, v in coverage_by_species.items()},
        "joint_rules_by_provenance": dict(joint_rule_provenance),
        "per_entry": per_entry_coverage,
    }


def main() -> int:
    report = audit()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, sort_keys=True)
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"  entries: {report['_meta']['entry_count']}")
    print(f"  coverage: {report['entries_by_coverage']}")
    print(f"  provenance: {report['entries_by_provenance']}")
    print(f"  species populated: {report['species_populated']}")
    print(f"  species null: {report['species_null']}")
    print(f"  coverage_by_species: {report['coverage_by_species']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
