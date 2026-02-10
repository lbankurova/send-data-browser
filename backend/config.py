from pathlib import Path

SEND_DATA_DIR = Path(__file__).resolve().parent.parent / "send"
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Folders to skip (no .xpt files)
SKIP_FOLDERS = {
    "JSON-CBER-POC-Pilot-Study3-Gene-Therapy",
    "SENDIG3.1.1excel",
}

# Empty = serve all discovered studies; populate to restrict (e.g. {"PointCross"})
ALLOWED_STUDIES: set[str] = set()

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500
