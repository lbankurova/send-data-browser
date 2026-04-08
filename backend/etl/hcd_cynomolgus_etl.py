"""ETL: Load Amato 2022 cynomolgus organ weight HCD into hcd.db.

Inserts cynomolgus monkey (Macaca fascicularis) organ weight data from
Amato et al. (2022) J Med Primatol 51(5):260-277. PMC9308629.

Data: research colony (BPRC, 1997-2018), two age strata:
  - Young adult (>4-9.5y, age_months=81): 5 organs
  - Adult (>9.5-20y, age_months=177): 7 organs (adds pancreas, spleen)

L+R bilateral organ summing applied to kidney and lung.
NO sd_inflated -- colony-level SD already incorporates multi-decade variance.

Usage:
    cd backend
    python -m etl.hcd_cynomolgus_etl build     # Load data
    python -m etl.hcd_cynomolgus_etl info       # Show NHP OM HCD coverage
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
# Bilateral organ correlation coefficients for L+R SD summation.
# SD(sum) = sqrt(SD_L^2 + SD_R^2 + 2*r*SD_L*SD_R)
# ---------------------------------------------------------------------------
_BILATERAL_R_KIDNEY = 0.85  # midpoint of 0.8-0.95 range for symmetric paired organs
_BILATERAL_R_LUNG = 0.80    # lower than kidney: R>L lobe asymmetry (right lung 17% larger)


# L+R summing formula: SD(sum) = sqrt(SD_L^2 + SD_R^2 + 2*r*SD_L*SD_R)
# Applied to pre-compute summed values in _AMATO_2022_DATA below.
# Worked examples documented inline with the data constant.


# Age brackets matching _NHP_AGE_BRACKETS in hcd.py (defined independently
# per architect Issue 1 — build-time and runtime concerns separated).
_ETL_AGE_BRACKETS = [
    (30.0, 48.0, 42.0, "peripubertal"),    # >2.5-4y (not yet extracted)
    (48.0, 114.0, 81.0, "young_adult"),     # >4-9.5y
    (114.0, 240.0, 177.0, "adult"),         # >9.5-20y
]


# ---------------------------------------------------------------------------
# Amato 2022 data -- Tables: absolute organ weights (g)
# Format: (organ, age_months, sex, mean, sd, n)
# Bilateral organs pre-summed below.
# ---------------------------------------------------------------------------

# --- Young Adult (>4-9.5y) raw individual-side data for L+R summation ---
# Kidney (L): M 13.58/6.52/25, F 7.57/1.52/39
# Kidney (R): M 13.80/6.65/26, F 7.50/1.56/39
# Lung (L):   M 19.04/11.89/26, F 7.95/2.11/34
# Lung (R):   M 21.83/14.01/26, F 10.08/3.45/35

# Young adult kidney summed (r=0.85):
# M: mean=27.38, SD=sqrt(6.52^2+6.65^2+2*0.85*6.52*6.65)=sqrt(42.51+44.22+73.83)=sqrt(160.56)=12.67
# F: mean=15.07, SD=sqrt(1.52^2+1.56^2+2*0.85*1.52*1.56)=sqrt(2.31+2.43+4.04)=sqrt(8.78)=2.96

# Young adult lung summed (r=0.80):
# M: mean=40.87, SD=sqrt(11.89^2+14.01^2+2*0.80*11.89*14.01)=sqrt(141.37+196.28+266.65)=sqrt(604.30)=24.58
# F: mean=18.03, SD=sqrt(2.11^2+3.45^2+2*0.80*2.11*3.45)=sqrt(4.45+11.90+11.65)=sqrt(28.00)=5.29

# --- Adult (>9.5-20y) raw individual-side data for L+R summation ---
# Kidney (L): M 11.58/3.20/95, F 7.54/1.92/451
# Kidney (R): M 11.50/3.19/94, F 7.42/1.82/447
# Lung (L):   M 12.45/3.55/94, F 9.57/4.01/420
# Lung (R):   M 14.61/3.95/92, F 11.52/4.91/421

# Adult kidney summed (r=0.85):
# M: mean=23.08, SD=sqrt(3.20^2+3.19^2+2*0.85*3.20*3.19)=sqrt(10.24+10.18+17.37)=sqrt(37.79)=6.15
# F: mean=14.96, SD=sqrt(1.92^2+1.82^2+2*0.85*1.92*1.82)=sqrt(3.69+3.31+5.96)=sqrt(12.96)=3.60

# Adult lung summed (r=0.80):
# M: mean=27.06, SD=sqrt(3.55^2+3.95^2+2*0.80*3.55*3.95)=sqrt(12.60+15.60+22.44)=sqrt(50.64)=7.12
# F: mean=21.09, SD=sqrt(4.01^2+4.91^2+2*0.80*4.01*4.91)=sqrt(16.08+24.11+31.44)=sqrt(71.63)=8.46


_AMATO_2022_DATA: list[tuple[str, float, str, float, float, int]] = [
    # =====================================================================
    # Young Adult (>4-9.5y), age_months=81
    # =====================================================================
    # --- Brain ---
    ("BRAIN", 81.0, "M", 71.55, 7.65, 25),
    ("BRAIN", 81.0, "F", 62.23, 6.02, 39),
    # --- Heart ---
    ("HEART", 81.0, "M", 27.67, 8.45, 24),
    ("HEART", 81.0, "F", 16.76, 5.06, 39),
    # --- Kidney (summed L+R, r=0.85) ---
    ("KIDNEY", 81.0, "M", 27.38, 12.67, 25),
    ("KIDNEY", 81.0, "F", 15.07, 2.96, 39),
    # --- Liver ---
    ("LIVER", 81.0, "M", 137.82, 50.90, 27),
    ("LIVER", 81.0, "F", 83.06, 20.62, 40),
    # --- Lungs (summed L+R, r=0.80) ---
    ("LUNGS", 81.0, "M", 40.87, 24.58, 26),
    ("LUNGS", 81.0, "F", 18.03, 5.29, 34),

    # =====================================================================
    # Adult (>9.5-20y), age_months=177
    # =====================================================================
    # --- Brain ---
    ("BRAIN", 177.0, "M", 68.29, 6.97, 89),
    ("BRAIN", 177.0, "F", 60.40, 5.49, 454),
    # --- Heart ---
    ("HEART", 177.0, "M", 32.66, 9.04, 96),
    ("HEART", 177.0, "F", 18.66, 5.27, 450),
    # --- Kidney (summed L+R, r=0.85) ---
    ("KIDNEY", 177.0, "M", 23.08, 6.15, 94),
    ("KIDNEY", 177.0, "F", 14.96, 3.60, 447),
    # --- Liver ---
    ("LIVER", 177.0, "M", 131.93, 48.03, 96),
    ("LIVER", 177.0, "F", 81.02, 24.69, 444),
    # --- Lungs (summed L+R, r=0.80) ---
    ("LUNGS", 177.0, "M", 27.06, 7.12, 92),
    ("LUNGS", 177.0, "F", 21.09, 8.46, 420),
    # --- Pancreas ---
    ("PANCREAS", 177.0, "M", 8.68, 2.33, 90),
    ("PANCREAS", 177.0, "F", 6.45, 1.90, 429),
    # --- Spleen ---
    ("SPLEEN", 177.0, "M", 14.74, 7.75, 96),
    ("SPLEEN", 177.0, "F", 8.21, 4.05, 432),
]


def _confidence(n: int) -> str:
    """Assign confidence tier based on sample size."""
    if n >= 20:
        return "HIGH"
    if n >= 10:
        return "MODERATE"
    return "LOW"


def _add_strain_alias(conn: sqlite3.Connection) -> None:
    """Add CYNOMOLGUS strain alias."""
    existing = conn.execute(
        "SELECT canonical FROM strain_aliases WHERE alias = 'CYNOMOLGUS'"
    ).fetchone()
    if existing:
        log.info("CYNOMOLGUS alias already exists -> %s", existing[0])
        return
    conn.execute(
        "INSERT INTO strain_aliases (alias, canonical) VALUES ('CYNOMOLGUS', 'CYNOMOLGUS')"
    )
    conn.commit()
    log.info("Added strain alias CYNOMOLGUS -> CYNOMOLGUS")


def _load_amato_2022(conn: sqlite3.Connection) -> int:
    """Insert Amato 2022 data into hcd_aggregates. Returns row count."""
    # Clear any previous NHP data to make idempotent
    deleted = conn.execute(
        "DELETE FROM hcd_aggregates WHERE species = 'MONKEY' AND source = 'AMATO2022'"
    ).rowcount
    if deleted > 0:
        log.info("Cleared %d existing AMATO2022 rows", deleted)

    count = 0
    for organ, age_months, sex, mean, sd, n in _AMATO_2022_DATA:
        lower_2sd = round(mean - 2 * sd, 6)
        upper_2sd = round(mean + 2 * sd, 6)
        confidence = _confidence(n)

        # NO sd_inflated for Amato colony data -- 20+ years of colony records
        # already incorporate between-animal, between-time-period variance.
        # Inflating further would double-count, suppressing A-3 flags.

        conn.execute(
            """INSERT INTO hcd_aggregates
               (strain, sex, organ, duration_category, n, mean, sd,
                p5, p25, median, p75, p95, min_val, max_val,
                lower_2sd, upper_2sd, study_count,
                species, age_months, source, confidence, sd_inflated)
               VALUES (?, ?, ?, ?, ?, ?, ?,
                       NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                       ?, ?, 1,
                       'MONKEY', ?, 'AMATO2022', ?, NULL)""",
            (
                "CYNOMOLGUS", sex, organ,
                # duration_category: not applicable for age-based lookup,
                # but column is NOT NULL in original schema -- use age label
                f"{int(age_months)}mo",
                n, round(mean, 6), round(sd, 6),
                lower_2sd, upper_2sd,
                age_months, confidence,
            ),
        )
        count += 1

    conn.commit()
    return count


def build(db_path: Path | None = None) -> None:
    """Run full ETL: add alias, load data."""
    path = db_path or HCD_DB_PATH
    if not path.exists():
        print(f"ERROR: hcd.db not found at {path}")
        sys.exit(1)

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        _add_strain_alias(conn)
        count = _load_amato_2022(conn)
        print(f"Loaded {count} Amato 2022 cynomolgus organ weight rows into hcd_aggregates")
    finally:
        conn.close()


def info(db_path: Path | None = None) -> None:
    """Show NHP OM HCD coverage summary."""
    path = db_path or HCD_DB_PATH
    if not path.exists():
        print(f"hcd.db not found at {path}")
        return

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM hcd_aggregates WHERE species = 'MONKEY'"
        ).fetchone()[0]
        print(f"NHP OM HCD rows: {count}")

        if count > 0:
            organs = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT organ FROM hcd_aggregates WHERE species = 'MONKEY' ORDER BY organ"
                )
            ]
            ages = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT age_months FROM hcd_aggregates WHERE species = 'MONKEY' ORDER BY age_months"
                )
            ]
            print(f"Organs: {', '.join(organs)}")
            print(f"Ages (months): {', '.join(str(a) for a in ages)}")

            # Spot check -- kidney adult M (summed L+R)
            row = conn.execute(
                "SELECT * FROM hcd_aggregates WHERE strain='CYNOMOLGUS' AND organ='KIDNEY' "
                "AND sex='M' AND age_months=177.0"
            ).fetchone()
            if row:
                print(f"\nSpot check -- KIDNEY M adult: mean={row['mean']}, sd={row['sd']}, "
                      f"n={row['n']}, confidence={row['confidence']}, "
                      f"sd_inflated={row['sd_inflated']}")

        # Check alias
        alias = conn.execute(
            "SELECT canonical FROM strain_aliases WHERE alias = 'CYNOMOLGUS'"
        ).fetchone()
        print(f"\nCYNOMOLGUS strain alias: {'-> ' + alias[0] if alias else 'NOT FOUND'}")

    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cynomolgus organ weight HCD ETL")
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
