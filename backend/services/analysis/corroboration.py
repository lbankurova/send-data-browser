"""Cross-domain corroboration — presence-based syndrome term matching.

This is presence-based corroboration only. Full syndrome scoring
(confidence levels, directional gates, magnitude floors, compound
required logic) remains in the frontend engine
(cross-domain-syndromes.ts). Do not assume backend results match
frontend syndrome detection — they serve different purposes.

The backend answers a narrow question per finding per sex:
"Does this finding have cross-domain support from other findings
in the same sex, according to any syndrome definition?"

**Quality gate**: Only treatment-related findings may serve as
corroborating evidence (via ``passes_corroboration_gate``). The finding
BEING corroborated does not need to pass the gate — only the supporting
evidence does. This prevents the system from boosting confidence with
findings it has already discounted (e.g., a p=0.21, treatment_related=False
finding should not corroborate a strong finding).

Status values:
- ``corroborated``:    ≥1 syndrome has ≥2 matched terms (from different
                       domains) including this finding, in the same sex,
                       where the supporting finding passes the quality gate
- ``uncorroborated``:  the finding matches syndrome term(s) but no other
                       terms in the same syndrome are met in this sex
                       (or all matches fail the quality gate)
- ``not_applicable``:  the finding doesn't match any syndrome term
                       definition (e.g., food consumption, unusual lab
                       analytes not in any syndrome)
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

from services.analysis.syndrome_definitions import SYNDROME_DEFINITIONS, CHAIN_DEFINITIONS

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Normalization helpers (ported from frontend normalizeLabel / containsWord)
# ---------------------------------------------------------------------------

_SEPARATOR_RE = re.compile(r"[_\-:,]")
_WHITESPACE_RE = re.compile(r"\s+")


def _normalize(label: str) -> str:
    """Lowercase, replace separators with space, collapse whitespace."""
    s = label.lower().strip()
    s = _SEPARATOR_RE.sub(" ", s)
    return _WHITESPACE_RE.sub(" ", s)


def _contains_word(text: str, term: str) -> bool:
    """Check if *term* appears as a whole word/phrase within *text* (both pre-normalized)."""
    escaped = re.escape(term)
    return bool(re.search(rf"(?:^|\s){escaped}(?:\s|$)", f" {text} "))


def passes_corroboration_gate(
    finding: dict,
    effect_threshold: float | None = None,
) -> bool:
    """Can this finding serve as corroborating evidence for another finding?

    Primary: treatment-related findings may corroborate.
    Secondary (when effect_threshold provided): findings with large effect
    sizes (max_effect_lower > threshold) may corroborate even if not yet
    classified as treatment-related. This catches the d=2.0, N=3, p=0.15
    scenario -- a real biological effect at small sample size that fails
    the p < 0.05 gate but has confident effect magnitude via gLower.

    For incidence endpoints (max_effect_lower is None because Cohen's h CI
    is degenerate at small N), the Boschloo/Fisher p-value provides the
    corroboration gate instead. See research/cohens-h-commensurability-analysis.md.

    The finding BEING corroborated does not need this gate -- only the
    supporting evidence does.
    """
    if finding.get("treatment_related", False) is True:
        return True
    # Effect-size gate: large confident effect can corroborate without p < 0.05
    if effect_threshold is not None:
        mel = finding.get("max_effect_lower")
        if mel is not None and mel > effect_threshold:
            return True
        # Incidence fallback: Boschloo/Fisher p-value (already min_p_adj for
        # incidence endpoints) when max_effect_lower is None
        if mel is None and finding.get("data_type") == "incidence":
            min_p = finding.get("min_p_adj")
            if min_p is not None and min_p < 0.05:
                return True
    return False


# ---------------------------------------------------------------------------
# Term matching (ported from frontend matchEndpoint in cross-domain-syndromes.ts)
# ---------------------------------------------------------------------------

def _match_finding(finding: dict, term: dict) -> bool:
    """Check if a backend finding dict matches a single syndrome term definition.

    Differences from the frontend ``matchEndpoint()``:
    - Backend findings have structured fields (``test_code``, ``specimen``,
      ``finding``, ``direction``) — no need to parse from ``endpoint_label``.
    - Specimen matching uses prefix strategy (``startswith``) instead of
      ``containsWord`` to respect SEND hierarchical specimen naming
      ("HEART", "HEART WITH AORTA"). The backend's ``organ_map.py`` already
      uses ``startswith()`` for the same reason.
    - Finding matching stays word-boundary (``containsWord``) since findings
      are free-text descriptions, not hierarchical.
    """
    # 1. Domain must match
    f_domain = finding.get("domain", "").upper()
    if f_domain != term["domain"]:
        return False

    # 2. Direction must match (if specified)
    if term["direction"] != "any":
        if finding.get("direction") != term["direction"]:
            return False

    # 3. Match by test code (LB, EG, VS domains — highest priority)
    test_codes = term.get("testCodes")
    if test_codes:
        f_test_code = (finding.get("test_code") or "").upper()
        if f_test_code and f_test_code in test_codes:
            return True

    # 4. Match by canonical label (exact after normalization)
    canonical_labels = term.get("canonicalLabels")
    if canonical_labels:
        # Use endpoint_label if available (enriched), else test_name
        label = finding.get("endpoint_label") or finding.get("test_name") or ""
        normalized = _normalize(label)
        if any(normalized == cl for cl in canonical_labels):
            return True

    # 5. Match by specimen + finding (MI/MA domain)
    specimen_terms = term.get("specimenTerms")
    if specimen_terms:
        f_specimen = finding.get("specimen")
        f_finding = finding.get("finding")
        if f_specimen and f_finding:
            norm_specimen = _normalize(f_specimen)
            norm_finding = _normalize(f_finding)
            # Specimen: prefix match (hierarchical SEND names)
            spec_list = specimen_terms.get("specimen", [])
            specimen_ok = (
                len(spec_list) == 0
                or any(norm_specimen.startswith(s) for s in spec_list)
            )
            # Finding: word-boundary match (free-text)
            finding_ok = any(
                _contains_word(norm_finding, f) for f in specimen_terms.get("finding", [])
            )
            if specimen_ok and finding_ok:
                return True

    # 6. Match by organ weight specimen (OM domain)
    organ_weight_terms = term.get("organWeightTerms")
    if organ_weight_terms:
        f_specimen = finding.get("specimen") or finding.get("test_name") or ""
        norm_specimen = _normalize(f_specimen)
        spec_list = organ_weight_terms.get("specimen", [])
        if len(spec_list) == 0 or any(norm_specimen.startswith(s) for s in spec_list):
            return True

    return False


# ---------------------------------------------------------------------------
# Corroboration pass
# ---------------------------------------------------------------------------

def _syndrome_expects_mixed_directions(syndrome: dict) -> bool:
    """Return True if this syndrome's terms specify BOTH 'up' and 'down'.

    Syndromes that explicitly list both directions (e.g., XS05: albumin↓ +
    globulin↑) expect directional diversity by design — the coherence check
    should not flag them.  Syndromes whose specified terms all point one way
    (plus some ``"any"`` terms) expect coherence.
    """
    specified = {t["direction"] for t in syndrome["terms"] if t["direction"] != "any"}
    return "up" in specified and "down" in specified


def _check_direction_coherence(
    finding: dict,
    my_term_indices: list[int],
    supporting_findings: list[tuple[dict, int]],
    syndrome: dict,
) -> bool:
    """SLA-16: Return True if direction coherence holds, False if contradictory.

    When a syndrome specifies a single direction (all specified terms are
    "up" OR all are "down"), any ``direction: "any"`` match whose *actual*
    finding direction opposes the expected direction is incoherent.

    If the syndrome explicitly expects mixed directions → always coherent.
    """
    if _syndrome_expects_mixed_directions(syndrome):
        return True  # mixed is expected by design

    # Determine the single expected direction from specified terms
    specified = {t["direction"] for t in syndrome["terms"] if t["direction"] != "any"}
    if not specified:
        # All terms are "any" — check for contradictory actual directions
        actual_dirs: set[str] = set()
        my_dir = finding.get("direction")
        if my_dir in ("up", "down"):
            actual_dirs.add(my_dir)
        for other_f, _ in supporting_findings:
            d = other_f.get("direction")
            if d in ("up", "down"):
                actual_dirs.add(d)
        return not ("up" in actual_dirs and "down" in actual_dirs)

    expected_dir = next(iter(specified))  # the single specified direction

    # Check this finding's actual direction vs expected
    my_dir = finding.get("direction")
    my_matched_via_any = any(
        syndrome["terms"][i]["direction"] == "any" for i in my_term_indices
    )
    if my_matched_via_any and my_dir in ("up", "down") and my_dir != expected_dir:
        return False

    # Check supporting findings matched via "any" terms
    for other_f, term_idx in supporting_findings:
        term = syndrome["terms"][term_idx]
        if term["direction"] == "any":
            other_dir = other_f.get("direction")
            if other_dir in ("up", "down") and other_dir != expected_dir:
                return False

    return True


def compute_corroboration(
    findings: list[dict],
    relrec_links: dict[tuple[str, str, int], list[tuple[str, int]]] | None = None,
    effect_threshold: float | None = None,
) -> list[dict]:
    """Add ``corroboration_status`` to each finding based on cross-domain evidence.

    Groups findings by sex, then for each finding:
    1. Checks if any syndrome term matches the finding.
    2. If matched, looks for cross-domain corroboration within the same sex
       (at least one OTHER term in the SAME syndrome matched by a DIFFERENT
       domain in the same sex).
    3. SLA-16: Validates directional coherence across matched findings.
    4. Sets ``corroboration_status`` on each finding.
    5. RELREC post-pass: if explicit pathologist-confirmed cross-domain linkages
       exist (from RELREC domain), upgrade to ``"corroborated"`` regardless of
       syndrome matching.

    Args:
        relrec_links: Optional map of (domain, seq) → [(linked_domain, linked_seq)].
            These are explicit record-level linkages from the RELREC domain.
        effect_threshold: When provided, findings with max_effect_lower above this
            value can serve as corroborating evidence even if not treatment_related.

    **No auto-downgrade**: ``severity`` is NOT modified. The frontend (and
    eventually the user) decides what to do with the flag.
    """
    # Index findings by sex for fast lookup
    by_sex: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        by_sex[f.get("sex", "")].append(f)

    for f in findings:
        sex = f.get("sex", "")
        sex_findings = by_sex[sex]

        # Track: does this finding match ANY term in ANY syndrome?
        matched_any_term = False
        # Track: is it corroborated by cross-domain evidence?
        is_corroborated = False
        # Track: corroborated but with directional incoherence?
        is_partially_corroborated = False

        for syndrome in SYNDROME_DEFINITIONS:
            # Which terms does THIS finding match?
            my_term_indices = []
            for i, term in enumerate(syndrome["terms"]):
                if _match_finding(f, term):
                    my_term_indices.append(i)

            if not my_term_indices:
                continue

            matched_any_term = True

            # Collect domains matched by THIS finding's terms
            my_domains = {syndrome["terms"][i]["domain"] for i in my_term_indices}

            # Check: do OTHER findings in same sex match OTHER terms
            # in this syndrome from a DIFFERENT domain?
            # Track which findings matched which terms (for direction check).
            other_domains_matched: set[str] = set()
            supporting: list[tuple[dict, int]] = []
            for other_f in sex_findings:
                if other_f is f:
                    continue
                if not passes_corroboration_gate(other_f, effect_threshold):
                    continue
                for j, term in enumerate(syndrome["terms"]):
                    if j in my_term_indices:
                        continue  # skip terms already matched by this finding
                    if term["domain"] in my_domains:
                        continue  # must be a different domain
                    if _match_finding(other_f, term):
                        other_domains_matched.add(term["domain"])
                        supporting.append((other_f, j))
                        break  # one match per other_f is enough

            if other_domains_matched:
                # SLA-16: direction coherence gate
                if _check_direction_coherence(f, my_term_indices, supporting, syndrome):
                    is_corroborated = True
                    break  # one fully corroborating syndrome is enough
                else:
                    is_partially_corroborated = True
                    # keep scanning — another syndrome may provide full corroboration

        if is_corroborated:
            f["corroboration_status"] = "corroborated"
        elif is_partially_corroborated:
            f["corroboration_status"] = "partially_corroborated"
        elif matched_any_term:
            f["corroboration_status"] = "uncorroborated"
        else:
            f["corroboration_status"] = "not_applicable"

    # RELREC post-pass: explicit pathologist-confirmed cross-domain links
    # upgrade corroboration_status unconditionally.  The A-2 gate in
    # classification.py prevents zero-signal findings from being promoted.
    if relrec_links:
        apply_relrec_corroboration(findings, relrec_links)

    return findings


def apply_relrec_corroboration(
    findings: list[dict],
    relrec_links: dict[tuple[str, str, int], list[tuple[str, int]]],
) -> None:
    """Upgrade corroboration_status for findings with explicit RELREC cross-domain links.

    A RELREC link means a pathologist explicitly connected two records at submission
    time — stronger evidence than statistical co-occurrence.  If a finding has a
    RELREC link to a record in a different domain, and both records exist in the
    findings list, set corroboration_status = "corroborated" on both.

    Keys in relrec_links are (domain, subject_id, seq) to handle per-subject SEQ scoping.
    """
    # Build finding lookup: (domain, subject_id, seq) → finding
    # Uses _relrec_subject_seqs which carries (subject_id, seq) pairs.
    subj_seq_to_finding: dict[tuple[str, str, int], dict] = {}
    for f in findings:
        domain = f.get("domain", "")
        subject_seqs = f.get("_relrec_subject_seqs")
        if subject_seqs:
            for subj_id, seq in subject_seqs:
                subj_seq_to_finding[(domain, subj_id, seq)] = f
        else:
            # Fallback for findings without _relrec_subject_seqs
            seqs = f.get("_relrec_seq")
            if seqs:
                for s in (seqs if isinstance(seqs, list) else [seqs]):
                    subj_seq_to_finding[(domain, "", s)] = f

    upgraded = 0
    for (src_domain, src_subj, src_seq), targets in relrec_links.items():
        src_finding = subj_seq_to_finding.get((src_domain, src_subj, src_seq))
        if src_finding is None:
            continue
        for tgt_domain, tgt_seq in targets:
            if tgt_domain == src_domain:
                continue  # must be cross-domain
            tgt_finding = subj_seq_to_finding.get((tgt_domain, src_subj, tgt_seq))
            if tgt_finding is None:
                continue
            # Both findings exist and are cross-domain — upgrade both.
            # Corroboration status is truthful: these ARE corroborated by
            # explicit pathologist linkage.  The A-2 gate in classification.py
            # prevents zero-signal findings from being promoted.
            for f in (src_finding, tgt_finding):
                if f.get("corroboration_status") != "corroborated":
                    f["corroboration_status"] = "corroborated"
                    f["_relrec_corroborated"] = True
                    upgraded += 1


# ---------------------------------------------------------------------------
# Cross-organ chain detection
# ---------------------------------------------------------------------------

def _step_matched(step: dict, findings: list[dict]) -> list[dict]:
    """Return findings that satisfy a chain step's criteria.

    A step can match via MI terms (specimen + finding), LB codes (test_code +
    direction), OM (specimen + direction), or BW (direction).
    """
    matched: list[dict] = []
    for f in findings:
        domain = f.get("domain", "").upper()

        # MI matching: specimen prefix + finding word-boundary
        mi_terms = step.get("mi_terms", [])
        mi_specimens = step.get("mi_specimen", [])
        if mi_terms and domain == "MI":
            f_specimen = _normalize(f.get("specimen") or "")
            f_finding = _normalize(f.get("finding") or "")
            specimen_ok = (
                not mi_specimens
                or any(f_specimen.startswith(s) for s in mi_specimens)
            )
            finding_ok = any(_contains_word(f_finding, _normalize(t)) for t in mi_terms)
            if specimen_ok and finding_ok:
                matched.append(f)
                continue

        # LB matching: test_code in lb_codes + direction
        lb_codes = step.get("lb_codes", [])
        if lb_codes and domain == "LB":
            f_code = (f.get("test_code") or "").upper()
            if f_code in lb_codes:
                lb_dir = step.get("lb_direction")
                if not lb_dir or f.get("direction") == lb_dir:
                    matched.append(f)
                    continue

        # OM matching: specimen prefix + direction
        om_specimen = step.get("om_specimen")
        if om_specimen and domain == "OM":
            f_specimen = _normalize(f.get("specimen") or f.get("test_name") or "")
            if f_specimen.startswith(om_specimen):
                om_dir = step.get("om_direction")
                if not om_dir or om_dir == "any" or f.get("direction") == om_dir:
                    matched.append(f)
                    continue

        # BW matching: direction only
        bw_dir = step.get("bw_direction")
        if bw_dir and domain == "BW":
            if f.get("direction") == bw_dir:
                matched.append(f)
                continue

    return matched


def compute_chain_detection(
    findings: list[dict],
    effect_threshold: float | None = None,
) -> list[dict]:
    """Annotate findings with cross-organ chain matches.

    For each chain definition, groups findings by sex and checks how many
    steps are satisfied. If >=2 steps match, participating findings get a
    ``chain_matches`` list entry with chain metadata.
    """
    if not CHAIN_DEFINITIONS:
        return findings

    by_sex: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        by_sex[f.get("sex", "")].append(f)

    for chain in CHAIN_DEFINITIONS:
        chain_id = chain["id"]
        chain_name = chain["name"]
        steps = chain["steps"]
        total_steps = len(steps)

        for sex, sex_findings in by_sex.items():
            # Only consider treatment-related or large-effect findings for chain evidence
            gated = [f for f in sex_findings if passes_corroboration_gate(f, effect_threshold)]

            steps_matched = 0
            participating: list[dict] = []

            for step in steps:
                step_hits = _step_matched(step, gated)
                if step_hits:
                    steps_matched += 1
                    participating.extend(step_hits)

            if steps_matched < 2:
                continue

            tier = chain.get("completeTier", "tier_2") if steps_matched == total_steps else chain.get("partialTier", "tier_3")
            match_info = {
                "chain_id": chain_id,
                "chain_name": chain_name,
                "steps_matched": steps_matched,
                "steps_total": total_steps,
                "tier": tier,
            }

            # Annotate all participating findings (deduplicated)
            seen_ids = set()
            for f in participating:
                fid = id(f)
                if fid in seen_ids:
                    continue
                seen_ids.add(fid)
                if "chain_matches" not in f:
                    f["chain_matches"] = []
                # Avoid duplicate chain entries on the same finding
                if not any(cm["chain_id"] == chain_id for cm in f["chain_matches"]):
                    f["chain_matches"].append(match_info)

    return findings
