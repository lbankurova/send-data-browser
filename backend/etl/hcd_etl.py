"""ETL: NTP DTT IAD Organ Weight Excel → SQLite HCD database.

Downloads the Integrated Animal Data (IAD) organ weight file from NTP/CEBS,
filters to control animals, normalizes strain/organ names, loads into SQLite,
and pre-computes aggregate statistics for HCD reference range lookups.

Usage:
    cd backend
    python -m etl.hcd_etl download   # Download Excel from CEBS (~80 MB)
    python -m etl.hcd_etl build      # Parse Excel → build hcd.db
    python -m etl.hcd_etl build --xlsx path/to/file.xlsx  # Use local file
    python -m etl.hcd_etl info       # Show DB coverage summary
"""

from __future__ import annotations

import argparse
import logging
import re
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from config import HCD_DB_PATH, ETL_DATA_DIR

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# CEBS bulk download for DTT IAD Organ Weight data (Feb 2026 version, 78 MB)
# Source: https://cebs.niehs.nih.gov/cebs/paper/16015
CEBS_DOWNLOAD_URL = (
    "https://cebs-ext.niehs.nih.gov/cahs/file/download/datasets/"
    "Organ_Weight_IAD/202602_Organ_Weight_IAD.xlsx"
)
DEFAULT_XLSX_FILENAME = "202602_Organ_Weight_IAD.xlsx"

# ---------------------------------------------------------------------------
# Strain normalization: NTP names → canonical keys
# ---------------------------------------------------------------------------
NTP_STRAIN_MAP: dict[str, str] = {
    # F344/N rats — DTT IAD: "F344", "F344/NTac"
    "F344/N": "F344/N",
    "F344": "F344/N",
    "F344/NCTR": "F344/N",
    "F344/NTAC": "F344/N",
    "FISCHER 344": "F344/N",
    "FISCHER 344/N": "F344/N",
    # Wistar Han rats — DTT IAD: "Wistar Han IGS"
    "WISTAR HAN": "WISTAR HAN",
    "WISTAR HAN IGS": "WISTAR HAN",
    "WI(HAN)": "WISTAR HAN",
    "WISTAR HAN [CRL:WI(HAN)]": "WISTAR HAN",
    "CRL:WI(HAN)": "WISTAR HAN",
    "HAN WISTAR": "WISTAR HAN",
    # Sprague-Dawley rats — DTT IAD: "Sprague-Dawley", "HSD:SD"
    "SPRAGUE-DAWLEY": "SD",
    "SPRAGUE DAWLEY": "SD",
    "SD": "SD",
    "HSD:SD": "SD",
    "CRL:CD(SD)": "SD",
    "CD(SD)": "SD",
    "HSD:SPRAGUE DAWLEY SD": "SD",
    "HSD:SPRAGUE DAWLEY": "SD",
    # B6C3F1/N mice — DTT IAD: "B6C3F1/N"
    "B6C3F1/N": "B6C3F1/N",
    "B6C3F1": "B6C3F1/N",
    # CD-1 mice — DTT IAD: "CD-1 CRL"
    "CD-1": "CD-1",
    "CD-1 CRL": "CD-1",
    "CRL:CD1(ICR)": "CD-1",
    "ICR": "CD-1",
    # FVB/N mice — DTT IAD: "FVB/N"
    "FVB/N": "FVB/N",
    "FVB/NTAC": "FVB/N",
    # BALB/C mice — DTT IAD: "BALB/cJ"
    "BALB/C": "BALB/C",
    "BALB/CJ": "BALB/C",
    # C57BL/6 mice — DTT IAD: "C57BL/6J"
    "C57BL/6N": "C57BL/6N",
    "C57BL/6": "C57BL/6N",
    "C57BL/6J": "C57BL/6N",
    # Long-Evans rats — DTT IAD: "Long Evans"
    "LONG-EVANS": "LONG-EVANS",
    "LONG EVANS": "LONG-EVANS",
}

