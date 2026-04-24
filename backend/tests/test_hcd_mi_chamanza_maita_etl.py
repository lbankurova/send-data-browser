"""Fixture tests for hcd_mi_chamanza and hcd_mi_maita ETL scripts.

Per blueprint F8 AC: ETL-loaded rows must match the curated CSV (byte-equal on core fields
after provenance stripping). Also validates:
  - Per-source row counts match catalog_coverage.json
  - terminology_version narrow invariants (Chamanza = inhand_pre_2024, Maita = pre_inhand_1977)
  - catalog_coverage.json row_count_actual backfill works
  - idempotent rebuild (re-run doesn't duplicate)
"""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from etl import hcd_mi_chamanza, hcd_mi_maita  # noqa: E402
from etl.hcd_mi_seed import _MI_SCHEMA  # noqa: E402


DATA_DIR = BACKEND_ROOT / "data" / "source"


def _setup_blank_db(path: Path) -> None:
    """Create a minimal hcd.db with the tables required by the ETL."""
    conn = sqlite3.connect(str(path))
    conn.executescript(_MI_SCHEMA)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS etl_metadata (key TEXT PRIMARY KEY, value TEXT)"
    )
    conn.commit()
    conn.close()


def _load_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    db = tmp_path / "hcd.db"
    _setup_blank_db(db)
    return db


@pytest.fixture
def tmp_coverage(tmp_path: Path, monkeypatch) -> Path:
    """Point the ETL at a scratch coverage json for isolation."""
    src = DATA_DIR / "catalog_coverage.json"
    dst = tmp_path / "catalog_coverage.json"
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(hcd_mi_chamanza, "COVERAGE_JSON", dst)
    monkeypatch.setattr(hcd_mi_maita, "COVERAGE_JSON", dst)
    return dst


# -----------------------------------------------------------------------------
# Chamanza ETL
# -----------------------------------------------------------------------------


def test_chamanza_build_row_count_matches_csv(tmp_db: Path, tmp_coverage: Path):
    hcd_mi_chamanza.build(tmp_db)
    csv_rows = _load_csv(hcd_mi_chamanza.CSV_PATH)
    conn = sqlite3.connect(str(tmp_db))
    db_count = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'chamanza_2010'"
    ).fetchone()[0]
    conn.close()
    assert db_count == len(csv_rows), (
        f"DB rows ({db_count}) != CSV rows ({len(csv_rows)})"
    )


def test_chamanza_byte_equal_fields(tmp_db: Path, tmp_coverage: Path):
    """Every CSV row's core fields survive the ETL unchanged."""
    hcd_mi_chamanza.build(tmp_db)
    csv_rows = _load_csv(hcd_mi_chamanza.CSV_PATH)
    conn = sqlite3.connect(str(tmp_db))
    conn.row_factory = sqlite3.Row
    # Pick a deterministic sample: first row + random cross-section
    sample_idx = [0, 10, 50, 100, 150, 200, len(csv_rows) - 1]
    for idx in sample_idx:
        csv_row = csv_rows[idx]
        db_row = conn.execute(
            """SELECT * FROM hcd_mi_incidence
               WHERE source = 'chamanza_2010' AND organ = ? AND finding = ?
               AND sex = ? AND ROUND(mean_incidence_pct, 2) = ROUND(?, 2)""",
            (csv_row["organ"], csv_row["finding"], csv_row["sex"],
             float(csv_row["mean_incidence_pct"])),
        ).fetchone()
        assert db_row is not None, (
            f"CSV row {idx} ({csv_row['organ']}/{csv_row['finding']}/{csv_row['sex']}) "
            f"not found in DB"
        )
        assert db_row["n_animals"] == int(csv_row["n_animals"])
        assert db_row["n_affected"] == int(csv_row["n_affected"])
        assert db_row["year_min"] == 2003
        assert db_row["year_max"] == 2009
        assert db_row["terminology_version"] == "inhand_pre_2024"
    conn.close()


