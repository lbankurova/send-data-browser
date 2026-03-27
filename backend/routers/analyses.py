"""API router for analyses endpoints.

All three endpoints serve from pre-generated unified_findings.json by default.
When non-default settings are active, the parameterized pipeline runs on demand
with file-based caching (same pattern as analysis_views.py).
"""

import json
import logging
import math
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from config import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from models.analysis_schemas import (
    AdverseEffectsResponse,
    AnalysisSummary,
    FindingContext,
    OrganCorrelationMatrix,
    SyndromeBatchCorrelationRequest,
    SyndromeCorrelationRequest,
    SyndromeCorrelationResult,
    SyndromeCorrelationSummary,
)
from services.study_discovery import StudyInfo
from services.analysis.context_panes import build_finding_context, build_organ_correlation_matrix, build_syndrome_correlation_summary
from services.analysis.correlations import compute_syndrome_correlations
from services.analysis.analysis_settings import AnalysisSettings, parse_settings_from_query, load_scoring_params
from services.analysis.analysis_cache import (
    read_cache, write_cache,
    acquire_compute_lock, release_compute_lock, wait_for_cache,
)
from services.analysis.override_reader import get_last_dosing_day_override

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

GENERATED_DIR = Path(__file__).parent.parent / "generated"

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


@lru_cache(maxsize=8)
def _load_unified_findings_cached(study_id: str, _mtime_ns: int) -> dict:
    """Deserialize unified_findings.json with in-memory caching.

    Keyed on (study_id, file mtime) so cache auto-invalidates when the
    file is regenerated. LRU(8) keeps the last few studies warm.
    """
    path = GENERATED_DIR / study_id / "unified_findings.json"
    with open(path, "r") as f:
        return json.load(f)


def _load_unified_findings(study_id: str) -> dict:
    """Load pre-generated unified_findings.json, cached in memory."""
    path = GENERATED_DIR / study_id / "unified_findings.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Pre-generated data not found for study '{study_id}'. Run the generator first.",
        )
    mtime_ns = path.stat().st_mtime_ns
    return _load_unified_findings_cached(study_id, mtime_ns)


def invalidate_findings_cache(study_id: str | None = None):
    """Clear in-memory findings cache. Called after regeneration."""
    _load_unified_findings_cached.cache_clear()
    log.debug("Cleared in-memory findings cache%s", f" (triggered by {study_id})" if study_id else "")


def _load_findings_for_settings(study_id: str, settings: AnalysisSettings) -> dict:
    """Load unified_findings for the given settings, computing on cache miss."""
    scoring = load_scoring_params(study_id)
    if settings.is_default() and scoring.is_default():
        return _load_unified_findings(study_id)

    # Non-default: cache check → pipeline (with cross-process lock)
    cache_key = settings.settings_hash(scoring=scoring)
    cached = read_cache(study_id, cache_key, "unified-findings")
    if cached is not None:
        return cached

    if acquire_compute_lock(study_id, cache_key):
        try:
            cached = read_cache(study_id, cache_key, "unified-findings")
            if cached is not None:
                return cached

            from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline

            study = _get_study(study_id)
            mortality_path = GENERATED_DIR / study_id / "study_mortality.json"
            mortality = json.loads(mortality_path.read_text()) if mortality_path.exists() else None
            early_deaths = mortality.get("early_death_subjects") if mortality else None
            ldd_override = get_last_dosing_day_override(study_id)

            pipeline = ParameterizedAnalysisPipeline(study)
            views = pipeline.run(
                settings,
                early_death_subjects=early_deaths,
                last_dosing_day_override=ldd_override,
                mortality=mortality,
            )
            write_cache(study_id, cache_key, views)
            return views["unified_findings"]
        finally:
            release_compute_lock(study_id, cache_key)
    else:
        cached = wait_for_cache(study_id, cache_key, "unified-findings")
        if cached is not None:
            return cached
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Pipeline computation timed out")


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
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    _get_study(study_id)  # validate study exists
    data = _load_findings_for_settings(study_id, settings)

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
def get_finding_context(
    study_id: str,
    finding_id: str,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    _get_study(study_id)  # validate study exists
    data = _load_findings_for_settings(study_id, settings)

    # Find the specific finding
    finding = next((f for f in data["findings"] if f.get("id") == finding_id), None)
    if finding is None:
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found")

    context = build_finding_context(
        finding,
        data["findings"],
        data.get("correlations", []),
        data["dose_groups"],
    )

    return FindingContext(**context)


@router.get("/studies/{study_id}/analyses/adverse-effects/organ/{organ_key}/correlations", response_model=OrganCorrelationMatrix)
def get_organ_correlations(
    study_id: str,
    organ_key: str,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    _get_study(study_id)
    data = _load_findings_for_settings(study_id, settings)

    # Count unique domains with adverse/warning findings for this organ
    # (used for convergence-aware interpretive gloss in the matrix summary)
    convergence_domains: set[str] = set()
    for f in data.get("findings", []):
        if f.get("organ_system", "").lower() != organ_key.lower():
            continue
        sev = f.get("severity", "normal")
        if sev in ("adverse", "warning"):
            convergence_domains.add(f.get("domain", ""))

    result = build_organ_correlation_matrix(
        organ_key,
        data.get("correlations", []),
        convergence_domain_count=len(convergence_domains),
    )
    return OrganCorrelationMatrix(**result)


@router.get("/studies/{study_id}/analyses/adverse-effects/summary")
def get_adverse_effects_summary(
    study_id: str,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    _get_study(study_id)  # validate study exists
    data = _load_findings_for_settings(study_id, settings)
    return data["summary"]


@router.post("/studies/{study_id}/analyses/adverse-effects/syndrome-correlations", response_model=SyndromeCorrelationResult)
def post_syndrome_correlations(
    study_id: str,
    body: SyndromeCorrelationRequest,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    _get_study(study_id)
    data = _load_findings_for_settings(study_id, settings)

    correlations, excluded = compute_syndrome_correlations(
        data["findings"],
        body.endpoint_labels,
    )

    result = build_syndrome_correlation_summary(
        correlations, excluded, body.syndrome_id,
    )

    return SyndromeCorrelationResult(**result)


@router.post("/studies/{study_id}/analyses/adverse-effects/syndrome-correlation-summaries")
def post_syndrome_correlation_summaries(
    study_id: str,
    body: SyndromeBatchCorrelationRequest,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    """Batch endpoint: compute co-variation summaries for all syndromes in one request."""
    _get_study(study_id)
    data = _load_findings_for_settings(study_id, settings)
    findings = data["findings"]

    summaries: dict[str, dict] = {}
    for entry in body.syndromes:
        correlations, excluded = compute_syndrome_correlations(
            findings, entry.endpoint_labels,
        )
        result = build_syndrome_correlation_summary(
            correlations, excluded, entry.syndrome_id,
        )
        summaries[entry.syndrome_id] = result["summary"]

    return {"summaries": summaries}
