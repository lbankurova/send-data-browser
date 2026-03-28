"""Study metadata service for loading and serving study portfolio data."""

import json
import logging
import re
from pathlib import Path
from typing import Optional

from models.study_metadata import StudyMetadata, Project
from services.study_discovery import StudyInfo

logger = logging.getLogger(__name__)


def _parse_iso_duration_weeks(dur: str | None) -> int | None:
    """Parse ISO 8601 duration to approximate weeks.  P4W→4, P28D→4, P1M→4, P13W→13."""
    if not dur:
        return None
    dur = dur.strip().upper()
    m = re.match(r"P(\d+)([DWMY])", dur)
    if not m:
        return None
    val, unit = int(m.group(1)), m.group(2)
    if unit == "W":
        return val
    if unit == "D":
        return max(1, val // 7)
    if unit == "M":
        return val * 4
    if unit == "Y":
        return val * 52
    return None


def _slugify(name: str) -> str:
    """Create a project ID from a compound name: 'PCDRUG' → 'proj_pcdrug'."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return f"proj_{slug}"


def _extract_ts_for_portfolio(study: StudyInfo) -> dict[str, str | None]:
    """Extract portfolio-relevant fields from TS domain."""
    ts_map: dict[str, str] = {}
    if "ts" not in study.xpt_files:
        return {}
    try:
        from services.xpt_processor import read_xpt
        df, _ = read_xpt(study.xpt_files["ts"])
        df.columns = [c.upper() for c in df.columns]
        if "TSPARMCD" in df.columns and "TSVAL" in df.columns:
            for _, row in df.iterrows():
                parm = str(row["TSPARMCD"]).strip().upper()
                val = str(row["TSVAL"]).strip()
                if val and val != "nan":
                    ts_map[parm] = val
    except Exception as e:
        logger.warning("Failed to parse TS for %s: %s", study.study_id, e)
    return ts_map


def _derive_study_metadata(study: StudyInfo) -> StudyMetadata:
    """Create a StudyMetadata from a discovered StudyInfo by parsing its TS domain."""
    ts = _extract_ts_for_portfolio(study)

    test_article = ts.get("TRT")
    project_id = _slugify(test_article) if test_article else None

    # Subject count: try TS first, fall back to counting DM rows
    subjects: int | None = None
    if "SPLANSUB" in ts:
        try:
            subjects = int(ts["SPLANSUB"])
        except ValueError:
            pass
    if subjects is None and "dm" in study.xpt_files:
        try:
            from services.xpt_processor import read_xpt
            dm_df, _ = read_xpt(study.xpt_files["dm"])
            dm_df.columns = [c.upper() for c in dm_df.columns]
            if "USUBJID" in dm_df.columns:
                subjects = int(dm_df["USUBJID"].nunique())
        except Exception:
            pass

    duration_weeks = _parse_iso_duration_weeks(ts.get("DOSDUR"))

    return StudyMetadata(
        id=study.study_id,
        project=project_id,
        test_article=test_article,
        title=ts.get("STITLE"),
        protocol=ts.get("SPREFID"),
        species=ts.get("SPECIES"),
        strain=ts.get("STRAIN"),
        route=ts.get("ROUTE"),
        study_type=ts.get("SSTYP"),
        duration_weeks=duration_weeks,
        recovery_weeks=None,
        doses=None,
        dose_unit=None,
        subjects=subjects,
        pipeline_stage="submitted",
        status="Complete",
        has_nsdrg=False,
        has_define=False,
        has_xpt=True,
        domains=sorted(study.xpt_files.keys()),
        auto_derived=True,
    )


class StudyMetadataService:
    """Service for managing study portfolio metadata."""

    def __init__(self, data_file: str = "data/study_metadata.json"):
        self.data_file = Path(data_file)
        self.studies: list[StudyMetadata] = []
        self.projects: list[Project] = []
        self._manual_ids: set[str] = set()  # IDs from the JSON file
        self._load_data()

    def _load_data(self) -> None:
        """Load study metadata and projects from JSON file."""
        if not self.data_file.exists():
            logger.warning("Study metadata file not found: %s", self.data_file)
            return

        try:
            with open(self.data_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            self.projects = [Project(**p) for p in data.get("projects", [])]
            self.studies = [StudyMetadata(**s) for s in data.get("studies", [])]
            self._manual_ids = {s.id for s in self.studies}

            logger.info("Loaded %d studies and %d projects from JSON",
                        len(self.studies), len(self.projects))
        except Exception as e:
            logger.error("Error loading study metadata: %s", e)
            raise

    def register_discovered_studies(self, studies: dict[str, StudyInfo]) -> None:
        """Auto-register discovered studies not already in the manual JSON.

        Parses TS domain for each new study, creates portfolio entries,
        and auto-creates Project entries from unique test_article values.
        """
        new_count = 0
        for sid, info in studies.items():
            if sid in self._manual_ids:
                continue
            # Check if already auto-registered (e.g. from a previous call)
            if any(s.id == sid for s in self.studies):
                continue

            meta = _derive_study_metadata(info)
            self.studies.append(meta)
            new_count += 1

        if new_count:
            logger.info("Auto-registered %d discovered studies into portfolio", new_count)

        # Auto-create projects from unique test_article values
        existing_project_ids = {p.id for p in self.projects}
        seen_compounds: set[str] = set()
        for s in self.studies:
            if not s.test_article or not s.project:
                continue
            if s.project in existing_project_ids:
                continue
            if s.test_article in seen_compounds:
                continue
            seen_compounds.add(s.test_article)

            proj = Project(
                id=s.project,
                name=f"{s.test_article} Program",
                compound=s.test_article,
            )
            self.projects.append(proj)
            existing_project_ids.add(proj.id)
            logger.info("Auto-created project '%s' for compound '%s'",
                        proj.id, s.test_article)

    def get_all_studies(self) -> list[StudyMetadata]:
        return self.studies

    def get_study(self, study_id: str) -> Optional[StudyMetadata]:
        for study in self.studies:
            if study.id == study_id:
                return study
        return None

    def get_studies_by_compound(self, test_article: str) -> list[StudyMetadata]:
        return [s for s in self.studies if s.test_article == test_article]

    def get_studies_by_project(self, project_id: str) -> list[StudyMetadata]:
        return [s for s in self.studies if s.project == project_id]

    def get_all_projects(self) -> list[Project]:
        return self.projects

    def get_project(self, project_id: str) -> Optional[Project]:
        for project in self.projects:
            if project.id == project_id:
                return project
        return None


# Global service instance
_service: Optional[StudyMetadataService] = None


def get_study_metadata_service() -> StudyMetadataService:
    """Get the global study metadata service instance."""
    global _service
    if _service is None:
        _service = StudyMetadataService()
    return _service
