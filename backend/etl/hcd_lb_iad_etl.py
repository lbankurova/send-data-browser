"""ETL: NTP DTT IAD Clinical Chemistry + Hematology Excel -> SQLite HCD database.

Downloads the Integrated Animal Data (IAD) clinical chemistry and hematology files
from NTP/CEBS, filters to control animals, normalizes strain/test codes, loads into
SQLite, and pre-computes aggregate statistics + enables empirical percentile ranking.

This supplements the existing hcd_lb_etl.py (aggregate data from published literature)
with individual-animal-level data from NTP DTT IAD, enabling:
  - Empirical percentile ranking (like OM and BW domains)
  - More precise reference intervals (thousands of animals vs published n=16-76)
  - Duration-stratified intervals

Species coverage: rodent only (NTP studies are rats + mice). Non-rodent species
(dog, rabbit, NHP) retain published-literature aggregates from hcd_lb_etl.py.

Usage:
    cd backend
    python -m etl.hcd_lb_iad_etl download         # Download both Excel files from CEBS
    python -m etl.hcd_lb_iad_etl build             # Build from both CC + Hema
    python -m etl.hcd_lb_iad_etl build --cc path   # Use local CC file
    python -m etl.hcd_lb_iad_etl build --hema path # Use local Hema file
    python -m etl.hcd_lb_iad_etl info              # Show LB IAD coverage summary
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sqlite3
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

from config import HCD_DB_PATH, ETL_DATA_DIR
from etl.hcd_etl import NTP_STRAIN_MAP, _days_to_category

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CEBS_CC_URL = (
    "https://cebs-ext.niehs.nih.gov/cahs/file/download/datasets/"
    "Clinical_Chemistry_IAD/202602_Clinical_Chemistry_IAD.xlsx"
)
CEBS_HEMA_URL = (
    "https://cebs-ext.niehs.nih.gov/cahs/file/download/datasets/"
    "Hematology_IAD/202602_Hematology_IAD.xlsx"
)
DEFAULT_CC_FILENAME = "202602_Clinical_Chemistry_IAD.xlsx"
DEFAULT_HEMA_FILENAME = "202602_Hematology_IAD.xlsx"

# ---------------------------------------------------------------------------
# NTP strain -> species mapping (shared by aggregate computation + alias builder)
# ---------------------------------------------------------------------------
NTP_STRAIN_SPECIES: dict[str, str] = {
    "F344/N": "RAT", "WISTAR HAN": "RAT", "SD": "RAT",
    "LONG-EVANS": "RAT",
    "B6C3F1/N": "MOUSE", "CD-1": "MOUSE", "FVB/N": "MOUSE",
    "BALB/C": "MOUSE", "C57BL/6N": "MOUSE",
}

# ---------------------------------------------------------------------------
# NTP Assay Name -> SEND LBTESTCD mapping
# ---------------------------------------------------------------------------
# NTP DTT IAD "Assay Name" values mapped to canonical SEND test codes.
# Case-insensitive matching is used at lookup time.
# This map covers both Clinical Chemistry and Hematology analytes.

NTP_ASSAY_MAP: dict[str, str] = {
    # =====================================================================
    # Clinical Chemistry — NTP DTT IAD exact names
    # =====================================================================
    "ALANINE AMINOTRANSFERASE LEVEL OF ACTIVITY ASSAY": "ALT",
    "ALANINE AMINOTRANSFERASE": "ALT",
    "ALT": "ALT",
    "SGPT": "ALT",
    "ALKALINE PHOSPHATASE LEVEL OF ACTIVITY ASSAY": "ALP",
    "ALKALINE PHOSPHATASE": "ALP",
    "ALP": "ALP",
    "ASPARTATE AMINOTRANSFERASE LEVEL OF ACTIVITY ASSAY": "AST",
    "ASPARTATE AMINOTRANSFERASE": "AST",
    "AST": "AST",
    "SGOT": "AST",
    "UREA NITROGEN ASSAY": "BUN",
    "BLOOD UREA NITROGEN": "BUN",
    "BUN": "BUN",
    "UREA NITROGEN": "BUN",
    "CALCIUM CONCENTRATION ASSAY": "CA",
    "CALCIUM": "CA",
    "CHLORIDE CONCENTRATION ASSAY": "CL",
    "CHLORIDE": "CL",
    "CHOLESTEROL CONCENTRATION ASSAY": "CHOL",
    "CHOLESTEROL": "CHOL",
    "CREATININE CONCENTRATION ASSAY": "CREAT",
    "CREATININE": "CREAT",
    "GAMMA-GLUTAMYLTRANSFERASE LEVEL OF ACTIVITY ASSAY": "GGT",
    "GAMMA GLUTAMYL TRANSFERASE": "GGT",
    "GAMMA-GLUTAMYL TRANSFERASE": "GGT",
    "GGT": "GGT",
    "GLUCOSE CONCENTRATION IN BLOOD SERUM ASSAY": "GLUC",
    "GLUCOSE": "GLUC",
    "GLOBULIN ASSAY": "GLOB",
    "GLOBULIN": "GLOB",
    "PHOSPHORUS CONCENTRATION ASSAY": "PHOS",
    "PHOSPHORUS": "PHOS",
    "INORGANIC PHOSPHORUS": "PHOS",
    "POTASSIUM CONCENTRATION ASSAY": "K",
    "POTASSIUM": "K",
    "SODIUM CONCENTRATION ASSAY": "SODIUM",
    "SODIUM": "SODIUM",
    "TOTAL BILIRUBIN CONCENTRATION ASSAY": "BILI",
    "TOTAL BILIRUBIN": "BILI",
    "BILIRUBIN": "BILI",
    "PROTEIN CONCENTRATION ASSAY": "PROT",
    "TOTAL PROTEIN": "PROT",
    "TRIGLYCERIDE CONCENTRATION ASSAY": "TRIG",
    "TRIGLYCERIDES": "TRIG",
    "TRIGLYCERIDE": "TRIG",
    "ALBUMIN CONCENTRATION ASSAY": "ALB",
    "ALBUMIN": "ALB",
    "ALBUMIN TO GLOBULIN RATIO DETERMINATION ASSAY": "ALBGLOB",
    "ALBUMIN/GLOBULIN RATIO": "ALBGLOB",
    "A/G RATIO": "ALBGLOB",
    "CREATINE KINASE LEVEL OF ACTIVITY ASSAY": "CK",
    "CREATINE KINASE": "CK",
    "CK": "CK",
    "LACTATE DEHYDROGENASE LEVEL OF ACTIVITY ASSAY": "LDH",
    "LACTATE DEHYDROGENASE": "LDH",
    "LDH": "LDH",
    "BILE ACID CONCENTRATION ASSAY": "BILEAC",
    "BILE SALT CONCENTRATION ASSAY": "BILEAC",
    "BILE ACIDS": "BILEAC",
    "SORBITOL DEHYDROGENASE LEVEL OF ACTIVITY ASSAY": "SDH",
    "SORBITOL DEHYDROGENASE": "SDH",
    "SDH": "SDH",
    "GLUTAMATE DEHYDROGENASE LEVEL OF ACTIVITY ASSAY": "GLDH",
    "GLUTAMATE DEHYDROGENASE": "GLDH",
    "GLDH": "GLDH",
    "DIRECT BILIRUBIN CONCENTRATION ASSAY": "DBILI",
    "DIRECT BILIRUBIN": "DBILI",
    "PHOSPHOLIPID CONCENTRATION ASSAY": "PL",
    "AMYLASE LEVEL OF ACTIVITY ASSAY": "AMY",
    "CHOLINESTERASE LEVEL OF ACTIVITY ASSAY": "CHE",
    "ISOCITRATE DEHYDROGENASE LEVEL OF ACTIVITY ASSAY": "ICD",
    "IRON CONCENTRATION ASSAY": "FE",
    "TOTAL IRON BINDING CAPACITY": "TIBC",
    "UNBOUND IRON BINDING CAPACITY": "UIBC",
    "FREE FATTY ACID CONCENTRATION ASSAY": "FFA",
    "HIGH-DENSITY LIPOPROTEIN CHOLESTEROL CONCENTRATION ASSAY": "HDL",
    "HIGH-DENSITY LIPOPROTEIN CONCENTRATION ASSAY": "HDL",
    "LOW-DENSITY LIPOPROTEIN CHOLESTEROL CONCENTRATION ASSAY": "LDL",
    "LOW-DENSITY LIPOPROTEIN CONCENTRATION ASSAY": "LDL",
    "VERY-LOW-DENSITY LIPOPROTEIN CONCENTRATION ASSAY": "VLDL",
    "CREATINE CONCENTRATION ASSAY": "CREATINE",
    "BETA-HYDROXYBUTYRATE ASSAY": "BHB",
    "NITRITE CONCENTRATION ASSAY": "NITRITE",
    "NONPROTEIN SULFHYDRYL ASSAY": "NPSH",
    # =====================================================================
    # Hematology — NTP DTT IAD exact names
    # =====================================================================
    "LEUKOCYTE COUNT ASSAY": "WBC",
    "WHITE BLOOD CELL COUNT": "WBC",
    "WBC": "WBC",
    "ERYTHROCYTE COUNT ASSAY": "RBC",
    "RED BLOOD CELL COUNT": "RBC",
    "RBC": "RBC",
    "HEMOGLOBIN CONCENTRATION ASSAY": "HGB",
    "HEMOGLOBIN": "HGB",
    "HGB": "HGB",
    "HEMATOCRIT ASSAY": "HCT",
    "MANUAL HEMATOCRIT ASSAY": "HCT",
    "HEMATOCRIT": "HCT",
    "HCT": "HCT",
    "MEAN CELL VOLUME ASSAY": "MCV",
    "MEAN CORPUSCULAR VOLUME": "MCV",
    "MCV": "MCV",
    "MEAN CELL HEMOGLOBIN ASSAY": "MCH",
    "MEAN CORPUSCULAR HEMOGLOBIN": "MCH",
    "MCH": "MCH",
    "MEAN CELL HEMOGLOBIN CONCENTRATION ASSAY": "MCHC",
    "MEAN CORPUSCULAR HEMOGLOBIN CONCENTRATION": "MCHC",
    "MCHC": "MCHC",
    "PLATELET COUNT ASSAY": "PLAT",
    "PLATELET COUNT": "PLAT",
    "PLT": "PLAT",
    "RETICULOCYTE COUNT ASSAY": "RETI",
    "RETICULOCYTE PERCENTAGE ASSAY": "RETIPCT",
    "RETICULOCYTE COUNT": "RETI",
    "RETICULOCYTES": "RETI",
    "NEUTROPHIL COUNT ASSAY": "NEUT",
    "NEUTROPHIL PERCENTAGE ASSAY": "NEUTLE",
    "NEUTROPHIL COUNT": "NEUT",
    "NEUTROPHILS": "NEUT",
    "IMMATURE NEUTROPHIL COUNT ASSAY": "NEUTSG",
    "IMMATURE NEUTROPHIL PERCENTAGE ASSAY": "NEUTSGPCT",
    "LYMPHOCYTE COUNT ASSAY": "LYM",
    "LYMPHOCYTE PERCENTAGE ASSAY": "LYMATLE",
    "TOTAL LYMPHOCYTE COUNT ASSAY": "LYM",
    "LYMPHOCYTE COUNT": "LYM",
    "LYMPHOCYTES": "LYM",
    "MONOCYTE COUNT ASSAY": "MONO",
    "MONOCYTE PERCENTAGE ASSAY": "MONOLE",
    "MONOCYTE COUNT": "MONO",
    "MONOCYTES": "MONO",
    "EOSINOPHIL COUNT ASSAY": "EOS",
    "EOSINOPHIL PERCENTAGE ASSAY": "EOSLE",
    "EOSINOPHIL COUNT": "EOS",
    "EOSINOPHILS": "EOS",
    "BASOPHIL COUNT ASSAY": "BASO",
    "BASOPHIL PERCENTAGE ASSAY": "BASOLE",
    "BASOPHIL COUNT": "BASO",
    "BASOPHILS": "BASO",
    "MEAN PLATELET VOLUME ASSAY": "MPV",
    "MEAN PLATELET VOLUME": "MPV",
    "MPV": "MPV",
    "PROTHROMBIN TIME ASSAY": "PT",
    "PROTHROMBIN TIME": "PT",
    "PT": "PT",
    "ACTIVATED PARTIAL THROMBOPLASTIN TIME ASSAY": "APTT",
    "ACTIVATED PARTIAL THROMBOPLASTIN TIME": "APTT",
    "APTT": "APTT",
    "FIBRINOGEN CONCENTRATION ASSAY": "FIBRINO",
    "FIBRINOGEN": "FIBRINO",
    "LARGE UNSTAINED CELL COUNT ASSAY": "LUC",
    "LARGE UNSTAINED CELL PERCENTAGE ASSAY": "LUCPCT",
    "NUCLEATED ERYTHROCYTE COUNT ASSAY": "NRBC",
    "NUCLEATED ERYTHROCYTE PERCENTAGE ASSAY": "NRBCPCT",
    "ERYTHROCYTE WITH HEINZ BODIES COUNT ASSAY": "HEINZ",
    "HEINZ BODIES PERCENTAGE ASSAY": "HEINZPCT",
    "METHEMOGLOBIN CONCENTRATION ASSAY": "METHGB",
    "METHEMOGLOBIN PERCENTAGE ASSAY": "METHGBPCT",
    "ATYPICAL LYMPHOCYTE COUNT ASSAY": "ATYPLYM",
    "ATYPICAL LYMPHOCYTES PERCENTAGE ASSAY": "ATYPLYMPCT",
    "ATYPICAL MONONUCLEAR CELL COUNT ASSAY": "ATYPMONO",
    "BLAST COUNT ASSAY": "BLAST",
    "BLASTS PERCENTAGE ASSAY": "BLASTLE",
    "METAMYELOCYTE COUNT ASSAY": "METAMY",
    "METAMYELOCYTE PERCENTAGE ASSAY": "METAMYPCT",
    "MYELOCYTE COUNT ASSAY": "MYCY",
    "PROLYMPHOCYTE PERCENTAGE ASSAY": "PROLYMPCT",
}

# ---------------------------------------------------------------------------
# Column discovery — adapted from hcd_etl.py for LB domain
# ---------------------------------------------------------------------------

_LB_COLUMN_SEMANTICS: list[tuple[str, list[str]]] = [
    ("study_id",       ["dtt original study id", "study_id", "study id", "studyid"]),
    ("animal_id",      ["unique cebs subject identifier", "subject identifier in study",
                        "animal_id", "animal id"]),
    ("strain",         ["strain"]),
    ("species",        ["species"]),
    ("sex",            ["sex"]),
    ("route",          ["route"]),
    ("vehicle",        ["vehicle"]),
    ("assay_name",     ["assay name", "test name", "analyte", "parameter"]),
    ("assay_result",   ["assay result", "result", "value", "original value",
                        "original value adjusted"]),
    ("assay_unit",     ["assay unit", "standard unit", "unit"]),
    ("dose",           ["dose"]),
    ("treatment_role", ["treatment role"]),
    ("exposure_dur",   ["exposure duration"]),
    ("exposure_unit",  ["exposure duration unit"]),
    ("study_year",     ["study start year", "year", "study year"]),
]


def _discover_lb_columns(df: pd.DataFrame) -> dict[str, str]:
    """Map semantic column names to actual DataFrame column names."""
    actual_cols = {c.strip().lower(): c for c in df.columns}
    mapping: dict[str, str] = {}
    used_cols: set[str] = set()

    for target, patterns in _LB_COLUMN_SEMANTICS:
        matched = None
        # Exact match first
        for pat in patterns:
            pat_lower = pat.lower()
            if pat_lower in actual_cols and actual_cols[pat_lower] not in used_cols:
                matched = actual_cols[pat_lower]
                break
        # Substring match (shortest column wins)
        if not matched:
            candidates = []
            for pat in patterns:
                pat_lower = pat.lower()
                for col_lower, col_orig in actual_cols.items():
                    if col_orig in used_cols:
                        continue
                    if pat_lower in col_lower:
                        candidates.append(col_orig)
            if candidates:
                matched = min(candidates, key=len)
        if matched:
            mapping[target] = matched
            used_cols.add(matched)

    # Required columns
    required = {"strain", "sex", "assay_name", "assay_result"}
    missing = required - set(mapping.keys())
    if missing:
        raise ValueError(
            f"Required columns not found: {missing}. "
            f"Available: {list(df.columns)[:30]}. "
            f"Mapped so far: {mapping}"
        )

    return mapping


# ---------------------------------------------------------------------------
# Test code normalization
# ---------------------------------------------------------------------------

def _normalize_assay_name(name: str) -> str | None:
    """Map NTP assay name to canonical SEND LBTESTCD.

    Returns None for unrecognized assay names (they'll be tracked and reported).
    """
    return NTP_ASSAY_MAP.get(name.strip().upper())


# ---------------------------------------------------------------------------
# SQLite schema — individual animal lab values
# ---------------------------------------------------------------------------

_LB_IAD_SCHEMA = """
CREATE TABLE IF NOT EXISTS animal_lab_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT,
    animal_id TEXT,
    strain TEXT NOT NULL,
    species TEXT,
    sex TEXT NOT NULL,
    route TEXT,
    vehicle TEXT,
    test_code TEXT NOT NULL,
    assay_name_raw TEXT,
    value REAL NOT NULL,
    unit TEXT,
    duration_days INTEGER,
    duration_category TEXT,
    study_year INTEGER,
    source_file TEXT
);

