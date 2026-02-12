"""Study portfolio API endpoints."""

from fastapi import APIRouter, HTTPException
from typing import List
from models.study_metadata import StudyMetadata, Project
from models.insight import Insight
from services.study_metadata_service import get_study_metadata_service
from services.insights_engine import generate_insights

router = APIRouter(prefix="/api/portfolio", tags=["study-portfolio"])


@router.get("/studies", response_model=List[StudyMetadata])
async def list_studies():
    """
    Get all studies across all projects.

    Returns:
        List of all study metadata objects with dual-layer (reported/derived) data
    """
    service = get_study_metadata_service()
    return service.get_all_studies()


@router.get("/studies/{study_id}", response_model=StudyMetadata)
async def get_study(study_id: str):
    """
    Get single study detail by ID.

    Args:
        study_id: Study identifier (e.g., "PC201708")

    Returns:
        Study metadata with both reported and derived layers

    Raises:
        HTTPException: 404 if study not found
    """
    service = get_study_metadata_service()
    study = service.get_study(study_id)

    if study is None:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found")

    return study


@router.get("/projects", response_model=List[Project])
async def list_projects():
    """
    Get all projects for filter dropdown.

    Returns:
        List of project metadata objects
    """
    service = get_study_metadata_service()
    return service.get_all_projects()


@router.get("/projects/{project_id}/studies", response_model=List[StudyMetadata])
async def get_project_studies(project_id: str):
    """
    Get all studies in a specific project.

    Args:
        project_id: Project identifier (e.g., "proj_pcdrug")

    Returns:
        List of studies in that project
    """
    service = get_study_metadata_service()
    return service.get_studies_by_project(project_id)


@router.get("/insights/{study_id}", response_model=List[Insight])
async def get_insights(study_id: str):
    """
    Generate cross-study insights for a selected study.

    Phase 4: Rule 0 (discrepancy detection) only
    Phase 5: Will add Rules 1-18 (cross-study intelligence)

    Args:
        study_id: Study identifier (e.g., "PC201708")

    Returns:
        List of insights sorted by priority (0=critical, 1=high, 2=medium, 3=low)

    Raises:
        HTTPException: 404 if study not found
    """
    service = get_study_metadata_service()
    selected = service.get_study(study_id)

    if selected is None:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found")

    all_studies = service.get_all_studies()
    insights = generate_insights(selected, all_studies)

    return insights
