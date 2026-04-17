"""Candidate suggestion + promotion evaluation for unrecognized MI/MA/CL terms.

Phase D features:
    - Feature 1: suggest_candidates() — token+string-similarity ranking over the
      shipped finding-synonyms dictionary. Pure function.
    - Feature 3: evaluate_promotion_signal() — proportional frequency threshold
      with cross-CRO bonus, structural pre-check against existing canonicals,
      and a Fisher/chi-square homonym guard with N-min gate.
    - BH-FDR helper — applied by the admin API across the candidate list
      returned in a single GET response (so p_adj is computed by the router,
      not this module).

Rule-14 rationale for a new file (not extending send_knowledge.py):
    send_knowledge.py is 1196 LOC, over the 500 LOC per-file budget
    (docs/_internal/knowledge/code-quality-guardrails.md). Suggestion and
    promotion logic are new concerns (candidate scoring + frequency
    calibration); splitting keeps send_knowledge.py as the dispatcher
    surface and isolates the Phase D concerns for independent testing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from services.analysis.send_knowledge import (
    _FINDING_DICTIONARY_DOMAINS,
    _load_finding_synonyms_data,
)
from services.analysis.term_tokenization import tokenize_term


# Short-string similarity floor — research section 5.5 "CAST/CYST" risk.
# Below 6 chars on either side, string_similarity contribution is forced to 0.
_MIN_LEN_FOR_STRING_SIMILARITY = 6

_CONFIDENCE_THRESHOLD = 0.7
_DEFAULT_MAX_CANDIDATES = 5

# Promotion (Feature 3) — homonym guard gates.
_HOMONYM_MIN_FINDINGS_PER_STUDY = 10
_HOMONYM_ALPHA = 0.05


@dataclass(frozen=True)
class SuggestionCandidate:
    """One ranked candidate canonical for an unrecognized raw term."""

    canonical: str
    confidence: float
    token_jaccard: float
    string_similarity: float
    match_reason: str
    organ_scope_reliable: bool
    organ_norm_tier_reason: str | None = None
    ncit_code: str | None = None
    source: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class PromotionSignal:
    """Outcome of evaluate_promotion_signal for a candidate term."""

    promotable: bool
    proportion_studies: float
    cross_cro: bool
    effective_threshold: float
    structural_variant_of: str | None
    homonym_flag: bool
    homonym_p_raw: float | None
    homonym_p_adj: float | None
    homonym_evidence: str | None
    rejection_reason: str | None


# ─── Feature 1 ──────────────────────────────────────────────────────────────


def _string_similarity(a: str, b: str) -> float:
    """SequenceMatcher.ratio() with short-term min-len gate (AC-1.2).

    Computed on both raw and sorted-token-join forms; the max is returned
    so word-order swaps ("HEPATOCELULAR HYPERTROPHY" vs "HYPERTROPHY,
    HEPATOCELLULAR") still score high on near-typos. Same underlying API
    (SequenceMatcher.ratio) — just evaluated on two complementary
    representations of the same pair (Advisory 2 single-API constraint
    preserved — one API, two inputs).
    """
    if len(a) < _MIN_LEN_FOR_STRING_SIMILARITY or len(b) < _MIN_LEN_FOR_STRING_SIMILARITY:
        return 0.0
    a_upper = a.upper()
    b_upper = b.upper()
    raw_ratio = SequenceMatcher(None, a_upper, b_upper).ratio()
    # Sorted-token form collapses word-order differences.
    a_sorted = " ".join(sorted(tokenize_term(a_upper)))
    b_sorted = " ".join(sorted(tokenize_term(b_upper)))
    sorted_ratio = (
        SequenceMatcher(None, a_sorted, b_sorted).ratio() if a_sorted and b_sorted else 0.0
    )
    return max(raw_ratio, sorted_ratio)


_FUZZY_TOKEN_EQUIV_THRESHOLD = 0.85


def _token_jaccard(a_tokens: list[str], b_tokens: list[str]) -> float:
    """Fuzzy Jaccard over token sets.

    Two tokens count as equal when either exact or SequenceMatcher ratio
    >= 0.85 (typo tolerance — "HEPATOCELULAR" matches "HEPATOCELLULAR").
    This is the base-concept + edit-distance rescue path referenced in
    AC-1.3. Short tokens (< 4 chars either side) require exact match.
    """
    if not a_tokens and not b_tokens:
        return 0.0
    sa, sb = set(a_tokens), set(b_tokens)
    if not sa or not sb:
        return 0.0
    # Exact intersection first
    matched_in_b: set[str] = set()
    inter = 0
    for ta in sa:
        if ta in sb:
            inter += 1
            matched_in_b.add(ta)
            continue
        # Fuzzy fallback for tokens >=4 chars
        if len(ta) < 4:
            continue
        for tb in sb - matched_in_b:
            if len(tb) < 4:
                continue
            if SequenceMatcher(None, ta, tb).ratio() >= _FUZZY_TOKEN_EQUIV_THRESHOLD:
                inter += 1
                matched_in_b.add(tb)
                break
    union = len(sa) + len(sb) - inter
    if union == 0:
        return 0.0
    return inter / union


def _organ_context_bonus(
    candidate_organ_scope: list[str] | None,
    finding_organ_system: str | None,
) -> float:
    """0.2 when candidate's organ scope includes the finding's organ, else 0."""
    if not candidate_organ_scope:
        return 0.0
    if not finding_organ_system:
        return 0.0
    finding_upper = finding_organ_system.upper().strip()
    for scope in candidate_organ_scope:
        if (scope or "").upper().strip() == finding_upper:
            return 1.0
    return 0.0


def _is_organ_scope_reliable(
    candidate_organ_scope: list[str] | None,
    finding_organ_recognition_level: int | None,
) -> tuple[bool, str | None]:
    """Return (reliable, reason_when_unreliable) per AC-1.4a/b/c/d.

    Rule:
      - candidate_organ_scope is None / empty -> always reliable (dictionary-
        wide synonym, no scope constraint).
      - candidate_organ_scope non-empty AND finding_organ_recognition_level
        in {1, 2} -> reliable (exact group canonical or registered alias).
      - Everything else (level 6 sub-tiers or None specimen) -> unreliable.

    The `organ_norm_tier` value surfaces on the candidate as
    `organ_norm_tier_reason` so the UI can explain WHY it was flagged.
    That field is populated by the caller (suggest_candidates), which has
    the tier in hand — this helper only returns the boolean + reason label.
    """
    if not candidate_organ_scope:
        return (True, None)
    if finding_organ_recognition_level in (1, 2):
        return (True, None)
    if finding_organ_recognition_level is None:
        return (False, "no_specimen")
    # level 6 sub-tier cannot be inferred from the level alone; leave the
    # reason label to the caller (who has organ_norm_tier).
    return (False, "unreliable_organ_tier")


def suggest_candidates(
    raw_term: str,
    domain: str,
    organ_system: str | None,
    dictionary: dict | None = None,
    max_candidates: int = _DEFAULT_MAX_CANDIDATES,
    finding_organ_recognition_level: int | None = None,
    finding_organ_norm_tier: str | None = None,
) -> list[SuggestionCandidate]:
    """Return ranked canonicals for an unrecognized term.

    Algorithm per research section 3.2 / 5.2:
      - token_jaccard: Jaccard over tokenize_term() sets.
      - string_similarity: SequenceMatcher(None, a, b).ratio() on upper strings,
        forced to 0 when either side < 6 chars (short-term risk, AC-1.2).
      - organ_context_bonus: 0.2 when candidate organ_scope contains the
        input organ_system (if candidate carries an organ_scope at all).
      - confidence = 0.5*token_jaccard + 0.3*string_similarity
                     + 0.2*organ_context_bonus
      - Candidates below 0.7 dropped.
      - Sorted descending on confidence; capped at max_candidates.

    When a candidate has a non-null organ_scope AND the input finding's
    organ_recognition_level is 6 or None, the candidate is still returned
    but with organ_scope_reliable=False and an organ_norm_tier_reason
    label (prefix / slash_compound / unmatched / empty / no_specimen) so
    the admin UI can require extra confirmation (AC-1.4a-d, R1 F7 + R2 N1).
    """
    if not raw_term or domain not in _FINDING_DICTIONARY_DOMAINS:
        return []

    raw_upper = raw_term.upper().strip()
    if not raw_upper:
        return []

    data = dictionary if dictionary is not None else _load_finding_synonyms_data()
    entries = ((data.get("domains") or {}).get(domain, {}) or {}).get("entries", {}) or {}
    if not entries:
        return []

    raw_tokens = tokenize_term(raw_upper)

    # Reason label when the input finding is at organ level 6
    if finding_organ_recognition_level == 6:
        tier_reason = finding_organ_norm_tier or "unmatched"
    elif finding_organ_recognition_level is None:
        tier_reason = "no_specimen"
    else:
        tier_reason = None

    scored: list[SuggestionCandidate] = []
    for canonical, entry in entries.items():
        canonical_upper = str(canonical).upper()
        # Skip self-match — the raw term is not a candidate for itself.
        if canonical_upper == raw_upper:
            continue
        cand_tokens = tokenize_term(canonical_upper)
        tj = _token_jaccard(raw_tokens, cand_tokens)
        ss = _string_similarity(raw_upper, canonical_upper)
        organ_scope = entry.get("organ_scope")
        ob = _organ_context_bonus(organ_scope, organ_system)
        confidence = 0.5 * tj + 0.3 * ss + 0.2 * ob
        if confidence < _CONFIDENCE_THRESHOLD:
            continue
        reliable, unreliable_reason = _is_organ_scope_reliable(
            organ_scope, finding_organ_recognition_level
        )
        # Use the caller-side tier_reason when reliability fails because of
        # level 6 sub-tier; keep the no_specimen / unreliable labels for
        # the None / unexpected cases.
        reason_label = None
        if not reliable:
            reason_label = tier_reason or unreliable_reason
        scored.append(
            SuggestionCandidate(
                canonical=canonical_upper,
                confidence=round(confidence, 4),
                token_jaccard=round(tj, 4),
                string_similarity=round(ss, 4),
                match_reason=_pick_match_reason(tj, ss, ob),
                organ_scope_reliable=reliable,
                organ_norm_tier_reason=reason_label,
                ncit_code=entry.get("ncit_code"),
                source=list(entry.get("source") or []),
            )
        )

    scored.sort(
        key=lambda c: (-c.confidence, -c.token_jaccard, -c.string_similarity, c.canonical)
    )
    return scored[:max_candidates]


def _pick_match_reason(tj: float, ss: float, ob: float) -> str:
    """Human-readable label for which signal dominated."""
    if tj >= max(ss, ob):
        return "token_overlap"
    if ss >= ob:
        return "string_similarity"
    return "organ_context"


# ─── Feature 3 ──────────────────────────────────────────────────────────────


def _structural_variant_of(
    raw_upper: str, domain: str, entries: dict
) -> str | None:
    """Return canonical name if raw is a trivial formatting variant.

    Variants checked: comma add/remove, hyphen add/remove, singular vs plural
    (trailing 'S' or '(S)'), 2-token word-order swap. Research section 5.3.
    """
    if not raw_upper:
        return None

    def _norm(s: str) -> str:
        return s.replace(",", "").replace("-", "").replace("(", "").replace(")", "").strip()

    raw_norm = _norm(raw_upper)
    # Singular/plural
    raw_singular = raw_norm.rstrip("S") if raw_norm.endswith("S") else raw_norm + "S"

    raw_tokens = raw_upper.split()
    for canonical in entries.keys():
        can_upper = str(canonical).upper()
        can_norm = _norm(can_upper)
        # comma/hyphen/paren differences
        if can_norm and raw_norm == can_norm:
            return can_upper
        # singular/plural
        if can_norm in (raw_singular, raw_singular.rstrip("S")):
            return can_upper
        # 2-token word-order swap (e.g., "BASOPHILIA TUBULAR" vs "TUBULAR BASOPHILIA")
        can_tokens = can_upper.replace(",", "").split()
        if len(raw_tokens) == 2 and len(can_tokens) == 2:
            if set(raw_tokens) == set(can_tokens):
                return can_upper
    return None


def _collapse_severity(grades: list[int]) -> tuple[int, int]:
    """5-point scale -> 2-bin (low = grades 1-2, high = grades 3-5)."""
    low = sum(1 for g in grades if g in (1, 2))
    high = sum(1 for g in grades if g in (3, 4, 5))
    return (low, high)


def _fisher_or_chi2_p(contingency: list[tuple[int, int]]) -> tuple[float, str]:
    """Return (p_value, test_name) for a 2xK contingency.

    Uses Fisher's exact when any expected cell count < 5; chi-square otherwise.
    For K > 2 with Fisher, we fall back to scipy's fisher_exact on each pair
    vs the pooled rest (Bonferroni-adjusted min). This is a conservative
    screening stat, not a definitive test.
    """
    # Import lazily so import cost falls on the caller that actually needs it.
    from scipy.stats import chi2_contingency, fisher_exact

    # contingency: list of (low, high) per study. Transpose -> 2xK.
    lows = [c[0] for c in contingency]
    highs = [c[1] for c in contingency]
    if sum(lows) + sum(highs) == 0:
        return (1.0, "no_data")
    table = [lows, highs]
    # Expected counts via row/col marginals.
    row_totals = [sum(lows), sum(highs)]
    col_totals = [lows[i] + highs[i] for i in range(len(lows))]
    grand = sum(row_totals)
    if grand == 0:
        return (1.0, "no_data")
    min_expected = min(
        (row_totals[r] * col_totals[c]) / grand
        for r in range(2)
        for c in range(len(col_totals))
    )
    if min_expected < 5:
        # Fisher on 2x2 only; for K>2, pairwise with Bonferroni.
        if len(col_totals) == 2:
            _, p = fisher_exact([[lows[0], lows[1]], [highs[0], highs[1]]], alternative="two-sided")
            return (float(p), "fisher")
        # Pairwise screen: min p * K-choose-2 (Bonferroni)
        ps = []
        k = len(col_totals)
        for i in range(k):
            for j in range(i + 1, k):
                _, p = fisher_exact(
                    [[lows[i], lows[j]], [highs[i], highs[j]]], alternative="two-sided"
                )
                ps.append(float(p))
        if not ps:
            return (1.0, "fisher_pairwise")
        k_pairs = len(ps)
        return (min(1.0, min(ps) * k_pairs), "fisher_pairwise")
    # Chi-square
    _, p, _, _ = chi2_contingency(table, correction=False)
    return (float(p), "chi2")


def _homonym_guard(
    per_study_severity: dict[str, list[int]],
) -> tuple[bool, float | None, str | None]:
    """Return (flag_raw, p_raw, evidence).

    flag_raw is True when the raw p-value from the contingency test is below
    alpha (=0.05). BH-FDR across candidates happens later at the GET handler.
    If fewer than 2 studies pass the 10-finding n-min gate, returns
    (False, None, "insufficient_data: ...").
    """
    gated_studies = {
        sid: grades
        for sid, grades in per_study_severity.items()
        if len(grades) >= _HOMONYM_MIN_FINDINGS_PER_STUDY
    }
    if len(gated_studies) < 2:
        total = len(per_study_severity)
        gated = len(gated_studies)
        evidence = f"insufficient_data: {total - gated}/{total} studies below n_min=10"
        return (False, None, evidence)

    contingency = [_collapse_severity(grades) for grades in gated_studies.values()]
    p_raw, test_name = _fisher_or_chi2_p(contingency)
    if p_raw < _HOMONYM_ALPHA:
        evidence = f"severity_divergence: {test_name}_p_raw={p_raw:.4f}"
        return (True, p_raw, evidence)
    return (False, p_raw, None)


def evaluate_promotion_signal(
    raw_term: str,
    domain: str,
    organ_system: str | None,
    seen_in_studies: list[str],
    seen_in_cros: list[str] | None,
    per_study_severity_distributions: dict[str, list[int]],
    per_study_direction_hints: dict[str, str],
    total_loaded_studies: int,
    dictionary: dict | None = None,
) -> PromotionSignal:
    """Decide whether a raw term is promotable to a self-canonical candidate.

    See module docstring and Feature 3 in the synthesis for rationale.
    """
    n = max(1, int(total_loaded_studies))
    proportion_studies = len(seen_in_studies) / n
    distinct_cros = len({(c or "").strip() for c in (seen_in_cros or []) if c})
    cross_cro = distinct_cros >= 2

    base_threshold = max(3, math.ceil(0.10 * n)) / n
    cro_threshold = max(2, math.ceil(0.05 * n)) / n
    effective_threshold = cro_threshold if cross_cro else base_threshold
    promotable_by_freq = proportion_studies >= effective_threshold

    # Structural pre-check — regardless of frequency, a trivial formatting
    # variant of an existing canonical is not promotable; admin should alias.
    data = dictionary if dictionary is not None else _load_finding_synonyms_data()
    entries = ((data.get("domains") or {}).get(domain, {}) or {}).get("entries", {}) or {}
    structural_variant = _structural_variant_of(raw_term.upper().strip(), domain, entries)

    # Homonym guard — on the severity distributions passed in.
    homonym_flag, p_raw, evidence = _homonym_guard(per_study_severity_distributions)

    # Also reject if direction hints disagree across studies (at least one
    # "up" AND one "down" after stripping "flat" / None).
    directions = {
        d for d in per_study_direction_hints.values() if d in ("up", "down")
    }
    direction_conflict = {"up", "down"}.issubset(directions)
    if direction_conflict and not homonym_flag:
        homonym_flag = True
        evidence = (evidence + "; " if evidence else "") + "direction_divergence"

    rejection_reason = None
    if not promotable_by_freq:
        rejection_reason = "below_frequency_threshold"
    elif structural_variant is not None:
        rejection_reason = f"structural_variant_of:{structural_variant}"
    elif homonym_flag:
        rejection_reason = "homonym_flag"

    promotable = (
        promotable_by_freq
        and structural_variant is None
        and not homonym_flag
    )

    return PromotionSignal(
        promotable=promotable,
        proportion_studies=round(proportion_studies, 4),
        cross_cro=cross_cro,
        effective_threshold=round(effective_threshold, 6),
        structural_variant_of=structural_variant,
        homonym_flag=homonym_flag,
        homonym_p_raw=p_raw,
        homonym_p_adj=None,
        homonym_evidence=evidence,
        rejection_reason=rejection_reason,
    )


# ─── BH-FDR helper (applied at GET handler level) ──────────────────────────


def apply_bh_fdr(p_values: list[float | None], q: float = 0.05) -> list[float | None]:
    """Return BH-adjusted p-values preserving the input order.

    None entries pass through as None (excluded from the correction).
    Standard Benjamini-Hochberg procedure — rank, scale, cummin from the tail.
    """
    indexed = [(i, p) for i, p in enumerate(p_values) if p is not None]
    if not indexed:
        return list(p_values)
    indexed.sort(key=lambda ip: ip[1])  # type: ignore[arg-type]
    m = len(indexed)
    adj: list[float | None] = [None] * len(p_values)
    prev = 1.0
    for rank_from_tail, (orig_i, p) in enumerate(reversed(indexed), start=1):
        k = m - rank_from_tail + 1  # rank from small end (1..m)
        raw_adj = p * m / k  # type: ignore[operator]
        prev = min(prev, raw_adj)
        adj[orig_i] = min(1.0, prev)
    return adj
