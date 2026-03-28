from pathlib import Path
from config import ALLOWED_STUDIES, SEND_DATA_DIR, SKIP_FOLDERS


class StudyInfo:
    def __init__(self, study_id: str, name: str, path: Path,
                 xpt_files: dict[str, Path],
                 empty_xpt_files: dict[str, Path] | None = None):
        self.study_id = study_id
        self.name = name
        self.path = path
        self.xpt_files = xpt_files  # domain_name (lowercase, no ext) -> Path
        self.empty_xpt_files = empty_xpt_files or {}  # 0-byte XPTs excluded from xpt_files


def discover_studies() -> dict[str, StudyInfo]:
    """Scan the SEND data directory and return a dict of study_id -> StudyInfo."""
    studies: dict[str, StudyInfo] = {}

    for entry in sorted(SEND_DATA_DIR.iterdir()):
        if not entry.is_dir() or entry.name in SKIP_FOLDERS:
            continue

        # Check if this folder itself has .xpt files
        root_xpts, empty = _find_xpt_files(entry)

        if root_xpts or empty:
            study_id = entry.name
            studies[study_id] = StudyInfo(
                study_id=study_id,
                name=entry.name,
                path=entry,
                xpt_files=root_xpts,
                empty_xpt_files=empty,
            )
        else:
            # Check for sub-studies (e.g., TOXSCI multi-study container)
            _discover_nested_studies(entry, entry.name, studies)

    # Filter to allowed studies if configured
    if ALLOWED_STUDIES:
        studies = {k: v for k, v in studies.items() if k in ALLOWED_STUDIES}

    return studies


def _find_xpt_files(folder: Path) -> tuple[dict[str, Path], dict[str, Path]]:
    """Find .xpt files directly in a folder (not recursive).

    Returns (xpt_files, empty_xpt_files).
    0-byte files are separated into empty_xpt_files — they crash pyreadstat
    and are reported as validation warnings.
    """
    xpt_files = {}
    empty = {}
    for f in folder.iterdir():
        if f.is_file() and f.suffix.lower() == ".xpt":
            domain_name = f.stem.lower()
            if f.stat().st_size > 0:
                xpt_files[domain_name] = f
            else:
                empty[domain_name] = f
    return xpt_files, empty


def _discover_nested_studies(folder: Path, parent_prefix: str, studies: dict[str, StudyInfo]):
    """Recursively discover studies in nested folders."""
    for entry in sorted(folder.iterdir()):
        if not entry.is_dir():
            continue

        xpts, empty = _find_xpt_files(entry)
        if xpts or empty:
            study_id = f"{parent_prefix}--{entry.name}"
            studies[study_id] = StudyInfo(
                study_id=study_id,
                name=entry.name,
                path=entry,
                xpt_files=xpts,
                empty_xpt_files=empty,
            )
        else:
            # Go deeper
            _discover_nested_studies(entry, f"{parent_prefix}--{entry.name}", studies)
