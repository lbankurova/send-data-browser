"""Intrinsic adversity dictionary — substring-based lookup for histopathology terms.

Three tiers (priority: always > likely > context_dependent):
- ``always_adverse``:    necrosis, fibrosis, carcinoma, etc. — adverse by definition
- ``likely_adverse``:    atrophy, degeneration, etc. — adverse in most contexts
- ``context_dependent``: hypertrophy, hyperplasia, etc. — may be adaptive

Loads from ``shared/adversity-dictionary.json`` (shared with frontend).
"""

from __future__ import annotations

import json
import logging

from config import SHARED_DIR

log = logging.getLogger(__name__)

_DICT_PATH = SHARED_DIR / "adversity-dictionary.json"

# Lazy-loaded singleton
_TIERS: dict[str, list[str]] | None = None
# Priority order (first match wins)
_TIER_PRIORITY = ("always_adverse", "likely_adverse", "context_dependent")


def _load() -> dict[str, list[str]]:
    global _TIERS
    if _TIERS is not None:
        return _TIERS
    try:
        with open(_DICT_PATH) as f:
            _TIERS = json.load(f)
    except Exception as e:
        log.warning("Failed to load adversity dictionary from %s: %s", _DICT_PATH, e)
        _TIERS = {"always_adverse": [], "likely_adverse": [], "context_dependent": []}
    return _TIERS


def lookup_intrinsic_adversity(finding_text: str) -> str | None:
    """Return the adversity tier for a finding term, or None if not matched.

    Uses case-insensitive substring matching. Priority: always > likely > context.
    """
    if not finding_text:
        return None
    text_lower = finding_text.lower()
    tiers = _load()
    for tier in _TIER_PRIORITY:
        for term in tiers.get(tier, []):
            if term in text_lower:
                return tier
    return None
