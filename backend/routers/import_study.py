"""API router for study import and deletion."""

import logging
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile, File

from config import SEND_DATA_DIR, CACHE_DIR
from services.study_discovery import StudyInfo, _find_xpt_files
from routers.studies import register_study, unregister_study
from routers.analyses import register_analysis_study, unregister_analysis_study
from routers.validation import register_validation_study, unregister_validation_study

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

GENERATED_DIR = Path(__file__).parent.parent / "generated"
ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations"


@router.post("/import")
async def import_study(
    file: UploadFile = File(...),
    validate: bool = Query(True, description="Run SEND validation after import"),
    auto_fix: bool = Query(False, description="Attempt automatic fixes after validation"),
):
    """Import a SEND study from a .zip file containing .xpt files.

    The zip should contain .xpt files either at the root or in a single subdirectory.
    The study ID is derived from the folder name or the zip filename.
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    # Derive study_id from zip filename (without extension)
    study_id = Path(file.filename).stem

    # Target directory
    study_dir = SEND_DATA_DIR / study_id
    if study_dir.exists():
        raise HTTPException(status_code=409, detail=f"Study '{study_id}' already exists")

    # Write upload to temp file, then extract
    import tempfile
    tmp = Path(tempfile.mkdtemp())
    zip_path = tmp / file.filename
    try:
        with open(zip_path, "wb") as f:
            content = await file.read()
            f.write(content)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp / "extracted")

        # Find .xpt files: either at root of extracted or in a single subfolder
        extracted = tmp / "extracted"
        xpts = _find_xpt_files(extracted)

        if not xpts:
            # Check for a single subdirectory
            subdirs = [d for d in extracted.iterdir() if d.is_dir()]
            for subdir in subdirs:
                xpts = _find_xpt_files(subdir)
                if xpts:
                    extracted = subdir
                    break

        if not xpts:
            raise HTTPException(status_code=400, detail="No .xpt files found in the uploaded archive")

        # Move extracted xpt directory to send/
        study_dir.mkdir(parents=True, exist_ok=True)
        for xpt_name, xpt_path in xpts.items():
            shutil.copy2(str(xpt_path), str(study_dir / xpt_path.name))

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # Re-discover xpt files from the final location
    final_xpts = _find_xpt_files(study_dir)
    if not final_xpts:
        shutil.rmtree(study_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Failed to read imported files")

    # Register with all routers
    study = StudyInfo(
        study_id=study_id,
        name=study_id,
        path=study_dir,
        xpt_files=final_xpts,
    )
    register_study(study)
    register_analysis_study(study)
    register_validation_study(study, validate=validate, auto_fix=auto_fix)

    # Run generator (non-fatal)
    try:
        import subprocess
        import sys
        backend_dir = Path(__file__).parent.parent
        subprocess.Popen(
            [sys.executable, "-m", "generator.generate", study_id],
            cwd=str(backend_dir),
        )
        logger.info("Generator started for %s", study_id)
    except Exception:
        logger.warning("Generator failed to start for %s", study_id)

    return {
        "study_id": study_id,
        "domain_count": len(final_xpts),
        "domains": sorted(final_xpts.keys()),
    }


@router.delete("/studies/{study_id}")
async def delete_study(study_id: str):
    """Delete a study and all its associated data."""
    study_dir = SEND_DATA_DIR / study_id
    cache_dir = CACHE_DIR / study_id
    gen_dir = GENERATED_DIR / study_id
    ann_dir = ANNOTATIONS_DIR / study_id

    if not study_dir.exists():
        raise HTTPException(status_code=404, detail=f"Study '{study_id}' not found")

    # Unregister from all routers first
    unregister_study(study_id)
    unregister_analysis_study(study_id)
    unregister_validation_study(study_id)

    # Remove directories
    removed = []
    for d in (study_dir, cache_dir, gen_dir, ann_dir):
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
            removed.append(str(d.name))

    return {"study_id": study_id, "removed": removed}
