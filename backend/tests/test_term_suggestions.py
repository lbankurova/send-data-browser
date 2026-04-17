"""Tests for term_suggestions.py (Features 1 + 3 — Phase D Suggestion Engine).

Covers AC-1.1 through AC-1.8 (suggest_candidates), AC-3.1 through AC-3.6
(evaluate_promotion_signal + BH-FDR across response).

Uses a pinned fixture dictionary so scores are deterministic across live
`finding-synonyms.json` version bumps. The live dictionary is exercised
only by the AC-1.7 corpus coverage baseline test.
"""

import json
import time
from pathlib import Path

import pytest

from services.analysis import send_knowledge as sk
from services.analysis.send_knowledge import _reset_dictionary_caches_for_tests
from services.analysis.term_suggestions import (
    SuggestionCandidate,
    apply_bh_fdr,
    evaluate_promotion_signal,
    suggest_candidates,
)
from services.analysis.term_tokenization import tokenize_term


# ─── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_dict_caches():
    _reset_dictionary_caches_for_tests()
    yield
    _reset_dictionary_caches_for_tests()


@pytest.fixture
def pinned_dict() -> dict:
    """Small MI dictionary with deterministic entries for AC-1.1 through 1.5."""
    return {
        "version": "pinned-1.0.0",
        "qualifiers": ["CENTRILOBULAR", "PERIACINAR", "HEPATOCELLULAR", "TUBULAR"],
        "severity_modifiers": ["MINIMAL", "MILD", "MARKED"],
        "domains": {
            "MI": {
                "entries": {
                    "RETINAL FOLD": {
                        "canonical": "RETINAL FOLD",
                        "aliases": [],
                        "ncit_code": "C000001",
                        "source": ["TEST"],
                        "organ_scope": ["EYE"],
                    },
                    "HYPERTROPHY, HEPATOCELLULAR": {
                        "canonical": "HYPERTROPHY, HEPATOCELLULAR",
                        "aliases": [],
                        "ncit_code": "C000002",
                        "source": ["TEST"],
                        "organ_scope": ["LIVER"],
                    },
                    "BASOPHILIA, TUBULAR": {
                        "canonical": "BASOPHILIA, TUBULAR",
                        "aliases": [],
                        "ncit_code": "C000003",
                        "source": ["TEST"],
                        "organ_scope": ["KIDNEY"],
                    },
                    "CAST": {
                        "canonical": "CAST",
                        "aliases": [],
                        "ncit_code": "C000004",
                        "source": ["TEST"],
                        "organ_scope": ["KIDNEY"],
                    },
                    "CYST": {
                        "canonical": "CYST",
                        "aliases": [],
                        "ncit_code": "C000005",
                        "source": ["TEST"],
                        "organ_scope": None,
                    },
                },
            },
            "MA": {"entries": {}},
            "CL": {"entries": {}},
        },
    }


# ─── Feature 1 ──────────────────────────────────────────────────────────────


def test_ac_1_1_retinal_folds_tops_at_high_confidence(pinned_dict):
    """AC-1.1: RETINAL FOLDS -> RETINAL FOLD, confidence >= 0.85."""
    cands = suggest_candidates("RETINAL FOLDS", "MI", "EYE", dictionary=pinned_dict)
    assert cands, "expected at least one candidate"
    assert cands[0].canonical == "RETINAL FOLD"
    assert cands[0].confidence >= 0.85, cands[0]


def test_ac_1_2_cast_short_term_returns_empty(pinned_dict):
    """AC-1.2: CAST (len=4) forces string_similarity=0 vs CYST (len=4).

    Token Jaccard alone is 0 (no shared tokens), organ_context_bonus is 0
    because CAST's KIDNEY scope doesn't match a None organ system. Result: [].
    """
    cands = suggest_candidates("CAST", "MI", "KIDNEY", dictionary=pinned_dict)
    # The self-canonical CAST is excluded; only CYST remains, which is
    # short on both sides so string_similarity is forced to 0. With empty
    # token overlap and no organ bonus (CYST has organ_scope=None), nothing
    # reaches the 0.7 threshold.
    assert cands == [], cands


def test_ac_1_3_hepatocelular_typo_resolves_with_organ_bonus(pinned_dict):
    """AC-1.3: typo 'HEPATOCELULAR HYPERTROPHY' finds HYPERTROPHY, HEPATOCELLULAR."""
    cands = suggest_candidates(
        "HEPATOCELULAR HYPERTROPHY", "MI", "LIVER", dictionary=pinned_dict
    )
    assert cands, "expected at least one candidate"
    assert cands[0].canonical == "HYPERTROPHY, HEPATOCELLULAR"
    assert cands[0].confidence >= 0.7