# ---------------------------------------------------------------------------
# Organ normalization: NTP names → SEND-compatible keys
# ---------------------------------------------------------------------------
NTP_ORGAN_MAP: dict[str, str] = {
    # Adrenal — DTT IAD: "Adrenal gland", "Adrenal gland, right"
    "ADRENAL GLAND": "ADRENAL",
    "ADRENAL GLAND, RIGHT": "ADRENAL",
    "ADRENAL GLAND, LEFT": "ADRENAL",
    "ADRENAL GLANDS": "ADRENAL",
    "ADRENALS": "ADRENAL",
    "ADRENAL": "ADRENAL",
    # Brain — DTT IAD: "Brain"
    "BRAIN": "BRAIN",
    # Epididymides — DTT IAD: "Epididymis", "Epididymis, left", "Epididymis, right"
    "EPIDIDYMIS": "EPIDIDYMIDES",
    "EPIDIDYMIS, LEFT": "EPIDIDYMIDES",
    "EPIDIDYMIS, RIGHT": "EPIDIDYMIDES",
    "EPIDIDYMIS, CAUDA, LEFT": "EPIDIDYMIDES",
    "EPIDIDYMIS, CAUDA, RIGHT": "EPIDIDYMIDES",
    "EPIDIDYMIDES": "EPIDIDYMIDES",
    # Heart — DTT IAD: "Heart"
    "HEART": "HEART",
    # Kidney — DTT IAD: "Kidney", "Kidney, left", "Kidney, right"
    "KIDNEY": "KIDNEY",
    "KIDNEY, LEFT": "KIDNEY",
    "KIDNEY, RIGHT": "KIDNEY",
    "KIDNEYS": "KIDNEY",
    # Liver — DTT IAD: "Liver"
    "LIVER": "LIVER",
    # Lungs — DTT IAD: "Lung"
    "LUNG": "LUNGS",
    "LUNGS": "LUNGS",
    # Ovaries — DTT IAD: "Ovary", "Ovary, left", "Ovary, right"
    "OVARY": "OVARIES",
    "OVARY, LEFT": "OVARIES",
    "OVARY, RIGHT": "OVARIES",
    "OVARIES": "OVARIES",
    # Pituitary — DTT IAD: "Pituitary gland"
    "PITUITARY GLAND": "PITUITARY",
    "PITUITARY": "PITUITARY",
    # Prostate — DTT IAD: "Prostate"
    "PROSTATE": "PROSTATE",
    "PROSTATE GLAND": "PROSTATE",
    # Seminal vesicles — DTT IAD: "Seminal vesicles with coagulating gland"
    "SEMINAL VESICLES WITH COAGULATING GLAND": "SEMINAL VESICLES",
    "SEMINAL VESICLE": "SEMINAL VESICLES",
    "SEMINAL VESICLES": "SEMINAL VESICLES",
    # Spleen — DTT IAD: "Spleen"
    "SPLEEN": "SPLEEN",
    # Testes — DTT IAD: "Testis", "Testis, left", "Testis, right"
    "TESTIS": "TESTES",
    "TESTIS, LEFT": "TESTES",
    "TESTIS, LEFT WITH EPIDIDYMIS": "TESTES",
    "TESTIS, RIGHT": "TESTES",
    "TESTES": "TESTES",
    # Thymus — DTT IAD: "Thymus"
    "THYMUS": "THYMUS",
    # Thyroid — DTT IAD: "Thyroid gland"
    "THYROID GLAND": "THYROID",
    "THYROID": "THYROID",
    # Uterus — DTT IAD: "Uterus"
    "UTERUS": "UTERUS",
}


# ---------------------------------------------------------------------------
# Column discovery — fuzzy matching for DTT IAD Excel headers
# ---------------------------------------------------------------------------

# Semantic groups: each entry is (target_key, patterns_to_match)
# Tuned for DTT IAD Feb 2026 columns:
#   Study Test Article, Species, Strain, Sex, Tissue, Assay Name, Dose,
#   Exposure Duration, Exposure Duration Unit, Assay Result, Assay Unit,
#   Route, Vehicle, Study Start Year, Treatment Role,
#   DTT Original Study ID, Unique CEBS Subject Identifier
_COLUMN_SEMANTICS: list[tuple[str, list[str]]] = [
    ("study_id",       ["dtt original study id", "study_id", "study id", "studyid"]),
    ("animal_id",      ["unique cebs subject identifier", "subject identifier in study",
                        "animal_id", "animal id"]),
    ("strain",         ["strain"]),
    ("species",        ["species"]),
    ("sex",            ["sex"]),
    ("route",          ["route"]),
    ("vehicle",        ["vehicle"]),
    ("organ_raw",      ["tissue", "organ", "organ/tissue"]),
    ("assay_name",     ["assay name"]),
    ("organ_weight_g", ["assay result", "organ weight", "organ wt", "organ_weight",
                        "absolute organ weight", "absolute weight"]),
    ("assay_unit",     ["assay unit"]),
    ("body_weight_g",  ["body weight", "body wt", "body_weight", "terminal body weight"]),
    ("dose",           ["dose"]),
    ("treatment_role", ["treatment role"]),
    ("exposure_dur",   ["exposure duration"]),
    ("exposure_unit",  ["exposure duration unit"]),
    ("study_year",     ["study start year", "year", "study year"]),
]


