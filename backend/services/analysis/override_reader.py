"""Reads analysis-settings, pattern overrides, tox overrides, and NOAEL
overrides from the annotations store.
"""

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


def _pattern_to_override_key(pattern: str | None) -> str | None:
    """Map backend pattern string to direction-independent override key.

    Mirrors frontend patternToOverrideKey() — must stay in sync.
    """
    if not pattern:
        return None
    if pattern == "flat":
        return "no_change"
    if pattern.startswith("monotonic"):
        return "monotonic"
    if pattern.startswith("threshold"):
        return "threshold"
    if pattern == "non_monotonic":
        return "non_monotonic"
    if pattern == "u_shaped":
        return "u_shaped"
    return None


def _remove_stale_overrides(study_id: str, keys: list[str]) -> None:
    """Remove no-op override entries from the annotation file.

    Called when apply_pattern_overrides detects overrides whose pattern
    matches the finding's original pattern (i.e., they do nothing).
    """
    path = ANNOTATIONS_DIR / study_id / "pattern_overrides.json"
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
        removed = 0
        for k in keys:
            if k in data:
                del data[k]
                removed += 1
        if removed:
            path.write_text(json.dumps(data, indent=2))
            log.info("Auto-cleaned %d stale no-op override(s) for %s", removed, study_id)
    except (json.JSONDecodeError, OSError):
        log.warning("Failed to clean stale overrides for %s", study_id)


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
      - onset_dose_level (from onset_dose override or cleared for no_change)
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
    stale_keys: list[str] = []
    for f in findings:
        fid = f.get("id", "")
        ov = overrides.get(fid)
        if not ov:
            continue
        override_pattern = ov["pattern"]
        # Detect no-op overrides: override key matches original pattern key
        # AND no meaningful onset_dose_level change (onset-only overrides are valid)
        original_key = _pattern_to_override_key(f.get("dose_response_pattern"))
        if override_pattern == original_key and ov.get("onset_dose_level") is None:
            stale_keys.append(fid)
            continue
        direction = f.get("direction", "down") or "down"
        f["_pattern_override"] = {
            "pattern": override_pattern,
            "original_pattern": f.get("dose_response_pattern"),
            "original_direction": f.get("direction"),
            "onset_dose_level": ov.get("onset_dose_level"),
            "original_onset_dose_level": f.get("onset_dose_level"),
            "timestamp": ov.get("timestamp", ov.get("reviewDate")),
            "pathologist": ov.get("pathologist"),
        }
        f["dose_response_pattern"] = _resolve_override(override_pattern, direction)
        # Apply onset dose override
        if override_pattern == "no_change":
            # No change → clear onset dose
            f["onset_dose_level"] = None
        elif ov.get("onset_dose_level") is not None:
            f["onset_dose_level"] = ov["onset_dose_level"]
        # Re-derive treatment-relatedness with the overridden pattern
        f["treatment_related"] = determine_treatment_related(f)
        # Re-derive ECETOC finding_class (A-1 factor reads pattern)
        from services.analysis.classification import assess_finding
        f["finding_class"] = assess_finding(f)
        applied += 1
    # Auto-clean stale no-op overrides from the annotation file
    if stale_keys:
        _remove_stale_overrides(study_id, stale_keys)
    if applied:
        log.info("Applied %d pattern override(s) for %s", applied, study_id)
        # Re-derive confidence for ALL findings — D2 reads dose_response_pattern,
        # D5 reads cross-sex sibling's finding_class. Both may have changed.
        from services.analysis.confidence import compute_all_confidence
        compute_all_confidence(findings)
    return findings


# ---------------------------------------------------------------------------
# Tox assessment overrides (Level 3 — highest finding-level authority)
# ---------------------------------------------------------------------------

def load_tox_overrides(study_id: str) -> dict[str, dict]:
    """Load tox-findings annotations.

    Returns {endpoint_label: override_dict}.
    Filters out entries where treatmentRelated == "Not Evaluated" (no override).
    """
    path = ANNOTATIONS_DIR / study_id / "tox_findings.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
        return {
            k: v for k, v in data.items()
            if isinstance(v, dict) and v.get("treatmentRelated") != "Not Evaluated"
        }
    except (json.JSONDecodeError, TypeError):
        log.warning("Failed to read tox overrides for %s", study_id)
        return {}


