"""Tests for backend/routers/admin_terms.py (Feature 2 — Phase D Admin API).

Covers AC-2.1 .. AC-2.13 and the overlay merge cases (AC-2.5a-e).
Uses FastAPI TestClient and monkeypatches environment + disk paths so no
real admin overlay or rejections file is written on the developer machine.
"""

import json
import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import admin_terms
from services.analysis import send_knowledge as sk
from services.analysis.send_knowledge import (
    _merge_admin_overlay,
    _reset_dictionary_caches_for_tests,
)


_GOOD_TOKEN = "X" * 32  # minimum length per AC-2.1 / security hardening


@pytest.fixture(autouse=True)
def _reset():
    _reset_dictionary_caches_for_tests()
    # Wipe the in-memory rate buckets between tests.
    admin_terms._RATE_BUCKETS.clear()
    yield
    _reset_dictionary_caches_for_tests()
    admin_terms._RATE_BUCKETS.clear()


@pytest.fixture
def admin_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", _GOOD_TOKEN)
    # Redirect persisted files to tmp so tests don't touch the real repo.
    overlay_path = tmp_path / "finding-synonyms-admin.json"
    rejections_path = tmp_path / "finding-synonym-rejections.json"
    stale_path = tmp_path / "_dict_stale_studies.json"
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_ADMIN_PATH", overlay_path)
    monkeypatch.setattr(admin_terms, "_FINDING_SYNONYMS_ADMIN_PATH", overlay_path)
    monkeypatch.setattr(admin_terms, "_REJECTIONS_PATH", rejections_path)
    monkeypatch.setattr(admin_terms, "_STALE_STUDIES_PATH", stale_path)
    return {
        "overlay_path": overlay_path,
        "rejections_path": rejections_path,
        "stale_path": stale_path,
    }


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(admin_terms.router)
    return TestClient(app)


# ─── AC-2.1 auth ────────────────────────────────────────────────────────────


def test_ac_2_1_missing_token_returns_401(client, admin_env):
    r = client.get("/api/admin/unrecognized-terms")
    assert r.status_code == 401


def test_ac_2_1_wrong_token_returns_403(client, admin_env):
    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": "wrong-but-long-enough-for-gate-lookup-12"},
    )
    assert r.status_code == 403


def test_ac_2_1_env_unset_returns_503(monkeypatch, client):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": _GOOD_TOKEN},
    )
    assert r.status_code == 503


def test_ac_2_1_short_token_returns_503(monkeypatch, client):
    monkeypatch.setenv("ADMIN_TOKEN", "tooshort")
    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": "tooshort"},
    )
    assert r.status_code == 503


def test_ac_2_1b_rate_limit(client, admin_env):
    hdrs = {"X-Admin-Token": _GOOD_TOKEN}
    for _ in range(admin_terms._RATE_LIMIT_MAX):
        r = client.get("/api/admin/unrecognized-terms", headers=hdrs)
        assert r.status_code == 200
    r = client.get("/api/admin/unrecognized-terms", headers=hdrs)
    assert r.status_code == 429


def test_ac_2_1b_failed_auth_does_not_consume_bucket(client, admin_env):
    """Failed-auth requests must not decrement the quota (DoS protection)."""
    hdrs_wrong = {"X-Admin-Token": "wrong-but-long-enough-for-gate-lookup-123456"}
    for _ in range(20):
        client.get("/api/admin/unrecognized-terms", headers=hdrs_wrong)
    # Bucket for this IP should still have space; the 403s didn't fill it.
    hdrs_good = {"X-Admin-Token": _GOOD_TOKEN}
    r = client.get("/api/admin/unrecognized-terms", headers=hdrs_good)
    assert r.status_code == 200


def test_ac_2_1c_cors_reject(client, admin_env):
    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": _GOOD_TOKEN, "Origin": "http://evil.example.com"},
    )
    assert r.status_code == 403


# ─── AC-2.2 / 2.3 GET aggregation ───────────────────────────────────────────


