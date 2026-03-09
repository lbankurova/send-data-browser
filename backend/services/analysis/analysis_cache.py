"""File-based cache for parameterized analysis results.

Cache layout:
    generated/{study_id}/                          <- default settings (from generate.py)
    generated/{study_id}/.settings_cache/{hash}/   <- non-default (computed on demand)

Default settings are never written to the cache dir — they use existing pre-gen files.
"""

import json
import logging
import shutil
from pathlib import Path

log = logging.getLogger(__name__)

GENERATED_DIR = Path(__file__).parent.parent.parent / "generated"


def _cache_dir(study_id: str, settings_hash: str) -> Path:
    return GENERATED_DIR / study_id / ".settings_cache" / settings_hash


def read_cache(study_id: str, settings_hash: str, view_name: str) -> dict | None:
    """Read a single view JSON from the cache dir. Returns None on miss."""
    file_name = view_name.replace("-", "_") + ".json"
    path = _cache_dir(study_id, settings_hash) / file_name
    if not path.exists():
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        log.warning("Corrupt cache file %s, treating as miss", path)
        return None


def write_cache(study_id: str, settings_hash: str, all_views: dict[str, list | dict]):
    """Write all view JSONs atomically (write to tmp, then rename).

    Args:
        all_views: Dict mapping view_name (underscore form) to JSON-serializable data.
    """
    cache = _cache_dir(study_id, settings_hash)
    tmp = cache.with_name(cache.name + ".tmp")
    tmp.mkdir(parents=True, exist_ok=True)
    try:
        for view_name, data in all_views.items():
            file_name = view_name + ".json"
            with open(tmp / file_name, "w") as f:
                json.dump(data, f)
        # Atomic swap: remove existing cache dir if present, rename tmp
        if cache.exists():
            shutil.rmtree(cache)
        tmp.rename(cache)
    except Exception:
        # Clean up tmp on failure
        if tmp.exists():
            shutil.rmtree(tmp)
        raise


def invalidate_study(study_id: str):
    """Delete the entire .settings_cache/ dir for a study (called on regenerate)."""
    cache_root = GENERATED_DIR / study_id / ".settings_cache"
    if cache_root.exists():
        shutil.rmtree(cache_root)
