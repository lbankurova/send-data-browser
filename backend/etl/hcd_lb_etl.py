"""ETL: Seed LB HCD data → extend pipeline's hcd.db with clinical pathology ranges.

Reads from ``docs/_internal/research/hcd/hcd_seed.sqlite`` (5 species sources,
1,068 LB reference rows) and loads into ``backend/data/hcd.db`` alongside the
existing OM organ-weight tables.

Data quality conversions applied:
  - Rabbit (Ozkan 2012): SEM → SD  (SD = SEM * sqrt(n))
  - ViCoG (Wistar Han): Log-normal params → tolerance interval bounds used directly
  - He 2017 (SD rat): Percentile-only → pct_2.5 / pct_97.5 used as bounds
  - Cynomolgus (Kim 2016): ALP flagged as unreliable in metadata (bone isoform)

Usage:
    cd backend
    python -m etl.hcd_lb_etl build              # Build LB tables into hcd.db
    python -m etl.hcd_lb_etl build --seed path   # Use custom seed path
    python -m etl.hcd_lb_etl info                # Show LB coverage summary
"""

from __future__ import annotations

import argparse
import datetime
import logging
import math
import sqlite3
import sys
from pathlib import Path

from config import HCD_DB_PATH

log = logging.getLogger(__name__)

# Default location of the seed database
_DEFAULT_SEED = (
    Path(__file__).resolve().parent.parent.parent
    / "docs" / "_internal" / "research" / "hcd" / "hcd_seed.sqlite"
)

# ---------------------------------------------------------------------------
# Species normalization: map common TS SPECIES values → canonical keys
# ---------------------------------------------------------------------------
SPECIES_ALIASES: dict[str, str] = {
    # Rat
    "RAT": "RAT",
    "RATS": "RAT",
    "SPRAGUE-DAWLEY": "RAT",
    "SPRAGUE DAWLEY": "RAT",
    "SD RAT": "RAT",
    "WISTAR": "RAT",
    "WISTAR HAN": "RAT",
    "HAN WISTAR": "RAT",
    "FISCHER 344": "RAT",
    "F344": "RAT",
    "LONG-EVANS": "RAT",
    # Dog
    "DOG": "DOG",
    "DOGS": "DOG",
    "BEAGLE": "DOG",
    "BEAGLE DOG": "DOG",
    # Rabbit
    "RABBIT": "RABBIT",
    "RABBITS": "RABBIT",
    "NZW RABBIT": "RABBIT",
    "NEW ZEALAND WHITE": "RABBIT",
    "NEW ZEALAND WHITE RABBIT": "RABBIT",
    # Primate (NHP)
    "PRIMATE": "PRIMATE",
    "MONKEY": "PRIMATE",
    "MONKEYS": "PRIMATE",
    "CYNOMOLGUS": "PRIMATE",
    "CYNOMOLGUS MONKEY": "PRIMATE",
    "MACACA FASCICULARIS": "PRIMATE",
    "RHESUS": "PRIMATE",
    "RHESUS MONKEY": "PRIMATE",
    "MACACA MULATTA": "PRIMATE",
}

# Strain aliases for LB — maps raw TS STRAIN values to seed DB strain keys
STRAIN_ALIASES: dict[str, str] = {
    # Cynomolgus
    "CYNOMOLGUS": "CYNOMOLGUS",
    "VIETNAMESE": "CYNOMOLGUS",
    "MAURITIAN": "CYNOMOLGUS",  # same species, different origin
    # NZW rabbit
    "NZW": "NZW",
    "NEW ZEALAND WHITE": "NZW",
    # Beagle
    "BEAGLE": "BEAGLE",
    # SD rat
    "SD": "SD",
    "SPRAGUE-DAWLEY": "SD",
    "SPRAGUE DAWLEY": "SD",
    "HSD:SD": "SD",
    "CRL:CD(SD)": "SD",
    "CD(SD)": "SD",
    "HSD:SPRAGUE DAWLEY SD": "SD",
    "HSD:SPRAGUE DAWLEY": "SD",
    "SD_SICHUAN_CDC": "SD",
    # Wistar Han rat
    "WISTAR HAN": "WISTAR_HAN",
    "WISTAR HAN IGS": "WISTAR_HAN",
    "WI(HAN)": "WISTAR_HAN",
    "CRL:WI(HAN)": "WISTAR_HAN",
    "WISTAR HAN [CRL:WI(HAN)]": "WISTAR_HAN",
    "HAN WISTAR": "WISTAR_HAN",
    "WISTAR_HAN": "WISTAR_HAN",
}

