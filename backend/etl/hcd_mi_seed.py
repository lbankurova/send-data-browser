"""ETL: Seed MI/MA HCD incidence data from published sources into hcd.db.

Loads background incidence rates for common histopathology findings from:
1. Charles River Crl:CD(SD) published background data (24 sex-specific entries)
2. Legacy mock prototype data (~31 entries, split to M+F = ~62 rows)

Usage:
    cd backend
    python -m etl.hcd_mi_seed build     # Build MI incidence table in hcd.db
    python -m etl.hcd_mi_seed info      # Show MI coverage summary
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sqlite3
import sys
from pathlib import Path

from config import HCD_DB_PATH

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Duration mapping: frontend bucket -> backend category
# ---------------------------------------------------------------------------

_DURATION_MAP = {
    "short": "28-day",
    "subchronic": "90-day",
    "chronic": "chronic",
    "carcinogenicity": "carcinogenicity",
    "any": None,  # NULL = fallback match
}

# ---------------------------------------------------------------------------
# MI/MA schema
# ---------------------------------------------------------------------------

_MI_SCHEMA = """
CREATE TABLE IF NOT EXISTS hcd_mi_incidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species TEXT NOT NULL,
    strain TEXT NOT NULL,
    sex TEXT NOT NULL,
    organ TEXT NOT NULL,
    finding TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'ANY',
    n_studies INTEGER NOT NULL,
    n_animals INTEGER,
    n_affected INTEGER,
    mean_incidence_pct REAL NOT NULL,
    sd_incidence_pct REAL,
    min_incidence_pct REAL,
    max_incidence_pct REAL,
    duration_category TEXT,
    source TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'MODERATE',
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_mi_incidence_lookup
    ON hcd_mi_incidence(species, strain, sex, organ, finding);