def _discover_columns(df: pd.DataFrame) -> dict[str, str]:
    """Map semantic column names to actual DataFrame column names.

    Uses case-insensitive exact matching first, then substring matching.
    Avoids assigning the same column to multiple targets.
    """
    actual_cols = {c.strip().lower(): c for c in df.columns}
    mapping: dict[str, str] = {}
    used_cols: set[str] = set()

    for target, patterns in _COLUMN_SEMANTICS:
        matched = None
        # Try exact match first
        for pat in patterns:
            pat_lower = pat.lower()
            if pat_lower in actual_cols and actual_cols[pat_lower] not in used_cols:
                matched = actual_cols[pat_lower]
                break
        # Substring match (pick shortest matching column to avoid over-matching)
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

    # Required columns
    required = {"strain", "sex", "organ_raw", "organ_weight_g"}
    missing = required - set(mapping.keys())
    if missing:
        raise ValueError(
            f"Required columns not found: {missing}. "
            f"Available: {list(df.columns)[:30]}. "
            f"Mapped so far: {mapping}"
        )

    return mapping


# ---------------------------------------------------------------------------
# Duration category
# ---------------------------------------------------------------------------

def _days_to_category(days: int | float | None) -> str | None:
    if days is None or (isinstance(days, float) and np.isnan(days)):
        return None
    days = int(days)
    if days <= 42:
        return "28-day"
    if days <= 180:
        return "90-day"
    if days <= 364:
        return "chronic"
    return "carcinogenicity"


def _parse_duration_value(val) -> int | None:
    """Parse various duration formats to days."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, (int, float)):
        v = int(val)
        return v if v > 0 else None
    s = str(val).strip().upper()
    # Try numeric first
    try:
        v = int(float(s))
        return v if v > 0 else None
    except (ValueError, TypeError):
        pass
    # Try "X DAYS", "X WEEKS", "X MONTHS", "X YEARS"
    m = re.match(r"(\d+)\s*(DAY|WEEK|MONTH|YEAR)S?", s)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit == "DAY":
            return n
        if unit == "WEEK":
            return n * 7
        if unit == "MONTH":
            return n * 30
        if unit == "YEAR":
            return n * 365
    # Try ISO 8601: P13W, P28D, etc.
    m = re.match(r"P(\d+)([DWMY])", s)
    if m:
        n = int(m.group(1))
        u = m.group(2)
        if u == "D":
            return n
        if u == "W":
            return n * 7
        if u == "M":
            return n * 30
        if u == "Y":
            return n * 365
    return None


# ---------------------------------------------------------------------------
# SQLite schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS animal_organ_weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT,
    animal_id TEXT,
    strain TEXT NOT NULL,
    species TEXT,
    sex TEXT NOT NULL,
    route TEXT,
    vehicle TEXT,
    organ TEXT NOT NULL,
    organ_raw TEXT,
    organ_weight_g REAL NOT NULL,
    body_weight_g REAL,
    duration_days INTEGER,
    duration_category TEXT,
    study_year INTEGER
);

CREATE TABLE IF NOT EXISTS hcd_aggregates (
    strain TEXT NOT NULL,
    sex TEXT NOT NULL,
    organ TEXT NOT NULL,
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
    PRIMARY KEY (strain, sex, organ, duration_category)
);

CREATE TABLE IF NOT EXISTS strain_aliases (
    alias TEXT PRIMARY KEY,
    canonical TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etl_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_aow_strain_sex_organ
    ON animal_organ_weights(strain, sex, organ, duration_category);
"""


# ---------------------------------------------------------------------------
# ETL core
# ---------------------------------------------------------------------------

def _build_strain_aliases(conn: sqlite3.Connection) -> None:
    """Populate strain_aliases from NTP_STRAIN_MAP + all canonical keys."""
    aliases: list[tuple[str, str]] = []
    for raw, canonical in NTP_STRAIN_MAP.items():
        aliases.append((raw.strip().upper(), canonical))
        aliases.append((canonical.strip().upper(), canonical))

    # Also add common variants not in the map
    # (covered via the strain resolution in hcd_database.py)
    conn.executemany(
        "INSERT OR REPLACE INTO strain_aliases (alias, canonical) VALUES (?, ?)",
        aliases,
    )


