"""Reads analysis-settings overrides from the annotations store."""

import json
from pathlib import Path

ANNOTATIONS_DIR = Path(__file__).parent.parent.parent / "annotations"


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
