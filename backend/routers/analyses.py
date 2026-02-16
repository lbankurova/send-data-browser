"""API router for analyses endpoints."""

import math

from fastapi import APIRouter, HTTPException, Query

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models.analysis_schemas import (
    AdverseEffectsResponse,
    AnalysisSummary,
    FindingContext,
)
from services.study_discovery import StudyInfo
from services.analysis.unified_findings import compute_adverse_effects
from services.analysis.context_panes import build_finding_context

router = APIRouter(prefix="/api")

# Reference to studies (set at startup)
_studies: dict[str, StudyInfo] = {}


def init_analysis_studies(studies: dict[str, StudyInfo]):
    _studies.clear()
    _studies.update(studies)


def register_analysis_study(study: StudyInfo):
    _studies[study.study_id] = study


def unregister_analysis_study(study_id: str):
    _studies.pop(study_id, None)


def _get_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


@router.get("/studies/{study_id}/analyses/adverse-effects", response_model=AdverseEffectsResponse)
def get_adverse_effects(
    study_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    domain: str | None = Query(None, description="Filter by domain (LB, BW, OM, MI, MA, CL)"),
    sex: str | None = Query(None, description="Filter by sex (M/F)"),
    severity: str | None = Query(None, description="Filter by severity (adverse/warning/normal)"),
    search: str | None = Query(None, description="Text search across finding names"),
    organ_system: str | None = Query(None, description="Filter by organ system (e.g., hepatic, renal)"),
    endpoint_label: str | None = Query(None, description="Filter by endpoint label (exact match)"),
    dose_response_pattern: str | None = Query(None, description="Filter by dose-response pattern"),
):
    study = _get_study(study_id)
    data = compute_adverse_effects(study)

    findings = data["findings"]

    # Apply filters
    if domain:
        findings = [f for f in findings if f["domain"].upper() == domain.upper()]
    if sex:
        findings = [f for f in findings if f["sex"].upper() == sex.upper()]
    if severity:
        findings = [f for f in findings if f.get("severity") == severity.lower()]
    if organ_system:
        organ_lower = organ_system.lower()
        findings = [f for f in findings if f.get("organ_system", "").lower() == organ_lower]
    if endpoint_label:
        findings = [f for f in findings if f.get("endpoint_label") == endpoint_label]
    if dose_response_pattern:
        findings = [f for f in findings if f.get("dose_response_pattern") == dose_response_pattern]
    if search:
        search_lower = search.lower()
        findings = [f for f in findings if (
            search_lower in f.get("finding", "").lower()
            or search_lower in f.get("test_name", "").lower()
            or search_lower in (f.get("specimen") or "").lower()
            or search_lower in f.get("domain", "").lower()
        )]

    total_findings = len(findings)
    total_pages = max(1, math.ceil(total_findings / page_size))

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_findings = findings[start:end]

    return AdverseEffectsResponse(
        study_id=study_id,
        dose_groups=data["dose_groups"],
        findings=page_findings,
        total_findings=total_findings,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        summary=AnalysisSummary(**data["summary"]),
    )


@router.get("/studies/{study_id}/analyses/adverse-effects/finding/{finding_id}", response_model=FindingContext)
def get_finding_context(study_id: str, finding_id: str):
    study = _get_study(study_id)
    data = compute_adverse_effects(study)

    # Find the specific finding
    finding = next((f for f in data["findings"] if f.get("id") == finding_id), None)
    if finding is None:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found")

    context = build_finding_context(
        finding,
        data["findings"],
        data["correlations"],
        data["dose_groups"],
    )

    return FindingContext(**context)


@router.get("/studies/{study_id}/analyses/adverse-effects/summary")
def get_adverse_effects_summary(study_id: str):
    study = _get_study(study_id)
    data = compute_adverse_effects(study)
    return data["summary"]