CREATE INDEX IF NOT EXISTS idx_alv_lookup
    ON animal_lab_values(strain, sex, test_code, duration_category);

CREATE INDEX IF NOT EXISTS idx_alv_species
    ON animal_lab_values(species, sex, test_code, duration_category);
"""


# ---------------------------------------------------------------------------
# ETL core
# ---------------------------------------------------------------------------

def _parse_duration_combined(dur_val, dur_unit) -> int | None:
    """Parse exposure duration + unit to days."""
    if dur_val is None or (isinstance(dur_val, float) and np.isnan(dur_val)):
        return None
    try:
        v = int(float(dur_val))
    except (ValueError, TypeError):
        return None
    if v <= 0:
        return None

    unit = str(dur_unit).strip().upper() if dur_unit is not None else "DAYS"
    if unit in ("DAY", "DAYS"):
        return v
    if unit in ("WEEK", "WEEKS"):
        return v * 7
    if unit in ("MONTH", "MONTHS"):
        return v * 30
    if unit in ("YEAR", "YEARS"):
        return v * 365
    return None


def _process_excel(
    xlsx_path: Path,
    conn: sqlite3.Connection,
    source_label: str,
) -> tuple[int, set[str]]:
    """Parse one Excel file (CC or Hematology) and insert into animal_lab_values.

    Returns (n_inserted, unmapped_assay_names).
    """
    print(f"  Reading {xlsx_path.name} ...")
    t0 = time.time()
    df = pd.read_excel(xlsx_path, engine="openpyxl")
    print(f"    {len(df):,} rows, {len(df.columns)} columns in {time.time()-t0:.1f}s")
    print(f"    Columns: {list(df.columns)}")

    col_map = _discover_lb_columns(df)
    print(f"    Column mapping: {col_map}")

    def col(key: str) -> pd.Series | None:
        if key in col_map:
            return df[col_map[key]]
        return None

    # --- Filter to controls ---
    treatment_role_col = col("treatment_role")
    dose_col = col("dose")
    if treatment_role_col is not None:
        role_upper = treatment_role_col.astype(str).str.strip().str.upper()
        is_control = (
            role_upper.str.contains("CONTROL", na=False)
            | role_upper.str.contains("UNTREATED", na=False)
        )
        if dose_col is not None:
            numeric_dose = pd.to_numeric(dose_col, errors="coerce")
            is_control = is_control | (numeric_dose == 0)
        df = df[is_control].copy()
        print(f"    Filtered to controls: {len(df):,} rows")
    elif dose_col is not None:
        numeric_dose = pd.to_numeric(dose_col, errors="coerce")
        str_dose = dose_col.astype(str).str.strip().str.upper()
        is_control = (numeric_dose == 0) | (str_dose == "0") | (str_dose == "CONTROL")
        df = df[is_control].copy()
        print(f"    Filtered to controls (Dose=0): {len(df):,} rows")
    else:
        print("    WARNING: No dose/treatment role column -- using ALL records")

    if len(df) == 0:
        print("    ERROR: No control records found.")
        return 0, set()

    # --- Normalize strain ---
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
            print(f"    Unmapped strains ({n_unmapped} rows dropped): {sorted(unmapped_strains)}")
    else:
        print("    ERROR: No strain column found.")
        return 0, set()

    # --- Normalize assay name -> test code ---
    assay_series = col("assay_name")
    unmapped_assays: set[str] = set()
    if assay_series is not None:
        raw_assays = assay_series.astype(str).str.strip()
        df["_assay_raw"] = raw_assays

        def map_assay(s: str) -> str | None:
            tc = _normalize_assay_name(s)
            if tc is None:
                unmapped_assays.add(s.upper())
            return tc

        df["_test_code"] = raw_assays.map(map_assay)
        n_unmapped_assay = df["_test_code"].isna().sum()
        df = df[df["_test_code"].notna()].copy()
        if unmapped_assays:
            print(f"    Unmapped assays ({n_unmapped_assay} rows dropped): "
                  f"{sorted(list(unmapped_assays))[:30]}")
    else:
        print("    ERROR: No assay_name column found.")
        return 0, set()

    # --- Parse result value ---
    result_series = col("assay_result")
    df["_value"] = pd.to_numeric(result_series, errors="coerce")
    n_bad = df["_value"].isna().sum()
    df = df[df["_value"].notna()].copy()
    if n_bad > 0:
        print(f"    Dropped {n_bad} rows with missing/invalid result values")

    # --- Parse sex ---
    sex_series = col("sex")
    if sex_series is not None:
        df["_sex"] = sex_series.astype(str).str.strip().str.upper().str[0]
        df = df[df["_sex"].isin(["M", "F"])].copy()
    else:
        print("    ERROR: No sex column found.")
        return 0, set()

    # --- Optional columns ---
    species_series = col("species")
    df["_species"] = (
        species_series.astype(str).str.strip().str.upper()
        if species_series is not None else "UNKNOWN"
    )

    unit_series = col("assay_unit")
    df["_unit"] = (
        unit_series.astype(str).str.strip()
        if unit_series is not None else None
    )

    route_series = col("route")
    df["_route"] = (
        route_series.astype(str).str.strip().str.upper()
        if route_series is not None else None
    )

    vehicle_series = col("vehicle")
    df["_vehicle"] = (
        vehicle_series.astype(str).str.strip().str.upper()
        if vehicle_series is not None else None
    )

    study_id_series = col("study_id")
    df["_study_id"] = (
        study_id_series.astype(str).str.strip()
        if study_id_series is not None else None
    )

    animal_id_series = col("animal_id")
    df["_animal_id"] = (
        animal_id_series.astype(str).str.strip()
        if animal_id_series is not None else None
    )

    # --- Duration ---
    dur_series = col("exposure_dur")
    dur_unit_series = col("exposure_unit")
    if dur_series is not None:
        dur_vals = pd.to_numeric(dur_series, errors="coerce")
        if dur_unit_series is not None:
            dur_units = dur_unit_series.astype(str).str.strip().str.upper()
            df["_duration_days"] = [
                _parse_duration_combined(v, u) for v, u in zip(dur_vals, dur_units)
            ]
        else:
            df["_duration_days"] = dur_vals.apply(
                lambda x: int(x) if pd.notna(x) and x > 0 else None
            )
    else:
        df["_duration_days"] = None

    df["_duration_category"] = df["_duration_days"].apply(_days_to_category)

    year_series = col("study_year")
    df["_study_year"] = (
        pd.to_numeric(year_series, errors="coerce")
        if year_series is not None else None
    )

    print(f"    Final: {len(df):,} control animal lab records")
    print(f"    Strains: {sorted(df['_strain'].unique())}")
    print(f"    Test codes: {sorted(df['_test_code'].unique())}")
    print(f"    Sex: {sorted(df['_sex'].unique())}")
    dur_cats = df["_duration_category"].dropna().unique()
    if len(dur_cats) > 0:
        print(f"    Duration categories: {sorted(dur_cats)}")

    # --- Insert ---
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
            row["_test_code"],
            row.get("_assay_raw"),
            float(row["_value"]),
            row.get("_unit"),
            int(row["_duration_days"]) if pd.notna(row.get("_duration_days")) else None,
            row.get("_duration_category"),
            int(row["_study_year"]) if pd.notna(row.get("_study_year")) else None,
            source_label,
        ))

    conn.executemany(
        """INSERT INTO animal_lab_values
           (study_id, animal_id, strain, species, sex, route, vehicle,
            test_code, assay_name_raw, value, unit,
            duration_days, duration_category, study_year, source_file)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        records,
    )

    return len(records), unmapped_assays


