"""ETL: Load Choi 2011 beagle organ weight HCD into hcd.db.

Adds schema extensions (species, age_months, source, confidence, sd_inflated)
to the hcd_aggregates table, inserts 81 rows of beagle organ weight data from
Choi SY et al. (2011) Lab Anim Res 27(4):283-291. PMC3251758.

Data: 237 beagle dogs across 3 age strata (6, 7, 9 months), 15 organs.
All weights stored in grams (pituitary converted from mg).

Usage:
    cd backend
    python -m etl.hcd_dog_etl build       # Migrate schema + load data
    python -m etl.hcd_dog_etl info        # Show dog OM HCD coverage
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from pathlib import Path

from config import HCD_DB_PATH

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Choi 2011 data -- Tables 3-4: absolute organ weights (g)
# Format: (organ, age_months, sex, mean, sd, n)
# Pituitary converted from mg to g.
# ---------------------------------------------------------------------------

_CHOI_2011_DATA: list[tuple[str, float, str, float, float, int]] = [
    # --- Thyroid ---
    ("THYROID", 6.0, "M", 0.53, 0.09, 13),
    ("THYROID", 7.0, "M", 0.58, 0.12, 10),
    ("THYROID", 9.0, "M", 0.78, 0.09, 15),
    ("THYROID", 6.0, "F", 0.48, 0.09, 13),
    ("THYROID", 7.0, "F", 0.49, 0.09, 10),
    ("THYROID", 9.0, "F", 0.65, 0.14, 15),
    # --- Heart ---
    ("HEART", 6.0, "M", 57.52, 8.43, 13),
    ("HEART", 7.0, "M", 65.39, 9.05, 10),
    ("HEART", 9.0, "M", 76.86, 9.73, 15),
    ("HEART", 6.0, "F", 53.21, 4.05, 13),
    ("HEART", 7.0, "F", 56.52, 6.35, 10),
    ("HEART", 9.0, "F", 68.52, 9.53, 15),
    # --- Lungs ---
    ("LUNGS", 6.0, "M", 74.64, 10.16, 13),
    ("LUNGS", 7.0, "M", 68.21, 5.00, 10),
    ("LUNGS", 9.0, "M", 86.13, 14.20, 15),
    ("LUNGS", 6.0, "F", 62.75, 6.17, 13),
    ("LUNGS", 7.0, "F", 53.42, 2.14, 10),
    ("LUNGS", 9.0, "F", 77.63, 17.75, 15),
    # --- Liver ---
    ("LIVER", 6.0, "M", 219.23, 19.01, 13),
    ("LIVER", 7.0, "M", 232.76, 33.75, 10),
    ("LIVER", 9.0, "M", 268.40, 41.36, 15),
    ("LIVER", 6.0, "F", 189.91, 22.35, 13),
    ("LIVER", 7.0, "F", 189.00, 28.70, 10),
    ("LIVER", 9.0, "F", 246.92, 50.65, 15),
    # --- Kidney ---
    ("KIDNEY", 6.0, "M", 34.12, 2.59, 13),
    ("KIDNEY", 7.0, "M", 37.34, 3.70, 10),
    ("KIDNEY", 9.0, "M", 39.95, 4.72, 15),
    ("KIDNEY", 6.0, "F", 30.51, 3.77, 13),
    ("KIDNEY", 7.0, "F", 28.30, 3.26, 10),
    ("KIDNEY", 9.0, "F", 34.80, 7.35, 15),
    # --- Adrenal ---
    ("ADRENAL", 6.0, "M", 0.78, 0.18, 13),
    ("ADRENAL", 7.0, "M", 0.99, 0.17, 10),
    ("ADRENAL", 9.0, "M", 1.07, 0.19, 15),
    ("ADRENAL", 6.0, "F", 0.91, 0.13, 13),
    ("ADRENAL", 7.0, "F", 0.98, 0.21, 10),
    ("ADRENAL", 9.0, "F", 1.06, 0.16, 15),
    # --- Thymus ---
    ("THYMUS", 6.0, "M", 9.49, 1.87, 13),
    ("THYMUS", 7.0, "M", 6.79, 0.52, 10),
    ("THYMUS", 9.0, "M", 5.58, 1.77, 15),
    ("THYMUS", 6.0, "F", 6.78, 2.35, 13),
    ("THYMUS", 7.0, "F", 5.54, 1.18, 10),
    ("THYMUS", 9.0, "F", 5.03, 1.57, 15),
    # --- Brain ---
    ("BRAIN", 6.0, "M", 71.83, 5.67, 13),
    ("BRAIN", 7.0, "M", 74.21, 6.10, 10),
    ("BRAIN", 9.0, "M", 73.64, 5.10, 15),
    ("BRAIN", 6.0, "F", 70.36, 4.91, 13),
    ("BRAIN", 7.0, "F", 65.25, 5.75, 10),
    ("BRAIN", 9.0, "F", 71.29, 4.90, 15),
    # --- Pituitary (converted from mg to g) ---
    ("PITUITARY", 6.0, "M", 0.05083, 0.01096, 13),
    ("PITUITARY", 7.0, "M", 0.05775, 0.00937, 10),
    ("PITUITARY", 9.0, "M", 0.06008, 0.00991, 15),
    ("PITUITARY", 6.0, "F", 0.05323, 0.00844, 13),
    ("PITUITARY", 7.0, "F", 0.05064, 0.00992, 10),
    ("PITUITARY", 9.0, "F", 0.05461, 0.00800, 15),
    # --- Spleen ---
    ("SPLEEN", 6.0, "M", 20.94, 3.38, 13),
    ("SPLEEN", 7.0, "M", 23.28, 3.65, 10),
    ("SPLEEN", 9.0, "M", 27.44, 5.11, 15),
    ("SPLEEN", 6.0, "F", 20.65, 4.94, 13),
    ("SPLEEN", 7.0, "F", 21.95, 4.90, 10),
    ("SPLEEN", 9.0, "F", 25.75, 3.65, 15),
    # --- Testes (male only) ---
    ("TESTES", 6.0, "M", 4.39, 2.60, 13),
    ("TESTES", 7.0, "M", 9.48, 3.85, 10),
    ("TESTES", 9.0, "M", 13.21, 2.94, 15),
    # --- Epididymis (male only) ---
    ("EPIDIDYMIDES", 6.0, "M", 1.11, 0.14, 13),
    ("EPIDIDYMIDES", 7.0, "M", 1.87, 0.21, 10),
    ("EPIDIDYMIDES", 9.0, "M", 2.50, 0.36, 15),
    # --- Prostate (male only) ---
    ("PROSTATE", 6.0, "M", 1.08, 0.28, 13),
    ("PROSTATE", 7.0, "M", 2.74, 1.02, 10),
    ("PROSTATE", 9.0, "M", 4.79, 2.94, 15),
    # --- Ovaries (female only) ---
    ("OVARIES", 6.0, "F", 0.52, 0.08, 13),
    ("OVARIES", 7.0, "F", 0.70, 0.44, 10),
    ("OVARIES", 9.0, "F", 0.88, 0.72, 15),
    # --- Uterus (female only) ---
    ("UTERUS", 6.0, "F", 0.78, 0.16, 13),
    ("UTERUS", 7.0, "F", 7.99, 6.96, 10),
    ("UTERUS", 9.0, "F", 11.39, 7.64, 15),
]


def _confidence(n: int) -> str:
    """Assign confidence tier based on sample size."""
    if n >= 13:
        return "HIGH"
    if n >= 10:
        return "MODERATE"
    return "LOW"


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Add species, age_months, source, confidence, sd_inflated columns if missing."""
    existing = {r[1] for r in conn.execute("PRAGMA table_info(hcd_aggregates)")}

    migrations = [
        ("species", "TEXT DEFAULT 'RAT'"),
        ("age_months", "REAL"),
        ("source", "TEXT"),
        ("confidence", "TEXT"),
        ("sd_inflated", "REAL"),
    ]

    for col_name, col_type in migrations:
        if col_name not in existing:
            conn.execute(f"ALTER TABLE hcd_aggregates ADD COLUMN {col_name} {col_type}")
            log.info("Added column %s to hcd_aggregates", col_name)

    # Backfill existing rodent rows
    conn.execute(
        "UPDATE hcd_aggregates SET source = 'NTP_DTT', confidence = 'HIGH' "
        "WHERE source IS NULL"
    )

    conn.commit()