def test_chamanza_all_rows_are_high_confidence(tmp_db: Path, tmp_coverage: Path):
    """Chamanza denominators are always >= 100 (285 or 570) per design."""
    hcd_mi_chamanza.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    rows = conn.execute(
        "SELECT confidence, COUNT(*) FROM hcd_mi_incidence "
        "WHERE source = 'chamanza_2010' GROUP BY confidence"
    ).fetchall()
    conn.close()
    assert dict(rows) == {"HIGH": 234}, f"Confidence distribution unexpected: {rows}"


def test_chamanza_idempotent(tmp_db: Path, tmp_coverage: Path):
    """Running build twice doesn't duplicate rows."""
    hcd_mi_chamanza.build(tmp_db)
    hcd_mi_chamanza.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    count = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'chamanza_2010'"
    ).fetchone()[0]
    conn.close()
    csv_rows = _load_csv(hcd_mi_chamanza.CSV_PATH)
    assert count == len(csv_rows), f"Idempotency broken: {count} after 2 builds, expected {len(csv_rows)}"


# -----------------------------------------------------------------------------
# Maita ETL
# -----------------------------------------------------------------------------


def test_maita_build_row_count_matches_csv(tmp_db: Path, tmp_coverage: Path):
    hcd_mi_maita.build(tmp_db)
    csv_rows = _load_csv(hcd_mi_maita.CSV_PATH)
    conn = sqlite3.connect(str(tmp_db))
    db_count = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'maita_1977'"
    ).fetchone()[0]
    conn.close()
    assert db_count == len(csv_rows)


def test_maita_terminology_version_invariant(tmp_db: Path, tmp_coverage: Path):
    """All Maita rows must carry terminology_version = pre_inhand_1977 (new value per protocol)."""
    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    rows = conn.execute(
        "SELECT terminology_version, COUNT(*) FROM hcd_mi_incidence "
        "WHERE source = 'maita_1977' GROUP BY terminology_version"
    ).fetchall()
    conn.close()
    assert dict(rows) == {"pre_inhand_1977": 19}


def test_maita_all_rows_low_confidence(tmp_db: Path, tmp_coverage: Path):
    """Paper-aggregate N and prose extraction -> all rows LOW per protocol confidence rules."""
    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    rows = conn.execute(
        "SELECT confidence, COUNT(*) FROM hcd_mi_incidence "
        "WHERE source = 'maita_1977' GROUP BY confidence"
    ).fetchall()
    conn.close()
    assert dict(rows) == {"LOW": 19}


def test_maita_byte_equal_fields(tmp_db: Path, tmp_coverage: Path):
    """Every CSV row's core fields survive the ETL unchanged (mirror of Chamanza test)."""
    hcd_mi_maita.build(tmp_db)
    csv_rows = _load_csv(hcd_mi_maita.CSV_PATH)
    conn = sqlite3.connect(str(tmp_db))
    conn.row_factory = sqlite3.Row
    # Maita has 19 rows; sample a deterministic cross-section
    sample_idx = [0, 5, 10, 15, len(csv_rows) - 1]
    for idx in sample_idx:
        csv_row = csv_rows[idx]
        db_row = conn.execute(
            """SELECT * FROM hcd_mi_incidence
               WHERE source = 'maita_1977' AND organ = ? AND finding = ?
               AND sex = ? AND ROUND(mean_incidence_pct, 2) = ROUND(?, 2)""",
            (csv_row["organ"], csv_row["finding"], csv_row["sex"],
             float(csv_row["mean_incidence_pct"])),
        ).fetchone()
        assert db_row is not None, (
            f"CSV row {idx} ({csv_row['organ']}/{csv_row['finding']}/{csv_row['sex']}) "
            f"not found in DB"
        )
        assert db_row["n_animals"] == int(csv_row["n_animals"])
        assert db_row["n_affected"] == int(csv_row["n_affected"])
        assert db_row["year_max"] == 1977
        assert db_row["terminology_version"] == "pre_inhand_1977"
    conn.close()


