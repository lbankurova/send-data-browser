"""Tests for backend/routers/admin_terms.py (Feature 2 — Phase D Admin API).

Covers AC-2.1 .. AC-2.13 and the overlay merge cases (AC-2.5a-e).

Calls the route handlers directly (not via TestClient) because httpx is
not installed in the backend venv. This still exercises the auth gate,
rate-limit, CORS reject, overlay merge, impact preview, staleness gate,
and the atomic write path -- the entire router logic except the FastAPI
request-parsing wrapper.
"""

import asyncio
import json
from dataclasses import dataclass, field
from typing import Optional

import pytest
from fastapi import HTTPException

from routers import admin_terms
from services.analysis import send_knowledge as sk
from services.analysis.send_knowledge import (
    _merge_admin_overlay,
    _reset_dictionary_caches_for_tests,
)


_GOOD_TOKEN = "X" * 32  # minimum length per AC-2.1 / security hardening


# ─── Fake Request ───────────────────────────────────────────────────────────


@dataclass
class _FakeURL:
    hostname: str = "localhost"


@dataclass
class _FakeClient:
    host: str = "127.0.0.1"


@dataclass
class _FakeRequest:
    headers: dict = field(default_factory=dict)
    body: dict = field(default_factory=dict)
    client: _FakeClient = field(default_factory=_FakeClient)
    url: _FakeURL = field(default_factory=_FakeURL)

    async def json(self):
        return self.body


def _req(headers: dict | None = None, body: dict | None = None, ip: str = "127.0.0.1") -> _FakeRequest:
    return _FakeRequest(
        headers={k.lower(): v for k, v in (headers or {}).items()},
        body=body or {},
        client=_FakeClient(host=ip),
    )


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _reset():
    _reset_dictionary_caches_for_tests()
    admin_terms._RATE_BUCKETS.clear()
    yield
    _reset_dictionary_caches_for_tests()
    admin_terms._RATE_BUCKETS.clear()


@pytest.fixture
def admin_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", _GOOD_TOKEN)
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


def _fake_dict_with(alias_canonical_pairs: list[tuple[str, str]]) -> dict:
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
        if alias.upper() != canonical_upper and alias:
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


# ─── AC-2.1 auth ────────────────────────────────────────────────────────────


def test_ac_2_1_missing_token_returns_401(admin_env):
    r = _req()
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token=None))
    assert exc.value.status_code == 401


def test_ac_2_1_wrong_token_returns_403(admin_env):
    r = _req(headers={"X-Admin-Token": "wrong-but-long-enough-for-gate-lookup-123"})
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token="wrong-but-long-enough-for-gate-lookup-123"))
    assert exc.value.status_code == 403


def test_ac_2_1_env_unset_returns_503(monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    r = _req()
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token=_GOOD_TOKEN))
    assert exc.value.status_code == 503


def test_ac_2_1_short_token_returns_503(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "tooshort")
    r = _req()
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token="tooshort"))
    assert exc.value.status_code == 503


def test_ac_2_1b_rate_limit(admin_env, monkeypatch, tmp_path):
    # Point generated to empty dir so GET is cheap.
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    for _ in range(admin_terms._RATE_LIMIT_MAX):
        r = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token=_GOOD_TOKEN))
    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token=_GOOD_TOKEN))
    assert exc.value.status_code == 429


def test_ac_2_1b_failed_auth_does_not_consume_bucket(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    # 20 failed-auth calls should not fill the bucket.
    for _ in range(20):
        r = _req(headers={"X-Admin-Token": "wrong-but-long-enough-for-gate-lookup-1234"})
        with pytest.raises(HTTPException):
            _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token="wrong-but-long-enough-for-gate-lookup-1234"))
    # The good request still succeeds.
    r2 = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
    result = _run(admin_terms.get_unrecognized_terms(request=r2, x_admin_token=_GOOD_TOKEN))
    assert "items" in result


def test_ac_2_1c_cors_reject(admin_env):
    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN, "Origin": "http://evil.example.com"})
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.get_unrecognized_terms(request=r, x_admin_token=_GOOD_TOKEN))
    assert exc.value.status_code == 403


# ─── AC-2.2 / 2.3 GET aggregation ───────────────────────────────────────────


