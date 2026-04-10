import os
from pathlib import Path

SEND_DATA_DIR = Path(os.environ.get("SEND_DATA_DIR", Path(__file__).resolve().parent.parent / "send"))
SHARED_DIR = Path(os.environ.get("SHARED_DIR", Path(__file__).resolve().parent.parent / "shared"))
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Folders to skip (no .xpt files)
SKIP_FOLDERS = {
    "JSON-CBER-POC-Pilot-Study3-Gene-Therapy",
    "SENDIG3.1.1excel",
}

# Empty = serve all discovered studies; comma-separated env var to restrict (e.g. "PointCross,PDS")
ALLOWED_STUDIES: set[str] = set(filter(None, os.environ.get("ALLOWED_STUDIES", "").split(",")))

HCD_DB_PATH = Path(__file__).parent / "data" / "hcd.db"
ETL_DATA_DIR = Path(__file__).parent / "etl" / "data"

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 10000
