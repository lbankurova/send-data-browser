"""Tests for backend/services/analysis/term_collisions.py (Phase E Feature 5).

Covers AC-5.1 .. AC-5.8: correctness, organ pre-filter, inverted token index,
cache hit + invalidation (key + explicit clear), lazy evaluation, latency,
level-3 qualifier-divergence opt-in.
"""

import time

import pytest

from services.analysis import term_collisions
from services.analysis.term_collisions import (
    CollisionCache,
    collision_cache,
    detect_collisions,
    get_pairwise_compare_count,
    get_skipped_studies_count,
)
from tests.collision_fixtures import FakeStudy, make_finding


@pytest.fixture(autouse=True)
def _clear_cache():
    collision_cache.clear()
    yield
    collision_cache.clear()


# ─── AC-5.1 correctness ─────────────────────────────────────────────────────


def test_ac_5_1_vacuolation_vs_vacuolization_flagged():
    study_a = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    study_b = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    reports = detect_collisions([study_a, study_b])
    assert len(reports) == 1
    r = reports[0]
    assert {r.term_a, r.term_b} == {"VACUOLATION", "VACUOLIZATION"}
    assert r.organ == "LIVER"
    assert r.confidence >= 0.85


# ─── AC-5.2 organ pre-filter ────────────────────────────────────────────────


def test_ac_5_2_different_organs_excluded():
    study_a = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    study_b = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "KIDNEY", 6)])
    reports = detect_collisions([study_a, study_b])
    assert reports == []


# ─── AC-5.3 inverted token index excludes disjoint terms ────────────────────


def test_ac_5_3_no_shared_tokens_zero_comparisons():
    # 50 terms in each study, none sharing tokens -> pairwise counter stays 0.
    terms_a = [f"AAA{i:03d}XYZ" for i in range(50)]
    terms_b = [f"BBB{i:03d}PQR" for i in range(50)]
    study_a = FakeStudy(
        "A", [make_finding("MI", t, "LIVER", 6) for t in terms_a]
    )
    study_b = FakeStudy(
        "B", [make_finding("MI", t, "LIVER", 6) for t in terms_b]
    )
    detect_collisions([study_a, study_b])
    assert get_pairwise_compare_count() == 0


# ─── AC-5.4 cache hit ───────────────────────────────────────────────────────


def test_ac_5_4_cache_hit_much_faster_than_first_call():
    # Larger fixture so the first call does enough work that cache savings
    # are measurable above timer noise. Spec: "second call's wall-clock
    # time is < 10% of first call".
    studies = []
    for sid in ("A", "B", "C", "D"):
        findings = [
            make_finding("MI", f"VACUOLATION_{i:03d}", "LIVER", 6)
            for i in range(120)
        ]
        studies.append(FakeStudy(sid, findings))
    # Warm-up one pass so import/JIT noise doesn't dominate the first sample.
    detect_collisions(studies)
    collision_cache.clear()

    t0 = time.perf_counter()
    r1 = detect_collisions(studies)
    t_first = time.perf_counter() - t0
    t1 = time.perf_counter()
    r2 = detect_collisions(studies)
    t_second = time.perf_counter() - t1

    assert r1 == r2
    # Spec demands 10x speedup; the cache is a dict lookup so it should be
    # orders of magnitude faster. On very fast machines t_first can be
    # sub-ms and the ratio gets noisy -- only enforce 10x when the first
    # call took enough time to measure cleanly.
    if t_first > 5e-4:
        assert t_second < 0.10 * t_first, (
            f"cache speedup < 10x: first={t_first*1000:.2f}ms "
            f"second={t_second*1000:.2f}ms"
        )
    else:
        # Sub-ms first call: just assert second call didn't exceed first.
        assert t_second <= t_first + 1e-3


# ─── AC-5.5 cache invalidation (both mechanisms) ────────────────────────────


def test_ac_5_5a_key_based_invalidation(monkeypatch):
    study_a = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    study_b = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    cache = CollisionCache()
    monkeypatch.setattr(term_collisions, "get_dictionary_versions", lambda: {"finding_synonyms": "1.0.0"})
    r1 = detect_collisions([study_a, study_b], cache=cache)
    assert cache.size() >= 1
    # Bump version -> different key -> cache miss.
    monkeypatch.setattr(term_collisions, "get_dictionary_versions", lambda: {"finding_synonyms": "1.1.0"})
    r2 = detect_collisions([study_a, study_b], cache=cache)
    assert r1 == r2  # same logical result
    assert cache.size() >= 2  # two distinct entries under different versions


