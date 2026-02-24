import math
from pathlib import Path

import pandas as pd
import pyreadstat

from config import CACHE_DIR
from models.schemas import ColumnInfo, DomainData, DomainSummary, DoseGroupSchema, StudyMetadata
from services.study_discovery import StudyInfo


class DomainMeta:
    def __init__(self, name: str, label: str, row_count: int, col_count: int,
                 columns: list[ColumnInfo]):
        self.name = name
        self.label = label
        self.row_count = row_count
        self.col_count = col_count
        self.columns = columns


def get_cached_csv_path(study_id: str, domain: str) -> Path:
    study_cache = CACHE_DIR / study_id
    study_cache.mkdir(parents=True, exist_ok=True)
    return study_cache / f"{domain}.csv"


def read_xpt(xpt_path: Path) -> tuple[pd.DataFrame, pyreadstat.metadata_container]:
    try:
        df, meta = pyreadstat.read_xport(str(xpt_path))
    except Exception:
        # Retry with encoding fallback chain for non-ASCII XPT files
        for enc in ("cp1252", "iso-8859-1"):
            try:
                df, meta = pyreadstat.read_xport(str(xpt_path), encoding=enc)
                break
            except Exception:
                continue
        else:
            raise
    return df, meta


def ensure_cached(study: StudyInfo, domain: str) -> Path:
    """Ensure a CSV cache exists for this domain. Returns the CSV path."""
    xpt_path = study.xpt_files[domain]
    csv_path = get_cached_csv_path(study.study_id, domain)

    # Check if cache is fresh
    if csv_path.exists():
        xpt_mtime = xpt_path.stat().st_mtime
        csv_mtime = csv_path.stat().st_mtime
        if csv_mtime > xpt_mtime:
            return csv_path

    # Read and cache
    df, _ = read_xpt(xpt_path)
    df.to_csv(csv_path, index=False)
    return csv_path


def get_domain_metadata(study: StudyInfo, domain: str) -> DomainMeta:
    """Get metadata for a domain without reading the full data."""
    xpt_path = study.xpt_files[domain]
    _, meta = read_xpt(xpt_path)

    columns = []
    for i, col_name in enumerate(meta.column_names):
        label = meta.column_names_to_labels.get(col_name, "")
        columns.append(ColumnInfo(name=col_name, label=label))

    return DomainMeta(
        name=domain,
        label=meta.file_label or domain.upper(),
        row_count=meta.number_rows,
        col_count=meta.number_columns,
        columns=columns,
    )


def get_all_domain_summaries(study: StudyInfo) -> list[DomainSummary]:
    """Get summary info for all domains in a study."""
    summaries = []
    for domain in sorted(study.xpt_files.keys()):
        try:
            meta = get_domain_metadata(study, domain)
            # Count unique subjects from CSV cache if USUBJID column exists
            subject_count = None
            try:
                csv_path = get_cached_csv_path(study.study_id, domain)
                if csv_path.exists():
                    df = pd.read_csv(csv_path, usecols=["USUBJID"], dtype=str)
                    subject_count = int(df["USUBJID"].nunique())
            except (ValueError, KeyError):
                # Domain doesn't have USUBJID column — that's fine
                pass
            summaries.append(DomainSummary(
                name=meta.name,
                label=meta.label,
                row_count=meta.row_count,
                col_count=meta.col_count,
                subject_count=subject_count,
            ))
        except Exception:
            continue
    return summaries


