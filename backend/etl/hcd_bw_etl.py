"""ETL: NTP DTT IAD Terminal Bodyweight Excel -> SQLite HCD database (BW domain).

Downloads the Integrated Animal Data (IAD) terminal bodyweight file from NTP/CEBS,
filters to control animals, normalizes strain/organ names, loads into SQLite,
and pre-computes aggregate statistics for HCD BW reference range lookups.

Also loads non-rodent BW seed data from published sources (Choi 2011, PMC4900550).

Usage:
    cd backend
    python -m etl.hcd_bw_etl download   # Download Excel from CEBS (~77 MB)
    python -m etl.hcd_bw_etl build       # Parse Excel -> build BW tables in hcd.db
    python -m etl.hcd_bw_etl build --xlsx path/to/file.xlsx  # Use local file
    python -m etl.hcd_bw_etl info        # Show BW coverage summary
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from config import HCD_DB_PATH, ETL_DATA_DIR
from etl.hcd_etl import NTP_STRAIN_MAP, _days_to_category

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CEBS_BW_URL = (
    "https://cebs-ext.niehs.nih.gov/cahs/file/download/datasets/"
    "Terminal_Bodyweight_IAD/202602_Terminal_Bodyweight_IAD.xlsx"
)
DEFAULT_BW_FILENAME = "202602_Terminal_Bodyweight_IAD.xlsx"

# ---------------------------------------------------------------------------
# BW-specific column discovery
# ---------------------------------------------------------------------------

_BW_COLUMN_SEMANTICS: list[tuple[str, list[str]]] = [
    ("study_id",       ["dtt original study id", "study_id", "study id", "studyid"]),
    ("animal_id",      ["unique cebs subject identifier", "subject identifier in study",
                        "animal_id", "animal id"]),
    ("strain",         ["strain"]),
    ("species",        ["species"]),
    ("sex",            ["sex"]),
    ("route",          ["route"]),
    ("vehicle",        ["vehicle"]),
    ("body_weight_g",  ["assay result", "original value adjusted", "body weight",
                        "body wt", "body_weight", "terminal body weight"]),
    ("assay_unit",     ["assay unit", "standard unit"]),
    ("dose",           ["dose"]),
    ("treatment_role", ["treatment role"]),
    ("exposure_dur",   ["exposure duration"]),
    ("exposure_unit",  ["exposure duration unit"]),
    ("study_year",     ["study start year", "year", "study year"]),
]


def _discover_bw_columns(df: pd.DataFrame) -> dict[str, str]:
    """Map semantic column names to actual DataFrame column names for BW data."""
    actual_cols = {c.strip().lower(): c for c in df.columns}
    mapping: dict[str, str] = {}
    used_cols: set[str] = set()

    for target, patterns in _BW_COLUMN_SEMANTICS:
        matched = None
        for pat in patterns:
            pat_lower = pat.lower()
            if pat_lower in actual_cols and actual_cols[pat_lower] not in used_cols:
                matched = actual_cols[pat_lower]
                break
        if not matched:
            candidates = []
            for pat in patterns:
                pat_lower = pat.lower()
                for col_lower, col_orig in actual_cols.items():
                    if col_orig in used_cols:
                        continue
                    if pat_lower == col_lower:
                        candidates.append(col_orig)
                    elif pat_lower in col_lower:
                        candidates.append(col_orig)
            if candidates:
                matched = min(candidates, key=len)
        if matched:
            mapping[target] = matched
            used_cols.add(matched)

    required = {"strain", "sex", "body_weight_g"}
    missing = required - set(mapping.keys())
    if missing:
        raise ValueError(
            f"Required BW columns not found: {missing}. "
            f"Available: {list(df.columns)[:30]}. "
            f"Mapped so far: {mapping}"
        )
    return mapping


# ---------------------------------------------------------------------------
# Duration parsing (reuse from hcd_etl)
# ---------------------------------------------------------------------------

def _parse_duration_value(val) -> int | None:
    """Parse various duration formats to days."""
    import re
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, (int, float)):
        v = int(val)
        return v if v > 0 else None
    s = str(val).strip().upper()
    try:
        v = int(float(s))
        return v if v > 0 else None
    except (ValueError, TypeError):
        pass
    m = re.match(r"(\d+)\s*(DAY|WEEK|MONTH|YEAR)S?", s)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit == "DAY": return n
        if unit == "WEEK": return n * 7
        if unit == "MONTH": return n * 30
        if unit == "YEAR": return n * 365
    return None


# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------

_BW_SCHEMA = """
CREATE TABLE IF NOT EXISTS hcd_bw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT,
    animal_id TEXT,
    strain TEXT NOT NULL,
    species TEXT NOT NULL,
    sex TEXT NOT NULL,
    route TEXT,
    vehicle TEXT,
    body_weight_g REAL NOT NULL,
    duration_days INTEGER,
    duration_category TEXT,
    study_year INTEGER
);