def _compute_aggregates(conn: sqlite3.Connection) -> int:
    """Compute per-(strain, sex, organ, duration_category) aggregates.

    Returns number of aggregate rows inserted.
    """
    # Pull all records grouped by key
    cursor = conn.execute("""
        SELECT strain, sex, organ, duration_category, organ_weight_g, study_id
        FROM animal_organ_weights
        WHERE duration_category IS NOT NULL
        ORDER BY strain, sex, organ, duration_category
    """)

    from collections import defaultdict
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
            continue  # Need at least 3 data points for meaningful stats
        mean = float(np.mean(arr))
        sd = float(np.std(arr, ddof=1))
        if sd < 1e-10:
            continue  # Zero variance — all identical values

        rows.append((
            key[0], key[1], key[2], key[3],  # strain, sex, organ, dur_cat
            n,
            round(mean, 6),
            round(sd, 6),
            round(float(np.percentile(arr, 5)), 6),
            round(float(np.percentile(arr, 25)), 6),
            round(float(np.median(arr)), 6),
            round(float(np.percentile(arr, 75)), 6),
            round(float(np.percentile(arr, 95)), 6),
            round(float(np.min(arr)), 6),
            round(float(np.max(arr)), 6),
            round(mean - 2 * sd, 6),
            round(mean + 2 * sd, 6),
            len(study_sets[key]),
        ))

    conn.executemany(
        """INSERT OR REPLACE INTO hcd_aggregates
        (strain, sex, organ, duration_category,
         n, mean, sd, p5, p25, median, p75, p95,
         min_val, max_val, lower_2sd, upper_2sd, study_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    return len(rows)


def build_db(xlsx_path: Path, db_path: Path | None = None) -> Path:
    """Parse Organ Weight IAD Excel and build SQLite HCD database.

    Returns path to the built database.
    """
    if db_path is None:
        db_path = HCD_DB_PATH

    print(f"Reading {xlsx_path} ...")
    t0 = time.time()
    df = pd.read_excel(xlsx_path, engine="openpyxl")
    print(f"  Read {len(df):,} rows, {len(df.columns)} columns in {time.time()-t0:.1f}s")
    print(f"  Columns: {list(df.columns)}")

    # Discover columns
    col_map = _discover_columns(df)
    print(f"  Column mapping: {col_map}")

    # Normalize column access
    def col(key: str) -> pd.Series | None:
        if key in col_map:
            return df[col_map[key]]
        return None

    # Filter to controls using Treatment Role (preferred) or Dose = 0
    treatment_role_col = col("treatment_role")
    dose_col = col("dose")
    if treatment_role_col is not None:
        role_upper = treatment_role_col.astype(str).str.strip().str.upper()
        is_control = role_upper.str.contains("CONTROL", na=False) | role_upper.str.contains("UNTREATED", na=False)
        # Also include dose=0 rows where treatment role may be NaN
        if dose_col is not None:
            numeric_dose = pd.to_numeric(dose_col, errors="coerce")
            is_control = is_control | (numeric_dose == 0)
        df = df[is_control].copy()
        print(f"  Filtered to controls (Treatment Role + Dose=0): {len(df):,} rows")
    elif dose_col is not None:
        numeric_dose = pd.to_numeric(dose_col, errors="coerce")
        str_dose = dose_col.astype(str).str.strip().str.upper()
        is_control = (numeric_dose == 0) | (str_dose == "0") | (str_dose == "CONTROL")
        df = df[is_control].copy()
        print(f"  Filtered to controls (Dose=0): {len(df):,} rows")
    else:
        print("  WARNING: No dose/treatment role column found — using ALL records")

    if len(df) == 0:
        print("  ERROR: No control records found. Check dose column values.")
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

    # Normalize organ
    organ_series = col("organ_raw")
    unmapped_organs: set[str] = set()
    if organ_series is not None:
        raw_organs = organ_series.astype(str).str.strip().str.upper()
        df["_organ_raw"] = organ_series.astype(str).str.strip()
        def map_organ(s: str) -> str | None:
            c = NTP_ORGAN_MAP.get(s)
            if c is None:
                unmapped_organs.add(s)
            return c
        df["_organ"] = raw_organs.map(map_organ)
        n_unmapped_org = df["_organ"].isna().sum()
        df = df[df["_organ"].notna()].copy()
        if unmapped_organs:
            print(f"  Unmapped organs ({n_unmapped_org} rows dropped): {sorted(unmapped_organs)[:20]}")
    else:
        print("  ERROR: No organ column found.")
        sys.exit(1)

    # Parse organ weight
    ow_series = col("organ_weight_g")
    df["_ow"] = pd.to_numeric(ow_series, errors="coerce")
    n_bad_ow = df["_ow"].isna().sum()
    df = df[df["_ow"].notna() & (df["_ow"] > 0)].copy()
    if n_bad_ow > 0:
        print(f"  Dropped {n_bad_ow} rows with missing/invalid organ weight")

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

    bw_series = col("body_weight_g")
    df["_bw"] = pd.to_numeric(bw_series, errors="coerce") if bw_series is not None else np.nan

    route_series = col("route")
    df["_route"] = route_series.astype(str).str.strip().str.upper() if route_series is not None else None

    vehicle_series = col("vehicle")
    df["_vehicle"] = vehicle_series.astype(str).str.strip().str.upper() if vehicle_series is not None else None

    study_id_series = col("study_id")
    df["_study_id"] = study_id_series.astype(str).str.strip() if study_id_series is not None else None

    animal_id_series = col("animal_id")
    df["_animal_id"] = animal_id_series.astype(str).str.strip() if animal_id_series is not None else None

    # Parse duration: combine Exposure Duration + Exposure Duration Unit
    dur_series = col("exposure_dur")
    dur_unit_series = col("exposure_unit")
    if dur_series is not None and dur_unit_series is not None:
        dur_vals = pd.to_numeric(dur_series, errors="coerce")
        dur_units = dur_unit_series.astype(str).str.strip().str.upper()
        def _combine_dur(row_val, row_unit):
            if pd.isna(row_val) or row_val <= 0:
                return None
            v = int(row_val)
            if row_unit in ("DAY", "DAYS"):
                return v
            if row_unit in ("WEEK", "WEEKS"):
                return v * 7
            if row_unit in ("MONTH", "MONTHS"):
                return v * 30
            if row_unit in ("YEAR", "YEARS"):
                return v * 365
            return None
        df["_duration_days"] = [_combine_dur(v, u) for v, u in zip(dur_vals, dur_units)]
    elif dur_series is not None:
        df["_duration_days"] = dur_series.apply(_parse_duration_value)
    else:
        df["_duration_days"] = None

    df["_duration_category"] = df["_duration_days"].apply(_days_to_category)

    year_series = col("study_year")
    df["_study_year"] = pd.to_numeric(year_series, errors="coerce") if year_series is not None else None

    print(f"  Final dataset: {len(df):,} control animal organ weight records")
    print(f"  Strains: {sorted(df['_strain'].unique())}")
    print(f"  Organs: {sorted(df['_organ'].unique())}")
    print(f"  Sex: {sorted(df['_sex'].unique())}")
    if "_duration_category" in df.columns:
        cats = df["_duration_category"].dropna().unique()
        print(f"  Duration categories: {sorted(cats)}")

    # Build SQLite
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.executescript(_SCHEMA)

    # Insert animal records
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
            row["_organ"],
            row.get("_organ_raw"),
            float(row["_ow"]),
            float(row["_bw"]) if pd.notna(row.get("_bw")) else None,
            int(row["_duration_days"]) if pd.notna(row.get("_duration_days")) else None,
            row.get("_duration_category"),
            int(row["_study_year"]) if pd.notna(row.get("_study_year")) else None,
        ))

    conn.executemany(
        """INSERT INTO animal_organ_weights
        (study_id, animal_id, strain, species, sex, route, vehicle,
         organ, organ_raw, organ_weight_g, body_weight_g,
         duration_days, duration_category, study_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        records,
    )
    print(f"  Inserted {len(records):,} animal records")

    # Compute aggregates
    n_agg = _compute_aggregates(conn)
    print(f"  Computed {n_agg} aggregate entries")

    # Populate strain aliases
    _build_strain_aliases(conn)

    # ETL metadata
    import datetime
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("etl_timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("source_file", str(xlsx_path)),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("n_animal_records", str(len(records))),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("n_aggregates", str(n_agg)),
    )
    if unmapped_strains:
        conn.execute(
            "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
            ("unmapped_strains", ",".join(sorted(unmapped_strains))),
        )
    if unmapped_organs:
        conn.execute(
            "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
            ("unmapped_organs", ",".join(sorted(list(unmapped_organs)[:50]))),
        )

    conn.commit()
    conn.close()

    print(f"\nBuilt {db_path} ({db_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return db_path


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download(dest_dir: Path | None = None) -> Path:
    """Download DTT IAD Organ Weight Excel from CEBS.

    The CEBS bulk download URL may redirect — follows up to 5 redirects.
    Returns path to downloaded file.
    """
    if dest_dir is None:
        dest_dir = ETL_DATA_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / DEFAULT_XLSX_FILENAME

    if dest.exists():
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"File already exists: {dest} ({size_mb:.1f} MB)")
        print("Delete it and re-run to re-download.")
        return dest

    print(f"Downloading from {CEBS_DOWNLOAD_URL} ...")
    print("(This may take a few minutes for ~80 MB)")

    try:
        urllib.request.urlretrieve(CEBS_DOWNLOAD_URL, str(dest))
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"Downloaded: {dest} ({size_mb:.1f} MB)")
    except Exception as e:
        print(f"Download failed: {e}")
        print(f"\nManual download instructions:")
        print(f"  1. Go to https://cebs.niehs.nih.gov/cebs/")
        print(f"  2. Search for 'DTT IAD' or 'Integrated Animal Data'")
        print(f"  3. Download the Organ Weight file")
        print(f"  4. Save as: {dest}")
        print(f"  5. Run: python -m etl.hcd_etl build")
        if dest.exists():
            dest.unlink()
        sys.exit(1)

    return dest


