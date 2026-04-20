"""Cross-study term collision detection (Phase E Feature 5).

Finds MI/MA/CL terms that may be synonyms across multiple studies. Uses:
    1. Organ pre-filter — terms on different organs cannot be synonyms.
    2. Inverted token index — only compare terms sharing >=1 token.
    3. Result cache — LRU keyed on (frozenset(study_ids), dict_version,
       domain, organ); explicit clear on admin PUT (R1 F4).
    4. Lazy evaluation — compute only for organs present in the request.

Separate file from cross_study_aggregation.py because the cache-invalidation
keys differ and aggregation cache should not blow on every dict version bump
(synthesis section 5).
"""

from __future__ import annotations

import logging
from collections import OrderedDict, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from services.analysis.send_knowledge import (
    _FINDING_DICTIONARY_DOMAINS,
    get_dictionary_versions,
)
from services.analysis.term_tokenization import tokenize_term

log = logging.getLogger(__name__)

_CONFIDENCE_THRESHOLD_DEFAULT = 0.7
_QUALIFIER_CONFIDENCE_CAP = 0.6
_CACHE_MAX_ENTRIES = 256


@dataclass(frozen=True)
class CollisionReport:
    study_a: str
    study_b: str
    organ: str | None
    domain: str
    term_a: str
    term_b: str
    token_jaccard: float
    string_similarity: float
    confidence: float
    report_kind: str  # "collision" | "qualifier_divergence"


class CollisionCache:
    """Small LRU keyed on (frozenset(study_ids), dict_version, domain, organ).

    dict_version is part of the key so bumping the admin overlay version
    naturally invalidates prior results. The admin PUT flow also calls
    .clear() explicitly (belt-and-braces, AC-5.5).
    """

    def __init__(self, max_entries: int = _CACHE_MAX_ENTRIES) -> None:
        self._store: OrderedDict[tuple, list[CollisionReport]] = OrderedDict()
        self._max = max_entries

    def get(self, key: tuple) -> list[CollisionReport] | None:
        if key in self._store:
            self._store.move_to_end(key)
            return list(self._store[key])
        return None

    def put(self, key: tuple, value: list[CollisionReport]) -> None:
        self._store[key] = list(value)
        self._store.move_to_end(key)
        while len(self._store) > self._max:
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()

    def size(self) -> int:
        return len(self._store)


# Module-level singleton — cleared by the admin PUT success handler.
collision_cache = CollisionCache()

_PAIRWISE_COMPARE_COUNTER = {"n": 0}
_SKIPPED_STUDIES_COUNTER = {"n": 0}


def _reset_pairwise_counter() -> None:
    _PAIRWISE_COMPARE_COUNTER["n"] = 0
    _SKIPPED_STUDIES_COUNTER["n"] = 0


def get_pairwise_compare_count() -> int:
    """Test hook: expose the pairwise comparison metric (AC-5.3)."""
    return _PAIRWISE_COMPARE_COUNTER["n"]


def get_skipped_studies_count() -> int:
    """Test hook: expose the lazy-eval skipped-study metric (AC-5.6).

    Counts studies with no findings in any requested organ partition —
    i.e., studies that contribute zero candidates after the organ filter.
    """
    return _SKIPPED_STUDIES_COUNTER["n"]


def _string_similarity(a: str, b: str) -> float:
    if len(a) < 6 or len(b) < 6:
        return 0.0
    return SequenceMatcher(None, a.upper(), b.upper()).ratio()


def _collect_candidates(study) -> list[dict]:
    """Return [{study, domain, organ, term, level, qualifier, base}, ...].

    Level 6 unmatched terms are included; level 3 terms are tagged so the
    opt-in qualifier-divergence path can branch on them separately.
    """
    out: list[dict] = []
    study_id = getattr(study, "study_id", None) or ""
    findings = getattr(study, "unified_findings", []) or []
    for f in findings:
        domain = f.get("domain")
        if domain not in _FINDING_DICTIONARY_DOMAINS:
            continue
        level = f.get("test_code_recognition_level")
        if level not in (3, 6):
            continue
        # Prefer the test-name form used by the recognition dispatcher.
        raw = (
            f.get("test_name")
            or f.get("canonical_testcd")
            or f.get("test_code")
            or ""
        )
        raw_upper = str(raw).upper().strip()
        if not raw_upper:
            continue
        organ = f.get("organ_system")
        out.append(
            {
                "study": study_id,
                "domain": domain,
                "organ": (organ.upper().strip() if organ else None),
                "term": raw_upper,
                "level": level,
                "base": (f.get("canonical_base_finding") or "").upper() or None,
                "qualifier": (f.get("canonical_qualifier") or "").upper() or None,
            }
        )
    return out