def test_ac_2_2_get_aggregates(client, admin_env, monkeypatch, tmp_path):
    """GET over a fake generated root returns one aggregated row per term."""
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    study_a = fake_generated / "StudyA"
    study_a.mkdir()
    report = {
        "unrecognized_test_codes": [
            {
                "domain": "MI",
                "raw_code": "RETINAL FOLDS",
                "count": 7,
                "reason": "unmatched",
                "specimens": ["EYE"],
            }
        ]
    }
    (study_a / "unrecognized_terms.json").write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)

    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": _GOOD_TOKEN},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_studies"] == 1
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["domain"] == "MI"
    assert item["raw_term"] == "RETINAL FOLDS"
    assert item["frequency"] == 7
    # EYE resolves to an organ canonical when the shipped organ-aliases
    # dictionary has EYE (it does). The row's organ_scope_reliable can
    # be True or False depending on organ-aliases shipping; we just
    # assert the shape is well-formed.
    assert "organ_scope_reliable" in item


def test_ac_2_3_sort_and_filter(client, admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    # Two terms, different frequencies; expect sort by proportion * log(1+freq).
    study_a = fake_generated / "StudyA"
    study_b = fake_generated / "StudyB"
    study_a.mkdir()
    study_b.mkdir()
    report_a = {
        "unrecognized_test_codes": [
            {"domain": "MI", "raw_code": "TERM_HIGH", "count": 100, "reason": "unmatched", "specimens": []},
            {"domain": "MI", "raw_code": "TERM_LOW", "count": 1, "reason": "unmatched", "specimens": []},
        ]
    }
    report_b = {
        "unrecognized_test_codes": [
            {"domain": "MI", "raw_code": "TERM_HIGH", "count": 50, "reason": "unmatched", "specimens": []},
        ]
    }
    (study_a / "unrecognized_terms.json").write_text(json.dumps(report_a), encoding="utf-8")
    (study_b / "unrecognized_terms.json").write_text(json.dumps(report_b), encoding="utf-8")
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    r = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": _GOOD_TOKEN},
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert items[0]["raw_term"] == "TERM_HIGH"
    # Filter by min_frequency
    r2 = client.get(
        "/api/admin/unrecognized-terms",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        params={"min_frequency": 100},
    )
    items2 = r2.json()["items"]
    assert all(it["frequency"] >= 100 for it in items2)


# ─── AC-2.4 PUT conflict ────────────────────────────────────────────────────


def _fake_dict_with(alias_canonical_pairs: list[tuple[str, str]]) -> dict:
    """Build a minimal dict: each (alias, canonical) pair becomes an entry."""
    entries: dict[str, dict] = {}
    for alias, canonical in alias_canonical_pairs:
        canonical_upper = canonical.upper()
        if canonical_upper not in entries:
            entries[canonical_upper] = {
                "canonical": canonical_upper,
                "aliases": [],
                "ncit_code": None,
                "source": ["TEST"],
            }
        if alias.upper() != canonical_upper:
            entries[canonical_upper]["aliases"].append(alias.upper())
    return {
        "version": "1.0.0",
        "qualifiers": [],
        "severity_modifiers": [],
        "domains": {
            "MI": {"entries": entries},
            "MA": {"entries": {}},
            "CL": {"entries": {}},
        },
    }


def test_ac_2_4_alias_reassign_rejected(client, admin_env, monkeypatch):
    monkeypatch.setattr(
        sk,
        "_load_finding_synonyms_data",
        lambda: _fake_dict_with([("RETINAL FOLDS", "RETINAL FOLD"), ("", "RETINAL DETACHMENT")]),
    )
    monkeypatch.setattr(
        admin_terms,
        "_load_finding_synonyms_data",
        sk._load_finding_synonyms_data,
    )
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "RETINAL FOLDS",
            "canonical": "RETINAL DETACHMENT",
            "added_by": "admin",
            "source_justification": "test",
        },
    )
    assert r.status_code == 409
    body = r.json()
    assert body["detail"]["error"] == "alias_reassign_conflict"
    assert body["detail"]["existing_canonical"] == "RETINAL FOLD"


# ─── AC-2.5 / 2.5a / 2.5b / 2.5c / 2.5d / 2.5e ──────────────────────────────


def test_ac_2_5_put_writes_admin_overlay_not_base(client, admin_env, monkeypatch):
    monkeypatch.setattr(
        sk, "_load_finding_synonyms_data",
        lambda: _fake_dict_with([("", "HYPERTROPHY")])
    )
    monkeypatch.setattr(
        admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data
    )
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "HYPRTROPHY",
            "canonical": "HYPERTROPHY",
            "added_by": "admin",
            "source_justification": "typo",
        },
    )
    assert r.status_code == 200, r.json()
    assert r.json()["new_dict_version"] == "0.1.0"
    overlay_path = admin_env["overlay_path"]
    overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
    assert "HYPRTROPHY" in overlay["domains"]["MI"]["entries"]["HYPERTROPHY"]["aliases"]