# ---------------------------------------------------------------------------
# Info
# ---------------------------------------------------------------------------

def show_info(db_path: Path | None = None) -> None:
    """Print coverage summary from the built HCD database."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        print("Run: python -m etl.hcd_etl build")
        return

    conn = sqlite3.connect(str(db_path))

    # Metadata
    print("=== ETL Metadata ===")
    for key, value in conn.execute("SELECT key, value FROM etl_metadata"):
        print(f"  {key}: {value}")

    # Aggregates coverage
    print("\n=== Aggregate Coverage ===")
    rows = conn.execute("""
        SELECT strain, COUNT(*) as n_entries,
               SUM(n) as total_animals,
               COUNT(DISTINCT organ) as n_organs,
               COUNT(DISTINCT duration_category) as n_durations
        FROM hcd_aggregates
        GROUP BY strain
        ORDER BY total_animals DESC
    """).fetchall()
    print(f"  {'Strain':<20} {'Entries':>8} {'Animals':>10} {'Organs':>8} {'Durations':>10}")
    print(f"  {'-'*20} {'-'*8} {'-'*10} {'-'*8} {'-'*10}")
    for r in rows:
        print(f"  {r[0]:<20} {r[1]:>8} {r[2]:>10} {r[3]:>8} {r[4]:>10}")

    # Organs list
    print("\n=== Organs ===")
    organs = [r[0] for r in conn.execute(
        "SELECT DISTINCT organ FROM hcd_aggregates ORDER BY organ"
    )]
    print(f"  {', '.join(organs)}")

    # Duration categories
    print("\n=== Duration Categories ===")
    for r in conn.execute("""
        SELECT duration_category, COUNT(*), SUM(n)
        FROM hcd_aggregates
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
        description="HCD ETL: NTP DTT IAD Organ Weight → SQLite",
    )
    sub = parser.add_subparsers(dest="command")

    # download
    dl = sub.add_parser("download", help="Download DTT IAD Excel from CEBS")
    dl.add_argument("--dest", type=Path, help="Destination directory")

    # build
    bd = sub.add_parser("build", help="Build SQLite from Excel")
    bd.add_argument("--xlsx", type=Path, help="Path to Excel file (auto-downloads if not given)")
    bd.add_argument("--db", type=Path, help="Output database path")

    # info
    sub.add_parser("info", help="Show database coverage summary")

    args = parser.parse_args()

    if args.command == "download":
        download(args.dest)
    elif args.command == "build":
        xlsx = args.xlsx
        if xlsx is None:
            # Auto-discover or download
            default_xlsx = ETL_DATA_DIR / DEFAULT_XLSX_FILENAME
            if default_xlsx.exists():
                xlsx = default_xlsx
            else:
                # Look for any xlsx in the etl/data dir
                existing = list(ETL_DATA_DIR.glob("*.xlsx")) if ETL_DATA_DIR.exists() else []
                if existing:
                    xlsx = existing[0]
                    print(f"Using found Excel file: {xlsx}")
                else:
                    print("No Excel file found. Downloading...")
                    xlsx = download()
        build_db(xlsx, args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