# ---------------------------------------------------------------------------
# ViCoG body-weight-class → duration category mapping
# From acquisition report Section 3 (body weight class tables)
# ---------------------------------------------------------------------------
# We pick representative BW midpoints for each study type.
# For pipeline matching, we aggregate across relevant BW bins.

_VICOG_BW_DURATION_MAP_F: dict[str, list[tuple[int, int]]] = {
    # 28-day study: female BW 160–240g at terminal
    "28-day": [(160, 180), (180, 200), (200, 220), (220, 240)],
    # 90-day study: female BW 220–300g
    "90-day": [(220, 240), (240, 260), (260, 280), (280, 300)],
}

_VICOG_BW_DURATION_MAP_M: dict[str, list[tuple[int, int]]] = {
    # 28-day study: male BW 220–340g at terminal
    "28-day": [(220, 240), (240, 260), (260, 280), (280, 300), (300, 320), (320, 340)],
    # 90-day study: male BW 340–500g
    "90-day": [(340, 360), (360, 380), (380, 400), (400, 420),
               (420, 440), (440, 460), (460, 480), (480, 500)],
}

# Cynomolgus ALP — flagged as unreliable in young animals
_ALP_UNRELIABLE_SPECIES = {"PRIMATE", "DOG"}


# ---------------------------------------------------------------------------
# LB schema additions to hcd.db
# ---------------------------------------------------------------------------

_LB_SCHEMA = """
CREATE TABLE IF NOT EXISTS hcd_lb_aggregates (
    species TEXT NOT NULL,
    strain TEXT,
    sex TEXT NOT NULL,
    test_code TEXT NOT NULL,
    duration_category TEXT NOT NULL,
    n INTEGER NOT NULL,
    mean REAL,
    sd REAL,
    geom_mean REAL,
    geom_sd REAL,
    lower REAL NOT NULL,
    upper REAL NOT NULL,
    median REAL,
    p5 REAL,
    p95 REAL,
    unit TEXT,
    source TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'MODERATE',
    notes TEXT,
    PRIMARY KEY (species, strain, sex, test_code, duration_category)
);

CREATE TABLE IF NOT EXISTS hcd_lb_species_aliases (
    alias TEXT PRIMARY KEY,
    canonical TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hcd_lb_strain_aliases (
    alias TEXT PRIMARY KEY,
    canonical_strain TEXT NOT NULL,
    canonical_species TEXT NOT NULL
);
"""


# ---------------------------------------------------------------------------
# Core ETL functions
# ---------------------------------------------------------------------------

def _convert_rabbit_sem_to_sd(sem: float | None, n: int | None) -> float | None:
    """Convert SEM to SD: SD = SEM * sqrt(n)."""
    if sem is None or n is None or n <= 0:
        return None
    return sem * math.sqrt(n)


def _compute_bounds_mean_sd(mean: float, sd: float) -> tuple[float, float]:
    """Compute lower/upper as mean +/- 2*SD."""
    return (mean - 2 * sd, mean + 2 * sd)


