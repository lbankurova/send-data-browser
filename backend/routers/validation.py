"""FastAPI router for the SEND validation engine."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from validation.engine import ValidationEngine
from validation.models import (
    AffectedRecordsResponse,
    FixScriptPreviewResponse,
    ValidationResultsResponse,
    ValidationSummaryResponse,
)
from validation.scripts.registry import compute_preview

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Module-level state (initialized by main.py lifespan)
_studies: dict = {}
_engine: ValidationEngine | None = None


def init_validation(studies: dict):
    """Initialize validation engine and auto-run validation for all studies."""
    global _studies, _engine
    _studies = studies
    _engine = ValidationEngine()

    # Auto-run validation so results are always cached on startup
    for study_id, study in studies.items():
        try:
            results = _engine.validate(study)
            _engine.save_results(study_id, results)
            logger.info(
                "Validated %s: %d issues (%.1fs)",
                study_id,
                results.summary["total_issues"],
                results.summary["elapsed_seconds"],
            )
        except Exception:
            logger.exception("Auto-validation failed for %s", study_id)


def register_validation_study(study, *, validate: bool = True, auto_fix: bool = False):
    """Register a study for validation at runtime."""
    _studies[study.study_id] = study
    if _engine and validate:
        try:
            results = _engine.validate(study)
            _engine.save_results(study.study_id, results)
            if auto_fix:
                fix_counts = _engine.apply_auto_fixes(study)
                if fix_counts:
                    logger.info("Auto-fixes for %s: %s", study.study_id, fix_counts)
        except Exception:
            logger.exception("Validation failed for imported study %s", study.study_id)


def unregister_validation_study(study_id: str):
    _studies.pop(study_id, None)


def _get_study(study_id: str):
    study = _studies.get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return study


def _get_engine() -> ValidationEngine:
    if _engine is None:
        raise HTTPException(status_code=500, detail="Validation engine not initialized")
    return _engine


@router.post("/studies/{study_id}/validate")
async def run_validation(study_id: str):
    """Run validation on a study and cache results."""
    study = _get_study(study_id)
    engine = _get_engine()

    try:
        results = engine.validate(study)
        engine.save_results(study_id, results)

        return ValidationSummaryResponse(
            total_issues=results.summary["total_issues"],
            errors=results.summary["errors"],
            warnings=results.summary["warnings"],
            info=results.summary["info"],
            domains_affected=results.summary["domains_affected"],
        )
    except Exception as e:
        logger.error(f"Validation failed for {study_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.get("/studies/{study_id}/validation/results")
async def get_validation_results(study_id: str):
    """Serve cached validation results."""
    _get_study(study_id)
    engine = _get_engine()

    cached = engine.load_cached_results(study_id)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="Validation has not been run yet. POST to /validate first.",
        )

    return ValidationResultsResponse(
        rules=cached.rules,
        scripts=cached.scripts,
        summary=cached.summary,
    )


@router.get("/studies/{study_id}/validation/results/{rule_id}/records")
async def get_affected_records(
    study_id: str,
    rule_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """Get paginated affected records for a specific rule."""
    _get_study(study_id)
    engine = _get_engine()

    records, total = engine.get_affected_records(
        _get_study(study_id), rule_id, page, page_size
    )

    return AffectedRecordsResponse(
        records=records,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/studies/{study_id}/validation/scripts/{script_key}/preview")
async def get_script_preview(study_id: str, script_key: str, body: dict | None = None):
    """Compute before/after preview for a fix script."""
    study = _get_study(study_id)
    engine = _get_engine()

    scope = (body or {}).get("scope", "all")
    rule_id = (body or {}).get("rule_id")

    # Load domains for preview computation
    domains = engine.load_study_domains(study)
    preview = compute_preview(script_key, domains, scope, rule_id)

    return FixScriptPreviewResponse(preview=preview)