def _compute_lb_iad_aggregates(conn: sqlite3.Connection) -> int:
    """Compute per-(strain, sex, test_code, duration_category) aggregates
    from individual animal_lab_values and merge into hcd_lb_aggregates.

    Supplements (does not overwrite) existing aggregate rows from hcd_lb_etl.
    NTP IAD rows are marked source='NTP_DTT_IAD' and have HIGH confidence
    when n >= 30, MODERATE when n >= 10, LOW otherwise.

    Returns number of aggregate rows inserted/updated.
    """
    cursor = conn.execute("""
        SELECT strain, species, sex, test_code, duration_category,
               value, unit, study_id
        FROM animal_lab_values
        WHERE duration_category IS NOT NULL
        ORDER BY strain, sex, test_code, duration_category
    """)

    groups: dict[tuple, list[float]] = defaultdict(list)
    species_map: dict[tuple, str] = {}
    unit_map: dict[tuple, str | None] = {}
    study_sets: dict[tuple, set[str]] = defaultdict(set)

    for row in cursor:
        key = (row[0], row[2], row[3], row[4])  # strain, sex, test_code, dur_cat
        groups[key].append(row[5])
        species_map[key] = row[1]
        unit_map[key] = row[6]
        if row[7]:
            study_sets[key].add(row[7])

    rows_inserted = 0
    for key, values in groups.items():
        strain, sex, test_code, dur_cat = key
        arr = np.array(values, dtype=float)
        n = len(arr)
        if n < 3:
            continue

        mean = float(np.mean(arr))
        sd = float(np.std(arr, ddof=1))
        if sd < 1e-10:
            continue

        species = NTP_STRAIN_SPECIES.get(strain, species_map.get(key, "UNKNOWN"))
        if n >= 30:
            confidence = "HIGH"
        elif n >= 10:
            confidence = "MODERATE"
        else:
            confidence = "LOW"

        study_count = len(study_sets[key])
        note = f"NTP DTT IAD ({study_count} studies, n={n})"

        # Use empirical p2.5/p97.5 as bounds when n >= 30 (distribution-free,
        # addresses GAP-236 Normal assumption). Fall back to mean +/- 2*SD at
        # small n where empirical tail percentiles are unreliable.
        if n >= 30:
            lower = round(float(np.percentile(arr, 2.5)), 6)
            upper = round(float(np.percentile(arr, 97.5)), 6)
            note += " (empirical p2.5/p97.5 bounds)"
        else:
            lower = round(mean - 2 * sd, 6)
            upper = round(mean + 2 * sd, 6)
            note += " (parametric mean+/-2SD bounds, n<30)"

        conn.execute(
            """INSERT OR REPLACE INTO hcd_lb_aggregates
               (species, strain, sex, test_code, duration_category,
                n, mean, sd, geom_mean, geom_sd,
                lower, upper,
                median, p5, p95,
                unit, source, confidence, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                species, strain, sex, test_code, dur_cat,
                n,
                round(mean, 6), round(sd, 6),
                None, None,  # mean/SD retained for reference
                lower, upper,
                round(float(np.median(arr)), 6),
                round(float(np.percentile(arr, 5)), 6),
                round(float(np.percentile(arr, 95)), 6),
                unit_map.get(key),
                "NTP_DTT_IAD",
                confidence,
                note,
            ),
        )
        rows_inserted += 1

    return rows_inserted


def _build_ntp_lb_aliases(conn: sqlite3.Connection) -> None:
    """Add NTP strain names to LB alias tables so assess_a3_lb can resolve them.

    NTP DTT IAD uses strain names like "WISTAR HAN", "F344/N", "B6C3F1/N".
    The LB literature aliases may use different conventions ("WISTAR_HAN").
    This adds NTP names as aliases pointing to the NTP canonical form + species.
    """
    # Add all NTP_STRAIN_MAP entries as LB strain aliases
    for raw, canonical in NTP_STRAIN_MAP.items():
        species = NTP_STRAIN_SPECIES.get(canonical)
        if species:
            conn.execute(
                """INSERT OR IGNORE INTO hcd_lb_strain_aliases
                   (alias, canonical_strain, canonical_species)
                   VALUES (?, ?, ?)""",
                (raw.strip().upper(), canonical, species),
            )

    # Add species aliases for MOUSE (not in original hcd_lb_etl since NTP is rodent-only)
    mouse_aliases = [
        ("MOUSE", "MOUSE"), ("MICE", "MOUSE"),
        ("B6C3F1/N", "MOUSE"), ("CD-1", "MOUSE"),
    ]
    for alias, canonical in mouse_aliases:
        conn.execute(
            "INSERT OR IGNORE INTO hcd_lb_species_aliases (alias, canonical) VALUES (?, ?)",
            (alias.upper(), canonical),
        )

    # Ensure RAT aliases include common NTP species names
    rat_aliases = [("RAT", "RAT"), ("RATS", "RAT")]
    for alias, canonical in rat_aliases:
        conn.execute(
            "INSERT OR IGNORE INTO hcd_lb_species_aliases (alias, canonical) VALUES (?, ?)",
            (alias.upper(), canonical),
        )


def build_lb_iad(
    cc_path: Path | None = None,
    hema_path: Path | None = None,
    db_path: Path | None = None,
) -> Path:
    """Parse NTP DTT IAD Clinical Chemistry + Hematology Excel files and
    load individual animal records into hcd.db.

    At least one of cc_path or hema_path must be provided (or discoverable
    in ETL_DATA_DIR).
    """
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Target database not found: {db_path}")
        print("Run OM ETL first: python -m etl.hcd_etl build")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))

    # Create LB IAD tables (additive -- does not touch existing tables)
    conn.executescript(_LB_IAD_SCHEMA)

    # Ensure hcd_lb_aggregates exists (from hcd_lb_etl.py schema)
    conn.execute("""
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
        )
    """)

    # Ensure alias tables exist (may already be created by hcd_lb_etl.py)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hcd_lb_species_aliases (
            alias TEXT PRIMARY KEY,
            canonical TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hcd_lb_strain_aliases (
            alias TEXT PRIMARY KEY,
            canonical_strain TEXT NOT NULL,
            canonical_species TEXT NOT NULL
        )
    """)

    # Clear previous IAD data (idempotent rebuild -- leave literature data alone)
    conn.execute("DELETE FROM animal_lab_values")
    conn.execute("DELETE FROM hcd_lb_aggregates WHERE source = 'NTP_DTT_IAD'")

    total_inserted = 0
    all_unmapped: set[str] = set()

    # Process Clinical Chemistry
    if cc_path and cc_path.exists():
        n, unmapped = _process_excel(cc_path, conn, "CC_IAD")
        total_inserted += n
        all_unmapped |= unmapped
        print(f"  CC: {n:,} records inserted")
    else:
        print("  Clinical Chemistry file not provided or not found -- skipping")

    # Process Hematology
    if hema_path and hema_path.exists():
        n, unmapped = _process_excel(hema_path, conn, "HEMA_IAD")
        total_inserted += n
        all_unmapped |= unmapped
        print(f"  Hematology: {n:,} records inserted")
    else:
        print("  Hematology file not provided or not found -- skipping")

    if total_inserted == 0:
        print("\nNo records inserted. Provide at least one Excel file.")
        conn.close()
        sys.exit(1)

    print(f"\n  Total individual LB records: {total_inserted:,}")

    # Compute aggregates
    n_agg = _compute_lb_iad_aggregates(conn)
    print(f"  Computed {n_agg} IAD aggregate entries (merged into hcd_lb_aggregates)")

    # Populate NTP strain aliases for LB lookups
    _build_ntp_lb_aliases(conn)

    # ETL metadata
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_iad_etl_timestamp", now),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_iad_n_records", str(total_inserted)),
    )
    conn.execute(
        "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
        ("lb_iad_n_aggregates", str(n_agg)),
    )
    if cc_path:
        conn.execute(
            "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
            ("lb_iad_cc_file", str(cc_path)),
        )
    if hema_path:
        conn.execute(
            "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
            ("lb_iad_hema_file", str(hema_path)),
        )
    if all_unmapped:
        conn.execute(
            "INSERT OR REPLACE INTO etl_metadata (key, value) VALUES (?, ?)",
            ("lb_iad_unmapped_assays", ",".join(sorted(list(all_unmapped)[:100]))),
        )

    conn.commit()

    # Coverage summary
    _print_coverage(conn)

    conn.close()
    print(f"\nUpdated {db_path} ({db_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return db_path


def _print_coverage(conn: sqlite3.Connection) -> None:
    """Print coverage summary of animal_lab_values."""
    total = conn.execute("SELECT COUNT(*) FROM animal_lab_values").fetchone()[0]
    print(f"\n  === LB IAD Coverage ({total:,} individual records) ===")

    cursor = conn.execute("""
        SELECT strain, COUNT(*) as n_records,
               COUNT(DISTINCT test_code) as n_tests,
               COUNT(DISTINCT sex) as n_sexes,
               COUNT(DISTINCT duration_category) as n_durs,
               COUNT(DISTINCT study_id) as n_studies
        FROM animal_lab_values
        GROUP BY strain
        ORDER BY n_records DESC
    """)
    print(f"\n  {'Strain':<20} {'Records':>10} {'Tests':>6} {'Sexes':>6} "
          f"{'Durs':>5} {'Studies':>8}")
    print(f"  {'-'*20} {'-'*10} {'-'*6} {'-'*6} {'-'*5} {'-'*8}")
    for row in cursor:
        print(f"  {row[0]:<20} {row[1]:>10,} {row[2]:>6} {row[3]:>6} "
              f"{row[4]:>5} {row[5]:>8}")

    # Test codes
    print(f"\n  === Test Codes ===")
    codes = [r[0] for r in conn.execute(
        "SELECT DISTINCT test_code FROM animal_lab_values ORDER BY test_code"
    )]
    print(f"  {len(codes)} codes: {', '.join(codes)}")

    # IAD aggregates in hcd_lb_aggregates
    iad_agg = conn.execute(
        "SELECT COUNT(*) FROM hcd_lb_aggregates WHERE source = 'NTP_DTT_IAD'"
    ).fetchone()[0]
    lit_agg = conn.execute(
        "SELECT COUNT(*) FROM hcd_lb_aggregates WHERE source != 'NTP_DTT_IAD'"
    ).fetchone()[0]
    print(f"\n  hcd_lb_aggregates: {iad_agg} IAD rows + {lit_agg} literature rows")


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def _download_file(url: str, dest: Path, label: str) -> Path:
    """Download a single file from CEBS."""
    if dest.exists():
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"  {label} already exists: {dest} ({size_mb:.1f} MB)")
        return dest

    print(f"  Downloading {label} from CEBS ...")
    print(f"    URL: {url}")
    print(f"    (This may take a few minutes)")

    try:
        urllib.request.urlretrieve(url, str(dest))
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"    Downloaded: {dest} ({size_mb:.1f} MB)")
    except Exception as e:
        print(f"    Download failed: {e}")
        print(f"\n    Manual download:")
        print(f"      1. Go to https://cebs.niehs.nih.gov/cebs/paper/16015")
        print(f"      2. Download the {label} file")
        print(f"      3. Save as: {dest}")
        if dest.exists():
            dest.unlink()
        return dest

    return dest