def _aggregate_vicog_bw_classes(
    seed_conn: sqlite3.Connection,
    test_code: str,
    sex: str,
    bw_ranges: list[tuple[int, int]],
) -> dict | None:
    """Aggregate ViCoG data across body-weight bins for a duration category.

    For log-normal parameters (geom_mean not null, mean null):
      Uses tolerance interval bounds (pct_2_5 / pct_97_5) weighted by n.
      Center = weighted geometric mean.

    For normal parameters (mean not null):
      Computes weighted mean + pooled SD.
    """
    placeholders = " OR ".join(
        "(bw_class_g_min = ? AND bw_class_g_max = ?)" for _ in bw_ranges
    )
    params: list = []
    for lo, hi in bw_ranges:
        params.extend([lo, hi])

    rows = seed_conn.execute(
        f"""SELECT n, mean_val, sd_val, geom_mean_val, geom_sd_val,
                   pct_2_5, pct_10, pct_90, pct_97_5, lborresu, confidence_lvl
            FROM hcd_lb
            WHERE source_id = 'VICOG2025'
              AND lbtestcd = ? AND sex = ?
              AND ({placeholders})""",
        [test_code, sex] + params,
    ).fetchall()

    if not rows:
        return None

    total_n = sum(r[0] for r in rows if r[0])
    if total_n == 0:
        return None

    # Check if this is a log-normal param (geom_mean present, mean absent)
    is_lognormal = rows[0][1] is None and rows[0][3] is not None

    if is_lognormal:
        # Weighted geometric mean and tolerance interval bounds
        # Weight tolerance intervals by n
        w_lower = 0.0
        w_upper = 0.0
        w_geom_mean = 0.0
        for r in rows:
            n_i = r[0] or 0
            gm = r[3]  # geom_mean_val
            lb = r[5]  # pct_2_5
            ub = r[8]  # pct_97_5
            if n_i > 0 and gm is not None and lb is not None and ub is not None:
                w_geom_mean += n_i * gm
                w_lower += n_i * lb
                w_upper += n_i * ub

        if total_n > 0:
            return {
                "mean": None,
                "sd": None,
                "geom_mean": round(w_geom_mean / total_n, 6),
                "geom_sd": None,  # pooled GSD not meaningful
                "lower": round(w_lower / total_n, 6),
                "upper": round(w_upper / total_n, 6),
                "median": None,
                "p5": None,
                "p95": None,
                "n": total_n,
                "unit": rows[0][9],
                "confidence": rows[0][10] or "HIGH",
            }
    else:
        # Normal parameters: pooled mean + SD
        w_mean = 0.0
        w_var = 0.0
        for r in rows:
            n_i = r[0] or 0
            m = r[1]  # mean_val
            s = r[2]  # sd_val
            if n_i > 0 and m is not None and s is not None:
                w_mean += n_i * m
                # Pooled variance: sum of (n_i - 1)*s_i^2
                w_var += (n_i - 1) * s * s

        pooled_mean = w_mean / total_n
        pooled_sd = math.sqrt(w_var / (total_n - len(rows))) if total_n > len(rows) else 0
        lower, upper = _compute_bounds_mean_sd(pooled_mean, pooled_sd)

        return {
            "mean": round(pooled_mean, 6),
            "sd": round(pooled_sd, 6),
            "geom_mean": None,
            "geom_sd": None,
            "lower": round(lower, 6),
            "upper": round(upper, 6),
            "median": None,
            "p5": None,
            "p95": None,
            "n": total_n,
            "unit": rows[0][9],
            "confidence": rows[0][10] or "HIGH",
        }

    return None


def _process_source_kim2016(seed_conn: sqlite3.Connection) -> list[tuple]:
    """Process Kim 2016 cynomolgus monkey data.

    Standard mean + SD. No conversion needed. All duration categories
    covered (young adult animals 2-5 years, usable for any study duration).
    """
    rows = seed_conn.execute(
        """SELECT species, strain, sex, lbtestcd, lbtest, lborresu,
                  n, mean_val, sd_val, confidence_lvl, notes
           FROM hcd_lb WHERE source_id = 'KIM2016'
           AND mean_val IS NOT NULL AND sd_val IS NOT NULL"""
    ).fetchall()

    records = []
    for r in rows:
        species, strain, sex, testcd, test_name, unit = r[0], r[1], r[2], r[3], r[4], r[5]
        n, mean, sd, conf, notes = r[6], r[7], r[8], r[9], r[10]

        if n is None or n == 0 or mean is None or sd is None:
            continue

        lower, upper = _compute_bounds_mean_sd(mean, sd)

        # Flag ALP as unreliable in young cynomolgus
        note = notes or ""
        if testcd == "ALP":
            note = (note + " " if note else "") + "CAUTION: ALP dominated by bone isoform in young animals (2-5yr). Not reliable as hepatotoxicity marker."

        # Add for all standard duration categories
        for dur_cat in ("28-day", "90-day", "chronic"):
            records.append((
                species, strain, sex, testcd, dur_cat,
                n, mean, sd, None, None,  # no geom_mean/geom_sd
                round(lower, 6), round(upper, 6),
                None, None, None,  # no median, p5, p95
                unit, f"Kim2016 (PMC4931040)", conf or "MODERATE",
                note,
            ))

    return records


