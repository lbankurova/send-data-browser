import os
from pathlib import Path

SEND_DATA_DIR = Path(os.environ.get("SEND_DATA_DIR", r"C:\pg\pcc\send"))
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Folders to skip (no .xpt files)
SKIP_FOLDERS = {
    "JSON-CBER-POC-Pilot-Study3-Gene-Therapy",
    "SENDIG3.1.1excel",
}

# Prototype: only include this study (most complete SEND dataset — 28 domains)
ALLOWED_STUDIES = {"PointCross"}

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500
