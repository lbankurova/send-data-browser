"""JSON-file-based annotation CRUD for sticky meta annotations (§13)."""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"

VALID_SCHEMA_TYPES = {"validation-issues", "tox-findings", "pathology-reviews", "validation-records", "endpoint-bookmarks", "causal-assessment"}

# Map URL slugs to file names
_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_SCHEMA_TYPES}

router = APIRouter(prefix="/api", tags=["annotations"])


class AnnotationPayload(BaseModel, extra="allow"):
    """Accepts arbitrary annotation fields; server adds pathologist + timestamp."""
    pass


def _get_file_path(study_id: str, schema_type: str) -> Path:
    if schema_type not in VALID_SCHEMA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid schema type: {schema_type}")
    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")
    return ANNOTATIONS_DIR / study_id / _slug_to_file[schema_type]


@router.get("/studies/{study_id}/annotations/{schema_type}")
async def get_annotations(study_id: str, schema_type: str):
    """Return all annotations for a given schema type."""
    file_path = _get_file_path(study_id, schema_type)
    if not file_path.exists():
        return {}
    with open(file_path, "r") as f:
        return json.load(f)


@router.put("/studies/{study_id}/annotations/{schema_type}/{entity_key}")
async def save_annotation(study_id: str, schema_type: str, entity_key: str, payload: AnnotationPayload):
    """Create or update an annotation for a specific entity."""
    file_path = _get_file_path(study_id, schema_type)

    # Read existing
    data: dict = {}
    if file_path.exists():
        with open(file_path, "r") as f:
            data = json.load(f)

    # Merge payload
    annotation = payload.model_dump()
    annotation["pathologist"] = "User"
    annotation["reviewDate"] = datetime.now(timezone.utc).isoformat()

    data[entity_key] = annotation

    # Write back
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    return annotation
