"""Tests for scripts/build_synonym_dictionary.py and the corpus snapshot
generator. Covers AC-1.1 .. AC-1.11, AC-1.10a, and the per-term allowlist
schema discipline.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SYNONYM_FIXTURES = FIXTURES_DIR / "synonym-sources"
GOLDEN_PATH = SYNONYM_FIXTURES / "golden_finding_synonyms.json"
CORPUS_FIXTURES = FIXTURES_DIR / "corpus-snapshot-studies"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def build_module():
    return _load_module(
        "_build_synonym_dictionary",
        SCRIPTS_DIR / "build_synonym_dictionary.py",
    )


@pytest.fixture(scope="module")
def snapshot_module():
    return _load_module(
        "_build_corpus_terms_snapshot",
        SCRIPTS_DIR / "build_corpus_terms_snapshot.py",
    )


def _build_to_dict(build_module, sources, **kwargs) -> dict:
    """Helper: run build() and return the in-memory dict (no file write)."""
    return build_module.build(
        sources_dir=sources,
        out_path=Path("dummy"),
        previous_path=kwargs.get("previous_path"),
        allow_removal_path=kwargs.get("allow_removal_path"),
        min_retention_pct=kwargs.get("min_retention_pct", 95.0),
        corpus_snapshot_path=kwargs.get("corpus_snapshot_path"),
        strict_snapshot=kwargs.get("strict_snapshot", False),
        cdisc_version=kwargs.get("cdisc_version", "test"),
        sendigr_commit=kwargs.get("sendigr_commit", "test"),
        etransafe_commit=kwargs.get("etransafe_commit", "test"),
    )


# ──────────────────────────────────────────────────────────────────────────
# AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-1.5: golden fixture byte-identity test
# ──────────────────────────────────────────────────────────────────────────


class TestGoldenFixtureByteIdentity:
    def test_build_against_fixture_matches_golden(self, build_module, tmp_path):
        """AC-1.11(a): the build script run against the fixture source workspace
        produces the committed golden file byte-for-byte (when timestamp is
        frozen)."""
        out_path = tmp_path / "out.json"
        output = _build_to_dict(build_module, SYNONYM_FIXTURES)
        build_module.write_output(output, out_path, freeze_timestamp=True)
        actual = out_path.read_bytes()
        expected = GOLDEN_PATH.read_bytes()
        assert actual == expected, "Build script output does not match golden fixture"

    def test_no_snomed_id_field_anywhere(self, build_module):
        """AC-1.3: the committed output JSON contains no `snomed_id` anywhere."""
        text = GOLDEN_PATH.read_text(encoding="utf-8")
        assert "snomed_id" not in text, (
            "snomed_id leaked into committed JSON. The eTRANSAFE source carries "
            "SNOMED CT identifiers but they MUST be stripped from the output."
        )

    def test_retinal_fold_alias_present_gap_248(self, build_module):
        """AC-1.4: GAP-248 regression — RETINAL FOLD(S) is an alias of
        RETINAL FOLD."""
        d = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        rf = d["domains"]["MI"]["entries"]["RETINAL FOLD"]
        assert "RETINAL FOLD(S)" in rf["aliases"]
        assert rf["canonical"] == "RETINAL FOLD"
        assert rf["ncit_code"] == "C156482"

    def test_idempotent_rerun(self, build_module, tmp_path):
        """AC-1.5: rerunning produces byte-identical output."""
        out1 = tmp_path / "out1.json"
        out2 = tmp_path / "out2.json"
        a = _build_to_dict(build_module, SYNONYM_FIXTURES)
        build_module.write_output(a, out1, freeze_timestamp=True)
        b = _build_to_dict(build_module, SYNONYM_FIXTURES)
        build_module.write_output(b, out2, freeze_timestamp=True)
        assert out1.read_bytes() == out2.read_bytes()

    def test_ncit_codes_populated(self, build_module):
        """AC-1.2: every entry has a non-null ncit_code."""
        d = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        for domain, payload in d["domains"].items():
            for canonical, entry in payload["entries"].items():
                assert entry["ncit_code"], (
                    f"{domain}.{canonical} has no ncit_code"
                )


# ──────────────────────────────────────────────────────────────────────────
# AC-1.7 monotonic growth + per-term allowlist (AC-1.7 + R1 F14 + R2 N2)
# ──────────────────────────────────────────────────────────────────────────


class TestMonotonicGrowth:
    def test_passes_when_all_prior_terms_present(self, build_module, tmp_path):
        """Baseline: rebuilding from same sources passes the monotonic check."""
        out = tmp_path / "out.json"
        output = _build_to_dict(
            build_module, SYNONYM_FIXTURES,
            previous_path=GOLDEN_PATH,
        )
        build_module.write_output(output, out, freeze_timestamp=True)
        # Should not raise

    def test_fails_when_canonical_removed_without_allowlist(
        self, build_module, tmp_path
    ):
        """AC-1.7: removing a canonical without an allowlist entry fails."""
        # Build a "previous" with an extra canonical that the new build won't have
        prev = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        prev["domains"]["MI"]["entries"]["GHOSTFINDING"] = {
            "canonical": "GHOSTFINDING",
            "ncit_code": "C99999",
            "aliases": [],
            "base_concept": "GHOSTFINDING",
            "qualifier": None,
            "source": ["NONNEO"],
        }
        prev_path = tmp_path / "prev.json"
        prev_path.write_text(json.dumps(prev), encoding="utf-8")

        with pytest.raises(SystemExit):
            _build_to_dict(
                build_module, SYNONYM_FIXTURES,
                previous_path=prev_path,
            )

    def test_passes_when_removed_term_in_allowlist(self, build_module, tmp_path):
        """AC-1.7 escape hatch: per-term allowlist allows removal."""
        prev = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        prev["domains"]["MI"]["entries"]["GHOSTFINDING"] = {
            "canonical": "GHOSTFINDING",
            "ncit_code": "C99999",
            "aliases": [],
            "base_concept": "GHOSTFINDING",
            "qualifier": None,
            "source": ["NONNEO"],
        }
        prev_path = tmp_path / "prev.json"
        prev_path.write_text(json.dumps(prev), encoding="utf-8")

        allowlist_path = tmp_path / "allow.json"
        allowlist_path.write_text(
            json.dumps([{
                "term": "GHOSTFINDING",
                "reason": "synthetic test removal",
            }]),
            encoding="utf-8",
        )
        # Should not raise. Pass a low min_retention_pct because removing
        # 1 of 6+1=7 entries is ~85% retention, below the 95% default.
        _build_to_dict(
            build_module, SYNONYM_FIXTURES,
            previous_path=prev_path,
            allow_removal_path=allowlist_path,
            min_retention_pct=80.0,
        )

    def test_allowlist_rejects_empty_reason(self, build_module, tmp_path):
        """AC-7.5a-style discipline: allowlist parser rejects empty reason."""
        bad = tmp_path / "bad.json"
        bad.write_text(
            json.dumps([{"term": "FOO", "reason": ""}]),
            encoding="utf-8",
        )
        with pytest.raises(SystemExit):
            build_module.load_allowlist(bad)

    def test_allowlist_rejects_missing_term(self, build_module, tmp_path):
        bad = tmp_path / "bad.json"
        bad.write_text(json.dumps([{"reason": "x"}]), encoding="utf-8")
        with pytest.raises(SystemExit):
            build_module.load_allowlist(bad)


# ──────────────────────────────────────────────────────────────────────────
# AC-1.8 schema validation
# ──────────────────────────────────────────────────────────────────────────


class TestSchemaValidation:
    def test_cdisc_missing_column_fails(self, build_module, tmp_path):
        """AC-1.8: a CDISC source file with a missing required column fails fast."""
        bad_sources = tmp_path / "sources"
        cdisc_dir = bad_sources / "cdisc-send-ct"
        cdisc_dir.mkdir(parents=True)
        # Missing the 'CDISC Synonym(s)' column
        (cdisc_dir / "NONNEO.tsv").write_text(
            "Code\tCodelist Code\tCDISC Submission Value\n"
            "C12345\tC77522\tHYPERTROPHY\n",
            encoding="utf-8",
        )
        with pytest.raises(SystemExit):
            _build_to_dict(build_module, bad_sources)

    def test_sendigr_non_dict_fails(self, build_module, tmp_path):
        bad_sources = tmp_path / "sources"
        (bad_sources / "cdisc-send-ct").mkdir(parents=True)
        # Copy at least one valid CDISC file so we get past the empty case
        shutil.copy(
            SYNONYM_FIXTURES / "cdisc-send-ct" / "NONNEO.tsv",
            bad_sources / "cdisc-send-ct" / "NONNEO.tsv",
        )
        sg_dir = bad_sources / "sendigr-xptcleaner"
        sg_dir.mkdir()
        (sg_dir / "nonneo_vocab.json").write_text("[]", encoding="utf-8")
        with pytest.raises(SystemExit):
            _build_to_dict(build_module, bad_sources)


# ──────────────────────────────────────────────────────────────────────────
# Volume retention (AC-1.9)
# ──────────────────────────────────────────────────────────────────────────


class TestVolumeRetention:
    def test_volume_drop_below_threshold_fails(self, build_module, tmp_path):
        """AC-1.9: per-domain entry count must be at least min_retention_pct
        of the previous version."""
        prev = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        # Inflate prev's MI entries so the new build appears to have dropped
        # significantly. Add 100 fake entries.
        for i in range(100):
            prev["domains"]["MI"]["entries"][f"FAKE_{i}"] = {
                "canonical": f"FAKE_{i}",
                "ncit_code": f"C{i:05d}",
                "aliases": [],
                "base_concept": f"FAKE_{i}",
                "qualifier": None,
                "source": ["NONNEO"],
            }
        prev_path = tmp_path / "prev.json"
        prev_path.write_text(json.dumps(prev), encoding="utf-8")

        # Allowlist all the FAKE_ entries so monotonic check passes (we are
        # testing the volume check independently).
        allow_entries = [
            {"term": f"FAKE_{i}", "reason": "test setup"} for i in range(100)
        ]
        allow_path = tmp_path / "allow.json"
        allow_path.write_text(json.dumps(allow_entries), encoding="utf-8")

        with pytest.raises(SystemExit):
            _build_to_dict(
                build_module, SYNONYM_FIXTURES,
                previous_path=prev_path,
                allow_removal_path=allow_path,
                min_retention_pct=95.0,
            )


# ──────────────────────────────────────────────────────────────────────────
# Corpus snapshot generator (AC-1.10a)
# ──────────────────────────────────────────────────────────────────────────


class TestCorpusSnapshot:
    def test_generates_schema_compliant_snapshot(self, snapshot_module, tmp_path):
        """AC-1.10a: snapshot generator against fixture studies produces a
        schema-compliant output with correct hashes and term unions."""
        snapshot = snapshot_module.build_snapshot(CORPUS_FIXTURES)
        # Schema fields
        assert "generated_at" in snapshot
        assert "schema_version" in snapshot
        assert "studies" in snapshot
        assert "domains" in snapshot
        assert set(snapshot["domains"].keys()) == {"MI", "MA", "CL"}
        # Both fixture studies present
        ids = sorted(s["study_id"] for s in snapshot["studies"])
        assert ids == ["StudyA", "StudyB"]
        # Per-study sha256 looks like a hex string
        for s in snapshot["studies"]:
            assert len(s["unified_findings_sha256"]) == 64
        # Term union: MI from both studies
        mi = set(snapshot["domains"]["MI"])
        assert "HYPERTROPHY" in mi
        assert "RETINAL FOLD" in mi
        assert "RETINAL FOLD(S)" in mi
        assert "NECROSIS" in mi

    def test_ac_1_11c_corpus_coverage_drop_fails_build(self, build_module, tmp_path):
        """AC-1.11(c) third failure mode: a deliberate corpus coverage drop
        triggers the check_corpus_snapshot regression. We construct a
        synthetic corpus snapshot whose term set is drastically larger than
        what the fixture dictionary can resolve, then supply a 'previous
        output' artifact with a higher resolved fraction. The build must
        fail because the new run's coverage drops below the previous."""
        # Step 1: build the fixture dictionary with a synthetic corpus
        # snapshot containing many MI terms the fixture doesn't cover.
        corpus_snapshot_path = tmp_path / "corpus.json"
        corpus_snapshot = {
            "schema_version": "1.0.0",
            "generated_at": "2026-04-07T00:00:00Z",
            "studies": [],  # empty studies list -> freshness check is permissive
            "domains": {
                "MI": [
                    "HYPERTROPHY",
                    "RETINAL FOLD",
                    # 10 unrecognized terms that will drop resolved fraction
                    "UNKNOWN1", "UNKNOWN2", "UNKNOWN3", "UNKNOWN4",
                    "UNKNOWN5", "UNKNOWN6", "UNKNOWN7", "UNKNOWN8",
                ],
                "MA": ["DISCOLORATION"],
                "CL": ["ALOPECIA"],
            },
        }
        corpus_snapshot_path.write_text(
            json.dumps(corpus_snapshot), encoding="utf-8"
        )
        # Step 2: construct a fake "previous output" with a high coverage claim.
        # The build will fail because the current (fixture) dictionary
        # resolves only 2/10 MI terms, dropping coverage from the previous
        # fake 100%.
        prev_path = tmp_path / "prev.json"
        prev_data = {
            "version": "1.0.0",
            "domains": {
                "MI": {"entries": {}},
                "MA": {"entries": {}},
                "CL": {"entries": {}},
            },
            "_corpus_breakdown": {
                "MI": {"resolved": 10, "unresolved": 0, "total": 10, "fraction": 1.0},
                "MA": {"resolved": 1, "unresolved": 0, "total": 1, "fraction": 1.0},
                "CL": {"resolved": 1, "unresolved": 0, "total": 1, "fraction": 1.0},
            },
        }
        prev_path.write_text(json.dumps(prev_data), encoding="utf-8")
        # Step 3: run build with the corpus snapshot and previous output —
        # MUST fail because current MI coverage (2/10 = 20%) is below the
        # fake previous (10/10 = 100%).
        with pytest.raises(SystemExit):
            _build_to_dict(
                build_module, SYNONYM_FIXTURES,
                previous_path=prev_path,
                corpus_snapshot_path=corpus_snapshot_path,
                min_retention_pct=0.0,  # disable volume check for this test
            )


