"""Phase-1 HCD crosswalk loader (F6).

Maps SEND histopathology findings to canonical HCD-source terms for the 15
clinical catalog rules. Narrow scope (AC-F6-1 target: 45 rows +/- 10).

Consumed by F9 wiring (apply_clinical_layer -> query_mi_incidence). When no
crosswalk row matches, F9 returns an explicit empty hcd_evidence record
(AC-F6-2 no silent substring match; tier-4 disable in Phase-1 per AC-F6-3).

Spec: docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md F6
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

_CROSSWALK_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "shared" / "rules" / "hcd-crosswalk-phase1.json"
)

_LOADED: dict | None = None


@dataclass(frozen=True)
class CrosswalkRow:
    catalog_id: str
    catalog_term: str
    source: str
    source_term: str
    strain_applicability: tuple[str, ...]
    organ_applicability: tuple[str, ...]
    confidence: str
    inhand_anchor: str
    notes: str


def _load() -> list[CrosswalkRow]:
    global _LOADED
    if _LOADED is None:
        with open(_CROSSWALK_PATH) as f:
            raw = json.load(f)
        rows = [
            CrosswalkRow(
                catalog_id=r["catalog_id"],
                catalog_term=r["catalog_term"],
                source=r["source"],
                source_term=r["source_term"],
                strain_applicability=tuple(r.get("strain_applicability") or []),
                organ_applicability=tuple(s.upper() for s in (r.get("organ_applicability") or [])),
                confidence=r["confidence"],
                inhand_anchor=r.get("inhand_anchor", ""),
                notes=r.get("notes", ""),
            )
            for r in raw["rows"]
        ]
        _LOADED = {"rows": rows, "version": raw.get("version", "")}
    return _LOADED["rows"]


def all_rows() -> list[CrosswalkRow]:
    """All crosswalk rows (cached)."""
    return list(_load())


def find_row(
    *,
    catalog_id: str,
    organ: str | None,
    strain: str | None = None,
) -> CrosswalkRow | None:
    """Find the best crosswalk row for a (catalog_id, organ, strain) query.

    Match order:
      1. strain-specific + organ match
      2. strain-agnostic fallback (any strain) + organ match

    Returns None when no row applies (explicit miss).
    """
    if not catalog_id or not organ:
        return None
    organ_u = organ.strip().upper()
    strain_u = (strain or "").strip()

    candidates = [r for r in _load() if r.catalog_id == catalog_id]

    # Filter by organ
    candidates = [r for r in candidates if _organ_matches(r.organ_applicability, organ_u)]
    if not candidates:
        return None

    # Strain-specific match first
    if strain_u:
        strain_matched = [r for r in candidates if _strain_matches(r.strain_applicability, strain_u)]
        if strain_matched:
            return _pick_highest_confidence(strain_matched)

    # Fall back to any strain
    return _pick_highest_confidence(candidates)


def _organ_matches(row_organs: tuple[str, ...], organ_u: str) -> bool:
    return organ_u in row_organs


def _strain_matches(row_strains: tuple[str, ...], strain_u: str) -> bool:
    # Case-insensitive prefix-or-suffix aware match. Strain strings vary
    # in casing ("Crl:CD(SD)" vs "CRL:CD(SD)") so compare upper.
    strain_upper = strain_u.upper()
    for s in row_strains:
        s_upper = s.upper()
        if s_upper == strain_upper:
            return True
        # Permissive: row uses canonical strain; study metadata sometimes
        # carries the vendor prefix. Accept either direction of containment.
        if s_upper in strain_upper or strain_upper in s_upper:
            return True
    return False


_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def _pick_highest_confidence(rows: list[CrosswalkRow]) -> CrosswalkRow:
    return max(rows, key=lambda r: _CONFIDENCE_RANK.get(r.confidence, 0))


def resolve_finding_term(
    *,
    catalog_id: str,
    organ: str | None,
    strain: str | None = None,
) -> str | None:
    """Return the canonical HCD finding term for a (catalog_id, organ, strain)
    query, or None on explicit crosswalk miss.

    Consumers use the returned term as the `finding` argument to
    `HcdSqliteDB.query_mi_incidence`. Pre-registering this mapping prevents
    the tier-4 substring fallback that Phase-1 explicitly disables.
    """
    row = find_row(catalog_id=catalog_id, organ=organ, strain=strain)
    return row.source_term if row else None


__all__ = [
    "CrosswalkRow",
    "all_rows",
    "find_row",
    "resolve_finding_term",
]