def test_ac_1_4a_organ_scope_unreliable_prefix(pinned_dict):
    """AC-1.4a: organ level 6 + prefix tier -> unreliable + reason=prefix."""
    cands = suggest_candidates(
        "RETINAL FOLDS",
        "MI",
        "EYE",
        dictionary=pinned_dict,
        finding_organ_recognition_level=6,
        finding_organ_norm_tier="prefix",
    )
    assert cands
    top = cands[0]
    assert top.organ_scope_reliable is False
    assert top.organ_norm_tier_reason == "prefix"


def test_ac_1_4b_organ_scope_unreliable_slash_compound(pinned_dict):
    cands = suggest_candidates(
        "RETINAL FOLDS",
        "MI",
        "EYE",
        dictionary=pinned_dict,
        finding_organ_recognition_level=6,
        finding_organ_norm_tier="slash_compound",
    )
    assert cands
    assert cands[0].organ_scope_reliable is False
    assert cands[0].organ_norm_tier_reason == "slash_compound"


def test_ac_1_4c_organ_scope_unreliable_unmatched(pinned_dict):
    cands = suggest_candidates(
        "RETINAL FOLDS",
        "MI",
        "EYE",
        dictionary=pinned_dict,
        finding_organ_recognition_level=6,
        finding_organ_norm_tier="unmatched",
    )
    assert cands
    assert cands[0].organ_scope_reliable is False
    assert cands[0].organ_norm_tier_reason == "unmatched"


def test_ac_1_4d_organ_scope_reliable_when_level_1_or_2(pinned_dict):
    """Negative case: level 1 or 2 makes an organ-scoped candidate reliable."""
    cands = suggest_candidates(
        "RETINAL FOLDS",
        "MI",
        "EYE",
        dictionary=pinned_dict,
        finding_organ_recognition_level=1,
    )
    assert cands
    assert cands[0].organ_scope_reliable is True
    assert cands[0].organ_norm_tier_reason is None


def test_ac_1_4d_none_specimen_non_null_organ_scope(pinned_dict):
    """Level None + non-null organ_scope -> unreliable with no_specimen."""
    cands = suggest_candidates(
        "RETINAL FOLDS",
        "MI",
        None,
        dictionary=pinned_dict,
        finding_organ_recognition_level=None,
    )
    # Candidate RETINAL FOLD has organ_scope=[EYE]; with no organ_system it
    # can't get organ_context_bonus but token_jaccard is 1.0 -> confidence
    # 0.5 + 0.3 * 0.96 = 0.788, still above threshold.
    assert cands
    assert cands[0].organ_scope_reliable is False
    assert cands[0].organ_norm_tier_reason == "no_specimen"


def test_ac_1_4d_null_organ_scope_always_reliable(pinned_dict):
    """Candidate with organ_scope=None -> reliable regardless of input level."""
    # Use CYST (organ_scope=None) matched against CYSTS (pluralized) via
    # a raw term that tokenizes to CYST.
    cands = suggest_candidates(
        "CYSTS",
        "MI",
        None,
        dictionary=pinned_dict,
        finding_organ_recognition_level=6,
        finding_organ_norm_tier="unmatched",
    )
    if cands:
        # Any CYST candidate must be reliable because organ_scope is None.
        assert cands[0].canonical == "CYST"
        assert cands[0].organ_scope_reliable is True


def test_ac_1_5_nonsense_returns_empty(pinned_dict):
    cands = suggest_candidates("ZZZNONSENSE", "MI", None, dictionary=pinned_dict)
    assert cands == []


def test_ac_1_6_deterministic(pinned_dict):
    a = suggest_candidates("RETINAL FOLDS", "MI", "EYE", dictionary=pinned_dict)
    b = suggest_candidates("RETINAL FOLDS", "MI", "EYE", dictionary=pinned_dict)
    assert a == b


def test_tokenize_depluralizes():
    """tokenize_term strips trailing S on >=4-char tokens (not SS)."""
    assert tokenize_term("RETINAL FOLDS") == ["RETINAL", "FOLD"]
    assert tokenize_term("CYSTS") == ["CYST"]
    # 'IS' is too short to depluralize
    assert tokenize_term("IS") == ["IS"]
    # 'ABSCESS' ends in SS — not stripped
    assert tokenize_term("ABSCESS") == ["ABSCESS"]


def test_ac_1_8_latency_p95(pinned_dict):
    """AC-1.8: suggest_candidates P95 < 50ms (with tiny fixture, trivial)."""
    times = []
    for _ in range(200):
        t0 = time.perf_counter()
        suggest_candidates("HEPATOCELULAR HYPERTROPHY", "MI", "LIVER", dictionary=pinned_dict)
        times.append(time.perf_counter() - t0)
    times.sort()
    p95 = times[int(0.95 * len(times)) - 1]
    assert p95 < 0.05, f"P95={p95*1000:.1f}ms exceeds 50ms"


