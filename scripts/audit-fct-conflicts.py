#!/usr/bin/env python
"""Audit FCT registry for provenance conflicts — RG-SMT-BP-03 tooling.

Enumerates same-(endpoint, species) entries whose species-band provenance
disagrees with the entry-level provenance or where source-ref types mix
regulatory + best_practice + industry_survey for the same species. Humans
review the flagged rows and decide whether to harmonise or document the
conflict explicitly in the entry notes.

Phase A registry has zero conflicts (all entries carry consistent provenance
hierarchies). Future cycles that expand the registry with disagreeing sources
(e.g., FDA 2009 Hy's Law threshold vs CIOMS DILI threshold) will surface
here.

Usage: python scripts/audit-fct-conflicts.py
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
from services.analysis.fct_registry import provenance_rank  # noqa: E402

OUT = BACKEND / "generated" / "fct-conflicts-report.json"


def audit() -> dict:
    conflicts: list[dict] = []

    for key, entry in fct_registry.iter_entries():
        entry_provenance = entry.get("provenance")
        bands = entry.get("bands") or {}

        # Per-species provenance conflict: species band provenance stronger
        # than the entry-level provenance (entry-level is supposed to be the
        # weakest-of; if a band is stronger, the entry-level is correctly
        # the weakest — no conflict. But if a band is WEAKER than entry-level,
        # the entry-level is mis-declared.)
        for species_key, band in bands.items():
            band_provenance = band.get("provenance") if isinstance(band, dict) else None
            if band_provenance and entry_provenance:
                # weaker-of expectation: entry-level rank >= every band rank.
                if provenance_rank(band_provenance) < provenance_rank(entry_provenance):
                    # Band is STRONGER than entry-level — that is expected
                    # (entry-level is weakest-of).
                    continue
                if provenance_rank(band_provenance) > provenance_rank(entry_provenance):
                    conflicts.append({
                        "type": "entry_weaker_than_band",
                        "entry_ref": key,
                        "species": species_key,
                        "entry_provenance": entry_provenance,
                        "band_provenance": band_provenance,
                        "note": (
                            "Entry-level provenance is weaker than this species band. "
                            "Registry convention: entry-level is the weakest-of across "
                            "species, so a weaker entry-level with a stronger band is "
                            "expected. Flagged only for audit visibility."
                        ),
                    })

        # source_refs heterogeneity: same entry cites sources of mixed tiers.
        refs = entry.get("source_refs") or []
        ref_types = {r.get("type") for r in refs if isinstance(r, dict)}
        authoritative_tiers = ref_types & {"regulatory", "published", "industry_survey", "expert_consensus"}
        if len(authoritative_tiers) >= 2 and "regulatory" in authoritative_tiers:
            # Regulatory + non-regulatory sources cited together — not a conflict
            # per se, but surfaces for human review (F-R12 recency-vs-tier tiebreaker).
            conflicts.append({
                "type": "mixed_source_tiers",
                "entry_ref": key,
                "source_types": sorted(authoritative_tiers),
                "note": (
                    "Entry cites sources across multiple authoritative tiers. "
                    "Per fct-methodology.md tiebreaker: newer regulatory wins "
                    "over older; species-specific wins over cross-species. "
                    "Confirm the entry-level provenance reflects the winning source."
                ),
            })

    # Joint rules: cross-file provenance consistency.
    for name, rule in fct_registry.iter_joint_rules():
        rule_prov = rule.get("provenance")
        if not rule_prov:
            continue
        # If a joint rule is tagged "regulatory" but its source_refs contain
        # zero regulatory-type citations, flag it.
        refs = rule.get("source_refs") or []
        types = {r.get("type") for r in refs if isinstance(r, dict)}
        if rule_prov == "regulatory" and "regulatory" not in types:
            conflicts.append({
                "type": "joint_rule_provenance_unsubstantiated",
                "joint_rule": name,
                "provenance": rule_prov,
                "source_types": sorted(types),
                "note": (
                    "Joint rule claims 'regulatory' provenance but no source_ref "
                    "is tagged type='regulatory'. Verify the citation or downgrade "
                    "provenance."
                ),
            })

    return {
        "_meta": {
            "registry_fingerprint": fct_registry.content_fingerprint(),
            "entry_count": len(fct_registry.iter_entries()),
            "joint_rule_count": len(fct_registry.iter_joint_rules()),
            "conflict_count": len(conflicts),
        },
        "conflicts": conflicts,
    }


def main() -> int:
    report = audit()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, sort_keys=True)
    n = report["_meta"]["conflict_count"]
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"  conflicts: {n}")
    if n:
        for c in report["conflicts"]:
            print(f"  - [{c['type']}] {c.get('entry_ref') or c.get('joint_rule')}: {c['note'][:80]}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