def get_domain_data(study: StudyInfo, domain: str, page: int, page_size: int) -> DomainData:
    """Get paginated domain data."""
    meta = get_domain_metadata(study, domain)
    csv_path = ensure_cached(study, domain)

    df = pd.read_csv(csv_path, keep_default_na=False, dtype=str)
    total_rows = len(df)
    total_pages = max(1, math.ceil(total_rows / page_size))

    start = (page - 1) * page_size
    end = start + page_size
    page_df = df.iloc[start:end]

    # Convert to list of dicts, replacing NaN/empty with None
    rows = []
    for _, row in page_df.iterrows():
        row_dict = {}
        for col in df.columns:
            val = row[col]
            if val == "" or (isinstance(val, float) and math.isnan(val)):
                row_dict[col] = None
            else:
                row_dict[col] = val
        rows.append(row_dict)

    return DomainData(
        domain=domain,
        label=meta.label,
        columns=meta.columns,
        rows=rows,
        total_rows=total_rows,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def extract_ts_metadata(study: StudyInfo) -> dict[str, str | None]:
    """Extract species and study type from ts.xpt if available."""
    result: dict[str, str | None] = {"species": None, "study_type": None}

    if "ts" not in study.xpt_files:
        return result

    try:
        df, _ = read_xpt(study.xpt_files["ts"])
        # Normalize column names to uppercase for matching
        df.columns = [c.upper() for c in df.columns]

        if "TSPARMCD" in df.columns and "TSVAL" in df.columns:
            for _, row in df.iterrows():
                parm = str(row["TSPARMCD"]).strip().upper()
                val = str(row["TSVAL"]).strip()
                if parm == "SPECIES" and val and val != "nan":
                    result["species"] = val
                elif parm == "SSTYP" and val and val != "nan":
                    result["study_type"] = val
    except Exception:
        pass

    return result


def extract_full_ts_metadata(study: StudyInfo) -> StudyMetadata:
    """Extract comprehensive metadata from TS domain."""
    ts_map: dict[str, str] = {}

    if "ts" in study.xpt_files:
        try:
            df, _ = read_xpt(study.xpt_files["ts"])
            df.columns = [c.upper() for c in df.columns]
            if "TSPARMCD" in df.columns and "TSVAL" in df.columns:
                for _, row in df.iterrows():
                    parm = str(row["TSPARMCD"]).strip().upper()
                    val = str(row["TSVAL"]).strip()
                    if val and val != "nan":
                        ts_map[parm] = val
        except Exception:
            pass

    # Fallback: derive subject counts from DM domain if TS doesn't have them
    if "SPLANSUB" not in ts_map and "dm" in study.xpt_files:
        try:
            dm_df, _ = read_xpt(study.xpt_files["dm"])
            dm_df.columns = [c.upper() for c in dm_df.columns]
            if "USUBJID" in dm_df.columns:
                ts_map.setdefault("SPLANSUB", str(dm_df["USUBJID"].nunique()))
            if "SEX" in dm_df.columns:
                sex_counts = dm_df.groupby("SEX")["USUBJID"].nunique()
                if "M" in sex_counts.index:
                    ts_map.setdefault("PLANMSUB", str(int(sex_counts["M"])))
                if "F" in sex_counts.index:
                    ts_map.setdefault("PLANFSUB", str(int(sex_counts["F"])))
        except Exception:
            pass

    def g(key: str) -> str | None:
        return ts_map.get(key)

    # Build dose groups if DM domain is available
    dose_groups_list: list[DoseGroupSchema] | None = None
    if "dm" in study.xpt_files:
        try:
            from services.analysis.dose_groups import build_dose_groups
            dg_data = build_dose_groups(study)
            dose_groups_list = [
                DoseGroupSchema(**dg) for dg in dg_data["dose_groups"]
            ]
        except Exception:
            pass

    return StudyMetadata(
        study_id=study.study_id,
        title=g("STITLE"),
        protocol=g("SPREFID"),
        species=g("SPECIES"),
        strain=g("STRAIN"),
        study_type=g("SSTYP"),
        design=g("SDESIGN"),
        route=g("ROUTE"),
        treatment=g("TRT"),
        vehicle=g("TRTV"),
        dosing_duration=g("DOSDUR"),
        start_date=g("STSTDTC") or g("EXPSTDTC"),
        end_date=g("EXPENDTC"),
        subjects=g("SPLANSUB"),
        males=g("PLANMSUB"),
        females=g("PLANFSUB"),
        sponsor=g("SSPONSOR"),
        test_facility=g("TSTFNAM"),
        study_director=g("STDIR"),
        glp=g("GLPTYP") or g("QATYPE"),
        send_version=g("SNDIGVER"),
        recovery_sacrifice=g("RECSAC"),
        terminal_sacrifice=g("TRMSAC"),
        ct_version=g("SNDCTVER"),
        diet=g("DIET"),
        age_text=g("AGETXT"),
        age_unit=g("AGEU"),
        sex_population=g("SEXPOP"),
        supplier=g("SPLRNAM"),
        pipeline_stage="submitted",  # Real SEND packages are submitted studies
        domain_count=len(study.xpt_files),
        domains=sorted(study.xpt_files.keys()),
        dose_groups=dose_groups_list,
    )