def _process_source_ozkan2012(seed_conn: sqlite3.Connection) -> list[tuple]:
    """Process Ozkan 2012 rabbit data.

    Converts SEM to SD: SD = SEM * sqrt(n).
    Low confidence (n=24M, n=16F).
    """
    rows = seed_conn.execute(
        """SELECT species, strain, sex, lbtestcd, lbtest, lborresu,
                  n, mean_val, sem_val, confidence_lvl, notes
           FROM hcd_lb WHERE source_id IN ('OZKAN2012', 'OZKAN2012_DERIVED')"""
    ).fetchall()

    records = []
    for r in rows:
        species, strain, sex, testcd, test_name, unit = r[0], r[1], r[2], r[3], r[4], r[5]
        n, mean, sem, conf, notes = r[6], r[7], r[8], r[9], r[10]

        if n is None or n == 0 or mean is None:
            continue

        # SEM → SD conversion
        if sem is not None:
            sd = _convert_rabbit_sem_to_sd(sem, n)
        else:
            sd = None

        if sd is None or sd <= 0:
            # For derived values (OZKAN2012_DERIVED) that lack SEM, we cannot compute SD.
            # Store with wide bounds based on mean * 50% as a conservative estimate.
            sd = abs(mean) * 0.5 if mean != 0 else 1.0

        lower, upper = _compute_bounds_mean_sd(mean, sd)

        note = (notes or "") + f" SEM={sem} converted to SD={sd:.4f} (SD=SEM*sqrt({n}))."

        # Rabbit studies are typically 28-day, but we also allow 90-day
        for dur_cat in ("28-day", "90-day"):
            records.append((
                species, strain, sex, testcd, dur_cat,
                n, round(mean, 6), round(sd, 6), None, None,
                round(lower, 6), round(upper, 6),
                None, None, None,
                unit, "Ozkan2012 (WRS 20:253)", conf or "LOW",
                note.strip(),
            ))

    return records


def _process_source_vicog2025(seed_conn: sqlite3.Connection) -> list[tuple]:
    """Process ViCoG 2025 Wistar Han rat data.

    Body-weight-stratified data aggregated into duration categories.
    Log-normal params: use tolerance interval bounds directly.
    Normal params: pooled mean + SD.
    """
    # Get distinct test codes
    test_codes = [r[0] for r in seed_conn.execute(
        "SELECT DISTINCT lbtestcd FROM hcd_lb WHERE source_id = 'VICOG2025'"
    )]

    records = []
    for testcd in test_codes:
        for sex in ("M", "F"):
            bw_map = _VICOG_BW_DURATION_MAP_M if sex == "M" else _VICOG_BW_DURATION_MAP_F

            for dur_cat, bw_ranges in bw_map.items():
                agg = _aggregate_vicog_bw_classes(seed_conn, testcd, sex, bw_ranges)
                if agg is None:
                    continue

                note = f"ViCoG BW-class aggregation for {dur_cat}"
                if agg["mean"] is None and agg["geom_mean"] is not None:
                    note += " (log-normal: tolerance interval bounds)"
                else:
                    note += " (normal: pooled mean+SD)"

                if testcd == "ALP":
                    note += " CAUTION: ALP has large body weight effect (partial eta^2 >= 0.30 for males)."

                records.append((
                    "RAT", "WISTAR_HAN", sex, testcd, dur_cat,
                    agg["n"],
                    agg["mean"], agg["sd"],
                    agg["geom_mean"], agg["geom_sd"],
                    agg["lower"], agg["upper"],
                    agg["median"], agg["p5"], agg["p95"],
                    agg["unit"], "ViCoG2025 (Frontiers Tox 7:1684191)",
                    agg["confidence"],
                    note,
                ))

    return records