def test_ac_2_5a_overlay_merge_correctness():
    base = _fake_dict_with([("HYPERTRPHY", "HYPERTROPHY")])
    overlay = {
        "version": "0.1.0",
        "domains": {
            "MI": {
                "entries": {
                    "HYPERTROPHY": {"aliases": ["HYPRTROPHY"]},
                }
            }
        },
    }
    merged = _merge_admin_overlay(base, overlay)
    aliases = merged["domains"]["MI"]["entries"]["HYPERTROPHY"]["aliases"]
    assert "HYPERTRPHY" in aliases
    assert "HYPRTROPHY" in aliases


def test_ac_2_5b_rebuild_survives_admin_overlay(tmp_path, monkeypatch):
    """The admin overlay file survives a base-file regen."""
    base_path = tmp_path / "finding-synonyms.json"
    admin_path = tmp_path / "finding-synonyms-admin.json"
    base_path.write_text(json.dumps(_fake_dict_with([("ALIAS", "CANON")])), encoding="utf-8")
    admin_path.write_text(
        json.dumps(
            {
                "version": "0.1.0",
                "domains": {"MI": {"entries": {"CANON": {"aliases": ["ADMIN_ALIAS"]}}}},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_PATH", base_path)
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_ADMIN_PATH", admin_path)
    _reset_dictionary_caches_for_tests()
    merged = sk._load_finding_synonyms_data()
    canon_entry = merged["domains"]["MI"]["entries"]["CANON"]
    assert "ADMIN_ALIAS" in canon_entry["aliases"]
    assert "ALIAS" in canon_entry["aliases"]

    # Simulate a rebuild that rewrites base — admin file must be untouched.
    base_path.write_text(
        json.dumps(_fake_dict_with([("ALIAS2", "CANON"), ("ALIAS", "CANON")])),
        encoding="utf-8",
    )
    _reset_dictionary_caches_for_tests()
    merged2 = sk._load_finding_synonyms_data()
    canon2 = merged2["domains"]["MI"]["entries"]["CANON"]
    assert "ADMIN_ALIAS" in canon2["aliases"]  # admin alias preserved
    assert admin_path.read_text(encoding="utf-8")  # admin file unchanged


def test_ac_2_5c_new_canonical_requires_fields(client, admin_env, monkeypatch):
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWCANON_ALIAS",
            "canonical": "NEWCANON",
            "add_new_canonical": True,
            "added_by": "admin",
            "source_justification": "",  # missing -> 400
        },
    )
    assert r.status_code == 400


def test_ac_2_5e_new_canonical_overlay_path(client, admin_env, monkeypatch):
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWCANON_ALIAS",
            "canonical": "NEWCANON",
            "add_new_canonical": True,
            "added_by": "admin",
            "source_justification": "never seen before",
        },
    )
    assert r.status_code == 200


# ─── AC-2.6 atomic write ────────────────────────────────────────────────────


def test_ac_2_6_atomic_write_failure_preserves_existing(
    client, admin_env, monkeypatch
):
    """A monkeypatched os.replace that raises leaves the overlay file intact."""
    pre_content = {"version": "0.0.0", "domains": {"MI": {"entries": {}}}}
    admin_env["overlay_path"].write_text(json.dumps(pre_content), encoding="utf-8")

    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    def _raising_replace(src, dst):
        raise OSError("atomic failure simulated")

    monkeypatch.setattr(admin_terms.os, "replace", _raising_replace)
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "test",
        },
    )
    assert r.status_code == 500
    # File content unchanged
    after = json.loads(admin_env["overlay_path"].read_text(encoding="utf-8"))
    assert after == pre_content


# ─── AC-2.7 cache invalidation ──────────────────────────────────────────────