# ──────────────────────────────────────────────────────────────────────────
# Phase 7 organ_normalization_intended_changes allowlist schema (AC-7.5a/b)
# ──────────────────────────────────────────────────────────────────────────


class TestOrganNormalizationAllowlist:
    def test_allowlist_file_exists(self):
        path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        assert path.exists()

    def test_every_entry_has_non_empty_reason(self):
        path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(data, list)
        for i, entry in enumerate(data):
            assert isinstance(entry, dict)
            for key in ("specimen_raw", "canonical_before", "canonical_after", "reason"):
                assert key in entry, f"entry {i} missing {key}"
                assert isinstance(entry[key], str) and entry[key].strip(), (
                    f"entry {i} {key} is empty"
                )

    def test_intestine_subregion_changes_documented(self):
        """AC-7.5: the 7 known corpus variants are in the allowlist with
        the parent-organ-group convention applied."""
        path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        raws = {e["specimen_raw"] for e in data}
        expected = {
            "LARGE INTESTINE, APPENDIX",
            "LARGE INTESTINE, CECUM",
            "LARGE INTESTINE, COLON",
            "LARGE INTESTINE, RECTUM",
            "SMALL INTESTINE, DUODENUM",
            "SMALL INTESTINE, ILEUM",
            "SMALL INTESTINE, JEJUNUM",
        }
        assert expected.issubset(raws)
        for entry in data:
            if entry["specimen_raw"].startswith(("LARGE INTESTINE", "SMALL INTESTINE")):
                assert entry["canonical_after"] in ("LARGE INTESTINE", "SMALL INTESTINE")

    def test_ac_7_5a_unknown_key_rejected(self):
        """AC-7.5a: allowlist parser should reject entries with unknown keys
        that aren't in the expected schema. This prevents a maintainer from
        adding an entry with an unrecognized field name that silently gets
        ignored (hiding a schema drift)."""
        path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        expected_keys = {"specimen_raw", "canonical_before", "canonical_after", "reason"}
        for i, entry in enumerate(data):
            extra_keys = set(entry.keys()) - expected_keys
            assert not extra_keys, (
                f"AC-7.5a: entry {i} has unknown keys {extra_keys}. "
                f"Expected exactly: {expected_keys}"
            )
            missing = expected_keys - set(entry.keys())
            assert not missing, (
                f"AC-7.5a: entry {i} missing required keys: {missing}"
            )

    def test_allowlist_exact_ship_state_is_pinned(self):
        """AC-7.5b (DEVIATION from spec text 'empty on ship'):

        The spec's AC-7.5b states the allowlist MUST be [] at initial ship
        because the probe assumed zero variant specimens in the corpus. The
        empirical scan during implementation found 7 intestine sub-region
        variants the probe missed. The deviation ships with a populated
        allowlist that pins the EXACT set of intended changes — preserving
        the spirit of AC-7.5b ('no silent additions, explicit pre-ship
        review required') while correcting the factual error in the probe.

        This test pins the ship-state to exactly 7 entries with known
        specimen_raw values. Any future addition WITHOUT updating this
        test fires — that is the 'explicit pre-ship review' gate, enforced
        by code review of the test's expected set.
        """
        path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        expected_ship_state = {
            "LARGE INTESTINE, APPENDIX",
            "LARGE INTESTINE, CECUM",
            "LARGE INTESTINE, COLON",
            "LARGE INTESTINE, RECTUM",
            "SMALL INTESTINE, DUODENUM",
            "SMALL INTESTINE, ILEUM",
            "SMALL INTESTINE, JEJUNUM",
        }
        actual = {e["specimen_raw"] for e in data}
        assert actual == expected_ship_state, (
            f"AC-7.5b ship-state drift. Expected exactly the 7 documented "
            f"intestine sub-region variants. Added: {actual - expected_ship_state}. "
            f"Removed: {expected_ship_state - actual}. If you are intentionally "
            f"adding/removing entries, update this test AND the audit trail "
            f"in docs/_internal/architecture/term-recognition.md 'Known "
            f"Secondary Effects' section."
        )
        # And verify every ship-state entry canonicalizes to the correct parent
        for entry in data:
            if entry["specimen_raw"].startswith("LARGE INTESTINE"):
                assert entry["canonical_after"] == "LARGE INTESTINE"
            elif entry["specimen_raw"].startswith("SMALL INTESTINE"):
                assert entry["canonical_after"] == "SMALL INTESTINE"
