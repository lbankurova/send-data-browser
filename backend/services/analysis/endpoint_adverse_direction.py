"""Endpoint-class adverse-direction registry for NOAEL gate C7 (F1e).

Loads ``shared/rules/endpoint-adverse-direction.json`` and
``shared/rules/compound-class-flags.json`` as lazy singletons. Provides
helpers used by ``view_dataframes.py::_is_loael_driving_woe`` to evaluate
C7 (bidirectional adverse-direction with corroboration triggers) per
RG-NOAEL-ALG-13 / NOAEL-ALG-synthesis F1d-F1e.

Schema reference:
- endpoint-adverse-direction.json:
    endpoint_classes[<class>] = {
      endpoint_label_patterns: list[str],     # case-insensitive substring match
      send_domain: str,
      primary_adverse_direction: "up" | "down" | "per-analyte",
      bidirectional_corroboration: {
        non_primary_direction: "up" | "down" | None,
        triggers: list[{trigger: str, rationale: str}],
      },
    }

- compound-class-flags.json:
    classes[<class>] = {
      name, exemplars, adverse_signal_classes: [
        {endpoint_class, non_canonical_direction, rationale, citations},
      ],
    }

Both files are pure-data registries; no algorithm behavior changes when the
loader is imported. C7 application sits in ``_is_loael_driving_woe``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config import SHARED_DIR

log = logging.getLogger(__name__)

_DIRECTION_PATH = SHARED_DIR / "rules" / "endpoint-adverse-direction.json"
_COMPOUND_PATH = SHARED_DIR / "rules" / "compound-class-flags.json"

_DIRECTION_REGISTRY: dict[str, Any] | None = None
_COMPOUND_REGISTRY: dict[str, Any] | None = None


def _load_direction_registry() -> dict[str, Any]:
    global _DIRECTION_REGISTRY
    if _DIRECTION_REGISTRY is not None:
        return _DIRECTION_REGISTRY
    try:
        with open(_DIRECTION_PATH) as f:
            _DIRECTION_REGISTRY = json.load(f).get("endpoint_classes", {})
    except Exception as e:
        log.warning("Failed to load endpoint-adverse-direction registry from %s: %s", _DIRECTION_PATH, e)
        _DIRECTION_REGISTRY = {}
    return _DIRECTION_REGISTRY


def _load_compound_registry() -> dict[str, Any]:
    global _COMPOUND_REGISTRY
    if _COMPOUND_REGISTRY is not None:
        return _COMPOUND_REGISTRY
    try:
        with open(_COMPOUND_PATH) as f:
            _COMPOUND_REGISTRY = json.load(f).get("classes", {})
    except Exception as e:
        log.warning("Failed to load compound-class-flags registry from %s: %s", _COMPOUND_PATH, e)
        _COMPOUND_REGISTRY = {}
    return _COMPOUND_REGISTRY


def lookup_endpoint_class(endpoint_label: str | None, send_domain: str | None = None) -> str | None:
    """Resolve endpoint_label (and optional SEND domain) to a registry class name.

    Uses (a) SEND domain exact match where available, falling back to
    (b) case-insensitive endpoint_label substring patterns. Returns the class
    key (e.g., "BW", "FW", "OM") or ``None`` when no class matches.
    """
    registry = _load_direction_registry()
    label_lower = (endpoint_label or "").lower().strip()
    if send_domain:
        for class_name, entry in registry.items():
            if entry.get("send_domain") == send_domain and class_name != "LB_per_analyte":
                return class_name
    if not label_lower:
        return None
    for class_name, entry in registry.items():
        for pattern in entry.get("endpoint_label_patterns", []):
            if pattern.lower() in label_lower:
                return class_name
    return None


def primary_adverse_direction(endpoint_class: str | None) -> str | None:
    """Return ``"up"``, ``"down"``, ``"per-analyte"``, or ``None`` for the class."""
    if not endpoint_class:
        return None
    entry = _load_direction_registry().get(endpoint_class)
    if not entry:
        return None
    return entry.get("primary_adverse_direction")


def corroboration_triggers(endpoint_class: str | None) -> list[dict[str, str]]:
    """Return the list of bidirectional corroboration triggers for a class.

    Empty list when the class has no bidirectional corroboration (e.g., CL
    incidence, DS incidence) or the class is unknown.
    """
    if not endpoint_class:
        return []
    entry = _load_direction_registry().get(endpoint_class)
    if not entry:
        return []
    bidi = entry.get("bidirectional_corroboration") or {}
    return list(bidi.get("triggers") or [])


def compound_class_adverse_signals(class_key: str) -> list[dict[str, Any]]:
    """Return the adverse-signal entries for a compound class (e.g., 'ppar_gamma_agonist')."""
    entry = _load_compound_registry().get(class_key) or {}
    return list(entry.get("adverse_signal_classes") or [])


def list_compound_classes() -> list[str]:
    """List registered compound-class keys (used by triggers like 'compound_class:<key>')."""
    return list(_load_compound_registry().keys())


def compound_class_exemplars(class_key: str) -> list[str]:
    """Return registered exemplars (compound names) for a compound class.

    Used by ``services.analysis.compound_class.resolve_pharmacologic_class``
    to match study TS-metadata treatment names against known class members.
    Returns ``[]`` for unknown class keys.
    """
    entry = _load_compound_registry().get(class_key) or {}
    return list(entry.get("exemplars") or [])


def is_direction_canonical_adverse(endpoint_class: str | None, observed_direction: str | None) -> bool:
    """True when ``observed_direction`` matches the class's primary adverse direction.

    Returns False for unknown class, unknown direction, ``per-analyte`` class
    (LB_per_analyte defers to per-analyte registry), or mismatched direction.
    The caller decides whether to fall back to corroboration trigger evaluation
    when this returns False.
    """
    primary = primary_adverse_direction(endpoint_class)
    if primary in (None, "per-analyte"):
        return False
    if observed_direction not in ("up", "down"):
        return False
    return primary == observed_direction


def direction_exceptions(endpoint_class: str | None) -> list[dict[str, Any]]:
    """Return the ``direction_exceptions`` clause for an endpoint class.

    Each exception is a dict with ``name``, ``primary_direction_suppressed``,
    ``all_of`` (list of predicate keys), ``reclassify_to``, ``rationale``, and
    ``citations``. Empty list when the class has no exceptions or is unknown.
    Predicate evaluation is the caller's responsibility (see
    ``view_dataframes._is_loael_driving_woe`` at C7 application — DATA-GAP-
    NOAEL-ALG-02 follow-up). The registry only declares the exception cases.
    """
    if not endpoint_class:
        return []
    entry = _load_direction_registry().get(endpoint_class)
    if not entry:
        return []
    exc = entry.get("direction_exceptions") or {}
    return list(exc.get("exceptions") or [])
