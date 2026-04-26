"""JSON-file-based annotation CRUD for sticky meta annotations (§13)."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

log = logging.getLogger(__name__)

ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"

VALID_SCHEMA_TYPES = {
    "validation-issues", "tox-findings", "pathology-reviews",
    "validation-records", "endpoint-bookmarks", "causal-assessment",
    "threshold-config", "validation-rule-config",
    "custom-insight-rules", "custom-validation-rules",
    "study-notes", "analysis-settings", "normalization-overrides",
    "pattern-overrides", "noael-overrides", "mortality-overrides",
    "recovery-overrides",
    "saved-cohorts",
    "compound-profile",
    "study-type-override",
    "animal-exclusions",
    "pathologist-source",
    "hcd-user",
}

VALID_PROGRAM_SCHEMA_TYPES = {
    "clinical-dose", "clinical-auc", "noael-override",
    "species-relevance", "margin-config", "regulatory-context",
}

# Map URL slugs to file names
_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_SCHEMA_TYPES}
_program_slug_to_file = {slug: slug.replace("-", "_") + ".json" for slug in VALID_PROGRAM_SCHEMA_TYPES}

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
        with open(log_path, "r", encoding="utf-8") as f:
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
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.put("/studies/{study_id}/annotations/{schema_type}/{entity_key}")
async def save_annotation(study_id: str, schema_type: str, entity_key: str, payload: AnnotationPayload):
    """Create or update an annotation for a specific entity."""
    file_path = _get_file_path(study_id, schema_type)

    # Read existing
    data: dict = {}
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    old_annotation = data.get(entity_key)

    # Merge payload
    incoming = payload.model_dump()
    incoming["pathologist"] = "User"
    incoming["reviewDate"] = datetime.now(timezone.utc).isoformat()

    # Pattern override validation
    if schema_type == "pattern-overrides":
        existing_ann = data.get(entity_key, {})
        merged_pattern = incoming.get("pattern", existing_ann.get("pattern"))
        merged_onset = incoming.get("onset_dose_level", existing_ann.get("onset_dose_level"))
        original_pattern = incoming.get("original_pattern", existing_ann.get("original_pattern"))
        # Reject no-op overrides (pattern matches original AND onset unchanged)
        # An onset_dose_level change is meaningful even when the pattern key
        # matches the original — the user may be setting onset without changing
        # the pattern shape.
        if merged_pattern and original_pattern:
            from services.analysis.override_reader import _pattern_to_override_key
            orig_key = _pattern_to_override_key(original_pattern)
            existing_onset = existing_ann.get("onset_dose_level")
            onset_changed = merged_onset is not None and merged_onset != existing_onset
            if merged_pattern == orig_key and not onset_changed:
                log.info("Rejecting no-op pattern override %s for %s (pattern=%s matches original=%s, onset unchanged)",
                         entity_key, study_id, merged_pattern, original_pattern)
                # Delete existing entry if present (cleanup)
                if entity_key in data:
                    del data[entity_key]
                    with open(file_path, "w") as fw:
                        json.dump(data, fw, indent=2)
                return {"pattern": merged_pattern, "original_pattern": original_pattern, "_noop": True}
        if merged_pattern == "no_change" and merged_onset is not None:
            raise HTTPException(
                status_code=400,
                detail="onset_dose_level must be null when pattern is no_change",
            )
        if merged_pattern and merged_pattern != "no_change" and merged_onset is None:
            log.warning("Pattern override %s for %s/%s has directional pattern but null onset_dose_level",
                        entity_key, study_id, schema_type)

    # Merge into existing annotation so sibling fields are preserved
    existing = data.get(entity_key, {})
    existing.update(incoming)
    annotation = existing
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


@router.delete("/studies/{study_id}/annotations/{schema_type}/{entity_key}")
async def delete_annotation(study_id: str, schema_type: str, entity_key: str):
    """Delete a single annotation entry by entity key."""
    file_path = _get_file_path(study_id, schema_type)
    if not file_path.exists():
        return {"deleted": False}

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    old_annotation = data.pop(entity_key, None)
    if old_annotation is None:
        return {"deleted": False}

    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    # Audit trail
    _append_audit_entry(study_id, schema_type, entity_key, "delete", "User",
                        {"_deleted": {"old": old_annotation, "new": None}})
    return {"deleted": True}


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
    with open(log_path, "r", encoding="utf-8") as f:
        entries = json.load(f)

    # Filter
    if schema_type:
        entries = [e for e in entries if e["schemaType"] == schema_type]
    if entity_key:
        entries = [e for e in entries if e["entityKey"] == entity_key]

    # Return most recent first, limited
    entries.reverse()
    return entries[:limit]


# ─── HCD user upload ──────────────────────────────────────────


class HcdUploadEntry(BaseModel):
    """A single HCD reference entry in a bulk upload."""
    test_code: str
    sex: str
    mean: float | None = None
    sd: float | None = None
    values: list[float] | None = None
    unit: str | None = None


class HcdUploadPayload(BaseModel):
    """Bulk upload of user HCD reference data."""
    entries: list[HcdUploadEntry]


@router.post("/studies/{study_id}/annotations/hcd-user/upload")
async def upload_hcd_user(study_id: str, payload: HcdUploadPayload):
    """Bulk upload user-provided HCD reference data with validation."""
    import math
    import numpy as np
    from services.analysis.send_knowledge import normalize_test_code
    from generator.subject_sentinel import LOGNORMAL_ENDPOINTS

    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")

    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    validated: dict[str, dict] = {}

    for i, entry in enumerate(payload.entries):
        sex = entry.sex.strip().upper()
        if sex not in ("F", "M"):
            errors.append(f"Entry {i}: sex must be 'F' or 'M', got '{entry.sex}'")
            continue

        raw_tc = entry.test_code.strip().upper()
        tc = normalize_test_code(raw_tc)

        # Duplicate check
        key = (tc, sex)
        if key in seen:
            errors.append(f"Entry {i}: duplicate test_code+sex pair ({tc}, {sex})")
            continue
        seen.add(key)

        has_agg = entry.mean is not None and entry.sd is not None
        has_vals = entry.values is not None and len(entry.values) > 0

        if not has_agg and not has_vals:
            errors.append(f"Entry {i}: must provide either (mean + sd) or non-empty values array")
            continue

        if has_agg:
            if entry.mean <= 0:  # type: ignore[operator]
                errors.append(f"Entry {i}: mean must be > 0")
                continue
            if entry.sd <= 0:  # type: ignore[operator]
                errors.append(f"Entry {i}: sd must be > 0")
                continue

        # Compute derived stats from values if provided
        if has_vals:
            vals = [v for v in entry.values if v is not None]  # type: ignore[union-attr]
            if len(vals) == 0:
                errors.append(f"Entry {i}: values array is empty after filtering nulls")
                continue
            arr = np.array(vals, dtype=float)
            computed_mean = float(np.mean(arr))
            computed_sd = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
            computed_n = len(arr)
        else:
            computed_mean = entry.mean  # type: ignore[assignment]
            computed_sd = entry.sd  # type: ignore[assignment]
            computed_n = None

        is_lognormal = tc in LOGNORMAL_ENDPOINTS

        # Compute bounds
        if has_vals:
            arr_vals = np.array([v for v in entry.values if v is not None], dtype=float)  # type: ignore[union-attr]
            if is_lognormal:
                # Filter zeros for lognormal
                pos_vals = arr_vals[arr_vals > 0]
                if len(pos_vals) >= 2:
                    lower_bound = float(np.percentile(pos_vals, 2.5))
                    upper_bound = float(np.percentile(pos_vals, 97.5))
                else:
                    lower_bound = float(computed_mean - 2 * computed_sd)
                    upper_bound = float(computed_mean + 2 * computed_sd)
            else:
                lower_bound = float(np.percentile(arr_vals, 2.5))
                upper_bound = float(np.percentile(arr_vals, 97.5))
        elif is_lognormal and computed_mean > 0 and computed_sd > 0:
            # Aggregate mode, lognormal
            cv = computed_sd / computed_mean
            sigma_log_sq = math.log(1 + cv ** 2)
            mu_log = math.log(computed_mean) - sigma_log_sq / 2
            sigma_log = math.sqrt(sigma_log_sq)
            lower_bound = math.exp(mu_log - 1.96 * sigma_log)
            upper_bound = math.exp(mu_log + 1.96 * sigma_log)
        else:
            # Normal
            lower_bound = computed_mean - 2 * computed_sd
            upper_bound = computed_mean + 2 * computed_sd

        ref_entry: dict = {
            "test_code": tc,
            "original_test_code": raw_tc if raw_tc != tc else None,
            "sex": sex,
            "mean": computed_mean,
            "sd": computed_sd,
            "n": computed_n,
            "lower": round(lower_bound, 6),
            "upper": round(upper_bound, 6),
            "isLognormal": is_lognormal,
            "source": "user",
            "source_type": "user",
            "unit": entry.unit,
            "confidence": None,
        }
        if has_vals:
            ref_entry["values"] = [float(v) for v in entry.values]  # type: ignore[union-attr]
        if is_lognormal and has_agg and computed_mean > 0:
            # Store geom_mean for lognormal user uploads
            cv = computed_sd / computed_mean
            sigma_log_sq = math.log(1 + cv ** 2)
            ref_entry["geom_mean"] = round(math.exp(math.log(computed_mean) - sigma_log_sq / 2), 6)
        else:
            ref_entry["geom_mean"] = None

        entity_key = f"{tc}:{sex}"
        validated[entity_key] = ref_entry

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    # Store with _meta envelope
    result = {
        "_meta": {
            "uploaded_by": "User",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "entry_count": len(validated),
        },
        "references": validated,
    }

    file_path = ANNOTATIONS_DIR / study_id / "hcd_user.json"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(result, f, indent=2)

    # Audit trail
    _append_audit_entry(study_id, "hcd-user", "_bulk", "upload", "User",
                        {"entry_count": {"old": None, "new": len(validated)}})

    return {"uploaded": len(validated), "entries": list(validated.keys())}


@router.delete("/studies/{study_id}/annotations/hcd-user")
async def delete_hcd_user(study_id: str):
    """Delete all user-uploaded HCD data for a study."""
    if "/" in study_id or "\\" in study_id or ".." in study_id:
        raise HTTPException(status_code=400, detail="Invalid study ID")
    file_path = ANNOTATIONS_DIR / study_id / "hcd_user.json"
    if not file_path.exists():
        return {"deleted": False}
    with open(file_path, "r", encoding="utf-8") as f:
        old_data = json.load(f)
    file_path.unlink()
    _append_audit_entry(study_id, "hcd-user", "_bulk", "delete", "User",
                        {"_deleted": {"old": old_data, "new": None}})
    return {"deleted": True}


# ─── Program-level annotations ──────────────────────────────


PROGRAMS_DIR = ANNOTATIONS_DIR / "_programs"


def _validate_program_key(program_key: str) -> None:
    if "/" in program_key or "\\" in program_key or ".." in program_key:
        raise HTTPException(status_code=400, detail="Invalid program key")


def _get_program_file_path(program_key: str, schema_type: str) -> Path:
    if schema_type not in VALID_PROGRAM_SCHEMA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid program schema type: {schema_type}")
    _validate_program_key(program_key)
    return PROGRAMS_DIR / program_key / _program_slug_to_file[schema_type]


def _get_program_audit_log_path(program_key: str) -> Path:
    _validate_program_key(program_key)
    return PROGRAMS_DIR / program_key / "audit_log.json"


def _append_program_audit_entry(program_key: str, schema_type: str, entity_key: str,
                                action: str, user: str, changes: dict[str, dict]):
    log_path = _get_program_audit_log_path(program_key)
    entries: list = []
    if log_path.exists():
        with open(log_path, "r", encoding="utf-8") as f:
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


@router.get("/programs/{program_key}/annotations/{schema_type}")
async def get_program_annotations(program_key: str, schema_type: str):
    """Return all annotations for a program-level schema type."""
    file_path = _get_program_file_path(program_key, schema_type)
    if not file_path.exists():
        return {}
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.put("/programs/{program_key}/annotations/{schema_type}/{entity_key}")
async def save_program_annotation(program_key: str, schema_type: str,
                                  entity_key: str, payload: AnnotationPayload):
    """Create or update a program-level annotation."""
    file_path = _get_program_file_path(program_key, schema_type)

    data: dict = {}
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

    old_annotation = data.get(entity_key)

    incoming = payload.model_dump()
    incoming["user"] = "User"
    incoming["timestamp"] = datetime.now(timezone.utc).isoformat()

    existing = data.get(entity_key, {})
    existing.update(incoming)
    annotation = existing
    data[entity_key] = annotation

    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    changes = _compute_changes(old_annotation, annotation)
    if changes:
        action = "update" if old_annotation else "create"
        _append_program_audit_entry(program_key, schema_type, entity_key, action, "User", changes)

    return annotation


@router.delete("/programs/{program_key}/annotations/{schema_type}/{entity_key}")
async def delete_program_annotation(program_key: str, schema_type: str, entity_key: str):
    """Delete a single program-level annotation entry."""
    file_path = _get_program_file_path(program_key, schema_type)
    if not file_path.exists():
        return {"deleted": False}

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    old_annotation = data.pop(entity_key, None)
    if old_annotation is None:
        return {"deleted": False}

    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    _append_program_audit_entry(program_key, schema_type, entity_key, "delete", "User",
                                {"_deleted": {"old": old_annotation, "new": None}})
    return {"deleted": True}