def _process_source_he2017(seed_conn: sqlite3.Connection) -> list[tuple]:
    """Process He 2017 SD rat data.

    Nonparametric reference intervals: pct_2.5 and pct_97.5 are the bounds.
    mean/SD are NULL — use median as center.
    28-day context only (9-week-old rats).
    """
    rows = seed_conn.execute(
        """SELECT species, strain, sex, lbtestcd, lbtest, lborresu,
                  n, pct_2_5, pct_97_5, median_val, confidence_lvl, notes
           FROM hcd_lb WHERE source_id = 'HE2017'"""
    ).fetchall()

    records = []
    for r in rows:
        species, strain, sex, testcd, test_name, unit = r[0], r[1], r[2], r[3], r[4], r[5]
        n, lower, upper, median, conf, notes = r[6], r[7], r[8], r[9], r[10], r[11]

        if n is None or lower is None or upper is None:
            continue

        # sex = "BOTH" in He 2017 means combined M+F — store for both
        sexes = ["M", "F"] if sex == "BOTH" else [sex]

        for s in sexes:
            note = (notes or "") + " Nonparametric RI (CLSI C28-A3)."

            # 28-day context only
            records.append((
                species, strain, s, testcd, "28-day",
                n,
                None, None,  # no mean/sd
                None, None,  # no geom_mean/geom_sd
                round(lower, 6), round(upper, 6),
                round(median, 6) if median is not None else None,
                None, None,  # no p5/p95 beyond the RI bounds
                unit, "He2017 (PLOS ONE 12:e0189837)", conf or "HIGH",
                note.strip(),
            ))

    return records


def _process_source_choi2011(seed_conn: sqlite3.Connection) -> list[tuple]:
    """Process Choi 2011 beagle dog data.

    Standard mean + SD. Multiple age groups (6, 7, 9 months).
    Use 6-month data as primary (HIGH confidence, largest n).
    When multiple age groups map to the same duration category,
    keep the one with the highest confidence and largest n.
    """
    rows = seed_conn.execute(
        """SELECT species, strain, sex, lbtestcd, lbtest, lborresu,
                  n, mean_val, sd_val, age_mo_min, age_mo_max,
                  confidence_lvl, notes
           FROM hcd_lb WHERE source_id = 'CHOI2011'
           AND mean_val IS NOT NULL AND sd_val IS NOT NULL"""
    ).fetchall()

    # Confidence ranking: HIGH > MODERATE > LOW
    _CONF_RANK = {"HIGH": 3, "MODERATE": 2, "LOW": 1}

    # Build best-entry dict: key = (species, strain, sex, testcd, dur_cat) -> record
    best: dict[tuple, tuple] = {}

    for r in rows:
        species, strain, sex, testcd, test_name, unit = r[0], r[1], r[2], r[3], r[4], r[5]
        n, mean, sd, age_min, age_max, conf, notes = r[6], r[7], r[8], r[9], r[10], r[11], r[12]

        if n is None or n == 0 or mean is None or sd is None or sd <= 0:
            continue

        lower, upper = _compute_bounds_mean_sd(mean, sd)

        note = notes or ""
        # Flag ALP as unreliable in young beagles
        if testcd == "ALP":
            note = (note + " " if note else "") + "CAUTION: ALP dominated by bone isoform in young dogs (<18mo). Not reliable as hepatotoxicity marker."

        # Map age to duration category
        age = age_min or 6
        if age <= 7:
            dur_cats = ["28-day", "90-day"]
        else:
            dur_cats = ["90-day", "chronic"]

        for dur_cat in dur_cats:
            key = (species, strain, sex, testcd, dur_cat)
            record = (
                species, strain, sex, testcd, dur_cat,
                n, round(mean, 6), round(sd, 6), None, None,
                round(lower, 6), round(upper, 6),
                None, None, None,
                unit, f"Choi2011 (PMC3251758) age={age}mo", conf or "MODERATE",
                note.strip(),
            )

            if key not in best:
                best[key] = record
            else:
                # Prefer higher confidence, then larger n
                existing = best[key]
                existing_rank = _CONF_RANK.get(existing[17], 0)
                new_rank = _CONF_RANK.get(conf or "MODERATE", 0)
                if new_rank > existing_rank or (new_rank == existing_rank and n > existing[5]):
                    best[key] = record

    return list(best.values())