CREATE TABLE IF NOT EXISTS hcd_bw_aggregates (
    species TEXT NOT NULL,
    strain TEXT NOT NULL,
    sex TEXT NOT NULL,
    duration_category TEXT NOT NULL,
    n INTEGER NOT NULL,
    mean REAL NOT NULL,
    sd REAL NOT NULL,
    p5 REAL,
    p25 REAL,
    median REAL,
    p75 REAL,
    p95 REAL,
    min_val REAL,
    max_val REAL,
    lower_2sd REAL NOT NULL,
    upper_2sd REAL NOT NULL,
    study_count INTEGER NOT NULL,
    single_source INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (species, strain, sex, duration_category)
);

CREATE INDEX IF NOT EXISTS idx_bw_strain_sex
    ON hcd_bw(strain, sex, duration_category);
"""


# ---------------------------------------------------------------------------
# Non-rodent seed data (aggregate only, from published sources)
# ---------------------------------------------------------------------------

_NONRODENT_BW_SEEDS = [
    # Choi et al. 2011 (PMC3251758) — Beagle dog, Beijing Marshall
    # 6-month age -> "28-day" duration context (approximate mapping)
    ("DOG", "BEAGLE", "M", "28-day", 74, 9140.0, 670.0, "Choi2011 (PMC3251758) age=6mo"),
    ("DOG", "BEAGLE", "F", "28-day", 74, 7960.0, 620.0, "Choi2011 (PMC3251758) age=6mo"),
    # 7-month -> "90-day" (approximate)
    ("DOG", "BEAGLE", "M", "90-day", 27, 10320.0, 960.0, "Choi2011 (PMC3251758) age=7mo"),
    ("DOG", "BEAGLE", "F", "90-day", 25, 9000.0, 850.0, "Choi2011 (PMC3251758) age=7mo"),
    # PMC4900550 — Cynomolgus monkey (Cambodian origin), age 2-3 years
    ("PRIMATE", "CYNOMOLGUS", "M", "28-day", 1200, 2560.0, 345.0, "PMC4900550 age=2-3y Cambodia"),
    ("PRIMATE", "CYNOMOLGUS", "F", "28-day", 1300, 2430.0, 330.0, "PMC4900550 age=2-3y Cambodia"),
]


# ---------------------------------------------------------------------------
# Aggregate computation
# ---------------------------------------------------------------------------

def _compute_bw_aggregates(conn: sqlite3.Connection) -> int:
    """Compute per-(species, strain, sex, duration_category) BW aggregates."""
    from collections import defaultdict

    cursor = conn.execute("""
        SELECT species, strain, sex, duration_category, body_weight_g, study_id
        FROM hcd_bw
        WHERE duration_category IS NOT NULL
        ORDER BY strain, sex, duration_category
    """)

    groups: dict[tuple[str, str, str, str], list[float]] = defaultdict(list)
    study_sets: dict[tuple[str, str, str, str], set[str]] = defaultdict(set)

    for row in cursor:
        key = (row[0], row[1], row[2], row[3])
        groups[key].append(row[4])
        if row[5]:
            study_sets[key].add(row[5])

    rows = []
    for key, values in groups.items():
        arr = np.array(values, dtype=float)
        n = len(arr)
        if n < 3:
            continue
        mean = float(np.mean(arr))
        sd = float(np.std(arr, ddof=1))
        if sd < 1e-10:
            continue

        rows.append((
            key[0], key[1], key[2], key[3],  # species, strain, sex, dur_cat
            n,
            round(mean, 4),
            round(sd, 4),
            round(float(np.percentile(arr, 5)), 4),
            round(float(np.percentile(arr, 25)), 4),
            round(float(np.median(arr)), 4),
            round(float(np.percentile(arr, 75)), 4),
            round(float(np.percentile(arr, 95)), 4),
            round(float(np.min(arr)), 4),
            round(float(np.max(arr)), 4),
            round(mean - 2 * sd, 4),
            round(mean + 2 * sd, 4),
            len(study_sets[key]),
            0,  # single_source = false for NTP multi-study data
        ))

    conn.executemany(
        """INSERT OR REPLACE INTO hcd_bw_aggregates
        (species, strain, sex, duration_category,
         n, mean, sd, p5, p25, median, p75, p95,
         min_val, max_val, lower_2sd, upper_2sd, study_count, single_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    return len(rows)


def _insert_nonrodent_seeds(conn: sqlite3.Connection) -> int:
    """Insert aggregate-only non-rodent BW seed data from published sources."""
    rows = []
    for species, strain, sex, dur_cat, n, mean, sd, source in _NONRODENT_BW_SEEDS:
        lower = round(mean - 2 * sd, 4)
        upper = round(mean + 2 * sd, 4)
        rows.append((
            species, strain, sex, dur_cat,
            n, mean, sd,
            None, None, None, None, None,  # no percentiles for aggregate-only
            None, None,
            lower, upper,
            1,  # study_count = 1
            1,  # single_source = true
        ))

    conn.executemany(
        """INSERT OR REPLACE INTO hcd_bw_aggregates
        (species, strain, sex, duration_category,
         n, mean, sd, p5, p25, median, p75, p95,
         min_val, max_val, lower_2sd, upper_2sd, study_count, single_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    return len(rows)


# ---------------------------------------------------------------------------
# Backfill: join terminal BW into animal_organ_weights
# ---------------------------------------------------------------------------

def _backfill_om_body_weights(conn: sqlite3.Connection) -> int:
    """Populate animal_organ_weights.body_weight_g from hcd_bw.

    Two-tier join:
      Tier 1: (animal_id, study_id, duration_category) -- exact timepoint match
      Tier 2: (animal_id, study_id) with max duration_days -- terminal fallback

    Uses temp tables for performance (correlated subqueries on 78K rows are slow).
    Returns total number of OM rows updated.
    """
    # Check that animal_organ_weights exists
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if "animal_organ_weights" not in tables:
        print("  Skipping BW backfill: animal_organ_weights table not found")
        return 0

    # Reset any previous backfill so this is idempotent.
    # Note: the OM IAD Excel has no body weight column, so body_weight_g is
    # always NULL after the OM ETL. If a future OM source includes co-measured
    # BW, this reset should be changed to WHERE-NULL incremental update.
    conn.execute("UPDATE animal_organ_weights SET body_weight_g = NULL")

    # Build lookup index for fast joins
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_bw_aid_sid_dcat
        ON hcd_bw(animal_id, study_id, duration_category)
    """)

    # Tier 1: pre-aggregate BW by (animal_id, study_id, duration_category)
    # AVG handles the rare same-duration duplicates (13 cases)
    conn.execute("DROP TABLE IF EXISTS _tmp_bw_t1")
    conn.execute("""
        CREATE TEMP TABLE _tmp_bw_t1 AS
        SELECT animal_id, study_id, duration_category,
               AVG(body_weight_g) AS bw
        FROM hcd_bw
        WHERE animal_id IS NOT NULL AND study_id IS NOT NULL
          AND duration_category IS NOT NULL
        GROUP BY animal_id, study_id, duration_category
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS _tmp_bw_t1_idx
        ON _tmp_bw_t1(animal_id, study_id, duration_category)
    """)
    conn.execute("""
        UPDATE animal_organ_weights
        SET body_weight_g = (
            SELECT t.bw FROM _tmp_bw_t1 t
            WHERE t.animal_id = animal_organ_weights.animal_id
              AND t.study_id = animal_organ_weights.study_id
              AND t.duration_category = animal_organ_weights.duration_category
        )
        WHERE duration_category IS NOT NULL
          AND animal_id IS NOT NULL AND study_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM _tmp_bw_t1 t
            WHERE t.animal_id = animal_organ_weights.animal_id
              AND t.study_id = animal_organ_weights.study_id
              AND t.duration_category = animal_organ_weights.duration_category
          )
    """)
    tier1 = conn.execute("SELECT changes()").fetchone()[0]

    # Tier 2: for still-NULL rows, fall back to (animal_id, study_id)
    # picking the BW record with the largest duration_days (most terminal)
    conn.execute("DROP TABLE IF EXISTS _tmp_bw_t2")
    conn.execute("""
        CREATE TEMP TABLE _tmp_bw_t2 AS
        SELECT b.animal_id, b.study_id, b.body_weight_g AS bw
        FROM hcd_bw b
        INNER JOIN (
            SELECT animal_id, study_id, MAX(duration_days) AS max_dur
            FROM hcd_bw
            WHERE animal_id IS NOT NULL AND study_id IS NOT NULL
              AND duration_days IS NOT NULL
            GROUP BY animal_id, study_id
        ) best ON best.animal_id = b.animal_id
              AND best.study_id  = b.study_id
              AND b.duration_days = best.max_dur
        GROUP BY b.animal_id, b.study_id
        UNION ALL
        SELECT animal_id, study_id, body_weight_g AS bw
        FROM hcd_bw
        WHERE animal_id IS NOT NULL AND study_id IS NOT NULL
          AND duration_days IS NULL
          AND (animal_id, study_id) NOT IN (
              SELECT animal_id, study_id FROM hcd_bw
              WHERE duration_days IS NOT NULL
          )
        GROUP BY animal_id, study_id
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS _tmp_bw_t2_idx
        ON _tmp_bw_t2(animal_id, study_id)
    """)
    conn.execute("""
        UPDATE animal_organ_weights
        SET body_weight_g = (
            SELECT t.bw FROM _tmp_bw_t2 t
            WHERE t.animal_id = animal_organ_weights.animal_id
              AND t.study_id = animal_organ_weights.study_id
            LIMIT 1
        )
        WHERE body_weight_g IS NULL
          AND animal_id IS NOT NULL AND study_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM _tmp_bw_t2 t
            WHERE t.animal_id = animal_organ_weights.animal_id
              AND t.study_id = animal_organ_weights.study_id
          )
    """)
    tier2 = conn.execute("SELECT changes()").fetchone()[0]

    # Cleanup temp tables
    conn.execute("DROP TABLE IF EXISTS _tmp_bw_t1")
    conn.execute("DROP TABLE IF EXISTS _tmp_bw_t2")

    total = conn.execute(
        "SELECT COUNT(*) FROM animal_organ_weights WHERE body_weight_g IS NOT NULL"
    ).fetchone()[0]
    still_null = conn.execute(
        "SELECT COUNT(*) FROM animal_organ_weights WHERE body_weight_g IS NULL"
    ).fetchone()[0]

    print(f"  BW backfill: tier1={tier1:,}, tier2={tier2:,}, "
          f"total filled={total:,}, still NULL={still_null:,}")
    return tier1 + tier2


# ---------------------------------------------------------------------------
# ETL core
# ---------------------------------------------------------------------------

def build_bw(xlsx_path: Path, db_path: Path | None = None) -> Path:
    """Parse Terminal Bodyweight IAD Excel and build BW tables in HCD database."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        print("Run OM ETL first: python -m etl.hcd_etl build")
        sys.exit(1)

    print(f"Reading {xlsx_path} ...")
    t0 = time.time()
    df = pd.read_excel(xlsx_path, engine="openpyxl")
    print(f"  Read {len(df):,} rows, {len(df.columns)} columns in {time.time()-t0:.1f}s")
    print(f"  Columns: {list(df.columns)}")

    col_map = _discover_bw_columns(df)
    print(f"  Column mapping: {col_map}")

    def col(key: str) -> pd.Series | None:
        if key in col_map:
            return df[col_map[key]]
        return None

    # Filter to controls
    treatment_role_col = col("treatment_role")
    dose_col = col("dose")
    if treatment_role_col is not None:
        role_upper = treatment_role_col.astype(str).str.strip().str.upper()
        is_control = role_upper.str.contains("CONTROL", na=False) | role_upper.str.contains("UNTREATED", na=False)
        if dose_col is not None:
            numeric_dose = pd.to_numeric(dose_col, errors="coerce")
            is_control = is_control | (numeric_dose == 0)
        df = df[is_control].copy()
        print(f"  Filtered to controls: {len(df):,} rows")
    elif dose_col is not None:
        numeric_dose = pd.to_numeric(dose_col, errors="coerce")
        str_dose = dose_col.astype(str).str.strip().str.upper()
        is_control = (numeric_dose == 0) | (str_dose == "0") | (str_dose == "CONTROL")
        df = df[is_control].copy()
        print(f"  Filtered to controls (Dose=0): {len(df):,} rows")
    else:
        print("  WARNING: No dose/treatment role column found -- using ALL records")

    if len(df) == 0:
        print("  ERROR: No control records found.")
        sys.exit(1)

    # Normalize strain
    strain_series = col("strain")
    unmapped_strains: set[str] = set()
    if strain_series is not None:
        raw_strains = strain_series.astype(str).str.strip().str.upper()
        def map_strain(s: str) -> str | None:
            c = NTP_STRAIN_MAP.get(s)
            if c is None:
                unmapped_strains.add(s)
            return c
        df["_strain"] = raw_strains.map(map_strain)
        n_unmapped = df["_strain"].isna().sum()
        df = df[df["_strain"].notna()].copy()
        if unmapped_strains:
            print(f"  Unmapped strains ({n_unmapped} rows dropped): {sorted(unmapped_strains)}")
    else:
        print("  ERROR: No strain column found.")
        sys.exit(1)

    # Parse body weight
    bw_series = col("body_weight_g")
    df["_bw"] = pd.to_numeric(bw_series, errors="coerce")
    n_bad = df["_bw"].isna().sum()
    df = df[df["_bw"].notna() & (df["_bw"] > 0)].copy()
    if n_bad > 0:
        print(f"  Dropped {n_bad} rows with missing/invalid body weight")

    # Parse sex
    sex_series = col("sex")
    if sex_series is not None:
        df["_sex"] = sex_series.astype(str).str.strip().str.upper().str[0]
        df = df[df["_sex"].isin(["M", "F"])].copy()
    else:
        print("  ERROR: No sex column found.")
        sys.exit(1)

    # Parse optional columns
    species_series = col("species")
    df["_species"] = (
        species_series.astype(str).str.strip().str.upper()
        if species_series is not None else "UNKNOWN"
    )
    # Map species to canonical keys
    def _canonical_species(s: str) -> str:
        s = s.upper()
        if "RAT" in s:
            return "RAT"
        if "MOUSE" in s or "MUS" in s:
            return "MOUSE"
        return s
    df["_species"] = df["_species"].map(_canonical_species)

    route_series = col("route")
    df["_route"] = route_series.astype(str).str.strip().str.upper() if route_series is not None else None

    vehicle_series = col("vehicle")
    df["_vehicle"] = vehicle_series.astype(str).str.strip().str.upper() if vehicle_series is not None else None

    study_id_series = col("study_id")
    df["_study_id"] = study_id_series.astype(str).str.strip() if study_id_series is not None else None

    animal_id_series = col("animal_id")
    df["_animal_id"] = animal_id_series.astype(str).str.strip() if animal_id_series is not None else None

    # Parse duration
    dur_series = col("exposure_dur")
    dur_unit_series = col("exposure_unit")
    if dur_series is not None and dur_unit_series is not None:
        dur_vals = pd.to_numeric(dur_series, errors="coerce")
        dur_units = dur_unit_series.astype(str).str.strip().str.upper()
        def _combine_dur(row_val, row_unit):
            if pd.isna(row_val) or row_val <= 0:
                return None
            v = int(row_val)
            if row_unit in ("DAY", "DAYS"): return v
            if row_unit in ("WEEK", "WEEKS"): return v * 7
            if row_unit in ("MONTH", "MONTHS"): return v * 30
            if row_unit in ("YEAR", "YEARS"): return v * 365
            return None
        df["_duration_days"] = [_combine_dur(v, u) for v, u in zip(dur_vals, dur_units)]
    elif dur_series is not None:
        df["_duration_days"] = dur_series.apply(_parse_duration_value)
    else:
        df["_duration_days"] = None

    df["_duration_category"] = df["_duration_days"].apply(_days_to_category)

    year_series = col("study_year")
    df["_study_year"] = pd.to_numeric(year_series, errors="coerce") if year_series is not None else None

    print(f"  Final dataset: {len(df):,} control animal terminal BW records")
    print(f"  Strains: {sorted(df['_strain'].unique())}")
    print(f"  Species: {sorted(df['_species'].unique())}")
    print(f"  Sex: {sorted(df['_sex'].unique())}")
    if "_duration_category" in df.columns:
        cats = df["_duration_category"].dropna().unique()
        print(f"  Duration categories: {sorted(cats)}")

    # Add BW tables to existing hcd.db
    conn = sqlite3.connect(str(db_path))
    conn.executescript(_BW_SCHEMA)

    # Clear existing BW data (idempotent rebuild)
    conn.execute("DELETE FROM hcd_bw")
    conn.execute("DELETE FROM hcd_bw_aggregates")

    # Insert individual records
    records = []
    for _, row in df.iterrows():
        records.append((
            row.get("_study_id"),
            row.get("_animal_id"),
            row["_strain"],
            row.get("_species", "UNKNOWN"),
            row["_sex"],
            row.get("_route"),
            row.get("_vehicle"),
            float(row["_bw"]),
            int(row["_duration_days"]) if pd.notna(row.get("_duration_days")) else None,
            row.get("_duration_category"),
            int(row["_study_year"]) if pd.notna(row.get("_study_year")) else None,
        ))

    conn.executemany(
        """INSERT INTO hcd_bw
        (study_id, animal_id, strain, species, sex, route, vehicle,
         body_weight_g, duration_days, duration_category, study_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        records,
    )
    print(f"  Inserted {len(records):,} BW records")

    # Compute aggregates from NTP data
    n_agg = _compute_bw_aggregates(conn)
    print(f"  Computed {n_agg} NTP aggregate entries")

    # Add non-rodent seed data
    n_seed = _insert_nonrodent_seeds(conn)
    print(f"  Inserted {n_seed} non-rodent seed entries")

    # ETL metadata
    import datetime
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("bw_etl_timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("bw_source_file", str(xlsx_path)),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("bw_n_records", str(len(records))),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("bw_n_aggregates", str(n_agg + n_seed)),
    )

    # Backfill body_weight_g into animal_organ_weights from hcd_bw
    _backfill_om_body_weights(conn)

    conn.commit()
    conn.close()

    print(f"\nBW tables built in {db_path}")
    return db_path


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download(dest_dir: Path | None = None) -> Path:
    """Download DTT IAD Terminal Bodyweight Excel from CEBS."""
    if dest_dir is None:
        dest_dir = ETL_DATA_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / DEFAULT_BW_FILENAME

    if dest.exists():
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"File already exists: {dest} ({size_mb:.1f} MB)")
        print("Delete it and re-run to re-download.")
        return dest

    print(f"Downloading from {CEBS_BW_URL} ...")
    print("(This may take a few minutes for ~77 MB)")

    try:
        urllib.request.urlretrieve(CEBS_BW_URL, str(dest))
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"Downloaded: {dest} ({size_mb:.1f} MB)")
    except Exception as e:
        print(f"Download failed: {e}")
        print(f"\nManual download instructions:")
        print(f"  1. Go to https://cebs.niehs.nih.gov/cebs/")
        print(f"  2. Search for 'DTT IAD Terminal Bodyweight'")
        print(f"  3. Download the file")
        print(f"  4. Save as: {dest}")
        print(f"  5. Run: python -m etl.hcd_bw_etl build")
        if dest.exists():
            dest.unlink()
        sys.exit(1)

    return dest