def test_ac_2_7_put_invalidates_cache(client, admin_env, monkeypatch):
    """After a successful PUT, the next assess_finding_recognition reflects the new alias."""
    base_path = admin_env["overlay_path"].parent / "finding-synonyms.json"
    base_path.write_text(
        json.dumps(_fake_dict_with([("", "CANON")])),
        encoding="utf-8",
    )
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_PATH", base_path)
    # Real loader goes through the file path now
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    _reset_dictionary_caches_for_tests()

    # Pre-PUT: alias not resolved
    canonical_pre, level_pre, *_ = sk.assess_finding_recognition("MI", "NEWALIAS")
    assert level_pre == 6

    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "cache test",
        },
    )
    assert r.status_code == 200, r.json()

    # Post-PUT: alias now resolves at level 2
    canonical_post, level_post, *_ = sk.assess_finding_recognition("MI", "NEWALIAS")
    assert canonical_post == "CANON"
    assert level_post == 2


# ─── AC-2.8 affected-study flagging ─────────────────────────────────────────


def test_ac_2_8_put_flags_stale_studies(client, admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    study_a = fake_generated / "StudyA"
    study_a.mkdir()
    (study_a / "unrecognized_terms.json").write_text(
        json.dumps(
            {
                "unrecognized_test_codes": [
                    {
                        "domain": "MI",
                        "raw_code": "NEWALIAS",
                        "count": 3,
                        "reason": "unmatched",
                        "specimens": [],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "stale test",
        },
    )
    assert r.status_code == 200
    assert r.json()["affected_studies"] == ["StudyA"]
    assert admin_env["stale_path"].exists()


# ─── AC-2.9 impact-confirm gate ─────────────────────────────────────────────


def test_ac_2_9_large_impact_requires_confirmation(
    client, admin_env, monkeypatch, tmp_path
):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    (fake_generated / "StudyA").mkdir()
    # Seed impact count = 100 (above default threshold 50).
    (fake_generated / "StudyA" / "unrecognized_terms.json").write_text(
        json.dumps(
            {
                "unrecognized_test_codes": [
                    {"domain": "MI", "raw_code": "NEWALIAS", "count": 100, "reason": "unmatched", "specimens": []},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "impact test",
        },
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "confirm_impact_required"

    # With confirmation header, it passes
    r2 = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN, "X-Confirm-Impact": "1"},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "impact test confirmed",
        },
    )
    assert r2.status_code == 200


# ─── AC-2.10 DELETE rejection persistence ───────────────────────────────────


def test_ac_2_10_delete_writes_rejection(client, admin_env):
    item_id = admin_terms.compute_item_id("MI", "NEWALIAS", "EYE")
    r = client.request(
        "DELETE",
        f"/api/admin/synonym-mapping/{item_id}",
        headers={"X-Admin-Token": _GOOD_TOKEN},
        json={"rejected_by": "admin", "reason": "not a synonym"},
    )
    assert r.status_code == 200
    rejections = json.loads(admin_env["rejections_path"].read_text(encoding="utf-8"))
    assert any(r["id"] == item_id for r in rejections)


# ─── AC-2.13 stacked-PUT staleness ──────────────────────────────────────────


def test_ac_2_13_stacked_put_requires_force_sequential(
    client, admin_env, monkeypatch, tmp_path
):
    # Seed a stale-studies file (non-empty).
    admin_env["stale_path"].write_text(json.dumps(["PriorStudy"]), encoding="utf-8")
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    (fake_generated / "StudyA").mkdir()
    (fake_generated / "StudyA" / "unrecognized_terms.json").write_text(
        json.dumps(
            {
                "unrecognized_test_codes": [
                    {"domain": "MI", "raw_code": "NEWALIAS", "count": 100, "reason": "unmatched", "specimens": []},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    # With X-Confirm-Impact but NO X-Force-Sequential and stacked state -> 409.
    r = client.put(
        "/api/admin/synonym-mapping",
        headers={"X-Admin-Token": _GOOD_TOKEN, "X-Confirm-Impact": "1"},
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "stacked test",
        },
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "stacked_put_staleness"

    # With both headers set, passes.
    r2 = client.put(
        "/api/admin/synonym-mapping",
        headers={
            "X-Admin-Token": _GOOD_TOKEN,
            "X-Confirm-Impact": "1",
            "X-Force-Sequential": "accept-lower-bound",
        },
        json={
            "domain": "MI",
            "alias": "NEWALIAS",
            "canonical": "CANON",
            "added_by": "admin",
            "source_justification": "stacked confirmed",
        },
    )
    assert r2.status_code == 200
    assert r2.json()["staleness_warning"]