def _build_aliases(conn: sqlite3.Connection) -> None:
    """Populate species and strain alias tables."""
    species_aliases = [(k.strip().upper(), v) for k, v in SPECIES_ALIASES.items()]
    conn.executemany(
        "INSERT OR REPLACE INTO hcd_lb_species_aliases (alias, canonical) VALUES (?, ?)",
        species_aliases,
    )

    strain_aliases = []
    # Map strain alias → (canonical_strain, canonical_species)
    strain_species_map = {
        "CYNOMOLGUS": "PRIMATE",
        "NZW": "RABBIT",
        "BEAGLE": "DOG",
        "SD": "RAT",
        "WISTAR_HAN": "RAT",
    }
    for alias, canonical_strain in STRAIN_ALIASES.items():
        species = strain_species_map.get(canonical_strain, "UNKNOWN")
        strain_aliases.append((alias.strip().upper(), canonical_strain, species))

    conn.executemany(
        "INSERT OR REPLACE INTO hcd_lb_strain_aliases (alias, canonical_strain, canonical_species) VALUES (?, ?, ?)",
        strain_aliases,
    )


def build_lb(seed_path: Path | None = None, db_path: Path | None = None) -> Path:
    """Load LB HCD data from seed database into pipeline's hcd.db.

    Adds tables alongside existing OM tables — does NOT modify OM data.
    """
    if seed_path is None:
        seed_path = _DEFAULT_SEED
    if db_path is None:
        db_path = HCD_DB_PATH

    if not seed_path.exists():
        print(f"Seed database not found: {seed_path}")
        sys.exit(1)

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        print("Run OM ETL first: python -m etl.hcd_etl build")
        sys.exit(1)

    print(f"Reading seed data from {seed_path} ...")
    seed_conn = sqlite3.connect(str(seed_path))

    total_seed = seed_conn.execute("SELECT COUNT(*) FROM hcd_lb").fetchone()[0]
    print(f"  Seed database: {total_seed} LB rows")

    # Process each source
    print("  Processing Kim 2016 (cynomolgus monkey) ...")
    kim_records = _process_source_kim2016(seed_conn)
    print(f"    {len(kim_records)} records")

    print("  Processing Ozkan 2012 (NZW rabbit, SEM->SD conversion) ...")
    ozkan_records = _process_source_ozkan2012(seed_conn)
    print(f"    {len(ozkan_records)} records")

    print("  Processing ViCoG 2025 (Wistar Han, BW-class aggregation) ...")
    vicog_records = _process_source_vicog2025(seed_conn)
    print(f"    {len(vicog_records)} records")

    print("  Processing He 2017 (SD rat, nonparametric RI) ...")
    he_records = _process_source_he2017(seed_conn)
    print(f"    {len(he_records)} records")

    print("  Processing Choi 2011 (beagle dog) ...")
    choi_records = _process_source_choi2011(seed_conn)
    print(f"    {len(choi_records)} records")

    seed_conn.close()

    all_records = kim_records + ozkan_records + vicog_records + he_records + choi_records
    print(f"\n  Total LB records to load: {len(all_records)}")

    # Open target database and add LB tables
    conn = sqlite3.connect(str(db_path))
    conn.executescript(_LB_SCHEMA)

    # Clear existing LB data (idempotent rebuild)
    conn.execute("DELETE FROM hcd_lb_aggregates")
    conn.execute("DELETE FROM hcd_lb_species_aliases")
    conn.execute("DELETE FROM hcd_lb_strain_aliases")

    # Insert aggregates
    conn.executemany(
        """INSERT OR REPLACE INTO hcd_lb_aggregates
           (species, strain, sex, test_code, duration_category,
            n, mean, sd, geom_mean, geom_sd,
            lower, upper,
            median, p5, p95,
            unit, source, confidence, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        all_records,
    )

    # Build aliases
    _build_aliases(conn)

    # ETL metadata
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_etl_timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_seed_file", str(seed_path)),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_n_records", str(len(all_records))),
    )

    conn.commit()

    # Summary
    print(f"\n  Loaded {len(all_records)} LB aggregate records into {db_path}")

    # Coverage summary
    cursor = conn.execute("""
        SELECT species, strain, COUNT(*) as n_entries,
               COUNT(DISTINCT test_code) as n_tests,
               COUNT(DISTINCT duration_category) as n_durs,
               GROUP_CONCAT(DISTINCT confidence) as conf_levels
        FROM hcd_lb_aggregates
        GROUP BY species, strain
        ORDER BY species, strain
    """)
    print(f"\n  {'Species':<10} {'Strain':<15} {'Entries':>8} {'Tests':>6} {'Durs':>5} {'Conf':>20}")
    print(f"  {'-'*10} {'-'*15} {'-'*8} {'-'*6} {'-'*5} {'-'*20}")
    for row in cursor:
        print(f"  {row[0]:<10} {row[1] or '—':<15} {row[2]:>8} {row[3]:>6} {row[4]:>5} {row[5]:>20}")

    # Alias counts
    species_count = conn.execute("SELECT COUNT(*) FROM hcd_lb_species_aliases").fetchone()[0]
    strain_count = conn.execute("SELECT COUNT(*) FROM hcd_lb_strain_aliases").fetchone()[0]
    print(f"\n  Species aliases: {species_count}")
    print(f"  Strain aliases: {strain_count}")

    conn.close()
    return db_path


def show_info(db_path: Path | None = None) -> None:
    """Print LB HCD coverage summary."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))

    # Check if LB tables exist
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if "hcd_lb_aggregates" not in tables:
        print("No LB tables in hcd.db. Run: python -m etl.hcd_lb_etl build")
        conn.close()
        return

    total = conn.execute("SELECT COUNT(*) FROM hcd_lb_aggregates").fetchone()[0]
    print(f"=== LB HCD Coverage ({total} records) ===\n")

    # By species/strain
    cursor = conn.execute("""
        SELECT species, strain, COUNT(*) as entries,
               COUNT(DISTINCT test_code) as tests,
               COUNT(DISTINCT sex) as sexes,
               COUNT(DISTINCT duration_category) as durs,
               GROUP_CONCAT(DISTINCT confidence) as conf
        FROM hcd_lb_aggregates
        GROUP BY species, strain
        ORDER BY species, strain
    """)
    print(f"{'Species':<10} {'Strain':<15} {'Entries':>8} {'Tests':>6} {'Sexes':>6} {'Durs':>5} {'Confidence':>20}")
    print(f"{'-'*10} {'-'*15} {'-'*8} {'-'*6} {'-'*6} {'-'*5} {'-'*20}")
    for row in cursor:
        print(f"{row[0]:<10} {row[1] or '—':<15} {row[2]:>8} {row[3]:>6} {row[4]:>6} {row[5]:>5} {row[6]:>20}")

    # Test codes by species
    print("\n=== Test Codes by Species ===")
    for species in conn.execute("SELECT DISTINCT species FROM hcd_lb_aggregates ORDER BY species"):
        codes = [r[0] for r in conn.execute(
            "SELECT DISTINCT test_code FROM hcd_lb_aggregates WHERE species = ? ORDER BY test_code",
            (species[0],),
        )]
        print(f"\n  {species[0]}: {len(codes)} test codes")
        # Print in rows of 10
        for i in range(0, len(codes), 10):
            print(f"    {', '.join(codes[i:i+10])}")

    conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="HCD LB ETL: Seed database → pipeline hcd.db (LB domain)",
    )
    sub = parser.add_subparsers(dest="command")

    bd = sub.add_parser("build", help="Build LB tables into hcd.db from seed data")
    bd.add_argument("--seed", type=Path, help="Path to hcd_seed.sqlite")
    bd.add_argument("--db", type=Path, help="Target hcd.db path")

    sub.add_parser("info", help="Show LB HCD coverage summary")

    args = parser.parse_args()

    if args.command == "build":
        build_lb(args.seed, args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