def test_maita_idempotent(tmp_db: Path, tmp_coverage: Path):
    """Running Maita build twice doesn't duplicate rows."""
    hcd_mi_maita.build(tmp_db)
    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    count = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'maita_1977'"
    ).fetchone()[0]
    conn.close()
    csv_rows = _load_csv(hcd_mi_maita.CSV_PATH)
    assert count == len(csv_rows), (
        f"Maita idempotency broken: {count} after 2 builds, expected {len(csv_rows)}"
    )


def test_maita_prostate_is_male_only(tmp_db: Path, tmp_coverage: Path):
    """Prostate chronic inflammation is male-only at 13.7% x 215 males = ~29 cases."""
    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    rows = conn.execute(
        """SELECT sex, n_animals, n_affected, mean_incidence_pct
           FROM hcd_mi_incidence
           WHERE source = 'maita_1977' AND organ = 'PROSTATE'"""
    ).fetchall()
    conn.close()
    assert len(rows) == 1, "PROSTATE should have exactly 1 row (M-only)"
    sex, n_animals, n_affected, pct = rows[0]
    assert sex == "M"
    assert n_animals == 215
    assert n_affected == 29  # round(0.137 * 215) = 29
    assert pct == 13.7


# -----------------------------------------------------------------------------
# Coverage JSON backfill
# -----------------------------------------------------------------------------


def test_coverage_json_row_count_backfilled_chamanza(tmp_db: Path, tmp_coverage: Path):
    hcd_mi_chamanza.build(tmp_db)
    data = json.loads(tmp_coverage.read_text(encoding="utf-8"))
    assert data["coverage"]["CYNO"]["row_count_actual"] == 234
    # BEAGLE untouched by Chamanza build
    assert data["coverage"]["BEAGLE"]["row_count_actual"] is None


def test_coverage_json_row_count_backfilled_maita(tmp_db: Path, tmp_coverage: Path):
    hcd_mi_maita.build(tmp_db)
    data = json.loads(tmp_coverage.read_text(encoding="utf-8"))
    assert data["coverage"]["BEAGLE"]["row_count_actual"] == 19


# -----------------------------------------------------------------------------
# Cross-ETL: both loaded, no interference
# -----------------------------------------------------------------------------


def test_etl_metadata_bridge_row_written(tmp_db: Path, tmp_coverage: Path):
    """Per spec §Catalog-coverage metadata: both ETLs must write a `mi_catalog_coverage`
    row into etl_metadata carrying the full JSON blob, so frontend/engine consumers can
    read coverage state via the standard DB query path (not just from the on-disk JSON)."""
    hcd_mi_chamanza.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    row = conn.execute(
        "SELECT value FROM etl_metadata WHERE key = 'mi_catalog_coverage'"
    ).fetchone()
    conn.close()
    assert row is not None, "mi_catalog_coverage row missing after Chamanza build"
    blob = json.loads(row[0])
    assert blob["coverage"]["CYNO"]["row_count_actual"] == 234

    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    row = conn.execute(
        "SELECT value FROM etl_metadata WHERE key = 'mi_catalog_coverage'"
    ).fetchone()
    conn.close()
    blob = json.loads(row[0])
    # After both ETLs run, the bridge row reflects both counts
    assert blob["coverage"]["CYNO"]["row_count_actual"] == 234
    assert blob["coverage"]["BEAGLE"]["row_count_actual"] == 19


def test_both_etls_dont_collide(tmp_db: Path, tmp_coverage: Path):
    hcd_mi_chamanza.build(tmp_db)
    hcd_mi_maita.build(tmp_db)
    conn = sqlite3.connect(str(tmp_db))
    chamanza = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'chamanza_2010'"
    ).fetchone()[0]
    maita = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = 'maita_1977'"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM hcd_mi_incidence").fetchone()[0]
    conn.close()
    assert chamanza == 234
    assert maita == 19
    assert total == chamanza + maita  # no overlap, no duplication
