"""Tests for GET /api/xstudy/term-collisions (Phase E Feature 6 endpoint).

Exercises the route handler directly to avoid httpx dependency.
"""

import asyncio

import pytest
from fastapi import HTTPException

from routers import cross_study
from services.analysis import term_collisions as tc
from tests.collision_fixtures import FakeStudy, make_finding


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _clear_cache():
    tc.collision_cache.clear()
    yield
    tc.collision_cache.clear()


# ─── AC-6.1 / AC-6.4 ────────────────────────────────────────────────────────


def test_ac_6_1_endpoint_returns_collision(monkeypatch):
    sa = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    sb = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    monkeypatch.setattr(cross_study, "load_multiple_studies", lambda ids: [sa, sb])
    result = _run(cross_study.get_term_collisions(
        study_ids="A,B", organs=None, min_confidence=0.7, include_qualifier_divergence=0,
    ))
    assert len(result["collisions"]) == 1
    assert {result["collisions"][0]["term_a"], result["collisions"][0]["term_b"]} == {
        "VACUOLATION", "VACUOLIZATION"
    }
    assert "dictionary_version" in result
    assert result["computed_in_ms"] >= 0


# ─── AC-6.2 ─────────────────────────────────────────────────────────────────


def test_ac_6_2_fewer_than_two_studies_rejected():
    with pytest.raises(HTTPException) as exc:
        _run(cross_study.get_term_collisions(
            study_ids="A", organs=None, min_confidence=0.7,
            include_qualifier_divergence=0,
        ))
    assert exc.value.status_code == 400


# ─── AC-6.3 ─────────────────────────────────────────────────────────────────


def test_ac_6_3_min_confidence_filter(monkeypatch):
    sa = FakeStudy("A", [make_finding("MI", "VACUOLATION", "LIVER", 6)])
    sb = FakeStudy("B", [make_finding("MI", "VACUOLIZATION", "LIVER", 6)])
    monkeypatch.setattr(cross_study, "load_multiple_studies", lambda ids: [sa, sb])
    # Spec wording "min_confidence=0.9 filters the 0.85 case" assumed the
    # AC-5.1 pair would score exactly at the 0.85 floor; in practice the
    # fuzzy Jaccard + string similarity yield ~0.97 (well above 0.85 as
    # spec allows). Use a threshold above the observed confidence so the
    # filter behaviour is still asserted end-to-end.
    result = _run(cross_study.get_term_collisions(
        study_ids="A,B", organs=None, min_confidence=0.99,
        include_qualifier_divergence=0,
    ))
    assert result["collisions"] == []


# ─── AC-6.3a qualifier divergence opt-in ────────────────────────────────────


def test_ac_6_3a_qualifier_divergence_opt_in(monkeypatch):
    sa = FakeStudy("A", [make_finding("MI", "HYPERTROPHY, CENTRILOBULAR", "LIVER", 3,
                                       base="HYPERTROPHY", qualifier="CENTRILOBULAR")])
    sb = FakeStudy("B", [make_finding("MI", "HYPERTROPHY, PERIACINAR", "LIVER", 3,
                                       base="HYPERTROPHY", qualifier="PERIACINAR")])
    monkeypatch.setattr(cross_study, "load_multiple_studies", lambda ids: [sa, sb])
    # Default: no qualifier-divergence pairs.
    result_default = _run(cross_study.get_term_collisions(
        study_ids="A,B", organs=None, min_confidence=0.7,
        include_qualifier_divergence=0,
    ))
    assert result_default["collisions"] == []
    # With opt-in: pairs appear tagged.
    tc.collision_cache.clear()
    result_opt = _run(cross_study.get_term_collisions(
        study_ids="A,B", organs=None, min_confidence=0.0,
        include_qualifier_divergence=1,
    ))
    assert result_opt["collisions"]
    assert all(c["report_kind"] == "qualifier_divergence" for c in result_opt["collisions"])
    assert all(c["confidence"] <= 0.6 for c in result_opt["collisions"])
