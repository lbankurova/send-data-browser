"""Reads analysis-settings and pattern overrides from the annotations store."""

import json
import logging
from pathlib import Path

from services.analysis.classification import determine_treatment_related

log = logging.getLogger(__name__)

ANNOTATIONS_DIR = Path(__file__).parent.parent.parent / "annotations"

# Valid pattern override values (direction-independent, closed set)
VALID_PATTERN_OVERRIDES = {"no_change", "monotonic", "threshold", "non_monotonic", "u_shaped"}


def get_last_dosing_day_override(study_id: str) -> int | None:
    """Read the last_dosing_day_override from analysis_settings.json.

    Returns the override value if set, or None if no override exists.
    """
    settings_path = ANNOTATIONS_DIR / study_id / "analysis_settings.json"
    if not settings_path.exists():
        return None
    try:
        data = json.loads(settings_path.read_text())
        # The annotation is keyed by entity_key "settings"
        settings = data.get("settings")
        if settings is None:
            return None
        val = settings.get("last_dosing_day_override")
        if val is not None:
            return int(val)
    except (json.JSONDecodeError, ValueError, TypeError):
        pass
    return None


# ---------------------------------------------------------------------------
# Pattern overrides
# ---------------------------------------------------------------------------

# Map direction-independent override labels to backend pattern strings.
# u_shaped is direction-independent by design — it captures both
# downturn-at-high-dose and inverted-U shapes.  Downstream consumers
# that switch on pattern must handle u_shaped without assuming a single
# direction.  The finding's original direction field is preserved unchanged;
# it reflects the algorithmic assessment, not the override.
_OVERRIDE_MAP: dict[str, str | dict[str, str]] = {
    "no_change": "flat",
    "monotonic": {"up": "monotonic_increase", "down": "monotonic_decrease"},
    "threshold": {"up": "threshold_increase", "down": "threshold_decrease"},
    "non_monotonic": "non_monotonic",
    "u_shaped": "u_shaped",
}


def _resolve_override(override_pattern: str, direction: str) -> str:
    """Map direction-independent override label to backend pattern string."""
    mapped = _OVERRIDE_MAP.get(override_pattern, override_pattern)
    if isinstance(mapped, dict):
        return mapped.get(direction, mapped.get("down", override_pattern))
    return mapped


def load_all_pattern_overrides(study_id: str) -> dict[str, dict]:
    """Bulk-load all pattern overrides for a study.

    Returns {finding_id: override_dict} or empty dict if no file.
    """
    path = ANNOTATIONS_DIR / study_id / "pattern_overrides.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
        return {k: v for k, v in data.items()
                if isinstance(v, dict) and v.get("pattern") in VALID_PATTERN_OVERRIDES}
    except (json.JSONDecodeError, TypeError):
        log.warning("Failed to read pattern overrides for %s", study_id)
        return {}


def apply_pattern_overrides(findings: list[dict], study_id: str) -> list[dict]:
    """Apply user pattern overrides to fully-enriched findings.

    Replaces the pattern and re-derives ALL downstream fields:
      - treatment_related (reads dose_response_pattern)
      - finding_class (ECETOC A-1 factor reads pattern)
      - _confidence (reads finding_class)

    Safe to call on already-served data — re-runs the full derivation
    chain only for findings that have an override.
    """
    overrides = load_all_pattern_overrides(study_id)
    if not overrides:
        return findings
    applied = 0
    for f in findings:
        ov = overrides.get(f.get("id", ""))
        if not ov:
            continue
        override_pattern = ov["pattern"]
        direction = f.get("direction", "down") or "down"
        f["_pattern_override"] = {
            "pattern": override_pattern,
            "original_pattern": f.get("dose_response_pattern"),
            "original_direction": f.get("direction"),
            "timestamp": ov.get("timestamp", ov.get("reviewDate")),
        }
        f["dose_response_pattern"] = _resolve_override(override_pattern, direction)
        # Re-derive treatment-relatedness with the overridden pattern
        f["treatment_related"] = determine_treatment_related(f)
        # Re-derive ECETOC finding_class (A-1 factor reads pattern)
        from services.analysis.classification import assess_finding
        f["finding_class"] = assess_finding(f)
        applied += 1
    if applied:
        log.info("Applied %d pattern override(s) for %s", applied, study_id)
    return findings