"""

# ---------------------------------------------------------------------------
# Seed data: Charles River Crl:CD(SD) published HCD
# (from frontend/src/lib/mock-historical-controls.ts)
# ---------------------------------------------------------------------------

# Each entry: (sex, organ, finding, mean_pct, low_pct, high_pct, n_studies, notes)
_CR_DATA = [
    # Males
    ("M", "KIDNEY", "basophilia", 34.2, 8.33, 60.0, 34, "Tubular basophilia; wide range"),
    ("M", "KIDNEY", "dilatation", 19.5, 9.09, 30.0, 34, "Renal pelvis dilatation"),
    ("M", "HEART", "cardiomyopathy", 24.5, 9.09, 40.0, 34, "Spontaneous focal cardiomyopathy"),
    ("M", "PITUITARY", "basophil hypertrophy", 75.0, 50.0, 100.0, 34, "Near-universal in some studies"),
    ("M", "PITUITARY", "basophil vacuolation", 41.7, 8.33, 75.0, 34, "Wide range across studies"),
    ("M", "PITUITARY", "cyst", 10.0, 10.0, 10.0, 34, "Narrow range"),
    ("M", "MESENTERIC LYMPH NODE", "infiltrate", 34.5, 9.09, 60.0, 34, "Lymphocytic/plasmacytic infiltrate"),
    ("M", "LUNG", "neutrophilic perivascular infiltrate", 24.2, 8.33, 40.0, 34, "Background inflammatory"),
    ("M", "LUNG", "perivascular hemorrhage", 58.3, 16.67, 100.0, 34, "Very wide range; may be agonal"),
    ("M", "SPLEEN", "extramedullary hematopoiesis", 22.5, 5.0, 40.0, 34, "Very common background"),
    ("M", "TESTIS", "atrophy", 10.0, 10.0, 10.0, 34, "Low background; seminiferous tubule"),
    ("M", "TESTIS", "decreased spermatogenesis", 10.0, 10.0, 10.0, 34, "Low background"),
    ("M", "TESTIS", "degeneration", 10.0, 10.0, 10.0, 34, "Low background; seminiferous tubule"),
    ("M", "PROSTATE", "chronic inflammation", 24.5, 9.09, 40.0, 34, "Common incidental; multifocal"),
    ("M", "PROSTATE", "mononuclear infiltrate", 18.3, 6.67, 30.0, 34, "Common incidental"),
    # Females
    ("F", "LIVER", "mononuclear infiltrate", 54.2, 8.33, 100.0, 34, "Extremely wide range; very common"),
    ("F", "LIVER", "hepatocellular vacuolation", 19.2, 8.33, 30.0, 34, "Common; usually glycogen/lipid"),
    ("F", "KIDNEY", "basophilia", 34.2, 8.33, 60.0, 34, "Tubular basophilia; same as males"),
    ("F", "KIDNEY", "dilatation", 19.5, 9.09, 30.0, 34, "Renal pelvis dilatation"),
    ("F", "THYROID", "cyst", 8.33, 8.33, 8.33, 34, "Narrow range"),
    ("F", "UTERUS", "dilatation", 54.5, 9.09, 100.0, 34, "Extremely common; estrous-cycle-dependent"),
    ("F", "UTERUS", "cyst", 10.0, 10.0, 10.0, 34, "Narrow range"),
    ("F", "OVARY", "cyst", 24.5, 9.09, 40.0, 34, "Follicular/luteal origin"),
    ("F", "HARDERIAN GLAND", "infiltrate lymphocytic", 10.0, 10.0, 10.0, 34, "Incidental"),
]

# Legacy mock entries (from buildLegacyEntries in TS)
# sex="BOTH" -> stored as M+F with same values. duration="any" -> NULL.
# Each: (organ, finding, mean_pct, low_pct, high_pct, n_studies, notes)
_LEGACY_DATA = [
    ("LIVER", "hepatocellular hypertrophy", 8, 2, 18, 24, None),
    ("LIVER", "hepatocellular vacuolation", 12, 4, 28, 22, None),
    ("LIVER", "hepatocellular necrosis", 2, 0, 6, 24, None),
    ("LIVER", "bile duct hyperplasia", 4, 0, 10, 20, None),
    ("LIVER", "hepatocellular adenoma", 1, 0, 4, 18, None),
    ("KIDNEY", "tubular degeneration", 6, 0, 16, 22, None),
    ("KIDNEY", "tubular basophilia", 15, 6, 30, 22, None),
    ("KIDNEY", "chronic progressive nephropathy", 35, 15, 60, 24, None),
    ("KIDNEY", "mineralization", 10, 2, 22, 20, None),
    ("LUNG", "alveolar macrophage infiltrate", 18, 6, 35, 20, None),
    ("LUNG", "perivascular inflammation", 10, 2, 22, 18, None),
    ("HEART", "cardiomyopathy", 20, 8, 40, 22, None),
    ("HEART", "myocardial degeneration", 5, 0, 12, 18, None),
    ("ADRENAL", "cortical hypertrophy", 14, 4, 28, 20, None),
    ("ADRENAL", "cortical vacuolation", 8, 2, 18, 18, None),
    ("THYROID", "follicular cell hypertrophy", 6, 0, 16, 20, None),
    ("THYROID", "follicular cell hyperplasia", 4, 0, 12, 18, None),
    ("TESTIS", "tubular atrophy", 3, 0, 8, 16, None),
    ("TESTIS", "spermatogenic degeneration", 5, 0, 14, 16, None),
    ("OVARY", "cyst", 10, 2, 22, 14, None),
    ("SPLEEN", "extramedullary hematopoiesis", 25, 10, 45, 22, None),
    ("SPLEEN", "lymphoid hyperplasia", 8, 2, 18, 20, None),
    ("SPLEEN", "lymphoid atrophy", 4, 0, 10, 18, None),
    ("STOMACH", "squamous cell hyperplasia", 6, 0, 16, 16, None),
    ("STOMACH", "erosion", 3, 0, 8, 16, None),
    ("STOMACH", "inflammation", 8, 2, 18, 16, None),
    ("GENERAL", "pigmentation", 12, 4, 25, 20, None),
    ("GENERAL", "inflammation", 15, 6, 30, 24, None),
    ("GENERAL", "fibrosis", 4, 0, 10, 20, None),
    ("GENERAL", "necrosis", 3, 0, 8, 20, None),
]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_mi_seed(db_path: Path | None = None) -> Path:
    """Load MI/MA HCD seed data into hcd.db."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        print("Run OM ETL first: python -m etl.hcd_etl build")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_MI_SCHEMA)

    # Clear existing MI data (idempotent rebuild)
    conn.execute("DELETE FROM hcd_mi_incidence")

    records = []

    # Charles River data (already sex-specific)
    for sex, organ, finding, mean_pct, low_pct, high_pct, n_studies, notes in _CR_DATA:
        records.append((
            "RAT", "SPRAGUE-DAWLEY", sex, organ, finding.lower(), "ANY",
            n_studies, None, None,
            mean_pct, None, low_pct, high_pct,
            "90-day",  # CR data is subchronic (4-26 week studies)
            "Charles River Crl:CD(SD) Background Data",
            "MODERATE",
            notes,
        ))

    # Legacy mock data (BOTH -> M + F)
    for organ, finding, mean_pct, low_pct, high_pct, n_studies, notes in _LEGACY_DATA:
        for sex in ("M", "F"):
            records.append((
                "RAT", "SPRAGUE-DAWLEY", sex, organ, finding.lower(), "ANY",
                n_studies, None, None,
                float(mean_pct), None, float(low_pct), float(high_pct),
                None,  # "any" -> NULL duration (fallback)
                "Mock prototype data",
                "LOW",
                notes,
            ))

    conn.executemany(
        """INSERT INTO hcd_mi_incidence
        (species, strain, sex, organ, finding, severity,
         n_studies, n_animals, n_affected,
         mean_incidence_pct, sd_incidence_pct, min_incidence_pct, max_incidence_pct,
         duration_category, source, confidence, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        records,
    )

    # ETL metadata
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("mi_seed_timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("mi_seed_n_records", str(len(records))),
    )

    conn.commit()

    print(f"Loaded {len(records)} MI/MA HCD seed records into {db_path}")
    print(f"  Charles River entries: {len(_CR_DATA)}")
    print(f"  Legacy entries: {len(_LEGACY_DATA)} x 2 (M+F) = {len(_LEGACY_DATA) * 2}")
    print(f"  Total: {len(records)}")

    conn.close()
    return db_path


# ---------------------------------------------------------------------------
# Info
# ---------------------------------------------------------------------------

def show_info(db_path: Path | None = None) -> None:
    """Print MI/MA HCD coverage summary."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if "hcd_mi_incidence" not in tables:
        print("No MI tables in hcd.db. Run: python -m etl.hcd_mi_seed build")
        conn.close()
        return

    total = conn.execute("SELECT COUNT(*) FROM hcd_mi_incidence").fetchone()[0]
    print(f"=== MI/MA HCD Coverage ({total} records) ===\n")

    # By source
    print("By source:")
    for r in conn.execute("""
        SELECT source, confidence, COUNT(*), COUNT(DISTINCT organ),
               COUNT(DISTINCT finding)
        FROM hcd_mi_incidence
        GROUP BY source, confidence
        ORDER BY source
    """):
        print(f"  {r[0]} ({r[1]}): {r[2]} entries, {r[3]} organs, {r[4]} findings")

    # By organ
    print("\nBy organ:")
    for r in conn.execute("""
        SELECT organ, COUNT(*), COUNT(DISTINCT finding)
        FROM hcd_mi_incidence
        GROUP BY organ
        ORDER BY COUNT(*) DESC
    """):
        print(f"  {r[0]}: {r[1]} entries, {r[2]} findings")

    # Duration coverage
    print("\nBy duration:")
    for r in conn.execute("""
        SELECT COALESCE(duration_category, 'NULL (fallback)'), COUNT(*)
        FROM hcd_mi_incidence
        GROUP BY duration_category
        ORDER BY duration_category
    """):
        print(f"  {r[0]}: {r[1]} entries")

    conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="HCD MI/MA Seed: Load histopathology incidence data into hcd.db",
    )
    sub = parser.add_subparsers(dest="command")
    bd = sub.add_parser("build", help="Build MI incidence table from seed data")
    bd.add_argument("--db", type=Path, help="Target hcd.db path")
    sub.add_parser("info", help="Show MI coverage summary")

    args = parser.parse_args()
    if args.command == "build":
        build_mi_seed(args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