def download(dest_dir: Path | None = None) -> tuple[Path, Path]:
    """Download both Clinical Chemistry and Hematology IAD files from CEBS."""
    if dest_dir is None:
        dest_dir = ETL_DATA_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    cc = _download_file(CEBS_CC_URL, dest_dir / DEFAULT_CC_FILENAME, "Clinical Chemistry IAD")
    hema = _download_file(CEBS_HEMA_URL, dest_dir / DEFAULT_HEMA_FILENAME, "Hematology IAD")
    return cc, hema


# ---------------------------------------------------------------------------
# Info
# ---------------------------------------------------------------------------

def show_info(db_path: Path | None = None) -> None:
    """Print LB IAD coverage summary."""
    if db_path is None:
        db_path = HCD_DB_PATH

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}

    if "animal_lab_values" not in tables:
        print("No LB IAD tables in hcd.db. Run: python -m etl.hcd_lb_iad_etl build")
        conn.close()
        return

    total = conn.execute("SELECT COUNT(*) FROM animal_lab_values").fetchone()[0]
    if total == 0:
        print("animal_lab_values table exists but is empty.")
        conn.close()
        return

    _print_coverage(conn)
    conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="HCD LB IAD ETL: NTP DTT IAD Clinical Chemistry + Hematology -> hcd.db",
    )
    sub = parser.add_subparsers(dest="command")

    dl = sub.add_parser("download", help="Download CC + Hema IAD Excel files from CEBS")
    dl.add_argument("--dest", type=Path, help="Destination directory")

    bd = sub.add_parser("build", help="Build LB IAD tables into hcd.db")
    bd.add_argument("--cc", type=Path, help="Path to Clinical Chemistry IAD Excel")
    bd.add_argument("--hema", type=Path, help="Path to Hematology IAD Excel")
    bd.add_argument("--db", type=Path, help="Target hcd.db path")

    sub.add_parser("info", help="Show LB IAD coverage summary")

    args = parser.parse_args()

    if args.command == "download":
        download(args.dest)
    elif args.command == "build":
        cc = args.cc
        hema = args.hema
        # Auto-discover in ETL_DATA_DIR
        if cc is None:
            candidate = ETL_DATA_DIR / DEFAULT_CC_FILENAME
            if candidate.exists():
                cc = candidate
            else:
                # Look for any CC-looking xlsx
                for f in sorted(ETL_DATA_DIR.glob("*Clinical*Chemistry*.xlsx")):
                    cc = f
                    print(f"Found CC file: {cc}")
                    break
        if hema is None:
            candidate = ETL_DATA_DIR / DEFAULT_HEMA_FILENAME
            if candidate.exists():
                hema = candidate
            else:
                for f in sorted(ETL_DATA_DIR.glob("*Hematology*.xlsx")):
                    hema = f
                    print(f"Found Hematology file: {hema}")
                    break

        if cc is None and hema is None:
            print("No Excel files found. Download first:")
            print("  python -m etl.hcd_lb_iad_etl download")
            print("Or provide paths:")
            print("  python -m etl.hcd_lb_iad_etl build --cc path/to/cc.xlsx --hema path/to/hema.xlsx")
            sys.exit(1)

        build_lb_iad(cc, hema, args.db)
    elif args.command == "info":
        show_info()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