def _dedupe_candidates(candidates: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out = []
    for c in candidates:
        key = (c["study"], c["domain"], c["organ"], c["term"], c["level"])
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def detect_collisions(
    studies: list[Any],
    organs: list[str] | None = None,
    cache: CollisionCache | None = None,
    min_confidence: float = _CONFIDENCE_THRESHOLD_DEFAULT,
    include_qualifier_divergence: bool = False,
) -> list[CollisionReport]:
    """Return pairwise synonym-candidate reports across the given studies.

    See module docstring for the four bounding strategies. Results are
    cached per (frozenset(study_ids), dict_version, domain, organ, mode).
    """
    _reset_pairwise_counter()

    cache = cache if cache is not None else collision_cache
    study_ids = sorted({getattr(s, "study_id", "") for s in studies if getattr(s, "study_id", "")})
    if len(study_ids) < 2:
        return []
    dict_version = get_dictionary_versions().get("finding_synonyms", "unknown")

    organs_filter = {o.upper().strip() for o in organs} if organs else None

    all_candidates = []
    per_study_in_scope: dict[str, int] = defaultdict(int)
    for s in studies:
        cands = _collect_candidates(s)
        all_candidates.extend(cands)
        sid = getattr(s, "study_id", "") or ""
        for c in cands:
            if organs_filter is None or c["organ"] in organs_filter:
                per_study_in_scope[sid] += 1
    all_candidates = _dedupe_candidates(all_candidates)

    # Lazy-eval metric (AC-5.6): count studies that contribute zero
    # candidates after organ filtering.
    _SKIPPED_STUDIES_COUNTER["n"] = sum(
        1 for sid in study_ids if per_study_in_scope.get(sid, 0) == 0
    )

    # Group candidates by (domain, organ).
    groups: dict[tuple[str, str | None], list[dict]] = defaultdict(list)
    for c in all_candidates:
        if organs_filter is not None and c["organ"] not in organs_filter:
            continue
        groups[(c["domain"], c["organ"])].append(c)

    results: list[CollisionReport] = []
    for (domain, organ), group in groups.items():
        mode = "qualifier_divergence" if include_qualifier_divergence else "collision"
        key = (frozenset(study_ids), dict_version, domain, organ, mode)
        cached = cache.get(key)
        if cached is not None:
            results.extend(cached)
            continue
        group_results = _detect_within_group(
            group,
            domain=domain,
            organ=organ,
            include_qualifier_divergence=include_qualifier_divergence,
            min_confidence=min_confidence,
        )
        cache.put(key, group_results)
        results.extend(group_results)

    return results


_SHINGLE_SIZE = 4
_FUZZY_TOKEN_THRESHOLD = 0.85


def _base_token_jaccard(base_a: str | None, base_b: str | None) -> float:
    """Jaccard over canonical-base tokens (AC-5.8).

    Used only on the qualifier-divergence path where both findings are
    level-3 base-concept matches. Per spec: confidence = 0.6 * base_token_jaccard
    with no string_similarity bonus — qualifiers are intentionally distinct
    so the full-term Jaccard would understate the base-concept similarity.
    """
    if not base_a or not base_b:
        return 0.0
    ta = tokenize_term(base_a)
    tb = tokenize_term(base_b)
    return _fuzzy_token_jaccard(ta, tb)


def _fuzzy_token_jaccard(a_tokens: list[str], b_tokens: list[str]) -> float:
    """Fuzzy Jaccard — two tokens count as equal when either exact or
    SequenceMatcher ratio >= 0.85 (catches morphological variants like
    VACUOLATION/VACUOLIZATION). Mirrors the fuzzy rule used in
    term_suggestions so scoring semantics are consistent across the
    collision and suggestion paths.
    """
    if not a_tokens or not b_tokens:
        return 0.0
    sa, sb = set(a_tokens), set(b_tokens)
    matched_in_b: set[str] = set()
    inter = 0
    for ta in sa:
        if ta in sb:
            inter += 1
            matched_in_b.add(ta)
            continue
        if len(ta) < 4:
            continue
        for tb in sb - matched_in_b:
            if len(tb) < 4:
                continue
            if SequenceMatcher(None, ta, tb).ratio() >= _FUZZY_TOKEN_THRESHOLD:
                inter += 1
                matched_in_b.add(tb)
                break
    union = len(sa) + len(sb) - inter
    return inter / union if union else 0.0


def _shingles(term: str) -> set[str]:
    """Character 4-grams used to broaden the inverted index.

    Pure tokens (whitespace split) don't catch morphological variants
    like VACUOLATION/VACUOLIZATION — they tokenize to different single
    words with no overlap. 4-grams let the inverted index prune disjoint
    terms (AC-5.3) while still pairing near-duplicates (AC-5.1).
    """
    stripped = "".join(ch for ch in term.upper() if ch.isalnum())
    if len(stripped) < _SHINGLE_SIZE:
        return {stripped} if stripped else set()
    return {stripped[i : i + _SHINGLE_SIZE] for i in range(len(stripped) - _SHINGLE_SIZE + 1)}


def _detect_within_group(
    group: list[dict],
    domain: str,
    organ: str | None,
    include_qualifier_divergence: bool,
    min_confidence: float,
) -> list[CollisionReport]:
    """Scan one (domain, organ) partition for collisions."""
    # Inverted index on BOTH word tokens AND 4-char shingles. Word-token
    # pairing handles multi-word term matches; shingles handle typo variants.
    index: dict[str, list[int]] = defaultdict(list)
    tokens_cache: list[list[str]] = []
    for i, c in enumerate(group):
        toks = tokenize_term(c["term"])
        tokens_cache.append(toks)
        keys = set(toks) | _shingles(c["term"])
        for key in keys:
            index[key].append(i)

    # Candidate pairs: share >=1 token AND come from different studies.
    seen_pairs: set[tuple[int, int]] = set()
    for positions in index.values():
        if len(positions) < 2:
            continue
        for i in positions:
            for j in positions:
                if i >= j:
                    continue
                if group[i]["study"] == group[j]["study"]:
                    continue
                pair = (i, j)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)

    reports: list[CollisionReport] = []
    for i, j in seen_pairs:
        ci, cj = group[i], group[j]
        _PAIRWISE_COMPARE_COUNTER["n"] += 1
        tj_score = _fuzzy_token_jaccard(tokens_cache[i], tokens_cache[j])
        # Level-3 cross-qualifier path (opt-in only; AC-5.8).
        if ci["level"] == 3 and cj["level"] == 3:
            if not include_qualifier_divergence:
                continue
            # Both are base_concept-resolved; base stability is already
            # known (same canonical_base_finding if they should collide).
            if ci["base"] and cj["base"] and ci["base"] != cj["base"]:
                continue
            # Spec: `confidence = 0.6 * base_token_jaccard` (no
            # string_similarity bonus). Base tokens — not full-term
            # fuzzy tokens — so same-base pairs score at the 0.6 cap
            # rather than being diluted by the known-distinct qualifiers.
            base_tj = _base_token_jaccard(ci["base"], cj["base"])
            confidence = min(_QUALIFIER_CONFIDENCE_CAP, 0.6 * base_tj)
            if confidence <= 0:
                continue
            # Qualifier-divergence pairs do not gate on min_confidence
            # above 0.6 (they're capped below 0.7 by definition).
            reports.append(
                CollisionReport(
                    study_a=ci["study"],
                    study_b=cj["study"],
                    organ=organ,
                    domain=domain,
                    term_a=ci["term"],
                    term_b=cj["term"],
                    token_jaccard=round(tj_score, 4),
                    string_similarity=0.0,
                    confidence=round(confidence, 4),
                    report_kind="qualifier_divergence",
                )
            )
            continue
        # Default path: either both level-6 or mixed.
        ss_score = _string_similarity(ci["term"], cj["term"])
        confidence = 0.6 * tj_score + 0.4 * ss_score
        if confidence < min_confidence:
            continue
        reports.append(
            CollisionReport(
                study_a=ci["study"],
                study_b=cj["study"],
                organ=organ,
                domain=domain,
                term_a=ci["term"],
                term_b=cj["term"],
                token_jaccard=round(tj_score, 4),
                string_similarity=round(ss_score, 4),
                confidence=round(confidence, 4),
                report_kind="collision",
            )
        )
    # Sort by confidence desc for stable output.
    reports.sort(key=lambda r: (-r.confidence, r.study_a, r.study_b, r.term_a))
    return reports