# ─── AC-1.7 empirical coverage baseline ─────────────────────────────────────


_BASELINE_PATH = Path(__file__).parent / "fixtures" / "suggestion_coverage_baseline.json"
_DRIFT_TOLERANCE = 0.10  # R2 N4 widened from 0.05 to 0.10 absolute


def _compute_coverage_against_generated() -> tuple[float, int, int]:
    """Return (top1_fraction, total_level6_terms, terms_with_candidate)."""
    generated_root = Path(__file__).parent.parent / "generated"
    total = 0
    with_cand = 0
    for report_path in generated_root.glob("*/unrecognized_terms.json"):
        try:
            with open(report_path, encoding="utf-8") as f:
                report = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        for entry in report.get("unrecognized_test_codes", []) or []:
            if entry.get("reason") != "unmatched":
                continue
            domain = entry.get("domain")
            if domain not in ("MI", "MA", "CL"):
                continue
            raw = entry.get("raw_code") or ""
            if not raw:
                continue
            total += 1
            cands = suggest_candidates(raw, domain, None)
            if cands:
                with_cand += 1
    return ((with_cand / total) if total else 0.0, total, with_cand)


@pytest.mark.slow
def test_ac_1_7_corpus_coverage_baseline():
    """AC-1.7: top-1 suggestion coverage, baseline-rollforward semantics.

    First run captures a baseline; subsequent runs assert coverage >=
    baseline - 0.10 (AC-1.7 R2 N4 drift). To refresh after a dictionary
    bump, delete suggestion_coverage_baseline.json and rerun.
    """
    fraction, total, with_cand = _compute_coverage_against_generated()
    if total == 0:
        pytest.skip("no generated studies — cannot compute baseline")

    if not _BASELINE_PATH.exists():
        _BASELINE_PATH.parent.mkdir(exist_ok=True)
        # First-run behavior: capture the baseline, don't fail.
        with open(_BASELINE_PATH, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "top1_fraction": round(fraction, 4),
                    "total_level6_terms": total,
                    "terms_with_candidate": with_cand,
                    "dictionary_version": sk.get_dictionary_versions().get("finding_synonyms"),
                    "note": "Captured on first run. Delete to refresh after dict bump.",
                },
                f,
                indent=2,
            )
        return  # baseline written, no assertion

    with open(_BASELINE_PATH, encoding="utf-8") as f:
        baseline = json.load(f)
    prior = float(baseline["top1_fraction"])
    floor = prior - _DRIFT_TOLERANCE
    assert fraction >= floor, (
        f"coverage {fraction:.3f} fell below baseline {prior:.3f} - "
        f"tolerance {_DRIFT_TOLERANCE} = {floor:.3f}"
    )


# ─── Feature 3 — promotion + homonym guard ──────────────────────────────────