# ---------------------------------------------------------------------------
# Info
# ---------------------------------------------------------------------------

def show_info(db_path: Path | None = None) -> None:
    """Print BW HCD coverage summary."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))

    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    if "hcd_bw_aggregates" not in tables:
        print("No BW tables in hcd.db. Run: python -m etl.hcd_bw_etl build")
        conn.close()
        return

    # Individual records
    if "hcd_bw" in tables:
        total = conn.execute("SELECT COUNT(*) FROM hcd_bw").fetchone()[0]
        print(f"=== BW Individual Records: {total:,} ===")
    else:
        print("=== BW Individual Records: none ===")

    # Aggregates
    total_agg = conn.execute("SELECT COUNT(*) FROM hcd_bw_aggregates").fetchone()[0]
    print(f"\n=== BW Aggregate Coverage ({total_agg} entries) ===")

    cursor = conn.execute("""
        SELECT species, strain, COUNT(*) as n_entries,
               SUM(n) as total_animals,
               COUNT(DISTINCT duration_category) as n_durations,
               single_source
        FROM hcd_bw_aggregates
        GROUP BY species, strain, single_source
        ORDER BY species, strain
    """)
    print(f"  {'Species':<10} {'Strain':<15} {'Entries':>8} {'Animals':>10} {'Durs':>5} {'Source':>10}")
    print(f"  {'-'*10} {'-'*15} {'-'*8} {'-'*10} {'-'*5} {'-'*10}")
    for r in cursor:
        src = "single" if r[5] else "multi"
        print(f"  {r[0]:<10} {r[1]:<15} {r[2]:>8} {r[3]:>10} {r[4]:>5} {src:>10}")

    # Duration categories
    print("\n=== Duration Categories ===")
    for r in conn.execute("""
        SELECT duration_category, COUNT(*), SUM(n)
        FROM hcd_bw_aggregates
        GROUP BY duration_category
        ORDER BY duration_category
    """):
        print(f"  {r[0]}: {r[1]} entries, {r[2]} animals")

    conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="HCD BW ETL: NTP DTT IAD Terminal Bodyweight -> SQLite",
    )
    sub = parser.add_subparsers(dest="command")

    dl = sub.add_parser("download", help="Download DTT IAD Terminal Bodyweight from CEBS")
    dl.add_argument("--dest", type=Path, help="Destination directory")

    bd = sub.add_parser("build", help="Build BW tables from Excel")
    bd.add_argument("--xlsx", type=Path, help="Path to Excel file")
    bd.add_argument("--db", type=Path, help="Target database path")

    sub.add_parser("info", help="Show BW coverage summary")

    args = parser.parse_args()

    if args.command == "download":
        download(args.dest)
    elif args.command == "build":
        xlsx = args.xlsx
        if xlsx is None:
            default_xlsx = ETL_DATA_DIR / DEFAULT_BW_FILENAME
            if default_xlsx.exists():
                xlsx = default_xlsx
            else:
                existing = list(ETL_DATA_DIR.glob("*odyweight*.xlsx")) if ETL_DATA_DIR.exists() else []
                if existing:
                    xlsx = existing[0]
                    print(f"Using found Excel file: {xlsx}")
                else:
                    print("No Excel file found. Downloading...")
                    xlsx = download()
        build_bw(xlsx, args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
