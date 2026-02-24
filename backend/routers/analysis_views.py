"""Serves pre-generated analysis JSON files and static HTML."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

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

# Map URL slugs to file names (slug uses hyphens, files use underscores)
_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_VIEW_NAMES}

router = APIRouter(prefix="/api", tags=["analysis-views"])


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
async def get_analysis_view(study_id: str, view_name: str):
    """Return pre-generated JSON for a specific analysis view."""
    if view_name not in VALID_VIEW_NAMES:
        raise HTTPException(status_code=404, detail=f"Unknown view: {view_name}")

    file_name = _slug_to_file[view_name]
    file_path = GENERATED_DIR / study_id / file_name

    # Fallback to scenario fixtures for SCENARIO-* IDs
    if not file_path.exists():
        file_path = SCENARIOS_DIR / study_id / file_name

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Analysis data not generated for {study_id}/{view_name}. Run the generator first.",
        )

    with open(file_path, "r") as f:
        return json.load(f)
