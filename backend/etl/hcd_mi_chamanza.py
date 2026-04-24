"""ETL: Load Chamanza 2010 MI/MA HCD incidence data into hcd.db.

Source: Chamanza et al. 2010, Toxicol Pathol 38(4):642-657. 570 cynomolgus monkeys
(285 per sex), 60 regulatory studies 2003-2009, Charles River Edinburgh.

Reads backend/data/source/chamanza_2010.csv (canonical, post-review), strips provenance
columns, inserts into hcd_mi_incidence table. Updates catalog_coverage.json row_count_actual.

Usage:
    cd backend
    python -m etl.hcd_mi_chamanza build
    python -m etl.hcd_mi_chamanza info
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

SOURCE_TAG = "chamanza_2010"
SPECIES_TAG = "CYNO"
STRAIN_TAG = "MACACA_FASCICULARIS"

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "source" / "chamanza_2010.csv"
COVERAGE_JSON = Path(__file__).resolve().parent.parent / "data" / "source" / "catalog_coverage.json"


def _row_sanity_check(row: dict, i: int) -> None:
    """Per-row invariants expected by blueprint F8 + protocol."""
    assert row["source"] == SOURCE_TAG, (
        f"row {i}: source must be {SOURCE_TAG!r}, got {row['source']!r}"
    )
    assert row["species"] == SPECIES_TAG, (
        f"row {i}: species must be {SPECIES_TAG!r}, got {row['species']!r}"
    )
    assert row["strain"] == STRAIN_TAG, (
        f"row {i}: strain must be {STRAIN_TAG!r}, got {row['strain']!r}"
    )
    # Chamanza uses inhand_pre_2024 per protocol
    assert row["terminology_version"] == "inhand_pre_2024", (
        f"row {i}: terminology_version must be 'inhand_pre_2024' for Chamanza, "
        f"got {row['terminology_version']!r}"
    )
    # Chamanza year range is fixed: 2003-2009
    assert row["year_min"] == "2003" and row["year_max"] == "2009", (
        f"row {i}: Chamanza year range must be 2003-2009, got {row['year_min']}-{row['year_max']}"
    )


# Catalog-coverage update is delegated to hcd_mi_seed.update_mi_catalog_coverage
# (shared with hcd_mi_maita; writes both the JSON file and the etl_metadata bridge row).


def build(db_path: Path | None = None) -> Path:
    """Load Chamanza 2010 CSV into hcd_mi_incidence."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        print("Run OM ETL first: python -m etl.hcd_etl build")
        sys.exit(1)

    if not CSV_PATH.exists():
        print(f"Source CSV not found: {CSV_PATH}")
        print("Run the DATA-GAP-MIMA-18 extraction first.")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_MI_SCHEMA)
    ensure_phase1_schema(conn)

    # Clear only Chamanza rows (idempotent rebuild) — don't touch other sources
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

    print(f"Loaded {len(records)} Chamanza 2010 records into {db_path}")

    # Backfill row_count_actual + write mi_catalog_coverage etl_metadata bridge row
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
    print(f"=== Chamanza 2010 coverage ({total} records) ===\n")
    print("By organ:")
    for r in conn.execute("""
        SELECT organ, COUNT(*), COUNT(DISTINCT finding)
        FROM hcd_mi_incidence WHERE source = ?
        GROUP BY organ ORDER BY organ
    """, (SOURCE_TAG,)):
        print(f"  {r[0]}: {r[1]} entries, {r[2]} findings")
    print("\nBy sex:")
    for r in conn.execute("""
        SELECT sex, COUNT(*)
        FROM hcd_mi_incidence WHERE source = ?
        GROUP BY sex
    """, (SOURCE_TAG,)):
        print(f"  {r[0]}: {r[1]} entries")
    conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command")
    bd = sub.add_parser("build", help="Load Chamanza 2010 CSV into hcd_mi_incidence")
    bd.add_argument("--db", type=Path, help="Target hcd.db path")
    sub.add_parser("info", help="Show Chamanza coverage summary")

    args = parser.parse_args()
    if args.command == "build":
        build(args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