def test_ac_2_2_get_aggregates(admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    study_a = fake_generated / "StudyA"
    study_a.mkdir()
    (study_a / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "RETINAL FOLDS", "count": 7, "reason": "unmatched", "specimens": ["EYE"]},
            ]
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)

    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
    result = _run(admin_terms.get_unrecognized_terms(
        request=r, x_admin_token=_GOOD_TOKEN,
        min_frequency=1, domain=None, organ_system=None,
        include_rejected=0, include_concordance_impact=0,
    ))
    assert result["total_studies"] == 1
    assert len(result["items"]) == 1
    item = result["items"][0]
    assert item["domain"] == "MI"
    assert item["raw_term"] == "RETINAL FOLDS"
    assert item["frequency"] == 7
    assert "organ_scope_reliable" in item
    assert "candidates" in item
    assert "promotion_signal" in item


def test_ac_2_3_sort_and_filter(admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    study_a = fake_generated / "StudyA"
    study_b = fake_generated / "StudyB"
    study_a.mkdir()
    study_b.mkdir()
    (study_a / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "TERM_HIGH", "count": 100, "reason": "unmatched", "specimens": []},
                {"domain": "MI", "raw_code": "TERM_LOW", "count": 1, "reason": "unmatched", "specimens": []},
            ]
        }), encoding="utf-8",
    )
    (study_b / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "TERM_HIGH", "count": 50, "reason": "unmatched", "specimens": []},
            ]
        }), encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
    result = _run(admin_terms.get_unrecognized_terms(
        request=r, x_admin_token=_GOOD_TOKEN,
        min_frequency=1, domain=None, organ_system=None,
        include_rejected=0, include_concordance_impact=0,
    ))
    items = result["items"]
    assert items[0]["raw_term"] == "TERM_HIGH"
    # Filter by min_frequency
    r2 = _req(headers={"X-Admin-Token": _GOOD_TOKEN})
    result2 = _run(admin_terms.get_unrecognized_terms(
        request=r2, x_admin_token=_GOOD_TOKEN, min_frequency=100,
        domain=None, organ_system=None, include_rejected=0, include_concordance_impact=0,
    ))
    assert all(it["frequency"] >= 100 for it in result2["items"])


# ─── AC-2.4 PUT conflict ────────────────────────────────────────────────────


def test_ac_2_4_alias_reassign_rejected(admin_env, monkeypatch):
    monkeypatch.setattr(
        sk, "_load_finding_synonyms_data",
        lambda: _fake_dict_with([("RETINAL FOLDS", "RETINAL FOLD"), ("", "RETINAL DETACHMENT")]),
    )
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "RETINAL FOLDS", "canonical": "RETINAL DETACHMENT",
            "added_by": "admin", "source_justification": "test",
        },
    )
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.put_synonym_mapping(
            request=r, x_admin_token=_GOOD_TOKEN,
            x_confirm_impact=None, x_force_sequential=None,
        ))
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "alias_reassign_conflict"
    assert exc.value.detail["existing_canonical"] == "RETINAL FOLD"


# ─── AC-2.5 / 2.5a / 2.5b / 2.5c / 2.5e ─────────────────────────────────────


def test_ac_2_5_put_writes_admin_overlay_not_base(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "HYPERTROPHY")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={"domain": "MI", "alias": "HYPRTROPHY", "canonical": "HYPERTROPHY",
              "added_by": "admin", "source_justification": "typo"},
    )
    result = _run(admin_terms.put_synonym_mapping(
        request=r, x_admin_token=_GOOD_TOKEN,
        x_confirm_impact=None, x_force_sequential=None,
    ))
    assert result["new_dict_version"] == "0.1.0"
    overlay = json.loads(admin_env["overlay_path"].read_text(encoding="utf-8"))
    assert "HYPRTROPHY" in overlay["domains"]["MI"]["entries"]["HYPERTROPHY"]["aliases"]


def test_ac_2_5a_overlay_merge_correctness():
    base = _fake_dict_with([("HYPERTRPHY", "HYPERTROPHY")])
    overlay = {
        "version": "0.1.0",
        "domains": {"MI": {"entries": {"HYPERTROPHY": {"aliases": ["HYPRTROPHY"]}}}},
    }
    merged = _merge_admin_overlay(base, overlay)
    aliases = merged["domains"]["MI"]["entries"]["HYPERTROPHY"]["aliases"]
    assert "HYPERTRPHY" in aliases
    assert "HYPRTROPHY" in aliases