def apply_tox_overrides(findings: list[dict], study_id: str) -> list[dict]:
    """Apply tox assessment overrides (Level 3). Highest finding-level precedence.

    Sets treatment_related and/or finding_class directly from expert
    determination. Adds has_tox_override=True metadata flag.

    Matching: endpoint_label lookup (applies to both sexes).
    """
    overrides = load_tox_overrides(study_id)
    if not overrides:
        return findings

    applied = 0
    for f in findings:
        key = f.get("endpoint_label") or f.get("finding")
        if not key:
            continue
        ov = overrides.get(key)
        if not ov:
            continue

        tr_val = ov.get("treatmentRelated")
        adv_val = ov.get("adversity")

        # Coherence check: TR="No" + adversity="Adverse" is contradictory
        if tr_val in ("No", "Equivocal") and adv_val == "Adverse":
            log.warning(
                "Contradictory tox override for %s: TR=%s but adversity=%s "
                "-- TR wins, setting not_treatment_related",
                key, tr_val, adv_val,
            )

        # TR override — always set finding_class when TR is No/Equivocal,
        # regardless of adversity value (TR wins over contradictory adversity)
        if tr_val == "No":
            f["treatment_related"] = False
            f["finding_class"] = "not_treatment_related"
        elif tr_val == "Equivocal":
            f["treatment_related"] = False
            f["finding_class"] = "equivocal"
        elif tr_val == "Yes":
            f["treatment_related"] = True

        # Adversity override (only meaningful when TR is true)
        if f.get("treatment_related"):
            if adv_val == "Adverse":
                f["finding_class"] = "tr_adverse"
            elif adv_val == "Non-Adverse/Adaptive":
                f["finding_class"] = "tr_non_adverse"

        f["has_tox_override"] = True
        applied += 1

    if applied:
        log.info("Applied %d tox override(s) for %s", applied, study_id)
    return findings


# ---------------------------------------------------------------------------
# NOAEL overrides (Level 4 — independent axis, authoritative)
# ---------------------------------------------------------------------------

def load_noael_overrides(study_id: str) -> dict[str, dict]:
    """Load noael-overrides annotations.

    Returns {noael:sex: override_dict} (e.g. {"noael:Combined": {...}}).
    """
    path = ANNOTATIONS_DIR / study_id / "noael_overrides.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
        return {k: v for k, v in data.items() if isinstance(v, dict)}
    except (json.JSONDecodeError, TypeError):
        log.warning("Failed to read NOAEL overrides for %s", study_id)
        return {}


def apply_noael_overrides(noael_rows: list[dict], study_id: str) -> list[dict]:
    """Apply NOAEL expert overrides to NOAEL summary rows.

    Replaces noael_dose_level/value when an override exists for that sex.
    Preserves system values in _system_* fields for provenance display.
    """
    overrides = load_noael_overrides(study_id)
    if not overrides:
        return noael_rows

    applied = 0
    for row in noael_rows:
        sex = row.get("sex", "")
        ov = overrides.get(f"noael:{sex}")
        if not ov:
            continue

        override_type = ov.get("override_type")
        if not override_type or override_type == "agree":
            # "agree" = expert confirms algorithm, no change needed
            continue

        # Preserve system values before overwriting
        row["_overridden"] = True
        row["_system_dose_level"] = row.get("noael_dose_level")
        row["_system_dose_value"] = row.get("noael_dose_value")
        row["_override_rationale"] = ov.get("rationale", "")

        if override_type == "not_established":
            row["noael_dose_level"] = None
            row["noael_dose_value"] = None
            row["noael_label"] = "Not established (expert)"
        else:
            # "higher" or "lower" — use the expert's dose
            override_level = ov.get("override_dose_level")
            override_value = ov.get("override_dose_value")
            if override_level is not None:
                row["noael_dose_level"] = override_level
            if override_value is not None:
                row["noael_dose_value"] = override_value
                # Update label to reflect override
                unit = row.get("noael_dose_unit", "")
                row["noael_label"] = f"{override_value} {unit}".strip()

        applied += 1

    if applied:
        log.info("Applied %d NOAEL override(s) for %s", applied, study_id)
    return noael_rows
