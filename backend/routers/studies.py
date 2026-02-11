import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models.schemas import DomainData, DomainSummary, StudyMetadata, StudySummary
from services.study_discovery import StudyInfo
from services.xpt_processor import (
    extract_full_ts_metadata,
    extract_ts_metadata,
    get_all_domain_summaries,
    get_domain_data,
)

router = APIRouter(prefix="/api")

SCENARIOS_DIR = Path(__file__).parent.parent / "scenarios"

# Populated at startup
_studies: dict[str, StudyInfo] = {}
_study_metadata: dict[str, dict] = {}
_full_metadata: dict[str, StudyMetadata] = {}


def init_studies(studies: dict[str, StudyInfo]):
    _studies.clear()
    _studies.update(studies)
    _study_metadata.clear()
    _full_metadata.clear()
    for study_id, study in _studies.items():
        _study_metadata[study_id] = extract_ts_metadata(study)
        _full_metadata[study_id] = extract_full_ts_metadata(study)


def register_study(study: StudyInfo):
    """Register a single study at runtime (used by import)."""
    _studies[study.study_id] = study
    _study_metadata[study.study_id] = extract_ts_metadata(study)
    _full_metadata[study.study_id] = extract_full_ts_metadata(study)


def unregister_study(study_id: str):
    """Remove a study from runtime caches (used by delete)."""
    _studies.pop(study_id, None)
    _study_metadata.pop(study_id, None)
    _full_metadata.pop(study_id, None)


def _get_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


@router.get("/studies", response_model=list[StudySummary])
def list_studies():
    results = []
    for study_id, study in sorted(_studies.items()):
        meta = _study_metadata.get(study_id, {})
        full = _full_metadata.get(study_id)
        subjects = None
        if full and full.subjects:
            try:
                subjects = int(float(full.subjects))
            except (ValueError, TypeError):
                pass
        results.append(StudySummary(
            study_id=study.study_id,
            name=study.name,
            domain_count=len(study.xpt_files),
            species=meta.get("species"),
            study_type=meta.get("study_type"),
            protocol=full.protocol if full else None,
            standard=full.send_version if full else None,
            subjects=subjects,
            start_date=full.start_date if full else None,
            end_date=full.end_date if full else None,
        ))
    return results


@router.get("/studies/{study_id}/metadata")
def get_study_metadata(study_id: str):
    # Fallback to scenario fixtures for SCENARIO-* IDs
    if study_id.startswith("SCENARIO-"):
        path = SCENARIOS_DIR / study_id / "study_metadata_enriched.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Scenario '{study_id}' not found")
        with open(path) as f:
            enriched = json.load(f)
        # Return a StudyMetadata-compatible shape
        from scenarios.registry import get_scenario
        scn = get_scenario(study_id)
        return StudyMetadata(
            study_id=study_id,
            title=scn.name if scn else study_id,
            protocol=None,
            species=enriched.get("species"),
            strain=enriched.get("strain"),
            study_type=enriched.get("study_type"),
            design=enriched.get("study_design"),
            route=enriched.get("route"),
            treatment=enriched.get("test_article"),
            vehicle=enriched.get("vehicle"),
            dosing_duration=None,
            start_date=enriched.get("study_start"),
            end_date=enriched.get("study_end"),
            subjects=str(scn.subjects) if scn and scn.subjects else None,
            males=None,
            females=None,
            sponsor=enriched.get("sponsor"),
            test_facility=None,
            study_director=None,
            glp=None,
            send_version=None,
            domain_count=scn.domain_count if scn else 0,
            domains=[],
            dose_groups=None,
        )
    _get_study(study_id)  # validates existence
    return _full_metadata[study_id]


@router.get("/studies/{study_id}/domains", response_model=list[DomainSummary])
def list_domains(study_id: str):
    # Scenarios have no XPT files to browse
    if study_id.startswith("SCENARIO-"):
        return []
    study = _get_study(study_id)
    return get_all_domain_summaries(study)


@router.get("/studies/{study_id}/domains/{domain_name}", response_model=DomainData)
def get_domain(
    study_id: str,
    domain_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    study = _get_study(study_id)
    domain = domain_name.lower()
    if domain not in study.xpt_files:
        raise HTTPException(status_code=404, detail=f"Domain '{domain_name}' not found in study '{study_id}'")
    return get_domain_data(study, domain, page, page_size)
