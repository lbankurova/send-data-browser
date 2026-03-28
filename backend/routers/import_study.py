"""API router for study import and deletion."""

import logging
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

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


def _register_and_generate(study_id: str, study_dir: Path,
                           validate: bool, auto_fix: bool) -> dict:
    """Register a study with all routers and kick off the generator."""
    final_xpts, _ = _find_xpt_files(study_dir)
    if not final_xpts:
        shutil.rmtree(study_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="Failed to read imported files")

    study = StudyInfo(
        study_id=study_id,
        name=study_id,
        path=study_dir,
        xpt_files=final_xpts,
    )
    register_study(study)
    register_analysis_study(study)
    register_validation_study(study, validate=validate, auto_fix=auto_fix)

    try:
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


@router.post("/import")
async def import_study(
    files: list[UploadFile] = File(...),
    study_id: Optional[str] = Query(None, description="Custom study identifier (required for .xpt uploads, optional for .zip)"),
    validate: bool = Query(True, description="Run SEND validation after import"),
    auto_fix: bool = Query(False, description="Attempt automatic fixes after validation"),
):
    """Import a SEND study from a .zip archive or raw .xpt files.

    - **Single .zip:** extracts and discovers .xpt files inside.
    - **One or more .xpt files:** imported directly as a study.

    ``study_id`` overrides the default (zip filename stem). Required when
    uploading raw .xpt files.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    filenames = [f.filename or "" for f in files]
    extensions = {Path(fn).suffix.lower() for fn in filenames}

    is_zip = len(files) == 1 and extensions == {".zip"}
    is_xpt = extensions <= {".xpt"} and len(extensions) == 1

    if not is_zip and not is_xpt:
        raise HTTPException(
            status_code=400,
            detail="Upload either a single .zip or one or more .xpt files",
        )

    # Resolve study_id
    if is_zip:
        sid = study_id or Path(filenames[0]).stem
    else:
        if not study_id:
            raise HTTPException(
                status_code=400,
                detail="study_id is required when uploading .xpt files",
            )
        sid = study_id

    study_dir = SEND_DATA_DIR / sid
    if study_dir.exists():
        raise HTTPException(status_code=409, detail=f"Study '{sid}' already exists")

    if is_zip:
        # --- Zip import (original flow) ---
        tmp = Path(tempfile.mkdtemp())
        zip_path = tmp / filenames[0]
        try:
            with open(zip_path, "wb") as f:
                f.write(await files[0].read())

            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp / "extracted")

            extracted = tmp / "extracted"
            xpts, _ = _find_xpt_files(extracted)

            if not xpts:
                for subdir in (d for d in extracted.iterdir() if d.is_dir()):
                    xpts, _ = _find_xpt_files(subdir)
                    if xpts:
                        extracted = subdir
                        break

            if not xpts:
                raise HTTPException(
                    status_code=400,
                    detail="No .xpt files found in the uploaded archive",
                )

            study_dir.mkdir(parents=True, exist_ok=True)
            for xpt_name, xpt_path in xpts.items():
                shutil.copy2(str(xpt_path), str(study_dir / xpt_path.name))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    else:
        # --- Raw .xpt import ---
        study_dir.mkdir(parents=True, exist_ok=True)
        try:
            for upload in files:
                dest = study_dir / (upload.filename or "unknown.xpt")
                with open(dest, "wb") as f:
                    f.write(await upload.read())
        except Exception:
            shutil.rmtree(study_dir, ignore_errors=True)
            raise

    return _register_and_generate(sid, study_dir, validate, auto_fix)


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
