from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, ORJSONResponse

from routers.studies import init_studies, router as studies_router
from routers.analyses import init_analysis_studies, router as analyses_router
from routers.analysis_views import init_analysis_views, router as analysis_views_router
from routers.annotations import router as annotations_router
from routers.validation import init_validation, router as validation_router
from routers.temporal import init_temporal, router as temporal_router
from routers.import_study import router as import_router

from routers.study_portfolio import router as portfolio_router
from routers.compound_profile import init_compound_profile, router as compound_profile_router
from routers.cross_study import router as cross_study_router
from services.study_discovery import discover_studies

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: discover studies and extract metadata
    from config import SEND_DATA_DIR

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

    # Verify shared data files exist (fail fast — don't wait for first request)
    from config import SHARED_DIR
    _required_shared = [
        "syndrome-definitions.json",
        "progression-chains.yaml",
        "organ-weight-thresholds.json",
        "hcd-reference-ranges.json",
        "adversity-dictionary.json",
    ]
    print(f"[DIAG] SHARED_DIR = {SHARED_DIR}")
    print(f"[DIAG] SHARED_DIR exists = {SHARED_DIR.exists()}")
    missing = [f for f in _required_shared if not (SHARED_DIR / f).exists()]
    if missing:
        print(f"[FATAL] Missing shared files in {SHARED_DIR}: {missing}")
        raise SystemExit(1)
    print(f"[DIAG] All {len(_required_shared)} shared files verified")

    # Eagerly import the analysis pipeline to surface import errors at startup
    try:
        from services.analysis.parameterized_pipeline import ParameterizedAnalysisPipeline  # noqa: F401
        print("[DIAG] Analysis pipeline imported successfully")
    except Exception as e:
        print(f"[FATAL] Analysis pipeline import failed: {e}")
        raise

    print("Discovering studies...")
    studies = discover_studies()
    print(f"Found {len(studies)} studies: {list(studies.keys())}")
    for sid, info in studies.items():
        print(f"[DIAG] Study '{sid}': path={info.path}, xpt_count={len(info.xpt_files)}")
        if info.empty_xpt_files:
            domains = ", ".join(d.upper() for d in sorted(info.empty_xpt_files))
            print(f"[WARN] Study '{sid}': 0-byte XPT files excluded: {domains}")

    # Auto-generate analysis data if missing for any discovered study
    for sid in list(studies.keys()):
        check_path = generated_dir / sid / "unified_findings.json"
        if not check_path.exists():
            print(f"[STARTUP] Generated data missing for '{sid}' — running generator...")
            try:
                from generator.generate import generate
                generate(sid)
                print(f"[STARTUP] Generator complete for '{sid}'")
            except Exception as e:
                print(f"[STARTUP] Generator failed for '{sid}': {e}")
        else:
            print(f"[DIAG] Generated data present for '{sid}'")

    init_studies(studies)
    init_analysis_studies(studies)
    init_analysis_views(studies)
    init_validation(studies)
    init_temporal(studies)
    init_compound_profile(studies)

    # Auto-register discovered studies into the portfolio system
    from services.study_metadata_service import get_study_metadata_service
    portfolio = get_study_metadata_service()
    portfolio.register_discovered_studies(studies)
    print(f"Portfolio: {len(portfolio.get_all_studies())} studies, "
          f"{len(portfolio.get_all_projects())} projects")

    print("Study metadata loaded.")
    yield


app = FastAPI(
    title="SENDEX — SEND Explorer",
    version="0.1.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
)


@app.middleware("http")
async def log_request_timing(request, call_next):
    import time
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    path = request.url.path
    if path.startswith("/api/"):
        size = response.headers.get("content-length", "?")
        enc = response.headers.get("content-encoding", "none")
        print(f"[PERF] {request.method} {path} -> {response.status_code} {elapsed*1000:.0f}ms size={size} enc={enc}")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(studies_router)
app.include_router(analyses_router)
app.include_router(analysis_views_router)
app.include_router(annotations_router)
app.include_router(validation_router)
app.include_router(temporal_router)
app.include_router(import_router)
app.include_router(portfolio_router)
app.include_router(compound_profile_router)
app.include_router(cross_study_router)

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
        """Catch-all: serve index.html for SPA client-side routing.

        API paths are excluded — unmatched /api/* must return 404 JSON,
        not index.html (which the frontend would fail to parse as JSON).
        """
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