def test_ac_2_5b_rebuild_survives_admin_overlay(tmp_path, monkeypatch):
    base_path = tmp_path / "finding-synonyms.json"
    admin_path = tmp_path / "finding-synonyms-admin.json"
    base_path.write_text(json.dumps(_fake_dict_with([("ALIAS", "CANON")])), encoding="utf-8")
    admin_path.write_text(
        json.dumps({
            "version": "0.1.0",
            "domains": {"MI": {"entries": {"CANON": {"aliases": ["ADMIN_ALIAS"]}}}},
        }), encoding="utf-8",
    )
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_PATH", base_path)
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_ADMIN_PATH", admin_path)
    _reset_dictionary_caches_for_tests()
    merged = sk._load_finding_synonyms_data()
    canon_entry = merged["domains"]["MI"]["entries"]["CANON"]
    assert "ADMIN_ALIAS" in canon_entry["aliases"]
    assert "ALIAS" in canon_entry["aliases"]
    # Simulate rebuild
    base_path.write_text(json.dumps(_fake_dict_with([("ALIAS2", "CANON"), ("ALIAS", "CANON")])), encoding="utf-8")
    _reset_dictionary_caches_for_tests()
    merged2 = sk._load_finding_synonyms_data()
    canon2 = merged2["domains"]["MI"]["entries"]["CANON"]
    assert "ADMIN_ALIAS" in canon2["aliases"]  # admin preserved
    assert admin_path.read_text(encoding="utf-8")  # admin file unchanged


def test_ac_2_5c_new_canonical_requires_fields(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "NC_ALIAS", "canonical": "NEWCANON",
            "add_new_canonical": True, "added_by": "admin", "source_justification": "",
        },
    )
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.put_synonym_mapping(
            request=r, x_admin_token=_GOOD_TOKEN,
            x_confirm_impact=None, x_force_sequential=None,
        ))
    assert exc.value.status_code == 400


def test_ac_2_5e_new_canonical_overlay_path(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "NC_ALIAS", "canonical": "NEWCANON",
            "add_new_canonical": True, "added_by": "admin", "source_justification": "never seen",
        },
    )
    result = _run(admin_terms.put_synonym_mapping(
        request=r, x_admin_token=_GOOD_TOKEN,
        x_confirm_impact=None, x_force_sequential=None,
    ))
    assert result["status"] == "accepted"


# ─── AC-2.6 atomic write ────────────────────────────────────────────────────


def test_ac_2_6_atomic_write_failure_preserves_existing(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    pre_content = {"version": "0.0.0", "domains": {"MI": {"entries": {}}}}
    admin_env["overlay_path"].write_text(json.dumps(pre_content), encoding="utf-8")

    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    def _raising_replace(src, dst):
        raise OSError("atomic failure simulated")

    monkeypatch.setattr(admin_terms.os, "replace", _raising_replace)
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "NEWALIAS", "canonical": "CANON",
            "added_by": "admin", "source_justification": "test",
        },
    )
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.put_synonym_mapping(
            request=r, x_admin_token=_GOOD_TOKEN,
            x_confirm_impact=None, x_force_sequential=None,
        ))
    assert exc.value.status_code == 500
    after = json.loads(admin_env["overlay_path"].read_text(encoding="utf-8"))
    assert after == pre_content


# ─── AC-2.7 cache invalidation ──────────────────────────────────────────────


def test_ac_2_7_put_invalidates_cache(admin_env, monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", empty)
    base_path = admin_env["overlay_path"].parent / "finding-synonyms.json"
    base_path.write_text(json.dumps(_fake_dict_with([("", "CANON")])), encoding="utf-8")
    monkeypatch.setattr(sk, "_FINDING_SYNONYMS_PATH", base_path)
    # Real loader goes through the file path now
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)
    _reset_dictionary_caches_for_tests()

    canonical_pre, level_pre, *_ = sk.assess_finding_recognition("MI", "NEWALIAS")
    assert level_pre == 6

    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "NEWALIAS", "canonical": "CANON",
            "added_by": "admin", "source_justification": "cache test",
        },
    )
    _run(admin_terms.put_synonym_mapping(request=r, x_admin_token=_GOOD_TOKEN))

    canonical_post, level_post, *_ = sk.assess_finding_recognition("MI", "NEWALIAS")
    assert canonical_post == "CANON"
    assert level_post == 2


# ─── AC-2.8 affected-study flagging ─────────────────────────────────────────


