"""Serves pre-generated analysis JSON files and static HTML.

For parameterized views, non-default settings trigger on-demand pipeline
computation with file-based caching.
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from services.study_discovery import StudyInfo
from services.analysis.analysis_settings import AnalysisSettings, parse_settings_from_query
from services.analysis.analysis_cache import read_cache, write_cache, invalidate_study
from services.analysis.override_reader import get_last_dosing_day_override, apply_pattern_overrides

log = logging.getLogger(__name__)

GENERATED_DIR = Path(__file__).parent.parent / "generated"
SCENARIOS_DIR = Path(__file__).parent.parent / "scenarios"

VALID_VIEW_NAMES = {
    "study-signal-summary",
    "target-organ-summary",
    "dose-response-metrics",
    "organ-evidence-detail",
    "lesion-severity-summary",
    "adverse-effect-summary",
    "noael-summary",
    "rule-results",
    "finding-dose-trends",
    "subject-context",
    "provenance-messages",
    "study-metadata-enriched",
    "study-mortality",
    "tumor-summary",
    "food-consumption-summary",
    "pk-integration",
    "cross-animal-flags",
    "unified-findings",
}

# The 10 view names that the parameterized pipeline produces
PARAMETERIZED_VIEWS = {
    "study-signal-summary", "target-organ-summary", "dose-response-metrics",
    "organ-evidence-detail", "lesion-severity-summary", "adverse-effect-summary",
    "noael-summary", "finding-dose-trends", "rule-results",
    "unified-findings",
}

# Map URL slugs to file names (slug uses hyphens, files use underscores)
_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_VIEW_NAMES}

router = APIRouter(prefix="/api", tags=["analysis-views"])

# Reference to studies (set at startup)
_studies: dict[str, StudyInfo] = {}


def init_analysis_views(studies: dict[str, StudyInfo]):
    _studies.clear()
    _studies.update(studies)


def _resolve_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


def _load_mortality(study_id: str) -> dict | None:
    """Read study_mortality.json from generated dir."""
    path = GENERATED_DIR / study_id / "study_mortality.json"
    if not path.exists():
        return None
    with open(path, "r") as f:
        return json.load(f)


def _load_from_disk(study_id: str, file_name: str):
    """Load a JSON file from generated/ or scenarios/ fallback."""
    file_path = GENERATED_DIR / study_id / file_name
    if not file_path.exists():
        file_path = SCENARIOS_DIR / study_id / file_name
    if not file_path.exists():
        return None
    with open(file_path, "r") as f:
        return json.load(f)


def _apply_overrides(data, study_id: str, view_name: str):
    """Apply user annotation overrides to view data before serving.

    Currently handles pattern overrides for unified-findings.
    """
    if view_name == "unified-findings" and isinstance(data, dict):
        findings = data.get("findings")
        if findings and isinstance(findings, list):
            data["findings"] = apply_pattern_overrides(findings, study_id)
    return data


# Regenerate endpoint — runs the full generation pipeline synchronously.
# Plain `def` (not `async def`) so FastAPI runs it in a threadpool,
# keeping the event loop responsive during the ~10s rebuild.
@router.post("/studies/{study_id}/regenerate")
def regenerate_study(study_id: str):
    """Re-run the generator pipeline for a study.

    Reads analysis settings (e.g. last_dosing_day_override) from
    annotations and rebuilds all generated JSON files.
    """
    from generator.generate import generate

    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")

    try:
        generate(study_id)
    except SystemExit:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")

    # Invalidate settings cache after regeneration
    invalidate_study(study_id)

    # Read back the enriched metadata for response
    meta_path = GENERATED_DIR / study_id / "study_metadata_enriched.json"
    last_dosing_day = None
    last_dosing_day_override = None
    findings_count = 0
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        last_dosing_day = meta.get("last_dosing_day")
        last_dosing_day_override = meta.get("last_dosing_day_override")

    # Count findings from signal summary
    signal_path = GENERATED_DIR / study_id / "study_signal_summary.json"
    if signal_path.exists():
        findings_count = len(json.loads(signal_path.read_text()))

    return {
        "status": "ok",
        "last_dosing_day": last_dosing_day,
        "last_dosing_day_override": last_dosing_day_override,
        "findings_count": findings_count,
    }


# Static route MUST be defined before the wildcard route
@router.get("/studies/{study_id}/analysis/static/{chart_name}")
async def get_static_chart(study_id: str, chart_name: str):
    """Return static HTML chart."""
    if "/" in chart_name or "\\" in chart_name or ".." in chart_name:
        raise HTTPException(status_code=400, detail="Invalid chart name")

    if not chart_name.endswith(".html"):
        chart_name += ".html"

    file_path = GENERATED_DIR / study_id / "static" / chart_name

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Chart not found: {chart_name}")

    with open(file_path, "r") as f:
        return HTMLResponse(content=f.read())


@router.get("/studies/{study_id}/analysis/{view_name}")
def get_analysis_view(
    study_id: str,
    view_name: str,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
):
    """Return analysis view JSON, parameterized by settings.

    Default settings serve pre-generated files (zero overhead).
    Non-default settings go through cache -> pipeline.

    Plain `def` (not `async def`) so FastAPI runs it in a threadpool
    during the ~2-5s computation for non-default settings.
    """
    if view_name not in VALID_VIEW_NAMES:
        raise HTTPException(status_code=404, detail=f"Unknown view: {view_name}")

    file_name = _slug_to_file[view_name]

    # Non-parameterized views (mortality, context, PK, etc.) or default settings -> from disk
    if view_name not in PARAMETERIZED_VIEWS or settings.is_default():
        data = _load_from_disk(study_id, file_name)
        if data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Analysis data not generated for {study_id}/{view_name}. Run the generator first.",
            )
        return _apply_overrides(data, study_id, view_name)

    # Non-default settings -> cache -> pipeline
    cache_key = settings.settings_hash()
    cached = read_cache(study_id, cache_key, view_name)
    if cached is not None:
        return _apply_overrides(cached, study_id, view_name)

    # Cache miss -> compute all views for this settings combination
    log.info("Cache miss for %s/%s (hash=%s), computing...", study_id, view_name, cache_key)
    study = _resolve_study(study_id)

    from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline

    pipeline = ParameterizedAnalysisPipeline(study)
    mortality = _load_mortality(study_id)
    early_deaths = mortality.get("early_death_subjects") if mortality else None
    ldd_override = get_last_dosing_day_override(study_id)

    views = pipeline.run(
        settings,
        early_death_subjects=early_deaths,
        last_dosing_day_override=ldd_override,
        mortality=mortality,
    )
    write_cache(study_id, cache_key, views)

    # Return the requested view (convert slug to underscore key)
    view_key = view_name.replace("-", "_")
    return _apply_overrides(views[view_key], study_id, view_name)
