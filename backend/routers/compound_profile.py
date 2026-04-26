"""API endpoint for compound-class inference and expected-effect profiles.

Phase 1 of Expected Pharmacological Effect Classification.
GET /api/studies/{study_id}/compound-profile
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from services.study_discovery import StudyInfo
from services.analysis.subject_context import get_ts_metadata
from services.analysis.compound_class import (
    infer_compound_class,
    get_profile,
    list_profiles,
)

log = logging.getLogger(__name__)

ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"

router = APIRouter(prefix="/api", tags=["compound-profile"])

# Reference to studies (set at startup)
_studies: dict[str, StudyInfo] = {}


def init_compound_profile(studies: dict[str, StudyInfo]):
    """Initialize with discovered studies (called from main.py lifespan)."""
    _studies.clear()
    _studies.update(studies)


def _resolve_study(study_id: str) -> StudyInfo:
    if study_id not in _studies:
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")
    return _studies[study_id]


def _load_sme_annotation(study_id: str) -> dict | None:
    """Load SME-confirmed compound profile from annotations store."""
    ann_path = ANNOTATIONS_DIR / study_id / "compound_profile.json"
    if not ann_path.exists():
        return None
    try:
        with open(ann_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # The annotation store is keyed by entity_key; compound profile uses "study"
        return data.get("study")
    except Exception as e:
        log.warning("Failed to read compound profile annotation for %s: %s", study_id, e)
        return None


@router.get("/studies/{study_id}/compound-profile")
async def get_compound_profile(study_id: str):
    """Return compound-class inference and matching expected-effect profile.

    Response:
    {
        "study_id": str,
        "inference": {
            "compound_class": str,
            "confidence": str,
            "inference_method": str,
            "suggested_profiles": [str],
        },
        "sme_confirmed": null | {
            "compound_class": str,
            "confirmed_by_sme": true,
            "expected_findings": {...},
            ...
        },
        "active_profile": null | {full profile JSON},
        "available_profiles": [{profile_id, display_name, modality, finding_count}],
    }
    """
    study = _resolve_study(study_id)

    # Read TS metadata directly (lightweight — doesn't need full subject context)
    ts_meta = get_ts_metadata(study)

    # Get available domains from study
    available_domains = set(study.xpt_files.keys())

    # Get species from TS metadata or DM
    species = ts_meta.get("species")

    # Run inference
    inference = infer_compound_class(ts_meta, available_domains, species)

    # Check for SME-confirmed annotation override
    sme_confirmed = _load_sme_annotation(study_id)

    # Determine the active profile: SME override takes priority
    active_profile_id = None
    if sme_confirmed and sme_confirmed.get("compound_class"):
        active_profile_id = sme_confirmed["compound_class"]
    elif len(inference.get("suggested_profiles", [])) == 1:
        # Auto-assign only when inference is unambiguous (single suggestion)
        active_profile_id = inference["suggested_profiles"][0]
    # When multiple profiles are suggested (e.g., adjuvanted vs non-adjuvanted),
    # leave active_profile null — user must select.

    active_profile = get_profile(active_profile_id) if active_profile_id else None

    # Cross-reactivity from SME annotation (null if not set)
    cross_reactivity = None
    if sme_confirmed:
        cross_reactivity = sme_confirmed.get("cross_reactivity")

    return {
        "study_id": study_id,
        "inference": inference,
        "sme_confirmed": sme_confirmed,
        "active_profile": active_profile,
        "available_profiles": list_profiles(),
        "cross_reactivity": cross_reactivity,
    }


@router.get("/expected-effect-profiles")
async def get_expected_effect_profiles():
    """Return summary metadata for all available expected-effect profiles."""
    return list_profiles()


@router.get("/expected-effect-profiles/{profile_id}")
async def get_expected_effect_profile(profile_id: str):
    """Return a single expected-effect profile by ID."""
    profile = get_profile(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found")
    return profile
