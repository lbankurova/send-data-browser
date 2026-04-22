"""F11 — NHP colony-origin discovery pattern.

Scans TS / SUPPDM / TSVAL for sponsor-extensible origin codes, emits an
uncertainty-first payload {origin_captured, origin_value, origin_match,
detection_source, origin_detection_conflict}. Source precedence is
TSPARMCD > SUPPDM > TSVAL free-text.

Never blocks or gates analysis — AC-F11-5. When no pattern matches, the
module returns ``origin_captured=false`` and leaves downstream HCD
comparison with a neutral banner.

Sponsor extension: add new TSPARMCD / SUPPDM QNAM codes or country tokens
to ``shared/config/origin-detection-patterns.json`` without touching code.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import SHARED_DIR

log = logging.getLogger(__name__)

_PATTERNS_PATH = SHARED_DIR / "config" / "origin-detection-patterns.json"
_SCHEMA_PATH = SHARED_DIR / "schemas" / "origin-detection-patterns.schema.json"
_CACHE: dict | None = None

_REQUIRED_KEYS = ("tsparmcd_regex", "suppdm_qnam_regex", "tsval_country_tokens",
                  "country_canonical")


def _validate_patterns(payload: dict) -> list[str]:
    """Lightweight load-time integrity check for the patterns config.

    The JSON Schema file documents the shape for IDE tooling. This function
    mirrors the schema's REQUIRED keys and type expectations in Python so
    malformed sponsor-extensions fail at startup rather than silently
    degrading detection (AC-F11-2).
    """
    errors: list[str] = []
    if not isinstance(payload, dict):
        return [f"root must be an object, got {type(payload).__name__}"]
    for key in _REQUIRED_KEYS:
        if key not in payload:
            errors.append(f"missing required key '{key}'")

    for key in ("tsparmcd_regex", "suppdm_qnam_regex"):
        block = payload.get(key)
        if block is None:
            continue
        if not isinstance(block, dict) or "pattern" not in block:
            errors.append(f"'{key}' must be an object with a 'pattern' field")
            continue
        if not isinstance(block["pattern"], str):
            errors.append(f"'{key}.pattern' must be a string")
            continue
        try:
            re.compile(block["pattern"])
        except re.error as e:
            errors.append(f"'{key}.pattern' is not a valid regex: {e}")

    tokens = payload.get("tsval_country_tokens")
    if tokens is not None and (not isinstance(tokens, list)
                               or any(not isinstance(t, str) for t in tokens)):
        errors.append("'tsval_country_tokens' must be a list of strings")

    canonical = payload.get("country_canonical")
    if canonical is not None and (not isinstance(canonical, dict)
                                  or any(not isinstance(v, str) for v in canonical.values())):
        errors.append("'country_canonical' must be an object with string values")

    return errors


class OriginPatternsIntegrityError(RuntimeError):
    """Raised at load time when shared/config/origin-detection-patterns.json
    fails structural validation. Fail-fast at startup, never silently at
    detection time.
    """


def _load_patterns() -> dict:
    """Load the patterns config (cached, validated at first use).

    Validation is structural (required keys, regex compilability, list/dict
    types). If the file is missing the module degrades to a no-op empty
    config — AC-F11-5 mandates detect_origin never blocks the pipeline,
    so a missing config file is treated as "no patterns configured" rather
    than a fatal error.

    Malformed content (wrong types, invalid regex) DOES raise — a sponsor
    that hand-edits the JSON incorrectly must not silently disable origin
    detection on real NHP studies.
    """
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    if not _PATTERNS_PATH.exists():
        log.warning("origin-detection-patterns.json not found at %s; "
                    "disabling detection (no-op fallback).", _PATTERNS_PATH)
        _CACHE = {
            "tsparmcd_regex": {"pattern": ""},
            "suppdm_qnam_regex": {"pattern": ""},
            "tsval_country_tokens": [],
            "country_canonical": {},
            "_hcd_reference_origin": "",
        }
        return _CACHE
    try:
        with open(_PATTERNS_PATH, encoding="utf-8") as f:
            payload = json.load(f)
    except json.JSONDecodeError as e:
        raise OriginPatternsIntegrityError(
            f"origin-detection-patterns.json is not valid JSON: {e}"
        ) from e
    errors = _validate_patterns(payload)
    if errors:
        raise OriginPatternsIntegrityError(
            "origin-detection-patterns.json failed load-time integrity check:\n  - "
            + "\n  - ".join(errors)
        )
    _CACHE = payload
    return _CACHE


def _compile(regex_block: dict) -> re.Pattern | None:
    pat = (regex_block or {}).get("pattern", "")
    if not pat:
        return None
    flags = 0
    flag_str = (regex_block or {}).get("flags", "")
    if "IGNORECASE" in flag_str:
        flags |= re.IGNORECASE
    try:
        return re.compile(pat, flags)
    except re.error as e:
        log.warning("invalid origin regex %r: %s", pat, e)
        return None


@dataclass(frozen=True)
class OriginDetection:
    origin_captured: bool
    origin_value: str | None
    origin_match: str  # "same" | "different" | "unknown"
    detection_source: str | None  # e.g. "TSPARMCD.SPCSOURCE", "SUPPDM.ORIGIN_COUNTRY", "TSVAL_parse"
    origin_detection_conflict: bool

    def to_payload(self) -> dict[str, Any]:
        return {
            "origin_captured": self.origin_captured,
            "origin_value": self.origin_value,
            "origin_match": self.origin_match,
            "detection_source": self.detection_source,
            "origin_detection_conflict": self.origin_detection_conflict,
        }


_EMPTY = OriginDetection(
    origin_captured=False,
    origin_value=None,
    origin_match="unknown",
    detection_source=None,
    origin_detection_conflict=False,
)


def _canonicalise(value: str, patterns: dict) -> str:
    """Map a raw origin value (possibly multi-word) to a canonical country.

    Strategy: (a) exact uppercased match against ``country_canonical``;
    (b) token-based search for any recognised country alias ('MAINLAND
    CHINA' -> MAINLAND -> CHINA); (c) fallback to uppercased raw value.
    """
    canonical = (patterns.get("country_canonical") or {})
    if not value:
        return ""
    v = value.strip().upper()
    if v in canonical:
        return canonical[v]
    # Token-scan for any recognised alias inside a multi-word value.
    hits: set[str] = set()
    for alias, country in canonical.items():
        if re.search(r"\b" + re.escape(alias) + r"\b", v):
            hits.add(country)
    if len(hits) == 1:
        return next(iter(hits))
    return v


def _classify_match(origin_value: str | None, patterns: dict) -> str:
    if not origin_value:
        return "unknown"
    canonical = _canonicalise(origin_value, patterns)
    hcd_ref = (patterns.get("_hcd_reference_origin") or "").strip().upper()
    if not hcd_ref:
        return "unknown"
    if canonical == hcd_ref:
        return "same"
    if canonical in (patterns.get("country_canonical") or {}).values():
        return "different"
    return "unknown"


def _scan_tsparmcd(ts_rows: list[dict], pattern: re.Pattern) -> list[tuple[str, str]]:
    """Return [(tsparmcd_code, tsval)] for rows whose TSPARMCD matches."""
    hits: list[tuple[str, str]] = []
    for row in ts_rows:
        code = str(row.get("TSPARMCD") or "").strip()
        if not code:
            continue
        if pattern.search(code):
            hits.append((code.upper(), str(row.get("TSVAL") or "").strip()))
    return hits


def _scan_suppdm(suppdm_rows: list[dict], pattern: re.Pattern) -> list[tuple[str, str]]:
    """Return [(qnam, qval)] for SUPPDM rows whose QNAM matches."""
    hits: list[tuple[str, str]] = []
    for row in suppdm_rows:
        qnam = str(row.get("QNAM") or "").strip()
        if not qnam:
            continue
        if pattern.search(qnam):
            hits.append((qnam.upper(), str(row.get("QVAL") or "").strip()))
    return hits


def _scan_tsval_freetext(ts_rows: list[dict], tokens: list[str]) -> list[tuple[str, str]]:
    """Scan STRAIN / SPECIES / STYPE TSVAL values for country tokens.

    Returns [(matched_token, source_tsparmcd)] for the first token hit per row.
    """
    if not tokens:
        return []
    hits: list[tuple[str, str]] = []
    token_set = sorted({t.strip().upper() for t in tokens if t.strip()}, key=len, reverse=True)
    pattern = re.compile(r"\b(" + "|".join(re.escape(t) for t in token_set) + r")\b", re.IGNORECASE)
    relevant_params = {"STRAIN", "SPECIES", "STYPE", "STRAINDETAIL", "SPCNOTES"}
    for row in ts_rows:
        code = str(row.get("TSPARMCD") or "").strip().upper()
        if code and code not in relevant_params:
            continue
        value = str(row.get("TSVAL") or "")
        if not value:
            continue
        m = pattern.search(value)
        if m:
            hits.append((m.group(1).upper(), f"TSVAL.{code or 'UNSPECIFIED'}"))
    return hits


def detect_origin(
    ts_rows: list[dict] | None,
    suppdm_rows: list[dict] | None = None,
) -> OriginDetection:
    """Detect NHP colony origin from TS / SUPPDM rows.

    Inputs are lists of plain dicts (rows of the TS / SUPPDM DataFrames with
    upper-cased column names). Order-independent and side-effect-free.

    Source precedence: TSPARMCD > SUPPDM > TSVAL free-text. First matching
    source sets origin_value; remaining sources are scanned only to detect
    cross-source conflicts (origin_detection_conflict=True when a later
    source disagrees).

    Multi-match within a single source: emits origin_match='unknown' +
    origin_detection_conflict=True.

    Never raises. Always returns an OriginDetection.
    """
    if ts_rows is None:
        ts_rows = []
    if suppdm_rows is None:
        suppdm_rows = []

    patterns = _load_patterns()
    ts_pattern = _compile(patterns.get("tsparmcd_regex") or {})
    suppdm_pattern = _compile(patterns.get("suppdm_qnam_regex") or {})

    tsparmcd_hits = _scan_tsparmcd(ts_rows, ts_pattern) if ts_pattern else []
    suppdm_hits = _scan_suppdm(suppdm_rows, suppdm_pattern) if suppdm_pattern else []
    tsval_hits = _scan_tsval_freetext(ts_rows, patterns.get("tsval_country_tokens") or [])

    # Precedence + multi-match handling.
    origin_value: str | None = None
    detection_source: str | None = None
    multi_match_within_source = False

    if tsparmcd_hits:
        if len(tsparmcd_hits) > 1:
            # Multi-match within TSPARMCD — conflicting ORIGIN rows.
            canonical_values = {_canonicalise(v, patterns) for _, v in tsparmcd_hits if v}
            if len(canonical_values) > 1:
                multi_match_within_source = True
            origin_value = tsparmcd_hits[0][1] or None
            detection_source = f"TSPARMCD.{tsparmcd_hits[0][0]}"
        else:
            code, value = tsparmcd_hits[0]
            origin_value = value or None
            detection_source = f"TSPARMCD.{code}"
    elif suppdm_hits:
        if len(suppdm_hits) > 1:
            canonical_values = {_canonicalise(v, patterns) for _, v in suppdm_hits if v}
            if len(canonical_values) > 1:
                multi_match_within_source = True
            origin_value = suppdm_hits[0][1] or None
            detection_source = f"SUPPDM.{suppdm_hits[0][0]}"
        else:
            qnam, qval = suppdm_hits[0]
            origin_value = qval or None
            detection_source = f"SUPPDM.{qnam}"
    elif tsval_hits:
        if len(tsval_hits) > 1:
            canonical_values = {_canonicalise(t, patterns) for t, _ in tsval_hits}
            if len(canonical_values) > 1:
                multi_match_within_source = True
        token, source_code = tsval_hits[0]
        origin_value = token
        detection_source = source_code if source_code.startswith("TSVAL.") else "TSVAL.UNSPECIFIED"

    # Cross-source disagreement detection. If a later-precedence source
    # also matched, and canonicalised to a different country than the
    # winning source, flag origin_detection_conflict=true.
    cross_source_conflict = False
    if origin_value is not None:
        winning_canonical = _canonicalise(origin_value, patterns)
        other_sources_canonical: set[str] = set()
        if detection_source and not detection_source.startswith("TSPARMCD.") and tsparmcd_hits:
            other_sources_canonical.update(
                _canonicalise(v, patterns) for _, v in tsparmcd_hits if v
            )
        if detection_source and not detection_source.startswith("SUPPDM.") and suppdm_hits:
            other_sources_canonical.update(
                _canonicalise(v, patterns) for _, v in suppdm_hits if v
            )
        if detection_source and not detection_source.startswith("TSVAL.") and tsval_hits:
            other_sources_canonical.update(
                _canonicalise(t, patterns) for t, _ in tsval_hits
            )
        other_sources_canonical.discard("")
        other_sources_canonical.discard(winning_canonical)
        if other_sources_canonical:
            cross_source_conflict = True

    if origin_value is None:
        return _EMPTY

    origin_detection_conflict = multi_match_within_source or cross_source_conflict
    if origin_detection_conflict:
        # Conflicting evidence — captured, but match is 'unknown'.
        match = "unknown"
    else:
        match = _classify_match(origin_value, patterns)

    return OriginDetection(
        origin_captured=True,
        origin_value=origin_value or None,
        origin_match=match,
        detection_source=detection_source,
        origin_detection_conflict=origin_detection_conflict,
    )


def reset_cache() -> None:
    """Clear the cached patterns config. Used by tests that mutate the JSON."""
    global _CACHE
    _CACHE = None
