"""Serves pre-generated analysis JSON files and static HTML.

For parameterized views, non-default settings trigger on-demand pipeline
computation with file-based caching.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from services.study_discovery import StudyInfo
from services.analysis.analysis_settings import AnalysisSettings, parse_settings_from_query, load_scoring_params
from services.analysis.analysis_cache import (
    read_cache, write_cache, invalidate_study,
    acquire_compute_lock, release_compute_lock, wait_for_cache,
)
from services.analysis.override_reader import (
    get_last_dosing_day_override,
    apply_pattern_overrides,
    load_all_pattern_overrides,
    VALID_PATTERN_OVERRIDES,
    _resolve_override,
)
from services.analysis.classification import determine_treatment_related, assess_finding

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
    "subject-syndromes",
    "subject-onset-days",
    "recovery-verdicts",
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


@lru_cache(maxsize=64)
def _load_from_disk_cached(file_path: str, _mtime_ns: int):
    """Deserialize a JSON file with in-memory LRU caching.

    Keyed on (path, mtime) so cache auto-invalidates when the file changes.
    """
    with open(file_path, "r") as f:
        return json.load(f)


def _load_from_disk(study_id: str, file_name: str):
    """Load a JSON file from generated/ or scenarios/ fallback, cached in memory."""
    file_path = GENERATED_DIR / study_id / file_name
    if not file_path.exists():
        file_path = SCENARIOS_DIR / study_id / file_name
    if not file_path.exists():
        return None
    mtime_ns = file_path.stat().st_mtime_ns
    return _load_from_disk_cached(str(file_path), mtime_ns)


# Fields produced by the generator for internal computation (e.g. correlations)
# but never consumed by the frontend.  Strip before serving to reduce payload.
_STRIP_FIELDS = ("raw_subject_values",)


def _strip_fields(findings: list[dict]) -> list[dict]:
    """Remove generator-internal fields from findings (creates new dicts)."""
    return [{k: v for k, v in f.items() if k not in _STRIP_FIELDS} for f in findings]


def _apply_overrides(data, study_id: str, view_name: str):
    """Apply user annotation overrides and strip internal fields before serving.

    Handles pattern overrides for unified-findings and strips generator-internal
    fields (e.g. raw_subject_values) that the frontend never consumes.
    Works on copies to avoid mutating LRU-cached originals.
    """
    if view_name == "unified-findings" and isinstance(data, dict):
        findings = data.get("findings")
        if findings and isinstance(findings, list):
            overrides = load_all_pattern_overrides(study_id)
            if not overrides:
                # No overrides — strip creates new dicts (protects LRU cache)
                return {**data, "findings": _strip_fields(findings)}
            # Shallow-copy + apply overrides, then strip in-place (copies
            # already exist, so mutating them to delete keys is safe)
            findings_copy = [{**f} for f in findings]
            applied = apply_pattern_overrides(findings_copy, study_id)
            for f in applied:
                for key in _STRIP_FIELDS:
                    f.pop(key, None)
            return {**data, "findings": applied}
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

    # Invalidate caches after regeneration
    invalidate_study(study_id)
    _load_from_disk_cached.cache_clear()
    from routers.analyses import invalidate_findings_cache
    invalidate_findings_cache(study_id)

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

    # Load expert scoring params (defaults if none saved)
    scoring = load_scoring_params(study_id)

    # Non-parameterized views (mortality, context, PK, etc.) or all defaults -> from disk
    if view_name not in PARAMETERIZED_VIEWS or (settings.is_default() and scoring.is_default()):
        data = _load_from_disk(study_id, file_name)
        if data is None:
            raise HTTPException(
                status_code=404,
                detail=f"Analysis data not generated for {study_id}/{view_name}. Run the generator first.",
            )
        return _apply_overrides(data, study_id, view_name)

    # Non-default settings or scoring -> cache -> pipeline
    cache_key = settings.settings_hash(scoring=scoring)
    cached = read_cache(study_id, cache_key, view_name)
    if cached is not None:
        return _apply_overrides(cached, study_id, view_name)

    # Cache miss -> file-based lock prevents thundering herd across workers.
    # Lock is keyed on settings_hash: only requests with the SAME non-default
    # settings are serialized; different settings combinations run independently.
    if acquire_compute_lock(study_id, cache_key):
        try:
            # Double-check: cache may have appeared between our read and lock
            cached = read_cache(study_id, cache_key, view_name)
            if cached is not None:
                return _apply_overrides(cached, study_id, view_name)

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
        finally:
            release_compute_lock(study_id, cache_key)
    else:
        # Another worker/thread is computing — wait for result
        log.info("Waiting for pipeline %s/%s (hash=%s)...", study_id, view_name, cache_key)
        cached = wait_for_cache(study_id, cache_key, view_name)
        if cached is not None:
            return _apply_overrides(cached, study_id, view_name)
        raise HTTPException(status_code=503, detail="Pipeline computation timed out")

    # Return the requested view from cache
    view_key = view_name.replace("-", "_")
    cached = read_cache(study_id, cache_key, view_name)
    if cached is None:
        raise HTTPException(status_code=500, detail=f"Pipeline did not produce {view_name}")
    return _apply_overrides(cached, study_id, view_name)


# ---------------------------------------------------------------------------
# Pattern override preview (FF-01)
# ---------------------------------------------------------------------------

class PatternOverridePreviewRequest(BaseModel):
    finding_id: str
    proposed_pattern: str


@router.post("/studies/{study_id}/analyses/pattern-override-preview")
async def pattern_override_preview(study_id: str, body: PatternOverridePreviewRequest):
    """Simulate a pattern override without saving — returns downstream changes.

    Read-only: loads the finding, applies the proposed pattern on a copy,
    re-derives treatment_related and finding_class, and returns what would change.
    """
    if body.proposed_pattern not in VALID_PATTERN_OVERRIDES:
        raise HTTPException(status_code=400,
                            detail=f"Invalid pattern: {body.proposed_pattern}")

    # Reuse in-memory cached loader from analyses.py
    from routers.analyses import _load_unified_findings
    data = _load_unified_findings(study_id)

    findings = data.get("findings", [])
    original = next((f for f in findings if f.get("id") == body.finding_id), None)
    if original is None:
        raise HTTPException(status_code=404,
                            detail=f"Finding not found: {body.finding_id}")

    # Simulate on a shallow copy
    sim = {**original}
    direction = sim.get("direction", "down") or "down"
    sim["dose_response_pattern"] = _resolve_override(body.proposed_pattern, direction)
    sim["treatment_related"] = determine_treatment_related(sim)
    sim["finding_class"] = assess_finding(sim)

    # Re-derive confidence (D2 reads pattern, D5 reads sibling finding_class)
    from services.analysis.confidence import compute_confidence
    opposite = {"M": "F", "F": "M"}
    opp_sex = opposite.get(sim.get("sex", ""), "")
    sibling = next(
        (f for f in findings
         if f.get("endpoint_label") == sim.get("endpoint_label")
         and f.get("day") == sim.get("day")
         and f.get("sex") == opp_sex),
        None,
    )
    sim["_confidence"] = compute_confidence(sim, sibling)

    original_confidence = original.get("_confidence", {})
    return {
        "finding_id": body.finding_id,
        "original_pattern": original.get("dose_response_pattern"),
        "proposed_pattern": body.proposed_pattern,
        "resolved_pattern": sim["dose_response_pattern"],
        "treatment_related": {
            "original": original.get("treatment_related"),
            "proposed": sim["treatment_related"],
            "changed": original.get("treatment_related") != sim["treatment_related"],
        },
        "finding_class": {
            "original": original.get("finding_class"),
            "proposed": sim["finding_class"],
            "changed": original.get("finding_class") != sim["finding_class"],
        },
        "confidence": {
            "original": original_confidence.get("grade"),
            "proposed": sim["_confidence"]["grade"],
            "changed": original_confidence.get("grade") != sim["_confidence"]["grade"],
        },
    }
