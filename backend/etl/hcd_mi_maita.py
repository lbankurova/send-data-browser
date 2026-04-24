"""ETL: Load Maita 1977 Beagle MI/MA HCD incidence data into hcd.db.

Source: Maita, Masuda, Suzuki 1977, Exp. Anim. 26(2):161-167. 420 Beagles (215M + 205F),
1-4 years, Sankyo Co. Ltd., Japan. Paper-aggregate denominator without sex-stratified
counts; pre-INHAND-1977 terminology.

Reads backend/data/source/maita_1977.csv, strips provenance columns, inserts into
hcd_mi_incidence. Updates catalog_coverage.json row_count_actual for BEAGLE.

Partial Beagle MI coverage — DATA-GAP-MIMA-21 tracks Chandra 2010 or equivalent.

Usage:
    cd backend
    python -m etl.hcd_mi_maita build
    python -m etl.hcd_mi_maita info
"""

from __future__ import annotations

import argparse
import csv
import datetime
import logging
import sqlite3
import sys
from pathlib import Path

from config import HCD_DB_PATH
from etl.hcd_mi_seed import (
    _MI_SCHEMA,
    MI_DB_COLUMNS,
    ensure_phase1_schema,
    mi_csv_value_to_db,
    update_mi_catalog_coverage,
)

log = logging.getLogger(__name__)

SOURCE_TAG = "maita_1977"
SPECIES_TAG = "BEAGLE"

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "source" / "maita_1977.csv"
COVERAGE_JSON = Path(__file__).resolve().parent.parent / "data" / "source" / "catalog_coverage.json"


def _row_sanity_check(row: dict, i: int) -> None:
    """Per-row invariants for Maita (new terminology_version value, paper-aggregate N)."""
    assert row["source"] == SOURCE_TAG, (
        f"row {i}: source must be {SOURCE_TAG!r}, got {row['source']!r}"
    )
    assert row["species"] == SPECIES_TAG, (
        f"row {i}: species must be {SPECIES_TAG!r}, got {row['species']!r}"
    )
    # Narrow per-ETL defensive assertion — contract-triangle hygiene for pre_inhand_1977
    # value (per task 1 impact scan: no global enforcement site exists, so guard at ETL).
    assert row["terminology_version"] == "pre_inhand_1977", (
        f"row {i}: terminology_version must be 'pre_inhand_1977' for Maita, "
        f"got {row['terminology_version']!r}"
    )


# Catalog-coverage update delegated to hcd_mi_seed.update_mi_catalog_coverage.


def build(db_path: Path | None = None) -> Path:
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        sys.exit(1)

    if not CSV_PATH.exists():
        print(f"Source CSV not found: {CSV_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_MI_SCHEMA)
    ensure_phase1_schema(conn)

    conn.execute("DELETE FROM hcd_mi_incidence WHERE source = ?", (SOURCE_TAG,))

    with open(CSV_PATH, encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    records = []
    for i, row in enumerate(rows, start=1):
        _row_sanity_check(row, i)
        values = tuple(mi_csv_value_to_db(col, row.get(col, "")) for col in MI_DB_COLUMNS)
        records.append(values)

    placeholders = ", ".join("?" * len(MI_DB_COLUMNS))
    cols = ", ".join(MI_DB_COLUMNS)
    conn.executemany(
        f"INSERT INTO hcd_mi_incidence ({cols}) VALUES ({placeholders})",
        records,
    )

    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        (f"{SOURCE_TAG}_loaded_at", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        (f"{SOURCE_TAG}_n_records", str(len(records))),
    )

    conn.commit()
    conn.close()

    print(f"Loaded {len(records)} Maita 1977 records into {db_path}")

    update_mi_catalog_coverage(db_path, COVERAGE_JSON, SPECIES_TAG)

    return db_path


def show_info(db_path: Path | None = None) -> None:
    if db_path is None:
        db_path = HCD_DB_PATH
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return
    conn = sqlite3.connect(str(db_path))
    total = conn.execute(
        "SELECT COUNT(*) FROM hcd_mi_incidence WHERE source = ?", (SOURCE_TAG,)
    ).fetchone()[0]
    print(f"=== Maita 1977 coverage ({total} records) ===\n")
    print("By organ:")
    for r in conn.execute("""
        SELECT organ, COUNT(*), COUNT(DISTINCT finding)
        FROM hcd_mi_incidence WHERE source = ?
        GROUP BY organ ORDER BY organ
    """, (SOURCE_TAG,)):
        print(f"  {r[0]}: {r[1]} entries, {r[2]} findings")
    conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command")
    bd = sub.add_parser("build", help="Load Maita 1977 CSV into hcd_mi_incidence")
    bd.add_argument("--db", type=Path, help="Target hcd.db path")
    sub.add_parser("info", help="Show Maita coverage summary")

    args = parser.parse_args()
    if args.command == "build":
        build(args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