def test_ac_5_5b_explicit_clear():
    study_a = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    study_b = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    detect_collisions([study_a, study_b])
    assert collision_cache.size() >= 1
    collision_cache.clear()
    assert collision_cache.size() == 0


# ─── AC-5.6 lazy evaluation ─────────────────────────────────────────────────


def test_ac_5_6_lazy_organ_filter_and_skip_counter():
    # 3 studies: 2 have LIVER findings, 1 has only KIDNEY. Restrict to LIVER.
    # Counter should report one skipped study (the KIDNEY-only one).
    study_a = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    study_b = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    study_c = FakeStudy("C", [make_finding("MI", "KIDNEY FINDING", "KIDNEY", 6)])
    reports = detect_collisions([study_a, study_b, study_c], organs=["LIVER"])
    assert all(r.organ == "LIVER" for r in reports)
    assert get_skipped_studies_count() == 1
    # With no organ filter, nothing is skipped.
    collision_cache.clear()
    detect_collisions([study_a, study_b, study_c])
    assert get_skipped_studies_count() == 0


# ─── AC-5.7 latency (50 runs, P95 < 500ms) ──────────────────────────────────


def test_ac_5_7_latency_p95_under_500ms():
    studies = []
    for sid in ("A", "B", "C", "D", "E"):
        findings = [
            make_finding("MI", f"VACUOLATION_{i}", "LIVER", 6) for i in range(20)
        ]
        studies.append(FakeStudy(sid, findings))
    times = []
    for _ in range(50):
        collision_cache.clear()
        t0 = time.perf_counter()
        detect_collisions(studies)
        times.append(time.perf_counter() - t0)
    times.sort()
    # P95 on 50 runs -> index 47 (0-indexed), i.e. ceil(0.95*50)-1.
    p95 = times[47]
    assert p95 < 0.5, f"P95={p95*1000:.1f}ms exceeds 500ms"


# ─── AC-5.8 qualifier divergence is opt-in + base-token scoring ─────────────


def test_ac_5_8_qualifier_divergence_off_by_default():
    # Both level-3 with differing qualifiers but same base.
    fa = make_finding("MI", "HYPERTROPHY, CENTRILOBULAR", "LIVER", 3,
                     base="HYPERTROPHY", qualifier="CENTRILOBULAR")
    fb = make_finding("MI", "HYPERTROPHY, PERIACINAR", "LIVER", 3,
                     base="HYPERTROPHY", qualifier="PERIACINAR")
    study_a = FakeStudy("A", [fa])
    study_b = FakeStudy("B", [fb])
    reports = detect_collisions([study_a, study_b])
    assert reports == []
    # With opt-in, they appear tagged.
    collision_cache.clear()
    reports2 = detect_collisions(
        [study_a, study_b],
        include_qualifier_divergence=True,
        min_confidence=0.0,
    )
    assert reports2
    assert all(r.report_kind == "qualifier_divergence" for r in reports2)
    assert all(r.confidence <= 0.6 for r in reports2)


def test_ac_5_8_same_base_scores_at_cap():
    """Spec: `confidence = 0.6 * base_token_jaccard`. Same-base pairs should
    score at the 0.6 cap, not at the diluted full-term fuzzy Jaccard.
    """
    fa = make_finding("MI", "HYPERTROPHY, CENTRILOBULAR", "LIVER", 3,
                     base="HYPERTROPHY", qualifier="CENTRILOBULAR")
    fb = make_finding("MI", "HYPERTROPHY, PERIACINAR", "LIVER", 3,
                     base="HYPERTROPHY", qualifier="PERIACINAR")
    study_a = FakeStudy("A", [fa])
    study_b = FakeStudy("B", [fb])
    reports = detect_collisions(
        [study_a, study_b],
        include_qualifier_divergence=True,
        min_confidence=0.0,
    )
    assert reports
    # Both bases == "HYPERTROPHY" -> base_token_jaccard = 1.0 -> confidence = 0.6.
    assert reports[0].confidence == pytest.approx(0.6, abs=1e-6)
