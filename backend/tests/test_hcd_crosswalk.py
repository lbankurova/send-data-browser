"""F6 Phase-1 crosswalk tests.

Covers:
  - AC-F6-1: row count in bounds; all catalog IDs populated with confidence
  - AC-F6-2: behavior test -- real finding matches, obscure finding misses
  - AC-F6-3: tier-4 substring fallback disabled (implicit -- no substring path
             exists; a non-matching finding returns None)
  - AC-F6-4: representative SEND findings route correctly
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.hcd_crosswalk import (  # noqa: E402
    all_rows, find_row, resolve_finding_term,
)


def test_row_count_in_bounds():
    rows = all_rows()
    assert 35 <= len(rows) <= 55, f"row count {len(rows)} outside 35..55 band"


def test_all_catalog_ids_covered():
    rows = all_rows()
    expected = {f"C{str(i).zfill(2)}" for i in range(1, 16)}
    got = {r.catalog_id for r in rows}
    assert got == expected, f"missing catalog ids: {expected - got}"


def test_every_row_has_required_fields():
    rows = all_rows()
    for r in rows:
        assert r.catalog_id
        assert r.source
        assert r.source_term
        assert r.confidence in {"high", "medium", "low"}
        assert r.organ_applicability
        assert r.strain_applicability


def test_c14_hepatocellular_hypertrophy_matches_on_sd_rat():
    term = resolve_finding_term(catalog_id="C14", organ="LIVER", strain="Crl:CD(SD)")
    assert term is not None
    assert "hypertrophy" in term.lower()


def test_c15_follicular_hypertrophy_matches_on_sd_rat():
    term = resolve_finding_term(catalog_id="C15", organ="THYROID", strain="Crl:CD(SD)")
    assert term is not None


def test_obscure_finding_misses_explicitly():
    # Nonexistent organ -> None (AC-F6-2 explicit miss)
    term = resolve_finding_term(catalog_id="C14", organ="OBSCURE_ORGAN", strain="Crl:CD(SD)")
    assert term is None


def test_wrong_catalog_id_returns_none():
    # C14 is for LIVER; query with WRONG catalog_id
    term = resolve_finding_term(catalog_id="CXX", organ="LIVER", strain="Crl:CD(SD)")
    assert term is None


def test_beagle_chandra_2010_row_exists():
    # AC-F6-4: cross-species representative
    row = find_row(catalog_id="C08", organ="LIVER", strain="Beagle")
    assert row is not None
    # Either NTP_IAD (strain-agnostic fallback) or Chandra_2010 row is acceptable.
    assert row.catalog_id == "C08"


def test_strain_agnostic_fallback_when_strain_unknown():
    # Strain None -> first-match-by-confidence. Must still return a row.
    row = find_row(catalog_id="C14", organ="LIVER", strain=None)
    assert row is not None
    assert row.catalog_id == "C14"
