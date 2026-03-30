"""File-based cache for parameterized analysis results.

Cache layout:
    generated/{study_id}/                          <- default settings (from generate.py)
    generated/{study_id}/.settings_cache/{hash}/   <- non-default (computed on demand)

Default settings are never written to the cache dir — they use existing pre-gen files.
"""

import json
import logging
import os
import shutil
import threading
import time
from pathlib import Path

log = logging.getLogger(__name__)

# In-process event signaling for threads waiting on the same computation.
# Keyed by (study_id, settings_hash). Threads that lose the lock race wait
# on the event instead of polling the filesystem every 300ms.
_compute_events: dict[tuple[str, str], threading.Event] = {}
_events_lock = threading.Lock()

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


# ---------------------------------------------------------------------------
# Cross-process pipeline lock (prevents thundering herd across workers)
# ---------------------------------------------------------------------------
# Lock file per settings_hash: .settings_cache/.computing.{hash}
# Uses O_CREAT|O_EXCL for atomic creation — works across threads AND processes.
# Stale lock cleanup: if lock file age exceeds max_age, it's removed.

_LOCK_MAX_AGE = 120  # seconds — pipeline should finish well within this


def _compute_lock_path(study_id: str, settings_hash: str) -> Path:
    return GENERATED_DIR / study_id / ".settings_cache" / f".computing.{settings_hash}"


def acquire_compute_lock(study_id: str, settings_hash: str) -> bool:
    """Try to acquire exclusive compute lock via atomic file creation.

    Returns True if this caller should compute.
    Returns False if another worker/thread is already computing.
    Cleans up stale locks older than _LOCK_MAX_AGE.
    """
    lock_path = _compute_lock_path(study_id, settings_hash)
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    # Clean stale lock if present
    try:
        age = time.time() - lock_path.stat().st_mtime
        if age > _LOCK_MAX_AGE:
            log.warning("Removing stale compute lock %s (age=%.0fs)", lock_path.name, age)
            os.unlink(str(lock_path))
    except OSError:
        pass

    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        # Create an in-process event so waiting threads don't need to poll
        key = (study_id, settings_hash)
        with _events_lock:
            _compute_events[key] = threading.Event()
        return True
    except FileExistsError:
        return False


def release_compute_lock(study_id: str, settings_hash: str):
    """Release compute lock by removing the lock file and signaling waiters."""
    try:
        os.unlink(str(_compute_lock_path(study_id, settings_hash)))
    except OSError:
        pass
    # Signal any in-process threads waiting for this computation
    key = (study_id, settings_hash)
    with _events_lock:
        event = _compute_events.pop(key, None)
    if event is not None:
        event.set()


def wait_for_cache(
    study_id: str, settings_hash: str, view_name: str, timeout: float = 120
) -> dict | None:
    """Wait for cache to appear using in-process event signaling.

    Threads in the same process wait on a threading.Event (zero-poll).
    Falls back to brief polling only if the event doesn't exist (cross-process).
    Returns None on timeout (caller should raise 503).
    """
    key = (study_id, settings_hash)
    with _events_lock:
        event = _compute_events.get(key)

    if event is not None:
        # Same-process: wait on event (no polling)
        event.wait(timeout=timeout)
        cached = read_cache(study_id, settings_hash, view_name)
        if cached is not None:
            return cached
        # Event was set but cache not found — compute may have failed
        return None

    # Cross-process fallback: poll with backoff (rare in single-worker uvicorn)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        cached = read_cache(study_id, settings_hash, view_name)
        if cached is not None:
            return cached
        lock_path = _compute_lock_path(study_id, settings_hash)
        if not lock_path.exists():
            return read_cache(study_id, settings_hash, view_name)
        time.sleep(0.3)
    log.warning("Timed out waiting for compute lock %s/%s", study_id, settings_hash)
    release_compute_lock(study_id, settings_hash)
    return None