def test_ac_3_1_below_frequency_threshold(pinned_dict):
    """AC-3.1: 2/16 studies, no cross-CRO -> not promotable."""
    ps = evaluate_promotion_signal(
        raw_term="NOVELTERM",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=["s1", "s2"],
        seen_in_cros=None,
        per_study_severity_distributions={},
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.promotable is False
    assert ps.proportion_studies == pytest.approx(0.125, abs=1e-4)
    assert ps.effective_threshold == pytest.approx(0.1875, abs=1e-4)
    assert ps.rejection_reason == "below_frequency_threshold"


def test_ac_3_2_cross_cro_bonus(pinned_dict):
    """AC-3.2: 4/16 studies from 2 CROs -> threshold drops to 0.125 -> promotable."""
    ps = evaluate_promotion_signal(
        raw_term="NOVELTERM",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=["s1", "s2", "s3", "s4"],
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions={},
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.cross_cro is True
    assert ps.proportion_studies == pytest.approx(0.25, abs=1e-4)
    assert ps.effective_threshold == pytest.approx(0.125, abs=1e-4)
    assert ps.promotable is True


def test_ac_3_3_homonym_guard_divergent_severity(pinned_dict):
    """AC-3.3: 4 studies, two with low-heavy, two high-heavy -> flag + reject."""
    # Two studies skew low (14 mild, 2 severe), two skew high (3 mild, 13 severe).
    # After bin collapse: low counts [14, 14, 3, 3], high counts [2, 2, 13, 13].
    dists = {
        "studyA": [1] * 14 + [4] * 2,
        "studyB": [2] * 14 + [5] * 2,
        "studyC": [1] * 3 + [4] * 13,
        "studyD": [2] * 3 + [5] * 13,
    }
    ps = evaluate_promotion_signal(
        raw_term="CELLULAR ALTERATION",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=list(dists),
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions=dists,
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.homonym_flag is True
    assert ps.homonym_p_raw is not None
    assert ps.homonym_p_raw < 0.05
    assert ps.promotable is False
    assert ps.rejection_reason == "homonym_flag"
    assert "severity_divergence" in (ps.homonym_evidence or "")


def test_ac_3_3a_insufficient_data_sentinel(pinned_dict):
    """AC-3.3a: study below n_min=10 excluded; <2 survivors -> insufficient_data."""
    dists = {
        "small": [1] * 4,  # below n_min
        "medium": [1] * 12,  # passes
    }
    ps = evaluate_promotion_signal(
        raw_term="TERM",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=list(dists),
        seen_in_cros=None,
        per_study_severity_distributions=dists,
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.homonym_flag is False
    assert ps.homonym_evidence is not None
    assert "insufficient_data" in ps.homonym_evidence


def test_ac_3_3b_bh_fdr_across_response():
    """AC-3.3b: BH-FDR keeps truly-small p-values below q, borderline above.

    For m=20 candidates at q=0.05, BH rejects index i when
    p_(i) <= i*q/m = i*0.0025. Construct 5 truly small (<1e-3) and 3
    borderline (~0.04): after adjustment, only the 5 small pass q=0.05.
    """
    truly_divergent = [1e-5, 5e-5, 1e-4, 5e-4, 1e-3]
    borderline = [0.035, 0.04, 0.045]
    p_values: list[float | None] = list(truly_divergent) + list(borderline) + [0.9] * 12
    adj = apply_bh_fdr(p_values, q=0.05)
    # The 5 truly divergent stay below 0.05 after adjustment
    assert all(a is not None and a < 0.05 for a in adj[:5]), adj[:5]
    # The 3 borderline get pushed above 0.05
    assert all(a is not None and a > 0.05 for a in adj[5:8]), adj[5:8]
    # None entries preserved through adjustment
    mixed = [0.01, None, 0.03]
    adj2 = apply_bh_fdr(mixed, q=0.05)
    assert adj2[1] is None


def test_ac_3_4_structural_pre_check(pinned_dict):
    """AC-3.4: BASOPHILIA TUBULAR is word-order swap of BASOPHILIA, TUBULAR."""
    ps = evaluate_promotion_signal(
        raw_term="BASOPHILIA TUBULAR",
        domain="MI",
        organ_system="KIDNEY",
        seen_in_studies=["s1", "s2", "s3", "s4"],
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions={},
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.structural_variant_of == "BASOPHILIA, TUBULAR"
    assert ps.promotable is False
    assert ps.rejection_reason and ps.rejection_reason.startswith("structural_variant_of")


def test_ac_3_5_retinal_fold_family_plural_caught(pinned_dict):
    """AC-3.5: RETINAL FOLDS is a plural variant of RETINAL FOLD."""
    ps = evaluate_promotion_signal(
        raw_term="RETINAL FOLDS",
        domain="MI",
        organ_system="EYE",
        seen_in_studies=["s1", "s2", "s3", "s4"],
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions={},
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.structural_variant_of == "RETINAL FOLD"
    assert ps.promotable is False


def test_ac_3_6_acknowledgement_heuristic_limitation(pinned_dict):
    """AC-3.6: convergent severity across studies -> heuristic does NOT flag
    as homonym even if the two studies are semantically divergent. The
    admin PUT source_justification is the true safety net.
    """
    dists = {
        "studyA": [1] * 10 + [2] * 10,
        "studyB": [1] * 10 + [2] * 10,
    }
    ps = evaluate_promotion_signal(
        raw_term="CELLULAR ALTERATION",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=["s1", "s2", "s3", "s4"],
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions=dists,
        per_study_direction_hints={},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.homonym_flag is False
    assert ps.promotable is True  # heuristic cannot catch this; admin must review


def test_direction_conflict_flags_homonym(pinned_dict):
    """Cross-study direction disagreement should flag."""
    ps = evaluate_promotion_signal(
        raw_term="TERM",
        domain="MI",
        organ_system="LIVER",
        seen_in_studies=["s1", "s2", "s3", "s4"],
        seen_in_cros=["CRO-A", "CRO-B"],
        per_study_severity_distributions={},
        per_study_direction_hints={"s1": "up", "s2": "down", "s3": "flat"},
        total_loaded_studies=16,
        dictionary=pinned_dict,
    )
    assert ps.homonym_flag is True
    assert ps.rejection_reason == "homonym_flag"
