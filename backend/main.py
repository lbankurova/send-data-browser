from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routers.studies import init_studies, router as studies_router
from routers.analyses import init_analysis_studies, router as analyses_router
from routers.analysis_views import init_analysis_views, router as analysis_views_router
from routers.annotations import router as annotations_router
from routers.validation import init_validation, router as validation_router
from routers.temporal import init_temporal, router as temporal_router
from routers.import_study import router as import_router
from routers.scenarios import router as scenarios_router
from routers.study_portfolio import router as portfolio_router
from services.study_discovery import discover_studies

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: discover studies and extract metadata
    from config import SEND_DATA_DIR
    import os

    print(f"[DIAG] SEND_DATA_DIR = {SEND_DATA_DIR}")
    print(f"[DIAG] SEND_DATA_DIR exists = {SEND_DATA_DIR.exists()}")
    if SEND_DATA_DIR.exists():
        print(f"[DIAG] SEND_DATA_DIR contents = {list(SEND_DATA_DIR.iterdir())}")
        for entry in SEND_DATA_DIR.iterdir():
            if entry.is_dir():
                xpts = [f.name for f in entry.iterdir() if f.suffix.lower() == ".xpt"]
                print(f"[DIAG]   {entry.name}/: {len(xpts)} xpt files")

    generated_dir = Path(__file__).parent / "generated"
    print(f"[DIAG] generated dir = {generated_dir}")
    print(f"[DIAG] generated dir exists = {generated_dir.exists()}")
    if generated_dir.exists():
        print(f"[DIAG] generated contents = {[d.name for d in generated_dir.iterdir()]}")
        for study_dir in generated_dir.iterdir():
            if study_dir.is_dir():
                jsons = [f.name for f in study_dir.iterdir() if f.suffix == ".json"]
                print(f"[DIAG]   {study_dir.name}/: {len(jsons)} json files")

    print("Discovering studies...")
    studies = discover_studies()
    print(f"Found {len(studies)} studies: {list(studies.keys())}")
    for sid, info in studies.items():
        print(f"[DIAG] Study '{sid}': path={info.path}, xpt_count={len(info.xpt_files)}")
    init_studies(studies)
    init_analysis_studies(studies)
    init_analysis_views(studies)
    init_validation(studies)
    init_temporal(studies)
    print("Study metadata loaded.")
    yield


app = FastAPI(title="SENDEX — SEND Explorer", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(studies_router)
app.include_router(analyses_router)
app.include_router(analysis_views_router)
app.include_router(annotations_router)
app.include_router(validation_router)
app.include_router(temporal_router)
app.include_router(import_router)
app.include_router(scenarios_router)
app.include_router(portfolio_router)

@app.get("/api/debug/health")
async def debug_health():
    """Temporary diagnostic endpoint for deployment debugging."""
    from config import SEND_DATA_DIR
    generated_dir = Path(__file__).parent / "generated"
    data_contents = []
    if SEND_DATA_DIR.exists():
        for entry in SEND_DATA_DIR.iterdir():
            if entry.is_dir():
                xpts = [f.name for f in entry.iterdir() if f.suffix.lower() == ".xpt"]
                data_contents.append({"dir": entry.name, "xpt_count": len(xpts)})
    gen_contents = []
    if generated_dir.exists():
        for entry in generated_dir.iterdir():
            if entry.is_dir():
                jsons = [f.name for f in entry.iterdir() if f.suffix == ".json"]
                gen_contents.append({"dir": entry.name, "json_count": len(jsons), "files": jsons})
    from routers.studies import _studies as study_store
    return {
        "send_data_dir": str(SEND_DATA_DIR),
        "send_data_exists": SEND_DATA_DIR.exists(),
        "data_contents": data_contents,
        "generated_dir": str(generated_dir),
        "generated_exists": generated_dir.exists(),
        "generated_contents": gen_contents,
        "discovered_studies": list(study_store.keys()),
    }


# Serve built React frontend if static/ directory exists
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve index.html for SPA client-side routing."""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
