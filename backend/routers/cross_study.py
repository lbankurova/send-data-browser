"""Cross-study aggregation API endpoints (Phase 1A).

Thin router -- all aggregation logic lives in
services/analysis/cross_study_aggregation.py.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from services.analysis.cross_study_aggregation import (
    load_multiple_studies,
    build_concordance_matrix,
    build_safety_margin_table,
    build_findings_matrix,
    build_recovery_summary,
    build_cross_study_dr,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/xstudy", tags=["cross-study"])


@router.get("/concordance")
async def get_concordance(
    study_ids: str = Query(..., description="Comma-separated study IDs"),
    domains: Optional[str] = Query(None, description="Comma-separated domain filter"),
):
    """Organ x Study concordance matrix with evidence strength."""
    sids = [s.strip() for s in study_ids.split(",") if s.strip()]
    if len(sids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 study IDs required")

    studies = load_multiple_studies(sids)
    if len(studies) < 2:
        return {"organs": [], "studies": [], "matrix": {},
                "note": f"Only {len(studies)} of {len(sids)} studies found in generated data"}

    domain_list = [d.strip() for d in domains.split(",") if d.strip()] if domains else None
    return build_concordance_matrix(studies, domains=domain_list)


@router.get("/safety-margins")
async def get_safety_margins(
    study_ids: str = Query(..., description="Comma-separated study IDs"),
    clinical_dose: Optional[float] = Query(None),
    clinical_auc: Optional[float] = Query(None),
):
    """NOAEL + HED + margin table per study."""
    sids = [s.strip() for s in study_ids.split(",") if s.strip()]
    if not sids:
        raise HTTPException(status_code=400, detail="At least 1 study ID required")

    studies = load_multiple_studies(sids)
    if not studies:
        return {"studies": [], "rows": [], "clinical_dose": clinical_dose, "clinical_auc": clinical_auc,
                "note": f"0 of {len(sids)} studies found in generated data"}

    return build_safety_margin_table(studies, clinical_dose=clinical_dose, clinical_auc=clinical_auc)


@router.get("/findings")
async def get_findings_matrix(
    study_ids: str = Query(..., description="Comma-separated study IDs"),
    organ_system: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
):
    """Integrated findings matrix (finding x study)."""
    sids = [s.strip() for s in study_ids.split(",") if s.strip()]
    if len(sids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 study IDs required")

    studies = load_multiple_studies(sids)
    if len(studies) < 2:
        return {"studies": [], "findings": [], "total_findings": 0, "filters": {},
                "note": f"Only {len(studies)} of {len(sids)} studies found in generated data"}

    return build_findings_matrix(studies, organ_system=organ_system, domain=domain)


@router.get("/recovery")
async def get_recovery_summary(
    study_ids: str = Query(..., description="Comma-separated study IDs"),
):
    """Recovery summary matrix."""
    sids = [s.strip() for s in study_ids.split(",") if s.strip()]
    if len(sids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 study IDs required")

    studies = load_multiple_studies(sids)
    if len(studies) < 2:
        return {"studies": [], "findings": [], "total_findings": 0,
                "note": f"Only {len(studies)} of {len(sids)} studies found in generated data"}

    return build_recovery_summary(studies)


@router.get("/dose-response/{canonical_id:path}")
async def get_cross_study_dr(
    canonical_id: str,
    study_ids: str = Query(..., description="Comma-separated study IDs"),
):
    """Cross-study dose-response for one finding."""
    sids = [s.strip() for s in study_ids.split(",") if s.strip()]
    if not sids:
        raise HTTPException(status_code=400, detail="At least 1 study ID required")

    studies = load_multiple_studies(sids)
    if not studies:
        return {"canonical_id": canonical_id, "studies": [], "n_studies_present": 0,
                "note": f"0 of {len(sids)} studies found in generated data"}

    return build_cross_study_dr(studies, canonical_id=canonical_id)
