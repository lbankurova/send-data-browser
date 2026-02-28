"""Shared syndrome definitions — loaded from ``shared/syndrome-definitions.json``.

The JSON file is the single source of truth for both this Python module and
the TypeScript frontend (``cross-domain-syndrome-data.ts``). All edits go to
the JSON first; consumers import derived views from here.
"""

import json
from pathlib import Path

_DEFS_PATH = Path(__file__).resolve().parents[3] / "shared" / "syndrome-definitions.json"
_raw = json.loads(_DEFS_PATH.read_text(encoding="utf-8"))

SYNDROME_DEFINITIONS: list[dict] = _raw["syndromes"]
DIRECTIONAL_GATES: dict[str, list[dict]] = _raw["directionalGates"]
ENDPOINT_CLASS_FLOORS: list[dict] = _raw["endpointClassFloors"]


def get_syndrome(syndrome_id: str) -> dict | None:
    """Return syndrome definition by ID, or None if not found."""
    return next((s for s in SYNDROME_DEFINITIONS if s["id"] == syndrome_id), None)
