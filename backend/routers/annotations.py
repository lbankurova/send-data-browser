"""JSON-file-based annotation CRUD for sticky meta annotations (§13)."""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"

VALID_SCHEMA_TYPES = {
    "validation-issues", "tox-findings", "pathology-reviews",
    "validation-records", "endpoint-bookmarks", "causal-assessment",
    "threshold-config", "validation-rule-config",
    "custom-insight-rules", "custom-validation-rules",
    "study-notes",
}

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


def _get_audit_log_path(study_id: str) -> Path:
    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")
    return ANNOTATIONS_DIR / study_id / "audit_log.json"


def _compute_changes(old: dict | None, new: dict) -> dict[str, dict]:
    """Compute field-level diffs between old and new annotation values."""
    changes: dict[str, dict] = {}
    old = old or {}
    # Skip metadata fields from diff
    skip = {"pathologist", "reviewDate", "reviewedBy", "reviewedDate"}
    all_keys = set(old.keys()) | set(new.keys())
    for key in all_keys:
        if key in skip:
            continue
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val:
            changes[key] = {"old": old_val, "new": new_val}
    return changes


def _append_audit_entry(study_id: str, schema_type: str, entity_key: str,
                        action: str, user: str, changes: dict[str, dict]):
    """Append an entry to the study's audit log."""
    log_path = _get_audit_log_path(study_id)
    entries: list = []
    if log_path.exists():
        with open(log_path, "r") as f:
            entries = json.load(f)

    entries.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user": user,
        "schemaType": schema_type,
        "entityKey": entity_key,
        "action": action,
        "changes": changes,
    })

    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w") as f:
        json.dump(entries, f, indent=2)


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

    old_annotation = data.get(entity_key)

    # Merge payload
    annotation = payload.model_dump()
    annotation["pathologist"] = "User"
    annotation["reviewDate"] = datetime.now(timezone.utc).isoformat()

    data[entity_key] = annotation

    # Write back
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    # Audit trail (TRUST-06)
    changes = _compute_changes(old_annotation, annotation)
    if changes:
        action = "update" if old_annotation else "create"
        _append_audit_entry(study_id, schema_type, entity_key, action, "User", changes)

    return annotation


@router.get("/studies/{study_id}/audit-log")
async def get_audit_log(
    study_id: str,
    schema_type: Optional[str] = Query(None),
    entity_key: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """Return the audit log for a study, optionally filtered."""
    log_path = _get_audit_log_path(study_id)
    if not log_path.exists():
        return []
    with open(log_path, "r") as f:
        entries = json.load(f)

    # Filter
    if schema_type:
        entries = [e for e in entries if e["schemaType"] == schema_type]
    if entity_key:
        entries = [e for e in entries if e["entityKey"] == entity_key]

    # Return most recent first, limited
    entries.reverse()
    return entries[:limit]