def test_ac_2_8_put_flags_stale_studies(admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    study_a = fake_generated / "StudyA"
    study_a.mkdir()
    (study_a / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "NEWALIAS", "count": 3, "reason": "unmatched", "specimens": []},
            ]
        }), encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={
            "domain": "MI", "alias": "NEWALIAS", "canonical": "CANON",
            "added_by": "admin", "source_justification": "stale test",
        },
    )
    result = _run(admin_terms.put_synonym_mapping(
        request=r, x_admin_token=_GOOD_TOKEN,
        x_confirm_impact=None, x_force_sequential=None,
    ))
    assert result["affected_studies"] == ["StudyA"]
    assert admin_env["stale_path"].exists()


# ─── AC-2.9 impact-confirm gate ─────────────────────────────────────────────


def test_ac_2_9_large_impact_requires_confirmation(admin_env, monkeypatch, tmp_path):
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    (fake_generated / "StudyA").mkdir()
    (fake_generated / "StudyA" / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "NEWALIAS", "count": 100, "reason": "unmatched", "specimens": []},
            ]
        }), encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    body = {
        "domain": "MI", "alias": "NEWALIAS", "canonical": "CANON",
        "added_by": "admin", "source_justification": "impact test",
    }
    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN}, body=body)
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.put_synonym_mapping(
            request=r, x_admin_token=_GOOD_TOKEN,
            x_confirm_impact=None, x_force_sequential=None,
        ))
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "confirm_impact_required"

    # With confirmation header, it passes.
    r2 = _req(headers={"X-Admin-Token": _GOOD_TOKEN, "X-Confirm-Impact": "1"}, body=body)
    result = _run(admin_terms.put_synonym_mapping(
        request=r2, x_admin_token=_GOOD_TOKEN, x_confirm_impact="1",
    ))
    assert result["status"] == "accepted"


# ─── AC-2.10 DELETE rejection persistence ───────────────────────────────────


def test_ac_2_10_delete_writes_rejection(admin_env):
    item_id = admin_terms.compute_item_id("MI", "NEWALIAS", "EYE")
    r = _req(
        headers={"X-Admin-Token": _GOOD_TOKEN},
        body={"rejected_by": "admin", "reason": "not a synonym"},
    )
    result = _run(admin_terms.delete_synonym_mapping(
        item_id=item_id, request=r, x_admin_token=_GOOD_TOKEN,
    ))
    assert result["status"] == "rejected"
    rejections = json.loads(admin_env["rejections_path"].read_text(encoding="utf-8"))
    assert any(rec["id"] == item_id for rec in rejections)


# ─── AC-2.13 stacked-PUT staleness ──────────────────────────────────────────


def test_ac_2_13_stacked_put_requires_force_sequential(admin_env, monkeypatch, tmp_path):
    admin_env["stale_path"].write_text(json.dumps(["PriorStudy"]), encoding="utf-8")
    fake_generated = tmp_path / "generated"
    fake_generated.mkdir()
    (fake_generated / "StudyA").mkdir()
    (fake_generated / "StudyA" / "unrecognized_terms.json").write_text(
        json.dumps({
            "unrecognized_test_codes": [
                {"domain": "MI", "raw_code": "NEWALIAS", "count": 100, "reason": "unmatched", "specimens": []},
            ]
        }), encoding="utf-8",
    )
    monkeypatch.setattr(admin_terms, "_GENERATED_ROOT", fake_generated)
    monkeypatch.setattr(sk, "_load_finding_synonyms_data", lambda: _fake_dict_with([("", "CANON")]))
    monkeypatch.setattr(admin_terms, "_load_finding_synonyms_data", sk._load_finding_synonyms_data)

    body = {
        "domain": "MI", "alias": "NEWALIAS", "canonical": "CANON",
        "added_by": "admin", "source_justification": "stacked test",
    }
    r = _req(headers={"X-Admin-Token": _GOOD_TOKEN, "X-Confirm-Impact": "1"}, body=body)
    with pytest.raises(HTTPException) as exc:
        _run(admin_terms.put_synonym_mapping(
            request=r, x_admin_token=_GOOD_TOKEN, x_confirm_impact="1",
        ))
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "stacked_put_staleness"

    r2 = _req(
        headers={
            "X-Admin-Token": _GOOD_TOKEN, "X-Confirm-Impact": "1",
            "X-Force-Sequential": "accept-lower-bound",
        },
        body=body,
    )
    result = _run(admin_terms.put_synonym_mapping(
        request=r2, x_admin_token=_GOOD_TOKEN, x_confirm_impact="1",
        x_force_sequential="accept-lower-bound",
    ))
    assert result["status"] == "accepted"
    assert result["staleness_warning"]