def _add_strain_alias(conn: sqlite3.Connection) -> None:
    """Add BEAGLE strain alias."""
    existing = conn.execute(
        "SELECT canonical FROM strain_aliases WHERE alias = 'BEAGLE'"
    ).fetchone()
    if existing:
        log.info("BEAGLE alias already exists -> %s", existing[0])
        return
    conn.execute(
        "INSERT INTO strain_aliases (alias, canonical) VALUES ('BEAGLE', 'BEAGLE')"
    )
    conn.commit()
    log.info("Added strain alias BEAGLE -> BEAGLE")


def _load_choi_2011(conn: sqlite3.Connection) -> int:
    """Insert Choi 2011 data into hcd_aggregates. Returns row count."""
    # Clear any previous dog data to make idempotent
    deleted = conn.execute(
        "DELETE FROM hcd_aggregates WHERE species = 'DOG' AND source = 'CHOI2011'"
    ).rowcount
    if deleted > 0:
        log.info("Cleared %d existing CHOI2011 rows", deleted)

    count = 0
    for organ, age_months, sex, mean, sd, n in _CHOI_2011_DATA:
        lower_2sd = round(mean - 2 * sd, 6)
        upper_2sd = round(mean + 2 * sd, 6)
        confidence = _confidence(n)

        # SD inflation for single-study data (Gur & Waner 1993)
        sd_inflated = round(sd * 1.2, 6)

        conn.execute(
            """INSERT INTO hcd_aggregates
               (strain, sex, organ, duration_category, n, mean, sd,
                p5, p25, median, p75, p95, min_val, max_val,
                lower_2sd, upper_2sd, study_count,
                species, age_months, source, confidence, sd_inflated)
               VALUES (?, ?, ?, ?, ?, ?, ?,
                       NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                       ?, ?, 1,
                       'DOG', ?, 'CHOI2011', ?, ?)""",
            (
                "BEAGLE", sex, organ,
                # duration_category: not applicable for age-based lookup,
                # but column is NOT NULL in original schema -- use age label
                f"{int(age_months)}mo",
                n, round(mean, 6), round(sd, 6),
                lower_2sd, upper_2sd,
                age_months, confidence, sd_inflated,
            ),
        )
        count += 1

    conn.commit()
    return count


