from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routers.studies import init_studies, router as studies_router
from routers.analyses import init_analysis_studies, router as analyses_router
from routers.analysis_views import router as analysis_views_router
from services.study_discovery import discover_studies

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: discover studies and extract metadata
    print("Discovering studies...")
    studies = discover_studies()
    print(f"Found {len(studies)} studies: {list(studies.keys())}")
    init_studies(studies)
    init_analysis_studies(studies)
    print("Study metadata loaded.")
    yield


app = FastAPI(title="SEND Data Browser", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(studies_router)
app.include_router(analyses_router)
app.include_router(analysis_views_router)

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