def build(db_path: Path | None = None) -> None:
    """Run full ETL: migrate schema, add alias, load data."""
    path = db_path or HCD_DB_PATH
    if not path.exists():
        print(f"ERROR: hcd.db not found at {path}")
        sys.exit(1)

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        _migrate_schema(conn)
        _add_strain_alias(conn)
        count = _load_choi_2011(conn)
        print(f"Loaded {count} Choi 2011 beagle organ weight rows into hcd_aggregates")
    finally:
        conn.close()


def info(db_path: Path | None = None) -> None:
    """Show dog OM HCD coverage summary."""
    path = db_path or HCD_DB_PATH
    if not path.exists():
        print(f"hcd.db not found at {path}")
        return

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM hcd_aggregates WHERE species = 'DOG'"
        ).fetchone()[0]
        print(f"Dog OM HCD rows: {count}")

        if count > 0:
            organs = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT organ FROM hcd_aggregates WHERE species = 'DOG' ORDER BY organ"
                )
            ]
            ages = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT age_months FROM hcd_aggregates WHERE species = 'DOG' ORDER BY age_months"
                )
            ]
            print(f"Organs: {', '.join(organs)}")
            print(f"Ages (months): {', '.join(str(a) for a in ages)}")

            # Spot check
            row = conn.execute(
                "SELECT * FROM hcd_aggregates WHERE strain='BEAGLE' AND organ='LIVER' "
                "AND sex='M' AND age_months=9.0"
            ).fetchone()
            if row:
                print(f"\nSpot check -- LIVER M 9mo: mean={row['mean']}, sd={row['sd']}, "
                      f"n={row['n']}, confidence={row['confidence']}")

        # Check alias
        alias = conn.execute(
            "SELECT canonical FROM strain_aliases WHERE alias = 'BEAGLE'"
        ).fetchone()
        print(f"\nBEAGLE strain alias: {'-> ' + alias[0] if alias else 'NOT FOUND'}")

    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Dog organ weight HCD ETL")
    parser.add_argument("command", choices=["build", "info"])
    parser.add_argument("--db", type=Path, default=None, help="Custom hcd.db path")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    if args.command == "build":
        build(args.db)
    elif args.command == "info":
        info(args.db)


if __name__ == "__main__":
    main()
